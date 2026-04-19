/** World draw order: warnings sit on arena, boss behind heroes, projectiles on top. */
const DEPTH = {
  PLATFORM: 5,
  BOSS_TELEGRAPH: 8,
  BOSS: 14,
  PLAYER: 16,
  PLAYER_FX: 18,
  PROJECTILE: 19,
  BOSS_STUN_UI: 22
};

/** Phaser.Graphics has no quadraticCurveTo — approximate with lineTo segments. */
function graphicsQuadBezier(g, x0, y0, cpx, cpy, x1, y1, segments = 16) {
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    const px = u * u * x0 + 2 * u * t * cpx + t * t * x1;
    const py = u * u * y0 + 2 * u * t * cpy + t * t * y1;
    g.lineTo(px, py);
  }
}

function distPointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-8) return Phaser.Math.Distance.Between(px, py, x1, y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Phaser.Math.Clamp(t, 0, 1);
  const nx = x1 + t * dx;
  const ny = y1 + t * dy;
  return Math.hypot(px - nx, py - ny);
}

/** Matches `strokeWraithVoidTendril` — start at (x0,y0) unwobbled, then n segments to wobbled points. */
function distPointToWraithTendrilPolyline(pqx, pqy, x0, y0, x1, y1, phase, amp, n = 22) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  let minD = Infinity;
  let prevX = x0;
  let prevY = y0;
  for (let i = 1; i <= n; i += 1) {
    const t = i / n;
    const bx = x0 + dx * t;
    const by = y0 + dy * t;
    const wobble = Math.sin(phase + t * 9) * amp;
    const curX = bx + px * wobble;
    const curY = by + py * wobble;
    minD = Math.min(minD, distPointToSegment(pqx, pqy, prevX, prevY, curX, curY));
    prevX = curX;
    prevY = curY;
  }
  return minD;
}

/** Solo: slightly lower boss HP. Duo: slightly higher to offset combined party DPS. */
function applyPartyScalingToBossDefinition(definition, partySize) {
  if (!definition || !Number.isFinite(definition.maxHealth)) return;
  const n = Math.max(1, partySize);
  const hpMult = n >= 2 ? 1.3 : 0.88;
  definition.maxHealth = Math.max(120, Math.round(definition.maxHealth * hpMult));
}

const PLAYER_CONTROLS = {
  1: {
    left: Phaser.Input.Keyboard.KeyCodes.A,
    right: Phaser.Input.Keyboard.KeyCodes.D,
    jump: Phaser.Input.Keyboard.KeyCodes.W,
    attack: Phaser.Input.Keyboard.KeyCodes.F,
    ability: Phaser.Input.Keyboard.KeyCodes.G,
    utility: Phaser.Input.Keyboard.KeyCodes.E
  },
  2: {
    left: Phaser.Input.Keyboard.KeyCodes.LEFT,
    right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    jump: Phaser.Input.Keyboard.KeyCodes.UP,
    attack: Phaser.Input.Keyboard.KeyCodes.K,
    ability: Phaser.Input.Keyboard.KeyCodes.L,
    utility: Phaser.Input.Keyboard.KeyCodes.J
  }
};

function buildPlayerControlsKeyMap(slot) {
  const base = PLAYER_CONTROLS[slot];
  if (!base) return { ...PLAYER_CONTROLS[1] };
  const custom = typeof window.getPlayerCombatKeys === "function" ? window.getPlayerCombatKeys(slot) : null;
  return {
    left: base.left,
    right: base.right,
    jump: base.jump,
    attack: custom && Number.isFinite(custom.attack) ? custom.attack : base.attack,
    ability: custom && Number.isFinite(custom.ability) ? custom.ability : base.ability,
    utility: custom && Number.isFinite(custom.utility) ? custom.utility : base.utility
  };
}

class BattleScene extends Phaser.Scene {
  constructor() {
    super("BattleScene");
  }

  init(data) {
    this.selectedPlayers = data.selectedPlayers || [];
    const presets = window.DIFFICULTY_PRESETS;
    const d = data?.difficulty;
    this.difficultyId = presets && presets[d] ? d : "medium";
    this.bossChoiceId = data?.bossId !== undefined && data?.bossId !== null ? data.bossId : "random";
    this.arenaId = data?.arenaId || null;
  }

  applyDifficultySceneTuning() {
    const p = window.DIFFICULTY_PRESETS[this.difficultyId] || window.DIFFICULTY_PRESETS.medium;
    this.bossOutgoingDamageMult = p.outgoingDamageMult;
    this.difficultyCooldownMult = p.cooldownMult;
    this.difficultySpawnMult = p.spawnMult;
    this.difficultyCategoryRecoveryMult = p.categoryRecoveryMult;
    this.bossAttackDecisionIntervalMs = Math.max(90, Math.round(140 * p.attackIntervalMult));
  }

  create() {
    if (!this.selectedPlayers.length) {
      this.selectedPlayers = [{ slot: 1, characterId: window.CHARACTERS[0].id }];
    }

    this.applyDifficultySceneTuning();

    if (this.input?.keyboard) {
      this.input.keyboard.enabled = true;
    }

    this.selectedArena = this.resolveArena();
    this.configureArenaView(this.selectedArena);
    const arenaBg = this.add.rectangle(this.selectedArena.width * 0.5, 270, this.selectedArena.width, 540, this.selectedArena.backgroundColor, 1);
    arenaBg.setDepth(-20);
    arenaBg.setScrollFactor(1);
    this.paintArenaTheme(this.selectedArena);
    this.createArenaPlatforms(this.selectedArena);
    this.hitboxViewMode = "effects";
    this.hitboxDebugGraphics = this.add.graphics();
    this.hitboxDebugGraphics.setDepth(3000);
    this.hitboxDebugGraphics.setVisible(false);
    this.hitboxOverlayGroup = this.add.group();
    const toggleHitboxKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.BACKTICK);
    toggleHitboxKey.on("down", () => this.toggleHitboxViewMode());

    this.playerProjectiles = this.physics.add.group();
    this.bossProjectiles = this.physics.add.group();
    this.hazards = this.physics.add.group();
    this.medicBarriers = [];
    this.summonerSoulbonds = [];
    this.skyriseSmokeZones = [];
    this.wraithTendrilState = null;
    this.hollowSoulLinkState = null;
    this.bossTwin = null;
    this.soulcallerWisps = [];
    this.soulcallerTurrets = [];
    this.soulcallerDecoys = [];
    this.soulLinkBondFxList = [];
    this.graveWardenSummons = {
      graves: [],
      phantoms: [],
      brutes: []
    };

    this.players = this.selectedPlayers.map((selection, idx) => {
      const definition = window.getCharacterById(selection.characterId);
      const keys = this.input.keyboard.addKeys(buildPlayerControlsKeyMap(selection.slot));
      const textureIndex = window.CHARACTERS.findIndex((character) => character.id === selection.characterId);
      const spawn = this.selectedArena.playerSpawns[Math.min(idx, this.selectedArena.playerSpawns.length - 1)];
      const player = new window.Player(
        this,
        spawn.x,
        spawn.y - idx * 20,
        definition,
        keys,
        `player_${textureIndex}`,
        `P${selection.slot}`
      );
      this.physics.add.collider(player, this.platforms, undefined, (pl, plat) => {
        if (pl.wraithPlatformPassUntil && this.time.now < pl.wraithPlatformPassUntil) {
          return false;
        }
        return true;
      });
      player.setDepth(DEPTH.PLAYER);
      return player;
    });

    let bossDefinition;
    if (this.bossChoiceId === "random") {
      bossDefinition = { ...window.getRandomBoss() };
    } else {
      const picked = window.getBossById(this.bossChoiceId);
      bossDefinition = picked ? { ...picked } : { ...window.getRandomBoss() };
    }
    applyPartyScalingToBossDefinition(bossDefinition, this.selectedPlayers.length);
    window.applyDifficultyToBossHealth(bossDefinition, this.difficultyId);
    const bossTextureIndex = window.BOSSES.findIndex((boss) => boss.id === bossDefinition.id);
    let twinDef = null;
    if (bossDefinition.twinBoss) {
      const sharedHp = { current: bossDefinition.maxHealth, max: bossDefinition.maxHealth };
      bossDefinition.sharedHp = sharedHp;
      twinDef = { ...bossDefinition, twinRole: "secondary", sharedHp };
    }
    const spawnBx = this.selectedArena.bossSpawn.x;
    const spawnBy = this.selectedArena.bossSpawn.y;
    let leaderX = spawnBx;
    let leaderY = spawnBy;
    if (bossDefinition.id === "hollowPair") {
      leaderX += bossDefinition.leaderSpawnOffsetX || 0;
      leaderY += bossDefinition.leaderSpawnOffsetY || 0;
    }
    this.boss = new window.Boss(this, leaderX, leaderY, bossDefinition, `boss_${bossTextureIndex}`);
    this.boss.setDepth(DEPTH.BOSS);
    this.physics.add.collider(this.boss, this.platforms);

    if (twinDef) {
      let twinX = spawnBx;
      let twinY = spawnBy;
      if (bossDefinition.id === "hollowPair") {
        twinX = spawnBx + (bossDefinition.twinSpawnOffsetX ?? 0);
        twinY = spawnBy + (bossDefinition.twinSpawnOffsetY ?? 0);
      } else {
        twinX += bossDefinition.twinOffsetX ?? -96;
      }
      this.bossTwin = new window.Boss(this, twinX, twinY, twinDef, `boss_${bossTextureIndex}_twin`);
      this.bossTwin.setDepth(DEPTH.BOSS);
      if (bossDefinition.id !== "hollowPair") {
        this.physics.add.collider(this.bossTwin, this.platforms);
      }
      this.boss.twinSibling = this.bossTwin;
      this.bossTwin.twinLeader = this.boss;
      this.bossTwin.isTwinSecondary = true;
      if (bossDefinition.id === "hollowPair") {
        this.bossTwin._hollowTwinPhase = "orb";
      }
      if (this.bossTwin.body) {
        this.bossTwin.body.setAllowGravity(false);
        this.bossTwin.body.setImmovable(true);
      }
    }

    this.players.forEach((player) => {
      this.physics.add.collider(player, this.boss, () => {
        if (this.gameState !== "battle" || !player || !player.active || !this.boss?.active) return;
        try {
          this.boss.tryContactDamage(player, this.time.now);
        } catch (error) {
          console.error("Boss contact hit failed", error);
        }
      });
      if (this.bossTwin) {
        this.physics.add.overlap(player, this.bossTwin, () => {
          if (this.gameState !== "battle" || !player?.active || !this.bossTwin?.active) return;
          try {
            this.bossTwin.tryContactDamage(player, this.time.now);
          } catch (error) {
            console.error("Boss twin contact hit failed", error);
          }
        });
      }
    });

    this.physics.add.overlap(this.playerProjectiles, this.boss, (first, second) => {
      const hit = this.resolveHitObjects(first, second, "projectile_player");
      if (!hit) return;
      const { projectile, target } = hit;
      if (this.gameState !== "battle" || !projectile.active || !target.active) return;
      if (projectile.soulLinkTarget) return;
      const src0 = projectile.ownerPlayer;
      if (src0?.soulShroudActive) {
        this.safeDeactivate(projectile);
        return;
      }
      try {
        if (typeof target.takeDamage === "function") {
          let pd = Number.isFinite(projectile.damage) ? projectile.damage : 12;
          const src = projectile.ownerPlayer;
          if (src && typeof src.getOutgoingDamageMultiplier === "function") {
            pd = Math.max(1, Math.round(pd * src.getOutgoingDamageMultiplier()));
          }
          target.takeDamage(pd, projectile.effectColor || 0xfff7a8);
        }
        if (projectile.spiritBoltHoming && typeof target.applyVulnerability === "function") {
          target.applyVulnerability(projectile.spiritDebuffMult || 1.1, projectile.spiritDebuffMs || 3000);
          this.spawnSpiritDebuffVfx(target, projectile.spiritCharged);
        }
        this.spawnImpactEffect(projectile.x, projectile.y, projectile.effectColor || 0xfff7a8, 14);
      } catch (error) {
        console.error("Player projectile hit failed", error);
      } finally {
        this.safeDeactivate(projectile);
      }
    });
    if (this.bossTwin) {
      this.physics.add.overlap(this.playerProjectiles, this.bossTwin, (first, second) => {
        const hit = this.resolveHitObjects(first, second, "projectile_player");
        if (!hit) return;
        const { projectile, target } = hit;
        if (this.gameState !== "battle" || !projectile.active || !target.active) return;
        if (projectile.soulLinkTarget) return;
        const srcTwin0 = projectile.ownerPlayer;
        if (srcTwin0?.soulShroudActive) {
          this.safeDeactivate(projectile);
          return;
        }
        try {
          if (typeof target.takeDamage === "function") {
            let pd = Number.isFinite(projectile.damage) ? projectile.damage : 12;
            const src = projectile.ownerPlayer;
            if (src && typeof src.getOutgoingDamageMultiplier === "function") {
              pd = Math.max(1, Math.round(pd * src.getOutgoingDamageMultiplier()));
            }
            target.takeDamage(pd, projectile.effectColor || 0xfff7a8);
          }
          if (projectile.spiritBoltHoming && typeof target.applyVulnerability === "function") {
            target.applyVulnerability(projectile.spiritDebuffMult || 1.1, projectile.spiritDebuffMs || 3000);
            this.spawnSpiritDebuffVfx(target, projectile.spiritCharged);
          }
          if (projectile.medicResonance && projectile.ownerPlayer?.definition?.id === "medic") {
            this.addMedicResonanceStack(projectile.ownerPlayer);
          }
          this.spawnImpactEffect(projectile.x, projectile.y, projectile.effectColor || 0xfff7a8, 14);
        } catch (error) {
          console.error("Player projectile hit twin failed", error);
        } finally {
          this.safeDeactivate(projectile);
        }
      });
    }

    this.players.forEach((player) => {
      this.physics.add.overlap(this.playerProjectiles, player, (first, second) => {
        const hit = this.resolveHitObjects(first, second, "projectile_player");
        if (!hit) return;
        const { projectile, target } = hit;
        if (this.gameState !== "battle" || !projectile.active || !target.active || !target.isAlive) return;
        const sourcePlayer = projectile.ownerPlayer;
        const allyHeal = Number.isFinite(projectile.allyHeal) ? projectile.allyHeal : 0;
        if (!sourcePlayer || target === sourcePlayer || allyHeal <= 0) return;
        try {
          let totalHeal = allyHeal;
          let resonantBurst = false;
          if (projectile.medicResonance && sourcePlayer.definition?.id === "medic") {
            const bonus = this.consumeMedicResonanceBonus(sourcePlayer);
            if (bonus > 0) {
              totalHeal += bonus;
              resonantBurst = true;
            }
          }
          const before = target.health;
          target.health = Math.min(target.maxHealth, target.health + totalHeal);
          if (target.health > before) {
            target.flash(0x7dffb6);
            this.spawnImpactEffect(target.x, target.y - 12, 0x7dffb6, resonantBurst ? 22 : 12);
            this.spawnHealMarker(target.x, target.y - 20, 0x7dffb6);
            if (resonantBurst && typeof this.spawnMedicResonanceBurst === "function") {
              this.spawnMedicResonanceBurst(target);
            }
          }
        } catch (error) {
          console.error("Ally heal projectile hit failed", error);
        } finally {
          this.safeDeactivate(projectile);
        }
      });
      this.physics.add.overlap(this.playerProjectiles, this.bossProjectiles, (first, second) => {
        if (this.gameState !== "battle") return;
        const inPlayer = (o) => this.playerProjectiles.getChildren().includes(o);
        const inBoss = (o) => this.bossProjectiles.getChildren().includes(o);
        let pPlayer = null;
        let pBoss = null;
        if (inPlayer(first) && inBoss(second)) {
          pPlayer = first;
          pBoss = second;
        } else if (inPlayer(second) && inBoss(first)) {
          pPlayer = second;
          pBoss = first;
        }
        if (!pPlayer?.active || !pBoss?.active || !this.boss?.active) return;
        if (!pBoss.galeWindSalvoReturnable || pBoss.galeWindSalvoReturning) return;
        pBoss.galeWindSalvoReturning = true;
        const bx = this.boss.x - pBoss.x;
        const by = this.boss.y - 16 - pBoss.y;
        const len = Math.hypot(bx, by) || 1;
        const cur = Math.hypot(pBoss.body?.velocity?.x || 0, pBoss.body?.velocity?.y || 0);
        const spd = Math.max(210, cur + 50);
        pBoss.setVelocityX((bx / len) * spd);
        pBoss.setVelocityY((by / len) * spd);
        pBoss.galeBaseSpeed = spd;
        this.spawnImpactEffect(pBoss.x, pBoss.y, pBoss.effectColor || 0x3dd4c8, 12);
        this.safeDeactivate(pPlayer);
      });
      this.physics.add.overlap(this.bossProjectiles, player, (first, second) => {
        const hit = this.resolveHitObjects(first, second, "projectile_boss");
        if (!hit) return;
        const { projectile, target } = hit;
        if (this.gameState !== "battle" || !projectile.active || !target.active || !target.isAlive) return;
        if (projectile.galeWindSalvoReturning) return;
        if (projectile.hollowBloomOrb) return;
        try {
          let dealt = 0;
          if (typeof target.takeDamage === "function") {
            const dmg = Number.isFinite(projectile.damage) ? projectile.damage : 10;
            dealt = target.takeDamage(dmg, projectile.effectColor || 0xff8b8b, {
              attackKind: "projectile",
              projectile,
              boss: this.boss
            });
          }
          if (dealt > 0) {
            this.spawnImpactEffect(projectile.x, projectile.y, projectile.effectColor || 0xff8b8b, 16);
            if (projectile.galeSeekerBolt && this.boss?.active) {
              this.snapPlayerBesideBossFromGaleSeeker(target, projectile);
            } else if (projectile.galePullToBoss && this.boss?.active && target.body) {
              const bx = this.boss.x;
              const by = this.boss.y - 12;
              const dx = bx - target.x;
              const dy = by - target.y;
              const len = Math.hypot(dx, dy) || 1;
              const pull = Number.isFinite(projectile.galePullImpulse) ? projectile.galePullImpulse : 380;
              target.setVelocityX(target.body.velocity.x + (dx / len) * pull);
              target.setVelocityY(target.body.velocity.y + (dy / len) * pull * 0.32);
            }
          }
        } catch (error) {
          console.error("Boss projectile hit failed", error);
        } finally {
          this.safeDeactivate(projectile);
        }
      });
      this.physics.add.overlap(this.hazards, player, (first, second) => {
        const hit = this.resolveHitObjects(first, second, "hazard");
        if (!hit) return;
        const { projectile: hazard, target } = hit;
        if (this.gameState !== "battle" || !hazard.active || !target.active || !target.isAlive) return;
        try {
          target.takeDamage(hazard.damage || 12, 0xffbf6e, { attackKind: "hazard" });
          this.spawnImpactEffect(target.x, target.y - 6, 0xffbf6e, 20);
        } catch (error) {
          console.error("Hazard hit failed", error);
        } finally {
          this.safeDeactivate(hazard);
        }
      });
    });

    this.physics.add.collider(this.playerProjectiles, this.platforms, (projectile) => {
      if (projectile.soulLinkTarget || projectile.spiritBoltHoming) return;
      this.safeDeactivate(projectile);
    });
    this.physics.add.overlap(this.bossProjectiles, this.platforms, (projectile) => {
      if (projectile.ignorePlatforms) return;
      this.safeDeactivate(projectile);
    });
    this.physics.add.collider(this.hazards, this.platforms, (hazard) => {
      this.safeDeactivate(hazard);
    });

    this.hud = new window.Hud(this, this.players, this.boss);

    this.battlePauseMenuOpen = false;
    this.battlePauseObjects = null;
    this.battlePauseContent = null;
    this.battlePauseTab = "p1";
    this.battlePauseTabButtons = null;
    this.battlePauseExitGroup = null;
    this.keyEscBattle = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.gameState = "battle";
  }

  update(time) {
    if (this.gameState !== "battle") return;

    if (Phaser.Input.Keyboard.JustDown(this.keyEscBattle)) {
      if (this.battlePauseMenuOpen) {
        this.closeBattlePauseMenu();
      } else {
        this.openBattlePauseMenu();
      }
    }

    if (this.battlePauseMenuOpen) {
      this.hud.update();
      return;
    }

    this.players.forEach((player) => player.update(time, this.boss, this.players));
    this.updateWraithVoidTendrilPull(time);
    this.updateHollowSoulLink(time);
    const bossTargets = this.getBossAiTargets();
    this.boss.update(time, bossTargets.length ? bossTargets : this.players);
    this.updateGaleWindSphereVfxPositions();
    if (this.bossTwin?.active && this.boss?.active && this.boss.definition?.id === "hollowPair") {
      this.updateHollowRevenantTwinMovement(time);
      this.updateHollowTwinRangedAttack(time);
    } else if (this.bossTwin?.active && this.boss?.active) {
      const ox = this.boss.definition.twinOffsetX ?? -96;
      const tx = this.boss.x + ox;
      this.bossTwin.setPosition(
        Phaser.Math.Linear(this.bossTwin.x, tx, 0.22),
        Phaser.Math.Linear(this.bossTwin.y, this.boss.y, 0.28)
      );
      this.bossTwin.setVelocity(0, 0);
      this.bossTwin.flipX = !this.boss.flipX;
    }

    this.cleanupProjectiles(this.playerProjectiles);
    this.cleanupProjectiles(this.bossProjectiles);
    this.cleanupProjectiles(this.hazards);
    this.updateMedicBarriers(time);
    this.updateSummonerSoulbonds(time);
    this.updateSkyriseSmokeZones(time);
    this.updateSoulcallerWisps(time);
    this.updateSoulcallerTurrets(time);
    this.updateSoulcallerDecoys(time);
    this.updateGraveWardenSummons(time);
    this.updateSoulLinkBondVfx(time);
    this.drawBossVulnerabilityIndicator();
    this.renderTrueHitboxOverlay();

    if (!this.players.some((player) => player.isAlive)) {
      this.gameState = "lost";
      this.time.delayedCall(400, () => {
        this.scene.start("GameOverScene", {
          result: "defeat",
          selectedPlayers: this.selectedPlayers,
          bossName: this.boss.definition.name,
          difficulty: this.difficultyId,
          bossId: this.bossChoiceId,
          arenaId: this.arenaId
        });
      });
      return;
    }

    this.hud.update();
    this.updateBossStunIndicator(time);
  }

  isTrueHitboxView() {
    return this.hitboxViewMode === "hitboxes";
  }

  toggleHitboxViewMode() {
    this.hitboxViewMode = this.isTrueHitboxView() ? "effects" : "hitboxes";
    if (!this.isTrueHitboxView()) {
      this.clearHitboxOverlayObjects();
      if (this.hitboxDebugGraphics) {
        this.hitboxDebugGraphics.clear();
        this.hitboxDebugGraphics.setVisible(false);
      }
    }
  }

  /** Strike/windup hitbox shapes (not the debug Graphics overlay) — destroyed when leaving hitbox mode. */
  trackHitboxOverlay(...gameObjects) {
    if (!this.hitboxOverlayGroup) return;
    gameObjects.forEach((o) => {
      if (o && typeof o.destroy === "function") this.hitboxOverlayGroup.add(o);
    });
  }

  clearHitboxOverlayObjects() {
    if (!this.hitboxOverlayGroup) return;
    const list = this.hitboxOverlayGroup.getChildren().slice();
    list.forEach((o) => {
      if (o?.active && this.tweens?.killTweensOf) this.tweens.killTweensOf(o);
    });
    this.hitboxOverlayGroup.clear(true, true);
  }

  renderTrueHitboxOverlay() {
    if (!this.hitboxDebugGraphics) return;
    if (!this.isTrueHitboxView()) {
      this.hitboxDebugGraphics.clear();
      this.hitboxDebugGraphics.setVisible(false);
      return;
    }
    const graphics = this.hitboxDebugGraphics;
    graphics.clear();
    graphics.setVisible(true);

    this.playerProjectiles.getChildren().forEach((projectile) => this.drawBodyHitbox(projectile, 0xffea7f));
    this.bossProjectiles.getChildren().forEach((projectile) => this.drawBodyHitbox(projectile, 0xff9d7f));
    this.hazards.getChildren().forEach((hazard) => this.drawBodyHitbox(hazard, 0xcf8cff));
  }

  drawBodyHitbox(target, color) {
    if (!target || !target.active || !target.body) return;
    const body = target.body;
    if (!Number.isFinite(body.x) || !Number.isFinite(body.y) || body.width <= 0 || body.height <= 0) return;
    this.hitboxDebugGraphics.fillStyle(color || 0xffffff, 0.035);
    this.hitboxDebugGraphics.lineStyle(1, color || 0xffffff, 0.14);
    this.hitboxDebugGraphics.fillRect(body.x, body.y, body.width, body.height);
    this.hitboxDebugGraphics.strokeRect(body.x, body.y, body.width, body.height);
  }

  configureArenaView(arena) {
    const safeWidth = Number.isFinite(arena?.width) ? arena.width : 1200;
    const safeHeight = 540;
    const zoom = Number.isFinite(arena?.cameraZoom) ? arena.cameraZoom : 0.8;
    this.physics.world.setBounds(0, 0, safeWidth, safeHeight);
    this.cameras.main.setBounds(0, 0, safeWidth, safeHeight);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(safeWidth * 0.5, safeHeight * 0.5);
  }

  resolveArena() {
    const arenas = window.ARENA_MAPS || [];
    if (this.arenaId) {
      const match = arenas.find((a) => a.id === this.arenaId);
      if (match) return match;
    }
    if (arenas.length) return arenas[Phaser.Math.Between(0, arenas.length - 1)];
    return this.getArenaFallback();
  }

  getArenaFallback() {
    return {
      id: "fallback",
      width: 1320,
      cameraZoom: 0.727,
      backgroundColor: 0x111a29,
      floorScaleX: 8.0,
      playerSpawns: [{ x: 220, y: 370 }, { x: 360, y: 360 }],
      bossSpawn: { x: 1080, y: 360 },
      platforms: [
        { x: 340, y: 420, scaleX: 1.2 },
        { x: 660, y: 310, scaleX: 1.15 },
        { x: 980, y: 420, scaleX: 1.2 }
      ]
    };
  }

  paintArenaTheme(arena) {
    if (!arena) return;
    const w = arena.width || 1320;
    const h = 540;
    const id = arena.id || "";
    const g = this.add.graphics();
    g.setDepth(-10);

    if (id === "ashen-battlegrounds") {
      // warm burnt gradient sky
      g.fillGradientStyle(0x1a1510, 0x2a2018, 0x241a0e, 0x302418, 1, 1, 1, 1);
      g.fillRect(0, 0, w, h);
      // horizon ember glow
      g.fillGradientStyle(0x5a2810, 0x5a2810, 0x1a1510, 0x1a1510, 0.18, 0.18, 0, 0);
      g.fillRect(0, h * 0.55, w, h * 0.45);
      // distant ruined walls silhouette
      g.fillStyle(0x2a1c0e, 0.2);
      g.fillRect(w * 0.06, h * 0.18, 30, h * 0.5);
      g.fillRect(w * 0.06 - 8, h * 0.18, 46, 14);
      g.fillRect(w * 0.88, h * 0.22, 26, h * 0.45);
      g.fillRect(w * 0.88 - 6, h * 0.22, 38, 12);
      // crumbling battlements along back wall
      for (let i = 0; i < 8; i++) {
        const bx = 120 + i * 140;
        const bh = 30 + Phaser.Math.Between(0, 40);
        g.fillStyle(0x2a1c0e, 0.12);
        g.fillRect(bx, h * 0.28 - bh, 18, bh + 20);
      }
      // scattered debris on ground
      for (let i = 0; i < 14; i++) {
        g.fillStyle(0x3a2a18, 0.15);
        g.fillEllipse(Phaser.Math.Between(40, w - 40), h - Phaser.Math.Between(20, 45), Phaser.Math.Between(8, 22), Phaser.Math.Between(4, 8));
      }
      // ash particles (dense)
      for (let i = 0; i < 70; i++) {
        g.fillStyle(0xaa8855, Phaser.Math.FloatBetween(0.04, 0.16));
        g.fillCircle(Phaser.Math.Between(0, w), Phaser.Math.Between(0, h), Phaser.Math.Between(1, 2));
      }
      // distant smoke columns
      for (let i = 0; i < 5; i++) {
        const sx = 140 + i * 240;
        g.fillStyle(0x3a2a18, 0.06);
        g.fillEllipse(sx, h * 0.2, 50, 130);
        g.fillStyle(0x4a3828, 0.04);
        g.fillEllipse(sx + 10, h * 0.12, 35, 80);
      }
      // faint fire glows on horizon
      g.fillStyle(0xff6622, 0.04);
      g.fillEllipse(w * 0.25, h * 0.52, 80, 30);
      g.fillStyle(0xff4411, 0.03);
      g.fillEllipse(w * 0.7, h * 0.5, 60, 25);
      // scorched ground
      g.fillStyle(0x2a1a0a, 0.35);
      g.fillRect(0, h - 32, w, 32);
      g.fillStyle(0x1a0e06, 0.15);
      g.fillRect(0, h - 40, w, 12);

    } else if (id === "twilight-sanctum") {
      // deep purple-blue gradient
      g.fillGradientStyle(0x0e0a18, 0x1a1230, 0x12101e, 0x221a38, 1, 1, 1, 1);
      g.fillRect(0, 0, w, h);
      // vaulted ceiling arches
      g.lineStyle(2, 0x3a2a58, 0.18);
      for (let i = 0; i < 5; i++) {
        const ax = 80 + i * (w - 160) / 4;
        g.beginPath();
        g.arc(ax, 90, 120, Math.PI, 0);
        g.strokePath();
      }
      // large stained glass rose window
      g.fillStyle(0x8060c0, 0.07);
      g.fillCircle(w * 0.5, 55, 65);
      g.fillStyle(0xc090ff, 0.04);
      g.fillCircle(w * 0.5, 55, 40);
      g.fillStyle(0xe0c0ff, 0.025);
      g.fillCircle(w * 0.5, 55, 20);
      g.lineStyle(1, 0x9070c0, 0.12);
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        g.lineBetween(w * 0.5, 55, w * 0.5 + Math.cos(ang) * 60, 55 + Math.sin(ang) * 60);
      }
      // tall stone pillars with capitals
      for (let i = 0; i < 7; i++) {
        const px = 60 + i * (w - 120) / 6;
        g.fillStyle(0x2a2040, 0.2);
        g.fillRect(px - 7, 55, 14, h - 90);
        g.fillStyle(0x3a3058, 0.12);
        g.fillRect(px - 12, 50, 24, 12);
        g.fillRect(px - 10, h - 38, 20, 8);
        // pillar fluting
        g.lineStyle(1, 0x4a3868, 0.08);
        g.lineBetween(px - 3, 65, px - 3, h - 40);
        g.lineBetween(px + 3, 65, px + 3, h - 40);
      }
      // floor tiles with seam lines
      g.fillStyle(0x1a1428, 0.38);
      g.fillRect(0, h - 32, w, 32);
      g.lineStyle(1, 0x2a2040, 0.12);
      for (let i = 0; i < 20; i++) {
        g.lineBetween(i * 70, h - 32, i * 70, h);
      }
      // ambient dust motes floating
      for (let i = 0; i < 45; i++) {
        g.fillStyle(0xd0c0f0, Phaser.Math.FloatBetween(0.03, 0.1));
        g.fillCircle(Phaser.Math.Between(0, w), Phaser.Math.Between(30, h * 0.75), 1);
      }
      // faint candlelight glow
      g.fillStyle(0xffcc66, 0.03);
      g.fillEllipse(w * 0.2, h * 0.6, 60, 35);
      g.fillStyle(0xffcc66, 0.025);
      g.fillEllipse(w * 0.8, h * 0.55, 50, 30);

    } else if (id === "frozen-wastes") {
      // cold blue gradient
      g.fillGradientStyle(0x0a1620, 0x142838, 0x0e1e2c, 0x183040, 1, 1, 1, 1);
      g.fillRect(0, 0, w, h);
      // glacier back wall with crevasses
      g.fillStyle(0x3088aa, 0.06);
      g.fillRect(0, 0, w, h * 0.35);
      g.fillStyle(0x40a0c0, 0.04);
      g.fillRect(0, 0, w, h * 0.18);
      // glacier cracks
      g.lineStyle(1, 0x60c0e0, 0.08);
      for (let i = 0; i < 10; i++) {
        const cx = Phaser.Math.Between(40, w - 40);
        const cy = Phaser.Math.Between(10, h * 0.3);
        g.lineBetween(cx, cy, cx + Phaser.Math.Between(-30, 30), cy + Phaser.Math.Between(15, 50));
      }
      // icicles hanging from ceiling
      for (let i = 0; i < 16; i++) {
        const ix = 50 + i * (w - 100) / 15;
        const il = 12 + Phaser.Math.Between(0, 28);
        g.fillStyle(0x80ccee, 0.12);
        g.fillTriangle(ix - 3, 0, ix + 3, 0, ix, il);
        g.lineStyle(1, 0xa0e0ff, 0.08);
        g.lineBetween(ix, 0, ix, il - 2);
      }
      // ice crystals rising from ground
      for (let i = 0; i < 8; i++) {
        const cx = 80 + i * (w / 7);
        g.fillStyle(0x60aacc, 0.1);
        g.fillTriangle(cx, h - 55, cx - 14, h - 18, cx + 14, h - 18);
        g.fillStyle(0x90ddff, 0.06);
        g.fillTriangle(cx + 2, h - 48, cx - 6, h - 22, cx + 10, h - 22);
      }
      // snowflakes (many)
      for (let i = 0; i < 60; i++) {
        g.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.05, 0.2));
        g.fillCircle(Phaser.Math.Between(0, w), Phaser.Math.Between(0, h * 0.8), Phaser.Math.Between(1, 2));
      }
      // frost patches on ground
      g.fillStyle(0x88ccee, 0.05);
      for (let i = 0; i < 6; i++) {
        g.fillEllipse(Phaser.Math.Between(60, w - 60), h - Phaser.Math.Between(18, 35), Phaser.Math.Between(30, 80), 8);
      }
      // frozen ground
      g.fillStyle(0x1a2838, 0.4);
      g.fillRect(0, h - 30, w, 30);
      g.lineStyle(1, 0x3a5878, 0.1);
      for (let i = 0; i < 12; i++) {
        g.lineBetween(i * 115, h - 30, i * 115 + 40, h);
      }

    } else if (id === "verdant-canopy") {
      // deep green gradient
      g.fillGradientStyle(0x081810, 0x143020, 0x0c2014, 0x1a3824, 1, 1, 1, 1);
      g.fillRect(0, 0, w, h);
      // dense canopy ceiling with layered foliage
      for (let layer = 0; layer < 3; layer++) {
        const yBase = layer * 15;
        const alpha = 0.12 - layer * 0.03;
        for (let i = 0; i < 14; i++) {
          g.fillStyle(layer === 0 ? 0x1a5020 : layer === 1 ? 0x308838 : 0x48aa50, alpha);
          g.fillCircle(Phaser.Math.Between(0, w), yBase + Phaser.Math.Between(0, 55), Phaser.Math.Between(25, 60));
        }
      }
      // tree trunks in background
      g.fillStyle(0x2a1a0e, 0.12);
      g.fillRect(80, 40, 18, h - 80);
      g.fillRect(w - 100, 50, 16, h - 90);
      g.fillRect(w * 0.35, 30, 14, h * 0.4);
      g.fillRect(w * 0.65, 35, 12, h * 0.35);
      // hanging vines (with curves)
      for (let i = 0; i < 12; i++) {
        const vx = Phaser.Math.Between(40, w - 40);
        const vLen = Phaser.Math.Between(60, 180);
        g.lineStyle(Phaser.Math.Between(1, 2), 0x40884a, 0.12);
        g.beginPath();
        g.moveTo(vx, 0);
        g.lineTo(vx + Phaser.Math.Between(-15, 15), vLen * 0.5);
        g.lineTo(vx + Phaser.Math.Between(-8, 8), vLen);
        g.strokePath();
      }
      // small flowers/berries on vines
      for (let i = 0; i < 8; i++) {
        g.fillStyle(i % 2 === 0 ? 0xff88aa : 0xffcc44, 0.12);
        g.fillCircle(Phaser.Math.Between(40, w - 40), Phaser.Math.Between(80, 200), 2);
      }
      // dappled light shafts
      for (let i = 0; i < 8; i++) {
        g.fillStyle(0xccff88, Phaser.Math.FloatBetween(0.02, 0.05));
        const lx = Phaser.Math.Between(80, w - 80);
        g.beginPath();
        g.moveTo(lx - 8, 0);
        g.lineTo(lx + 8, 0);
        g.lineTo(lx + 30, h * 0.65);
        g.lineTo(lx - 10, h * 0.6);
        g.closePath();
        g.fillPath();
      }
      // moss floor
      g.fillStyle(0x1a3820, 0.35);
      g.fillRect(0, h - 32, w, 32);
      // ground mushrooms
      for (let i = 0; i < 6; i++) {
        const mx = Phaser.Math.Between(60, w - 60);
        g.fillStyle(0x885530, 0.12);
        g.fillRect(mx - 1, h - 38, 3, 8);
        g.fillStyle(0xcc6644, 0.1);
        g.fillEllipse(mx, h - 40, 8, 4);
      }

    } else if (id === "crimson-depths") {
      // dark volcanic gradient
      g.fillGradientStyle(0x180808, 0x2a1208, 0x1a0a06, 0x301408, 1, 1, 1, 1);
      g.fillRect(0, 0, w, h);
      // obsidian cave walls with rough edges
      g.fillStyle(0x120404, 0.3);
      g.fillRect(0, 0, 50, h);
      g.fillRect(w - 50, 0, 50, h);
      for (let i = 0; i < 12; i++) {
        const wy = i * (h / 11);
        g.fillStyle(0x1a0808, 0.2);
        g.fillEllipse(Phaser.Math.Between(0, 35), wy, Phaser.Math.Between(15, 40), Phaser.Math.Between(8, 20));
        g.fillEllipse(w - Phaser.Math.Between(0, 35), wy, Phaser.Math.Between(15, 40), Phaser.Math.Between(8, 20));
      }
      // glowing lava veins on walls
      g.lineStyle(1.5, 0xff4400, 0.08);
      for (let s = 0; s < 2; s++) {
        const wallX = s === 0 ? 30 : w - 30;
        for (let i = 0; i < 4; i++) {
          const sy = 50 + i * 120;
          g.beginPath();
          g.moveTo(wallX, sy);
          g.lineTo(wallX + (s === 0 ? 20 : -20), sy + 40);
          g.lineTo(wallX + (s === 0 ? 10 : -10), sy + 80);
          g.strokePath();
        }
      }
      // lava floor with layered glow
      g.fillGradientStyle(0xff2200, 0xff4422, 0x1a0808, 0x1a0808, 0.15, 0.15, 0, 0);
      g.fillRect(0, h - 110, w, 110);
      g.fillStyle(0xff6622, 0.08);
      g.fillRect(0, h - 55, w, 55);
      g.fillStyle(0xff8844, 0.05);
      g.fillRect(0, h - 30, w, 30);
      // magma bubbles
      for (let i = 0; i < 22; i++) {
        g.fillStyle(0xff8844, Phaser.Math.FloatBetween(0.06, 0.18));
        g.fillCircle(Phaser.Math.Between(60, w - 60), Phaser.Math.Between(h - 70, h - 8), Phaser.Math.Between(2, 7));
      }
      // heat shimmer lines
      for (let i = 0; i < 16; i++) {
        const hx = Phaser.Math.Between(60, w - 60);
        g.lineStyle(1, 0xff4400, 0.04);
        g.beginPath();
        g.moveTo(hx, h - 80);
        g.lineTo(hx + Phaser.Math.Between(-6, 6), h - 130);
        g.lineTo(hx + Phaser.Math.Between(-4, 4), h - 170);
        g.strokePath();
      }
      // floating embers above lava
      for (let i = 0; i < 20; i++) {
        g.fillStyle(0xffaa44, Phaser.Math.FloatBetween(0.05, 0.14));
        g.fillCircle(Phaser.Math.Between(50, w - 50), Phaser.Math.Between(h * 0.4, h - 60), 1);
      }
      // dark rock floor border
      g.fillStyle(0x180404, 0.4);
      g.fillRect(0, h - 32, w, 32);

    } else if (id === "spectral-hollow") {
      // very dark void gradient with purple shift
      g.fillGradientStyle(0x06080e, 0x0e1020, 0x080a14, 0x141828, 1, 1, 1, 1);
      g.fillRect(0, 0, w, h);
      // large void rift in center
      g.lineStyle(2, 0x5530aa, 0.1);
      g.strokeEllipse(w * 0.5, h * 0.38, 320, 200);
      g.lineStyle(1.5, 0x7744cc, 0.07);
      g.strokeEllipse(w * 0.5, h * 0.38, 220, 140);
      g.fillStyle(0x2a1848, 0.04);
      g.fillEllipse(w * 0.5, h * 0.38, 160, 100);
      // concentric void rings
      g.lineStyle(1, 0x6644aa, 0.08);
      for (let r = 40; r < 380; r += 65) {
        g.strokeCircle(w * 0.5, h * 0.38, r);
      }
      // spirit wisps — larger and more varied
      for (let i = 0; i < 50; i++) {
        const wc = i % 3 === 0 ? 0xaa88ee : i % 3 === 1 ? 0x6644aa : 0x8866cc;
        g.fillStyle(wc, Phaser.Math.FloatBetween(0.04, 0.14));
        g.fillCircle(Phaser.Math.Between(0, w), Phaser.Math.Between(0, h), Phaser.Math.Between(1, 4));
      }
      // ghostly silhouettes drifting
      for (let i = 0; i < 4; i++) {
        const gx = Phaser.Math.Between(100, w - 100);
        const gy = Phaser.Math.Between(120, h - 100);
        g.fillStyle(0x4a3070, 0.04);
        g.fillEllipse(gx, gy, 20, 35);
        g.fillStyle(0x6a4890, 0.03);
        g.fillEllipse(gx, gy - 16, 10, 10);
      }
      // ethereal fog banks
      for (let i = 0; i < 7; i++) {
        g.fillStyle(0x3a2868, 0.04);
        g.fillEllipse(Phaser.Math.Between(60, w - 60), h - Phaser.Math.Between(50, 100), Phaser.Math.Between(120, 300), Phaser.Math.Between(20, 40));
      }
      // faint rune marks on ground
      g.lineStyle(1, 0x5530aa, 0.06);
      g.strokeCircle(w * 0.3, h - 40, 18);
      g.strokeCircle(w * 0.7, h - 45, 15);
      // void floor
      g.fillStyle(0x08061a, 0.35);
      g.fillRect(0, h - 28, w, 28);

    } else if (id === "iron-citadel") {
      // dark industrial gradient
      g.fillGradientStyle(0x0e1014, 0x1a1c22, 0x121418, 0x22242a, 1, 1, 1, 1);
      g.fillRect(0, 0, w, h);
      // back wall with plating
      g.fillStyle(0x22242a, 0.2);
      g.fillRect(0, 0, w, h * 0.15);
      // plate seams
      g.lineStyle(1, 0x3a3c44, 0.12);
      for (let i = 0; i < 10; i++) {
        g.lineBetween(i * (w / 9), 0, i * (w / 9), h * 0.15);
      }
      // heavy vertical I-beams
      for (let i = 0; i < 9; i++) {
        const bx = 50 + i * (w - 100) / 8;
        g.fillStyle(0x2a2c34, 0.18);
        g.fillRect(bx - 5, 0, 10, h);
        g.fillStyle(0x3a3c44, 0.1);
        g.fillRect(bx - 9, 0, 18, 8);
        g.fillRect(bx - 9, h - 8, 18, 8);
        // bolt lines
        g.fillStyle(0x888888, 0.08);
        g.fillCircle(bx, h * 0.25, 2);
        g.fillCircle(bx, h * 0.5, 2);
        g.fillCircle(bx, h * 0.75, 2);
      }
      // horizontal girders
      g.fillStyle(0x4a4c54, 0.1);
      g.fillRect(0, h * 0.15, w, 5);
      g.fillRect(0, h * 0.45, w, 4);
      g.fillRect(0, h - 110, w, 4);
      // gear silhouettes with teeth
      const drawGear = (cx, cy, r, teeth) => {
        g.lineStyle(2, 0x555566, 0.08);
        g.strokeCircle(cx, cy, r);
        g.strokeCircle(cx, cy, r * 0.4);
        for (let t = 0; t < teeth; t++) {
          const a = (t / teeth) * Math.PI * 2;
          g.lineBetween(cx + Math.cos(a) * r, cy + Math.sin(a) * r,
            cx + Math.cos(a) * (r + 8), cy + Math.sin(a) * (r + 8));
        }
      };
      drawGear(w * 0.12, h * 0.28, 40, 12);
      drawGear(w * 0.88, h * 0.32, 32, 10);
      drawGear(w * 0.5, h * 0.12, 24, 8);
      // chain links hanging
      for (let c = 0; c < 3; c++) {
        const cx = 200 + c * 400;
        g.lineStyle(2, 0x4a4c54, 0.08);
        for (let link = 0; link < 5; link++) {
          g.strokeEllipse(cx, 30 + link * 14, 6, 8);
        }
      }
      // sparks / rust flecks
      for (let i = 0; i < 15; i++) {
        g.fillStyle(0xcc8844, 0.08);
        g.fillCircle(Phaser.Math.Between(0, w), Phaser.Math.Between(0, h), 1);
      }
      // metal floor with rivet line
      g.fillStyle(0x22242a, 0.4);
      g.fillRect(0, h - 30, w, 30);
      g.lineStyle(1, 0x3a3c44, 0.15);
      g.lineBetween(0, h - 30, w, h - 30);
      g.fillStyle(0x888888, 0.1);
      for (let i = 0; i < 22; i++) {
        g.fillCircle(30 + i * 60, h - 27, 1.5);
      }

    } else if (id === "skyborne-ruins") {
      // deep sky gradient (dark blue to lighter at horizon)
      g.fillGradientStyle(0x08101e, 0x0a1428, 0x182848, 0x1e3454, 1, 1, 1, 1);
      g.fillRect(0, 0, w, h);
      // layered cloud banks
      for (let layer = 0; layer < 3; layer++) {
        const yBase = 20 + layer * 40;
        for (let i = 0; i < 6; i++) {
          g.fillStyle(0x4488cc, 0.04 + layer * 0.015);
          g.fillEllipse(Phaser.Math.Between(0, w), yBase + Phaser.Math.Between(0, 30), Phaser.Math.Between(80, 200), Phaser.Math.Between(15, 35));
        }
      }
      // distant fractured towers
      const towerData = [
        { x: 120, h: 240, w: 22, tilt: 2 },
        { x: 380, h: 180, w: 18, tilt: -3 },
        { x: 650, h: 280, w: 24, tilt: 1 },
        { x: 920, h: 200, w: 20, tilt: -2 },
        { x: 1180, h: 220, w: 18, tilt: 3 }
      ];
      towerData.forEach((t) => {
        g.fillStyle(0x2a3848, 0.12);
        g.beginPath();
        g.moveTo(t.x - t.w / 2, h * 0.55);
        g.lineTo(t.x - t.w / 2 + t.tilt, h * 0.55 - t.h);
        g.lineTo(t.x + t.w / 2 + t.tilt, h * 0.55 - t.h);
        g.lineTo(t.x + t.w / 2, h * 0.55);
        g.closePath();
        g.fillPath();
        g.fillStyle(0x3a4858, 0.07);
        g.fillRect(t.x - t.w / 2 + t.tilt - 6, h * 0.55 - t.h, t.w + 12, 10);
      });
      // broken bridge segments floating below towers
      for (let i = 0; i < 5; i++) {
        g.fillStyle(0x2a3848, 0.08);
        g.fillRoundedRect(Phaser.Math.Between(100, w - 100), h * 0.48 + i * 15, Phaser.Math.Between(30, 70), 6, 2);
      }
      // stars (dense, varying brightness)
      for (let i = 0; i < 55; i++) {
        const bright = Phaser.Math.FloatBetween(0.06, 0.22);
        g.fillStyle(0xffffff, bright);
        g.fillCircle(Phaser.Math.Between(0, w), Phaser.Math.Between(0, h * 0.45), bright > 0.15 ? 1.5 : 1);
      }
      // wind streaks
      g.lineStyle(1, 0x88aacc, 0.06);
      for (let i = 0; i < 10; i++) {
        const sy = Phaser.Math.Between(60, h - 80);
        const sx = Phaser.Math.Between(0, w * 0.4);
        g.lineBetween(sx, sy, sx + Phaser.Math.Between(80, 250), sy + Phaser.Math.Between(-4, 4));
      }
      // floating stone debris
      for (let i = 0; i < 10; i++) {
        g.fillStyle(0x3a4858, 0.08);
        g.fillEllipse(Phaser.Math.Between(40, w - 40), Phaser.Math.Between(h * 0.3, h - 60), Phaser.Math.Between(5, 14), Phaser.Math.Between(3, 8));
      }
      // crumbling floor edge
      g.fillStyle(0x1a2838, 0.35);
      g.fillRect(0, h - 28, w, 28);
      for (let i = 0; i < 8; i++) {
        g.fillStyle(0x2a3848, 0.12);
        g.fillEllipse(Phaser.Math.Between(0, w), h - 28, Phaser.Math.Between(10, 25), 5);
      }
    } else {
      g.fillStyle(0x111a29, 1);
      g.fillRect(0, 0, w, h);
    }

    g.setScrollFactor(1);
  }

  getArenaDefinitions() {
    return window.ARENA_MAPS || [];
  }

  /**
   * Boss sprite body height 68 → standing center Y = platform top − 34. Waypoints are generated from
   * real physics bodies so every arena stays aligned with floors/platforms after layout changes.
   */
  buildBossNavGraphFromPlatforms() {
    const children = this.platforms?.getChildren?.() || [];
    const BOSS_STAND_HALF = 34;
    const nodes = [];
    let nid = 0;

    children.forEach((sprite, platformIndex) => {
      const b = sprite.body;
      if (!b) return;
      const top = b.top;
      const standY = Phaser.Math.Clamp(top - BOSS_STAND_HALF, 85, 515);
      const left = b.left;
      const right = b.right;
      const width = b.width;
      const isWideFloor = width > 650;

      if (isWideFloor) {
        const segments = 6;
        for (let i = 0; i < segments; i += 1) {
          const x = left + (width * (i + 0.5)) / segments;
          nodes.push({ id: `nav_${nid++}`, x, y: standY, platformIndex });
        }
      } else if (width > 205) {
        nodes.push({ id: `nav_${nid++}`, x: left + width * 0.28, y: standY, platformIndex });
        nodes.push({ id: `nav_${nid++}`, x: left + width * 0.72, y: standY, platformIndex });
      } else {
        nodes.push({ id: `nav_${nid++}`, x: (left + right) * 0.5, y: standY, platformIndex });
      }
    });

    const edges = {};
    nodes.forEach((n) => {
      edges[n.id] = [];
    });
    const addUndirected = (ida, idb) => {
      if (ida === idb) return;
      if (!edges[ida].includes(idb)) edges[ida].push(idb);
      if (!edges[idb].includes(ida)) edges[idb].push(ida);
    };

    const byPlat = {};
    nodes.forEach((n) => {
      if (!byPlat[n.platformIndex]) byPlat[n.platformIndex] = [];
      byPlat[n.platformIndex].push(n);
    });
    Object.values(byPlat).forEach((grp) => {
      grp.sort((a, c) => a.x - c.x);
      for (let i = 0; i < grp.length - 1; i += 1) {
        addUndirected(grp[i].id, grp[i + 1].id);
      }
    });

    const canCrossPlatforms = (na, nb) => {
      if (na.platformIndex === nb.platformIndex) return false;
      const dx = Math.abs(na.x - nb.x);
      const ay = na.y;
      const by = nb.y;
      if (by < ay - 8) {
        const rise = ay - by;
        if (rise < 12) return false;
        if (rise <= 235 && dx <= 620) return true;
        if (rise <= 250 && dx <= 200) return true;
        return false;
      }
      if (by > ay + 10) {
        const drop = by - ay;
        return drop <= 320 && dx <= 500;
      }
      if (Math.abs(ay - by) < 42) {
        return dx <= 380;
      }
      return false;
    };

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        if (nodes[i].platformIndex === nodes[j].platformIndex) continue;
        if (canCrossPlatforms(nodes[i], nodes[j])) {
          addUndirected(nodes[i].id, nodes[j].id);
        }
      }
    }

    return { nodes, edges };
  }

  /** Picks waypoint: prefers matching player height (behind / on platforms) over raw distance. */
  getClosestBossNavNodeId(worldX, worldY) {
    const graph = this.getBossNavGraph();
    const list = graph.nodes;
    if (!list?.length) return null;
    let bestId = null;
    let bestScore = Number.POSITIVE_INFINITY;
    list.forEach((node) => {
      const dx = Math.abs(node.x - worldX);
      const dy = Math.abs(node.y - worldY);
      const score = dx * 1.05 + dy * 2.75;
      if (score < bestScore) {
        bestScore = score;
        bestId = node.id;
      }
    });
    return bestId;
  }

  buildBossNavGraphFromNodes(nodes) {
    const safeNodes = Array.isArray(nodes) ? nodes : [];
    const edges = {};
    safeNodes.forEach((node) => {
      edges[node.id] = [];
    });
    for (let i = 0; i < safeNodes.length; i += 1) {
      for (let j = i + 1; j < safeNodes.length; j += 1) {
        const a = safeNodes[i];
        const b = safeNodes[j];
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        const sameLevelLink = dy <= 70 && dx <= 380;
        const jumpLink = dy <= 190 && dx <= 270;
        if (sameLevelLink || jumpLink) {
          edges[a.id].push(b.id);
          edges[b.id].push(a.id);
        }
      }
    }
    return { nodes: safeNodes, edges };
  }

  createArenaPlatforms(arena) {
    this.platforms = this.physics.add.staticGroup();
    const floor = this.platforms.create(arena.width * 0.5, 522, "platform");
    floor.setScale(arena.floorScaleX || 7.2, 1).refreshBody();
    (arena.platforms || []).forEach((platform) => {
      this.platforms.create(platform.x, platform.y, "platform").setScale(platform.scaleX || 1, 1).refreshBody();
    });
    this.platforms.getChildren().forEach((p) => p.setDepth(DEPTH.PLATFORM));
    this.bossNavGraph = this.buildBossNavGraphFromPlatforms();
  }

  /**
   * Places boss sprite Y so physics feet sit on a platform top at x. Uses real body.bottom − sprite.y
   * (boss body has a frame offset — half-height was wrong and caused clipping through solids).
   * Horizontal test: foot width overlap, or boss center over platform (narrow ledges).
   */
  snapBossTeleportCenterY(x, preferredCenterY, boss) {
    const bounds = this.physics?.world?.bounds;
    const worldH = bounds?.height || 540;
    let footDelta;
    let feetLeft;
    let feetRight;
    if (boss?.active && boss.body) {
      footDelta = boss.body.bottom - boss.y;
      const hw = boss.body.width * 0.5;
      feetLeft = x - hw;
      feetRight = x + hw;
    } else {
      const bh = 68;
      footDelta = bh * 0.5;
      feetLeft = x - 27;
      feetRight = x + 27;
    }
    const children = this.platforms?.getChildren?.() || [];
    const candidates = [];
    for (let i = 0; i < children.length; i += 1) {
      const p = children[i];
      const b = p.body;
      if (!b) continue;
      const surfaceTop = b.top;
      if (!Number.isFinite(surfaceTop)) continue;
      const feetOverlap = Math.max(feetLeft, b.left) <= Math.min(feetRight, b.right);
      const centerOnPlat = x >= b.left && x <= b.right;
      if (!feetOverlap && !centerOnPlat) continue;
      const spriteY = surfaceTop - footDelta;
      if (!Number.isFinite(spriteY)) continue;
      const dy = Math.abs(spriteY - preferredCenterY);
      candidates.push({ spriteY, surfaceTop, dy });
    }
    if (!candidates.length) {
      return Phaser.Math.Clamp(preferredCenterY, 130, worldH - footDelta - 10);
    }
    candidates.sort((a, c) => {
      if (a.dy !== c.dy) return a.dy - c.dy;
      return a.surfaceTop - c.surfaceTop;
    });
    return Phaser.Math.Clamp(candidates[0].spriteY, 130, worldH - footDelta - 10);
  }

  chargeShotHeatColor(t) {
    const u = Phaser.Math.Clamp(Number.isFinite(t) ? t : 0, 0, 1);
    const r = Phaser.Math.Linear(0xf7, 0xff, u);
    const g = Phaser.Math.Linear(0xd9, 0x42, u);
    const b = Phaser.Math.Linear(0x5c, 0x14, u);
    return Phaser.Display.Color.GetColor(Math.round(r), Math.round(g), Math.round(b));
  }

  mergeChargeBoltVisual(partial) {
    if (typeof window !== "undefined" && typeof window.mergeChargeBoltVisualPartial === "function") {
      return window.mergeChargeBoltVisualPartial(partial);
    }
    const cbBase =
      typeof window !== "undefined" && window.CHARGE_BOLT_VISUAL_DEFAULTS && typeof window.CHARGE_BOLT_VISUAL_DEFAULTS === "object"
        ? window.CHARGE_BOLT_VISUAL_DEFAULTS
        : {};
    return { ...cbBase, ...(partial && typeof partial === "object" ? partial : {}) };
  }

  getBossAiTargets() {
    return [
      ...this.players.filter((p) => p.isAlive && !p.soulShroudActive),
      ...this.soulcallerDecoys.filter((d) => d.sprite?.isAlive).map((d) => d.sprite),
      ...this.soulcallerTurrets.filter((t) => t.sprite?.isAlive).map((t) => t.sprite)
    ];
  }

  _moveSoulcallerWispToward(container, tx, ty, maxSpeedPxPerSec, dt) {
    if (!container) return;
    const dx = tx - container.x;
    const dy = ty - container.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.35) return;
    const step = Math.max(0, maxSpeedPxPerSec) * (dt / 1000);
    if (dist <= step) {
      container.setPosition(tx, ty);
      return;
    }
    container.x += (dx / dist) * step;
    container.y += (dy / dist) * step;
  }

  wireBossContactForAiSprite(sprite) {
    if (!sprite || !this.boss?.active) return;
    const hitLeader = () => {
      if (this.gameState !== "battle" || !sprite?.active || !sprite.isAlive) return;
      try {
        this.boss.tryContactDamage(sprite, this.time.now);
      } catch (error) {
        console.error("Boss contact hit failed", error);
      }
    };
    this.physics.add.overlap(sprite, this.boss, hitLeader);
    if (this.bossTwin?.active) {
      const hitTwin = () => {
        if (this.gameState !== "battle" || !sprite?.active || !sprite.isAlive) return;
        try {
          this.bossTwin.tryContactDamage(sprite, this.time.now);
        } catch (error) {
          console.error("Boss twin contact hit failed", error);
        }
      };
      this.physics.add.overlap(sprite, this.bossTwin, hitTwin);
    }
  }

  spawnPlayerProjectile(x, y, direction, damage, options = {}) {
    let texKey = options.textureKey && this.textures.exists(options.textureKey) ? options.textureKey : "projectile_player";
    if (options.style === "soulWispBolt") {
      texKey = this.textures.exists("proj_soulcaller_wisp") ? "proj_soulcaller_wisp" : texKey;
    } else if (options.style === "soulTurretBolt") {
      texKey = this.textures.exists("proj_soulcaller_turret") ? "proj_soulcaller_turret" : texKey;
    }
    if (options.style === "chargeBolt") {
      if (this.textures.exists("proj_charge_pulse")) {
        texKey = "proj_charge_pulse";
      } else if (!this.textures.exists(texKey)) {
        texKey = this.textures.exists("proj_medic") ? "proj_medic" : "projectile_player";
      }
    }
    const chargeBoltVisual = options.style === "chargeBolt" ? this.mergeChargeBoltVisual(options.chargeBolt) : null;
    const spawnForward = options.style === "chargeBolt" ? chargeBoltVisual.spawnForward : 22;
    const absVel = options.useAbsoluteVelocity === true;
    const spawnX = absVel ? x + (Number.isFinite(options.spawnOffsetX) ? options.spawnOffsetX : 0) : x + direction * spawnForward;
    const projectile = this.playerProjectiles.create(spawnX, y, texKey);
    projectile.setDepth(DEPTH.PROJECTILE);
    const speedX = options.speedX || 480;
    const gravity = options.gravity || 0;
    if (absVel) {
      projectile.setVelocityX(Number.isFinite(options.velocityX) ? options.velocityX : 0);
      projectile.setVelocityY(Number.isFinite(options.velocityY) ? options.velocityY : 0);
    } else {
      projectile.setVelocityX(direction * speedX);
      projectile.setVelocityY(options.velocityY || 0);
    }
    projectile.body.allowGravity = gravity > 0;
    projectile.body.gravity.y = gravity;
    projectile.damage = damage;
    projectile.effectColor = options.effectColor || 0xfff7a8;
    projectile.spawnX = projectile.x;
    projectile.maxRange = options.maxRange || 9999;
    projectile.visualStyle = options.style || "default";
    projectile.ownerPlayer = options.ownerPlayer || null;
    projectile.allyHeal = Number.isFinite(options.allyHeal) ? options.allyHeal : 0;
    projectile.medicResonance = options.medicResonance === true;
    projectile.fireDir = direction;
    projectile.chargeBolt = projectile.visualStyle === "chargeBolt";
    projectile.chargeHeat = Number.isFinite(options.chargeHeat) ? options.chargeHeat : 0;
    projectile.chargeScaleBase = Number.isFinite(options.chargeScaleBase) ? options.chargeScaleBase : 1;
    projectile.chargeTrailAcc = 0;
    projectile.spiritBoltHoming = options.spiritBoltHoming || false;
    projectile.spiritHomingStrength = options.spiritHomingStrength || 0;
    projectile.spiritDebuffMult = options.spiritDebuffMult || 1;
    projectile.spiritDebuffMs = options.spiritDebuffMs || 0;
    projectile.spiritCharged = options.spiritCharged || false;
    projectile.soulLinkTarget = options.soulLinkTarget || null;
    projectile.soulLinkOwner = options.soulLinkOwner || null;
    if (projectile.chargeBolt && chargeBoltVisual) {
      projectile.chargeBoltVisual = chargeBoltVisual;
      const bs = projectile.chargeScaleBase;
      projectile.chargePeakScale = bs * chargeBoltVisual.peakMultiplier;
      projectile.chargeMinScale = chargeBoltVisual.minScale;
    }
    projectile.setTint(projectile.effectColor);
    projectile.setScale(options.scaleX || 1, options.scaleY || 1);
    projectile.setAlpha(options.alpha || 1);

    if (projectile.visualStyle === "pulse") {
      projectile.setScale(texKey === "proj_medic" ? 0.95 : 1.05, texKey === "proj_medic" ? 0.95 : 0.9);
      projectile.setAlpha(0.92);
    } else if (projectile.visualStyle === "arrow") {
      projectile.setScale(texKey === "proj_ranger" ? 1 : 1.45, texKey === "proj_ranger" ? 1 : 0.42);
      projectile.setAlpha(0.96);
    } else if (projectile.visualStyle === "tripleArrow") {
      projectile.setScale(texKey === "proj_ranger" ? 0.88 : 1.25, texKey === "proj_ranger" ? 0.95 : 0.42);
      projectile.setAlpha(0.94);
    } else if (projectile.visualStyle === "chargeBolt") {
      const v = chargeBoltVisual || this.mergeChargeBoltVisual();
      const peak = projectile.chargePeakScale || projectile.chargeScaleBase * v.peakMultiplier;
      projectile.setScale(peak * v.spawnScaleMulX, peak * v.spawnScaleMulY);
      projectile.setAlpha(1);
      if (projectile.setBlendMode) {
        projectile.setBlendMode(Phaser.BlendModes.NORMAL);
      }
    } else if (projectile.visualStyle === "riftBolt") {
      projectile.setScale(texKey === "proj_summoner" ? 1.05 : 1.1, texKey === "proj_summoner" ? 0.95 : 1);
      projectile.setAlpha(0.94);
      if (projectile.setBlendMode) {
        projectile.setBlendMode(Phaser.BlendModes.ADD);
      }
    } else if (projectile.visualStyle === "soulWispBolt") {
      projectile.setScale(texKey === "proj_soulcaller_wisp" ? 1 : 0.85, texKey === "proj_soulcaller_wisp" ? 1 : 0.85);
      projectile.setAlpha(0.92);
      if (projectile.setBlendMode) {
        projectile.setBlendMode(Phaser.BlendModes.NORMAL);
      }
    } else if (projectile.visualStyle === "soulTurretBolt") {
      projectile.setScale(texKey === "proj_soulcaller_turret" ? 1.05 : 0.95, texKey === "proj_soulcaller_turret" ? 0.72 : 0.65);
      projectile.setAlpha(0.96);
      if (projectile.setBlendMode) {
        projectile.setBlendMode(Phaser.BlendModes.NORMAL);
      }
    } else if (projectile.visualStyle === "spiritBolt") {
      projectile.setAlpha(0.92);
      if (projectile.setBlendMode) {
        projectile.setBlendMode(Phaser.BlendModes.ADD);
      }
    }

    if (projectile.body) {
      if (projectile.chargeBolt) {
        projectile.body.setCircle(14);
      } else {
        projectile.body.setSize(
          Math.max(6, Math.round(projectile.body.width * projectile.scaleX)),
          Math.max(4, Math.round(projectile.body.height * projectile.scaleY)),
          true
        );
      }
    }
    if (texKey === "proj_ranger" && !projectile.chargeBolt) {
      projectile.setFlipX(direction < 0);
    }
    if ((texKey === "proj_summoner" || texKey === "proj_summoner_charged") && !projectile.chargeBolt) {
      projectile.setFlipX(direction < 0);
    }
    if ((texKey === "proj_soulcaller_wisp" || texKey === "proj_soulcaller_turret") && !projectile.chargeBolt) {
      projectile.setFlipX(direction < 0);
    }
    if (projectile.chargeBolt) {
      this.spawnChargeShotMuzzleBurst(x + direction * 20, y - 2, projectile.effectColor, projectile.chargeHeat);
    } else if (!options.skipMuzzleFlash) {
      this.spawnMuzzleFlash(x + direction * 18, y, projectile.effectColor, projectile.visualStyle);
      this.spawnProjectileTrail(
        projectile.x - direction * 6,
        projectile.y,
        projectile.effectColor,
        projectile.visualStyle,
        texKey
      );
    }
  }

  spawnBossProjectile(x, y, direction, damage, options = {}) {
    const texKey =
      options.textureKey && this.textures.exists(options.textureKey) ? options.textureKey : "projectile_boss";
    const spawnOff = Number.isFinite(options.spawnOffsetX) ? options.spawnOffsetX : 30;
    const projectile = this.bossProjectiles.create(x + direction * spawnOff, y, texKey);
    projectile.setDepth(DEPTH.PROJECTILE);
    const speedX = options.speedX || 340;
    const gravity = options.gravity || 0;
    const absVel = options.useAbsoluteVelocity === true;
    if (absVel) {
      projectile.setVelocityX(Number.isFinite(options.velocityX) ? options.velocityX : 0);
      projectile.setVelocityY(Number.isFinite(options.velocityY) ? options.velocityY : 0);
    } else {
      projectile.setVelocityX(direction * speedX);
      projectile.setVelocityY(options.velocityY || 0);
    }
    projectile.body.allowGravity = gravity > 0;
    projectile.body.gravity.y = gravity;
    const dm = this.bossOutgoingDamageMult ?? 1;
    const rawDmg = Number.isFinite(damage) ? damage : 10;
    projectile.damage = Math.max(1, Math.round(rawDmg * dm));
    projectile.effectColor = options.effectColor || 0xff8b8b;
    projectile.spawnX = projectile.x;
    projectile.spawnY = projectile.y;
    projectile.maxRange = options.maxRange || 9999;
    projectile.ignorePlatforms = options.ignorePlatforms === true;
    projectile.galeSkybreakHoming = options.galeSkybreakHoming === true;
    projectile.galeHomingStrength = Number.isFinite(options.galeHomingStrength) ? options.galeHomingStrength : 0.11;
    projectile.galeBaseSpeed = Number.isFinite(options.galeBaseSpeed)
      ? options.galeBaseSpeed
      : Math.hypot(projectile.body.velocity.x, projectile.body.velocity.y) || speedX;
    projectile.galePullToBoss = options.galePullToBoss === true;
    projectile.galePullImpulse = Number.isFinite(options.galePullImpulse) ? options.galePullImpulse : 400;
    projectile.galeSeekerBolt = options.galeSeekerBolt === true;
    projectile.galeSeekRetargetAt = Number.isFinite(options.galeSeekRetargetAt) ? options.galeSeekRetargetAt : 0;
    projectile.galeSeekRetargeted = false;
    projectile.galeSeekerSpawnAt = this.time.now;
    projectile.galeSeekerMaxLifeMs = Number.isFinite(options.galeSeekerMaxLifeMs)
      ? options.galeSeekerMaxLifeMs
      : options.galeSeekerBolt === true
        ? 5000
        : 0;
    projectile.galeSeekerSnapOffset = Number.isFinite(options.galeSeekerSnapOffset)
      ? options.galeSeekerSnapOffset
      : 94;
    projectile.galeWindSalvoBolt = options.galeWindSalvoBolt === true;
    projectile.galeWindSalvoReturnable = options.galeWindSalvoReturnable === true;
    projectile.galeWindSalvoReturning = false;
    projectile.galeWindSalvoReturnDamage = Number.isFinite(options.galeWindSalvoReturnDamage)
      ? options.galeWindSalvoReturnDamage
      : 5;
    projectile.galeWindSalvoSpawnAt = Number.isFinite(options.galeWindSalvoSpawnAt)
      ? options.galeWindSalvoSpawnAt
      : this.time.now;
    projectile.galeWindSalvoMaxLifeMs = Number.isFinite(options.galeWindSalvoMaxLifeMs)
      ? options.galeWindSalvoMaxLifeMs
      : options.galeWindSalvoBolt === true
        ? 4200
        : 0;
    if (options.projectileTag) projectile.projectileTag = options.projectileTag;
    projectile.setTint(projectile.effectColor);
    const sx = options.scaleX != null ? options.scaleX : texKey === "proj_wraith_ghost" ? 0.72 : 1.1;
    const sy = options.scaleY != null ? options.scaleY : texKey === "proj_wraith_ghost" ? 0.72 : 0.95;
    projectile.setScale(sx, sy);
    if (options.alpha != null) projectile.setAlpha(options.alpha);
    else if (options.galeSeekerBolt) projectile.setAlpha(1);
    if (projectile.body) {
      projectile.body.setSize(
        Math.max(7, Math.round(projectile.body.width * projectile.scaleX)),
        Math.max(5, Math.round(projectile.body.height * projectile.scaleY)),
        true
      );
    }
    if (!options.skipMuzzleFlash) {
      this.spawnMuzzleFlash(x + direction * 22, y, projectile.effectColor);
    }
    if (!options.noBossTrail) {
      if (texKey === "proj_wraith_ghost") {
        this.tweens.add({
          targets: projectile,
          y: projectile.y + Phaser.Math.Between(-2, 2),
          duration: 100,
          yoyo: true,
          repeat: 14,
          ease: "Sine.easeInOut"
        });
      }
      this.spawnProjectileTrail(projectile.x - direction * 6, projectile.y, projectile.effectColor, "boss");
    }
    if (options.hollowBloomOrb === true) {
      projectile.damage = 0;
      projectile.hollowBloomOrb = true;
      projectile.hollowBloomStart = this.time.now;
      projectile.hollowBloomDurationMs = Number.isFinite(options.hollowBloomDurationMs) ? options.hollowBloomDurationMs : 2800;
      projectile.hollowBloomExplosionRadius = Number.isFinite(options.hollowBloomExplosionRadius) ? options.hollowBloomExplosionRadius : 76;
      projectile.hollowBloomExplosionDamage = Number.isFinite(options.hollowBloomExplosionDamage) ? options.hollowBloomExplosionDamage : 18;
      projectile.hollowBloomBossRef = options.hollowBloomBossRef || this.boss;
      projectile.hollowBloomSplitCount = Number.isFinite(options.hollowBloomSplitCount) ? options.hollowBloomSplitCount : 10;
      projectile.hollowBloomSplitDamage = Number.isFinite(options.hollowBloomSplitDamage) ? options.hollowBloomSplitDamage : 12;
      projectile.hollowBloomSplitSpeed = Number.isFinite(options.hollowBloomSplitSpeed) ? options.hollowBloomSplitSpeed : 240;
      projectile.hollowBloomSplitMaxRange = Number.isFinite(options.hollowBloomSplitMaxRange) ? options.hollowBloomSplitMaxRange : 480;
      projectile.ignorePlatforms = true;
      if (projectile.body) {
        const br = Math.max(20, Math.round(projectile.width * projectile.scaleX * 0.44));
        projectile.body.setCircle(br);
      }
    }
    if (options.hollowBloomShard === true) {
      projectile.hollowBloomShard = true;
      if (projectile.body) {
        const br = Number.isFinite(options.shardBodyRadius) ? options.shardBodyRadius : 17;
        projectile.body.setCircle(br);
      }
    }
  }

  spawnHollowBloomOrb(leader, twin, target) {
    if (!leader?.getAttackTuning || !twin?.active || !target?.isAlive) return;
    const tuning = leader.getAttackTuning("hollowBloomOrb", {
      speedX: 72,
      travelMs: 3400,
      explosionRadius: 98,
      explosionDamage: 20,
      splitCount: 10,
      splitProjectileDamage: 13,
      splitSpeed: 252,
      splitMaxRange: 520,
      cooldownMs: 1480
    });
    const dir = target.x >= twin.x ? 1 : -1;
    const dy = Phaser.Math.Clamp((target.y - twin.y) * 0.12, -95, 95);
    const speed = Number.isFinite(tuning.speedX) ? tuning.speedX : 72;
    const col = 0xc060e8;

    // launch VFX — dark void burst at spawn point
    const spX = twin.x;
    const spY = twin.y - 6;
    const burst = this.add.circle(spX, spY, 10, 0x1a0828, 0.65);
    burst.setDepth(DEPTH.PLAYER_FX);
    this.tweens.add({
      targets: burst,
      scale: { from: 0.5, to: 2.5 },
      alpha: { from: 0.65, to: 0 },
      duration: 250,
      ease: "Quad.easeOut",
      onComplete: () => burst.destroy()
    });
    // launch sparks
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const sp = this.add.circle(
        spX + Math.cos(angle) * 4,
        spY + Math.sin(angle) * 4,
        2, i % 2 === 0 ? 0xff66cc : col, 0.6
      );
      sp.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: sp,
        x: spX + Math.cos(angle) * 22,
        y: spY + Math.sin(angle) * 18,
        alpha: 0, scale: 0.2,
        duration: 200,
        ease: "Quad.easeOut",
        onComplete: () => sp.destroy()
      });
    }

    this.spawnBossProjectile(spX, spY, dir, 0, {
      speedX: speed,
      velocityY: dy * 0.38,
      hollowBloomOrb: true,
      hollowBloomDurationMs: tuning.travelMs || 3400,
      hollowBloomExplosionRadius: tuning.explosionRadius || 98,
      hollowBloomExplosionDamage: tuning.explosionDamage || 20,
      hollowBloomSplitCount: tuning.splitCount ?? 10,
      hollowBloomSplitDamage: tuning.splitProjectileDamage ?? 13,
      hollowBloomSplitSpeed: tuning.splitSpeed ?? 252,
      hollowBloomSplitMaxRange: tuning.splitMaxRange ?? 520,
      hollowBloomBossRef: leader,
      maxRange: 99999,
      skipMuzzleFlash: true,
      noBossTrail: true,
      scaleX: 1.65,
      scaleY: 1.65,
      textureKey: this.textures.exists("hollow_blackhole_orb") ? "hollow_blackhole_orb" : "projectile_boss",
      effectColor: col,
      ignorePlatforms: true,
      spawnOffsetX: 26
    });
  }

  triggerHollowBloomExplosion(projectile) {
    const boss = projectile.hollowBloomBossRef || this.boss;
    if (!boss?.hitPlayer) return;
    const r = projectile.hollowBloomExplosionRadius || 96;
    const raw = Number.isFinite(projectile.hollowBloomExplosionDamage) ? projectile.hollowBloomExplosionDamage : 18;
    const cx = projectile.x;
    const cy = projectile.y;
    const col = projectile.effectColor || boss.definition?.color || 0xc060e8;
    const splitN = Math.max(6, Math.min(14, projectile.hollowBloomSplitCount || 10));
    const splDmg = projectile.hollowBloomSplitDamage ?? 13;
    const splSpd = projectile.hollowBloomSplitSpeed ?? 250;
    const splRange = projectile.hollowBloomSplitMaxRange ?? 520;

    // damage players in range
    this.players.forEach((p) => {
      if (!p.isAlive) return;
      const d = Math.hypot(p.x - cx, p.y - 14 - cy);
      if (d <= r) {
        boss.hitPlayer(p, raw, col, "projectile");
      }
    });

    // dark void core flash
    const voidCore = this.add.circle(cx, cy, r * 0.3, 0x08010e, 0.95);
    voidCore.setDepth(DEPTH.PLAYER_FX + 1);
    this.tweens.add({
      targets: voidCore,
      scale: { from: 0.6, to: 1.8 },
      alpha: { from: 0.95, to: 0 },
      duration: 300,
      ease: "Quad.easeOut",
      onComplete: () => voidCore.destroy()
    });

    // bright explosion flash
    const flash = this.add.circle(cx, cy, r * 0.15, 0xffffff, 0.85);
    flash.setDepth(DEPTH.PLAYER_FX + 2);
    this.tweens.add({
      targets: flash,
      scale: { from: 1, to: 4 },
      alpha: { from: 0.85, to: 0 },
      duration: 200,
      ease: "Quad.easeOut",
      onComplete: () => flash.destroy()
    });

    // expanding shockwave rings
    for (let ring = 0; ring < 3; ring++) {
      const ringGfx = this.add.graphics();
      ringGfx.setDepth(DEPTH.PLAYER_FX);
      const ringCol = ring === 0 ? 0xff66cc : ring === 1 ? col : 0xd080ff;
      ringGfx.lineStyle(4 - ring, ringCol, 0.6 - ring * 0.12);
      ringGfx.strokeCircle(cx, cy, r * 0.3);
      this.tweens.add({
        targets: ringGfx,
        scaleX: { from: 0.4, to: 1.2 + ring * 0.15 },
        scaleY: { from: 0.4, to: 1.2 + ring * 0.15 },
        alpha: { from: 0.65, to: 0 },
        duration: 320 + ring * 60,
        delay: ring * 40,
        ease: "Quad.easeOut",
        onComplete: () => ringGfx.destroy()
      });
    }

    // radial energy streaks
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const streakLen = r * (0.4 + Math.random() * 0.3);
      const streakGfx = this.add.graphics();
      streakGfx.setDepth(DEPTH.PLAYER_FX);
      const sc = i % 3 === 0 ? 0xff88ee : i % 3 === 1 ? col : 0xe8d0ff;
      streakGfx.lineStyle(2, sc, 0.6);
      streakGfx.beginPath();
      streakGfx.moveTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6);
      streakGfx.lineTo(cx + Math.cos(a) * streakLen, cy + Math.sin(a) * streakLen * 0.65);
      streakGfx.strokePath();
      this.tweens.add({
        targets: streakGfx,
        alpha: { from: 0.65, to: 0 },
        duration: 220 + Math.random() * 120,
        delay: 30,
        ease: "Quad.easeOut",
        onComplete: () => streakGfx.destroy()
      });
    }

    // split projectile shards
    const shardCol = 0xd080ff;
    for (let i = 0; i < splitN; i++) {
      const a = (i / splitN) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.08, 0.08);
      const vx = Math.cos(a) * splSpd;
      const vy = Math.sin(a) * splSpd;
      this.spawnBossProjectile(cx, cy, vx >= 0 ? 1 : -1, splDmg, {
        useAbsoluteVelocity: true,
        velocityX: vx,
        velocityY: vy,
        textureKey: this.textures.exists("hollow_bloom_shard") ? "hollow_bloom_shard" : "projectile_boss",
        scaleX: 1.42,
        scaleY: 1.42,
        maxRange: splRange,
        effectColor: shardCol,
        hollowBloomShard: true,
        shardBodyRadius: 19,
        skipMuzzleFlash: true,
        noBossTrail: true,
        alpha: 0.95
      });
    }

    // scatter debris particles
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2);
      const dist = r * (0.3 + Math.random() * 0.4);
      const px = cx + Math.cos(a) * dist;
      const py = cy + Math.sin(a) * dist * 0.6;
      this.spawnImpactEffect(px, py, i % 2 === 0 ? col : 0xff66cc, 10 + Math.random() * 10);
    }
    this.spawnImpactEffect(cx, cy, 0x1a0820, 42);
    this.spawnImpactEffect(cx, cy, 0xff66cc, 26);
  }

  spawnHollowBlackHoleImplosion(x, y, radius, color) {
    const c = color || 0xc060e8;

    // outer distortion pulse — expands then snaps inward
    const outerPulse = this.add.graphics();
    outerPulse.setDepth(DEPTH.PLAYER_FX);
    outerPulse.lineStyle(4, c, 0.3);
    outerPulse.strokeCircle(x, y, radius * 1.3);
    this.tweens.add({
      targets: outerPulse,
      scaleX: { from: 1.2, to: 0 },
      scaleY: { from: 1.2, to: 0 },
      alpha: { from: 0.5, to: 0 },
      duration: 400,
      ease: "Cubic.easeIn",
      onComplete: () => outerPulse.destroy()
    });

    // collapsing rings (9 rings cascading inward)
    for (let i = 0; i < 9; i++) {
      const gr = this.add.graphics();
      gr.setDepth(DEPTH.PLAYER_FX);
      const rr = radius * (0.2 + i * 0.11);
      const ringCol = i % 3 === 0 ? 0xff66cc : i % 3 === 1 ? c : 0xd080ff;
      gr.lineStyle(3.5 - i * 0.3, ringCol, 0.6 - i * 0.04);
      gr.strokeCircle(x, y, rr);
      this.tweens.add({
        targets: gr,
        alpha: { from: 0.9, to: 0 },
        scaleX: { from: 1, to: 0.08 },
        scaleY: { from: 1, to: 0.08 },
        duration: 350 + i * 40,
        delay: i * 25,
        ease: "Cubic.easeIn",
        onComplete: () => gr.destroy()
      });
    }

    // sucking particle streaks converging to center
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.15, 0.15);
      const dist = radius * (0.7 + Math.random() * 0.5);
      const px = x + Math.cos(angle) * dist;
      const py = y + Math.sin(angle) * dist;
      const streak = this.add.graphics();
      streak.setDepth(DEPTH.PLAYER_FX);
      streak.fillStyle(i % 2 === 0 ? 0xff88ee : c, 0.7);
      streak.fillCircle(0, 0, 2 + Math.random() * 1.5);
      streak.setPosition(px, py);
      this.tweens.add({
        targets: streak,
        x: x,
        y: y,
        alpha: { from: 0.85, to: 0 },
        scale: { from: 1, to: 0.2 },
        duration: 250 + i * 18,
        delay: i * 12,
        ease: "Quad.easeIn",
        onComplete: () => streak.destroy()
      });
    }

    // spinning accretion arcs
    const arcGfx = this.add.graphics();
    arcGfx.setDepth(DEPTH.PLAYER_FX);
    for (let a = 0; a < 3; a++) {
      const startAngle = (a / 3) * Math.PI * 2;
      arcGfx.lineStyle(2.5, a === 0 ? 0xff66cc : a === 1 ? c : 0xffa0ff, 0.5);
      arcGfx.beginPath();
      arcGfx.arc(x, y, radius * 0.55, startAngle, startAngle + Math.PI * 0.6);
      arcGfx.strokePath();
    }
    this.tweens.add({
      targets: arcGfx,
      rotation: Math.PI * 2,
      scaleX: { from: 1, to: 0 },
      scaleY: { from: 1, to: 0 },
      alpha: { from: 0.7, to: 0 },
      duration: 420,
      ease: "Cubic.easeIn",
      onComplete: () => arcGfx.destroy()
    });

    // dark core with bright flash
    const core = this.add.circle(x, y, Math.max(8, radius * 0.25), 0x06010c, 0.96);
    core.setDepth(DEPTH.PLAYER_FX + 1);
    this.tweens.add({
      targets: core,
      alpha: { from: 1, to: 0 },
      scale: { from: 1.1, to: 0.05 },
      duration: 380,
      ease: "Quad.easeIn",
      onComplete: () => core.destroy()
    });

    // bright singularity flash at end
    this.time.delayedCall(300, () => {
      const flash = this.add.circle(x, y, 6, 0xffffff, 0.8);
      flash.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({
        targets: flash,
        scale: { from: 1, to: 3 },
        alpha: { from: 0.8, to: 0 },
        duration: 180,
        ease: "Quad.easeOut",
        onComplete: () => flash.destroy()
      });
    });
  }

  spawnHollowShadowSpearSweep(cx, cy, width, direction, color) {
    const col = color || 0xcf7cff;
    const half = (width * 0.5) * direction;

    // dark ground slash shadow
    const shadow = this.add.graphics();
    shadow.setDepth(DEPTH.PLAYER_FX);
    shadow.fillStyle(0x06010c, 0.55);
    shadow.fillEllipse(cx + half * 0.3, cy + 4, Math.abs(half) * 1.6, 14);
    this.tweens.add({
      targets: shadow,
      alpha: { from: 0.55, to: 0 },
      scaleX: { from: 0.3, to: 1.1 },
      duration: 180,
      ease: "Quad.easeOut",
      onComplete: () => shadow.destroy()
    });

    // main spear shaft
    const g = this.add.graphics();
    g.setDepth(DEPTH.PLAYER_FX + 1);
    // thick dark core
    g.lineStyle(12, 0x0a0610, 0.9);
    g.beginPath(); g.moveTo(cx - half * 0.1, cy); g.lineTo(cx + half, cy); g.strokePath();
    // energy edge
    g.lineStyle(6, col, 0.75);
    g.beginPath(); g.moveTo(cx - half * 0.05, cy - 2); g.lineTo(cx + half * 0.95, cy - 2); g.strokePath();
    // bright inner line
    g.lineStyle(2.5, 0xf0e0ff, 0.6);
    g.beginPath(); g.moveTo(cx, cy - 1); g.lineTo(cx + half * 0.85, cy - 1); g.strokePath();
    // white-hot core line
    g.lineStyle(1, 0xffffff, 0.4);
    g.beginPath(); g.moveTo(cx + half * 0.1, cy); g.lineTo(cx + half * 0.7, cy); g.strokePath();
    // spear tip flare
    g.fillStyle(col, 0.8);
    const tipX = cx + half;
    g.fillTriangle(tipX, cy - 8, tipX + direction * 14, cy, tipX, cy + 8);
    g.fillStyle(0xffffff, 0.4);
    g.fillTriangle(tipX, cy - 4, tipX + direction * 8, cy, tipX, cy + 4);

    this.tweens.add({
      targets: g,
      alpha: { from: 1, to: 0 },
      scaleX: { from: 0.4, to: 1 },
      duration: 160,
      ease: "Quad.easeOut",
      onComplete: () => g.destroy()
    });

    // trailing energy sparks
    const sparkCount = 8;
    for (let i = 0; i < sparkCount; i++) {
      const t = (i + 0.5) / sparkCount;
      const sx = cx + half * t * 0.9;
      const sy = cy + Phaser.Math.FloatBetween(-10, 10);
      const spark = this.add.graphics();
      spark.setDepth(DEPTH.PLAYER_FX + 1);
      spark.fillStyle(i % 2 === 0 ? col : 0xe8d0ff, 0.7);
      spark.fillCircle(0, 0, 1.5 + Math.random());
      spark.setPosition(sx, sy);
      this.tweens.add({
        targets: spark,
        y: sy - Phaser.Math.Between(8, 20),
        alpha: { from: 0.7, to: 0 },
        duration: 200 + i * 20,
        delay: 40 + i * 12,
        ease: "Quad.easeOut",
        onComplete: () => spark.destroy()
      });
    }

    // impact wave at tip
    const wave = this.add.graphics();
    wave.setDepth(DEPTH.PLAYER_FX);
    wave.lineStyle(2, col, 0.5);
    wave.strokeCircle(tipX, cy, 6);
    this.tweens.add({
      targets: wave,
      scaleX: { from: 0.5, to: 2.5 },
      scaleY: { from: 0.5, to: 2.5 },
      alpha: { from: 0.6, to: 0 },
      duration: 220,
      ease: "Quad.easeOut",
      onComplete: () => wave.destroy()
    });
  }

  spawnHazardRain(targetX) {
    const worldWidth = this.physics?.world?.bounds?.width || this.scale.width;
    for (let i = 0; i < 3; i += 1) {
      const telegraphX = Phaser.Math.Clamp(targetX + Phaser.Math.Between(-120, 120), 40, worldWidth - 40);
      this.spawnTelegraph(telegraphX, 34, 0xffbf6e, 220 + i * 40);
      this.time.delayedCall(i * 180, () => {
        if (this.gameState !== "battle") return;
        const hazard = this.hazards.create(telegraphX, 42, "hazard");
        hazard.setDepth(DEPTH.PROJECTILE);
        const baseHazard = 13;
        const hm = this.bossOutgoingDamageMult ?? 1;
        hazard.damage = Math.max(1, Math.round(baseHazard * hm));
        hazard.setScale(1.2);
        if (hazard.body) {
          hazard.body.setSize(22, 30, true);
        }
      });
    }
  }

  // ─── Grave Warden: summons ────────────────────────────────────────────────

  updateGraveWardenSummons(time) {
    if (!this.graveWardenSummons) return;
    this.updateGraveWardenHauntedGraves(time);
    this.updateGraveWardenPhantoms(time);
    this.updateGraveWardenBoneBrutes(time);
  }

  registerGraveWardenHauntedGrave(boss, x, groundY, tuning, col) {
    if (this.gameState !== "battle" || !boss?.active) return;
    const maxHp = Number.isFinite(tuning?.summonHp) ? Math.max(1, Math.round(tuning.summonHp)) : 80;
    const dur = Number.isFinite(tuning?.durationMs) ? Math.max(800, tuning.durationMs) : 12000;
    const entry = { boss, x, groundY, tuning, col, maxHp, createdAt: this.time.now, expiresAt: this.time.now + dur };

    // physics target so players can hit it
    const sprite = this.physics.add.sprite(x, groundY - 22, "pixel").setScale(1).setAlpha(0);
    sprite.body.setSize(34, 46);
    sprite.body.allowGravity = true;
    sprite.body.setCollideWorldBounds(true);
    this.physics.add.collider(sprite, this.platforms);
    sprite.setDepth(DEPTH.PLAYER);
    sprite.isAlive = true;
    sprite.isGraveWardenSummon = true;
    sprite.health = maxHp;
    sprite.maxHealth = maxHp;
    sprite.movementLockType = null;
    sprite.movementLockUntil = 0;
    sprite.invulnerableUntil = 0;
    sprite.bossContactGraceUntil = 99999999;
    sprite.takeDamage = (amount) => {
      const dmg = Number.isFinite(amount) ? Math.max(1, amount) : 1;
      sprite.health = Math.max(0, sprite.health - dmg);
      if (sprite.health <= 0) {
        sprite.isAlive = false;
        this._destroyGraveWardenHauntedGrave(entry, true);
      }
    };
    entry.sprite = sprite;

    const container = this.add.container(x, groundY - 18);
    container.setDepth(DEPTH.PLAYER_FX);
    entry.container = container;

    const g = this.add.graphics();
    const deep = 0x0f0516;
    const stone = 0x2f2038;
    const stoneDk = 0x1a1024;
    const moss = 0x445032;
    const highlight = 0xf5d0fe;

    // Dirt mound / disturbed earth
    g.fillStyle(deep, 0.8);
    g.fillEllipse(0, 30, 60, 16);
    g.fillStyle(0x1a0a14, 0.9);
    g.fillEllipse(0, 28, 48, 10);
    // loose dirt clumps
    g.fillStyle(stoneDk, 0.7);
    g.fillCircle(-16, 28, 2);
    g.fillCircle(18, 30, 2);
    g.fillCircle(-22, 30, 1.5);
    g.fillCircle(22, 28, 1.5);

    // Tall gravestone (cross/tomb silhouette)
    g.fillStyle(stoneDk, 1);
    // base
    g.fillRoundedRect(-16, 16, 32, 14, 2);
    // stone body
    g.fillStyle(stone, 1);
    g.fillRoundedRect(-13, -14, 26, 30, 3);
    // arched top
    g.beginPath();
    g.arc(0, -14, 13, Math.PI, 0, false);
    g.fillPath();
    // front highlight
    g.fillStyle(0x4a3a54, 0.7);
    g.fillRoundedRect(-11, -12, 8, 24, 2);
    // outline
    g.lineStyle(1.2, stoneDk, 0.9);
    g.strokeRoundedRect(-13, -14, 26, 30, 3);

    // Glowing cracks across the stone
    g.lineStyle(2, col, 0.55);
    g.beginPath();
    g.moveTo(-8, -6);
    g.lineTo(-2, -2);
    g.lineTo(2, -8);
    g.lineTo(8, -4);
    g.strokePath();
    g.lineStyle(1.2, col, 0.4);
    g.beginPath();
    g.moveTo(-6, 6);
    g.lineTo(0, 10);
    g.lineTo(4, 4);
    g.strokePath();
    g.fillStyle(highlight, 0.4);
    g.fillCircle(-2, -2, 1.2);
    g.fillCircle(4, -4, 1);
    g.fillCircle(0, 10, 0.8);

    // Engraved sigil (circle + cross)
    g.lineStyle(1.2, col, 0.55);
    g.strokeCircle(0, -6, 6);
    g.lineStyle(1, col, 0.45);
    g.lineBetween(0, -12, 0, 0);
    g.lineBetween(-5, -6, 5, -6);
    g.fillStyle(col, 0.5);
    g.fillCircle(0, -6, 1.5);

    // Moss patches
    g.fillStyle(moss, 0.5);
    g.fillEllipse(-10, 14, 8, 3);
    g.fillEllipse(8, 18, 6, 2);
    g.fillEllipse(-6, 20, 5, 2);

    container.add(g);

    // Wraith rising from grave (tall, spectral)
    const ghost = this.add.graphics();
    // outer aura
    ghost.fillStyle(col, 0.12);
    ghost.fillEllipse(0, -26, 38, 42);
    // wraith body (tapered tail)
    ghost.fillStyle(0x0b0614, 0.8);
    ghost.beginPath();
    ghost.moveTo(-11, -36);
    graphicsQuadBezier(ghost, -11, -36, 0, -46, 11, -36);
    ghost.lineTo(13, -22);
    graphicsQuadBezier(ghost, 13, -22, 8, -16, 4, -14);
    ghost.lineTo(-4, -14);
    graphicsQuadBezier(ghost, -4, -14, -8, -16, -13, -22);
    ghost.closePath();
    ghost.fillPath();
    // inner glow
    ghost.fillStyle(col, 0.3);
    ghost.fillEllipse(0, -30, 18, 22);
    // face void
    ghost.fillStyle(0x000000, 0.7);
    ghost.fillEllipse(0, -32, 14, 10);
    // glowing eyes
    ghost.fillStyle(col, 0.95);
    ghost.fillCircle(-4, -33, 1.8);
    ghost.fillCircle(4, -33, 1.8);
    ghost.fillStyle(highlight, 0.7);
    ghost.fillCircle(-4.2, -34, 0.9);
    ghost.fillCircle(3.8, -34, 0.9);
    // trailing wisps
    ghost.lineStyle(1.2, col, 0.35);
    ghost.beginPath();
    ghost.arc(-8, -18, 4, -Math.PI * 0.2, Math.PI * 0.8);
    ghost.strokePath();
    ghost.beginPath();
    ghost.arc(8, -18, 4, Math.PI * 0.2, Math.PI * 1.2);
    ghost.strokePath();
    container.add(ghost);
    entry.ghost = ghost;

    const hpBarBg = this.add.rectangle(0, -42, 38, 5, 0x222222, 0.82);
    const hpBarFill = this.add.rectangle(0, -42, 38, 5, col, 0.9);
    container.add([hpBarBg, hpBarFill]);
    entry.hpBarFill = hpBarFill;

    container.setAlpha(0);
    container.setScale(0.7, 0.4);
    this.tweens.add({
      targets: container,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 420,
      ease: "Back.easeOut"
    });

    entry.overlap = this.physics.add.overlap(this.playerProjectiles, sprite, (first, second) => {
      const hit = this.resolveHitObjects(first, second, "projectile_player");
      if (!hit) return;
      const { projectile } = hit;
      if (!projectile.active || !sprite.isAlive) return;
      if (projectile.ownerPlayer?.soulShroudActive) {
        this.safeDeactivate(projectile);
        return;
      }
      sprite.takeDamage(projectile.damage || 10);
      this.spawnImpactEffect(sprite.x, sprite.y - 12, 0xffe2ff, 12);
      this.safeDeactivate(projectile);
    });

    entry.lastFireAt = this.time.now + 200;
    this.graveWardenSummons.graves.push(entry);
  }

  _destroyGraveWardenHauntedGrave(entry, killed = false) {
    if (!entry || entry._destroyed) return;
    entry._destroyed = true;
    if (entry.overlap) {
      try {
        // Phaser collider destroy can throw if called after physics shutdown or twice.
        if (typeof entry.overlap.destroy === "function") entry.overlap.destroy();
      } catch (e) {
        // ignore
      } finally {
        entry.overlap = null;
      }
    }
    if (entry.sprite?.active) {
      entry.sprite.isAlive = false;
      entry.sprite.destroy(true);
    }
    if (entry.container?.active) {
      const c = entry.container;
      if (killed) {
        const col = entry.col || 0xc084fc;
        const heal = Number.isFinite(entry.tuning?.healOnKill) ? entry.tuning.healOnKill : 20;
        if (heal > 0 && typeof this.spawnHealOrbsToPlayers === "function") {
          this.spawnHealOrbsToPlayers(heal, 0x7dffb6);
        }
        for (let i = 0; i < 8; i += 1) {
          const p = this.add.circle(c.x + Phaser.Math.Between(-14, 14), c.y + Phaser.Math.Between(-26, 18), Phaser.Math.Between(2, 4), col, 0.55);
          p.setDepth(DEPTH.PLAYER_FX);
          if (p.setBlendMode) p.setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: p,
            x: p.x + Phaser.Math.Between(-40, 40),
            y: p.y + Phaser.Math.Between(-30, 30),
            alpha: 0,
            scale: 0.2,
            duration: 320 + i * 25,
            onComplete: () => p.destroy()
          });
        }
      }
      this.tweens.add({
        targets: c,
        alpha: 0,
        scaleY: 0.2,
        duration: 260,
        ease: "Quad.easeIn",
        onComplete: () => c.destroy(true)
      });
    }
  }

  updateGraveWardenHauntedGraves(time) {
    this.graveWardenSummons.graves = (this.graveWardenSummons.graves || []).filter((e) => {
      if (e?._destroyed) return false;
      if (this.gameState !== "battle" || !e?.boss?.active || !e.sprite?.isAlive || time >= e.expiresAt) {
        this._destroyGraveWardenHauntedGrave(e, false);
        return false;
      }
      // sync visuals
      e.container.setPosition(e.sprite.x, e.sprite.y - 18);
      const hpFrac = Math.max(0, e.sprite.health / e.maxHp);
      e.hpBarFill.setScale(hpFrac, 1);
      e.hpBarFill.x = -(38 / 2) * (1 - hpFrac);

      const interval = Number.isFinite(e.tuning?.fireIntervalMs) ? e.tuning.fireIntervalMs : 650;
      if (time - e.lastFireAt >= interval) {
        const alive = (this.players || []).filter((p) => p.isAlive);
        if (alive.length) {
          let best = alive[0];
          let bestDist = Phaser.Math.Distance.Squared(e.sprite.x, e.sprite.y, best.x, best.y);
          for (let i = 1; i < alive.length; i += 1) {
            const d = Phaser.Math.Distance.Squared(e.sprite.x, e.sprite.y, alive[i].x, alive[i].y);
            if (d < bestDist) { bestDist = d; best = alive[i]; }
          }
          const atkR = Number.isFinite(e.tuning?.attackRange) ? e.tuning.attackRange : 780;
          if (bestDist <= atkR * atkR) {
            e.lastFireAt = time;
            const sx = e.sprite.x;
            const sy = e.sprite.y - 22;
            const tx = best.x;
            const ty = best.y - 12;
            const dx = tx - sx;
            const dy = ty - sy;
            const len = Math.hypot(dx, dy) || 1;
            const spd = Number.isFinite(e.tuning?.projectileSpeed) ? e.tuning.projectileSpeed : 340;
            const maxRange = Number.isFinite(e.tuning?.projectileMaxRange) ? e.tuning.projectileMaxRange : 820;
            const dmg = Number.isFinite(e.tuning?.boneDamage) ? e.tuning.boneDamage : 9;
            const bx = (dx / len) * spd;
            const by = (dy / len) * spd;
            const boss = e.boss;
            const col = e.col || 0xc084fc;
            this.spawnBossProjectile(sx, sy, dx >= 0 ? 1 : -1, dmg, {
              useAbsoluteVelocity: true,
              velocityX: bx,
              velocityY: by,
              spawnOffsetX: 0,
              maxRange,
              effectColor: col,
              textureKey: this.textures.exists("proj_bone_shard") ? "proj_bone_shard" : "projectile_boss",
              skipMuzzleFlash: true,
              noBossTrail: true,
              scaleX: 0.95,
              scaleY: 0.95,
              projectileTag: "wardenBone"
            });
            // small cast flash
            const flash = this.add.circle(sx, sy, 5, col, 0.5);
            flash.setDepth(DEPTH.PLAYER_FX);
            if (flash.setBlendMode) flash.setBlendMode(Phaser.BlendModes.ADD);
            this.tweens.add({ targets: flash, scale: 2.2, alpha: 0, duration: 200, onComplete: () => flash.destroy() });
          }
        }
      }
      return true;
    });
  }

  registerGraveWardenPhantomSwarm(boss, tuning, col, targets) {
    if (this.gameState !== "battle" || !boss?.active) return;
    const count = Number.isFinite(tuning?.phantomCount) ? Math.max(1, Math.round(tuning.phantomCount)) : 3;
    const dur = Number.isFinite(tuning?.phantomDuration) ? Math.max(600, tuning.phantomDuration) : 6500;
    const speed = Number.isFinite(tuning?.phantomSpeed) ? tuning.phantomSpeed : 130;
    const dmg = Number.isFinite(tuning?.phantomDamage) ? tuning.phantomDamage : 14;
    const radius = Number.isFinite(tuning?.phantomRadius) ? tuning.phantomRadius : 36;
    const hm = this.bossOutgoingDamageMult ?? 1;
    const phantomDmg = Math.max(1, Math.round(dmg * hm));

    for (let i = 0; i < count; i += 1) {
      const ang = (i / count) * Math.PI * 2;
      const sx = boss.x + Math.cos(ang) * 46;
      const sy = boss.y - 18 + Math.sin(ang) * 20;
      const sprite = this.physics.add.sprite(sx, sy, "pixel").setScale(1).setAlpha(0);
      sprite.body.setSize(26, 26);
      sprite.body.allowGravity = false;
      sprite.setDepth(DEPTH.PLAYER);
      sprite.isAlive = true;
      sprite.isGraveWardenPhantom = true;
      sprite.health = 1;
      sprite.maxHealth = 1;
      sprite.movementLockType = null;
      sprite.movementLockUntil = 0;
      sprite.invulnerableUntil = 0;
      sprite.bossContactGraceUntil = 99999999;
      const container = this.add.container(sx, sy);
      container.setDepth(DEPTH.PLAYER_FX);

      const g = this.add.graphics();
      const deep = 0x0f0516;
      const hi = 0xffe6f7;

      // Outer haunt aura (soft glow)
      g.fillStyle(col, 0.1);
      g.fillEllipse(0, 2, 38, 28);

      // Tattered trailing tail (ghostly robe)
      g.fillStyle(deep, 0.55);
      g.beginPath();
      g.moveTo(-11, 0);
      g.lineTo(-13, 10);
      g.lineTo(-8, 8);
      g.lineTo(-4, 14);
      g.lineTo(0, 8);
      g.lineTo(4, 14);
      g.lineTo(8, 8);
      g.lineTo(13, 10);
      g.lineTo(11, 0);
      g.closePath();
      g.fillPath();
      g.fillStyle(col, 0.25);
      g.fillRect(-10, 2, 20, 6);

      // Main wraith body (tapered skull-shape)
      g.fillStyle(deep, 0.85);
      g.beginPath();
      g.moveTo(-10, -2);
      graphicsQuadBezier(g, -10, -2, -11, -14, 0, -16);
      graphicsQuadBezier(g, 0, -16, 11, -14, 10, -2);
      g.lineTo(8, 4);
      g.lineTo(-8, 4);
      g.closePath();
      g.fillPath();

      // Inner spectral glow
      g.fillStyle(col, 0.4);
      g.fillEllipse(0, -6, 16, 14);
      g.fillStyle(col, 0.6);
      g.fillEllipse(0, -7, 10, 8);

      // Face void
      g.fillStyle(0x000000, 0.7);
      g.fillEllipse(0, -6, 12, 7);

      // Glowing eyes (burning)
      g.fillStyle(col, 0.95);
      g.fillCircle(-3.5, -7, 1.8);
      g.fillCircle(3.5, -7, 1.8);
      g.fillStyle(hi, 0.7);
      g.fillCircle(-3.5, -8, 0.9);
      g.fillCircle(3.5, -8, 0.9);

      // Jagged spectral teeth
      g.fillStyle(hi, 0.3);
      g.fillTriangle(-4, -3, -2, -3, -3, -1);
      g.fillTriangle(-1, -3, 1, -3, 0, -0.5);
      g.fillTriangle(2, -3, 4, -3, 3, -1);

      // Clawed wisp arms
      g.lineStyle(1.5, col, 0.5);
      g.beginPath();
      g.moveTo(-10, -2);
      g.lineTo(-16, 2);
      g.lineTo(-18, -2);
      g.strokePath();
      g.beginPath();
      g.moveTo(10, -2);
      g.lineTo(16, 2);
      g.lineTo(18, -2);
      g.strokePath();

      // Cracked halo above head
      g.lineStyle(1, col, 0.45);
      g.beginPath();
      g.arc(0, -16, 7, -Math.PI * 0.95, -Math.PI * 0.05);
      g.strokePath();
      g.fillStyle(col, 0.5);
      g.fillCircle(-6, -15, 0.8);
      g.fillCircle(6, -15, 0.8);
      container.add(g);

      const entry = {
        boss,
        sprite,
        container,
        createdAt: this.time.now,
        expiresAt: this.time.now + dur,
        speed,
        radius,
        phantomDmg,
        col
      };

      // One-hit phantom: any damage pops it.
      sprite.takeDamage = (amount) => {
        const dmgTaken = Number.isFinite(amount) ? Math.max(1, amount) : 1;
        sprite.health = Math.max(0, sprite.health - dmgTaken);
        if (sprite.health <= 0) {
          sprite.isAlive = false;
          this._destroyGraveWardenPhantom(entry, true);
        }
      };

      entry.overlap = this.physics.add.overlap(this.playerProjectiles, sprite, (first, second) => {
        const hit = this.resolveHitObjects(first, second, "projectile_player");
        if (!hit) return;
        const { projectile } = hit;
        if (!projectile.active || !sprite.isAlive) return;
        if (projectile.ownerPlayer?.soulShroudActive) {
          this.safeDeactivate(projectile);
          return;
        }
        sprite.isAlive = false;
        this.safeDeactivate(projectile);
        this._destroyGraveWardenPhantom(entry, true);
      });
      this.graveWardenSummons.phantoms.push(entry);
    }
  }

  _destroyGraveWardenPhantom(entry, popped = false) {
    if (!entry || entry._destroyed) return;
    entry._destroyed = true;
    if (entry.overlap) {
      try {
        if (typeof entry.overlap.destroy === "function") entry.overlap.destroy();
      } catch (e) {
        // ignore
      } finally {
        entry.overlap = null;
      }
    }
    if (entry.sprite?.active) {
      entry.sprite.isAlive = false;
      entry.sprite.destroy(true);
    }
    if (entry.container?.active) {
      const c = entry.container;
      const col = entry.col || 0xc084fc;
      if (popped) {
        const burst = this.add.circle(c.x, c.y - 6, 8, col, 0.55);
        burst.setDepth(DEPTH.PLAYER_FX);
        if (burst.setBlendMode) burst.setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: burst, scale: 3.2, alpha: 0, duration: 240, onComplete: () => burst.destroy() });
      }
      this.tweens.add({ targets: c, alpha: 0, scale: 0.2, duration: 200, onComplete: () => c.destroy(true) });
    }
  }

  updateGraveWardenPhantoms(time) {
    this.graveWardenSummons.phantoms = (this.graveWardenSummons.phantoms || []).filter((e) => {
      if (e?._destroyed) return false;
      if (this.gameState !== "battle" || !e?.boss?.active || !e.sprite?.isAlive || time >= e.expiresAt) {
        this._destroyGraveWardenPhantom(e, false);
        return false;
      }
      const alive = (this.players || []).filter((p) => p.isAlive);
      if (!alive.length) return true;
      let best = alive[0];
      let bestDist = Phaser.Math.Distance.Squared(e.sprite.x, e.sprite.y, best.x, best.y);
      for (let i = 1; i < alive.length; i += 1) {
        const d = Phaser.Math.Distance.Squared(e.sprite.x, e.sprite.y, alive[i].x, alive[i].y);
        if (d < bestDist) { bestDist = d; best = alive[i]; }
      }
      const dx = best.x - e.sprite.x;
      const dy = (best.y - 10) - e.sprite.y;
      const len = Math.hypot(dx, dy) || 1;
      e.sprite.x += (dx / len) * e.speed * 0.016;
      e.sprite.y += (dy / len) * e.speed * 0.016;
      e.container.setPosition(e.sprite.x, e.sprite.y);
      e.container.scaleX = dx >= 0 ? 1 : -1;
      const dist = Math.hypot(dx, dy);
      if (dist < e.radius * 0.7) {
        // explode on contact (and die)
        e.sprite.isAlive = false;
        (this.players || []).forEach((p) => {
          if (!p.isAlive) return;
          const dd = Math.hypot(p.x - e.sprite.x, p.y - e.sprite.y);
          if (dd < e.radius) {
            e.boss.hitPlayer(p, e.phantomDmg, e.col, "melee");
            this.spawnImpactEffect(p.x, p.y - 10, e.col, 14);
          }
        });
        this._destroyGraveWardenPhantom(e, true);
        return false;
      }
      return true;
    });
  }

  registerGraveWardenBoneBrute(boss, target, tuning, col) {
    if (this.gameState !== "battle" || !boss?.active) return;
    // Remove any existing brute (only one at a time).
    this.graveWardenSummons.brutes = (this.graveWardenSummons.brutes || []).filter((e) => {
      this._destroyGraveWardenBoneBrute(e, false);
      return false;
    });

    const maxHp = Number.isFinite(tuning?.summonHp) ? Math.max(1, Math.round(tuning.summonHp)) : 170;
    const leash = Number.isFinite(tuning?.leashRadius) ? tuning.leashRadius : 280;
    const entry = { boss, tuning, col, maxHp, leashRadius: leash, lastSlamAt: 0, slamTelegraph: null };

    const sx = boss.x + (boss.flipX ? -1 : 1) * 70;
    const sy = boss.y + 18;
    const sprite = this.physics.add.sprite(sx, sy, "pixel").setScale(1).setAlpha(0);
    sprite.body.setSize(64, 58);
    sprite.body.allowGravity = true;
    sprite.body.setCollideWorldBounds(true);
    this.physics.add.collider(sprite, this.platforms);
    sprite.setDepth(DEPTH.BOSS);
    sprite.isAlive = true;
    sprite.isGraveWardenBrute = true;
    sprite.health = maxHp;
    sprite.maxHealth = maxHp;
    sprite.movementLockType = null;
    sprite.movementLockUntil = 0;
    sprite.invulnerableUntil = 0;
    sprite.bossContactGraceUntil = 99999999;
    sprite.takeDamage = (amount) => {
      const dmg = Number.isFinite(amount) ? Math.max(1, amount) : 1;
      sprite.health = Math.max(0, sprite.health - dmg);
      if (sprite.health <= 0) {
        sprite.isAlive = false;
        this._destroyGraveWardenBoneBrute(entry, true);
      }
    };
    entry.sprite = sprite;

    const container = this.add.container(sx, sy);
    container.setDepth(DEPTH.BOSS + 1);
    entry.container = container;

    const g = this.add.graphics();
    const deep = 0x0f0516;
    const bone = 0xe8e0d5;
    const boneShadow = 0x8a7e75;
    const sinew = 0x3a1230;
    const glow = col;

    // Ground shadow (big and menacing)
    g.fillStyle(deep, 0.8);
    g.fillEllipse(0, 34, 92, 22);
    g.fillStyle(glow, 0.08);
    g.fillEllipse(0, 34, 70, 14);

    // Hunched hulking silhouette (torso tapers down)
    g.fillStyle(sinew, 1);
    g.beginPath();
    g.moveTo(-34, -12);
    g.lineTo(-28, -22);
    g.lineTo(28, -22);
    g.lineTo(34, -12);
    g.lineTo(30, 28);
    g.lineTo(-30, 28);
    g.closePath();
    g.fillPath();

    // Spinal ridge down the middle
    g.fillStyle(bone, 0.85);
    for (let v = 0; v < 6; v += 1) {
      const y = -16 + v * 8;
      g.fillRoundedRect(-3, y, 6, 5, 1);
      g.fillStyle(boneShadow, 0.5);
      g.fillRect(-2, y + 3, 4, 1);
      g.fillStyle(bone, 0.85);
    }

    // Ribcage (wrapping around torso)
    g.lineStyle(2.5, bone, 0.85);
    for (let i = 0; i < 5; i += 1) {
      const ry = -14 + i * 7;
      g.beginPath();
      g.arc(0, ry, 22 - i, Math.PI * 1.1, Math.PI * 1.9);
      g.strokePath();
      g.beginPath();
      g.arc(0, ry, 22 - i, -Math.PI * 0.1, -Math.PI * 0.9, true);
      g.strokePath();
    }
    // Sternum plate
    g.fillStyle(bone, 0.95);
    g.fillRoundedRect(-4, -18, 8, 34, 2);
    g.fillStyle(boneShadow, 0.4);
    g.fillRect(-3, -14, 6, 1);
    g.fillRect(-3, -6, 6, 1);
    g.fillRect(-3, 2, 6, 1);
    g.fillRect(-3, 10, 6, 1);

    // Bulky bone shoulders (armor-like)
    g.fillStyle(bone, 0.95);
    g.fillEllipse(-30, -16, 20, 14);
    g.fillEllipse(30, -16, 20, 14);
    g.fillStyle(boneShadow, 0.55);
    g.fillEllipse(-30, -13, 16, 8);
    g.fillEllipse(30, -13, 16, 8);
    // shoulder spikes
    g.fillStyle(bone, 0.9);
    g.fillTriangle(-36, -18, -32, -26, -28, -18);
    g.fillTriangle(-24, -18, -20, -26, -16, -18);
    g.fillTriangle(36, -18, 32, -26, 28, -18);
    g.fillTriangle(24, -18, 20, -26, 16, -18);

    // Arms (big bone clubs hanging at sides)
    g.fillStyle(bone, 0.9);
    g.fillRoundedRect(-40, -10, 10, 26, 3);
    g.fillRoundedRect(30, -10, 10, 26, 3);
    g.fillStyle(boneShadow, 0.5);
    g.fillRect(-38, -8, 6, 22);
    g.fillRect(32, -8, 6, 22);
    // Fists / knuckle bones
    g.fillStyle(bone, 1);
    g.fillCircle(-35, 20, 7);
    g.fillCircle(35, 20, 7);
    g.fillStyle(boneShadow, 0.45);
    g.fillCircle(-35, 22, 5);
    g.fillCircle(35, 22, 5);
    // knuckle studs
    g.fillStyle(bone, 0.9);
    g.fillCircle(-38, 17, 1.5);
    g.fillCircle(-35, 15, 1.5);
    g.fillCircle(-32, 17, 1.5);
    g.fillCircle(38, 17, 1.5);
    g.fillCircle(35, 15, 1.5);
    g.fillCircle(32, 17, 1.5);

    // Massive skull head
    g.fillStyle(bone, 1);
    g.fillEllipse(0, -24, 26, 22);
    g.fillStyle(boneShadow, 0.4);
    g.fillEllipse(0, -18, 22, 10);
    // cranium highlight
    g.fillStyle(0xffffff, 0.25);
    g.fillEllipse(-4, -30, 10, 5);
    // Horned/jagged crown
    g.fillStyle(bone, 0.9);
    g.fillTriangle(-14, -28, -11, -38, -8, -28);
    g.fillTriangle(-5, -30, -2, -42, 1, -30);
    g.fillTriangle(4, -30, 7, -40, 10, -30);
    g.fillTriangle(11, -28, 14, -36, 17, -28);

    // Eye sockets (glowing)
    g.fillStyle(0x000000, 1);
    g.fillEllipse(-6, -24, 7, 6);
    g.fillEllipse(6, -24, 7, 6);
    g.fillStyle(glow, 0.95);
    g.fillCircle(-6, -24, 2.4);
    g.fillCircle(6, -24, 2.4);
    g.fillStyle(0xffffff, 0.7);
    g.fillCircle(-6, -25, 1);
    g.fillCircle(6, -25, 1);
    // Eye glow trails down face
    g.fillStyle(glow, 0.3);
    g.fillEllipse(-6, -20, 4, 4);
    g.fillEllipse(6, -20, 4, 4);

    // Nasal cavity
    g.fillStyle(0x000000, 0.95);
    g.fillTriangle(-2, -18, 2, -18, 0, -14);

    // Jaw with teeth
    g.fillStyle(bone, 0.95);
    g.fillRoundedRect(-10, -14, 20, 8, 2);
    g.fillStyle(0x000000, 0.85);
    for (let t = 0; t < 7; t += 1) {
      g.fillRect(-9 + t * 3, -12, 2, 4);
    }

    // Chains hanging from shoulders (broken, tethers)
    g.lineStyle(2, boneShadow, 0.55);
    for (let ch = 0; ch < 3; ch += 1) {
      const cy = -14 + ch * 6;
      g.strokeCircle(-42, cy, 1.8);
      g.strokeCircle(42, cy, 1.8);
    }

    // Soul wisp leaking from chest
    g.fillStyle(glow, 0.4);
    g.fillCircle(0, -2, 4);
    g.fillStyle(glow, 0.7);
    g.fillCircle(0, -2, 2);
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(0, -3, 1);
    container.add(g);

    const hpBarBg = this.add.rectangle(0, -44, 64, 6, 0x222222, 0.82);
    const hpBarFill = this.add.rectangle(0, -44, 64, 6, col, 0.9);
    container.add([hpBarBg, hpBarFill]);
    entry.hpBarFill = hpBarFill;

    container.setAlpha(0);
    container.setScale(0.7, 0.55);
    this.tweens.add({
      targets: container,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 520,
      ease: "Back.easeOut"
    });

    entry.overlap = this.physics.add.overlap(this.playerProjectiles, sprite, (first, second) => {
      const hit = this.resolveHitObjects(first, second, "projectile_player");
      if (!hit) return;
      const { projectile } = hit;
      if (!projectile.active || !sprite.isAlive) return;
      if (projectile.ownerPlayer?.soulShroudActive) {
        this.safeDeactivate(projectile);
        return;
      }
      sprite.takeDamage(projectile.damage || 10);
      this.spawnImpactEffect(sprite.x, sprite.y - 16, 0xffe2ff, 14);
      this.safeDeactivate(projectile);
    });

    // Visible leash chain between boss and brute (drawn in world-space each frame).
    const leashGfx = this.add.graphics();
    leashGfx.setDepth(DEPTH.BOSS - 1);
    if (leashGfx.setBlendMode) leashGfx.setBlendMode(Phaser.BlendModes.NORMAL);
    entry.leashGfx = leashGfx;

    this.graveWardenSummons.brutes.push(entry);
  }

  /** Render the taut chain/leash between a Grave Warden and her bone brute summon. */
  drawGraveWardenBruteLeash(entry) {
    const g = entry?.leashGfx;
    const boss = entry?.boss;
    const s = entry?.sprite;
    if (!g?.active || !boss?.active || !s?.isAlive) return;
    g.clear();

    const sx = boss.x + (boss.flipX ? 10 : -10);
    const sy = boss.y + 6;
    const ex = s.x;
    const ey = s.y - 10;
    const dx = ex - sx;
    const dy = ey - sy;
    const dist = Math.hypot(dx, dy) || 1;
    const leashR = entry.leashRadius || 280;
    const col = entry.col || 0xc084fc;

    // Strain factor — chain turns red/vibrates near the leash limit.
    const strain = Phaser.Math.Clamp(dist / leashR, 0, 1);
    const hot = 0xff4466;

    // Sag: catenary-like droop scales with slack (less sag when near limit).
    const slack = 1 - strain;
    const maxSag = 18 * slack;
    // Perpendicular-down vector for sag in 2D (mostly straight-down).
    const midX = (sx + ex) * 0.5;
    const midY = (sy + ey) * 0.5 + maxSag;

    // Jitter when close to snapping, to sell "taut".
    const jitter = strain > 0.75 ? (strain - 0.75) * 6 : 0;
    const jx = jitter ? Phaser.Math.FloatBetween(-jitter, jitter) : 0;
    const jy = jitter ? Phaser.Math.FloatBetween(-jitter * 0.5, jitter * 0.5) : 0;

    // Approximate the curve with 16 segments.
    const segs = 16;
    const pts = [];
    for (let i = 0; i <= segs; i += 1) {
      const t = i / segs;
      const oneMt = 1 - t;
      const px = oneMt * oneMt * sx + 2 * oneMt * t * (midX + jx) + t * t * ex;
      const py = oneMt * oneMt * sy + 2 * oneMt * t * (midY + jy) + t * t * ey;
      pts.push([px, py]);
    }

    // Outer dark shadow (readable on any background).
    g.lineStyle(5, 0x0a0510, 0.55);
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i += 1) g.lineTo(pts[i][0], pts[i][1]);
    g.strokePath();

    // Main rope/chain inner line.
    const baseCol = Phaser.Display.Color.IntegerToColor(col);
    const warnCol = Phaser.Display.Color.IntegerToColor(hot);
    const blended = Phaser.Display.Color.Interpolate.ColorWithColor(baseCol, warnCol, 100, Math.round(strain * 100));
    const chainCol = Phaser.Display.Color.GetColor(blended.r, blended.g, blended.b);
    g.lineStyle(3, chainCol, 0.9);
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i += 1) g.lineTo(pts[i][0], pts[i][1]);
    g.strokePath();

    // Chain links — alternating ellipses along the curve, rotated to tangent.
    const linkEvery = 2; // draw a link every N segments
    for (let i = 1; i < pts.length; i += linkEvery) {
      const [px, py] = pts[i];
      const [ppx, ppy] = pts[i - 1];
      const angle = Math.atan2(py - ppy, px - ppx);
      g.save?.();
      // Fallback: emulate rotated ellipse by drawing a short oriented rectangle.
      const linkLen = 6;
      const linkW = 3.2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const corners = [
        [-linkLen / 2, -linkW / 2],
        [linkLen / 2, -linkW / 2],
        [linkLen / 2, linkW / 2],
        [-linkLen / 2, linkW / 2]
      ].map(([x, y]) => [px + x * cos - y * sin, py + x * sin + y * cos]);
      const alt = (i % (linkEvery * 2) === 0);
      g.fillStyle(alt ? 0xe8d8cc : 0x8a7a80, 0.95);
      g.beginPath();
      g.moveTo(corners[0][0], corners[0][1]);
      g.lineTo(corners[1][0], corners[1][1]);
      g.lineTo(corners[2][0], corners[2][1]);
      g.lineTo(corners[3][0], corners[3][1]);
      g.closePath();
      g.fillPath();
      g.restore?.();
    }

    // Glowing anchor orbs on both ends.
    g.fillStyle(col, 0.45);
    g.fillCircle(sx, sy, 7);
    g.fillStyle(chainCol, 0.9);
    g.fillCircle(sx, sy, 3);
    g.fillStyle(col, 0.4);
    g.fillCircle(ex, ey, 6);
    g.fillStyle(chainCol, 0.9);
    g.fillCircle(ex, ey, 2.5);

    // Strain sparks near the chain when close to the limit.
    if (strain > 0.78 && Math.random() < 0.35) {
      const idx = Phaser.Math.Between(2, pts.length - 3);
      const [px, py] = pts[idx];
      const spark = this.add.circle(px + Phaser.Math.Between(-4, 4), py + Phaser.Math.Between(-4, 4), 2, hot, 0.9);
      spark.setDepth(DEPTH.BOSS - 1);
      if (spark.setBlendMode) spark.setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: spark,
        alpha: 0,
        scale: 0.2,
        duration: 220,
        onComplete: () => spark.destroy()
      });
    }
  }

  _destroyGraveWardenBoneBrute(entry, killed = false) {
    if (!entry || entry._destroyed) return;
    entry._destroyed = true;
    if (entry.overlap) {
      try {
        if (typeof entry.overlap.destroy === "function") entry.overlap.destroy();
      } catch (e) {
        // ignore
      } finally {
        entry.overlap = null;
      }
    }
    if (entry.slamTelegraph?.destroy) entry.slamTelegraph.destroy();
    if (entry.leashGfx?.active) {
      const g = entry.leashGfx;
      this.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() });
      entry.leashGfx = null;
    }
    if (entry.sprite?.active) {
      entry.sprite.isAlive = false;
      entry.sprite.destroy(true);
    }
    if (entry.container?.active) {
      const c = entry.container;
      const col = entry.col || 0xc084fc;
      if (killed) {
        for (let i = 0; i < 14; i += 1) {
          const p = this.add.circle(c.x + Phaser.Math.Between(-28, 28), c.y + Phaser.Math.Between(-22, 22), Phaser.Math.Between(2, 5), col, 0.55);
          p.setDepth(DEPTH.PLAYER_FX);
          if (p.setBlendMode) p.setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: p,
            x: p.x + Phaser.Math.Between(-70, 70),
            y: p.y + Phaser.Math.Between(-55, 55),
            alpha: 0,
            scale: 0.2,
            duration: 340 + i * 18,
            onComplete: () => p.destroy()
          });
        }
        const heal = Number.isFinite(entry.tuning?.healOnKill) ? entry.tuning.healOnKill : 40;
        this.spawnHealOrbsToPlayers(heal, col);
      }
      this.tweens.add({
        targets: c,
        alpha: 0,
        scaleY: 0.2,
        duration: 280,
        ease: "Quad.easeIn",
        onComplete: () => c.destroy(true)
      });
    }
  }

  spawnHealOrbsToPlayers(healAmount = 40, color = 0x7dffb6) {
    const amount = Number.isFinite(healAmount) ? Math.max(1, Math.round(healAmount)) : 40;
    const alive = (this.players || []).filter((p) => p.isAlive);
    if (!alive.length) return;
    alive.forEach((p, idx) => {
      const sx = (this.boss?.x ?? p.x) + Phaser.Math.Between(-18, 18);
      const sy = (this.boss?.y ?? p.y) - 20 + Phaser.Math.Between(-10, 10);
      const orb = this.add.circle(sx, sy, 5, color, 0.7);
      orb.setDepth(DEPTH.PLAYER_FX);
      if (orb.setBlendMode) orb.setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: orb,
        x: p.x,
        y: p.y - 18,
        scale: 0.6,
        alpha: 0,
        duration: 360 + idx * 35,
        ease: "Sine.easeIn",
        onComplete: () => {
          orb.destroy();
          if (this.gameState !== "battle" || !p?.isAlive) return;
          const before = p.health;
          p.health = Math.min(p.maxHealth, p.health + amount);
          if (p.health > before) {
            p.flash?.(0x7dffb6);
            this.spawnHealMarker(p.x, p.y - 20, 0x7dffb6);
            this.spawnImpactEffect(p.x, p.y - 12, 0x7dffb6, 14);
          }
        }
      });
    });
  }

  updateGraveWardenBoneBrutes(time) {
    this.graveWardenSummons.brutes = (this.graveWardenSummons.brutes || []).filter((e) => {
      if (e?._destroyed) return false;
      if (this.gameState !== "battle" || !e?.boss?.active || !e.sprite?.isAlive) {
        this._destroyGraveWardenBoneBrute(e, false);
        return false;
      }
      const boss = e.boss;
      const s = e.sprite;
      const alive = (this.players || []).filter((p) => p.isAlive);
      if (alive.length) {
        let best = alive[0];
        let bestDist = Phaser.Math.Distance.Squared(s.x, s.y, best.x, best.y);
        for (let i = 1; i < alive.length; i += 1) {
          const d = Phaser.Math.Distance.Squared(s.x, s.y, alive[i].x, alive[i].y);
          if (d < bestDist) { bestDist = d; best = alive[i]; }
        }
        // leash: pull back toward boss if too far
        const leash = e.leashRadius || 280;
        const toBossX = boss.x - s.x;
        const distToBoss = Math.abs(toBossX);
        const desiredDir = best.x >= s.x ? 1 : -1;
        const speed = distToBoss > leash ? desiredDir * 0.2 + Math.sign(toBossX) * 0.8 : desiredDir;
        const run = 130;
        s.setVelocityX(Phaser.Math.Clamp(speed, -1, 1) * run);
        s.flipX = s.body.velocity.x < 0;

        // slam when close
        const slamCd = Number.isFinite(e.tuning?.slamCooldownMs) ? e.tuning.slamCooldownMs : 1250;
        const slamWindup = Number.isFinite(e.tuning?.slamWindupMs) ? e.tuning.slamWindupMs : 500;
        const r = Number.isFinite(e.tuning?.slamRadius) ? e.tuning.slamRadius : 96;
        if (time - (e.lastSlamAt || 0) >= slamCd) {
          const d = Math.hypot(best.x - s.x, (best.y - 10) - s.y);
          if (d <= r * 1.35 && s.body?.blocked?.down) {
            e.lastSlamAt = time;
            const cx = s.x;
            const cy = s.y + 16;
            const circle = this.createCircleHitbox(cx, cy, r);
            this.spawnWindupCircle(circle, e.col || 0xc084fc, slamWindup);
            this.time.delayedCall(slamWindup, () => {
              if (this.gameState !== "battle" || !s.isAlive) return;
              const hit = this.createCircleHitbox(cx, cy, r);
              this.playCircleAttackVisual(hit, e.col || 0xc084fc, { durationMs: 140 });
              const dmg = Number.isFinite(e.tuning?.summonDamage) ? e.tuning.summonDamage : 34;
              alive.forEach((p) => {
                if (!p.isAlive) return;
                if (this.circleHitsTarget(hit, p)) {
                  if (boss.hitPlayer(p, dmg, e.col || 0xc084fc, "melee") > 0) {
                    this.spawnImpactEffect(p.x, p.y - 10, e.col || 0xc084fc, 18);
                  }
                }
              });
            });
          }
        }
      }

      // sync visuals + hp bar
      e.container.setPosition(s.x, s.y);
      const hpFrac = Math.max(0, s.health / e.maxHp);
      e.hpBarFill.setScale(hpFrac, 1);
      e.hpBarFill.x = -(64 / 2) * (1 - hpFrac);

      // Draw the visible leash chain from boss to brute.
      this.drawGraveWardenBruteLeash(e);
      return true;
    });
  }

  /** Grave Warden windup: orbital bones converging at a marked landing spot for the Bone Brute summon. */
  spawnGraveWardenBruteWindup(boss, landX, groundY, col, durationMs) {
    if (!boss?.active || this.isTrueHitboxView?.()) return;
    const dur = Math.max(200, durationMs || 800);
    const bone = 0xe8e0d5;

    // Ground landing marker — glowing skull rune
    const marker = this.add.container(landX, groundY - 4);
    marker.setDepth(DEPTH.BOSS_TELEGRAPH);
    const ring = this.add.graphics();
    ring.lineStyle(3, col, 0.5);
    ring.strokeCircle(0, 0, 42);
    ring.lineStyle(1.5, bone, 0.55);
    ring.strokeCircle(0, 0, 32);
    // cross/skull marks
    ring.fillStyle(bone, 0.35);
    ring.fillCircle(-26, 0, 3);
    ring.fillCircle(26, 0, 3);
    ring.fillCircle(0, -26, 3);
    ring.fillCircle(0, 26, 3);
    ring.lineStyle(1.5, col, 0.4);
    ring.lineBetween(-30, 0, 30, 0);
    ring.lineBetween(0, -30, 0, 30);
    marker.add(ring);
    marker.setScale(0.4);
    marker.setAlpha(0);
    this.tweens.add({ targets: marker, scale: 1, alpha: 0.9, duration: dur * 0.35, ease: "Sine.easeOut" });
    this.tweens.add({ targets: ring, angle: 360, duration: dur, ease: "Linear" });

    // Orbital bones spiraling inward toward landing spot
    const boneCount = 6;
    const bones = [];
    for (let i = 0; i < boneCount; i += 1) {
      const b = this.add.graphics();
      b.fillStyle(bone, 0.85);
      b.fillRoundedRect(-6, -1.5, 12, 3, 1);
      b.fillStyle(0x8a7e75, 0.45);
      b.fillCircle(-6, 0, 1.8);
      b.fillCircle(6, 0, 1.8);
      b.setDepth(DEPTH.BOSS_TELEGRAPH + 1);
      const startAng = (i / boneCount) * Math.PI * 2;
      const startR = 90;
      b.x = landX + Math.cos(startAng) * startR;
      b.y = (groundY - 30) + Math.sin(startAng) * startR * 0.55;
      b.rotation = startAng + Math.PI * 0.5;
      bones.push(b);
      this.tweens.add({
        targets: b,
        x: landX,
        y: groundY - 20,
        rotation: b.rotation + Math.PI * 2.5,
        alpha: { from: 0.9, to: 0.2 },
        duration: dur * 0.95,
        delay: i * 30,
        ease: "Cubic.easeIn",
        onComplete: () => b.destroy()
      });
    }

    // Soul smoke rising from the landing spot
    for (let s = 0; s < 5; s += 1) {
      const smoke = this.add.circle(
        landX + Phaser.Math.Between(-16, 16),
        groundY - 4,
        Phaser.Math.Between(4, 7),
        col, 0.35
      );
      smoke.setDepth(DEPTH.BOSS_TELEGRAPH);
      if (smoke.setBlendMode) smoke.setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: smoke,
        y: smoke.y - Phaser.Math.Between(22, 40),
        alpha: 0,
        scale: { from: 0.6, to: 1.8 },
        duration: dur * 0.9,
        delay: s * 80,
        onComplete: () => smoke.destroy()
      });
    }

    // Boss cast flash — glowing red/pink aura, signals "brute"
    this.spawnAuraPulse(boss.x, boss.y - 12, col, 46, dur);
    this.spawnAuraPulse(boss.x, boss.y - 12, 0xff88d0, 22, dur);

    this.time.delayedCall(dur, () => {
      if (marker?.active) this.tweens.add({ targets: marker, alpha: 0, duration: 160, onComplete: () => marker.destroy() });
    });
  }

  /** Grave Warden windup: ground splits open at summon location, skeletal hand + dirt chunks rise. */
  spawnGraveWardenGraveWindup(boss, landX, groundY, col, durationMs) {
    if (this.isTrueHitboxView?.()) return;
    const dur = Math.max(200, durationMs || 800);
    const dirt = 0x2a1020;
    const stone = 0x3b2a54;
    const bone = 0xe8e0d5;

    // Ground crack (elongated) at spawn point
    const crack = this.add.container(landX, groundY - 2);
    crack.setDepth(DEPTH.BOSS_TELEGRAPH);
    const gfx = this.add.graphics();
    gfx.fillStyle(dirt, 0.85);
    gfx.fillEllipse(0, 2, 50, 8);
    gfx.lineStyle(2, col, 0.65);
    gfx.beginPath();
    gfx.moveTo(-24, 0); gfx.lineTo(-14, -3); gfx.lineTo(-4, 1); gfx.lineTo(6, -3); gfx.lineTo(14, 1); gfx.lineTo(24, -2);
    gfx.strokePath();
    // side fissures
    gfx.lineStyle(1.2, col, 0.45);
    gfx.lineBetween(-14, -3, -18, -8);
    gfx.lineBetween(6, -3, 10, -9);
    gfx.lineBetween(-4, 1, -2, 6);
    gfx.lineBetween(14, 1, 18, 6);
    // inner glow (opens up)
    gfx.fillStyle(col, 0.35);
    gfx.fillEllipse(0, 0, 30, 4);
    crack.add(gfx);
    crack.setScale(0.3, 1);
    this.tweens.add({ targets: crack, scaleX: 1.1, duration: dur * 0.6, ease: "Cubic.easeOut" });

    // Rising tombstone silhouette
    const tomb = this.add.graphics();
    tomb.fillStyle(stone, 0.95);
    tomb.fillRoundedRect(-10, -18, 20, 24, 3);
    tomb.beginPath();
    tomb.arc(0, -18, 10, Math.PI, 0, false);
    tomb.fillPath();
    tomb.lineStyle(1.2, col, 0.55);
    tomb.strokeRoundedRect(-10, -18, 20, 24, 3);
    tomb.lineStyle(1, col, 0.5);
    tomb.lineBetween(-4, -14, 4, -14);
    tomb.lineBetween(0, -18, 0, -8);
    tomb.x = landX;
    tomb.y = groundY + 20;
    tomb.setAlpha(0);
    tomb.setDepth(DEPTH.BOSS_TELEGRAPH);
    this.tweens.add({
      targets: tomb,
      y: groundY - 8,
      alpha: 0.75,
      duration: dur * 0.85,
      ease: "Back.easeOut"
    });

    // Skeletal fingers clawing up from crack
    for (let f = 0; f < 3; f += 1) {
      const finger = this.add.graphics();
      finger.lineStyle(1.8, bone, 0.9);
      finger.lineBetween(0, 0, 0, -12);
      finger.fillStyle(bone, 0.85);
      finger.fillCircle(0, -12, 1.5);
      finger.fillRoundedRect(-1, -4, 2, 3, 0.5);
      finger.x = landX + (f - 1) * 7;
      finger.y = groundY;
      finger.setAlpha(0);
      finger.setScale(1, 0.3);
      finger.setDepth(DEPTH.BOSS_TELEGRAPH + 1);
      this.tweens.add({
        targets: finger,
        alpha: 0.9,
        scaleY: 1,
        y: groundY - 2,
        duration: dur * 0.55,
        delay: 150 + f * 80,
        ease: "Back.easeOut"
      });
    }

    // Dirt particle plume
    for (let p = 0; p < 8; p += 1) {
      const clump = this.add.circle(
        landX + Phaser.Math.Between(-14, 14),
        groundY - 2,
        Phaser.Math.Between(2, 4),
        dirt, 0.85
      );
      clump.setDepth(DEPTH.BOSS_TELEGRAPH);
      this.tweens.add({
        targets: clump,
        x: clump.x + Phaser.Math.Between(-18, 18),
        y: clump.y - Phaser.Math.Between(16, 30),
        alpha: 0,
        scale: 0.3,
        duration: dur * 0.8,
        delay: p * 40,
        ease: "Quad.easeOut",
        onComplete: () => clump.destroy()
      });
    }

    // Boss cast aura (unique green-tinged)
    if (boss?.active) {
      this.spawnAuraPulse(boss.x, boss.y - 12, col, 40, dur);
      this.spawnAuraPulse(boss.x, boss.y - 12, 0x88ffc0, 20, dur);
    }

    this.time.delayedCall(dur, () => {
      if (crack?.active) this.tweens.add({ targets: crack, alpha: 0, duration: 180, onComplete: () => crack.destroy() });
      if (tomb?.active) this.tweens.add({ targets: tomb, alpha: 0, y: groundY - 14, duration: 180, onComplete: () => tomb.destroy() });
    });
  }

  /** Grave Warden windup: swirling phantom wisps spiral outward around the boss. */
  spawnGraveWardenPhantomWindup(boss, col, durationMs) {
    if (!boss?.active || this.isTrueHitboxView?.()) return;
    const dur = Math.max(200, durationMs || 950);
    const hi = 0xffe6f7;

    // Central vortex glow
    const vortex = this.add.graphics();
    vortex.setDepth(DEPTH.BOSS_TELEGRAPH);
    if (vortex.setBlendMode) vortex.setBlendMode(Phaser.BlendModes.ADD);
    let phase = 0;
    const updateVortex = () => {
      if (!vortex.active || !boss.active) return;
      vortex.clear();
      vortex.x = boss.x;
      vortex.y = boss.y - 10;
      const r = 30 + Math.sin(phase * 2) * 6;
      vortex.fillStyle(col, 0.18);
      vortex.fillCircle(0, 0, r);
      vortex.fillStyle(col, 0.35);
      vortex.fillCircle(0, 0, r * 0.5);
      vortex.lineStyle(1.5, col, 0.5);
      for (let i = 0; i < 3; i += 1) {
        const a = phase + (i / 3) * Math.PI * 2;
        vortex.strokeCircle(Math.cos(a) * 20, Math.sin(a) * 12, 10);
      }
      phase += 0.12;
    };
    const vortexTimer = this.time.addEvent({ delay: 32, loop: true, callback: updateVortex });
    updateVortex();

    // Swirling phantom wisps — 3 small ghosts spiraling out
    const wispCount = 3;
    const wisps = [];
    for (let i = 0; i < wispCount; i += 1) {
      const w = this.add.container(boss.x, boss.y - 10);
      w.setDepth(DEPTH.BOSS_TELEGRAPH + 1);
      const wg = this.add.graphics();
      wg.fillStyle(0x0f0516, 0.6);
      wg.fillEllipse(0, 0, 12, 10);
      wg.fillStyle(col, 0.55);
      wg.fillEllipse(0, 0, 8, 6);
      wg.fillStyle(hi, 0.7);
      wg.fillCircle(-1.5, -1, 1);
      wg.fillCircle(1.5, -1, 1);
      w.add(wg);
      wisps.push(w);
      const startAng = (i / wispCount) * Math.PI * 2;
      let p = 0;
      const wt = this.time.addEvent({
        delay: 32,
        loop: true,
        callback: () => {
          if (!w.active || !boss.active) return;
          p += 0.045;
          const r = 12 + p * 35;
          const a = startAng + p * 3.4;
          w.x = boss.x + Math.cos(a) * r;
          w.y = boss.y - 10 + Math.sin(a) * r * 0.7;
          w.alpha = Math.max(0, 1 - p * 0.9);
        }
      });
      this.time.delayedCall(dur, () => { wt.remove(); w.destroy(); });
    }

    // Boss aura pulse (distinct purple for phantom)
    this.spawnAuraPulse(boss.x, boss.y - 12, col, 52, dur);
    this.spawnAuraPulse(boss.x, boss.y - 12, 0xc084fc, 28, dur);

    this.time.delayedCall(dur, () => {
      vortexTimer.remove();
      if (vortex?.active) {
        this.tweens.add({ targets: vortex, alpha: 0, duration: 160, onComplete: () => vortex.destroy() });
      }
    });
  }

  /** Grave Warden windup: tether sigil from boss to target, making the siphon target unmistakable. */
  spawnGraveWardenSiphonWindup(boss, target, col, durationMs) {
    if (!boss?.active || !target?.isAlive || this.isTrueHitboxView?.()) return null;
    const dur = Math.max(200, durationMs || 600);
    const warn = 0xff4466;

    // Target-lock sigil above the victim's head
    const sigil = this.add.container(target.x, target.y - 30);
    sigil.setDepth(DEPTH.BOSS_TELEGRAPH + 2);
    const sg = this.add.graphics();
    sg.lineStyle(2, warn, 0.8);
    sg.strokeCircle(0, 0, 14);
    sg.lineStyle(1.2, col, 0.65);
    sg.strokeCircle(0, 0, 10);
    // cross-hair marks
    sg.fillStyle(warn, 0.7);
    sg.fillTriangle(-14, 0, -10, -3, -10, 3);
    sg.fillTriangle(14, 0, 10, -3, 10, 3);
    sg.fillTriangle(0, -14, -3, -10, 3, -10);
    sg.fillTriangle(0, 14, -3, 10, 3, 10);
    // inner heart emblem
    sg.fillStyle(warn, 0.55);
    sg.fillCircle(0, 0, 4);
    sg.fillStyle(0xffffff, 0.8);
    sg.fillCircle(0, -1, 1.5);
    sigil.add(sg);
    sigil.setAlpha(0);
    sigil.setScale(0.4);
    this.tweens.add({ targets: sigil, alpha: 1, scale: 1, duration: 180, ease: "Back.easeOut" });
    this.tweens.add({ targets: sigil, angle: 360, duration: dur, ease: "Linear" });

    // Dashed tether line that grows from boss to target and pulses
    const tether = this.add.graphics();
    tether.setDepth(DEPTH.BOSS_TELEGRAPH + 1);
    if (tether.setBlendMode) tether.setBlendMode(Phaser.BlendModes.ADD);
    const startAt = this.time.now;
    const endAt = startAt + dur;
    const drawTether = () => {
      if (!tether.active) return;
      if (!boss.active || !target.isAlive) { finish(); return; }
      tether.clear();
      const progress = Phaser.Math.Clamp((this.time.now - startAt) / dur, 0, 1);
      const sx = boss.x;
      const sy = boss.y - 14;
      const ex = target.x;
      const ey = target.y - 12;
      const dx = ex - sx;
      const dy = ey - sy;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) return;
      const nx = dx / dist;
      const ny = dy / dist;

      // dashed line — many short segments
      const segLen = 8;
      const gap = 6;
      const phaseOffset = (this.time.now * 0.12) % (segLen + gap);
      const maxDist = dist * progress;
      const thickness = 1 + progress * 2.5;
      const col1 = progress > 0.7 ? warn : col;
      const alpha = 0.4 + progress * 0.5;
      tether.lineStyle(thickness, col1, alpha);
      let d = -phaseOffset;
      while (d < maxDist) {
        const s = Math.max(0, d);
        const e = Math.min(maxDist, d + segLen);
        if (e > s) {
          tether.lineBetween(sx + nx * s, sy + ny * s, sx + nx * e, sy + ny * e);
        }
        d += segLen + gap;
      }

      // pulsing orbs traveling along the line
      const pulseCount = 3;
      for (let i = 0; i < pulseCount; i += 1) {
        const t = ((this.time.now * 0.0009) + i / pulseCount) % 1;
        const pt = t * maxDist;
        if (pt > 4 && pt < maxDist - 2) {
          const px = sx + nx * pt;
          const py = sy + ny * pt;
          tether.fillStyle(warn, 0.6);
          tether.fillCircle(px, py, 3);
          tether.fillStyle(0xffffff, 0.5);
          tether.fillCircle(px, py, 1.2);
        }
      }

      // anchor glow on boss
      tether.fillStyle(col, 0.4);
      tether.fillCircle(sx, sy, 6);
      // keep sigil over target's head
      if (sigil?.active) {
        sigil.x = target.x;
        sigil.y = target.y - 30;
      }
    };
    const renderEv = this.time.addEvent({ delay: 16, loop: true, callback: drawTether });
    drawTether();

    // Victim flash warnings (3 pulses escalating)
    const flashTimes = [dur * 0.2, dur * 0.55, dur * 0.85];
    flashTimes.forEach((t, i) => {
      this.time.delayedCall(t, () => {
        if (!target.isAlive) return;
        const pulse = this.add.circle(target.x, target.y - 12, 18 + i * 4, warn, 0.35);
        pulse.setDepth(DEPTH.BOSS_TELEGRAPH);
        if (pulse.setBlendMode) pulse.setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: pulse,
          scale: 1.8,
          alpha: 0,
          duration: 340,
          onComplete: () => pulse.destroy()
        });
      });
    });

    // Boss cast aura (pink-red)
    this.spawnAuraPulse(boss.x, boss.y - 12, col, 36, dur);
    this.spawnAuraPulse(boss.x, boss.y - 12, warn, 18, dur);

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      renderEv.remove();
      if (tether?.active) {
        this.tweens.add({ targets: tether, alpha: 0, duration: 140, onComplete: () => tether.destroy() });
      }
      if (sigil?.active) {
        this.tweens.add({ targets: sigil, alpha: 0, scale: 1.4, duration: 140, onComplete: () => sigil.destroy() });
      }
    };
    this.time.delayedCall(dur, finish);
    this.time.delayedCall(endAt - this.time.now + 60, finish);
    return { finish };
  }

  /** Grave Warden windup: a phantom scythe blade traces the sweep path. */
  spawnGraveWardenTollWindup(cx, cy, width, height, direction, col, durationMs) {
    if (this.isTrueHitboxView?.()) return;
    const dur = Math.max(200, durationMs || 900);
    const deep = 0x3a0828;

    // Ghost scythe sweeping across the zone during windup
    const blade = this.add.graphics();
    blade.setDepth(DEPTH.BOSS_TELEGRAPH);
    if (blade.setBlendMode) blade.setBlendMode(Phaser.BlendModes.ADD);
    blade.fillStyle(deep, 0.45);
    blade.beginPath();
    blade.moveTo(-width * 0.48, -height * 0.12);
    blade.lineTo(0, -height * 0.45);
    blade.lineTo(width * 0.48, -height * 0.12);
    blade.lineTo(width * 0.42, height * 0.18);
    blade.lineTo(-width * 0.42, height * 0.18);
    blade.closePath();
    blade.fillPath();
    blade.fillStyle(col, 0.28);
    blade.beginPath();
    blade.moveTo(-width * 0.36, -height * 0.06);
    blade.lineTo(0, -height * 0.32);
    blade.lineTo(width * 0.36, -height * 0.06);
    blade.lineTo(width * 0.3, height * 0.08);
    blade.lineTo(-width * 0.3, height * 0.08);
    blade.closePath();
    blade.fillPath();
    blade.lineStyle(2, col, 0.5);
    blade.lineBetween(-width * 0.44, 0, width * 0.44, 0);

    blade.x = cx + (direction > 0 ? -width * 0.5 : width * 0.5);
    blade.y = cy;
    blade.setScale(0.8, 0.6);
    blade.setAlpha(0.6);
    this.tweens.add({
      targets: blade,
      x: cx + (direction > 0 ? width * 0.5 : -width * 0.5),
      scaleX: 1, scaleY: 1,
      alpha: 0.9,
      duration: dur * 0.9,
      ease: "Sine.easeInOut"
    });

    // Cut-mark dashes along the sweep line
    const segs = 10;
    for (let i = 0; i < segs; i += 1) {
      const t = i / (segs - 1);
      const x = cx - width * 0.42 + t * width * 0.84;
      const slash = this.add.graphics();
      slash.lineStyle(2, col, 0.8);
      slash.lineBetween(-4, -4, 4, 4);
      slash.x = x;
      slash.y = cy;
      slash.setDepth(DEPTH.BOSS_TELEGRAPH);
      slash.setAlpha(0);
      this.tweens.add({
        targets: slash,
        alpha: 0.8,
        duration: dur * 0.25,
        delay: dur * 0.1 + i * (dur * 0.06),
        yoyo: true,
        hold: 60,
        onComplete: () => slash.destroy()
      });
    }

    // Ground rect telegraph (muted)
    const rect = this.createRectHitbox(cx, cy, width, height);
    this.spawnWindupRect?.(rect, col, dur);

    this.time.delayedCall(dur, () => {
      if (blade?.active) {
        this.tweens.add({ targets: blade, alpha: 0, duration: 160, onComplete: () => blade.destroy() });
      }
    });
  }

  /** Grave Warden: skeletal hands erupt from the ground at player positions, linger and deal damage. */
  spawnGraveHand(x, groundY, tuning, col, targets, boss) {
    const hw = tuning.handWidth || 42;
    const hh = tuning.handHeight || 50;
    const dur = tuning.durationMs || 1200;
    const dmg = tuning.damage || 18;
    const deep = 0x2a0a1e;

    const container = this.add.container(x, groundY);
    container.setDepth(DEPTH.PLAYER_FX);

    const g = this.add.graphics();
    g.fillStyle(deep, 0.85);
    g.fillRoundedRect(-hw * 0.25, -hh * 0.9, hw * 0.5, hh * 0.7, 4);
    g.fillStyle(col, 0.4);
    g.fillRect(-hw * 0.18, -hh * 0.85, hw * 0.36, hh * 0.6);
    for (let f = 0; f < 4; f += 1) {
      const fx = -hw * 0.2 + f * (hw * 0.13);
      g.fillStyle(0xe8d0f0, 0.7);
      g.fillRoundedRect(fx, -hh * 0.95 - f * 3, 5, 14 + f * 2, 2);
    }
    g.fillStyle(col, 0.2);
    g.fillEllipse(0, 0, hw * 0.7, 10);
    container.add(g);

    container.setAlpha(0);
    container.setScale(0.3, 0.1);
    this.tweens.add({
      targets: container,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 280,
      ease: "Back.easeOut"
    });

    let tickTimer = null;
    const hm = this.bossOutgoingDamageMult ?? 1;
    const tickDmg = Math.max(1, Math.round(dmg * hm));
    const hitRect = { cx: x, cy: groundY - hh * 0.45, halfW: hw * 0.5, halfH: hh * 0.55 };
    const tickInterval = 400;
    let hasHit = {};

    const doTick = () => {
      if (this.gameState !== "battle") { cleanup(); return; }
      targets.forEach((p) => {
        if (!p.isAlive) return;
        const px = p.x;
        const py = p.y;
        if (Math.abs(px - hitRect.cx) < hitRect.halfW && Math.abs(py - hitRect.cy) < hitRect.halfH) {
          if (!hasHit[p.playerIndex] || this.time.now - hasHit[p.playerIndex] >= tickInterval) {
            hasHit[p.playerIndex] = this.time.now;
            if (boss.hitPlayer(p, tickDmg, col, "melee") > 0) {
              this.spawnImpactEffect(p.x, p.y - 10, col, 12);
            }
          }
        }
      });
    };

    tickTimer = this.time.addEvent({ delay: tickInterval, loop: true, callback: doTick });
    doTick();

    const cleanup = () => {
      if (tickTimer) { tickTimer.remove(); tickTimer = null; }
      this.tweens.add({
        targets: container,
        alpha: 0,
        scaleY: 0.1,
        duration: 250,
        onComplete: () => container.destroy()
      });
    };

    this.time.delayedCall(dur, cleanup);
  }

  /** Grave Warden: tethered beam that drains life from a player and heals the boss.
   *  Counterplay: the beam snaps if the player moves beyond breakRange (~200px) from
   *  the boss, giving a clear "run away" escape window. A tether indicator stretches
   *  and turns red as the player nears the break threshold. */
  spawnSoulSiphonBeam(boss, target, tuning, col, targets) {
    const dur = tuning.beamDurationMs || 1400;
    const tickMs = tuning.damageTickMs || 200;
    const dpt = tuning.damagePerTick || 6;
    const hpt = tuning.healPerTick || 8;
    const bw = tuning.beamWidth || 28;
    const breakRange = tuning.breakRange || 200;
    const hm = this.bossOutgoingDamageMult ?? 1;
    const tickDmg = Math.max(1, Math.round(dpt * hm));
    const deep = 0x3a0828;
    const warnColor = 0xff4444;

    const beamGfx = this.add.graphics();
    beamGfx.setDepth(DEPTH.PLAYER_FX);

    let ended = false;
    const endAt = this.time.now + dur;

    const drawBeam = () => {
      if (ended) return;
      beamGfx.clear();
      if (!boss.active || !target.isAlive || this.gameState !== "battle") { finish(); return; }
      const dx = target.x - boss.x;
      const dy = (target.y - 12) - (boss.y - 14);
      const dist = Math.hypot(dx, dy);
      if (dist > breakRange) { snapBeam(); return; }

      const strain = Phaser.Math.Clamp(dist / breakRange, 0, 1);
      const beamAlpha = 0.7 - strain * 0.35;
      const beamCol = strain > 0.6 ? warnColor : col;

      const ang = Math.atan2(dy, dx);
      const hw = bw * 0.5 * (1 - strain * 0.4);
      const perp = ang + Math.PI * 0.5;
      const px = Math.cos(perp) * hw;
      const py = Math.sin(perp) * hw;
      const sx = boss.x;
      const sy = boss.y - 14;
      const ex = target.x;
      const ey = target.y - 12;
      beamGfx.fillStyle(deep, 0.4 * (1 - strain * 0.5));
      beamGfx.beginPath();
      beamGfx.moveTo(sx + px, sy + py);
      beamGfx.lineTo(ex + px * 0.6, ey + py * 0.6);
      beamGfx.lineTo(ex - px * 0.6, ey - py * 0.6);
      beamGfx.lineTo(sx - px, sy - py);
      beamGfx.closePath();
      beamGfx.fillPath();
      beamGfx.lineStyle(3 - strain * 1.5, beamCol, beamAlpha);
      beamGfx.lineBetween(sx, sy, ex, ey);
      beamGfx.lineStyle(1.5, 0xffffff, 0.35 * (1 - strain * 0.6));
      beamGfx.lineBetween(sx, sy, ex, ey);

      if (strain > 0.5) {
        const segments = 4;
        for (let s = 0; s < segments; s++) {
          const t = (s + 0.5) / segments;
          const mx = sx + dx * t + Phaser.Math.Between(-3, 3);
          const my = sy + (dy + 14 - 12) * t + Phaser.Math.Between(-3, 3);
          beamGfx.fillStyle(warnColor, 0.3 + strain * 0.3);
          beamGfx.fillCircle(mx, my, 2);
        }
      }

      const pulse = 0.5 + 0.5 * Math.sin(this.time.now * 0.008);
      beamGfx.fillStyle(col, (0.15 + pulse * 0.15) * (1 - strain * 0.5));
      beamGfx.fillCircle(sx, sy, 12 + pulse * 4);
      beamGfx.fillStyle(0xff4466, (0.2 + pulse * 0.15) * (1 - strain * 0.5));
      beamGfx.fillCircle(ex, ey, 10 + pulse * 3);
    };

    const snapBeam = () => {
      if (ended) return;
      ended = true;
      tickEv.remove();
      renderEv.remove();
      const mx = (boss.x + target.x) * 0.5;
      const my = (boss.y - 14 + target.y - 12) * 0.5;
      for (let i = 0; i < 6; i++) {
        const spark = this.add.circle(
          mx + Phaser.Math.Between(-20, 20),
          my + Phaser.Math.Between(-15, 15),
          Phaser.Math.Between(2, 4), warnColor, 0.7
        );
        spark.setDepth(DEPTH.PLAYER_FX);
        this.tweens.add({
          targets: spark,
          x: spark.x + Phaser.Math.Between(-30, 30),
          y: spark.y + Phaser.Math.Between(-25, 25),
          alpha: 0, scale: 0.2,
          duration: 250 + i * 40,
          onComplete: () => spark.destroy()
        });
      }
      this.tweens.add({
        targets: beamGfx, alpha: 0, duration: 150,
        onComplete: () => beamGfx.destroy()
      });
    };

    const tickEv = this.time.addEvent({
      delay: tickMs,
      loop: true,
      callback: () => {
        if (ended || !boss.active || !target.isAlive || this.gameState !== "battle") { finish(); return; }
        if (this.time.now >= endAt) { finish(); return; }
        const dist = Math.hypot(target.x - boss.x, target.y - boss.y);
        if (dist > breakRange) { snapBeam(); return; }
        if (boss.hitPlayer(target, tickDmg, col, "melee") > 0) {
          this.spawnImpactEffect(target.x, target.y - 10, 0xff4466, 10);
        }
        const bossHp = boss.currentHealth || 0;
        const bossMax = boss.maxHealth || boss.definition?.maxHealth || 1;
        boss.currentHealth = Math.min(bossMax, bossHp + hpt);
        if (typeof this.updateBossHealthBar === "function") this.updateBossHealthBar();
        const orb = this.add.circle(target.x, target.y - 12, 4, col, 0.7);
        orb.setDepth(DEPTH.PLAYER_FX);
        this.tweens.add({
          targets: orb,
          x: boss.x,
          y: boss.y - 14,
          alpha: 0,
          scale: 0.3,
          duration: 300,
          ease: "Sine.easeIn",
          onComplete: () => orb.destroy()
        });
      }
    });

    const renderEv = this.time.addEvent({
      delay: 16,
      loop: true,
      callback: drawBeam
    });

    const finish = () => {
      if (ended) return;
      ended = true;
      tickEv.remove();
      renderEv.remove();
      this.tweens.add({
        targets: beamGfx,
        alpha: 0,
        duration: 200,
        onComplete: () => beamGfx.destroy()
      });
    };

    this.time.delayedCall(dur + 50, finish);
    drawBeam();
  }

  /** Grave Warden: summons phantoms that chase players and explode on contact. */
  spawnPhantomSwarm(boss, tuning, col, targets) {
    const count = tuning.phantomCount || 3;
    const speed = tuning.phantomSpeed || 110;
    const dur = tuning.phantomDuration || 6000;
    const dmg = tuning.phantomDamage || 14;
    const radius = tuning.phantomRadius || 36;
    const hm = this.bossOutgoingDamageMult ?? 1;
    const phantomDmg = Math.max(1, Math.round(dmg * hm));
    const deep = 0x2a0a1e;

    for (let i = 0; i < count; i += 1) {
      const offsetAng = (i / count) * Math.PI * 2;
      const sx = boss.x + Math.cos(offsetAng) * 40;
      const sy = boss.y - 20 + Math.sin(offsetAng) * 20;

      const c = this.add.container(sx, sy);
      c.setDepth(DEPTH.PLAYER_FX);

      const glow = this.add.ellipse(0, 0, 28, 22, col, 0.1);
      if (glow.setBlendMode) glow.setBlendMode(Phaser.BlendModes.ADD);
      const body = this.add.ellipse(0, 0, 18, 16, deep, 0.7);
      const core = this.add.ellipse(0, -1, 12, 10, col, 0.5);
      if (core.setBlendMode) core.setBlendMode(Phaser.BlendModes.ADD);
      const eyeL = this.add.circle(-3, -3, 2, 0xffffff, 0.8);
      const eyeR = this.add.circle(3, -3, 2, 0xffffff, 0.8);
      const tail = this.add.ellipse(-8, 4, 10, 6, col, 0.15);
      c.add([glow, tail, body, core, eyeL, eyeR]);

      this.tweens.add({
        targets: core,
        alpha: { from: 0.3, to: 0.6 },
        duration: 400,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
      this.tweens.add({
        targets: glow,
        scaleX: { from: 0.85, to: 1.2 },
        scaleY: { from: 0.85, to: 1.2 },
        alpha: { from: 0.06, to: 0.18 },
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });

      let alive = true;
      const spawnedAt = this.time.now;
      const wobblePhase = i * 1.8;

      const explode = () => {
        if (!alive) return;
        alive = false;
        targets.forEach((p) => {
          if (!p.isAlive) return;
          const d = Math.hypot(p.x - c.x, p.y - c.y);
          if (d < radius) {
            if (boss.hitPlayer(p, phantomDmg, col, "melee") > 0) {
              this.spawnImpactEffect(p.x, p.y - 10, col, 16);
            }
          }
        });
        const burst = this.add.circle(c.x, c.y, 8, col, 0.6);
        burst.setDepth(DEPTH.PLAYER_FX);
        if (burst.setBlendMode) burst.setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: burst,
          scale: 3,
          alpha: 0,
          duration: 300,
          onComplete: () => burst.destroy()
        });
        c.destroy();
      };

      const updateEv = this.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          if (!alive || this.gameState !== "battle") { if (alive) { alive = false; c.destroy(); } updateEv.remove(); return; }
          if (this.time.now - spawnedAt > dur) { explode(); updateEv.remove(); return; }
          const nearestAlive = targets.filter((p) => p.isAlive);
          if (!nearestAlive.length) return;
          let best = nearestAlive[0];
          let bestDist = Math.hypot(best.x - c.x, best.y - c.y);
          for (let j = 1; j < nearestAlive.length; j += 1) {
            const dd = Math.hypot(nearestAlive[j].x - c.x, nearestAlive[j].y - c.y);
            if (dd < bestDist) { bestDist = dd; best = nearestAlive[j]; }
          }
          const dx = best.x - c.x;
          const dy = (best.y - 10) - c.y;
          const len = Math.hypot(dx, dy) || 1;
          const wobble = Math.sin((this.time.now * 0.003) + wobblePhase) * 25;
          c.x += (dx / len) * speed * 0.016 + Math.cos((this.time.now * 0.004) + wobblePhase) * 0.3;
          c.y += (dy / len) * speed * 0.016 + wobble * 0.01;
          if (bestDist < radius * 0.7) { explode(); updateEv.remove(); return; }
          c.scaleX = dx > 0 ? 1 : -1;
        }
      });
    }
  }

  /** Grave Warden: sweeping spectral scythe across a wide zone. */
  spawnDeathsTollSweep(cx, cy, tuning, col, targets, boss, direction) {
    const sw = tuning.scytheWidth || 340;
    const sh = tuning.scytheHeight || 60;
    const dur = tuning.sweepDurationMs || 400;
    const dmg = tuning.damage || 28;
    const hm = this.bossOutgoingDamageMult ?? 1;
    const sweepDmg = Math.max(1, Math.round(dmg * hm));
    const deep = 0x3a0828;

    const container = this.add.container(cx, cy);
    container.setDepth(DEPTH.PLAYER_FX);

    const blade = this.add.graphics();
    blade.fillStyle(deep, 0.65);
    blade.beginPath();
    blade.moveTo(-sw * 0.5, -sh * 0.15);
    blade.lineTo(0, -sh * 0.5);
    blade.lineTo(sw * 0.5, -sh * 0.15);
    blade.lineTo(sw * 0.45, sh * 0.2);
    blade.lineTo(-sw * 0.45, sh * 0.2);
    blade.closePath();
    blade.fillPath();
    blade.fillStyle(col, 0.35);
    blade.beginPath();
    blade.moveTo(-sw * 0.4, -sh * 0.08);
    blade.lineTo(0, -sh * 0.38);
    blade.lineTo(sw * 0.4, -sh * 0.08);
    blade.lineTo(sw * 0.35, sh * 0.1);
    blade.lineTo(-sw * 0.35, sh * 0.1);
    blade.closePath();
    blade.fillPath();
    blade.lineStyle(2, col, 0.6);
    blade.lineBetween(-sw * 0.45, 0, sw * 0.45, 0);
    blade.fillStyle(0xffffff, 0.3);
    blade.fillCircle(0, -sh * 0.25, 4);
    container.add(blade);

    const startX = direction > 0 ? -sw * 0.6 : sw * 0.6;
    container.x = cx + startX;
    container.setAlpha(0.8);
    container.setScale(0.6, 1);

    let hasHitPlayers = {};

    this.tweens.add({
      targets: container,
      x: cx - startX,
      scaleX: 1,
      alpha: 1,
      duration: dur,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        targets.forEach((p) => {
          if (!p.isAlive || hasHitPlayers[p.playerIndex]) return;
          const dx = Math.abs(p.x - container.x);
          const dy = Math.abs((p.y - 10) - container.y);
          if (dx < sw * 0.48 && dy < sh * 0.55) {
            hasHitPlayers[p.playerIndex] = true;
            if (boss.hitPlayer(p, sweepDmg, col, "melee") > 0) {
              this.spawnImpactEffect(p.x, p.y - 10, col, 18);
            }
          }
        });
      },
      onComplete: () => {
        this.tweens.add({
          targets: container,
          alpha: 0,
          scaleY: 0.3,
          duration: 250,
          onComplete: () => container.destroy()
        });
      }
    });

    for (let s = 0; s < 6; s += 1) {
      const spark = this.add.circle(
        cx + Phaser.Math.Between(-sw * 0.4, sw * 0.4),
        cy + Phaser.Math.Between(-sh * 0.4, sh * 0.4),
        Phaser.Math.Between(2, 4),
        col,
        0.5
      );
      spark.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: spark,
        y: spark.y - Phaser.Math.Between(20, 40),
        alpha: 0,
        duration: 400 + s * 60,
        delay: s * 50,
        onComplete: () => spark.destroy()
      });
    }
  }

  onBossDefeated() {
    if (this.gameState !== "battle") return;
    this.gameState = "won";
    this.time.delayedCall(520, () => {
      this.scene.start("GameOverScene", {
        result: "victory",
        selectedPlayers: this.selectedPlayers,
        bossName: this.boss.definition.name,
        difficulty: this.difficultyId,
        bossId: this.bossChoiceId,
        arenaId: this.arenaId
      });
    });
  }

  snapPlayerBesideBossFromGaleSeeker(player, projectile) {
    const boss = this.boss;
    if (!boss?.active || !player?.body) return;
    const worldW = this.physics?.world?.bounds?.width || this.scale?.width || 1200;
    const off = Number.isFinite(projectile?.galeSeekerSnapOffset) ? projectile.galeSeekerSnapOffset : 94;
    const facing = boss.flipX ? -1 : 1;
    const inFront = Phaser.Math.RND.pick([true, false]);
    const along = inFront ? facing : -facing;
    let nx = boss.x + along * off;
    nx = Phaser.Math.Clamp(nx, 36, worldW - 36);
    player.setPosition(nx, player.y);
    player.setVelocity(0, player.body.velocity.y * 0.35);
    player.bossContactGraceUntil = this.time.now + 480;
    this.spawnImpactEffect(player.x, player.y - 14, projectile?.effectColor || 0xa8fff0, 18);
  }

  assignGaleSeekerTarget(projectile) {
    const players = this.players?.filter((p) => p.isAlive) || [];
    if (!players.length) return;
    const rangedIds = (typeof window !== "undefined" && window.RANGED_CHARACTER_IDS) || ["ranger", "medic"];
    let nearest = null;
    let best = 1e12;
    players.forEach((p) => {
      const d = Phaser.Math.Distance.Squared(projectile.x, projectile.y, p.x, p.y - 14);
      if (d < best) {
        best = d;
        nearest = p;
      }
    });
    let chosen = nearest;
    const rangedPlayers = players.filter((p) => rangedIds.includes(p.definition?.id));
    if (nearest && rangedPlayers.length && !rangedIds.includes(nearest.definition?.id)) {
      let bestR = null;
      let bestRD = 1e12;
      rangedPlayers.forEach((p) => {
        const d = Phaser.Math.Distance.Squared(projectile.x, projectile.y, p.x, p.y - 14);
        if (d < bestRD) {
          bestRD = d;
          bestR = p;
        }
      });
      if (bestR && bestRD < best * 2.2 && Math.random() < 0.45) {
        chosen = bestR;
      }
    }
    projectile.galeSeekTargetRef = chosen;
  }

  cleanupProjectiles(group) {
    const worldWidth = this.physics?.world?.bounds?.width || this.scale.width;
    const worldHeight = this.physics?.world?.bounds?.height || this.scale.height;
    group.getChildren().forEach((projectile) => {
      if (!projectile.active) return;
      if (projectile.galeSeekerBolt && projectile.body) {
        const now = this.time.now;
        const maxLife = projectile.galeSeekerMaxLifeMs || 5000;
        const spawnAt = projectile.galeSeekerSpawnAt || now;
        const age = now - spawnAt;
        if (age >= maxLife) {
          this.safeDeactivate(projectile);
          return;
        }
        const fadeStart = maxLife * 0.55;
        if (age > fadeStart) {
          projectile.setAlpha(Phaser.Math.Clamp(1 - (age - fadeStart) / (maxLife - fadeStart), 0.08, 1));
        }
        if (!projectile.galeSeekRetargeted && now >= (projectile.galeSeekRetargetAt || 0)) {
          projectile.galeSeekRetargeted = true;
          this.assignGaleSeekerTarget(projectile);
        }
        let tgt = projectile.galeSeekTargetRef;
        if (tgt && (!tgt.active || !tgt.isAlive)) {
          tgt = null;
          projectile.galeSeekTargetRef = null;
        }
        if (projectile.galeSeekRetargeted && tgt) {
          const str = Phaser.Math.Clamp(projectile.galeHomingStrength || 0.055, 0.012, 0.1);
          const tx = tgt.x - projectile.x;
          const ty = tgt.y - 14 - projectile.y;
          const tlen = Math.hypot(tx, ty) || 1;
          const aimNx = tx / tlen;
          const aimNy = ty / tlen;
          const vx = projectile.body.velocity.x;
          const vy = projectile.body.velocity.y;
          const curLen = Math.hypot(vx, vy) || 1;
          const curNx = vx / curLen;
          const curNy = vy / curLen;
          const blendNx = Phaser.Math.Linear(curNx, aimNx, str);
          const blendNy = Phaser.Math.Linear(curNy, aimNy, str);
          const nlen = Math.hypot(blendNx, blendNy) || 1;
          const spd = Math.max(95, projectile.galeBaseSpeed || curLen);
          projectile.setVelocityX((blendNx / nlen) * spd);
          projectile.setVelocityY((blendNy / nlen) * spd);
        }
      }
      if (projectile.galeWindSalvoBolt && projectile.body) {
        const now = this.time.now;
        const maxLife = projectile.galeWindSalvoMaxLifeMs || 4200;
        const spawnAt = projectile.galeWindSalvoSpawnAt || now;
        if (now - spawnAt >= maxLife) {
          this.safeDeactivate(projectile);
          return;
        }
        if (projectile.galeWindSalvoReturning && this.boss?.active) {
          const br = this.getBodyHitbox(this.boss);
          const pr = this.getBodyHitbox(projectile);
          if (Phaser.Geom.Intersects.RectangleToRectangle(br, pr)) {
            const rd = projectile.galeWindSalvoReturnDamage ?? 5;
            try {
              if (typeof this.boss.takeDamage === "function") {
                this.boss.takeDamage(rd, projectile.effectColor || 0x3dd4c8);
              }
              this.spawnImpactEffect(this.boss.x, this.boss.y - 18, projectile.effectColor || 0x3dd4c8, 18);
            } catch (e) {
              console.error("Gale wind return hit failed", e);
            } finally {
              this.safeDeactivate(projectile);
            }
            return;
          }
          const str = 0.12;
          const tx = this.boss.x - projectile.x;
          const ty = this.boss.y - 16 - projectile.y;
          const tlen = Math.hypot(tx, ty) || 1;
          const aimNx = tx / tlen;
          const aimNy = ty / tlen;
          const vx = projectile.body.velocity.x;
          const vy = projectile.body.velocity.y;
          const curLen = Math.hypot(vx, vy) || 1;
          const curNx = vx / curLen;
          const curNy = vy / curLen;
          const blendNx = Phaser.Math.Linear(curNx, aimNx, str);
          const blendNy = Phaser.Math.Linear(curNy, aimNy, str);
          const nlen = Math.hypot(blendNx, blendNy) || 1;
          const spd = Math.max(200, projectile.galeBaseSpeed || curLen);
          projectile.setVelocityX((blendNx / nlen) * spd);
          projectile.setVelocityY((blendNy / nlen) * spd);
        }
      }
      if (projectile.galeSkybreakHoming && projectile.body) {
        const players = this.players?.filter((p) => p.isAlive) || [];
        let nearest = null;
        let best = 1e12;
        players.forEach((p) => {
          const d = Phaser.Math.Distance.Squared(projectile.x, projectile.y, p.x, p.y - 14);
          if (d < best) {
            best = d;
            nearest = p;
          }
        });
        if (nearest) {
          const str = Phaser.Math.Clamp(projectile.galeHomingStrength || 0.11, 0.02, 0.35);
          const tx = nearest.x - projectile.x;
          const ty = nearest.y - 14 - projectile.y;
          const tlen = Math.hypot(tx, ty) || 1;
          const aimNx = tx / tlen;
          const aimNy = ty / tlen;
          const vx = projectile.body.velocity.x;
          const vy = projectile.body.velocity.y;
          const curLen = Math.hypot(vx, vy) || 1;
          const curNx = vx / curLen;
          const curNy = vy / curLen;
          const blendNx = Phaser.Math.Linear(curNx, aimNx, str);
          const blendNy = Phaser.Math.Linear(curNy, aimNy, str);
          const nlen = Math.hypot(blendNx, blendNy) || 1;
          const spd = Math.max(120, projectile.galeBaseSpeed || curLen);
          projectile.setVelocityX((blendNx / nlen) * spd);
          projectile.setVelocityY((blendNy / nlen) * spd);
        }
      }
      if (projectile.spiritBoltHoming && projectile.body) {
        const aim = typeof this.getNearestEnemyAimForSoulcallerAt === "function"
          ? this.getNearestEnemyAimForSoulcallerAt(projectile.x, projectile.y)
          : null;
        if (aim) {
          const str = Phaser.Math.Clamp(projectile.spiritHomingStrength || 0.04, 0.01, 0.12);
          const tx = aim.x - projectile.x;
          const ty = aim.y - projectile.y;
          const tlen = Math.hypot(tx, ty) || 1;
          const vx = projectile.body.velocity.x;
          const vy = projectile.body.velocity.y;
          const curLen = Math.hypot(vx, vy) || 1;
          const curNx = vx / curLen;
          const curNy = vy / curLen;
          const blendNx = Phaser.Math.Linear(curNx, tx / tlen, str);
          const blendNy = Phaser.Math.Linear(curNy, ty / tlen, str);
          const nlen = Math.hypot(blendNx, blendNy) || 1;
          const spd = Math.max(200, curLen);
          projectile.setVelocityX((blendNx / nlen) * spd);
          projectile.setVelocityY((blendNy / nlen) * spd);
        }
      }
      if (projectile.soulLinkTarget && projectile.body) {
        const tgt = projectile.soulLinkTarget;
        if (!tgt.active || !tgt.isAlive) {
          this.safeDeactivate(projectile);
          return;
        }
        const dx = tgt.x - projectile.x;
        const dy = (tgt.y - 12) - projectile.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 24) {
          this.applySoulLink(projectile.soulLinkOwner, tgt);
          this.spawnImpactEffect(tgt.x, tgt.y - 12, 0x58d8e8, 16);
          this.safeDeactivate(projectile);
          return;
        }
        const spd = 550;
        const len = dist || 1;
        projectile.setVelocityX((dx / len) * spd);
        projectile.setVelocityY((dy / len) * spd);
      }
      if (projectile.hollowBloomOrb && projectile.body) {
        const now = this.time.now;
        const start = projectile.hollowBloomStart || now;
        const dur = projectile.hollowBloomDurationMs || 2800;
        const t = Phaser.Math.Clamp((now - start) / dur, 0, 1);
        const elapsed = now - start;
        // pulsing alpha — faster pulse as it matures
        const pulseSpeed = 0.0014 + t * 0.003;
        const pulse = 0.45 + 0.55 * (Math.sin(elapsed * pulseSpeed + t * 4) * 0.5 + 0.5);
        projectile.setAlpha(Phaser.Math.Clamp(pulse, 0.4, 1));
        // color shift toward deep violet
        const rC = Phaser.Math.Linear(12, 50, t * t);
        const gC = Phaser.Math.Linear(4, 80, t);
        const bC = Phaser.Math.Linear(18, 255, Math.sqrt(t));
        projectile.setTint(Phaser.Display.Color.GetColor(Math.round(rC), Math.round(gC), Math.round(bC)));
        // growing scale with distortion wobble
        const baseSc = Phaser.Math.Linear(1.55, 2.0, t);
        const wobX = Math.sin(now * 0.019) * 0.08 * t;
        const wobY = Math.cos(now * 0.023) * 0.08 * t;
        projectile.setScale(baseSc + wobX, baseSc + wobY);
        // spin the orb slowly
        projectile.rotation += 0.015 + t * 0.03;
        if (projectile.body) {
          const br = Math.max(20, Math.round(projectile.width * projectile.scaleX * 0.44));
          projectile.body.setCircle(br);
        }
        // periodic void sparks trailing behind
        if (!projectile._lastOrbSpark || now - projectile._lastOrbSpark > 120) {
          projectile._lastOrbSpark = now;
          const sp = this.add.circle(
            projectile.x + Phaser.Math.FloatBetween(-8, 8),
            projectile.y + Phaser.Math.FloatBetween(-8, 8),
            2 + Math.random() * 2, 0xd080ff, 0.55
          );
          sp.setDepth(DEPTH.PROJECTILE - 1);
          this.tweens.add({
            targets: sp,
            alpha: 0,
            scale: 0.2,
            duration: 250,
            ease: "Quad.easeOut",
            onComplete: () => sp.destroy()
          });
        }
        if (t >= 1) {
          this.triggerHollowBloomExplosion(projectile);
          this.safeDeactivate(projectile);
        }
        return;
      }
      if (projectile.hollowBloomShard && projectile.body) {
        const now = this.time.now;
        projectile.setAlpha(Phaser.Math.Clamp(0.7 + 0.3 * Math.sin(now * 0.012), 0.6, 1));
        projectile.rotation += 0.08;
        const traveled = Math.hypot(projectile.x - projectile.spawnX, projectile.y - (projectile.spawnY ?? projectile.y));
        const maxR = projectile.maxRange || 500;
        const fadeStart = maxR * 0.7;
        if (traveled > fadeStart) {
          const fadeT = (traveled - fadeStart) / (maxR - fadeStart);
          projectile.setAlpha(Phaser.Math.Clamp(1 - fadeT, 0.1, projectile.alpha));
        }
        if (traveled >= maxR) {
          this.safeDeactivate(projectile);
        }
        return;
      }
      if (projectile.projectileTag === "riftBolt") {
        projectile.rotation += 0.12;
      }
      if (projectile.chargeBolt) {
        const v = projectile.chargeBoltVisual || this.mergeChargeBoltVisual();
        const dir = projectile.fireDir || 1;
        const traveled = Math.abs(projectile.x - projectile.spawnX);
        const maxR = Math.max(projectile.maxRange || 2200, (this.scale?.width || 960) + 200);
        const tRaw = Phaser.Math.Clamp(traveled / maxR, 0, 1);
        const dz = Phaser.Math.Clamp(Number.isFinite(v.deadZone) ? v.deadZone : 0, 0, 0.95);
        const denom = Math.max(1e-4, 1 - dz);
        const t = Phaser.Math.Clamp((tRaw - dz) / denom, 0, 1);
        const peak = projectile.chargePeakScale || (projectile.chargeScaleBase || 1) * v.peakMultiplier;
        const floor = projectile.chargeMinScale != null ? projectile.chargeMinScale : v.minScale;
        const u = Math.pow(t, v.shrinkExponent);
        const sc = Phaser.Math.Linear(peak, floor, u);
        projectile.setScale(
          Math.max(floor * v.clampMinMulX, sc),
          Math.max(floor * v.clampMinMulY, sc * v.scaleYFromSc)
        );
        if (projectile.body) {
          projectile.body.setCircle(14);
        }
        projectile.chargeTrailAcc = (projectile.chargeTrailAcc || 0) + 1;
        if (projectile.chargeTrailAcc >= 2 && !this.isTrueHitboxView()) {
          projectile.chargeTrailAcc = 0;
          this.spawnChargeBoltTailParticle(
            projectile.x - dir * (10 + sc * 12),
            projectile.y + Phaser.Math.Between(-4, 4),
            projectile.effectColor,
            sc
          );
        }
      }
      if (projectile.maxRange && Math.abs(projectile.x - projectile.spawnX) >= projectile.maxRange) {
        this.safeDeactivate(projectile);
        return;
      }
      if (projectile.x < -40 || projectile.x > worldWidth + 40 || projectile.y > worldHeight + 60) {
        this.safeDeactivate(projectile);
      }
    });
  }

  safeDeactivate(gameObject) {
    if (!gameObject || !gameObject.active) return;
    try {
      if (gameObject.body) {
        gameObject.disableBody(true, true);
      } else {
        gameObject.destroy();
      }
    } catch (error) {
      console.error("Failed to deactivate object", error);
    }
  }

  resolveHitObjects(first, second, kind) {
    let group = null;
    if (kind === "projectile_player") group = this.playerProjectiles;
    else if (kind === "projectile_boss") group = this.bossProjectiles;
    else if (kind === "hazard") group = this.hazards;
    if (group) {
      const inGroup = (obj) => {
        if (!obj) return false;
        if (typeof group.contains === "function") return group.contains(obj);
        const list = group.getChildren();
        return list && list.indexOf(obj) >= 0;
      };
      if (inGroup(first)) return { projectile: first, target: second };
      if (inGroup(second)) return { projectile: second, target: first };
      return null;
    }
    const firstIsProjectile = first && first.texture && first.texture.key === kind;
    const secondIsProjectile = second && second.texture && second.texture.key === kind;
    if (firstIsProjectile) return { projectile: first, target: second };
    if (secondIsProjectile) return { projectile: second, target: first };
    return null;
  }

  pointInMedicSanctuaryDome(px, py, cx, cy, rx, ry) {
    if (!Number.isFinite(px) || !Number.isFinite(py) || rx <= 0 || ry <= 0) return false;
    const dx = px - cx;
    const dy = py - cy;
    return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
  }

  pulseSanctuaryProjectileHeal(zone) {
    if (!zone) return;
    const heal = Number.isFinite(zone.projectileHealAmount) ? zone.projectileHealAmount : 3;
    if (heal <= 0) return;
    const col = zone.color || 0x7dffb6;
    (this.players || []).forEach((p) => {
      if (!p || !p.isAlive) return;
      if (!this.pointInMedicSanctuaryDome(p.x, p.y, zone.cx, zone.cy, zone.radiusX, zone.radiusY)) return;
      const before = p.health;
      p.health = Math.min(p.maxHealth, p.health + heal);
      if (p.health > before) {
        p.flash(0x7dffb6);
        this.spawnImpactEffect(p.x, p.y - 12, col, 14);
        this.spawnHealMarker(p.x, p.y - 20, 0x7dffb6);
      }
    });
    const ring = this.add.circle(zone.cx, zone.cy, 10, col, 0);
    ring.setStrokeStyle(2.2, col, 0.85);
    ring.setDepth(DEPTH.PLAYER_FX);
    this.tweens.add({
      targets: ring,
      scale: Math.max(2, zone.radiusX / 16),
      alpha: 0,
      duration: 360,
      ease: "Cubic.easeOut",
      onComplete: () => ring.destroy()
    });
  }

  addMedicResonanceStack(medicPlayer) {
    if (!medicPlayer || medicPlayer.definition?.id !== "medic") return;
    const t = medicPlayer.definition.basicAttack?.tuning || {};
    const maxStacks = Number.isFinite(t.resonanceMaxStacks) ? t.resonanceMaxStacks : 3;
    const durMs = Number.isFinite(t.resonanceStackDurationMs) ? t.resonanceStackDurationMs : 5000;
    const now = this.time.now;
    const cur = Number.isFinite(medicPlayer.medicResonanceStacks) && now < (medicPlayer.medicResonanceExpiresAt || 0)
      ? medicPlayer.medicResonanceStacks
      : 0;
    medicPlayer.medicResonanceStacks = Math.min(maxStacks, cur + 1);
    medicPlayer.medicResonanceExpiresAt = now + durMs;
    this.refreshMedicResonanceAura(medicPlayer);
  }

  consumeMedicResonanceBonus(medicPlayer) {
    if (!medicPlayer || medicPlayer.definition?.id !== "medic") return 0;
    const now = this.time.now;
    const stacks = Number.isFinite(medicPlayer.medicResonanceStacks) ? medicPlayer.medicResonanceStacks : 0;
    if (stacks <= 0 || now >= (medicPlayer.medicResonanceExpiresAt || 0)) {
      medicPlayer.medicResonanceStacks = 0;
      this.clearMedicResonanceAura(medicPlayer);
      return 0;
    }
    const per = Number.isFinite(medicPlayer.definition.basicAttack?.tuning?.resonanceHealPerStack)
      ? medicPlayer.definition.basicAttack.tuning.resonanceHealPerStack
      : 3;
    const bonus = stacks * per;
    medicPlayer.medicResonanceStacks = 0;
    medicPlayer.medicResonanceExpiresAt = 0;
    this.clearMedicResonanceAura(medicPlayer);
    return bonus;
  }

  refreshMedicResonanceAura(medicPlayer) {
    if (!medicPlayer || !medicPlayer.active) return;
    if (!medicPlayer._medicResonanceAuraG) {
      medicPlayer._medicResonanceAuraG = this.add.graphics();
      medicPlayer._medicResonanceAuraG.setDepth(DEPTH.PLAYER_FX - 1);
      medicPlayer._medicResonanceAuraEvt = this.time.addEvent({
        delay: 40,
        loop: true,
        callback: () => this.drawMedicResonanceAura(medicPlayer)
      });
    }
    this.drawMedicResonanceAura(medicPlayer);
  }

  drawMedicResonanceAura(medicPlayer) {
    const g = medicPlayer?._medicResonanceAuraG;
    if (!g) return;
    const now = this.time.now;
    const stacks = Number.isFinite(medicPlayer.medicResonanceStacks) ? medicPlayer.medicResonanceStacks : 0;
    if (!medicPlayer.active || stacks <= 0 || now >= (medicPlayer.medicResonanceExpiresAt || 0)) {
      this.clearMedicResonanceAura(medicPlayer);
      return;
    }
    g.clear();
    const col = 0x7dffb6;
    const pulse = 1 + Math.sin(now * 0.012) * 0.12;
    for (let i = 0; i < stacks; i += 1) {
      const r = 18 + i * 7;
      g.lineStyle(2, col, 0.55 - i * 0.08);
      g.strokeCircle(medicPlayer.x, medicPlayer.y - 4, r * pulse);
    }
    const ang = (now * 0.004) % (Math.PI * 2);
    for (let i = 0; i < stacks; i += 1) {
      const a = ang + (i / stacks) * Math.PI * 2;
      const rx = medicPlayer.x + Math.cos(a) * 22;
      const ry = medicPlayer.y - 4 + Math.sin(a) * 14;
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(rx, ry, 2.2);
      g.fillStyle(col, 0.8);
      g.fillCircle(rx, ry, 3.6);
    }
  }

  clearMedicResonanceAura(medicPlayer) {
    if (!medicPlayer) return;
    if (medicPlayer._medicResonanceAuraEvt) {
      medicPlayer._medicResonanceAuraEvt.remove();
      medicPlayer._medicResonanceAuraEvt = null;
    }
    if (medicPlayer._medicResonanceAuraG) {
      medicPlayer._medicResonanceAuraG.destroy();
      medicPlayer._medicResonanceAuraG = null;
    }
  }

  spawnMedicResonanceBurst(target) {
    if (!target?.active) return;
    const col = 0xbdffd5;
    const ring = this.add.circle(target.x, target.y - 12, 10, col, 0);
    ring.setStrokeStyle(3, col, 0.95);
    ring.setDepth(DEPTH.PLAYER_FX + 2);
    this.tweens.add({
      targets: ring,
      scale: 3.6,
      alpha: 0,
      duration: 320,
      ease: "Cubic.easeOut",
      onComplete: () => ring.destroy()
    });
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      const sp = this.add.circle(target.x, target.y - 12, 2.4, 0xffffff, 0.95);
      sp.setDepth(DEPTH.PLAYER_FX + 2);
      this.tweens.add({
        targets: sp,
        x: target.x + Math.cos(a) * 28,
        y: target.y - 12 + Math.sin(a) * 22,
        alpha: 0,
        duration: 300,
        onComplete: () => sp.destroy()
      });
    }
  }

  updateMedicBarriers(time) {
    if (!this.medicBarriers?.length) return;
    const dt = Number.isFinite(this.game?.loop?.delta) ? this.game.loop.delta : 16.67;

    this.medicBarriers = this.medicBarriers.filter((z) => {
      if (time >= z.expiresAt) {
        if (z.domeContainer?.destroy) z.domeContainer.destroy(true);
        return false;
      }
      return true;
    });

    const clearInDomes = (obj) => {
      if (!obj || !obj.active) return false;
      for (let j = 0; j < this.medicBarriers.length; j += 1) {
        const z = this.medicBarriers[j];
        if (this.pointInMedicSanctuaryDome(obj.x, obj.y, z.cx, z.cy, z.radiusX, z.radiusY)) {
          this.spawnImpactEffect(obj.x, obj.y, z.color || 0x7dffb6, 12);
          this.safeDeactivate(obj);
          this.pulseSanctuaryProjectileHeal(z);
          return true;
        }
      }
      return false;
    };
    const projs = this.bossProjectiles?.getChildren?.() || [];
    for (let i = 0; i < projs.length; i += 1) clearInDomes(projs[i]);
    const hazards = this.hazards?.getChildren?.() || [];
    for (let h = 0; h < hazards.length; h += 1) clearInDomes(hazards[h]);

    const healPerSec = 5;
    const bossDps = 8;
    for (let j = 0; j < this.medicBarriers.length; j += 1) {
      const z = this.medicBarriers[j];
      const cx = z.cx;
      const cy = z.cy;

      this.players.forEach((p) => {
        if (!p.isAlive) return;
        if (!this.pointInMedicSanctuaryDome(p.x, p.y, cx, cy, z.radiusX, z.radiusY)) return;
        let acc = z.healByPlayer.get(p) || 0;
        acc += healPerSec * (dt / 1000);
        const whole = Math.floor(acc);
        if (whole > 0) {
          p.health = Math.min(p.maxHealth, p.health + whole);
          acc -= whole;
          p.sanctuaryHealFlashUntil = time + 120;
        }
        z.healByPlayer.set(p, acc);
      });

      const boss = this.boss;
      const twin = this.bossTwin;
      const bossIn =
        boss?.active && this.pointInMedicSanctuaryDome(boss.x, boss.y, cx, cy, z.radiusX, z.radiusY);
      const twinIn =
        twin?.active &&
        boss?.definition?.id === "hollowPair" &&
        this.pointInMedicSanctuaryDome(twin.x, twin.y, cx, cy, z.radiusX, z.radiusY);
      if (bossIn || twinIn) {
        z.bossDmgAcc = (z.bossDmgAcc || 0) + bossDps * (dt / 1000);
        while (z.bossDmgAcc >= 1) {
          boss.takeDamage(1, 0xff4444);
          boss.sanctuaryDmgFlashUntil = time + 110;
          if (twinIn && twin?.active) {
            twin.sanctuaryDmgFlashUntil = time + 110;
          }
          z.bossDmgAcc -= 1;
        }
      }
    }

    this.applySanctuaryVeilMobTints(time);
  }

  bossFeetInCircle(cx, cy, radius, boss) {
    if (!boss?.active || !Number.isFinite(radius) || radius <= 0) return false;
    const by = boss.y - (boss.body?.height ? boss.body.height * 0.42 : 28);
    return Math.hypot(boss.x - cx, by - cy) <= radius;
  }

  startSkyriseSmokeZone(x, y, color, tuning = {}) {
    if (this.gameState !== "battle") return;
    const r = Number.isFinite(tuning.smokeRadius) ? tuning.smokeRadius : 92;
    const dur = Number.isFinite(tuning.smokeDurationMs) ? tuning.smokeDurationMs : 4000;
    const stunMs = Number.isFinite(tuning.smokeStunMs) ? tuning.smokeStunMs : 1000;
    const dps = Number.isFinite(tuning.smokeDps) ? tuning.smokeDps : 8;
    const cy = y - 6;
    const entry = {
      cx: x,
      cy,
      radius: r,
      expiresAt: this.time.now + dur,
      color: color || 0xf7d95c,
      dmgAcc: 0,
      dps
    };
    this.skyriseSmokeZones.push(entry);
    if (!this.isTrueHitboxView()) {
      this.buildSkyriseSmokeCloudGfx(entry);
    }
    const stunOne = (b) => {
      if (b?.active && this.bossFeetInCircle(entry.cx, entry.cy, entry.radius, b) && typeof b.applyStun === "function") {
        b.applyStun(stunMs);
      }
    };
    stunOne(this.boss);
    if (this.bossTwin?.active && this.boss?.definition?.id === "hollowPair") {
      stunOne(this.bossTwin);
    }
  }

  updateSkyriseSmokeZones(time) {
    if (!this.skyriseSmokeZones?.length) return;
    const dt = Number.isFinite(this.game?.loop?.delta) ? this.game.loop.delta : 16.67;
    this.skyriseSmokeZones = this.skyriseSmokeZones.filter((z) => {
      if (time >= z.expiresAt) {
        if (z.gfx?.destroy) z.gfx.destroy(true);
        return false;
      }
      const leaderIn = this.boss?.active && this.bossFeetInCircle(z.cx, z.cy, z.radius, this.boss);
      const twinIn =
        this.bossTwin?.active &&
        this.boss?.definition?.id === "hollowPair" &&
        this.bossFeetInCircle(z.cx, z.cy, z.radius, this.bossTwin);
      if ((leaderIn || twinIn) && this.boss?.active) {
        const dps = Number.isFinite(z.dps) ? z.dps : 8;
        z.dmgAcc = (z.dmgAcc || 0) + dps * (dt / 1000);
        while (z.dmgAcc >= 1) {
          this.boss.takeDamage(1, z.color);
          z.dmgAcc -= 1;
        }
      }
      return true;
    });
  }

  pickBossEntityClosestToPlayer(player) {
    if (!player) return null;
    const cands = [];
    if (this.boss?.active) {
      const ref = this.boss;
      const bx = ref.x;
      const by = ref.y - 14;
      cands.push({ ref, bx, by, d: (player.x - bx) ** 2 + (player.y - by) ** 2 });
    }
    if (this.bossTwin?.active) {
      const ref = this.bossTwin;
      const bx = ref.x;
      const by = ref.y - 14;
      cands.push({ ref, bx, by, d: (player.x - bx) ** 2 + (player.y - by) ** 2 });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => a.d - b.d);
    return cands[0];
  }

  /** Returns nearest enemy (boss/twin/summons) to a point. */
  pickEnemyEntityClosestToPoint(px, py) {
    const cands = [];
    if (this.boss?.active) {
      const ref = this.boss;
      const x = ref.x;
      const y = ref.y - 14;
      cands.push({ ref, x, y, d: (px - x) ** 2 + (py - y) ** 2 });
    }
    if (this.bossTwin?.active) {
      const ref = this.bossTwin;
      const x = ref.x;
      const y = ref.y - 14;
      cands.push({ ref, x, y, d: (px - x) ** 2 + (py - y) ** 2 });
    }
    const adds = typeof this.getDamageableSummonTargets === "function" ? this.getDamageableSummonTargets() : [];
    for (let i = 0; i < adds.length; i += 1) {
      const ref = adds[i];
      if (!ref?.active || !ref.isAlive) continue;
      const x = ref.x;
      const y = ref.y - 14;
      cands.push({ ref, x, y, d: (px - x) ** 2 + (py - y) ** 2 });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => a.d - b.d);
    return cands[0];
  }

  getNearestBossAimForSoulcaller(player) {
    const pick = this.pickBossEntityClosestToPlayer(player);
    if (!pick) return null;
    return { x: pick.bx, y: pick.by };
  }

  getNearestEnemyAimForSoulcallerAt(x, y) {
    const pick = this.pickEnemyEntityClosestToPoint(x, y);
    if (!pick) return null;
    return { x: pick.x, y: pick.y, ref: pick.ref };
  }

  spawnSoulbondCastPulse(x, y, col) {
    if (this.isTrueHitboxView()) return;
    const c = col || 0x58d8e8;
    const hi = 0xb0f0ff;
    const ring1 = this.add.circle(x, y, 16, c, 0.2);
    ring1.setStrokeStyle(2.5, c, 0.7);
    ring1.setDepth(DEPTH.PLAYER_FX);
    this.tweens.add({ targets: ring1, scaleX: 3, scaleY: 3, alpha: 0, duration: 500, ease: "Cubic.easeOut", onComplete: () => ring1.destroy() });
    const ring2 = this.add.circle(x, y, 10, hi, 0.12);
    ring2.setStrokeStyle(1.5, hi, 0.5);
    ring2.setDepth(DEPTH.PLAYER_FX);
    this.tweens.add({ targets: ring2, scaleX: 2.2, scaleY: 2.2, alpha: 0, duration: 380, delay: 60, ease: "Cubic.easeOut", onComplete: () => ring2.destroy() });
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6;
      const mote = this.add.circle(x, y, 2.5, hi, 0.65);
      mote.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({
        targets: mote,
        x: x + Math.cos(a) * 30,
        y: y + Math.sin(a) * 30 - 8,
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.3,
        duration: 420,
        ease: "Quad.easeOut",
        onComplete: () => mote.destroy()
      });
    }
    const flash = this.add.circle(x, y - 2, 6, 0xffffff, 0.55);
    flash.setDepth(DEPTH.PLAYER_FX + 1);
    this.tweens.add({ targets: flash, scaleX: 2, scaleY: 2, alpha: 0, duration: 200, onComplete: () => flash.destroy() });
  }

  spawnCovenantMarkBurst(x, y, col) {
    if (this.isTrueHitboxView()) return;
    const c = col || 0xe8c8ff;
    for (let i = 0; i < 3; i += 1) {
      const r = this.add.circle(x, y, 8 + i * 14, c, 0.12 + i * 0.06);
      r.setStrokeStyle(2, 0xffffff, 0.35 - i * 0.08);
      r.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: r,
        scaleX: 2.2 + i * 0.4,
        scaleY: 2.2 + i * 0.4,
        alpha: 0,
        duration: 500 + i * 90,
        ease: "Quad.easeOut",
        onComplete: () => r.destroy()
      });
    }
    const burst = this.add.circle(x, y - 2, 6, 0xffffff, 0.55);
    burst.setDepth(DEPTH.PLAYER_FX + 1);
    this.tweens.add({ targets: burst, scaleX: 2.2, scaleY: 2.2, alpha: 0, duration: 220, onComplete: () => burst.destroy() });
  }

  registerSummonerSoulbond(player, tuning) {
    if (this.gameState !== "battle" || !player?.isAlive) return;
    const col = player.definition.color || 0xd8b8ff;
    this.summonerSoulbonds = (this.summonerSoulbonds || []).filter((e) => {
      if (e.owner === player) {
        e.spirits?.forEach((s) => {
          if (s?.destroy) s.destroy(true);
        });
        return false;
      }
      return true;
    });
    const n = Math.max(1, Math.min(4, tuning.spiritCount || 2));
    const dur = Number.isFinite(tuning.durationMs) ? tuning.durationMs : 12000;
    const spirits = [];
    for (let i = 0; i < n; i += 1) {
      const c = this.add.container(player.x, player.y - 14);
      c.setDepth(DEPTH.PLAYER_FX);
      const rim = this.add.circle(0, 0, 12, 0x000000, 0);
      rim.setStrokeStyle(2, col, 0.72);
      const core = this.add.circle(0, 0, 8, col, 0.42);
      core.setBlendMode(Phaser.BlendModes.ADD);
      const glint = this.add.circle(-2, -3, 2.5, 0xffffff, 0.75);
      const glint2 = this.add.circle(3, 2, 2, 0xffffff, 0.45);
      c.add([rim, core, glint, glint2]);
      this.tweens.add({
        targets: core,
        alpha: { from: 0.28, to: 0.62 },
        duration: 380 + i * 70,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
      spirits.push(c);
    }
    const fireIv = Number.isFinite(tuning.fireIntervalMs) ? tuning.fireIntervalMs : 950;
    const entry = {
      owner: player,
      spirits,
      tuning,
      phase: Math.random() * Math.PI * 2,
      lastFireAt: this.time.now - fireIv,
      expiresAt: this.time.now + dur
    };
    this.summonerSoulbonds.push(entry);
    if (!this.isTrueHitboxView()) {
      this.spawnSoulbondCastPulse(player.x, player.y - 8, col);
    }
  }

  updateSummonerSoulbonds(time) {
    if (!this.summonerSoulbonds?.length) return;
    this.summonerSoulbonds = this.summonerSoulbonds.filter((e) => {
      if (time >= e.expiresAt || !e.owner?.active || !e.owner.isAlive || this.gameState !== "battle") {
        e.spirits?.forEach((s) => {
          if (s?.destroy) s.destroy(true);
        });
        return false;
      }
      const t = e.tuning || {};
      const ox = e.owner.x;
      const oy = e.owner.y - 16;
      const r = Number.isFinite(t.orbitRadius) ? t.orbitRadius : 90;
      const n = e.spirits.length;
      const dt = Number.isFinite(this.game?.loop?.delta) ? this.game.loop.delta : 16.67;
      e.phase = (e.phase || 0) + dt * 0.00088;
      for (let i = 0; i < n; i += 1) {
        const ang = e.phase + (i / n) * Math.PI * 2;
        const sx = ox + Math.cos(ang) * r;
        const sy = oy + Math.sin(ang) * r * 0.52;
        e.spirits[i].setPosition(sx, sy);
      }
      const interval = Number.isFinite(t.fireIntervalMs) ? t.fireIntervalMs : 950;
      if (time - e.lastFireAt < interval) return true;
      if (e.owner?.soulShroudActive) return true;
      e.lastFireAt = time;
      const aim = this.getNearestBossAimForSoulcaller(e.owner);
      if (!aim) return true;
      const spd = Number.isFinite(t.projectileSpeed) ? t.projectileSpeed : 400;
      const baseDmg = Number.isFinite(t.shotDamage) ? t.shotDamage : 6;
      const tex = this.textures.exists("proj_summoner") ? "proj_summoner" : "projectile_player";
      for (let i = 0; i < n; i += 1) {
        const sx = e.spirits[i].x;
        const sy = e.spirits[i].y;
        const dx = aim.x - sx;
        const dy = aim.y - sy;
        const len = Math.hypot(dx, dy) || 1;
        this.spawnPlayerProjectile(sx, sy, dx > 0 ? 1 : -1, baseDmg, {
          useAbsoluteVelocity: true,
          velocityX: (dx / len) * spd,
          velocityY: (dy / len) * spd,
          spawnOffsetX: 0,
          maxRange: 960,
          effectColor: e.owner.definition.color,
          textureKey: tex,
          ownerPlayer: e.owner,
          style: "riftBolt",
          skipMuzzleFlash: true
        });
      }
      return true;
    });
  }

  // ─── Soulcaller: roaming wisp ──────────────────────────────────────────────

  registerSoulcallerWisp(player, tuning) {
    if (this.gameState !== "battle" || !player?.isAlive) return;
    this.soulcallerWisps = this.soulcallerWisps.filter((e) => {
      if (e.owner === player) { if (e.container?.destroy) e.container.destroy(true); return false; }
      return true;
    });
    const col = player.definition.color || 0x58d8e8;
    const hi = 0xb0f0ff;
    const deep = 0x1a4858;
    const c = this.add.container(player.x, player.y - 20);
    c.setDepth(DEPTH.PLAYER_FX);

    const outerGlow = this.add.ellipse(0, 0, 36, 28, col, 0.07);
    if (outerGlow.setBlendMode) outerGlow.setBlendMode(Phaser.BlendModes.ADD);

    const tailC = this.add.ellipse(-18, 4, 6, 4, col, 0.08);
    const tailB = this.add.ellipse(-14, 3, 8, 5, col, 0.14);
    const tailA = this.add.ellipse(-9, 2, 10, 7, col, 0.22);

    const shell = this.add.ellipse(0, 0, 22, 20, deep, 0.45);
    const core = this.add.ellipse(0, 0, 16, 14, col, 0.5);
    if (core.setBlendMode) core.setBlendMode(Phaser.BlendModes.ADD);
    const innerGlow = this.add.ellipse(1, -2, 10, 8, hi, 0.3);
    if (innerGlow.setBlendMode) innerGlow.setBlendMode(Phaser.BlendModes.ADD);

    const sparkA = this.add.circle(6, -3, 2, 0xffffff, 0.6);
    const sparkB = this.add.circle(-2, 4, 1.5, 0xffffff, 0.35);

    const rim = this.add.ellipse(0, 0, 24, 22, 0x000000, 0);
    rim.setStrokeStyle(1.5, hi, 0.35);

    const frontMote = this.add.circle(10, 0, 2.5, hi, 0.45);

    c.add([outerGlow, tailC, tailB, tailA, shell, core, innerGlow, sparkA, sparkB, rim, frontMote]);

    this.tweens.add({ targets: core, alpha: { from: 0.35, to: 0.65 }, duration: 550, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: innerGlow, alpha: { from: 0.2, to: 0.4 }, scaleX: { from: 0.9, to: 1.1 }, scaleY: { from: 0.9, to: 1.1 }, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: outerGlow, scaleX: { from: 0.9, to: 1.15 }, scaleY: { from: 0.9, to: 1.15 }, alpha: { from: 0.05, to: 0.12 }, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: sparkA, alpha: { from: 0.3, to: 0.7 }, duration: 350, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: frontMote, alpha: { from: 0.3, to: 0.6 }, x: { from: 10, to: 12 }, duration: 500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    const dur = tuning.wispDurationMs || 14000;
    this.soulcallerWisps.push({
      owner: player, container: c, tuning,
      phase: Math.random() * Math.PI * 2,
      orbitPhase: Math.random() * Math.PI * 2,
      lastFireAt: this.time.now,
      expiresAt: this.time.now + dur
    });
  }

  updateSoulcallerWisps(time) {
    if (!this.soulcallerWisps?.length) return;
    this.soulcallerWisps = this.soulcallerWisps.filter((e) => {
      if (time >= e.expiresAt || !e.owner?.active || !e.owner.isAlive || this.gameState !== "battle") {
        if (e.container?.destroy) e.container.destroy(true);
        return false;
      }
      const t = e.tuning || {};
      const dt = Number.isFinite(this.game?.loop?.delta) ? this.game.loop.delta : 16.67;
      e.phase += dt * 0.0006;
      const owner = e.owner;
      const aim = typeof this.getNearestEnemyAimForSoulcallerAt === "function"
        ? this.getNearestEnemyAimForSoulcallerAt(e.container.x, e.container.y)
        : this.getNearestBossAimForSoulcaller(owner);
      const engageR = Number.isFinite(t.wispBossEngageRange) ? t.wispBossEngageRange : 440;
      let orbitBoss = false;
      const focusPick = typeof this.pickEnemyEntityClosestToPoint === "function"
        ? this.pickEnemyEntityClosestToPoint(owner.x, owner.y)
        : this.pickBossEntityClosestToPlayer(owner);
      const focus = focusPick?.ref;
      if (focus?.active) {
        const dOwnerToFocus = Math.hypot((focus.x ?? 0) - owner.x, (focus.y ?? 0) - owner.y);
        orbitBoss = dOwnerToFocus <= engageR;
      }
      const th = this.boss?.definition?.twinHover || {};
      const orbitR = orbitBoss
        ? Number.isFinite(t.wispOrbitRadius)
          ? t.wispOrbitRadius
          : Number.isFinite(th.orbitRadius)
            ? th.orbitRadius * 0.55
            : 96
        : Number.isFinite(t.wispHomeOrbitRadius)
          ? t.wispHomeOrbitRadius
          : 80;
      const wander = Number.isFinite(t.wispLateralWander) ? t.wispLateralWander : 26;
      const orbitW = Number.isFinite(t.wispOrbitPhaseSpeed) ? t.wispOrbitPhaseSpeed : 0.00088;
      e.orbitPhase = (e.orbitPhase || 0) + dt * orbitW;
      let cx;
      let cy;
      if (orbitBoss && focus?.active) {
        cx = focus.x;
        cy = focus.y - 14;
      } else {
        cx = owner.x;
        cy = owner.y - 14;
      }
      const bobX = Math.sin(e.phase * 1.25) * wander * 0.35;
      const bobY = Math.cos(e.phase * 1.85) * wander * 0.28;
      const orbitX = Math.cos(e.orbitPhase) * orbitR * 0.72 + Math.sin(e.orbitPhase * 1.9) * wander * 0.22;
      const orbitY = Math.sin(e.orbitPhase * 0.85) * orbitR * 0.38 + Math.cos(e.orbitPhase * 1.4) * 14;
      const tx = cx + orbitX + bobX;
      const ty = cy + orbitY + bobY;
      const followSpd = Number.isFinite(t.wispFollowSpeed) ? t.wispFollowSpeed : Number.isFinite(t.wispSpeed) ? t.wispSpeed : 135;
      this._moveSoulcallerWispToward(e.container, tx, ty, followSpd, dt);
      const interval = t.wispFireIntervalMs || 1100;
      const shotRange = Number.isFinite(t.wispAttackRange) ? t.wispAttackRange : 460;
      const projMax = Number.isFinite(t.wispProjectileMaxRange) ? t.wispProjectileMaxRange : 480;
      if (aim && time - e.lastFireAt >= interval && !e.owner?.soulShroudActive) {
        const sx = e.container.x;
        const sy = e.container.y;
        const toAim = Math.hypot(aim.x - sx, aim.y - sy);
        if (toAim <= shotRange) {
          e.lastFireAt = time;
          const ddx = aim.x - sx;
          const ddy = aim.y - sy;
          const len = Math.hypot(ddx, ddy) || 1;
          const spd2 = Number.isFinite(t.wispProjectileSpeed) ? t.wispProjectileSpeed : 400;
          const tex = this.textures.exists("proj_soulcaller_wisp") ? "proj_soulcaller_wisp" : "projectile_player";
          this.spawnPlayerProjectile(sx, sy, ddx > 0 ? 1 : -1, t.wispDamage || 6, {
            useAbsoluteVelocity: true,
            velocityX: (ddx / len) * spd2,
            velocityY: (ddy / len) * spd2,
            spawnOffsetX: 0,
            maxRange: projMax,
            effectColor: e.owner.definition.color,
            textureKey: tex,
            ownerPlayer: e.owner,
            style: "soulWispBolt",
            skipMuzzleFlash: true
          });
        }
      }
      return true;
    });
  }

  // ─── Soulcaller: turret ──────────────────────────────────────────────────

  registerSoulcallerTurret(player, tuning) {
    if (this.gameState !== "battle" || !player?.isAlive) return;
    this.soulcallerTurrets = this.soulcallerTurrets.filter((e) => {
      if (e.owner === player) { this._destroyTurret(e); return false; }
      return true;
    });
    const col = player.definition.color || 0x58d8e8;
    const tx = player.x;
    const ty = player.y;
    const maxHp = tuning.turretHealth || 60;
    const sprite = this.physics.add.sprite(tx, ty, "pixel").setScale(1).setAlpha(0);
    sprite.body.setSize(28, 32);
    sprite.body.allowGravity = true;
    sprite.body.setCollideWorldBounds(true);
    this.physics.add.collider(sprite, this.platforms);
    sprite.setDepth(DEPTH.PLAYER);
    sprite.isAlive = true;
    sprite.isTurret = true;
    sprite.health = maxHp;
    sprite.maxHealth = maxHp;
    sprite.x = tx;
    sprite.y = ty;
    sprite.movementLockType = null;
    sprite.movementLockUntil = 0;
    sprite.invulnerableUntil = 0;
    sprite.bossContactGraceUntil = 0;
    sprite.takeDamage = (amount) => {
      const dmg = Number.isFinite(amount) ? Math.max(1, amount) : 1;
      sprite.health = Math.max(0, sprite.health - dmg);
      if (sprite.health <= 0) {
        sprite.isAlive = false;
        this._destroyTurret(entry);
      }
    };

    const container = this.add.container(tx, ty);
    container.setDepth(DEPTH.PLAYER_FX);
    const bodyG = this.add.graphics();
    const hi = 0xb0f0ff;
    const deep = 0x061420;

    // Tapered obelisk housing
    bodyG.fillStyle(deep, 0.92);
    bodyG.beginPath();
    bodyG.moveTo(-16, -22); bodyG.lineTo(-12, -28); bodyG.lineTo(12, -28); bodyG.lineTo(16, -22);
    bodyG.lineTo(14, 10); bodyG.lineTo(-14, 10);
    bodyG.closePath(); bodyG.fillPath();
    bodyG.fillStyle(col, 0.2);
    bodyG.fillRoundedRect(-10, -24, 20, 30, 3);
    bodyG.lineStyle(1.5, col, 0.65);
    bodyG.strokeRoundedRect(-14, -26, 28, 36, 4);

    // Energy core (centre lens, no face)
    bodyG.fillStyle(col, 0.5);
    bodyG.fillCircle(0, -12, 5);
    bodyG.fillStyle(hi, 0.65);
    bodyG.fillCircle(0, -13, 3);
    bodyG.fillStyle(0xffffff, 0.4);
    bodyG.fillCircle(0, -14, 1.5);
    bodyG.lineStyle(1, hi, 0.5);
    bodyG.strokeCircle(0, -12, 6);

    // Rune bands
    bodyG.fillStyle(col, 0.18);
    bodyG.fillRect(-8, -4, 16, 2);
    bodyG.fillRect(-6, 2, 12, 2);

    // Lower vent glow
    bodyG.fillStyle(col, 0.3);
    bodyG.fillRect(-4, 6, 8, 2);

    // Base tendrils
    bodyG.lineStyle(1, col, 0.2);
    bodyG.lineBetween(-10, 6, -16, 14);
    bodyG.lineBetween(10, 6, 16, 14);
    bodyG.fillStyle(col, 0.12);
    bodyG.fillCircle(-16, 14, 3);
    bodyG.fillCircle(16, 14, 3);
    container.add(bodyG);

    const hpBarBg = this.add.rectangle(0, -28, 30, 4, 0x222222, 0.8);
    const hpBarFill = this.add.rectangle(0, -28, 30, 4, col, 0.9);
    container.add([hpBarBg, hpBarFill]);

    const overlap = this.physics.add.overlap(this.bossProjectiles, sprite, (first, second) => {
      const hit = this.resolveHitObjects(first, second, "projectile_boss");
      if (!hit) return;
      const { projectile } = hit;
      if (!projectile.active || !sprite.isAlive) return;
      sprite.takeDamage(projectile.damage || 10);
      this.spawnImpactEffect(sprite.x, sprite.y - 10, 0xff8888, 12);
      this.safeDeactivate(projectile);
    });

    const dur = tuning.turretDurationMs || 14000;
    const entry = {
      owner: player, sprite, container, hpBarFill, hpBarBg,
      overlap, tuning,
      lastFireAt: this.time.now,
      expiresAt: this.time.now + dur,
      maxHp
    };
    this.soulcallerTurrets.push(entry);
    this.wireBossContactForAiSprite(sprite);
  }

  _destroyTurret(entry) {
    if (entry.container?.destroy) entry.container.destroy(true);
    if (entry.sprite?.active) {
      entry.sprite.isAlive = false;
      entry.sprite.destroy(true);
    }
  }

  updateSoulcallerTurrets(time) {
    if (!this.soulcallerTurrets?.length) return;
    this.soulcallerTurrets = this.soulcallerTurrets.filter((e) => {
      if (time >= e.expiresAt || !e.sprite?.isAlive || !e.owner?.active || this.gameState !== "battle") {
        this._destroyTurret(e);
        return false;
      }
      const t = e.tuning || {};
      e.container.setPosition(e.sprite.x, e.sprite.y);
      const hpFrac = Math.max(0, e.sprite.health / e.maxHp);
      e.hpBarFill.setScale(hpFrac, 1);
      e.hpBarFill.x = -15 * (1 - hpFrac);

      const interval = t.turretFireIntervalMs || 750;
      if (time - e.lastFireAt >= interval && !e.owner?.soulShroudActive) {
        const sx = e.sprite.x;
        const sy = e.sprite.y - 12;
        const aim = typeof this.getNearestEnemyAimForSoulcallerAt === "function"
          ? this.getNearestEnemyAimForSoulcallerAt(sx, sy)
          : this.getNearestBossAimForSoulcaller(e.owner);
        if (aim) {
          const ddx = aim.x - sx;
          const ddy = aim.y - sy;
          const len = Math.hypot(ddx, ddy) || 1;
          const atkR = Number.isFinite(t.turretAttackRange) ? t.turretAttackRange : 500;
          const projMax = Number.isFinite(t.turretProjectileMaxRange) ? t.turretProjectileMaxRange : 520;
          if (len <= atkR) {
            e.lastFireAt = time;
            const spd = t.turretProjectileSpeed || 400;
            const tex = this.textures.exists("proj_soulcaller_turret") ? "proj_soulcaller_turret" : "projectile_player";
            this.spawnPlayerProjectile(sx, sy, ddx > 0 ? 1 : -1, t.turretDamage || 5, {
              useAbsoluteVelocity: true,
              velocityX: (ddx / len) * spd,
              velocityY: (ddy / len) * spd,
              spawnOffsetX: 0,
              maxRange: projMax,
              effectColor: e.owner.definition.color,
              textureKey: tex,
              ownerPlayer: e.owner,
              style: "soulTurretBolt",
              skipMuzzleFlash: true
            });
          }
        }
      }
      return true;
    });
  }

  // ─── Soulcaller: decoy + soul link ──────────────────────────────────────

  registerSoulcallerDecoy(player, tuning) {
    if (this.gameState !== "battle" || !player?.isAlive) return;
    this.removeSoulcallerDecoy(player);
    const col = player.definition.color || 0x58d8e8;
    const dx = player.x;
    const dy = player.y;
    const maxHp = tuning.decoyHealth || 80;
    const sprite = this.physics.add.sprite(dx, dy, "pixel").setScale(1).setAlpha(0);
    sprite.body.setSize(28, 44);
    sprite.body.allowGravity = true;
    sprite.body.setCollideWorldBounds(true);
    this.physics.add.collider(sprite, this.platforms);
    sprite.setDepth(DEPTH.PLAYER);
    sprite.isAlive = true;
    sprite.isDecoy = true;
    sprite.health = maxHp;
    sprite.maxHealth = maxHp;
    sprite.movementLockType = null;
    sprite.movementLockUntil = 0;
    sprite.invulnerableUntil = 0;
    sprite.bossContactGraceUntil = 0;
    const entry = { owner: player, sprite, container: null, maxHp };
    sprite.takeDamage = (amount) => {
      const dmg = Number.isFinite(amount) ? Math.max(1, amount) : 1;
      sprite.health = Math.max(0, sprite.health - dmg);
      if (sprite.health <= 0) {
        sprite.isAlive = false;
        this._destroyDecoy(entry);
      }
    };

    const container = this.add.container(dx, dy);
    container.setDepth(DEPTH.PLAYER_FX);
    const bodyG = this.add.graphics();
    const dhi = 0xb0f0ff;
    bodyG.fillStyle(col, 0.08);
    bodyG.fillEllipse(0, 0, 36, 50);
    bodyG.fillStyle(0x081620, 0.5);
    bodyG.beginPath();
    bodyG.moveTo(-14, -10); bodyG.lineTo(-10, -24); bodyG.lineTo(0, -28); bodyG.lineTo(10, -24); bodyG.lineTo(14, -10);
    bodyG.lineTo(12, 18); bodyG.lineTo(-12, 18);
    bodyG.closePath(); bodyG.fillPath();
    bodyG.fillStyle(col, 0.18);
    bodyG.fillRoundedRect(-10, -20, 20, 32, 4);
    bodyG.lineStyle(1.5, col, 0.45);
    bodyG.strokeRoundedRect(-12, -22, 24, 38, 5);
    bodyG.fillStyle(dhi, 0.7);
    bodyG.fillEllipse(-4, -16, 4, 5);
    bodyG.fillEllipse(4, -16, 4, 5);
    bodyG.fillStyle(0x0a2030, 0.5);
    bodyG.fillCircle(-4, -16, 1.2);
    bodyG.fillCircle(4, -16, 1.2);
    bodyG.fillStyle(col, 0.12);
    bodyG.fillRect(-6, -4, 12, 2);
    bodyG.lineStyle(1, col, 0.15);
    bodyG.lineBetween(-8, 14, -14, 22);
    bodyG.lineBetween(8, 14, 14, 22);
    bodyG.fillStyle(col, 0.08);
    bodyG.fillCircle(-14, 22, 3);
    bodyG.fillCircle(14, 22, 3);
    container.add(bodyG);
    entry.container = container;

    this.physics.add.overlap(this.bossProjectiles, sprite, (first, second) => {
      const hit = this.resolveHitObjects(first, second, "projectile_boss");
      if (!hit) return;
      const { projectile } = hit;
      if (!projectile.active || !sprite.isAlive) return;
      sprite.takeDamage(projectile.damage || 10);
      this.spawnImpactEffect(sprite.x, sprite.y - 10, 0xff8888, 12);
      this.safeDeactivate(projectile);
    });

    this.soulcallerDecoys.push(entry);
    this.wireBossContactForAiSprite(sprite);
    player.soulShroudDecoy = sprite;
  }

  removeSoulcallerDecoy(player) {
    this.soulcallerDecoys = this.soulcallerDecoys.filter((e) => {
      if (e.owner === player) { this._destroyDecoy(e); return false; }
      return true;
    });
  }

  _destroyDecoy(entry) {
    if (entry.container?.destroy) entry.container.destroy(true);
    if (entry.sprite?.active) {
      entry.sprite.isAlive = false;
      entry.sprite.destroy(true);
    }
  }

  updateSoulcallerDecoys(time) {
    if (!this.soulcallerDecoys?.length) return;
    this.soulcallerDecoys = this.soulcallerDecoys.filter((e) => {
      if (!e.sprite?.isAlive || !e.owner?.active || this.gameState !== "battle") {
        this._destroyDecoy(e);
        if (e.owner?.soulShroudActive) e.owner.endSoulShroud(false);
        return false;
      }
      e.container?.setPosition(e.sprite.x, e.sprite.y);
      return true;
    });
  }

  spawnSoulLinkProjectile(owner, targetAlly) {
    if (!owner?.active || !targetAlly?.active || !targetAlly.isAlive) return;
    const col = owner.definition.color || 0x58d8e8;
    const tex = this.textures.exists("proj_summoner") ? "proj_summoner" : "projectile_player";
    const dx = targetAlly.x - owner.x;
    const dy = (targetAlly.y - 12) - owner.y;
    const len = Math.hypot(dx, dy) || 1;
    const spd = owner._soulShroudTuning?.soulLinkProjectileSpeed || 550;
    this.spawnPlayerProjectile(owner.x, owner.y - 8, dx > 0 ? 1 : -1, 0, {
      useAbsoluteVelocity: true,
      velocityX: (dx / len) * spd,
      velocityY: (dy / len) * spd,
      spawnOffsetX: 0,
      maxRange: 1200,
      effectColor: col,
      textureKey: tex,
      ownerPlayer: owner,
      style: "spiritBolt",
      skipMuzzleFlash: false,
      soulLinkTarget: targetAlly,
      soulLinkOwner: owner
    });
  }

  applySoulLink(owner, ally) {
    if (!owner || !ally?.isAlive) return;
    const t = owner._soulShroudTuning || {};
    const durLeft = Math.max(0, (owner.soulShroudExpiresAt || 0) - this.time.now);
    if (durLeft <= 200) return;
    const dmgMult = t.allyDamageMult || 1.5;
    const spdMult = t.allySpeedMult || 1.5;
    ally.applyOutgoingDamageBuff(dmgMult, durLeft);
    ally.applySpeedBuff(spdMult, durLeft);
    if (typeof owner.onSoulLinkConnected === "function") {
      owner.onSoulLinkConnected(ally);
    }
    this.spawnSoulLinkBondVfx(owner, ally);
    this.spawnBuffIcon(ally, "heal", 0x58d8e8, Math.min(1200, durLeft));
  }

  clearSoulLinkBondVfxForOwner(owner) {
    if (!this.soulLinkBondFxList?.length) return;
    this.soulLinkBondFxList = this.soulLinkBondFxList.filter((e) => {
      if (e.owner === owner) {
        if (this.tweens?.killTweensOf && e.container) this.tweens.killTweensOf(e.container);
        if (e.container?.destroy) e.container.destroy(true);
        return false;
      }
      return true;
    });
  }

  spawnSoulLinkBondVfx(owner, ally) {
    if (this.isTrueHitboxView() || !ally?.active) return;
    this.clearSoulLinkBondVfxForOwner(owner);
    const teal = 0x40c8d8;
    const hi = 0xb0f0ff;
    const deep = 0x0a2030;
    const c = this.add.container(ally.x, ally.y - 14);
    c.setDepth(DEPTH.PLAYER_FX + 2);

    const outerAura = this.add.ellipse(0, 0, 48, 56, teal, 0.06);
    if (outerAura.setBlendMode) outerAura.setBlendMode(Phaser.BlendModes.ADD);
    c.add(outerAura);

    const wisps = [];
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const ox = Math.cos(ang) * 16;
      const oy = Math.sin(ang) * 10 - 2;
      const w = this.add.ellipse(ox, oy, 7 + (i % 2) * 3, 12 + (i % 3) * 2, teal, 0.18 + (i % 2) * 0.08);
      w.setStrokeStyle(1, hi, 0.35);
      if (w.setBlendMode) w.setBlendMode(Phaser.BlendModes.ADD);
      wisps.push(w);
      c.add(w);
    }

    const coreRing = this.add.circle(0, -2, 18, 0x000000, 0);
    coreRing.setStrokeStyle(2, teal, 0.4);
    if (coreRing.setBlendMode) coreRing.setBlendMode(Phaser.BlendModes.ADD);
    c.add(coreRing);

    const hoodShape = this.add.ellipse(0, -16, 16, 14, deep, 0.6);
    c.add(hoodShape);

    const eyeL = this.add.ellipse(-4, -16, 4, 5, hi, 0.9);
    const eyeR = this.add.ellipse(4, -16, 4, 5, hi, 0.9);
    const pupilL = this.add.circle(-4, -16, 1.2, deep, 0.7);
    const pupilR = this.add.circle(4, -16, 1.2, deep, 0.7);
    c.add([eyeL, eyeR, pupilL, pupilR]);

    const crownOrb = this.add.circle(0, -26, 3.5, teal, 0.55);
    crownOrb.setStrokeStyle(1, hi, 0.5);
    c.add(crownOrb);

    this.tweens.add({ targets: wisps, alpha: { from: 0.2, to: 0.5 }, duration: 500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: [eyeL, eyeR], alpha: { from: 0.7, to: 1 }, duration: 350, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: outerAura, scaleX: { from: 0.9, to: 1.1 }, scaleY: { from: 0.9, to: 1.1 }, alpha: { from: 0.04, to: 0.1 }, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: crownOrb, alpha: { from: 0.4, to: 0.7 }, y: { from: -26, to: -28 }, duration: 600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    this.soulLinkBondFxList = this.soulLinkBondFxList || [];
    this.soulLinkBondFxList.push({ owner, ally, container: c, flames: wisps, eyeL, eyeR });
  }

  updateSoulLinkBondVfx(time) {
    if (!this.soulLinkBondFxList?.length) return;
    this.soulLinkBondFxList = this.soulLinkBondFxList.filter((e) => {
      if (!e.owner?.soulShroudSoulLinked || !e.ally?.active || !e.ally.isAlive || !e.container?.active) {
        if (this.tweens?.killTweensOf && e.container) this.tweens.killTweensOf(e.container);
        if (e.container?.destroy) e.container.destroy(true);
        return false;
      }
      e.container.setPosition(e.ally.x, e.ally.y - 14);
      const pulse = 0.92 + 0.08 * Math.sin(time * 0.005);
      e.container.setScale(pulse);
      return true;
    });
  }

  // ─── Soulcaller: debuff VFX on boss ─────────────────────────────────────

  spawnSpiritDebuffVfx(target, charged) {
    if (this.isTrueHitboxView() || !target?.active) return;
    const tx = target.x;
    const ty = target.y - 20;
    if (!charged) {
      const ring = this.add.circle(tx, ty, 18, 0x58d8e8, 0.12);
      ring.setStrokeStyle(2, 0x58d8e8, 0.6);
      ring.setDepth(DEPTH.BOSS + 1);
      this.tweens.add({ targets: ring, scaleX: 1.8, scaleY: 1.8, alpha: 0, duration: 400, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI * 2 * i) / 4 + Math.random() * 0.3;
        const sp = this.add.circle(tx, ty, 2, 0xb0f0ff, 0.6);
        sp.setDepth(DEPTH.BOSS + 2);
        this.tweens.add({ targets: sp, x: tx + Math.cos(a) * 20, y: ty + Math.sin(a) * 20 - 6, alpha: 0, duration: 350, ease: "Quad.easeOut", onComplete: () => sp.destroy() });
      }
    } else {
      const ring1 = this.add.circle(tx, ty, 24, 0xff5555, 0.18);
      ring1.setStrokeStyle(2.5, 0xff6666, 0.8);
      ring1.setDepth(DEPTH.BOSS + 1);
      const ring2 = this.add.circle(tx, ty, 16, 0x58d8e8, 0.1);
      ring2.setStrokeStyle(1.5, 0x58d8e8, 0.5);
      ring2.setDepth(DEPTH.BOSS + 1);
      this.tweens.add({ targets: ring1, scaleX: 2.4, scaleY: 2.4, alpha: 0, duration: 550, ease: "Quad.easeOut", onComplete: () => ring1.destroy() });
      this.tweens.add({ targets: ring2, scaleX: 2, scaleY: 2, alpha: 0, duration: 450, delay: 60, ease: "Quad.easeOut", onComplete: () => ring2.destroy() });
      const cross1 = this.add.rectangle(tx, ty, 3, 22, 0xff4444, 0.75);
      const cross2 = this.add.rectangle(tx, ty, 22, 3, 0xff4444, 0.75);
      cross1.setDepth(DEPTH.BOSS + 2);
      cross2.setDepth(DEPTH.BOSS + 2);
      this.tweens.add({ targets: [cross1, cross2], alpha: 0, scaleX: 2.2, scaleY: 2.2, rotation: 0.4, duration: 500, ease: "Quad.easeOut", onComplete: () => { cross1.destroy(); cross2.destroy(); } });
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6;
        const sp = this.add.circle(tx, ty, 2.5, 0xff8888, 0.7);
        sp.setDepth(DEPTH.BOSS + 2);
        this.tweens.add({ targets: sp, x: tx + Math.cos(a) * 28, y: ty + Math.sin(a) * 28 - 4, alpha: 0, scaleX: 0.4, scaleY: 0.4, duration: 400, ease: "Quad.easeOut", onComplete: () => sp.destroy() });
      }
    }
  }

  fireSoulShroudExplosion(player, damage, radius) {
    if (!player?.active) return;
    const px = player.x;
    const py = player.y;
    const col = player.definition?.color || 0x58d8e8;

    const targets = [];
    if (this.boss?.active) {
      const dx = this.boss.x - px;
      const dy = this.boss.y - py;
      if (Math.sqrt(dx * dx + dy * dy) <= radius) targets.push(this.boss);
    }
    if (this.bossTwin?.active) {
      const dx = this.bossTwin.x - px;
      const dy = this.bossTwin.y - py;
      if (Math.sqrt(dx * dx + dy * dy) <= radius) targets.push(this.bossTwin);
    }
    for (const t of targets) {
      if (typeof t.takeDamage === "function") {
        t.takeDamage(damage, col);
      }
    }

    if (this.isTrueHitboxView()) return;
    const maxDmg = player._soulShroudTuning?.shroudExplosionMaxDamage || 30;
    const intensity = Phaser.Math.Clamp(damage / maxDmg, 0, 1);
    const isHigh = intensity >= 0.7;
    const isMed = intensity >= 0.35 && intensity < 0.7;

    if (isHigh) {
      const coreCol = 0xff6644;
      const flashCol = 0xffe8cc;
      const flash = this.add.circle(px, py, 8, 0xffffff, 0.7);
      flash.setDepth(DEPTH.PLAYER_FX + 3);
      this.tweens.add({ targets: flash, scaleX: 3, scaleY: 3, alpha: 0, duration: 180, onComplete: () => flash.destroy() });
      const ring1 = this.add.circle(px, py, 10, coreCol, 0.4);
      ring1.setStrokeStyle(4, coreCol, 0.9);
      ring1.setDepth(DEPTH.PLAYER_FX + 2);
      this.tweens.add({ targets: ring1, scaleX: radius / 10, scaleY: radius / 10, alpha: 0, duration: 450, ease: "Quad.easeOut", onComplete: () => ring1.destroy() });
      const ring2 = this.add.circle(px, py, 6, flashCol, 0.2);
      ring2.setStrokeStyle(2, flashCol, 0.6);
      ring2.setDepth(DEPTH.PLAYER_FX + 2);
      this.tweens.add({ targets: ring2, scaleX: radius / 8, scaleY: radius / 8, alpha: 0, duration: 380, delay: 40, ease: "Quad.easeOut", onComplete: () => ring2.destroy() });
      const burstCount = 14;
      for (let i = 0; i < burstCount; i++) {
        const angle = (Math.PI * 2 * i) / burstCount + Math.random() * 0.2;
        const dist = radius * (0.5 + Math.random() * 0.3);
        const sz = 2.5 + Math.random() * 2;
        const sCol = i % 3 === 0 ? 0xffffff : (i % 3 === 1 ? coreCol : col);
        const spark = this.add.circle(px, py, sz, sCol, 0.8);
        spark.setDepth(DEPTH.PLAYER_FX + 3);
        this.tweens.add({
          targets: spark,
          x: px + Math.cos(angle) * dist,
          y: py + Math.sin(angle) * dist - 6,
          alpha: 0, scaleX: 0.2, scaleY: 0.2,
          duration: 300 + Math.random() * 150,
          ease: "Quad.easeOut",
          onComplete: () => spark.destroy()
        });
      }
      for (let i = 0; i < 3; i++) {
        const a = (Math.PI * 2 * i) / 3 + 0.5;
        const streak = this.add.ellipse(px, py, 6, 18, coreCol, 0.5);
        streak.setRotation(a);
        streak.setDepth(DEPTH.PLAYER_FX + 2);
        this.tweens.add({
          targets: streak,
          x: px + Math.cos(a) * radius * 0.4,
          y: py + Math.sin(a) * radius * 0.4,
          alpha: 0, scaleX: 2.5, scaleY: 0.5,
          duration: 350,
          ease: "Quad.easeOut",
          onComplete: () => streak.destroy()
        });
      }
    } else if (isMed) {
      const ring = this.add.circle(px, py, 8, col, 0.25);
      ring.setStrokeStyle(3, col, 0.75);
      ring.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({ targets: ring, scaleX: radius / 8, scaleY: radius / 8, alpha: 0, duration: 420, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
      const inner = this.add.circle(px, py, 5, 0xb0f0ff, 0.35);
      inner.setDepth(DEPTH.PLAYER_FX + 2);
      this.tweens.add({ targets: inner, scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 250, onComplete: () => inner.destroy() });
      const burstCount = 8;
      for (let i = 0; i < burstCount; i++) {
        const angle = (Math.PI * 2 * i) / burstCount + Math.random() * 0.15;
        const dist = radius * 0.5;
        const spark = this.add.circle(px, py, 2.5, col, 0.65);
        spark.setDepth(DEPTH.PLAYER_FX + 2);
        this.tweens.add({
          targets: spark,
          x: px + Math.cos(angle) * dist,
          y: py + Math.sin(angle) * dist - 4,
          alpha: 0, scaleX: 0.3, scaleY: 0.3,
          duration: 340,
          ease: "Quad.easeOut",
          onComplete: () => spark.destroy()
        });
      }
    } else {
      const puff = this.add.circle(px, py, 6, col, 0.15);
      puff.setStrokeStyle(1.5, col, 0.4);
      puff.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({ targets: puff, scaleX: radius / 10, scaleY: radius / 10, alpha: 0, duration: 350, ease: "Quad.easeOut", onComplete: () => puff.destroy() });
      for (let i = 0; i < 4; i++) {
        const angle = (Math.PI * 2 * i) / 4;
        const sp = this.add.circle(px, py, 2, col, 0.4);
        sp.setDepth(DEPTH.PLAYER_FX + 1);
        this.tweens.add({
          targets: sp,
          x: px + Math.cos(angle) * radius * 0.35,
          y: py + Math.sin(angle) * radius * 0.35,
          alpha: 0,
          duration: 280,
          ease: "Quad.easeOut",
          onComplete: () => sp.destroy()
        });
      }
    }
  }

  drawBossVulnerabilityIndicator() {
    if (!this._bossVulnG) {
      this._bossVulnG = this.add.graphics();
      this._bossVulnG.setDepth(DEPTH.BOSS + 1);
    }
    this._bossVulnG.clear();
    if (!this.boss?.active) return;
    const mult = typeof this.boss.getVulnerabilityMultiplier === "function"
      ? this.boss.getVulnerabilityMultiplier() : 1;
    if (mult <= 1) return;
    const charged = mult >= 1.2;
    const bx = this.boss.x;
    const by = this.boss.y - 40;
    const time = this.time.now;
    const pulse = 0.85 + 0.15 * Math.sin(time * 0.006);
    if (charged) {
      this._bossVulnG.fillStyle(0xff5555, 0.22 * pulse);
      this._bossVulnG.fillCircle(bx, by, 10);
      this._bossVulnG.lineStyle(2, 0xff6666, 0.7 * pulse);
      this._bossVulnG.strokeCircle(bx, by, 12);
      this._bossVulnG.fillStyle(0xff4444, 0.5 * pulse);
      this._bossVulnG.fillRect(bx - 1.5, by - 6, 3, 12);
      this._bossVulnG.fillRect(bx - 6, by - 1.5, 12, 3);
    } else {
      this._bossVulnG.fillStyle(0x58d8e8, 0.15 * pulse);
      this._bossVulnG.fillCircle(bx, by, 7);
      this._bossVulnG.lineStyle(1.5, 0x58d8e8, 0.45 * pulse);
      this._bossVulnG.strokeCircle(bx, by, 9);
      this._bossVulnG.fillStyle(0xb0f0ff, 0.35 * pulse);
      this._bossVulnG.fillCircle(bx, by, 3);
    }
  }

  buildSkyriseSmokeCloudGfx(entry) {
    const r = entry.radius;
    const cx = entry.cx;
    const cy = entry.cy;
    const root = this.add.container(cx, cy);
    root.setDepth(DEPTH.PLAYER_FX);
    const hc = entry.color || 0xf7d95c;
    const br = (hc >> 16) & 0xff;
    const bg = (hc >> 8) & 0xff;
    const bb = hc & 0xff;
    const mkCol = (dr, dg, db) =>
      Phaser.Display.Color.GetColor(
        Phaser.Math.Clamp(br + dr, 0, 255),
        Phaser.Math.Clamp(bg + dg, 0, 255),
        Phaser.Math.Clamp(bb + db, 0, 255)
      );

    // dark ground shadow
    const shadow = this.add.ellipse(0, 6, r * 2.2, r * 0.6, 0x000000, 0.18);
    root.add(shadow);

    // large roiling cloud blobs at varied depths and sizes
    const blobs = [];
    for (let i = 0; i < 10; i += 1) {
      const ang = (i / 10) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.3, 0.3);
      const dist = r * Phaser.Math.FloatBetween(0.15, 0.55);
      const ox = Math.cos(ang) * dist;
      const oy = Math.sin(ang) * dist * 0.45 + Phaser.Math.Between(-6, 6);
      const blobW = r * Phaser.Math.FloatBetween(0.6, 1.1);
      const blobH = r * Phaser.Math.FloatBetween(0.28, 0.48);
      const shade = i % 3 === 0 ? -70 : i % 3 === 1 ? -45 : -30;
      const blob = this.add.ellipse(ox, oy, blobW, blobH, mkCol(shade, shade, shade - 10), 0.22);
      blob.setStrokeStyle(1.5, mkCol(shade + 30, shade + 30, shade + 20), 0.18);
      root.add(blob);
      blobs.push(blob);
      this.tweens.add({
        targets: blob,
        x: ox + Phaser.Math.FloatBetween(-8, 8),
        y: oy + Phaser.Math.Between(-10, -18),
        scaleX: Phaser.Math.FloatBetween(0.9, 1.15),
        scaleY: Phaser.Math.FloatBetween(0.85, 1.1),
        alpha: Phaser.Math.FloatBetween(0.15, 0.35),
        duration: 600 + i * 110,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
    }

    // bright inner core glow
    const coreGlow = this.add.ellipse(0, -2, r * 0.7, r * 0.32, mkCol(30, 30, 10), 0.12);
    root.add(coreGlow);
    this.tweens.add({
      targets: coreGlow,
      scaleX: 1.15,
      scaleY: 1.1,
      alpha: 0.2,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

    // outer boundary ring
    const ring = this.add.ellipse(0, 0, r * 2.1, r * 0.95, 0x000000, 0.0);
    ring.setStrokeStyle(2, mkCol(-20, -20, -25), 0.22);
    root.addAt(ring, 0);
    this.tweens.add({
      targets: ring,
      scaleX: 1.04,
      scaleY: 1.02,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

    // small rising wisps that float upward and fade
    for (let i = 0; i < 5; i += 1) {
      const wx = Phaser.Math.Between(-r * 0.5, r * 0.5);
      const wisp = this.add.ellipse(wx, 0, Phaser.Math.Between(8, 16), Phaser.Math.Between(6, 12), mkCol(-20, -20, -20), 0.15);
      root.add(wisp);
      this.tweens.add({
        targets: wisp,
        y: -Phaser.Math.Between(20, 40),
        alpha: 0,
        scaleX: 0.5,
        scaleY: 0.3,
        duration: 1200 + i * 200,
        delay: i * 300,
        repeat: -1,
        onRepeat: () => {
          wisp.x = Phaser.Math.Between(-r * 0.5, r * 0.5);
          wisp.y = Phaser.Math.Between(-4, 4);
          wisp.alpha = 0.15;
          wisp.scaleX = 1;
          wisp.scaleY = 1;
        },
        ease: "Sine.easeOut"
      });
    }

    // subtle swirl lines drawn via graphics
    const swirlGfx = this.add.graphics();
    root.add(swirlGfx);
    const swirl = { angle: 0 };
    this.tweens.add({
      targets: swirl,
      angle: Math.PI * 2,
      duration: 3000,
      repeat: -1,
      onUpdate: () => {
        swirlGfx.clear();
        swirlGfx.lineStyle(1.5, mkCol(-10, -10, -15), 0.18);
        for (let s = 0; s < 3; s += 1) {
          const base = swirl.angle + (s * Math.PI * 2) / 3;
          swirlGfx.beginPath();
          for (let t = 0; t < 8; t += 1) {
            const a = base + t * 0.25;
            const d = r * 0.2 + t * r * 0.05;
            const px = Math.cos(a) * d;
            const py = Math.sin(a) * d * 0.4;
            if (t === 0) swirlGfx.moveTo(px, py);
            else swirlGfx.lineTo(px, py);
          }
          swirlGfx.strokePath();
        }
      }
    });

    entry.gfx = root;
  }

  /** Soft glow while inside veil; heal/damage already trigger stronger tints in updateMedicBarriers. */
  applySanctuaryVeilMobTints(time) {
    const boss = this.boss;
    const twin = this.bossTwin;
    const inAnyDome = (wx, wy) =>
      this.medicBarriers.some((z) => this.pointInMedicSanctuaryDome(wx, wy, z.cx, z.cy, z.radiusX, z.radiusY));

    let bossIn = false;
    if (boss?.active) {
      bossIn = inAnyDome(boss.x, boss.y);
      if (bossIn) {
        if (time < (boss.sanctuaryDmgFlashUntil || 0)) {
          boss.setTint(0xff2222);
        } else {
          boss.setTint(0xffaaaa);
        }
      } else if (boss.sanctuaryVeilWasInside) {
        boss.clearTint();
      }
      boss.sanctuaryVeilWasInside = bossIn;
    }

    let twinIn = false;
    if (twin?.active && boss?.definition?.id === "hollowPair") {
      twinIn = inAnyDome(twin.x, twin.y);
      if (twinIn) {
        if (time < (twin.sanctuaryDmgFlashUntil || 0)) {
          twin.setTint(0xff2222);
        } else {
          twin.setTint(0xffaaaa);
        }
      } else if (twin.sanctuaryVeilWasInside) {
        twin.clearTint();
      }
      twin.sanctuaryVeilWasInside = twinIn;
    }

    this.players.forEach((p) => {
      if (!p.isAlive) return;
      const pin = inAnyDome(p.x, p.y);
      if (pin) {
        if (time < (p.sanctuaryHealFlashUntil || 0)) {
          p.setTint(0x77ffcc);
        } else {
          p.setTint(0xc8f5dd);
        }
      } else if (p.sanctuaryVeilWasInside) {
        p.clearTint();
        p.sanctuaryHealFlashUntil = 0;
      }
      p.sanctuaryVeilWasInside = pin;
    });
  }

  reflectBossProjectile(projectile, player) {
    const boss = this.boss;
    if (!projectile?.active || !boss?.active || !player?.isAlive) return;
    const dmg = projectile.damage || 10;
    const col = projectile.effectColor || 0xff8b8b;
    const dir = boss.x >= player.x ? 1 : -1;
    const w = this.scale?.width ?? 960;
    const x = Phaser.Math.Clamp(player.x + dir * 16, 20, w - 20);
    const y = player.y - 10;
    const speed = Math.min(620, Math.abs(projectile.body?.velocity?.x || 0) + 120);
    this.safeDeactivate(projectile);
    this.spawnImpactEffect(x, y, 0xa8d4ff, 14);
    this.spawnPlayerProjectile(x, y, dir, dmg, {
      speedX: speed,
      maxRange: 520,
      effectColor: col,
      style: "arrow",
      textureKey: "proj_ranger",
      ownerPlayer: player
    });
    this.spawnParrySuccessVfx(player, boss, "reflect");
  }

  /** Strong feedback when Guardian parries (melee stun or projectile return). */
  spawnParrySuccessVfx(player, boss, mode = "melee") {
    if (!player?.active) return;
    const f = player.facing >= 0 ? 1 : -1;
    let ax;
    let ay;
    if (mode === "reflect") {
      ax = player.x + f * 22;
      ay = player.y - 12;
    } else if (boss?.active) {
      ax = Phaser.Math.Linear(player.x, boss.x, 0.42);
      ay = Math.min(player.y - 16, boss.y - 24) - 10;
    } else {
      ax = player.x + f * 20;
      ay = player.y - 22;
    }
    const gold = 0xffe066;
    const flash = 0xffffff;
    const z = DEPTH.PLAYER_FX + 3;

    const ring1 = this.add.circle(ax, ay, 14, gold, 0.55);
    ring1.setStrokeStyle(4, flash, 0.95);
    ring1.setDepth(z);
    this.tweens.add({
      targets: ring1,
      radius: 52,
      alpha: 0,
      duration: 300,
      ease: "Cubic.easeOut",
      onComplete: () => ring1.destroy()
    });

    this.time.delayedCall(35, () => {
      if (this.gameState !== "battle") return;
      const ring2 = this.add.circle(ax, ay, 10, 0x88ddff, 0.5);
      ring2.setStrokeStyle(3, flash, 0.88);
      ring2.setDepth(z);
      this.tweens.add({
        targets: ring2,
        radius: 58,
        alpha: 0,
        duration: 340,
        ease: "Quad.easeOut",
        onComplete: () => ring2.destroy()
      });
    });

    this.spawnImpactEffect(ax, ay, gold, 40);
    this.spawnImpactEffect(ax + f * 8, ay - 8, flash, 24);
    this.spawnAbilityBurst(ax, ay - 4, gold, 52, 240);

    for (let i = 0; i < 10; i += 1) {
      const ang = (i / 10) * Math.PI * 2;
      const dash = this.add.rectangle(ax, ay, 20, 5, i % 2 === 0 ? gold : flash, 0.92);
      dash.setRotation(ang);
      dash.setDepth(DEPTH.PLAYER_FX + 2);
      this.tweens.add({
        targets: dash,
        x: ax + Math.cos(ang) * 46,
        y: ay + Math.sin(ang) * 46,
        alpha: 0,
        duration: 210,
        ease: "Cubic.easeOut",
        onComplete: () => dash.destroy()
      });
    }

    const label = mode === "reflect" ? "RETURN!" : "PARRY!";
    const pop = this.add.text(ax, ay - 20, label, {
      fontSize: "15px",
      color: "#fff0c8",
      fontStyle: "bold",
      fontFamily: "Consolas, Monaco, 'Courier New', monospace",
      stroke: "#1a0a00",
      strokeThickness: 5
    });
    pop.setOrigin(0.5);
    pop.setDepth(z + 1);
    this.tweens.add({
      targets: pop,
      y: ay - 48,
      alpha: 0,
      duration: 620,
      ease: "Cubic.easeOut",
      onComplete: () => pop.destroy()
    });
  }

  createBossStunIndicator(boss) {
    const root = this.add.container(boss.x, boss.y - 50);
    root.setDepth(DEPTH.BOSS_STUN_UI);
    const pad = this.add.rectangle(0, 0, 78, 20, 0x120a04, 0.88);
    pad.setStrokeStyle(2, 0xffcc55, 0.95);
    const stars = this.add.text(0, 0, "★ STUN ★", {
      fontSize: "12px",
      color: "#ffe8a0",
      fontStyle: "bold",
      fontFamily: "Consolas, Monaco, 'Courier New', monospace",
      stroke: "#2a1800",
      strokeThickness: 4
    });
    stars.setOrigin(0.5);
    root.add([pad, stars]);
    this.tweens.add({
      targets: pad,
      scaleX: { from: 0.94, to: 1.06 },
      scaleY: { from: 0.94, to: 1.06 },
      duration: 400,
      yoyo: true,
      repeat: -1
    });
    return root;
  }

  destroyBossStunIndicator(boss) {
    if (!boss?._stunIndicatorRoot) return;
    const root = boss._stunIndicatorRoot;
    if (this.tweens?.killTweensOf) {
      root.list.forEach((ch) => this.tweens.killTweensOf(ch));
      this.tweens.killTweensOf(root);
    }
    root.destroy();
    boss._stunIndicatorRoot = null;
  }

  updateBossStunIndicator(time) {
    const boss = this.boss;
    if (!boss || !boss.active || boss.health <= 0) {
      if (boss) this.destroyBossStunIndicator(boss);
      return;
    }
    const stunned = time < boss.stunnedUntil;
    if (stunned) {
      if (!boss._stunIndicatorRoot) {
        boss._stunIndicatorRoot = this.createBossStunIndicator(boss);
      }
      const off = Math.max(44, (boss.displayHeight || 64) * 0.42 + 18);
      boss._stunIndicatorRoot.setPosition(boss.x, boss.y - off);
    } else {
      this.destroyBossStunIndicator(boss);
    }
  }

  spawnSkyLanceTelegraph(strikeX, strikeY, color, windupMs, w, h, fallDelayMs = 0) {
    const c = color || 0x5ca8ff;
    const topY = Math.max(24, strikeY - 250);
    const strikeYTarget = strikeY - h * 0.42;

    const warnG = this.add.graphics();
    warnG.setDepth(DEPTH.PLAYER_FX - 1);
    warnG.fillStyle(c, 0.08);
    warnG.fillRect(strikeX - w * 0.5, strikeY - h * 0.5, w, h);
    warnG.lineStyle(1, c, 0.3);
    warnG.strokeRect(strikeX - w * 0.5, strikeY - h * 0.5, w, h);
    const warnPulse = { a: 0.08 };
    const warnTw = this.tweens.add({ targets: warnPulse, a: 0.22, duration: windupMs * 0.4, yoyo: true, repeat: 2, onUpdate: () => {
      warnG.clear(); warnG.fillStyle(c, warnPulse.a); warnG.fillRect(strikeX - w * 0.5, strikeY - h * 0.5, w, h);
      warnG.lineStyle(1, c, warnPulse.a * 2); warnG.strokeRect(strikeX - w * 0.5, strikeY - h * 0.5, w, h);
    }});

    const lineG = this.add.graphics();
    lineG.setDepth(DEPTH.PLAYER_FX);
    const tip = this.add.circle(strikeX, topY, 8, 0xffffff, 0.7);
    tip.setStrokeStyle(3, c, 0.95);
    tip.setDepth(DEPTH.PLAYER_FX + 1);

    const glow = this.add.circle(strikeX, topY, 14, c, 0.2);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    glow.setDepth(DEPTH.PLAYER_FX);

    const drawLanceLine = () => {
      lineG.clear();
      lineG.lineStyle(5, c, 0.5);
      lineG.lineBetween(strikeX, topY, strikeX, tip.y);
      lineG.lineStyle(2, 0xffffff, 0.7);
      lineG.lineBetween(strikeX, topY, strikeX, tip.y);
      lineG.lineStyle(1, c, 0.25);
      lineG.lineBetween(strikeX - 2, topY, strikeX - 2, tip.y);
      lineG.lineBetween(strikeX + 2, topY, strikeX + 2, tip.y);
    };
    drawLanceLine();

    const runFall = () => {
      let trailAcc = 0;
      this.tweens.add({
        targets: tip,
        y: strikeYTarget,
        duration: windupMs,
        ease: "Cubic.easeIn",
        onUpdate: () => {
          drawLanceLine();
          glow.y = tip.y;
          trailAcc++;
          if (trailAcc % 3 === 0) {
            const t = this.add.circle(strikeX + Phaser.Math.Between(-3, 3), tip.y + Phaser.Math.Between(0, 12), 2, 0xffffff, 0.5);
            t.setDepth(DEPTH.PLAYER_FX);
            this.tweens.add({ targets: t, y: t.y + 20, alpha: 0, duration: 120, onComplete: () => t.destroy() });
          }
        },
        onComplete: () => {
          tip.destroy(); lineG.destroy(); glow.destroy();
          if (warnTw) warnTw.stop();
          this.tweens.add({ targets: warnG, alpha: 0, duration: 120, onComplete: () => warnG.destroy() });
        }
      });
    };
    if (fallDelayMs > 0) this.time.delayedCall(fallDelayMs, runFall);
    else runFall();
  }

  spawnSkyLanceImpact(strikeX, strikeY, color, w, h) {
    if (this.isTrueHitboxView()) return;
    const c = color || 0x5ca8ff;

    const flash = this.add.circle(strikeX, strikeY, 20, 0xffffff, 0.85);
    flash.setBlendMode(Phaser.BlendModes.ADD);
    flash.setDepth(DEPTH.PLAYER_FX + 2);
    this.tweens.add({ targets: flash, scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 140, onComplete: () => flash.destroy() });

    this.spawnSkyLanceShockwaveRings(strikeX, strikeY, w, h, c);
    this.spawnImpactEffect(strikeX, strikeY - 6, c, 42);

    const pillarG = this.add.graphics();
    pillarG.setDepth(DEPTH.PLAYER_FX + 1);
    pillarG.fillStyle(c, 0.25);
    pillarG.fillRect(strikeX - 4, strikeY - h, 8, h);
    pillarG.fillStyle(0xffffff, 0.15);
    pillarG.fillRect(strikeX - 2, strikeY - h, 4, h);
    this.tweens.add({ targets: pillarG, alpha: 0, duration: 280, onComplete: () => pillarG.destroy() });

    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2;
      const sp = this.add.circle(strikeX + Math.cos(ang) * 6, strikeY + Math.sin(ang) * 4, Phaser.Math.Between(2, 4), i % 3 === 0 ? 0xffffff : c, 0.9);
      sp.setBlendMode(Phaser.BlendModes.ADD);
      sp.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({
        targets: sp,
        x: strikeX + Math.cos(ang) * (w * 0.5 + Phaser.Math.Between(4, 24)),
        y: strikeY + Math.sin(ang) * (h * 0.3 + Phaser.Math.Between(2, 14)),
        alpha: 0, scaleX: 0.2, scaleY: 0.2,
        duration: 300, ease: "Cubic.easeOut", onComplete: () => sp.destroy()
      });
    }

    for (let i = 0; i < 6; i++) {
      const debX = strikeX + Phaser.Math.Between(-w * 0.4, w * 0.4);
      const deb = this.add.rectangle(debX, strikeY + 4, Phaser.Math.Between(3, 7), Phaser.Math.Between(3, 7), c, 0.7);
      deb.setRotation(Phaser.Math.FloatBetween(0, Math.PI));
      deb.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({ targets: deb, y: strikeY - Phaser.Math.Between(15, 40), x: debX + Phaser.Math.Between(-12, 12), alpha: 0, angle: deb.angle + Phaser.Math.Between(-90, 90), duration: 320, ease: "Quad.easeOut", onComplete: () => deb.destroy() });
    }
  }

  spawnSkyLanceShockwaveRings(strikeX, strikeY, w, h, color) {
    const maxW = Math.max(40, w * 1.15);
    const maxH = Math.max(16, h * 0.55);
    for (let i = 0; i < 4; i++) {
      this.time.delayedCall(i * 45, () => {
        if (this.gameState !== "battle") return;
        const ring = this.add.ellipse(strikeX, strikeY + 2, maxW * 0.25, maxH * 0.3, color, 0);
        ring.setStrokeStyle(4 - i, color, 0.95 - i * 0.15);
        ring.setDepth(DEPTH.PLAYER_FX);
        this.tweens.add({ targets: ring, scaleX: 2.8, scaleY: 2.4, alpha: 0, duration: 350, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
      });
    }
  }

  drawStrikerEvadeAmpAura(player) {
    if (this.isTrueHitboxView()) return;
    const g = player.strikerAmpAuraG;
    if (!g || !player.active) return;
    g.clear();
    const px = player.x;
    const py = player.y;
    const bw = 32;
    const bh = 48;
    const rx = 10;
    const left = px - bw * 0.5;
    const top = py - bh * 0.5;
    g.lineStyle(3.5, 0xc090ff, 0.98);
    g.strokeRoundedRect(left, top, bw, bh, rx);
    g.lineStyle(2, 0xffffff, 0.5);
    g.strokeRoundedRect(left - 4, top - 4, bw + 8, bh + 8, rx + 3);
    g.lineStyle(1.2, 0xffe8ff, 0.38);
    g.strokeRoundedRect(left + 3, top + 3, bw - 6, bh - 6, Math.max(4, rx - 4));
  }

  spawnStrikerEvadeAmpParticle(player) {
    if (this.isTrueHitboxView()) return;
    const px = player.x;
    const py = player.y;
    const side = Phaser.Math.Between(0, 3);
    let sx = px;
    let sy = py;
    if (side === 0) {
      sx = px + Phaser.Math.Between(-17, 17);
      sy = py - 27;
    } else if (side === 1) {
      sx = px + Phaser.Math.Between(-17, 17);
      sy = py + 27;
    } else if (side === 2) {
      sx = px - 19;
      sy = py + Phaser.Math.Between(-22, 22);
    } else {
      sx = px + 19;
      sy = py + Phaser.Math.Between(-22, 22);
    }
    const p = this.add.circle(sx, sy, Phaser.Math.Between(2, 5), 0xe8c8ff, 0.92);
    p.setBlendMode(Phaser.BlendModes.ADD);
    p.setDepth(DEPTH.PLAYER_FX + 2);
    this.tweens.add({
      targets: p,
      y: sy + Phaser.Math.Between(-14, -28),
      x: sx + Phaser.Math.Between(-10, 10),
      alpha: 0,
      scaleX: 0.15,
      scaleY: 0.15,
      duration: 340,
      ease: "Quad.easeOut",
      onComplete: () => p.destroy()
    });
  }

  spawnChargeShotMuzzleBurst(x, y, color, heat) {
    if (this.isTrueHitboxView()) return;
    const u = Phaser.Math.Clamp(Number.isFinite(heat) ? heat : 0, 0, 1);

    const flash = this.add.circle(x, y, 14 + u * 10, 0xffffff, 0.6 + u * 0.2);
    flash.setBlendMode(Phaser.BlendModes.ADD);
    flash.setDepth(DEPTH.PLAYER_FX + 2);
    this.tweens.add({ targets: flash, scaleX: 2 + u, scaleY: 2 + u, alpha: 0, duration: 100, onComplete: () => flash.destroy() });

    const core = this.add.circle(x, y, 10 + u * 8, color, 0.6);
    core.setBlendMode(Phaser.BlendModes.ADD);
    core.setStrokeStyle(3, 0xffffff, 0.9);
    core.setDepth(DEPTH.PLAYER_FX + 1);
    this.tweens.add({ targets: core, radius: 30 + u * 20, alpha: 0, duration: 220, ease: "Cubic.easeOut", onComplete: () => core.destroy() });

    const ring2 = this.add.circle(x, y, 8 + u * 5, color, 0);
    ring2.setStrokeStyle(2, color, 0.5);
    ring2.setDepth(DEPTH.PLAYER_FX);
    this.tweens.add({ targets: ring2, radius: 20 + u * 14, alpha: 0, duration: 180, delay: 30, onComplete: () => ring2.destroy() });

    const numSparks = 8 + Math.round(u * 4);
    for (let i = 0; i < numSparks; i++) {
      const ang = (i / numSparks) * Math.PI * 2;
      const sp = this.add.circle(x + Math.cos(ang) * 6, y + Math.sin(ang) * 4, 2 + u * 2, i % 3 === 0 ? 0xffffff : color, 0.8);
      sp.setBlendMode(Phaser.BlendModes.ADD);
      sp.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: sp,
        x: x + Math.cos(ang) * (24 + u * 14),
        y: y + Math.sin(ang) * (18 + u * 10),
        alpha: 0, scaleX: 0.3, scaleY: 0.3,
        duration: 260, ease: "Quad.easeOut", onComplete: () => sp.destroy()
      });
    }

    if (u > 0.5) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const ray = this.add.rectangle(x, y, 2, 12 + u * 10, 0xffffff, 0.4);
        ray.setRotation(a);
        ray.setDepth(DEPTH.PLAYER_FX + 1);
        this.tweens.add({ targets: ray, scaleY: 1.8, alpha: 0, duration: 150, onComplete: () => ray.destroy() });
      }
    }
  }

  spawnChargeBoltTailParticle(x, y, color, scaleHint) {
    if (this.isTrueHitboxView()) return;
    const s = Math.max(0.2, scaleHint || 0.5);
    const r = Phaser.Math.Clamp(2 + s * 5, 2, 8);
    const p = this.add.circle(x, y, r, color, 0.65);
    p.setBlendMode(Phaser.BlendModes.ADD);
    p.setDepth(DEPTH.PLAYER_FX - 1);
    this.tweens.add({
      targets: p,
      scaleX: 0.2,
      scaleY: 0.2,
      alpha: 0,
      duration: 180 + Math.random() * 80,
      onComplete: () => p.destroy()
    });
  }

  spawnShieldBurstVfx(x, y, radius, color) {
    if (this.isTrueHitboxView()) return;
    const c = color || 0xff8b8b;
    const r = Math.max(48, radius || 100);
    const core = this.add.circle(x, y - 8, 18, 0xfff0f0, 0.45);
    core.setBlendMode(Phaser.BlendModes.ADD);
    core.setStrokeStyle(4, 0xffffff, 0.95);
    core.setDepth(DEPTH.PLAYER_FX + 1);
    this.tweens.add({
      targets: core,
      scaleX: 2.2,
      scaleY: 2.2,
      alpha: 0,
      duration: 280,
      ease: "Cubic.easeOut",
      onComplete: () => core.destroy()
    });

    for (let wave = 0; wave < 3; wave += 1) {
      this.time.delayedCall(wave * 70, () => {
        if (this.gameState !== "battle") return;
        const ring = this.add.circle(x, y - 6, r * 0.35, c, 0);
        ring.setStrokeStyle(4, c, 0.92);
        ring.setDepth(DEPTH.PLAYER_FX);
        this.tweens.add({
          targets: ring,
          radius: r * 1.05,
          alpha: 0,
          duration: 380,
          ease: "Quad.easeOut",
          onComplete: () => ring.destroy()
        });
      });
    }

    const hex = 8;
    for (let i = 0; i < hex; i += 1) {
      const ang = (i / hex) * Math.PI * 2 - Math.PI / 2;
      const shard = this.add.rectangle(x, y - 8, 10, 22, 0xffccd0, 0.75);
      shard.setStrokeStyle(2, 0xffffff, 0.7);
      shard.setRotation(ang + Math.PI / 2);
      shard.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: shard,
        x: x + Math.cos(ang) * (r * 0.55),
        y: y - 8 + Math.sin(ang) * (r * 0.45),
        alpha: 0,
        angle: shard.angle + Phaser.Math.Between(-40, 40),
        duration: 320,
        ease: "Cubic.easeOut",
        onComplete: () => shard.destroy()
      });
    }

    for (let j = 0; j < 16; j += 1) {
      const a = (j / 16) * Math.PI * 2;
      const spark = this.add.circle(x, y - 6, Phaser.Math.Between(2, 4), j % 2 ? c : 0xffffff, 0.9);
      spark.setBlendMode(Phaser.BlendModes.ADD);
      spark.setDepth(DEPTH.PLAYER_FX + 2);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(a) * Phaser.Math.Between(30, r * 0.75),
        y: y - 6 + Math.sin(a) * Phaser.Math.Between(24, r * 0.65),
        alpha: 0,
        duration: 400,
        ease: "Quad.easeOut",
        onComplete: () => spark.destroy()
      });
    }

    this.spawnAuraPulse(x, y - 6, c, r * 0.95, 260);
    const inner = this.add.circle(x, y - 6, r * 0.4, 0xffffff, 0.08);
    inner.setStrokeStyle(2, c, 0.55);
    inner.setDepth(DEPTH.PLAYER_FX - 1);
    this.tweens.add({
      targets: inner,
      alpha: 0.35,
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 200,
      yoyo: true,
      repeat: 1,
      onComplete: () => inner.destroy()
    });
  }

  spawnShieldBurstImpactFlare(x, y, color) {
    if (this.isTrueHitboxView()) return;
    const c = color || 0xff8b8b;
    const flare = this.add.circle(x, y, 16, 0xffffff, 0.55);
    flare.setBlendMode(Phaser.BlendModes.ADD);
    flare.setStrokeStyle(3, c, 1);
    flare.setDepth(DEPTH.PLAYER_FX + 2);
    this.tweens.add({
      targets: flare,
      radius: 48,
      alpha: 0,
      duration: 220,
      onComplete: () => flare.destroy()
    });
    this.spawnImpactEffect(x, y, c, 28);
  }

  /**
   * Static circular sanctuary at cast location: bright green ring, transparent green fill, edge particles.
   * @returns {Phaser.GameObjects.Container|null}
   */
  spawnSanctuaryDomeVisual(entry, radius, color, durationMs) {
    const ax = entry?.visualAnchorX;
    const ay = entry?.visualAnchorY;
    if (!Number.isFinite(ax) || !Number.isFinite(ay)) return null;
    if (this.isTrueHitboxView()) return null;
    const safeDur = Math.max(400, durationMs || 3000);
    const r = Math.max(40, radius);
    const cyOff = -18;
    const brightBorder = 0x33ff99;
    const fillGreen = 0x228855;

    const cont = this.add.container(ax, ay);
    cont.setDepth(DEPTH.PLAYER_FX);

    const disk = this.add.circle(0, cyOff, r, fillGreen, 0.14);
    disk.setStrokeStyle(5, brightBorder, 0.98);
    cont.add(disk);

    const innerSheen = this.add.circle(0, cyOff, r * 0.85, 0x33aa66, 0.08);
    innerSheen.setStrokeStyle(1, brightBorder, 0.25);
    cont.add(innerSheen);

    const runeG = this.add.graphics();
    cont.add(runeG);
    let runeRot = 0;
    const drawDomeRunes = () => {
      runeG.clear();
      runeG.lineStyle(1, brightBorder, 0.35);
      runeG.strokeCircle(0, cyOff, r * 0.7);
      for (let i = 0; i < 8; i++) {
        const a = runeRot + (i / 8) * Math.PI * 2;
        const rx = Math.cos(a) * r * 0.7;
        const ry = cyOff + Math.sin(a) * r * 0.7;
        runeG.fillStyle(brightBorder, 0.5);
        runeG.fillCircle(rx, ry, 2);
        const a2 = runeRot + ((i + 1) / 8) * Math.PI * 2;
        runeG.lineStyle(1, brightBorder, 0.15);
        runeG.lineBetween(rx, ry, Math.cos(a2) * r * 0.7, cyOff + Math.sin(a2) * r * 0.7);
      }
    };
    drawDomeRunes();

    const crossG = this.add.graphics();
    cont.add(crossG);
    crossG.fillStyle(0xffffff, 0.2);
    crossG.fillRect(-2, cyOff - 10, 4, 20);
    crossG.fillRect(-10, cyOff - 2, 20, 4);

    const t0 = this.time.now;
    const rotEvt = this.time.addEvent({ delay: 40, loop: true, callback: () => {
      if (this.gameState !== "battle" || this.time.now - t0 > safeDur - 150) { rotEvt.remove(); return; }
      runeRot += 0.012;
      drawDomeRunes();
    }});

    let edgeEv = null;
    edgeEv = this.time.addEvent({ delay: 55, loop: true, callback: () => {
      if (this.gameState !== "battle" || this.time.now - t0 > safeDur - 120) { if (edgeEv) edgeEv.remove(); return; }
      const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const ox = Math.cos(ang) * r;
      const oy = cyOff + Math.sin(ang) * r;
      const part = this.add.circle(ox, oy, Phaser.Math.Between(2, 4), 0xaaffcc, 0.85);
      part.setStrokeStyle(1, brightBorder, 0.5);
      cont.add(part);
      const dist = Phaser.Math.Between(16, 34);
      this.tweens.add({
        targets: part, x: ox + Math.cos(ang) * dist, y: oy + Math.sin(ang) * dist,
        alpha: 0, scaleX: 0.2, scaleY: 0.2, duration: 280 + Phaser.Math.Between(0, 120),
        ease: "Quad.easeOut", onComplete: () => { if (part.active) part.destroy(); }
      });
    }});

    const moteEvt = this.time.addEvent({ delay: 200, loop: true, callback: () => {
      if (this.gameState !== "battle" || this.time.now - t0 > safeDur - 200) { moteEvt.remove(); return; }
      const mx = Phaser.Math.Between(-r * 0.6, r * 0.6);
      const my = cyOff + Phaser.Math.Between(-r * 0.4, r * 0.4);
      const mote = this.add.circle(mx, my, Phaser.Math.Between(1, 3), 0xffffff, 0.5);
      mote.setBlendMode(Phaser.BlendModes.ADD);
      cont.add(mote);
      this.tweens.add({ targets: mote, y: my - Phaser.Math.Between(12, 28), alpha: 0, duration: 400 + Phaser.Math.Between(0, 200), onComplete: () => { if (mote.active) mote.destroy(); } });
    }});

    const twPulse = this.tweens.add({ targets: disk, scaleX: { from: 1, to: 1.03 }, scaleY: { from: 1, to: 1.03 }, duration: 720, yoyo: true, repeat: Math.max(2, Math.floor(safeDur / 720)) });

    this.tweens.add({
      targets: cont, alpha: 0, duration: Math.max(220, safeDur - 120), delay: Math.max(0, safeDur - 380),
      onComplete: () => {
        if (edgeEv) edgeEv.remove(); if (rotEvt) rotEvt.remove(); if (moteEvt) moteEvt.remove();
        if (twPulse) twPulse.stop();
        if (!cont?.scene) return;
        if (innerSheen?.active) innerSheen.destroy();
        if (disk?.active) disk.destroy();
        if (runeG?.active) runeG.destroy();
        if (crossG?.active) crossG.destroy();
        if (cont.active) cont.destroy(true);
      }
    });

    return cont;
  }

  spawnMeleeSwing(player, weaponColor, options = {}) {
    if (this.isTrueHitboxView()) return;
    const width = options.width || 28;
    const height = options.height || 9;
    const offsetX = options.offsetX || 22;
    const offsetY = options.offsetY || -6;
    const slashAngle = options.angle ?? (player.facing > 0 ? 16 : -16);
    const style = options.style || "slash";
    const color = weaponColor || 0xffffff;
    const travel = style === "thrust" ? 18 : style === "cleave" ? 13 : 10;
    const fadeMs = style === "double" ? 90 : 110;
    const stretchX = style === "thrust" ? 1.36 : 1.22;
    const stretchY = style === "cleave" ? 1.18 : 1.04;
    const slash = this.add.rectangle(
      player.x + player.facing * offsetX,
      player.y + offsetY,
      width,
      height,
      color,
      0.86
    );
    slash.setDepth(DEPTH.PLAYER_FX);
    slash.angle = slashAngle;
    const ghost = this.add.rectangle(
      slash.x - player.facing * 9,
      slash.y + 2,
      width * 0.82,
      Math.max(5, height - 2),
      color,
      0.52
    );
    ghost.setDepth(DEPTH.PLAYER_FX);
    ghost.angle = slashAngle;
    const flare = this.add.circle(
      slash.x + player.facing * (style === "thrust" ? width * 0.5 : width * 0.3),
      slash.y,
      style === "cleave" ? 6 : 5,
      color,
      0.78
    );
    flare.setDepth(DEPTH.PLAYER_FX + 1);
    this.tweens.add({
      targets: [slash, ghost, flare],
      x: slash.x + player.facing * travel,
      alpha: 0,
      scaleX: stretchX,
      scaleY: stretchY,
      duration: fadeMs,
      onComplete: () => {
        slash.destroy();
        ghost.destroy();
        flare.destroy();
      }
    });
  }

  spawnShieldArcSwing(player, color, options = {}) {
    if (this.isTrueHitboxView()) return;
    if (!player || !player.active) return;
    const facing = player.facing > 0 ? 1 : -1;
    const baseX = player.x + facing * (options.offsetX || 16);
    const baseY = player.y + (options.offsetY || -6);
    const radius = Math.max(22, options.radius || 58);
    const spreadDeg = Phaser.Math.Clamp(Number.isFinite(options.spreadDeg) ? options.spreadDeg : 96, 24, 160);
    const halfRad = Phaser.Math.DegToRad(spreadDeg * 0.5);
    const forward = facing > 0 ? 0 : Math.PI;
    const startRad = forward - halfRad * 0.92;
    const endRad = forward + halfRad * 0.92;
    const durationMs = Phaser.Math.Clamp(Number.isFinite(options.durationMs) ? options.durationMs : 120, 50, 3000);
    const c = color || 0xff8b8b;
    const anim = { t: 0, alpha: 1 };
    const arc = this.add.graphics();
    arc.setDepth(DEPTH.PLAYER_FX);

    const shield = this.add.graphics();
    shield.setDepth(DEPTH.PLAYER_FX + 1);
    const drawShield = (sx, sy, ang, a) => {
      shield.clear();
      shield.save && shield.save();
      const cos = Math.cos(ang); const sin = Math.sin(ang);
      const hw = 10; const hh = 13;
      const pts = [[-hw, -hh], [hw, -hh], [hw, hh * 0.6], [0, hh], [-hw, hh * 0.6]];
      shield.fillStyle(c, 0.9 * a);
      shield.beginPath();
      pts.forEach(([px, py], idx) => {
        const rx = sx + px * cos - py * sin;
        const ry = sy + px * sin + py * cos;
        if (idx === 0) shield.moveTo(rx, ry); else shield.lineTo(rx, ry);
      });
      shield.closePath(); shield.fillPath();
      shield.lineStyle(2, 0xffffff, 0.7 * a);
      shield.beginPath();
      pts.forEach(([px, py], idx) => {
        const rx = sx + px * cos - py * sin;
        const ry = sy + px * sin + py * cos;
        if (idx === 0) shield.moveTo(rx, ry); else shield.lineTo(rx, ry);
      });
      shield.closePath(); shield.strokePath();
      shield.fillStyle(0xffffff, 0.25 * a);
      shield.fillCircle(sx - 2 * cos, sy - 2 * sin, 4);
    };

    this.tweens.add({
      targets: anim,
      t: 1,
      alpha: 0,
      duration: durationMs,
      onUpdate: () => {
        const currentRad = Phaser.Math.Linear(startRad, endRad, anim.t);
        const a = anim.alpha;
        arc.clear();

        arc.lineStyle(12, c, 0.3 * a);
        arc.beginPath(); arc.arc(baseX, baseY, radius + 3, startRad, currentRad, false); arc.strokePath();

        arc.lineStyle(8, c, 0.92 * a);
        arc.beginPath(); arc.arc(baseX, baseY, radius, startRad, currentRad, false); arc.strokePath();

        arc.lineStyle(3, 0xffffff, 0.6 * a);
        arc.beginPath(); arc.arc(baseX, baseY, radius - 3, startRad, currentRad, false); arc.strokePath();

        if (anim.t > 0.15 && anim.t < 0.85) {
          const trailRad = Phaser.Math.Linear(startRad, endRad, Math.max(0, anim.t - 0.15));
          arc.lineStyle(4, 0xffffff, 0.15 * a);
          arc.beginPath(); arc.arc(baseX, baseY, radius * 1.12, trailRad, currentRad, false); arc.strokePath();
        }

        const sx = baseX + Math.cos(currentRad) * radius;
        const sy = baseY + Math.sin(currentRad) * radius;
        const shieldAng = currentRad + (facing > 0 ? Math.PI * 0.56 : -Math.PI * 0.56);
        drawShield(sx, sy, shieldAng, a);
      },
      onComplete: () => {
        arc.destroy();
        shield.destroy();
      }
    });

    this.time.delayedCall(Math.round(durationMs * 0.6), () => {
      if (this.gameState !== "battle") return;
      const endSx = baseX + Math.cos(endRad) * radius;
      const endSy = baseY + Math.sin(endRad) * radius;
      for (let i = 0; i < 5; i++) {
        const sp = this.add.circle(endSx, endSy, Phaser.Math.Between(1, 3), i % 2 === 0 ? 0xffffff : c, 0.75);
        sp.setDepth(DEPTH.PLAYER_FX + 2);
        const a = endRad + Phaser.Math.FloatBetween(-0.5, 0.5);
        this.tweens.add({ targets: sp, x: endSx + Math.cos(a) * Phaser.Math.Between(10, 25), y: endSy + Math.sin(a) * Phaser.Math.Between(10, 20), alpha: 0, duration: 140 + i * 15, onComplete: () => sp.destroy() });
      }
    });
  }

  spawnVanguardMomentumFlare(player, victim) {
    if (!player?.active || !victim?.active) return;
    const col = 0xcfe6ff;
    const ring = this.add.circle(victim.x, victim.y - 12, 12, col, 0);
    ring.setStrokeStyle(3, col, 0.95);
    ring.setDepth(DEPTH.PLAYER_FX + 2);
    this.tweens.add({
      targets: ring,
      scale: 2.8,
      alpha: 0,
      duration: 260,
      ease: "Cubic.easeOut",
      onComplete: () => ring.destroy()
    });
    for (let i = 0; i < 5; i += 1) {
      const ang = (i / 5) * Math.PI * 2 + Math.random() * 0.4;
      const sp = this.add.rectangle(victim.x, victim.y - 12, 10, 3, 0xffffff, 0.95);
      sp.setRotation(ang);
      sp.setDepth(DEPTH.PLAYER_FX + 2);
      this.tweens.add({
        targets: sp,
        x: victim.x + Math.cos(ang) * 28,
        y: victim.y - 12 + Math.sin(ang) * 28,
        alpha: 0,
        duration: 230,
        onComplete: () => sp.destroy()
      });
    }
  }

  spawnVanguardPierceMark(target) {
    if (!target?.active) return;
    const col = 0x89c4ff;
    const g = this.add.graphics();
    g.setDepth(DEPTH.PLAYER_FX + 1);
    const redraw = () => {
      if (!target.active) { g.destroy(); return false; }
      g.clear();
      const cx = target.x;
      const cy = target.y - 14;
      g.lineStyle(2, col, 0.92);
      for (let i = 0; i < 3; i += 1) {
        const ang = (i / 3) * Math.PI * 2 + (this.time.now * 0.002);
        const x1 = cx + Math.cos(ang) * 16;
        const y1 = cy + Math.sin(ang) * 8;
        const x2 = cx + Math.cos(ang + Math.PI) * 16;
        const y2 = cy + Math.sin(ang + Math.PI) * 8;
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.strokePath();
      }
      return true;
    };
    const evt = this.time.addEvent({ delay: 40, loop: true, callback: () => { if (!redraw()) evt.remove(); } });
    this.time.delayedCall(700, () => {
      evt.remove();
      this.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
    });
  }

  spawnVanguardSkyfallenAura(player, durationMs) {
    if (!player?.active) return;
    const col = 0x9bd2ff;
    const aura = this.add.graphics();
    aura.setDepth(DEPTH.PLAYER_FX - 1);
    let alive = true;
    const endAt = this.time.now + durationMs;
    const evt = this.time.addEvent({
      delay: 32,
      loop: true,
      callback: () => {
        if (!alive || !player.active) { evt.remove(); aura.destroy(); return; }
        const now = this.time.now;
        if (now >= endAt) { alive = false; evt.remove(); this.tweens.add({ targets: aura, alpha: 0, duration: 200, onComplete: () => aura.destroy() }); return; }
        aura.clear();
        aura.lineStyle(2, col, 0.75);
        const pulse = 1 + Math.sin(now * 0.012) * 0.18;
        aura.strokeEllipse(player.x, player.y - 4, 42 * pulse, 54 * pulse);
        aura.lineStyle(1.5, 0xffffff, 0.55);
        aura.strokeEllipse(player.x, player.y - 4, 30 * pulse, 38 * pulse);
      }
    });
  }

  spawnVanguardRallyAura(ally, durationMs) {
    if (!ally?.active) return;
    const col = 0xffd966;
    const aura = this.add.graphics();
    aura.setDepth(DEPTH.PLAYER_FX - 1);
    let alive = true;
    const endAt = this.time.now + durationMs;
    const evt = this.time.addEvent({
      delay: 32,
      loop: true,
      callback: () => {
        if (!alive || !ally.active) { evt.remove(); aura.destroy(); return; }
        const now = this.time.now;
        if (now >= endAt) { alive = false; evt.remove(); this.tweens.add({ targets: aura, alpha: 0, duration: 220, onComplete: () => aura.destroy() }); return; }
        aura.clear();
        const pulse = 1 + Math.sin(now * 0.010) * 0.20;
        aura.lineStyle(2, col, 0.8);
        aura.strokeEllipse(ally.x, ally.y - 4, 32 * pulse, 42 * pulse);
        aura.lineStyle(1.5, 0xfff4c0, 0.55);
        aura.strokeEllipse(ally.x, ally.y - 4, 22 * pulse, 30 * pulse);
      }
    });
    const burst = this.add.circle(ally.x, ally.y - 10, 8, col, 0);
    burst.setStrokeStyle(3, col, 0.95);
    burst.setDepth(DEPTH.PLAYER_FX + 2);
    this.tweens.add({
      targets: burst,
      scale: 3.2,
      alpha: 0,
      duration: 280,
      onComplete: () => burst.destroy()
    });
  }

  refreshGuardianFortitudeAura(player, durationMs) {
    if (!player?.active) return;
    const endAt = this.time.now + durationMs;
    player._guardianFortitudeUntil = endAt;
    if (player._guardianFortitudeAuraG) return;
    const g = this.add.graphics();
    g.setDepth(DEPTH.PLAYER_FX - 1);
    player._guardianFortitudeAuraG = g;
    player._guardianFortitudeAuraEvt = this.time.addEvent({
      delay: 40,
      loop: true,
      callback: () => {
        if (!player.active || this.time.now >= (player._guardianFortitudeUntil || 0)) {
          player._guardianFortitudeAuraEvt?.remove();
          player._guardianFortitudeAuraEvt = null;
          if (player._guardianFortitudeAuraG) {
            const gg = player._guardianFortitudeAuraG;
            player._guardianFortitudeAuraG = null;
            this.tweens.add({ targets: gg, alpha: 0, duration: 180, onComplete: () => gg.destroy() });
          }
          return;
        }
        g.clear();
        const now = this.time.now;
        const pulse = 1 + Math.sin(now * 0.010) * 0.14;
        g.lineStyle(2.2, 0xff8b8b, 0.78);
        g.strokeEllipse(player.x, player.y - 4, 40 * pulse, 50 * pulse);
        g.lineStyle(1.5, 0xffd3d3, 0.55);
        g.strokeEllipse(player.x, player.y - 4, 28 * pulse, 36 * pulse);
        for (let i = 0; i < 4; i += 1) {
          const a = (now * 0.003) + (i / 4) * Math.PI * 2;
          const rx = player.x + Math.cos(a) * 30;
          const ry = player.y - 4 + Math.sin(a) * 20;
          g.fillStyle(0xffffff, 0.9);
          g.fillRect(rx - 2, ry - 2, 4, 4);
        }
      }
    });
  }

  spawnGuardianTauntAura(player, durationMs) {
    if (!player?.active) return;
    const col = 0xff5a5a;
    const g = this.add.graphics();
    g.setDepth(DEPTH.PLAYER_FX - 1);
    const endAt = this.time.now + durationMs;
    const evt = this.time.addEvent({
      delay: 40,
      loop: true,
      callback: () => {
        if (!player.active || this.time.now >= endAt) {
          evt.remove();
          this.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
          return;
        }
        const now = this.time.now;
        g.clear();
        const pulse = 1 + Math.sin(now * 0.015) * 0.22;
        g.lineStyle(3, col, 0.9);
        g.strokeEllipse(player.x, player.y - 4, 48 * pulse, 60 * pulse);
        g.lineStyle(2, 0xff9b9b, 0.65);
        g.strokeEllipse(player.x, player.y - 4, 36 * pulse, 46 * pulse);
        g.lineStyle(2, col, 0.85);
        const iconY = player.y - 40 + Math.sin(now * 0.010) * 3;
        g.beginPath();
        g.moveTo(player.x - 6, iconY - 8);
        g.lineTo(player.x + 6, iconY - 8);
        g.lineTo(player.x + 6, iconY);
        g.lineTo(player.x, iconY + 8);
        g.lineTo(player.x - 6, iconY);
        g.closePath();
        g.strokePath();
        g.fillStyle(0xff2a2a, 0.85);
        g.fillCircle(player.x, iconY - 2, 2);
      }
    });
    const burst = this.add.circle(player.x, player.y - 4, 14, col, 0);
    burst.setStrokeStyle(4, col, 0.95);
    burst.setDepth(DEPTH.PLAYER_FX + 2);
    this.tweens.add({
      targets: burst,
      scale: 4,
      alpha: 0,
      duration: 420,
      ease: "Cubic.easeOut",
      onComplete: () => burst.destroy()
    });
  }

  spawnGuardianAegisParryAura(ally, durationMs) {
    if (!ally?.active) return;
    const col = 0xffd3d3;
    const burst = this.add.circle(ally.x, ally.y - 10, 10, col, 0);
    burst.setStrokeStyle(3, col, 0.95);
    burst.setDepth(DEPTH.PLAYER_FX + 2);
    this.tweens.add({
      targets: burst,
      scale: 3.6,
      alpha: 0,
      duration: 260,
      onComplete: () => burst.destroy()
    });
    const g = this.add.graphics();
    g.setDepth(DEPTH.PLAYER_FX - 1);
    const endAt = this.time.now + durationMs;
    const evt = this.time.addEvent({
      delay: 40,
      loop: true,
      callback: () => {
        if (!ally.active || this.time.now >= endAt) {
          evt.remove();
          this.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() });
          return;
        }
        const now = this.time.now;
        g.clear();
        const pulse = 1 + Math.sin(now * 0.012) * 0.14;
        g.lineStyle(2, 0xff8b8b, 0.8);
        g.strokeEllipse(ally.x, ally.y - 4, 34 * pulse, 44 * pulse);
      }
    });
  }

  spawnSpearThrustVisual(player, color, options = {}) {
    const durationMs = Phaser.Math.Clamp(Number.isFinite(options.durationMs) ? options.durationMs : 100, 50, 3000);
    const finishThrust = options.onComplete;
    if (!player || !player.active) {
      if (typeof finishThrust === "function") finishThrust();
      return;
    }
    if (this.isTrueHitboxView()) {
      this.time.delayedCall(durationMs, () => { if (typeof finishThrust === "function") finishThrust(); });
      return;
    }
    const f = player.facing > 0 ? 1 : -1;
    const baseX = player.x + f * (options.offsetX || 18);
    const y = player.y + (options.offsetY || -6);
    const length = Math.max(24, options.length || 88);
    const c = color || 0x5ca8ff;
    const thrust = { reach: 8, alpha: 1 };
    const spear = this.add.graphics();
    spear.setDepth(DEPTH.PLAYER_FX);

    for (let i = 0; i < 3; i++) {
      const ghost = this.add.graphics();
      ghost.setDepth(DEPTH.PLAYER_FX - 1);
      ghost.lineStyle(6 - i * 2, c, 0.15);
      ghost.lineBetween(baseX, y, baseX + f * (length * 0.3), y);
      this.tweens.add({ targets: ghost, alpha: 0, duration: durationMs * 0.6, delay: i * 20, onComplete: () => ghost.destroy() });
    }

    this.tweens.add({
      targets: thrust,
      reach: length,
      alpha: 0,
      duration: durationMs,
      onUpdate: () => {
        const tipX = baseX + f * thrust.reach;
        const a = thrust.alpha;
        spear.clear();

        spear.lineStyle(3, c, 0.25 * a);
        spear.lineBetween(baseX - f * 4, y, tipX, y);

        spear.lineStyle(7, c, 0.95 * a);
        spear.lineBetween(baseX, y, tipX, y);
        spear.lineStyle(3, 0xffffff, 0.75 * a);
        spear.lineBetween(baseX + f * 4, y - 1, tipX - f * 6, y - 1);
        spear.lineStyle(2, 0xc8e4ff, 0.5 * a);
        spear.lineBetween(baseX + f * 2, y + 2, tipX - f * 8, y + 2);

        spear.fillStyle(0xffffff, 0.95 * a);
        spear.fillTriangle(tipX, y, tipX - f * 14, y - 5, tipX - f * 14, y + 5);
        spear.fillStyle(c, 0.7 * a);
        spear.fillTriangle(tipX - f * 2, y, tipX - f * 12, y - 3, tipX - f * 12, y + 3);

        if (a > 0.3) {
          spear.fillStyle(0xffffff, 0.35 * a);
          spear.fillCircle(tipX, y, 4);
        }

        const trailLen = thrust.reach * 0.4;
        for (let i = 0; i < 3; i++) {
          const tx = tipX - f * (8 + i * trailLen * 0.3);
          const w = 2 + (2 - i);
          spear.fillStyle(c, (0.25 - i * 0.07) * a);
          spear.fillRect(tx - w * 0.5, y - 1 - i, w, 2 + i);
        }
      },
      onComplete: () => {
        spear.destroy();
        if (typeof finishThrust === "function") finishThrust();
      }
    });

    const sparkDelay = Math.max(20, durationMs * 0.4);
    this.time.delayedCall(sparkDelay, () => {
      if (this.gameState !== "battle") return;
      const tipX = baseX + f * length;
      for (let i = 0; i < 5; i++) {
        const sp = this.add.circle(tipX, y, Phaser.Math.Between(1, 3), i % 2 === 0 ? 0xffffff : c, 0.8);
        sp.setDepth(DEPTH.PLAYER_FX + 1);
        this.tweens.add({
          targets: sp,
          x: tipX + f * Phaser.Math.Between(6, 22) + Phaser.Math.Between(-4, 4),
          y: y + Phaser.Math.Between(-10, 10),
          alpha: 0,
          duration: 100 + Phaser.Math.Between(0, 60),
          onComplete: () => sp.destroy()
        });
      }
    });
  }

  drawVanguardIdleSpear(player) {
    if (this.isTrueHitboxView()) return;
    if (!player || !player.active || player.definition.id !== "vanguard") return;
    if (player.vanguardSpearState === "thrust" || player.vanguardSpearState === "dash") {
      if (player.vanguardSpearG) player.vanguardSpearG.clear();
      return;
    }
    if (!player.vanguardSpearG) {
      player.vanguardSpearG = this.add.graphics();
      player.vanguardSpearG.setDepth(DEPTH.PLAYER_FX);
    }
    const g = player.vanguardSpearG;
    g.clear();
    const f = player.facing > 0 ? 1 : -1;
    const hx = player.x + f * 6;
    const hy = player.y - 14;
    const gx = hx - f * 26;
    const gy = hy + 10;
    const col = player.definition.color || 0x5ca8ff;

    g.lineStyle(2, col, 0.25);
    g.lineBetween(gx + f * 2, gy + 2, hx + f * 2, hy + 2);

    g.lineStyle(5, col, 0.95);
    g.lineBetween(gx, gy, hx, hy);
    g.lineStyle(2, 0xffffff, 0.4);
    g.lineBetween(gx + f * 4, gy - 1, hx - f * 4, hy - 1);

    g.fillStyle(0xffffff, 0.92);
    g.fillTriangle(hx + f * 10, hy - 4, hx + f * 10, hy + 4, hx + f * 20, hy);
    g.fillStyle(col, 0.65);
    g.fillTriangle(hx + f * 12, hy - 2, hx + f * 12, hy + 2, hx + f * 18, hy);

    g.fillStyle(0xffffff, 0.2);
    g.fillCircle(hx + f * 12, hy, 2);

    g.fillStyle(col, 0.5);
    g.fillCircle(gx + f * 2, gy - 1, 3);
  }

  spawnVanguardDashSpearPose(player, color, durationMs = 260) {
    if (this.isTrueHitboxView()) return;
    if (!player || !player.active) return;
    const facing = player.facing > 0 ? 1 : -1;
    const c = color || 0x5ca8ff;
    const g = this.add.graphics();
    g.setDepth(DEPTH.PLAYER_FX);
    const endAt = this.time.now + durationMs;
    let trailAcc = 0;
    const tick = this.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        if (!player.active || !player.isAlive || this.time.now > endAt) {
          g.destroy();
          tick.remove();
          if (player.definition.id === "vanguard") player.vanguardSpearState = "idle";
          return;
        }
        const tipX = player.x + facing * 72;
        const y = player.y - 8;
        g.clear();

        g.lineStyle(3, c, 0.2);
        g.lineBetween(player.x + facing * 10, y + 3, tipX + facing * 4, y + 3);

        g.lineStyle(7, c, 0.98);
        g.lineBetween(player.x + facing * 14, y, tipX, y);
        g.lineStyle(3, 0xffffff, 0.6);
        g.lineBetween(player.x + facing * 18, y - 1, tipX - facing * 8, y - 1);

        g.fillStyle(0xffffff, 0.95);
        g.fillTriangle(tipX + facing * 2, y - 5, tipX + facing * 2, y + 5, tipX + facing * 16, y);
        g.fillStyle(c, 0.7);
        g.fillTriangle(tipX + facing * 4, y - 3, tipX + facing * 4, y + 3, tipX + facing * 14, y);

        g.fillStyle(0xffffff, 0.3);
        g.fillCircle(tipX + facing * 4, y, 3);

        trailAcc += 16;
        if (trailAcc >= 40) {
          trailAcc = 0;
          const sp = this.add.circle(tipX + Phaser.Math.Between(-2, 2), y + Phaser.Math.Between(-3, 3), 2, 0xffffff, 0.5);
          sp.setDepth(DEPTH.PLAYER_FX + 1);
          this.tweens.add({ targets: sp, x: sp.x - facing * 18, alpha: 0, duration: 100, onComplete: () => sp.destroy() });
        }
      }
    });
  }

  spawnStrikerSwordBursts(player, color, range, yOffset, burstIndex = 0) {
    if (this.isTrueHitboxView()) return;
    if (!player || !player.active) return;
    const f = player.facing > 0 ? 1 : -1;
    const reach = Math.max(28, range - 6);
    const isSecond = burstIndex === 1;
    const yShift = isSecond ? 5 : -5;
    const y = player.y + yOffset + yShift;
    const baseX = player.x + f * 20;
    const c = color || 0xc288ff;

    const g = this.add.graphics();
    g.setDepth(DEPTH.PLAYER_FX);
    const slashAng = isSecond ? -0.35 : 0.35;
    const anim = { t: 0 };
    this.tweens.add({
      targets: anim, t: 1, duration: 80,
      onUpdate: () => {
        const len = Phaser.Math.Linear(8, reach, anim.t);
        const tipX = baseX + f * len;
        const tipYOff = Math.sin(slashAng) * len * f;
        const a = 1 - anim.t * 0.3;
        g.clear();

        g.lineStyle(3, c, 0.15 * a);
        g.lineBetween(baseX - f * 6, y + tipYOff * 0.2, tipX + f * 4, y + tipYOff);

        g.lineStyle(7, c, 0.95 * a);
        g.beginPath(); g.moveTo(baseX, y); g.lineTo(tipX, y + tipYOff); g.strokePath();
        g.lineStyle(3, 0xffffff, 0.7 * a);
        g.beginPath(); g.moveTo(baseX + f * 4, y - 1); g.lineTo(tipX - f * 4, y + tipYOff - 1); g.strokePath();
        g.lineStyle(2, 0xe8c8ff, 0.5 * a);
        g.beginPath(); g.moveTo(baseX + f * 2, y + 2); g.lineTo(tipX - f * 6, y + tipYOff + 2); g.strokePath();

        if (anim.t > 0.3) {
          const arcLen = len * 0.6;
          const arcStartX = baseX + f * (len * 0.3);
          g.lineStyle(4, c, 0.4 * a * (1 - anim.t));
          g.beginPath();
          g.arc(arcStartX, y + tipYOff * 0.4, arcLen * 0.5,
            f > 0 ? -Math.PI * 0.3 + slashAng : Math.PI * 0.7 + slashAng,
            f > 0 ? Math.PI * 0.3 + slashAng : Math.PI * 1.3 + slashAng, false);
          g.strokePath();
        }

        g.fillStyle(0xffffff, 0.5 * a);
        g.fillCircle(tipX, y + tipYOff, 3);
      },
      onComplete: () => g.destroy()
    });

    for (let i = 0; i < 3; i++) {
      const sp = this.add.circle(
        baseX + f * Phaser.Math.Between(10, reach * 0.7),
        y + Phaser.Math.Between(-6, 6),
        Phaser.Math.Between(1, 2), i % 2 === 0 ? 0xffffff : c, 0.7
      );
      sp.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({ targets: sp, x: sp.x + f * Phaser.Math.Between(8, 18), y: sp.y + Phaser.Math.Between(-8, 8), alpha: 0, duration: 100 + i * 15, delay: 20, onComplete: () => sp.destroy() });
    }

    if (isSecond) {
      const shadowG = this.add.graphics();
      shadowG.setDepth(DEPTH.PLAYER_FX - 1);
      shadowG.fillStyle(c, 0.12);
      shadowG.fillEllipse(player.x + f * reach * 0.4, player.y + yOffset, reach * 0.8, 12);
      this.tweens.add({ targets: shadowG, alpha: 0, duration: 120, onComplete: () => shadowG.destroy() });
    }
  }

  playRectAttackVisual(rect, color, options = {}) {
    if (!rect) return;
    if (this.isTrueHitboxView()) {
      this.spawnRectStrikeVisual(rect, color, options);
      return;
    }
    const cx = rect.x + rect.width * 0.5;
    const cy = rect.y + rect.height * 0.5;
    const flair = Math.min(68, Math.max(22, rect.width * 0.4));
    const dir = options.direction < 0 ? -1 : 1;
    const variant = options.variant || "default";

    if (variant === "vanguard") {
      this.spawnImpactEffect(cx + dir * 6, cy, color, flair * 0.7);
      const streakG = this.add.graphics();
      streakG.setDepth(DEPTH.PLAYER_FX + 1);
      streakG.lineStyle(4, 0xa8d4ff, 0.7);
      streakG.lineBetween(cx - dir * 8, cy - 2, cx + dir * flair * 0.6, cy - 2);
      streakG.lineStyle(2, 0xffffff, 0.5);
      streakG.lineBetween(cx - dir * 4, cy + 1, cx + dir * flair * 0.4, cy + 1);
      this.tweens.add({ targets: streakG, alpha: 0, duration: 120, onComplete: () => streakG.destroy() });
      for (let i = 0; i < 3; i++) {
        const sp = this.add.circle(cx + dir * Phaser.Math.Between(4, 20), cy + Phaser.Math.Between(-6, 6), 2, 0xffffff, 0.8);
        sp.setDepth(DEPTH.PLAYER_FX + 2);
        this.tweens.add({ targets: sp, x: sp.x + dir * Phaser.Math.Between(8, 18), alpha: 0, duration: 100 + i * 20, onComplete: () => sp.destroy() });
      }
    } else if (variant === "striker") {
      this.spawnImpactEffect(cx, cy, color, flair * 0.55);
      const slashG = this.add.graphics();
      slashG.setDepth(DEPTH.PLAYER_FX + 1);
      const slashAng = dir > 0 ? -0.4 : 0.4;
      slashG.lineStyle(3, 0xe8c8ff, 0.85);
      const sx = cx - dir * 8;
      const sy = cy + 8;
      slashG.beginPath(); slashG.moveTo(sx, sy); slashG.lineTo(sx + dir * flair * 0.7, sy - 14); slashG.strokePath();
      slashG.lineStyle(2, 0xffffff, 0.55);
      slashG.beginPath(); slashG.moveTo(sx + 2, sy - 2); slashG.lineTo(sx + dir * flair * 0.5, sy - 12); slashG.strokePath();
      this.tweens.add({ targets: slashG, alpha: 0, duration: 90, onComplete: () => slashG.destroy() });
      this.time.delayedCall(42, () => {
        if (this.gameState !== "battle") return;
        this.spawnImpactEffect(cx + dir * 6, cy - 4, color, flair * 0.48);
      });
    } else {
      this.spawnImpactEffect(cx, cy, color, flair);
      this.time.delayedCall(34, () => {
        if (this.gameState !== "battle" || this.isTrueHitboxView()) return;
        this.spawnImpactEffect(cx + dir * 5, cy - 3, 0xffffff, flair * 0.36);
      });
    }
  }

  playCircleAttackVisual(circle, color, options = {}) {
    if (!circle) return;
    if (this.isTrueHitboxView()) {
      this.spawnCircleStrikeVisual(circle, color, options);
    } else {
      const r = circle.radius || 40;
      const dur = options.durationMs || 160;
      this.spawnImpactEffect(circle.x, circle.y, color, Math.min(72, r * 0.68));
      this.spawnAuraPulse(circle.x, circle.y, color, r * 0.82, dur * 1.25);
    }
  }

  playFanAttackVisual(x, y, direction, radius, spreadDeg, color, durationMs = 140, variant = null) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (this.isTrueHitboxView()) {
      this.spawnFanStrikeVisual(x, y, direction, radius, spreadDeg, color, durationMs);
    } else {
      const safeR = Math.max(18, radius || 80);
      if (variant === "guardian") {
        this.spawnImpactEffect(x, y, color, 32);
        this.spawnImpactEffect(x + (direction < 0 ? -12 : 12), y - 4, 0xfff0f0, 26);
        this.spawnAuraPulse(x, y, color, safeR * 0.56, 190);
        this.spawnShieldSigil(x + (direction < 0 ? -8 : 8), y - 6, color, direction);
      } else {
        this.spawnImpactEffect(x, y, color, 36);
        this.spawnAuraPulse(x, y, color, safeR * 0.6, 175);
      }
    }
  }

  spawnRectStrikeVisual(rect, color, options = {}) {
    if (!this.isTrueHitboxView()) return;
    if (!rect) return;
    const width = Number.isFinite(rect.width) ? rect.width : 0;
    const height = Number.isFinite(rect.height) ? rect.height : 0;
    const x = Number.isFinite(rect.x) ? rect.x : 0;
    const y = Number.isFinite(rect.y) ? rect.y : 0;
    if (width <= 0 || height <= 0) return;
    const cx = x + width * 0.5;
    const cy = y + height * 0.5;
    const angle = Number.isFinite(options.angle) ? options.angle : 0;
    const direction = options.direction < 0 ? -1 : 1;
    const durationMs = Phaser.Math.Clamp(Number.isFinite(options.durationMs) ? options.durationMs : 120, 40, 3000);
    const body = this.add.rectangle(cx, cy, rect.width, rect.height, color || 0xffffff, 0.05);
    body.setStrokeStyle(1, color || 0xffffff, 0.12);
    body.angle = angle;
    const wake = this.add.rectangle(
      cx - direction * Math.max(8, rect.width * 0.08),
      cy,
      rect.width * 0.76,
      Math.max(4, rect.height * 0.72),
      color || 0xffffff,
      0.03
    );
    wake.angle = angle;
    this.trackHitboxOverlay(body, wake);
    this.tweens.add({
      targets: [body, wake],
      x: cx,
      alpha: 0,
      duration: durationMs,
      onComplete: () => {
        body.destroy();
        wake.destroy();
      }
    });
  }

  spawnCircleStrikeVisual(circle, color, options = {}) {
    if (!this.isTrueHitboxView()) return;
    if (!circle) return;
    const x = Number.isFinite(circle.x) ? circle.x : 0;
    const y = Number.isFinite(circle.y) ? circle.y : 0;
    const radius = Number.isFinite(circle.radius) ? circle.radius : 0;
    if (radius <= 0) return;
    const durationMs = Phaser.Math.Clamp(Number.isFinite(options.durationMs) ? options.durationMs : 150, 40, 3000);
    const ring = this.add.circle(x, y, radius, color || 0xffffff, 0.05);
    ring.setStrokeStyle(1, color || 0xffffff, 0.14);
    const glow = this.add.circle(x, y, Math.max(8, radius * 0.24), color || 0xffffff, 0.03);
    this.trackHitboxOverlay(ring, glow);
    this.tweens.add({
      targets: [ring, glow],
      radius,
      alpha: 0,
      duration: durationMs,
      onComplete: () => {
        ring.destroy();
        glow.destroy();
      }
    });
  }

  spawnFanStrikeVisual(x, y, direction, radius, spreadDeg, color, durationMs = 140) {
    if (!this.isTrueHitboxView()) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const graphics = this.add.graphics();
    const safeRadius = Math.max(18, radius || 100);
    const safeSpread = Math.max(18, spreadDeg || 90);
    const baseAngle = direction > 0 ? 0 : Math.PI;
    const half = Phaser.Math.DegToRad(safeSpread * 0.5);
    const segments = 8;
    const points = [{ x, y }];
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const angle = baseAngle - half + t * half * 2;
      points.push({
        x: x + Math.cos(angle) * safeRadius,
        y: y + Math.sin(angle) * safeRadius
      });
    }
    graphics.fillStyle(color || 0xffffff, 0.02);
    graphics.lineStyle(1, color || 0xffffff, 0.08);
    graphics.beginPath();
    graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      graphics.lineTo(points[i].x, points[i].y);
    }
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
    graphics.setAlpha(0.45);
    this.trackHitboxOverlay(graphics);
    this.tweens.add({
      targets: graphics,
      alpha: 0,
      duration: Phaser.Math.Clamp(Number.isFinite(durationMs) ? durationMs : 140, 40, 3000),
      onComplete: () => graphics.destroy()
    });
  }

  spawnWindupRect(rect, color, durationMs = 220) {
    if (!rect) return;
    if (this.isTrueHitboxView()) {
      const width = Number.isFinite(rect.width) ? rect.width : 0;
      const height = Number.isFinite(rect.height) ? rect.height : 0;
      const x = Number.isFinite(rect.x) ? rect.x : 0;
      const y = Number.isFinite(rect.y) ? rect.y : 0;
      if (width <= 0 || height <= 0) return;
      const cx = x + width * 0.5;
      const cy = y + height * 0.5;
      const zone = this.add.rectangle(cx, cy, width, height, color || 0xffffff, 0.015);
      zone.setStrokeStyle(1, color || 0xffffff, 0.06);
      this.trackHitboxOverlay(zone);
      this.tweens.add({
        targets: zone,
        alpha: 0.04,
        yoyo: true,
        repeat: 1,
        duration: Phaser.Math.Clamp(Number.isFinite(durationMs) ? durationMs : 220, 60, 3000),
        onComplete: () => zone.destroy()
      });
      return;
    }
    const width = Number.isFinite(rect.width) ? rect.width : 0;
    const height = Number.isFinite(rect.height) ? rect.height : 0;
    const x = Number.isFinite(rect.x) ? rect.x : 0;
    const y = Number.isFinite(rect.y) ? rect.y : 0;
    if (width <= 0 || height <= 0) return;
    const cx = x + width * 0.5;
    const cy = y + height * 0.5;
    const edge = this.add.rectangle(cx, cy, width + 8, height + 8, color, 0);
    edge.setStrokeStyle(2, color, 0.16);
    edge.setDepth(DEPTH.BOSS_TELEGRAPH);
    const fill = this.add.rectangle(cx, cy, width, height, color, 0.04);
    fill.setStrokeStyle(2, color, 0.2);
    fill.setDepth(DEPTH.BOSS_TELEGRAPH);
    const beats = Math.max(2, Math.ceil(durationMs / 180));
    this.tweens.add({
      targets: fill,
      alpha: { from: 0.035, to: 0.1 },
      duration: Math.min(200, durationMs / beats),
      yoyo: true,
      repeat: beats - 1,
      onComplete: () => {
        fill.destroy();
        edge.destroy();
      }
    });
  }

  spawnWindupCircle(circle, color, durationMs = 220) {
    if (!circle) return;
    if (this.isTrueHitboxView()) {
      const x = Number.isFinite(circle.x) ? circle.x : 0;
      const y = Number.isFinite(circle.y) ? circle.y : 0;
      const radius = Number.isFinite(circle.radius) ? circle.radius : 0;
      if (radius <= 0) return;
      const ring = this.add.circle(x, y, radius, color || 0xffffff, 0.012);
      ring.setStrokeStyle(1, color || 0xffffff, 0.06);
      this.trackHitboxOverlay(ring);
      this.tweens.add({
        targets: ring,
        alpha: 0.035,
        yoyo: true,
        repeat: 1,
        duration: Phaser.Math.Clamp(Number.isFinite(durationMs) ? durationMs : 220, 60, 3000),
        onComplete: () => ring.destroy()
      });
      return;
    }
    const x = Number.isFinite(circle.x) ? circle.x : 0;
    const y = Number.isFinite(circle.y) ? circle.y : 0;
    const radius = Number.isFinite(circle.radius) ? circle.radius : 0;
    if (radius <= 0) return;
    const r = Math.max(8, radius);
    const disk = this.add.circle(x, y, r, color, 0.04);
    disk.setStrokeStyle(2, color, 0.26);
    disk.setDepth(DEPTH.BOSS_TELEGRAPH);
    const ring = this.add.circle(x, y, r * 0.88, color, 0);
    ring.setStrokeStyle(2, color, 0.32);
    ring.setDepth(DEPTH.BOSS_TELEGRAPH);
    const beats = Math.max(2, Math.ceil(durationMs / 200));
    this.tweens.add({
      targets: [disk, ring],
      alpha: { from: 0.06, to: 0.16 },
      duration: Math.min(220, durationMs / beats),
      yoyo: true,
      repeat: beats - 1,
      onComplete: () => {
        disk.destroy();
        ring.destroy();
      }
    });
  }

  spawnGolemStoneRushTelegraph(rect, durationMs, flashStopBeforeDashMs = 220) {
    if (!rect) return;
    const width = Number.isFinite(rect.width) ? rect.width : 0;
    const height = Number.isFinite(rect.height) ? rect.height : 0;
    if (width <= 0 || height <= 0) return;
    const cx = rect.x + width * 0.5;
    const cy = rect.y + height * 0.5;
    const grey = 0x8e9098;
    const box = this.add.rectangle(cx, cy, width, height, grey, 0.04);
    box.setStrokeStyle(1, 0x5a5c64, 0.1);
    box.setDepth(DEPTH.BOSS_TELEGRAPH);
    const stop = Math.min(Math.max(80, flashStopBeforeDashMs), durationMs * 0.55);
    const flashMs = Math.max(120, durationMs - stop);
    const pulseMs = 76;
    const pulses = Math.max(3, Math.floor(flashMs / (pulseMs * 2)));
    this.tweens.add({
      targets: box,
      alpha: { from: 0.02, to: 0.08 },
      duration: pulseMs,
      yoyo: true,
      repeat: pulses - 1,
      onComplete: () => {
        if (!box.active) return;
        box.setAlpha(0.06);
      }
    });
    this.time.delayedCall(durationMs, () => {
      if (box.active) box.destroy();
    });
  }

  playGolemQuakeStompHit(circle, color, options = {}) {
    if (!circle) return;
    const durationMs = options.durationMs || 130;
    if (this.isTrueHitboxView()) {
      this.spawnCircleStrikeVisual(circle, color, { durationMs });
    }
    this.spawnGolemQuakeStompVfx(circle.x, circle.y, circle.radius, color);
  }

  spawnGolemQuakeStompVfx(x, y, radius, color) {
    if (!Number.isFinite(radius) || radius <= 0) return;
    const safeR = radius;
    const dust = 0x6a6e76;
    for (let i = 0; i < 4; i += 1) {
      const ring = this.add.circle(x, y, safeR * (0.14 + i * 0.06), 0x000000, 0);
      ring.setStrokeStyle(3, color, 0.68 - i * 0.1);
      ring.setDepth(DEPTH.PLAYER_FX);
      const t = 140 + i * 35;
      this.tweens.add({
        targets: ring,
        radius: { from: safeR * (0.08 + i * 0.05), to: safeR },
        alpha: { from: 0.78, to: 0 },
        duration: t,
        ease: "Cubic.easeOut",
        onComplete: () => {
          if (ring.active) ring.destroy();
        }
      });
    }
    const crackN = 11;
    for (let c = 0; c < crackN; c += 1) {
      const angle = (c / crackN) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.15, 0.15);
      const len = safeR * Phaser.Math.FloatBetween(0.45, 0.98);
      const gx = this.add.graphics();
      gx.setDepth(DEPTH.PLATFORM + 2);
      const midFade = 0.55 * (1 - len / safeR);
      gx.lineStyle(2, dust, 0.15 + midFade * 0.75);
      gx.beginPath();
      gx.moveTo(x, y);
      gx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len * 0.72);
      gx.strokePath();
      gx.lineStyle(1, 0x3a3e46, 0.2 + midFade * 0.5);
      gx.beginPath();
      gx.moveTo(x + Math.cos(angle) * len * 0.15, y + Math.sin(angle) * len * 0.1);
      gx.lineTo(x + Math.cos(angle) * len * 0.92, y + Math.sin(angle) * len * 0.66);
      gx.strokePath();
      this.tweens.add({
        targets: gx,
        alpha: { from: 0.85, to: 0 },
        duration: 200 + c * 5,
        ease: "Quad.easeIn",
        onComplete: () => {
          if (gx.active) gx.destroy();
        }
      });
    }
    this.spawnImpactEffect(x, y, color, Math.min(42, safeR * 0.32));
  }

  spawnGolemRockSpikeMeteor(aimX, footCenterY, windupMs, dropDurationMs) {
    if (!Number.isFinite(aimX) || !Number.isFinite(footCenterY)) return;
    const cx = aimX;
    const hoverY = Math.min(footCenterY - 28 - 130, footCenterY - 150);
    const rock = this.add.sprite(cx, hoverY, "golem_rock_meteor");
    rock.setDepth(DEPTH.BOSS_TELEGRAPH + 1);
    rock.setScale(2.05);
    rock.setAlpha(0.96);
    this.tweens.add({
      targets: rock,
      y: { from: hoverY - 5, to: hoverY + 5 },
      duration: 150,
      yoyo: true,
      repeat: Math.max(1, Math.floor(windupMs / 150) - 1)
    });
    this.time.delayedCall(windupMs, () => {
      if (!rock.active || this.gameState !== "battle") {
        if (rock.active) rock.destroy();
        return;
      }
      const impactY = footCenterY - 36;
      this.tweens.add({
        targets: rock,
        y: impactY,
        scaleX: 2.2,
        scaleY: 2.25,
        duration: dropDurationMs,
        ease: "Cubic.easeIn",
        onComplete: () => {
          if (rock.active) rock.destroy();
        }
      });
    });
  }

  spawnGolemBoulderDiveTelegraph(bossX, bossY, direction, dashWidth, durationMs) {
    const d = direction < 0 ? -1 : 1;
    const shadow = this.add.ellipse(bossX + d * dashWidth * 0.38, bossY + 36, dashWidth * 0.42, 20, 0x141820, 0.08);
    shadow.setDepth(DEPTH.BOSS_TELEGRAPH);
    const warn = this.add.ellipse(bossX + d * dashWidth * 0.32, bossY + 34, dashWidth * 0.36, 14, 0x8890a0, 0.02);
    warn.setStrokeStyle(1, 0x9aa0b0, 0.08);
    warn.setDepth(DEPTH.BOSS_TELEGRAPH);
    this.tweens.add({
      targets: shadow,
      scaleX: { from: 0.4, to: 1.05 },
      scaleY: { from: 0.55, to: 1 },
      alpha: { from: 0.04, to: 0.1 },
      duration: Math.min(durationMs * 0.65, 520),
      ease: "Sine.easeOut"
    });
    this.tweens.add({
      targets: warn,
      scaleX: { from: 0.35, to: 1 },
      scaleY: { from: 0.5, to: 1 },
      alpha: { from: 0.03, to: 0.08 },
      duration: Math.min(durationMs * 0.55, 480),
      ease: "Sine.easeOut"
    });
    this.time.delayedCall(durationMs, () => {
      this.tweens.add({
        targets: [shadow, warn],
        alpha: 0,
        duration: 140,
        onComplete: () => {
          shadow.destroy();
          warn.destroy();
        }
      });
    });
  }

  spawnWraithImplosionLines(cx, cy, radius, durationMs) {
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || radius <= 0) return;
    const purple = 0x9966ff;
    const violet = 0x6644cc;
    const n = 16;
    const r0 = radius * (1.05 + Math.random() * 0.12);
    for (let i = 0; i < n; i += 1) {
      const ang = (i / n) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.08, 0.08);
      const len = r0 * Phaser.Math.FloatBetween(0.85, 1.15);
      const sx = cx + Math.cos(ang) * len;
      const sy = cy + Math.sin(ang) * len * 0.82;
      const streak = this.add.rectangle(sx, sy, Math.max(28, len * 0.35), 3, i % 2 === 0 ? purple : violet, 0.75);
      streak.setRotation(ang);
      streak.setDepth(DEPTH.BOSS_TELEGRAPH + 3);
      streak.setStrokeStyle(1, 0xe0c8ff, 0.45);
      this.tweens.add({
        targets: streak,
        x: cx,
        y: cy,
        alpha: 0,
        scaleX: 0.2,
        duration: Phaser.Math.Clamp(durationMs, 80, 3000),
        delay: i * 12,
        ease: "Cubic.easeIn",
        onComplete: () => {
          if (streak.active) streak.destroy();
        }
      });
    }
  }

  spawnWraithGroundPortal(x, y, radius, durationMs) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const r = Math.max(18, radius);
    const core = this.add.ellipse(x, y + 6, r * 1.85, r * 0.62, 0x2a1050, 0.42);
    core.setStrokeStyle(3, 0xb388ff, 0.72);
    core.setDepth(DEPTH.BOSS_TELEGRAPH);
    const inner = this.add.ellipse(x, y + 6, r * 1.1, r * 0.38, 0x501888, 0.35);
    inner.setStrokeStyle(2, 0xd8b8ff, 0.55);
    inner.setDepth(DEPTH.BOSS_TELEGRAPH + 1);
    const spin = this.add.graphics();
    spin.setDepth(DEPTH.BOSS_TELEGRAPH + 1);
    const drawRunes = (rot) => {
      spin.clear();
      spin.lineStyle(2, 0xc8a8ff, 0.45);
      for (let k = 0; k < 8; k += 1) {
        const a = rot + (k / 8) * Math.PI * 2;
        const x1 = x + Math.cos(a) * r * 0.55;
        const y1 = y + 6 + Math.sin(a) * r * 0.2;
        const x2 = x + Math.cos(a + 0.35) * r * 0.72;
        const y2 = y + 6 + Math.sin(a + 0.35) * r * 0.26;
        spin.beginPath();
        spin.moveTo(x1, y1);
        spin.lineTo(x2, y2);
        spin.strokePath();
      }
    };
    let rot = 0;
    const spinEv = this.time.addEvent({
      delay: 40,
      loop: true,
      callback: () => {
        rot += 0.12;
        drawRunes(rot);
      }
    });
    drawRunes(0);
    this.tweens.add({
      targets: [core, inner],
      alpha: { from: 0.35, to: 0.7 },
      duration: 120,
      yoyo: true,
      repeat: Math.max(1, Math.floor(durationMs / 120)),
      onComplete: () => {
        core.setAlpha(0.55);
        inner.setAlpha(0.45);
      }
    });
    this.time.delayedCall(durationMs, () => {
      spinEv.remove();
      this.tweens.add({
        targets: [core, inner],
        alpha: 0,
        duration: 160,
        onComplete: () => {
          spin.destroy();
          core.destroy();
          inner.destroy();
        }
      });
    });
  }

  spawnWraithPhaseRushTelegraph(rect, durationMs, flashStopBeforeDashMs = 200) {
    if (!rect) return;
    const width = Number.isFinite(rect.width) ? rect.width : 0;
    const height = Number.isFinite(rect.height) ? rect.height : 0;
    if (width <= 0 || height <= 0) return;
    const cx = rect.x + width * 0.5;
    const cy = rect.y + height * 0.5;
    const fill = 0x7a48c8;
    const edge = 0xb898ff;
    const box = this.add.rectangle(cx, cy, width, height, fill, 0.035);
    box.setStrokeStyle(1, edge, 0.1);
    box.setDepth(DEPTH.BOSS_TELEGRAPH);
    const stop = Math.min(Math.max(70, flashStopBeforeDashMs), durationMs * 0.55);
    const flashMs = Math.max(100, durationMs - stop);
    const pulseMs = 72;
    const pulses = Math.max(3, Math.floor(flashMs / (pulseMs * 2)));
    this.tweens.add({
      targets: box,
      alpha: { from: 0.02, to: 0.07 },
      duration: pulseMs,
      yoyo: true,
      repeat: pulses - 1,
      onComplete: () => {
        if (!box.active) return;
        box.setAlpha(0.05);
      }
    });
    this.time.delayedCall(durationMs, () => {
      if (box.active) box.destroy();
    });
  }

  playWraithScytheArcSweep(x, y, direction, radius, spreadDeg, sweepMs) {
    if (!this.textures.exists("wraith_scythe")) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const safeR = Math.max(20, radius || 100);
    const safeSpread = Math.max(24, spreadDeg || 90);
    const baseAngle = direction > 0 ? 0 : Math.PI;
    const half = Phaser.Math.DegToRad(safeSpread * 0.5);
    const startA = baseAngle - half * 0.92;
    const endA = baseAngle + half * 0.92;
    const bladeR = safeR * 0.9;
    const sx = x + Math.cos(startA) * bladeR;
    const sy = y + Math.sin(startA) * bladeR;
    const ex = x + Math.cos(endA) * bladeR;
    const ey = y + Math.sin(endA) * bladeR;
    const scythe = this.add.image(sx, sy, "wraith_scythe");
    scythe.setDepth(DEPTH.PLAYER_FX);
    scythe.setOrigin(0.12, 0.88);
    scythe.setScale(direction > 0 ? 1.05 : -1.05, 1.05);
    scythe.setRotation(startA + Math.PI * 0.5);
    scythe.setAlpha(0.95);
    this.tweens.add({
      targets: scythe,
      x: ex,
      y: ey,
      rotation: endA + Math.PI * 0.5,
      duration: Phaser.Math.Clamp(sweepMs, 120, 4000),
      ease: "Sine.easeInOut",
      onComplete: () => {
        if (scythe.active) scythe.destroy();
      }
    });
  }

  spawnWraithScytheHoldAbove(boss, direction, holdMs, radius, color) {
    if (!boss?.active || !this.textures.exists("wraith_scythe")) return;
    const col = color || 0x9dbeff;
    const x = boss.x;
    const y = boss.y - 36;
    const scythe = this.add.image(x, y - 28, "wraith_scythe");
    scythe.setDepth(DEPTH.PLAYER_FX);
    scythe.setOrigin(0.5, 0.92);
    const d = direction >= 0 ? 1 : -1;
    scythe.setScale(d * 1.15, 1.15);
    scythe.setRotation(-Math.PI * 0.5);
    scythe.setAlpha(0.92);
    const pulse = this.tweens.add({
      targets: scythe,
      y: { from: y - 22, to: y - 34 },
      duration: Math.min(160, holdMs / 4),
      yoyo: true,
      repeat: Math.max(2, Math.floor(holdMs / 140)),
      ease: "Sine.easeInOut"
    });
    for (let i = 0; i < 8; i += 1) {
      const p = this.add.circle(
        boss.x + Phaser.Math.Between(-20, 20),
        boss.y + Phaser.Math.Between(-8, 18),
        3,
        0xc8dcff,
        0.5
      );
      p.setDepth(DEPTH.BOSS_TELEGRAPH);
      this.tweens.add({
        targets: p,
        y: boss.y - 40 - i * 4,
        alpha: 0,
        duration: 280 + i * 30,
        delay: i * 40,
        onComplete: () => p.destroy()
      });
    }
    this.time.delayedCall(holdMs, () => {
      pulse.stop();
      if (scythe.active) scythe.destroy();
    });
  }

  playWraithScytheSlamSweep(x, y, direction, radius, spreadDeg, sweepMs, color) {
    if (!this.textures.exists("wraith_scythe")) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const col = color || 0x9dbeff;
    const safeR = Math.max(20, radius || 100);
    const safeSpread = Math.max(24, spreadDeg || 90);
    const baseAngle = direction > 0 ? 0 : Math.PI;
    const half = Phaser.Math.DegToRad(safeSpread * 0.5);
    const startA = baseAngle - half * 0.92;
    const endA = baseAngle + half * 0.92;
    const bladeR = safeR * 0.9;
    const sx = x + Math.cos(startA) * bladeR;
    const sy = y + Math.sin(startA) * bladeR;
    const ex = x + Math.cos(endA) * bladeR;
    const ey = y + Math.sin(endA) * bladeR;
    const scythe = this.add.image(sx, sy, "wraith_scythe");
    scythe.setDepth(DEPTH.PLAYER_FX);
    scythe.setOrigin(0.12, 0.88);
    scythe.setScale(direction > 0 ? 1.12 : -1.12, 1.12);
    scythe.setRotation(startA + Math.PI * 0.5);
    scythe.setAlpha(0.98);
    this.tweens.add({
      targets: scythe,
      x: ex,
      y: ey,
      rotation: endA + Math.PI * 0.5,
      duration: Phaser.Math.Clamp(sweepMs, 90, 800),
      ease: "Cubic.easeIn",
      onComplete: () => {
        if (scythe.active) scythe.destroy();
      }
    });
    this.time.delayedCall(Math.max(40, sweepMs * 0.45), () => {
      for (let i = 0; i < 16; i += 1) {
        const ang = startA + (endA - startA) * (i / 15);
        const px = x + Math.cos(ang) * (bladeR * 0.4);
        const py = y + Math.sin(ang) * (bladeR * 0.35);
        const s = this.add.circle(px, py, Phaser.Math.Between(3, 7), 0xe8f4ff, 0.75);
        s.setDepth(DEPTH.PLAYER_FX);
        this.tweens.add({
          targets: s,
          x: px + Math.cos(ang) * Phaser.Math.Between(30, 70),
          y: py + Phaser.Math.Between(-10, 18),
          alpha: 0,
          duration: 220,
          ease: "Quad.easeOut",
          onComplete: () => s.destroy()
        });
      }
      this.spawnImpactEffect(x + Math.cos((startA + endA) * 0.5) * bladeR * 0.55, y - 6, col, 36);
    });
  }

  spawnWraithTendrilWindup(boss, durationMs, color) {
    if (!boss?.active) return;
    const col = color || 0x9dbeff;
    const core = 0xe8f4ff;
    const bx = boss.x;
    const by = boss.y - 14;
    const d = durationMs || 420;
    const drawBurst = (x0, y0, x1, y1, delay) => {
      const gr = this.add.graphics();
      gr.setDepth(DEPTH.PLAYER_FX);
      const prog = { u: 0 };
      this.tweens.add({
        targets: prog,
        u: 1,
        duration: Math.min(280, d * 0.45),
        delay,
        ease: "Cubic.easeOut",
        onUpdate: () => {
          const u = prog.u;
          gr.clear();
          this.strokeWraithVoidTendril(gr, x0, y0, x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, col, this.time.now * 0.01, 9, 12);
        },
        onComplete: () => gr.destroy()
      });
    };
    drawBurst(bx - 28, by, bx - 220, by, 0);
    drawBurst(bx + 28, by, bx + 220, by, 60);
    drawBurst(bx, by - 24, bx, by - 200, 120);
    for (let k = 0; k < 14; k += 1) {
      const p = this.add.circle(
        bx + Phaser.Math.Between(-18, 18),
        by + Phaser.Math.Between(-8, 8),
        Phaser.Math.Between(3, 7),
        core,
        0.75
      );
      p.setDepth(DEPTH.PLAYER_FX);
      p.setStrokeStyle(1, col, 0.9);
      const ang = (k / 14) * Math.PI * 2;
      this.tweens.add({
        targets: p,
        x: bx + Math.cos(ang) * Phaser.Math.Between(40, 90),
        y: by + Math.sin(ang) * Phaser.Math.Between(20, 55) - 20,
        alpha: 0,
        scale: 0.2,
        duration: 320 + k * 25,
        delay: k * 22,
        ease: "Quad.easeOut",
        onComplete: () => p.destroy()
      });
    }
  }

  strokeWraithVoidTendril(graphics, x0, y0, x1, y1, color, phase, amp, steps) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const px = (-dy / len) * 1;
    const py = (dx / len) * 1;
    const n = Math.max(12, steps || 20);
    const drawStroke = (thick, a, c) => {
      graphics.lineStyle(thick, c, a);
      graphics.beginPath();
      graphics.moveTo(x0, y0);
      for (let i = 1; i <= n; i += 1) {
        const t = i / n;
        const bx = x0 + dx * t;
        const by = y0 + dy * t;
        const wobble = Math.sin(phase + t * 9) * amp;
        graphics.lineTo(bx + px * wobble, by + py * wobble);
      }
      graphics.strokePath();
    };
    const coreCol = 0xe8f4ff;
    drawStroke(16, 0.18, color);
    drawStroke(9, 0.42, color);
    drawStroke(3, 0.85, coreCol);
  }

  startWraithVoidTendrilPull(boss, targets, tuning) {
    if (!boss?.active || this.gameState !== "battle") return;
    const pullMs = tuning.pullDurationMs || 1100;
    const col = boss.definition?.color || 0x9dbeff;
    const gfx = this.add.graphics();
    gfx.setDepth(DEPTH.PLAYER_FX);
    this.wraithTendrilState = {
      boss,
      tendrilGfx: gfx,
      tendrilColor: col,
      until: this.time.now + pullMs,
      reachX: tuning.reachX || 400,
      reachUp: tuning.reachUp || 280,
      strength: tuning.pullStrength || 400,
      upwardBias: tuning.upwardBias ?? 0.35,
      platformGhostMs: tuning.platformGhostMs || 420,
      damageTickMs: tuning.damageTickMs || 220,
      damagePerTick: tuning.damagePerTick || 4,
      tendrilHitHalfWidth: tuning.tendrilHitHalfWidth ?? 36,
      lastDmg: this.time.now,
      targets
    };
  }

  redrawWraithVoidTendrilBeams(st) {
    const g = st.tendrilGfx;
    if (!g || !g.active || !st.boss?.active) return;
    const bx = st.boss.x;
    const by = st.boss.y - 16;
    const ru = st.reachUp || 280;
    const ww = this.physics?.world?.bounds?.width || this.scale?.width || 1200;
    const col = st.tendrilColor || 0x9dbeff;
    const phase = this.time.now * 0.012;
    g.clear();
    this.strokeWraithVoidTendril(g, bx - 32, by, 24, by, col, phase, 11, 22);
    this.strokeWraithVoidTendril(g, bx + 32, by, ww - 24, by, col, phase + 1.7, 11, 22);
    this.strokeWraithVoidTendril(g, bx, by - 20, bx, by - ru - 20, col, phase + 0.9, 14, 26);
    g.lineStyle(0);
  }

  updateWraithVoidTendrilPull(time) {
    const st = this.wraithTendrilState;
    if (!st || !st.boss?.active) {
      if (st?.tendrilGfx?.destroy) st.tendrilGfx.destroy();
      this.wraithTendrilState = null;
      return;
    }
    if (time >= st.until) {
      if (st.tendrilGfx?.destroy) st.tendrilGfx.destroy();
      this.wraithTendrilState = null;
      this.players.forEach((p) => {
        p.wraithPlatformPassUntil = 0;
      });
      return;
    }
    this.redrawWraithVoidTendrilBeams(st);
    const bx = st.boss.x;
    const bby = st.boss.y;
    const byBeam = bby - 16;
    const anchorFeet = bby - 12;
    const ru = st.reachUp || 280;
    const str = st.strength;
    const ub = st.upwardBias;
    const ww = this.physics?.world?.bounds?.width || this.scale?.width || 1200;
    const phase = time * 0.012;
    const hw = st.tendrilHitHalfWidth ?? 36;

    this.players.forEach((player) => {
      if (!player.isAlive || !player.body) return;
      const px = player.x;
      const py = player.y - 14;
      const dL = distPointToWraithTendrilPolyline(px, py, bx - 32, byBeam, 24, byBeam, phase, 11, 22);
      const dR = distPointToWraithTendrilPolyline(px, py, bx + 32, byBeam, ww - 24, byBeam, phase + 1.7, 11, 22);
      const dU = distPointToWraithTendrilPolyline(px, py, bx, byBeam - 20, bx, byBeam - ru - 20, phase + 0.9, 14, 26);
      const onL = dL < hw;
      const onR = dR < hw;
      const onU = dU < hw;
      if (!onL && !onR && !onU) {
        player.wraithPlatformPassUntil = 0;
        return;
      }
      const near = [];
      if (onL) near.push({ k: "L", d: dL });
      if (onR) near.push({ k: "R", d: dR });
      if (onU) near.push({ k: "U", d: dU });
      near.sort((a, b) => a.d - b.d);
      const primary = near[0].k;
      const inU = primary === "U";

      if (inU) {
        player.wraithPlatformPassUntil = time + 140;
      } else {
        player.wraithPlatformPassUntil = 0;
      }
      let tx = bx + (px < bx ? 48 : -48);
      let ty = anchorFeet;
      if (inU) {
        ty = anchorFeet + 6;
        tx = bx + Phaser.Math.Clamp((px - bx) * 0.55, -48, 48);
      }
      const dx = tx - px;
      const dy = ty - py;
      const len = Math.hypot(dx, dy) || 1;
      const nx = dx / len;
      const ny = dy / len;
      const pull = str * (inU ? 1.1 : 1);
      player.setVelocityX(nx * pull + (inU ? 0 : nx * ub * 90));
      player.setVelocityY(ny * pull * (inU ? 1.2 : 0.82) + (inU ? 140 : 0));
    });

    if (time - st.lastDmg >= st.damageTickMs) {
      st.lastDmg = time;
      st.targets.forEach((player) => {
        if (!player.isAlive) return;
        const px = player.x;
        const py = player.y - 14;
        const dLa = distPointToWraithTendrilPolyline(px, py, bx - 32, byBeam, 24, byBeam, phase, 11, 22);
        const dRa = distPointToWraithTendrilPolyline(px, py, bx + 32, byBeam, ww - 24, byBeam, phase + 1.7, 11, 22);
        const dUa = distPointToWraithTendrilPolyline(px, py, bx, byBeam - 20, bx, byBeam - ru - 20, phase + 0.9, 14, 26);
        if (dLa < hw || dRa < hw || dUa < hw) {
          st.boss.hitPlayer(player, st.damagePerTick, st.boss.definition.color, "melee");
        }
      });
    }
  }

  startHollowSoulLink(boss, twin, targets, tuning, color) {
    if (this.hollowSoulLinkState?.gfx?.destroy) {
      this.hollowSoulLinkState.gfx.destroy();
    }
    const gfx = this.add.graphics();
    gfx.setDepth(DEPTH.PLAYER_FX);
    const windupMs = tuning.windupMs || 520;
    const beamDurationMs = tuning.beamDurationMs || 900;
    const now = this.time.now;
    const col = color || 0xc4a8ff;
    this.hollowSoulLinkState = {
      boss,
      twin,
      gfx,
      color: col,
      windupEnd: now + windupMs,
      until: now + windupMs + beamDurationMs,
      damageTickMs: tuning.damageTickMs || 180,
      damagePerTick: tuning.damagePerTick || 5,
      beamHalfWidth: (tuning.beamWidth || 34) * 0.5,
      lastDmg: now,
      targets: targets || []
    };

    // windup VFX — converging particles from both anchors
    for (let anchor = 0; anchor < 2; anchor++) {
      const src = anchor === 0 ? boss : twin;
      if (!src?.active) continue;
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const dist = 30 + Math.random() * 20;
        const px = src.x + Math.cos(angle) * dist;
        const py = (src.y - 14) + Math.sin(angle) * dist;
        const spark = this.add.circle(px, py, 2.5, col, 0.7);
        spark.setDepth(DEPTH.PLAYER_FX);
        this.tweens.add({
          targets: spark,
          x: src.x,
          y: src.y - 14,
          alpha: 0,
          scale: 0.2,
          duration: windupMs * 0.8,
          delay: i * 30,
          ease: "Quad.easeIn",
          onComplete: () => spark.destroy()
        });
      }
      // anchor charge glow
      const glow = this.add.circle(src.x, src.y - 14, 6, col, 0.3);
      glow.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: glow,
        scale: { from: 0.5, to: 2 },
        alpha: { from: 0.4, to: 0 },
        duration: windupMs,
        ease: "Quad.easeOut",
        onComplete: () => glow.destroy()
      });
    }
  }

  drawHollowSoulLinkBeam(graphics, x1, y1, x2, y2, color, time, windup) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    const phase = time * 0.02;
    const amp = windup ? 4 : 14;
    const steps = 48;

    // outer void halo
    graphics.lineStyle(windup ? 26 : 36, 0x1a0828, windup ? 0.08 : 0.18);
    graphics.beginPath();
    graphics.moveTo(x1, y1);
    for (let i = 1; i <= 16; i++) {
      const t = i / 16;
      const bx = x1 + dx * t;
      const by = y1 + dy * t;
      const wob = Math.sin(phase * 0.7 + t * 8) * amp * 0.6;
      graphics.lineTo(bx + px * wob, by + py * wob);
    }
    graphics.strokePath();

    // spiral energy strands (two counter-rotating)
    for (let s = 0; s < 2; s++) {
      const sign = s === 0 ? 1 : -1;
      graphics.lineStyle(windup ? 2 : 3.5, color, windup ? 0.18 : 0.35);
      graphics.beginPath();
      graphics.moveTo(x1, y1);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const bx = x1 + dx * t;
        const by = y1 + dy * t;
        const spiral = Math.sin(phase * 2 + t * 20 + s * Math.PI) * amp * 1.2 * sign;
        graphics.lineTo(bx + px * spiral, by + py * spiral);
      }
      graphics.strokePath();
    }

    // main beam layers
    const layers = [
      { thick: 18, a: windup ? 0.1 : 0.25, c: color },
      { thick: 9, a: windup ? 0.28 : 0.5, c: color },
      { thick: 4, a: windup ? 0.5 : 0.85, c: 0xf0e8ff },
      { thick: 1.5, a: windup ? 0.65 : 1, c: 0xffffff }
    ];
    layers.forEach((layer, li) => {
      graphics.lineStyle(layer.thick, layer.c, layer.a);
      graphics.beginPath();
      graphics.moveTo(x1 + px * Math.sin(phase) * 2, y1 + py * Math.sin(phase) * 2);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const bx = x1 + dx * t;
        const by = y1 + dy * t;
        const wob = Math.sin(phase + t * 14 + li * 0.5) * amp * (1 - li * 0.15);
        graphics.lineTo(bx + px * wob, by + py * wob);
      }
      graphics.strokePath();
    });

    // pulsing node dots along beam
    if (!windup) {
      const nodeCount = 6;
      for (let i = 0; i < nodeCount; i++) {
        const t = (i + 0.5) / nodeCount;
        const pulse = 0.4 + 0.6 * Math.abs(Math.sin(phase * 3 + i * 1.2));
        const nx = x1 + dx * t + px * Math.sin(phase + t * 14) * amp * 0.5;
        const ny = y1 + dy * t + py * Math.sin(phase + t * 14) * amp * 0.5;
        graphics.fillStyle(0xffffff, 0.35 * pulse);
        graphics.fillCircle(nx, ny, 3 + pulse * 2);
        graphics.fillStyle(color, 0.25 * pulse);
        graphics.fillCircle(nx, ny, 6 + pulse * 3);
      }
    }

    // anchor glows at endpoints
    const endGlow = windup ? 0.2 : 0.5;
    graphics.fillStyle(color, endGlow);
    graphics.fillCircle(x1, y1, windup ? 4 : 8);
    graphics.fillCircle(x2, y2, windup ? 4 : 8);
    graphics.fillStyle(0xffffff, endGlow * 0.6);
    graphics.fillCircle(x1, y1, windup ? 2 : 4);
    graphics.fillCircle(x2, y2, windup ? 2 : 4);
  }

  updateHollowSoulLink(time) {
    const st = this.hollowSoulLinkState;
    if (!st) return;
    if (this.gameState !== "battle" || !st.boss?.active || !st.twin?.active) {
      if (st.gfx?.destroy) st.gfx.destroy();
      this.hollowSoulLinkState = null;
      return;
    }
    if (time >= st.until) {
      if (st.gfx?.destroy) st.gfx.destroy();
      this.hollowSoulLinkState = null;
      return;
    }
    const x1 = st.boss.x;
    const y1 = st.boss.y - 14;
    const x2 = st.twin.x;
    const y2 = st.twin.y - 14;
    const inWindup = time < st.windupEnd;
    st.gfx.clear();
    this.drawHollowSoulLinkBeam(st.gfx, x1, y1, x2, y2, st.color, time, inWindup);
    if (!inWindup && time - st.lastDmg >= st.damageTickMs) {
      st.lastDmg = time;
      const halfW = st.beamHalfWidth;
      st.targets.forEach((player) => {
        if (!player.isAlive) return;
        const px = player.x;
        const py = player.y - 14;
        if (distPointToSegment(px, py, x1, y1, x2, y2) <= halfW) {
          st.boss.hitPlayer(player, st.damagePerTick, st.color, "melee");
        }
      });
    }
  }

  updateHollowRevenantTwinMovement(time) {
    const twin = this.bossTwin;
    const leader = this.boss;
    if (!twin?.active || !leader?.active) return;
    const def = leader.definition;
    const th = def.twinHover || {};
    const targets = this.getBossAiTargets().filter((t) => t?.active && t.isAlive);
    if (!targets.length) return;
    const target = typeof twin.getPriorityTarget === "function" ? twin.getPriorityTarget(targets) : targets[0];
    if (!target) return;

    const arenaW = this.physics?.world?.bounds?.width || this.scale.width || 1200;
    const arenaH = this.physics?.world?.bounds?.height || this.scale.height || 540;
    const fd = Number.isFinite(th.flankDistance) ? th.flankDistance : 128;
    const fh = Number.isFinite(th.floatHeight) ? th.floatHeight : 92;
    const orbitR = Number.isFinite(th.orbitRadius) ? th.orbitRadius : 168;
    const orbitW = Number.isFinite(th.orbitPhaseSpeed) ? th.orbitPhaseSpeed : 0.00062;
    const wander = Number.isFinite(th.lateralWander) ? th.lateralWander : 72;
    const phase = time * orbitW;
    const bobX = Math.sin(time * 0.00125) * (Number.isFinite(th.bobX) ? th.bobX : 38);
    const bobY = Math.cos(time * 0.00185) * (Number.isFinite(th.bobY) ? th.bobY : 18);

    const focusX = Phaser.Math.Linear(target.x, leader.x, 0.28);
    const focusY = Phaser.Math.Linear(target.y, leader.y, 0.18);
    const orbitX = Math.cos(phase) * orbitR * 0.62 + Math.sin(phase * 1.9) * wander * 0.35;
    const orbitY = Math.sin(phase * 0.85) * 42 + Math.cos(phase * 1.4) * 28;
    let goalX = focusX + orbitX + bobX;
    let goalY = focusY - fh + orbitY + bobY * 0.45;
    goalX = Phaser.Math.Clamp(goalX, 64, arenaW - 64);
    const minY = Number.isFinite(th.minY) ? th.minY : 118;
    const maxY = Number.isFinite(th.maxY) ? th.maxY : Math.min(420, arenaH - 80);
    goalY = Phaser.Math.Clamp(goalY, minY, maxY);

    const lerp = Number.isFinite(th.followLerp) ? th.followLerp : 0.11;
    twin.setPosition(
      Phaser.Math.Linear(twin.x, goalX, lerp),
      Phaser.Math.Linear(twin.y, goalY, lerp * 0.92)
    );
    if (twin.body) {
      twin.body.reset(twin.x, twin.y);
    }
    twin.setVelocity(0, 0);
    twin.flipX = target.x < twin.x;
  }

  updateHollowTwinRangedAttack(time) {
    const leader = this.boss;
    const twin = this.bossTwin;
    if (!leader?.active || !twin?.active || leader.definition?.id !== "hollowPair") return;
    if (this.hollowSoulLinkState && time < this.hollowSoulLinkState.until) return;
    const tuningOrb = leader.getAttackTuning("hollowBloomOrb", {
      travelMs: 3200,
      cooldownMs: 1860
    });
    const tuningSpear = leader.getAttackTuning("hollowTwinSpear", {
      windupMs: 460,
      cooldownMs: 1880
    });
    if (twin._nextHollowTwinAttackAt == null) {
      twin._nextHollowTwinAttackAt = time + 1020;
    }
    if (time < twin._nextHollowTwinAttackAt) return;
    if (twin._hollowTwinPhase !== "orb" && twin._hollowTwinPhase !== "spear") {
      twin._hollowTwinPhase = "orb";
    }
    const targets = this.getBossAiTargets().filter((t) => t?.active && t.isAlive);
    if (!targets.length) return;
    const target = typeof twin.getPriorityTarget === "function" ? twin.getPriorityTarget(targets) : targets[0];
    if (!target) return;
    const cdOrb = Number.isFinite(tuningOrb.cooldownMs) ? tuningOrb.cooldownMs : 1380;
    const cdSpear = Number.isFinite(tuningSpear.cooldownMs) ? tuningSpear.cooldownMs : 1380;
    const wuSpear = Number.isFinite(tuningSpear.windupMs) ? tuningSpear.windupMs : 320;
    if (twin._hollowTwinPhase === "orb") {
      this.spawnHollowBloomOrb(leader, twin, target);
      twin._hollowTwinPhase = "spear";
      twin._nextHollowTwinAttackAt = time + cdOrb;
    } else {
      if (typeof leader.spawnTwinVoidBoltFromFloater === "function") {
        leader.spawnTwinVoidBoltFromFloater(target, time);
      }
      twin._hollowTwinPhase = "orb";
      twin._nextHollowTwinAttackAt = time + wuSpear + cdSpear;
    }
  }

  spawnPyromancerWarpEmberMarker(x, y, radius, durationMs) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const r = Math.max(20, radius || 80);
    const hot = 0xff4422;
    const co = 0xffaa44;
    const bright = 0xffff88;
    const pool = [];

    // dark ground scorch expanding outward
    const scorch = this.add.ellipse(x, y + 6, r * 0.4, r * 0.18, 0x1a0804, 0.35);
    scorch.setDepth(DEPTH.BOSS_TELEGRAPH - 1);
    pool.push(scorch);
    this.tweens.add({
      targets: scorch,
      scaleX: 2.8,
      scaleY: 2.4,
      alpha: 0.55,
      duration: durationMs * 0.85,
      ease: "Cubic.easeIn"
    });

    // outer warning ring that contracts inward
    const warnRing = this.add.ellipse(x, y + 4, r * 2.4, r * 1.2, 0x000000, 0.0);
    warnRing.setStrokeStyle(3, hot, 0.45);
    warnRing.setDepth(DEPTH.BOSS_TELEGRAPH);
    pool.push(warnRing);
    this.tweens.add({
      targets: warnRing,
      scaleX: 0.45,
      scaleY: 0.45,
      alpha: 0,
      duration: durationMs,
      ease: "Cubic.easeIn"
    });

    // second ring, offset timing
    const warnRing2 = this.add.ellipse(x, y + 4, r * 1.8, r * 0.9, 0x000000, 0.0);
    warnRing2.setStrokeStyle(2, co, 0.35);
    warnRing2.setDepth(DEPTH.BOSS_TELEGRAPH);
    pool.push(warnRing2);
    this.tweens.add({
      targets: warnRing2,
      scaleX: 0.5,
      scaleY: 0.5,
      alpha: 0,
      delay: durationMs * 0.2,
      duration: durationMs * 0.8,
      ease: "Cubic.easeIn"
    });

    // animated rune circle via graphics
    const runeGfx = this.add.graphics();
    runeGfx.setDepth(DEPTH.BOSS_TELEGRAPH + 1);
    pool.push(runeGfx);
    const runeState = { angle: 0, progress: 0 };
    const runeTween = this.tweens.add({
      targets: runeState,
      angle: Math.PI * 6,
      progress: 1,
      duration: durationMs,
      ease: "Linear",
      onUpdate: () => {
        runeGfx.clear();
        const p = runeState.progress;
        const rr = r * (0.5 + 0.5 * p);
        const a = runeState.angle;
        // outer rune circle
        runeGfx.lineStyle(2, hot, 0.3 + 0.4 * p);
        runeGfx.beginPath();
        runeGfx.arc(x, y + 4, rr * 0.48, a, a + Math.PI * 1.6);
        runeGfx.strokePath();
        // inner circle spinning opposite
        runeGfx.lineStyle(1.5, bright, 0.2 + 0.3 * p);
        runeGfx.beginPath();
        runeGfx.arc(x, y + 4, rr * 0.28, -a * 1.3, -a * 1.3 + Math.PI * 1.2);
        runeGfx.strokePath();
        // radial tick marks
        for (let i = 0; i < 8; i += 1) {
          const ta = a * 0.5 + (i / 8) * Math.PI * 2;
          const innerD = rr * 0.35;
          const outerD = rr * 0.5;
          runeGfx.lineStyle(1.5, co, 0.25 + 0.35 * p);
          runeGfx.beginPath();
          runeGfx.moveTo(x + Math.cos(ta) * innerD, y + 4 + Math.sin(ta) * innerD * 0.45);
          runeGfx.lineTo(x + Math.cos(ta) * outerD, y + 4 + Math.sin(ta) * outerD * 0.45);
          runeGfx.strokePath();
        }
      }
    });
    pool.push({ destroy: () => { runeTween.stop(); runeGfx.destroy(); }, active: true });

    // rising ember sparks converging toward the center
    for (let i = 0; i < 16; i += 1) {
      const ang = (i / 16) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2);
      const dist = r * Phaser.Math.FloatBetween(0.6, 1.2);
      const startX = x + Math.cos(ang) * dist;
      const startY = y + 4 + Math.sin(ang) * dist * 0.45;
      const sz = Phaser.Math.Between(2, 5);
      const spark = this.add.circle(startX, startY, sz, i % 3 === 0 ? hot : co, 0.0);
      spark.setDepth(DEPTH.BOSS_TELEGRAPH + 2);
      pool.push(spark);
      this.tweens.add({
        targets: spark,
        x: x + Phaser.Math.Between(-4, 4),
        y: y + Phaser.Math.Between(-2, 6),
        alpha: { from: 0, to: 0.65 },
        scale: { from: 1.2, to: 0.3 },
        delay: (durationMs * 0.1) + i * (durationMs * 0.04),
        duration: durationMs * 0.55,
        ease: "Cubic.easeIn"
      });
    }

    // pulsing core glow that intensifies
    const coreGlow = this.add.ellipse(x, y + 2, r * 0.3, r * 0.15, bright, 0.0);
    coreGlow.setDepth(DEPTH.BOSS_TELEGRAPH + 3);
    pool.push(coreGlow);
    this.tweens.add({
      targets: coreGlow,
      alpha: { from: 0, to: 0.5 },
      scaleX: { from: 0.6, to: 1.4 },
      scaleY: { from: 0.6, to: 1.2 },
      duration: durationMs * 0.5,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut"
    });

    // final flash right before completion
    this.time.delayedCall(durationMs - 100, () => {
      const flash = this.add.circle(x, y + 2, 8, 0xffffff, 0.7);
      flash.setDepth(DEPTH.BOSS_TELEGRAPH + 4);
      this.tweens.add({
        targets: flash,
        scaleX: 5,
        scaleY: 3.5,
        alpha: 0,
        duration: 160,
        onComplete: () => flash.destroy()
      });
    });

    this.time.delayedCall(durationMs + 50, () => {
      pool.forEach((o) => {
        if (o && o.active && o.destroy) o.destroy();
      });
    });
  }

  spawnPyromancerEmberPortal(px, py, direction, durationMs) {
    if (!Number.isFinite(px) || !Number.isFinite(py)) return;
    const d = direction < 0 ? -1 : 1;
    const pool = [];
    const hot = 0xff4422;
    const co = 0xffaa44;
    const bright = 0xffff88;

    // dark void backdrop
    const voidCore = this.add.ellipse(px, py, 54, 72, 0x0a0204, 0.55);
    voidCore.setDepth(DEPTH.BOSS_TELEGRAPH);
    pool.push(voidCore);
    this.tweens.add({
      targets: voidCore,
      scaleX: { from: 0.0, to: 1.0 },
      scaleY: { from: 0.0, to: 1.0 },
      duration: 200,
      ease: "Back.easeOut"
    });

    // outer fire ring
    const outerRing = this.add.ellipse(px, py, 78, 102, 0x000000, 0.0);
    outerRing.setStrokeStyle(4, hot, 0.65);
    outerRing.setDepth(DEPTH.BOSS_TELEGRAPH + 1);
    pool.push(outerRing);
    this.tweens.add({
      targets: outerRing,
      scaleX: { from: 0.0, to: 1.0 },
      scaleY: { from: 0.0, to: 1.0 },
      duration: 240,
      ease: "Back.easeOut"
    });
    this.tweens.add({
      targets: outerRing,
      scaleX: { from: 0.95, to: 1.06 },
      scaleY: { from: 0.96, to: 1.04 },
      duration: 150,
      delay: 260,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

    // mid ring with ember glow
    const midRing = this.add.ellipse(px, py, 60, 80, 0x000000, 0.0);
    midRing.setStrokeStyle(2.5, co, 0.55);
    midRing.setDepth(DEPTH.BOSS_TELEGRAPH + 2);
    pool.push(midRing);
    this.tweens.add({
      targets: midRing,
      scaleX: { from: 0.0, to: 1.0 },
      scaleY: { from: 0.0, to: 1.0 },
      duration: 260,
      ease: "Back.easeOut"
    });

    // inner bright ellipse
    const innerGlow = this.add.ellipse(px, py - 2, 32, 44, hot, 0.15);
    innerGlow.setDepth(DEPTH.BOSS_TELEGRAPH + 3);
    pool.push(innerGlow);
    this.tweens.add({
      targets: innerGlow,
      alpha: { from: 0.1, to: 0.28 },
      scaleX: { from: 0.9, to: 1.15 },
      scaleY: { from: 0.9, to: 1.1 },
      duration: 120,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

    // white-hot center point
    const hotspot = this.add.circle(px, py, 6, bright, 0.4);
    hotspot.setDepth(DEPTH.BOSS_TELEGRAPH + 4);
    pool.push(hotspot);
    this.tweens.add({
      targets: hotspot,
      alpha: { from: 0.25, to: 0.55 },
      scale: { from: 0.8, to: 1.3 },
      duration: 90,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

    // spinning swirl arcs drawn via graphics
    const swirlGfx = this.add.graphics();
    swirlGfx.setDepth(DEPTH.BOSS_TELEGRAPH + 2);
    pool.push(swirlGfx);
    const swirlState = { angle: 0 };
    const swirlTween = this.tweens.add({
      targets: swirlState,
      angle: Math.PI * 200,
      duration: durationMs,
      ease: "Linear",
      onUpdate: () => {
        swirlGfx.clear();
        const a = swirlState.angle;
        // three spinning fire arcs
        for (let s = 0; s < 3; s += 1) {
          const base = a * d + (s * Math.PI * 2) / 3;
          const arcR = 32 + s * 4;
          swirlGfx.lineStyle(2.5 - s * 0.4, s === 0 ? hot : s === 1 ? co : bright, 0.5 - s * 0.1);
          swirlGfx.beginPath();
          swirlGfx.arc(px, py, arcR, base, base + Math.PI * 0.7);
          swirlGfx.strokePath();
        }
        // inner counter-rotating arc
        swirlGfx.lineStyle(1.5, bright, 0.3);
        swirlGfx.beginPath();
        swirlGfx.arc(px, py, 18, -a * d * 1.4, -a * d * 1.4 + Math.PI * 0.5);
        swirlGfx.strokePath();
      }
    });

    // continuous ember particle emission
    const particleEv = this.time.addEvent({
      delay: 80,
      loop: true,
      callback: () => {
        const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const dist = Phaser.Math.Between(30, 48);
        const spark = this.add.circle(
          px + Math.cos(ang) * dist,
          py + Math.sin(ang) * dist * 0.65,
          Phaser.Math.Between(2, 4),
          Math.random() > 0.5 ? hot : co,
          0.6
        );
        spark.setDepth(DEPTH.BOSS_TELEGRAPH + 5);
        this.tweens.add({
          targets: spark,
          x: px + Phaser.Math.Between(-6, 6),
          y: py + Phaser.Math.Between(-8, 8),
          alpha: 0,
          scale: 0.2,
          duration: Phaser.Math.Between(200, 400),
          ease: "Cubic.easeIn",
          onComplete: () => spark.destroy()
        });
      }
    });

    // upward heat distortion streaks
    const heatEv = this.time.addEvent({
      delay: 200,
      loop: true,
      callback: () => {
        const ox = Phaser.Math.Between(-20, 20);
        const streak = this.add.rectangle(px + ox, py - 40, 2, Phaser.Math.Between(12, 28), co, 0.2);
        streak.setDepth(DEPTH.BOSS_TELEGRAPH + 1);
        this.tweens.add({
          targets: streak,
          y: py - Phaser.Math.Between(60, 90),
          alpha: 0,
          scaleY: 0.4,
          duration: Phaser.Math.Between(300, 500),
          ease: "Sine.easeOut",
          onComplete: () => streak.destroy()
        });
      }
    });

    // close-down: fade everything and clean up
    this.time.delayedCall(durationMs, () => {
      particleEv.remove();
      heatEv.remove();
      swirlTween.stop();
      // collapse animation
      this.tweens.add({
        targets: pool,
        scaleX: 0,
        scaleY: 0,
        alpha: 0,
        duration: 200,
        ease: "Cubic.easeIn",
        onComplete: () => pool.forEach((p) => { if (p?.destroy) p.destroy(); })
      });
    });
  }

  spawnPyromancerFireNovaBurst(x, y, radius, color) {
    if (!Number.isFinite(radius) || radius <= 0) return;
    const orange = 0xff7722;
    const yellow = 0xffcc44;
    const coreC = color || 0xff8659;
    for (let i = 0; i < 5; i += 1) {
      const ring = this.add.circle(x, y, radius * (0.12 + i * 0.08), 0x000000, 0);
      ring.setStrokeStyle(4, i % 2 === 0 ? orange : yellow, 0.78 - i * 0.1);
      ring.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: ring,
        radius: { from: radius * (0.1 + i * 0.06), to: radius * (0.92 + i * 0.02) },
        alpha: { from: 0.88, to: 0 },
        duration: 160 + i * 28,
        ease: "Cubic.easeOut",
        onComplete: () => ring.destroy()
      });
    }
    const spikes = 10;
    for (let s = 0; s < spikes; s += 1) {
      const ang = (s / spikes) * Math.PI * 2;
      const g = this.add.graphics();
      g.setDepth(DEPTH.PLAYER_FX);
      g.lineStyle(4, coreC, 0.92);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(ang) * radius * 0.88, y + Math.sin(ang) * radius * 0.88);
      g.strokePath();
      g.lineStyle(2, yellow, 0.45);
      g.beginPath();
      g.moveTo(x + Math.cos(ang) * radius * 0.15, y + Math.sin(ang) * radius * 0.15);
      g.lineTo(x + Math.cos(ang) * radius * 0.72, y + Math.sin(ang) * radius * 0.72);
      g.strokePath();
      this.tweens.add({
        targets: g,
        alpha: { from: 0.9, to: 0 },
        duration: 200,
        delay: s * 6,
        onComplete: () => g.destroy()
      });
    }
    this.spawnImpactEffect(x, y, coreC, Math.min(46, radius * 0.42));
  }

  spawnPyromancerCinderTrailTelegraph(rect, durationMs) {
    if (!rect) return;
    const w = rect.width;
    const h = rect.height;
    const cx = rect.x + w * 0.5;
    const cy = rect.y + h * 0.5;
    const cinders = [];
    const n = Math.max(16, Math.floor(w / 14));
    for (let i = 0; i < n; i += 1) {
      const t = i / Math.max(1, n - 1);
      const px = rect.x + w * t + Phaser.Math.Between(-4, 4);
      const py = cy + Phaser.Math.Between(-h * 0.35, h * 0.35);
      const c = this.add.circle(px, py, Phaser.Math.Between(2, 5), Phaser.Math.Between(0, 1) ? 0xff6622 : 0xffaa44, 0.22);
      c.setDepth(DEPTH.BOSS_TELEGRAPH);
      c.setStrokeStyle(1, 0xffffaa, 0.12);
      cinders.push(c);
      this.tweens.add({
        targets: c,
        alpha: { from: 0.12, to: 0.32 },
        scale: { from: 0.7, to: 1.15 },
        duration: 70,
        yoyo: true,
        repeat: Math.max(3, Math.floor(durationMs / 70)),
        ease: "Sine.easeInOut"
      });
    }
    this.time.delayedCall(durationMs, () => {
      cinders.forEach((c) => {
        if (c.active) c.destroy();
      });
    });
  }

  spawnStalkerGroundClaws(bossX, bossY, direction, durationMs) {
    if (!this.textures.exists("stalker_claw")) return;
    const d = direction < 0 ? -1 : 1;
    const footY = bossY + 30;
    const L = this.add.image(bossX - d * 20, footY, "stalker_claw");
    const R = this.add.image(bossX + d * 26, footY, "stalker_claw");
    [L, R].forEach((c) => {
      c.setDepth(DEPTH.BOSS_TELEGRAPH + 2);
      c.setScale(0.72);
      c.setAlpha(0.92);
    });
    L.setRotation(d > 0 ? 2.35 : -2.35);
    R.setRotation(d > 0 ? -2.2 : 2.2);
    L.setFlipX(d < 0);
    R.setFlipX(d < 0);
    this.tweens.add({
      targets: [L, R],
      y: footY + 3,
      duration: 90,
      yoyo: true,
      repeat: Math.max(2, Math.floor(durationMs / 90)),
      ease: "Sine.easeInOut"
    });
    this.time.delayedCall(durationMs, () => {
      this.tweens.add({
        targets: [L, R],
        alpha: 0,
        duration: 100,
        onComplete: () => {
          L.destroy();
          R.destroy();
        }
      });
    });
  }

  spawnStalkerLeapClawsFollowing(boss, direction, durationMs) {
    if (!boss || !this.textures.exists("stalker_claw")) return;
    const d = direction < 0 ? -1 : 1;
    const left = this.add.image(0, 0, "stalker_claw");
    const right = this.add.image(0, 0, "stalker_claw");
    left.setDepth(DEPTH.BOSS_TELEGRAPH + 3);
    right.setDepth(DEPTH.BOSS_TELEGRAPH + 3);
    left.setScale(0.78);
    right.setScale(0.78);
    const place = () => {
      if (!boss.active) return false;
      const bx = boss.x + d * 42;
      const by = boss.y + 14;
      left.setPosition(bx - 16, by);
      right.setPosition(bx + 10, by);
      left.setRotation(d > 0 ? 0.35 : -0.35);
      right.setRotation(d > 0 ? -0.45 : 0.45);
      left.setFlipX(d < 0);
      right.setFlipX(d < 0);
      return true;
    };
    place();
    const ev = this.time.addEvent({
      delay: 40,
      loop: true,
      callback: () => {
        if (this.gameState !== "battle" || !place()) {
          ev.remove();
          left.destroy();
          right.destroy();
        }
      }
    });
    this.time.delayedCall(durationMs, () => {
      ev.remove();
      this.tweens.add({
        targets: [left, right],
        alpha: 0,
        duration: 90,
        onComplete: () => {
          left.destroy();
          right.destroy();
        }
      });
    });
  }

  spawnStalkerShadowSpearJab(x, y, direction, radius, spreadDeg, hitIndex) {
    if (!this.textures.exists("shadow_spear")) return;
    const safeR = Math.max(40, radius || 100);
    const safeSpread = Math.max(40, spreadDeg || 100);
    const base = direction > 0 ? 0 : Math.PI;
    const half = Phaser.Math.DegToRad(safeSpread * 0.5);
    const offsets = [-0.28, 0, 0.28];
    const o = offsets[Math.min(hitIndex, 2)] || 0;
    const angle = Phaser.Math.Clamp(base + o * half, base - half * 0.92, base + half * 0.92);
    const dist = safeR * (0.68 + hitIndex * 0.04);
    const sx = x + Math.cos(angle) * dist * 0.28;
    const sy = y + Math.sin(angle) * dist * 0.28;
    const spear = this.add.image(sx, sy, "shadow_spear");
    spear.setOrigin(0, 0.5);
    spear.setRotation(angle);
    spear.setDepth(DEPTH.PLAYER_FX);
    spear.setAlpha(0.92);
    spear.setScale(direction > 0 ? 1.05 : -1.05, 1.05);
    const tipX = x + Math.cos(angle) * dist;
    const tipY = y + Math.sin(angle) * dist;
    this.tweens.add({
      targets: spear,
      x: tipX,
      y: tipY,
      alpha: 0,
      duration: 100,
      ease: "Cubic.easeOut",
      onComplete: () => spear.destroy()
    });
  }

  spawnStalkerRiftTendril(x1, y1, x2, y2, durationMs) {
    const g = this.add.graphics();
    g.setDepth(DEPTH.BOSS_TELEGRAPH);
    const midX = (x1 + x2) * 0.5 + (y2 - y1) * 0.12;
    const midY = (y1 + y2) * 0.5 - 28;
    const drawLines = () => {
      g.clear();
      g.lineStyle(12, 0x331844, 0.22);
      g.beginPath();
      g.moveTo(x1, y1);
      graphicsQuadBezier(g, x1, y1, midX, midY, x2, y2);
      g.strokePath();
      g.lineStyle(4, 0xcf7cff, 0.38);
      g.beginPath();
      g.moveTo(x1, y1);
      graphicsQuadBezier(g, x1, y1, midX, midY, x2, y2);
      g.strokePath();
    };
    drawLines();
    g.setAlpha(0.48);
    this.tweens.add({
      targets: g,
      alpha: { from: 0.3, to: 0.72 },
      duration: 88,
      yoyo: true,
      repeat: Math.max(2, Math.floor(durationMs / 88))
    });
    this.time.delayedCall(durationMs, () => {
      this.tweens.add({
        targets: g,
        alpha: 0,
        duration: 130,
        onComplete: () => g.destroy()
      });
    });
  }

  spawnStalkerRiftChargeGlow(boss, durationMs) {
    if (!boss || !boss.setTint) return;
    let step = 0;
    const ev = this.time.addEvent({
      delay: 72,
      loop: true,
      callback: () => {
        if (!boss.active) return;
        step += 1;
        boss.setTint(step % 2 === 0 ? 0xb388ff : 0x6633aa);
      }
    });
    this.time.delayedCall(durationMs, () => {
      ev.remove();
      if (boss.active) boss.clearTint();
    });
  }

  spawnBehemothShieldBashTelegraph(rect, direction, durationMs, color) {
    if (!rect) return;
    const cx = rect.x + rect.width * 0.5;
    const cy = rect.y + rect.height * 0.5;
    const dir = direction < 0 ? -1 : 1;
    const shield = this.add.graphics();
    shield.setDepth(DEPTH.BOSS_TELEGRAPH + 2);
    const sx = cx + dir * (rect.width * 0.32);
    const draw = () => {
      shield.clear();
      shield.fillStyle(0x7a8a78, 0.12);
      shield.fillRoundedRect(sx - dir * 34, cy - 36, 40, 72, 8);
      shield.lineStyle(1, 0xc8e8d0, 0.16);
      shield.strokeRoundedRect(sx - dir * 34, cy - 36, 40, 72, 8);
      shield.lineStyle(1, color || 0xb7ff7f, 0.12);
      shield.beginPath();
      shield.moveTo(sx - dir * 22, cy - 24);
      shield.lineTo(sx - dir * 22, cy + 24);
      shield.strokePath();
      shield.fillStyle(0x5a6858, 0.1);
      shield.fillCircle(sx - dir * 18, cy, 10);
    };
    draw();
    shield.setAlpha(0.22);
    this.tweens.add({
      targets: shield,
      alpha: { from: 0.18, to: 0.28 },
      duration: 100,
      yoyo: true,
      repeat: Math.max(2, Math.floor(durationMs / 100))
    });
    this.time.delayedCall(durationMs, () => shield.destroy());
  }

  spawnBehemothShieldBashImpact(cx, cy, direction, color) {
    const dir = direction < 0 ? -1 : 1;
    const c = color || 0xb7ff7f;
    const flash = this.add.circle(cx + dir * 28, cy, 46, c, 0.52);
    flash.setDepth(DEPTH.PLAYER_FX);
    flash.setStrokeStyle(5, 0xe8ffd0, 0.9);
    const rim = this.add.circle(cx + dir * 32, cy, 52, 0x000000, 0);
    rim.setStrokeStyle(3, c, 0.45);
    rim.setDepth(DEPTH.PLAYER_FX);
    this.tweens.add({
      targets: [flash, rim],
      alpha: 0,
      scale: 1.2,
      duration: 170,
      onComplete: () => {
        flash.destroy();
        rim.destroy();
      }
    });
  }

  spawnBehemothColossusShockwave(x, y, radius, color) {
    if (!Number.isFinite(radius) || radius <= 0) return;
    const safeR = radius;
    const moss = 0x5a6848;
    const leaf = 0x96c888;
    for (let i = 0; i < 4; i += 1) {
      const ring = this.add.circle(x, y, safeR * (0.14 + i * 0.06), 0x000000, 0);
      ring.setStrokeStyle(3, color || leaf, 0.5 - i * 0.08);
      ring.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: ring,
        radius: { from: safeR * (0.08 + i * 0.05), to: safeR },
        alpha: { from: 0.55, to: 0 },
        duration: 150 + i * 32,
        ease: "Cubic.easeOut",
        onComplete: () => ring.destroy()
      });
    }
    const crackN = 12;
    for (let c = 0; c < crackN; c += 1) {
      const angle = (c / crackN) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.12, 0.12);
      const len = safeR * Phaser.Math.FloatBetween(0.48, 0.98);
      const gx = this.add.graphics();
      gx.setDepth(DEPTH.PLATFORM + 2);
      const fade = 0.5 * (1 - len / safeR);
      gx.lineStyle(2, moss, 0.2 + fade * 0.7);
      gx.beginPath();
      gx.moveTo(x, y);
      gx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len * 0.7);
      gx.strokePath();
      this.tweens.add({
        targets: gx,
        alpha: { from: 0.85, to: 0 },
        duration: 210 + c * 4,
        ease: "Quad.easeIn",
        onComplete: () => gx.destroy()
      });
    }
    this.spawnImpactEffect(x, y, color || 0xb7ff7f, Math.min(44, safeR * 0.34));
  }

  spawnBehemothMeteorAtAim(aimX, footCenterY, windupMs, dropDurationMs) {
    if (!Number.isFinite(aimX) || !Number.isFinite(footCenterY) || !this.textures.exists("behemoth_meteor")) return;
    const cx = aimX;
    const hoverY = Math.min(footCenterY - 28 - 140, footCenterY - 160);
    const rock = this.add.sprite(cx, hoverY, "behemoth_meteor");
    rock.setDepth(DEPTH.BOSS_TELEGRAPH + 1);
    rock.setScale(1.55);
    rock.setTint(0xd8f0d0);
    rock.setAlpha(0.98);
    const bob = this.tweens.add({
      targets: rock,
      y: { from: hoverY - 5, to: hoverY + 5 },
      duration: 160,
      yoyo: true,
      repeat: Math.max(1, Math.floor(windupMs / 160) - 1)
    });
    this.tweens.add({
      targets: rock,
      scaleX: { from: 1.45, to: 1.62 },
      scaleY: { from: 1.45, to: 1.62 },
      duration: Math.max(300, windupMs * 0.85),
      yoyo: true,
      repeat: 0
    });
    this.tweens.add({
      targets: rock,
      angle: 0.35,
      duration: windupMs,
      ease: "Sine.easeInOut"
    });
    this.time.delayedCall(windupMs, () => {
      bob.stop();
      if (!rock.active || this.gameState !== "battle") {
        if (rock.active) rock.destroy();
        return;
      }
      const impactY = footCenterY - 40;
      this.tweens.add({
        targets: rock,
        y: impactY,
        scaleX: 1.85,
        scaleY: 1.88,
        angle: rock.angle + 0.4,
        duration: dropDurationMs,
        ease: "Cubic.easeIn",
        onComplete: () => {
          if (rock.active) rock.destroy();
        }
      });
    });
  }

  spawnBehemothStalkTeleportBurst(bossX, bossY, fromX, fromY, color) {
    if (this.isTrueHitboxView()) return;
    const c = color || 0xb7ff7f;
    for (let i = 0; i < 10; i++) {
      const p = this.add.circle(fromX + Phaser.Math.Between(-20, 20), fromY + Phaser.Math.Between(-30, 10), Phaser.Math.Between(3, 7), c, 0.45);
      p.setDepth(DEPTH.BOSS_TELEGRAPH);
      this.tweens.add({
        targets: p,
        x: bossX + Phaser.Math.Between(-40, 40),
        y: bossY + Phaser.Math.Between(-20, 20),
        alpha: 0,
        duration: 220 + Phaser.Math.Between(0, 80),
        ease: "Quad.easeIn",
        onComplete: () => p.destroy()
      });
    }
    const ring = this.add.circle(bossX, bossY - 10, 20, c, 0);
    ring.setStrokeStyle(4, c, 0.75);
    ring.setDepth(DEPTH.BOSS_TELEGRAPH + 1);
    this.tweens.add({ targets: ring, radius: 90, alpha: 0, duration: 280, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
    const flash = this.add.circle(bossX, bossY - 8, 16, 0xe8ffd8, 0.35);
    flash.setDepth(DEPTH.BOSS_TELEGRAPH + 2);
    this.tweens.add({ targets: flash, scaleX: 2.2, scaleY: 2.2, alpha: 0, duration: 200, onComplete: () => flash.destroy() });
  }

  spawnBehemothStalkBoulderSequence(boss, impactX, impactCy, color, windupMs, dropMs, smashRadius) {
    if (!boss || !boss.active || this.isTrueHitboxView()) return;
    const c = color || 0xb7ff7f;
    const tex = this.textures.exists("behemoth_boulder_slam") ? "behemoth_boulder_slam" : "behemoth_meteor";
    const headOffY = 58;
    const sx = boss.x;
    const sy = boss.y - headOffY;
    const rock = this.add.sprite(sx, sy, tex);
    rock.setDepth(DEPTH.BOSS_TELEGRAPH + 2);
    rock.setScale(tex === "behemoth_boulder_slam" ? 0.98 : 0.72);
    rock.setTint(0xd8e8d8);
    rock.setAlpha(0.98);

    this.tweens.add({
      targets: rock,
      scaleX: { from: tex === "behemoth_boulder_slam" ? 0.92 : 0.68, to: tex === "behemoth_boulder_slam" ? 1.18 : 0.9 },
      scaleY: { from: tex === "behemoth_boulder_slam" ? 0.95 : 0.7, to: tex === "behemoth_boulder_slam" ? 1.22 : 0.93 },
      duration: windupMs,
      ease: "Sine.easeInOut"
    });

    this.tweens.add({
      targets: rock,
      y: { from: sy - 3, to: sy + 3 },
      duration: 130,
      yoyo: true,
      repeat: Math.max(2, Math.floor(windupMs / 130) - 1)
    });

    this.time.delayedCall(windupMs, () => {
      if (!rock.active || this.gameState !== "battle") {
        if (rock.active) rock.destroy();
        return;
      }
      const endX = impactX;
      const endY = impactCy - smashRadius * 0.32;
      this.tweens.add({
        targets: rock,
        x: endX,
        y: endY,
        scaleX: tex === "behemoth_boulder_slam" ? 1.28 : 1.05,
        scaleY: tex === "behemoth_boulder_slam" ? 1.32 : 1.08,
        angle: 0.12,
        duration: dropMs,
        ease: "Cubic.easeIn",
        onComplete: () => {
          if (rock.active) rock.destroy();
        }
      });
    });
  }

  spawnBehemothStalkSlamBurst(x, y, radius, color) {
    const c = color || 0xb7ff7f;
    const r = Math.max(36, radius || 80);
    for (let i = 0; i < 5; i++) {
      const ring = this.add.circle(x, y, r * (0.12 + i * 0.08), 0x000000, 0);
      ring.setStrokeStyle(4 - i, i === 0 ? 0xffffff : c, 0.85 - i * 0.12);
      ring.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: ring,
        radius: r * (1.05 + i * 0.04),
        alpha: 0,
        duration: 240 + i * 30,
        ease: "Cubic.easeOut",
        onComplete: () => ring.destroy()
      });
    }
    for (let j = 0; j < 12; j++) {
      const ang = (j / 12) * Math.PI * 2;
      const sp = this.add.rectangle(x + Math.cos(ang) * 8, y + Math.sin(ang) * 5, Phaser.Math.Between(4, 9), Phaser.Math.Between(4, 9), j % 2 === 0 ? c : 0x5a6858, 0.85);
      sp.setRotation(ang);
      sp.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({
        targets: sp,
        x: x + Math.cos(ang) * r * 0.55,
        y: y - Phaser.Math.Between(8, 28) + Math.sin(ang) * r * 0.2,
        alpha: 0,
        angle: sp.rotation + Phaser.Math.Between(-0.8, 0.8),
        duration: 300,
        ease: "Quad.easeOut",
        onComplete: () => sp.destroy()
      });
    }
    this.spawnImpactEffect(x, y, c, Math.min(48, r * 0.45));
  }

  spawnBehemothCrusherLeapMark(x, y, radius, durationMs, color) {
    const r = Math.max(24, radius || 80);
    const ring = this.add.circle(x, y, r, 0x2a3820, 0.35);
    ring.setStrokeStyle(4, color || 0xb7ff7f, 0.55);
    ring.setDepth(DEPTH.BOSS_TELEGRAPH);
    const inner = this.add.circle(x, y, r * 0.55, 0x000000, 0);
    inner.setStrokeStyle(2, 0x86c070, 0.45);
    inner.setDepth(DEPTH.BOSS_TELEGRAPH);
    this.tweens.add({
      targets: [ring, inner],
      alpha: { from: 0.35, to: 0.65 },
      duration: 110,
      yoyo: true,
      repeat: Math.max(2, Math.floor(durationMs / 110))
    });
    this.time.delayedCall(durationMs, () => {
      ring.destroy();
      inner.destroy();
    });
  }

  spawnBehemothCrusherSlamBurst(x, y, radius, color) {
    const safeR = Math.max(40, radius || 100);
    for (let i = 0; i < 6; i += 1) {
      const ring = this.add.circle(x, y, safeR * (0.12 + i * 0.07), 0x000000, 0);
      ring.setStrokeStyle(4, color || 0xb7ff7f, 0.52 - i * 0.06);
      ring.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: ring,
        radius: { from: safeR * 0.1, to: safeR * (1.05 + i * 0.02) },
        alpha: { from: 0.65, to: 0 },
        duration: 200 + i * 25,
        ease: "Cubic.easeOut",
        onComplete: () => ring.destroy()
      });
    }
    const dust = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
    dust.forEach((ang, i) => {
      const p = this.add.circle(x + Math.cos(ang) * 12, y + Math.sin(ang) * 8, 16, 0x5a6848, 0.45);
      p.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(ang) * safeR * 0.55,
        y: y + Math.sin(ang) * safeR * 0.38,
        alpha: 0,
        duration: 240 + i * 20,
        ease: "Quad.easeOut",
        onComplete: () => p.destroy()
      });
    });
    this.spawnImpactEffect(x, y, color || 0xb7ff7f, Math.min(52, safeR * 0.4));
    this.spawnAuraPulse(x, y + 4, color || 0xb7ff7f, safeR * 0.65, 200);
  }

  spawnBehemothStompWindup(x, y, color, durationMs) {
    if (this.isTrueHitboxView()) return;
    const c = color || 0xb7ff7f;
    const g = this.add.graphics();
    g.setDepth(DEPTH.BOSS_TELEGRAPH);
    const anim = { t: 0 };
    this.tweens.add({
      targets: anim, t: 1, duration: durationMs,
      onUpdate: () => {
        g.clear();
        g.fillStyle(c, 0.08 + anim.t * 0.12);
        g.fillEllipse(x, y + 18, 80 * (1 - anim.t * 0.3), 16 * (1 - anim.t * 0.3));
        for (let i = 0; i < 3; i++) {
          const r = 30 + i * 20;
          g.lineStyle(2, c, (0.3 - i * 0.08) * anim.t);
          g.strokeCircle(x, y + 18, r * (1 - anim.t * 0.5));
        }
      },
      onComplete: () => g.destroy()
    });
  }

  spawnBehemothEarthshatterWindup(x, y, color, durationMs) {
    if (this.isTrueHitboxView()) return;
    const c = color || 0xb7ff7f;
    const dur = durationMs || 1600;

    const riseAnim = { yOff: 0 };
    const riseG = this.add.graphics();
    riseG.setDepth(DEPTH.BOSS_TELEGRAPH);
    this.tweens.add({
      targets: riseAnim, yOff: -18, duration: dur * 0.6, ease: "Quad.easeOut",
      onUpdate: () => {
        riseG.clear();
        riseG.fillStyle(c, 0.15);
        riseG.fillEllipse(x, y + 20, 60, 12);
        for (let i = 0; i < 4; i++) {
          const px = x + Phaser.Math.Between(-30, 30);
          riseG.fillStyle(c, 0.08);
          riseG.fillCircle(px, y + 20, 3);
        }
      },
      onComplete: () => riseG.destroy()
    });

    for (let wave = 0; wave < 3; wave++) {
      this.time.delayedCall(dur * 0.2 + wave * dur * 0.2, () => {
        if (this.gameState !== "battle") return;
        const ring = this.add.circle(x, y + 16, 180, c, 0);
        ring.setStrokeStyle(3, c, 0.4);
        ring.setDepth(DEPTH.BOSS_TELEGRAPH);
        this.tweens.add({ targets: ring, radius: 20, alpha: 0, duration: dur * 0.25, ease: "Quad.easeIn", onComplete: () => ring.destroy() });
      });
    }

    const crackEvt = this.time.addEvent({ delay: 120, loop: true, callback: () => {
      if (this.gameState !== "battle") { crackEvt.remove(); return; }
      const elapsed = this.time.now;
      if (elapsed - (crackEvt._startTime || elapsed) > dur * 0.8) { crackEvt.remove(); return; }
      const cx = x + Phaser.Math.Between(-80, 80);
      const cy = y + 16 + Phaser.Math.Between(-10, 10);
      const crack = this.add.graphics();
      crack.setDepth(DEPTH.BOSS_TELEGRAPH);
      crack.lineStyle(2, c, 0.5);
      const len = Phaser.Math.Between(8, 22);
      const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
      crack.lineBetween(cx, cy, cx + Math.cos(ang) * len, cy + Math.sin(ang) * len * 0.4);
      this.tweens.add({ targets: crack, alpha: 0, duration: 300, onComplete: () => crack.destroy() });
    }});
    crackEvt._startTime = this.time.now;

    this.time.delayedCall(dur * 0.7, () => {
      if (this.gameState !== "battle") return;
      const warn = this.add.circle(x, y + 16, 40, c, 0.2);
      warn.setBlendMode(Phaser.BlendModes.ADD);
      warn.setDepth(DEPTH.BOSS_TELEGRAPH + 1);
      this.tweens.add({ targets: warn, radius: 220, alpha: 0.5, duration: dur * 0.3, ease: "Quad.easeIn", onComplete: () => warn.destroy() });
    });
  }

  spawnBehemothEarthshatterImpact(x, y, radius, color, crackCount, debrisCount) {
    if (this.isTrueHitboxView()) return;
    const c = color || 0xb7ff7f;
    const r = radius || 220;

    const flash = this.add.circle(x, y, r * 0.4, 0xffffff, 0.8);
    flash.setBlendMode(Phaser.BlendModes.ADD);
    flash.setDepth(DEPTH.PLAYER_FX + 2);
    this.tweens.add({ targets: flash, scaleX: 3, scaleY: 3, alpha: 0, duration: 160, onComplete: () => flash.destroy() });

    for (let i = 0; i < 5; i++) {
      this.time.delayedCall(i * 35, () => {
        if (this.gameState !== "battle") return;
        const ring = this.add.circle(x, y, 15 + i * 8, c, 0);
        ring.setStrokeStyle(5 - i, i === 0 ? 0xffffff : c, 0.95 - i * 0.12);
        ring.setDepth(DEPTH.PLAYER_FX);
        this.tweens.add({ targets: ring, radius: r * (1.05 + i * 0.03), alpha: 0, duration: 380, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
      });
    }

    const crackG = this.add.graphics();
    crackG.setDepth(DEPTH.PLAYER_FX);
    const cracks = crackCount || 8;
    for (let i = 0; i < cracks; i++) {
      const ang = (i / cracks) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2);
      const len = r * Phaser.Math.FloatBetween(0.5, 0.9);
      crackG.lineStyle(3, c, 0.7);
      crackG.lineBetween(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len * 0.35);
      crackG.lineStyle(1, 0xffffff, 0.35);
      crackG.lineBetween(x + 1, y + 1, x + Math.cos(ang) * len + 1, y + Math.sin(ang) * len * 0.35 + 1);
      if (len > r * 0.6) {
        const branchAng = ang + Phaser.Math.FloatBetween(-0.5, 0.5);
        const bLen = len * 0.35;
        const mx = x + Math.cos(ang) * len * 0.7;
        const my = y + Math.sin(ang) * len * 0.7 * 0.35;
        crackG.lineStyle(2, c, 0.4);
        crackG.lineBetween(mx, my, mx + Math.cos(branchAng) * bLen, my + Math.sin(branchAng) * bLen * 0.3);
      }
    }
    this.tweens.add({ targets: crackG, alpha: 0, duration: 600, delay: 100, onComplete: () => crackG.destroy() });

    const numDebris = debrisCount || 12;
    for (let i = 0; i < numDebris; i++) {
      const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const startDist = Phaser.Math.Between(10, 40);
      const dx = x + Math.cos(ang) * startDist;
      const dy = y + Math.sin(ang) * startDist * 0.4;
      const deb = this.add.rectangle(dx, dy, Phaser.Math.Between(4, 10), Phaser.Math.Between(4, 10), i % 3 === 0 ? 0x5a6848 : c, 0.8);
      deb.setRotation(Phaser.Math.FloatBetween(0, Math.PI));
      deb.setDepth(DEPTH.PLAYER_FX + 1);
      const endDist = Phaser.Math.Between(40, r * 0.6);
      this.tweens.add({
        targets: deb,
        x: x + Math.cos(ang) * endDist, y: dy - Phaser.Math.Between(20, 55),
        alpha: 0, angle: deb.angle + Phaser.Math.Between(-120, 120),
        duration: 350 + Phaser.Math.Between(0, 100), ease: "Quad.easeOut",
        onComplete: () => deb.destroy()
      });
    }

    const dustG = this.add.graphics();
    dustG.setDepth(DEPTH.PLAYER_FX - 1);
    dustG.fillStyle(0x5a6848, 0.2);
    dustG.fillEllipse(x, y + 6, r * 1.5, 30);
    this.tweens.add({ targets: dustG, alpha: 0, scaleX: 1.3, duration: 500, onComplete: () => dustG.destroy() });

    this.spawnImpactEffect(x, y, c, 50);
  }

  spawnBehemothBoulderWindup(x, y, color, durationMs) {
    if (this.isTrueHitboxView()) return;
    const c = color || 0xb7ff7f;
    const dur = durationMs || 1300;

    for (let i = 0; i < 6; i++) {
      this.time.delayedCall(i * dur * 0.12, () => {
        if (this.gameState !== "battle") return;
        const px = x + Phaser.Math.Between(-30, 30);
        const py = y + 18;
        const chunk = this.add.rectangle(px, py, Phaser.Math.Between(6, 12), Phaser.Math.Between(6, 12), 0x5a6848, 0.7);
        chunk.setRotation(Phaser.Math.FloatBetween(0, Math.PI));
        chunk.setDepth(DEPTH.BOSS_TELEGRAPH);
        this.tweens.add({
          targets: chunk, y: y - Phaser.Math.Between(20, 50), x: px + Phaser.Math.Between(-10, 10),
          alpha: 0, angle: chunk.angle + Phaser.Math.Between(-60, 60),
          duration: dur * 0.4, ease: "Quad.easeOut", onComplete: () => chunk.destroy()
        });
      });
    }

    const glow = this.add.circle(x, y - 10, 12, c, 0.15);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    glow.setDepth(DEPTH.BOSS_TELEGRAPH);
    this.tweens.add({ targets: glow, scaleX: 2, scaleY: 2, alpha: 0.4, duration: dur * 0.7, yoyo: true, onComplete: () => glow.destroy() });
  }

  spawnBehemothBoulderFalling(aimX, footY, startDelayMs, dropDurationMs, color) {
    if (this.isTrueHitboxView()) return;
    const c = color || 0xb7ff7f;
    const dropMs = dropDurationMs || 400;

    this.time.delayedCall(startDelayMs, () => {
      if (this.gameState !== "battle") return;
      const startY = footY - 260;
      const boulder = this.add.graphics();
      boulder.setDepth(DEPTH.PLAYER_FX + 1);
      boulder.fillStyle(0x5a6848, 0.9);
      boulder.fillCircle(0, 0, 14);
      boulder.fillStyle(0x4a5838, 0.7);
      boulder.fillCircle(-3, -4, 8);
      boulder.fillStyle(c, 0.4);
      boulder.fillCircle(2, 2, 6);
      boulder.lineStyle(2, 0x3a4828, 0.8);
      boulder.strokeCircle(0, 0, 14);
      boulder.setPosition(aimX, startY);

      const shadow = this.add.ellipse(aimX, footY + 4, 10, 4, 0x000000, 0.15);
      shadow.setDepth(DEPTH.BOSS_TELEGRAPH);

      this.tweens.add({
        targets: boulder, y: footY, duration: dropMs, ease: "Quad.easeIn",
        onUpdate: () => {
          const prog = (boulder.y - startY) / (footY - startY);
          shadow.setScale(0.5 + prog * 2, 0.5 + prog * 1.5);
          shadow.alpha = 0.1 + prog * 0.25;
        },
        onComplete: () => { boulder.destroy(); shadow.destroy(); }
      });
    });
  }

  spawnBehemothBoulderImpact(x, y, radius, color) {
    if (this.isTrueHitboxView()) return;
    const c = color || 0xb7ff7f;
    const r = radius || 55;

    const flash = this.add.circle(x, y, 12, 0xffffff, 0.6);
    flash.setBlendMode(Phaser.BlendModes.ADD);
    flash.setDepth(DEPTH.PLAYER_FX + 2);
    this.tweens.add({ targets: flash, scaleX: 2, scaleY: 2, alpha: 0, duration: 100, onComplete: () => flash.destroy() });

    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(i * 30, () => {
        if (this.gameState !== "battle") return;
        const ring = this.add.circle(x, y, 10 + i * 5, c, 0);
        ring.setStrokeStyle(3 - i, c, 0.8 - i * 0.15);
        ring.setDepth(DEPTH.PLAYER_FX);
        this.tweens.add({ targets: ring, radius: r * (0.9 + i * 0.05), alpha: 0, duration: 260, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
      });
    }

    for (let i = 0; i < 8; i++) {
      const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const chunk = this.add.rectangle(x, y, Phaser.Math.Between(3, 8), Phaser.Math.Between(3, 8), i % 2 === 0 ? 0x5a6848 : c, 0.7);
      chunk.setRotation(Phaser.Math.FloatBetween(0, Math.PI));
      chunk.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({
        targets: chunk,
        x: x + Math.cos(ang) * Phaser.Math.Between(15, r * 0.5),
        y: y - Phaser.Math.Between(10, 35) + Math.sin(ang) * Phaser.Math.Between(5, 15),
        alpha: 0, angle: chunk.angle + Phaser.Math.Between(-90, 90),
        duration: 280, ease: "Quad.easeOut", onComplete: () => chunk.destroy()
      });
    }

    const dustG = this.add.graphics();
    dustG.setDepth(DEPTH.PLAYER_FX - 1);
    dustG.fillStyle(0x5a6848, 0.18);
    dustG.fillEllipse(x, y + 4, r * 1.3, 18);
    this.tweens.add({ targets: dustG, alpha: 0, scaleX: 1.2, duration: 350, onComplete: () => dustG.destroy() });

    this.spawnImpactEffect(x, y, c, 28);
  }

  /**
   * Gale Sovereign: concentric rings shrink toward the boss during windup.
   */
  spawnGaleCollapsingRingWindup(x, y, color, durationMs = 300) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const col = color || 0x3dd4c8;
    const rings = 4;
    const maxR = 220;
    for (let i = 0; i < rings; i += 1) {
      const delay = (durationMs / rings) * 0.22 * i;
      const startR = maxR * (0.55 + i * 0.12);
      this.time.delayedCall(delay, () => {
        if (this.gameState !== "battle") return;
        const ring = this.add.circle(x, y, startR, 0x000000, 0);
        ring.setStrokeStyle(3, col, 0.88 - i * 0.1);
        ring.setDepth(DEPTH.BOSS_TELEGRAPH);
        const inner = this.add.circle(x, y, startR * 0.88, 0x000000, 0);
        inner.setStrokeStyle(2, 0xa8fff0, 0.62);
        inner.setDepth(DEPTH.BOSS_TELEGRAPH);
        this.tweens.add({
          targets: [ring, inner],
          radius: 12 + i * 2,
          alpha: { from: 0.95, to: 0 },
          duration: Math.max(120, durationMs * 0.72 - delay),
          ease: "Cubic.easeIn",
          onComplete: () => {
            ring.destroy();
            inner.destroy();
          }
        });
      });
    }
  }

  spawnGaleShearStrikeBurstVfx(x, y, direction, radius, spreadDeg, color) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const col = color || 0x3dd4c8;
    const baseAngle = direction > 0 ? 0 : Math.PI;
    const half = Phaser.Math.DegToRad(Math.max(40, spreadDeg) * 0.45);
    const n = 9;
    for (let i = 0; i < n; i += 1) {
      const t = i / (n - 1);
      const ang = baseAngle - half + t * half * 2;
      const dist = radius * (0.35 + (i % 3) * 0.12);
      const px = x + Math.cos(ang) * dist;
      const py = y + Math.sin(ang) * dist;
      this.time.delayedCall(i * 18, () => {
        if (this.gameState !== "battle") return;
        this.spawnImpactEffect(px, py, col, 22 + (i % 2) * 4);
        const wisp = this.add.circle(px, py, 8 + (i % 2) * 4, 0xa8fff0, 0.35);
        wisp.setDepth(DEPTH.PLAYER_FX);
        this.tweens.add({
          targets: wisp,
          scale: 2.4,
          alpha: 0,
          duration: 140,
          ease: "Quad.easeOut",
          onComplete: () => wisp.destroy()
        });
      });
    }
    this.spawnAuraPulse(x, y, col, Math.max(40, radius * 0.22), 160);
  }

  /**
   * Squall Stride: ripples only from the direction of the upcoming dash, converging on the boss.
   */
  spawnSquallDirectionalConvergeRipples(x, y, direction, color, durationMs = 640, reachPx = 420) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const col = color || 0x3dd4c8;
    const d = direction < 0 ? -1 : 1;
    const reach = Math.max(180, reachPx);
    const layers = 5;
    for (let i = 0; i < layers; i += 1) {
      const t = i / (layers - 1);
      const startX = x + d * (reach * (0.35 + t * 0.65));
      const delay = (durationMs / layers) * i * 0.85;
      this.time.delayedCall(delay, () => {
        if (this.gameState !== "battle") return;
        const arc = this.add.graphics();
        arc.setDepth(DEPTH.BOSS_TELEGRAPH);
        const ew = reach * (0.55 - t * 0.08);
        const eh = 36 - t * 3;
        arc.lineStyle(3, col, 0.78 - t * 0.06);
        arc.strokeEllipse(startX, y + 6, ew, eh);
        this.tweens.add({
          targets: arc,
          x: x + d * 28,
          scaleX: { from: 1, to: 0.35 },
          scaleY: { from: 1, to: 0.55 },
          alpha: { from: 0.88, to: 0 },
          duration: Math.max(140, durationMs * 0.55 - delay * 0.4),
          ease: "Cubic.easeIn",
          onComplete: () => arc.destroy()
        });
      });
    }
    const gust = this.add.rectangle(x + d * reach * 0.4, y + 4, reach * 0.9, 22, col, 0.14);
    gust.setDepth(DEPTH.BOSS_TELEGRAPH);
    gust.setStrokeStyle(2, col, 0.35);
    this.tweens.add({
      targets: gust,
      x: x + d * 22,
      alpha: { from: 0.55, to: 0 },
      duration: durationMs,
      ease: "Sine.easeIn",
      onComplete: () => gust.destroy()
    });
  }

  spawnSkybreakFanWindup(x, y, direction, color, durationMs = 260, fanHalfDeg = 28) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const col = color || 0x3dd4c8;
    const base = direction > 0 ? 0 : Math.PI;
    const half = Phaser.Math.DegToRad(fanHalfDeg);
    const g = this.add.graphics();
    g.setDepth(DEPTH.BOSS_TELEGRAPH);
    for (let i = 0; i < 6; i += 1) {
      const t = (i - 2.5) / 2.5;
      const ang = base + t * half;
      const len = 100 + i * 8;
      const gx = x + Math.cos(ang) * len;
      const gy = y + Math.sin(ang) * len;
      g.lineStyle(3, col, 0.82);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(gx, gy);
      g.strokePath();
    }
    g.setAlpha(0.62);
    this.tweens.add({
      targets: g,
      alpha: { from: 0.48, to: 1 },
      duration: Math.min(200, durationMs / 2),
      yoyo: true,
      repeat: Math.max(1, Math.floor(durationMs / 200)),
      onComplete: () => g.destroy()
    });
  }

  spawnGaleWindSphereWindup(boss, windupMs = 520, color) {
    if (!boss?.active) return;
    const x = boss.x;
    const yCore = boss.y - 22;
    const footY = boss.body ? boss.body.bottom - 2 : boss.y + 26;
    const col = color || 0x3dd4c8;
    const w = windupMs;
    const pale = 0xa8fff0;
    const ice = 0xe8fffc;
    const white = 0xffffff;
    const z = DEPTH.BOSS_TELEGRAPH;

    const buildSpiralGfx = (cw, tight) => {
      const g = this.add.graphics();
      g.setDepth(z);
      const segs = 58;
      const turns = tight ? 3.35 : 2.85;
      const maxR = tight ? 82 : 68;
      g.lineStyle(tight ? 2.4 : 1.8, tight ? pale : col, tight ? 0.9 : 0.5);
      g.beginPath();
      for (let i = 0; i <= segs; i += 1) {
        const t = i / segs;
        const ang = (cw ? 1 : -1) * t * Math.PI * 2 * turns + (cw ? 0 : 0.55);
        const r = 8 + t * maxR;
        const px = Math.cos(ang) * r;
        const py = Math.sin(ang) * r * 0.5 - t * 44;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.strokePath();
      g.setPosition(x, yCore);
      return g;
    };

    const groundBand = this.add.ellipse(x, footY, 210, 30, col, 0.1);
    groundBand.setStrokeStyle(3, col, 0.52);
    groundBand.setDepth(z);
    this.tweens.add({
      targets: groundBand,
      scaleX: { from: 0.28, to: 1.22 },
      scaleY: { from: 0.42, to: 1.12 },
      alpha: { from: 0.2, to: 0.82 },
      duration: w * 0.52,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: groundBand,
          scaleX: { to: 0.18 },
          scaleY: { to: 0.32 },
          alpha: { to: 0 },
          duration: w * 0.48,
          ease: "Cubic.easeIn",
          onComplete: () => groundBand.destroy()
        });
      }
    });

    const spiralOuter = buildSpiralGfx(true, true);
    const spiralInner = buildSpiralGfx(false, false);
    spiralOuter.setAlpha(0.12);
    spiralInner.setAlpha(0.1);
    this.tweens.add({
      targets: spiralOuter,
      alpha: { from: 0.12, to: 0.92 },
      scaleX: { from: 0.58, to: 1.06 },
      scaleY: { from: 0.58, to: 1.06 },
      rotation: Math.PI * 2 * 1.05,
      duration: w,
      ease: "Sine.easeIn",
      onComplete: () => spiralOuter.destroy()
    });
    this.tweens.add({
      targets: spiralInner,
      alpha: { from: 0.1, to: 0.72 },
      scaleX: { from: 0.52, to: 1.02 },
      scaleY: { from: 0.52, to: 1.02 },
      rotation: -Math.PI * 2 * 0.92,
      duration: w,
      ease: "Sine.easeIn",
      onComplete: () => spiralInner.destroy()
    });

    const draft = this.add.graphics();
    draft.setDepth(z);
    draft.lineStyle(2, ice, 0.35);
    for (let i = 0; i < 5; i += 1) {
      const ox = (i - 2) * 22;
      draft.beginPath();
      draft.moveTo(ox - 6, 38);
      draft.lineTo(ox, -52);
      draft.lineTo(ox + 5, 36);
      draft.strokePath();
    }
    draft.setPosition(x, yCore + 8);
    draft.setAlpha(0);
    this.tweens.add({
      targets: draft,
      alpha: { from: 0, to: 0.55 },
      y: yCore - 18,
      duration: w * 0.85,
      ease: "Quad.easeOut",
      onComplete: () => draft.destroy()
    });

    const nMotes = 17;
    for (let k = 0; k < nMotes; k += 1) {
      const ang = (k / nMotes) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.12, 0.12);
      const dist = Phaser.Math.FloatBetween(28, 72);
      const mx = x + Math.cos(ang) * dist;
      const my = footY + Phaser.Math.FloatBetween(-10, 8);
      const mote = this.add.circle(mx, my, Phaser.Math.FloatBetween(1.5, 3.2), ice, 0.55);
      mote.setBlendMode(Phaser.BlendModes.ADD);
      mote.setDepth(z);
      const lift = Phaser.Math.FloatBetween(62, 110);
      this.tweens.add({
        targets: mote,
        x: mx + Math.cos(ang + 1.05) * 24,
        y: yCore - lift,
        alpha: { from: 0, to: 0.88 },
        scale: { from: 0.35, to: 1.15 },
        duration: w * 0.42,
        delay: (k / nMotes) * w * 0.5,
        ease: "Quad.easeOut",
        onComplete: () => {
          this.tweens.add({
            targets: mote,
            alpha: { to: 0 },
            scale: { to: 0.15 },
            duration: w * 0.32,
            onComplete: () => mote.destroy()
          });
        }
      });
    }

    const crown = this.add.circle(x, yCore - 8, 22, col, 0.08);
    crown.setStrokeStyle(2, white, 0.75);
    crown.setDepth(z);
    crown.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: crown,
      scale: { from: 0.4, to: 1.35 },
      alpha: { from: 0.15, to: 0.65 },
      duration: w * 0.45,
      ease: "Sine.easeOut",
      yoyo: true,
      hold: w * 0.12,
      onComplete: () => {
        this.tweens.add({
          targets: crown,
          scale: { to: 0.2 },
          alpha: { to: 0 },
          duration: w * 0.35,
          onComplete: () => crown.destroy()
        });
      }
    });
  }

  attachGaleWindSphereVfx(boss, durationMs, radius, color) {
    if (!boss?.active) return;
    this.detachGaleWindSphereVfx(boss);
    const col = color || 0x3dd4c8;
    const r = Math.max(48, radius || 74);
    const outer = this.add.circle(boss.x, boss.y - 20, r, col, 0.07);
    outer.setStrokeStyle(6, col, 0.9);
    outer.setBlendMode(Phaser.BlendModes.ADD);
    outer.setDepth(DEPTH.PLAYER_FX + 2);
    const inner = this.add.circle(boss.x, boss.y - 20, r * 0.68, 0xffffff, 0.05);
    inner.setStrokeStyle(3, 0xe8fff8, 0.65);
    inner.setBlendMode(Phaser.BlendModes.ADD);
    inner.setDepth(DEPTH.PLAYER_FX + 1);
    boss.galeWindSphereVfxRing = outer;
    boss.galeWindSphereVfxCore = inner;
    boss.galeWindSphereVfxTw = this.tweens.add({
      targets: outer,
      scaleX: { from: 0.94, to: 1.06 },
      scaleY: { from: 0.94, to: 1.06 },
      duration: 440,
      yoyo: true,
      repeat: Math.max(2, Math.floor((durationMs || 3800) / 440))
    });
  }

  detachGaleWindSphereVfx(boss) {
    if (!boss) return;
    if (boss.galeWindSphereVfxTw && this.tweens?.killTweensOf) {
      this.tweens.killTweensOf(boss.galeWindSphereVfxRing);
      boss.galeWindSphereVfxTw = null;
    }
    if (boss.galeWindSphereVfxRing?.destroy) boss.galeWindSphereVfxRing.destroy();
    if (boss.galeWindSphereVfxCore?.destroy) boss.galeWindSphereVfxCore.destroy();
    boss.galeWindSphereVfxRing = null;
    boss.galeWindSphereVfxCore = null;
  }

  updateGaleWindSphereVfxPositions() {
    const b = this.boss;
    if (!b?.active || !b.galeWindSphereVfxRing?.active) return;
    const ox = b.x;
    const oy = b.y - 20;
    b.galeWindSphereVfxRing.setPosition(ox, oy);
    if (b.galeWindSphereVfxCore?.active) b.galeWindSphereVfxCore.setPosition(ox, oy);
  }

  tryBatGaleWindSalvoProjectiles(player, rect) {
    if (!player?.isAlive || !rect || !this.bossProjectiles) return;
    const children = this.bossProjectiles.getChildren();
    for (let i = 0; i < children.length; i += 1) {
      const proj = children[i];
      if (!proj?.active || !proj.galeWindSalvoReturnable || proj.galeWindSalvoReturning) continue;
      const pr = this.getBodyHitbox(proj);
      if (!Phaser.Geom.Intersects.RectangleToRectangle(rect, pr)) continue;
      proj.galeWindSalvoReturning = true;
      const bx = this.boss.x - proj.x;
      const by = this.boss.y - 16 - proj.y;
      const len = Math.hypot(bx, by) || 1;
      const cur = Math.hypot(proj.body.velocity.x, proj.body.velocity.y);
      const spd = Math.max(210, cur + 40);
      proj.setVelocityX((bx / len) * spd);
      proj.setVelocityY((by / len) * spd);
      proj.galeBaseSpeed = spd;
      this.spawnImpactEffect(proj.x, proj.y, proj.effectColor || 0x3dd4c8, 12);
    }
  }

  tryBatGaleWindSalvoProjectilesFan(player, originX, originY, direction, radius, spreadDeg) {
    if (!player?.isAlive || !this.bossProjectiles) return;
    const children = this.bossProjectiles.getChildren();
    for (let i = 0; i < children.length; i += 1) {
      const proj = children[i];
      if (!proj?.active || !proj.galeWindSalvoReturnable || proj.galeWindSalvoReturning) continue;
      if (!this.fanHitsTarget(originX, originY, direction, radius, spreadDeg, proj)) continue;
      proj.galeWindSalvoReturning = true;
      const bx = this.boss.x - proj.x;
      const by = this.boss.y - 16 - proj.y;
      const len = Math.hypot(bx, by) || 1;
      const cur = Math.hypot(proj.body.velocity.x, proj.body.velocity.y);
      const spd = Math.max(210, cur + 40);
      proj.setVelocityX((bx / len) * spd);
      proj.setVelocityY((by / len) * spd);
      proj.galeBaseSpeed = spd;
      this.spawnImpactEffect(proj.x, proj.y, proj.effectColor || 0x3dd4c8, 12);
    }
  }

  spawnGaleRippleGroundWindup(cx, groundY, halfWidth, color, durationMs = 560) {
    if (!Number.isFinite(cx) || !Number.isFinite(groundY)) return;
    const col = color || 0x3dd4c8;
    const w = Math.max(120, halfWidth);
    const lift = 12;
    for (let i = 0; i < 3; i += 1) {
      const el = this.add.ellipse(cx, groundY - lift, w * (1.1 + i * 0.12), 36 + i * 8, col, 0.1);
      el.setStrokeStyle(3, col, 0.52 + i * 0.08);
      el.setDepth(DEPTH.BOSS_TELEGRAPH);
      this.tweens.add({
        targets: el,
        scaleX: { from: 0.82, to: 1.05 },
        scaleY: { from: 0.9, to: 1.08 },
        alpha: { from: 0.48, to: 0.78 },
        duration: Math.max(200, durationMs / 3),
        yoyo: true,
        repeat: Math.max(1, Math.floor(durationMs / 240)),
        onComplete: () => el.destroy()
      });
    }
    const arcG = this.add.graphics();
    arcG.setDepth(DEPTH.BOSS_TELEGRAPH);
    arcG.lineStyle(3, 0xa8fff0, 0.55);
    arcG.beginPath();
    arcG.arc(cx, groundY - 32, w * 0.55, Math.PI * 0.12, Math.PI * 0.88);
    arcG.strokePath();
    this.tweens.add({
      targets: arcG,
      alpha: { from: 0.42, to: 0.82 },
      duration: 220,
      yoyo: true,
      repeat: Math.max(2, Math.floor(durationMs / 220)),
      onComplete: () => arcG.destroy()
    });
  }

  spawnGaleRippleFastSlamBurst(x, y, fullWidth, color) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const col = color || 0x3dd4c8;
    const hw = Math.max(200, fullWidth * 0.5);
    const rings = 7;
    const baseY = y - 6;
    for (let i = 0; i < rings; i += 1) {
      const ring = this.add.ellipse(x, baseY, 44 + i * (hw / rings) * 1.4, 26 + i * 7, 0x000000, 0);
      ring.setStrokeStyle(3, col, 0.72 - i * 0.07);
      ring.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: ring,
        scaleX: { from: 0.18, to: 1.08 + i * 0.04 },
        scaleY: { from: 0.32, to: 1.05 },
        alpha: { from: 0.92, to: 0 },
        duration: 88 + i * 11,
        ease: "Cubic.easeOut",
        onComplete: () => ring.destroy()
      });
    }
    this.spawnImpactEffect(x, baseY - 4, col, Math.min(64, hw * 0.14));
    const dust = [-0.85, -0.35, 0, 0.35, 0.85];
    dust.forEach((spread, j) => {
      const p = this.add.circle(x + spread * 24, baseY + 2, 12, 0xa8fff0, 0.55);
      p.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: p,
        x: x + spread * hw * 0.55,
        alpha: 0,
        duration: 180 + j * 15,
        ease: "Quad.easeOut",
        onComplete: () => p.destroy()
      });
    });
  }

  spawnTyphoonSlamFullRipple(x, cy, worldWidth, color) {
    const col = color || 0xc8fff5;
    const w = Math.max(800, worldWidth || 1200);
    const n = 9;
    for (let i = 0; i < n; i += 1) {
      const ring = this.add.ellipse(x, cy, 80 + i * (w / n) * 1.1, 20 + i * 6, 0x000000, 0);
      ring.setStrokeStyle(3, col, 0.75 - i * 0.06);
      ring.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: ring,
        scaleX: { from: 0.15, to: 1.05 },
        alpha: { from: 0.9, to: 0 },
        duration: 100 + i * 14,
        ease: "Cubic.easeOut",
        onComplete: () => ring.destroy()
      });
    }
    this.spawnImpactEffect(x, cy - 6, col, 62);
  }

  spawnTyphoonSlamChargeGlow(boss, windupMs, glowMs, color) {
    if (!boss || !boss.active) return;
    const col = color || 0x3dd4c8;
    const hi = 0xffffff;
    const tw = this.tweens.add({
      targets: boss,
      duration: Math.min(glowMs || 480, windupMs),
      repeat: Math.max(3, Math.floor((windupMs || 560) / 110)),
      yoyo: true,
      onUpdate: () => {
        const u = 0.5 + 0.5 * Math.sin(this.time.now * 0.014);
        const g = Phaser.Display.Color.Interpolate.ColorWithColor(
          Phaser.Display.Color.ValueToColor(col),
          Phaser.Display.Color.ValueToColor(hi),
          100,
          Math.round(u * 100)
        );
        boss.setTint(Phaser.Display.Color.GetColor32(g.r, g.g, g.b, 255));
      },
      onComplete: () => boss.clearTint()
    });
    const orbitEv = this.time.addEvent({
      delay: 42,
      loop: true,
      callback: () => {
        if (!boss?.active || this.gameState !== "battle") {
          orbitEv.destroy();
          return;
        }
        const t = this.time.now * 0.0033;
        for (let k = 0; k < 3; k += 1) {
          const ang = t + (k * Math.PI * 2) / 3;
          const r = 38 + Math.sin(this.time.now * 0.008 + k) * 6;
          const px = boss.x + Math.cos(ang) * r;
          const py = boss.y - 18 + Math.sin(ang) * r * 0.55;
          const dot = this.add.circle(px, py, 4 + (k % 2), 0xe8fffc, 0.72);
          dot.setDepth(DEPTH.PLAYER_FX);
          this.tweens.add({
            targets: dot,
            scale: 2.1,
            alpha: 0,
            duration: 220 + k * 25,
            ease: "Quad.easeOut",
            onComplete: () => dot.destroy()
          });
        }
      }
    });
    this.time.delayedCall(windupMs, () => {
      orbitEv.destroy();
      tw.stop();
      boss.clearTint();
    });
  }

  spawnTyphoonSlamJumpBurst(boss, color) {
    if (!boss || !boss.active) return;
    const col = color || 0x3dd4c8;
    const cx = boss.x;
    const cy = boss.y - 10;
    for (let i = 0; i < 18; i += 1) {
      const ang = (i / 18) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2);
      const sp = Phaser.Math.Between(90, 200);
      const p = this.add.circle(cx, cy, Phaser.Math.Between(3, 7), 0xf0ffff, 0.85);
      p.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: p,
        x: cx + Math.cos(ang) * sp,
        y: cy - 40 + Math.sin(ang) * sp * 0.45,
        alpha: 0,
        scale: 0.2,
        duration: 280 + i * 8,
        ease: "Cubic.easeOut",
        onComplete: () => p.destroy()
      });
    }
    for (let j = 0; j < 12; j += 1) {
      const p = this.add.ellipse(cx + Phaser.Math.Between(-16, 16), cy + 8, 10, 6, col, 0.65);
      p.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: p,
        y: cy - Phaser.Math.Between(80, 160),
        x: cx + Phaser.Math.Between(-40, 40),
        alpha: 0,
        scaleX: 0.35,
        scaleY: 1.8,
        duration: 340 + j * 22,
        ease: "Sine.easeOut",
        onComplete: () => p.destroy()
      });
    }
    this.spawnImpactEffect(cx, cy - 6, 0xffffff, 28);
  }

  spawnAetherColumnWindup(boss, durationMs, particleCount, color) {
    if (!boss || !boss.active) return;
    const col = color || 0x3dd4c8;
    const n = Math.max(6, particleCount || 12);
    for (let i = 0; i < n; i += 1) {
      const startX = boss.x + Phaser.Math.Between(-220, 220);
      const p = this.add.circle(startX, -20, 5 + (i % 3), 0xe8fffc, 0.75);
      p.setDepth(DEPTH.BOSS_TELEGRAPH);
      this.tweens.add({
        targets: p,
        x: boss.x + Phaser.Math.Between(-28, 28),
        y: boss.y + Phaser.Math.Between(-18, 8),
        alpha: { from: 0.85, to: 0.2 },
        scale: 1.8,
        duration: Math.max(280, durationMs * 0.72),
        delay: (durationMs / n) * i * 0.55,
        ease: "Cubic.easeIn",
        onComplete: () => p.destroy()
      });
    }
  }

  spawnAetherColumnStrikeBurst(x, y, radius, color) {
    const col = color || 0xa8fff0;
    const r = Math.max(40, radius || 160);
    for (let i = 0; i < 5; i += 1) {
      const baseR = r * (0.25 + i * 0.18);
      const c = this.add.circle(x, y, baseR, 0x000000, 0);
      c.setStrokeStyle(3, col, 0.7 - i * 0.1);
      c.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: c,
        scale: { from: 1, to: 2.2 + i * 0.12 },
        alpha: 0,
        duration: 180 + i * 30,
        ease: "Quad.easeOut",
        onComplete: () => c.destroy()
      });
    }
    this.spawnImpactEffect(x, y - 8, col, 48);
  }

  spawnAetherColumnSkyLaser(cx, cy, beamW, beamH, durationMs, color, options = {}) {
    const col = color || 0x3dd4c8;
    const w = Math.max(40, beamW || 52);
    const h = Math.max(200, beamH || 560);
    const left = cx - w * 0.5;
    const top = cy - h * 0.5;
    const groundY = Number.isFinite(options.groundY) ? options.groundY : 522;
    const beamBottom = top + h;
    const g = this.add.graphics();
    g.setDepth(DEPTH.PLAYER_FX);
    const core = 0xe8fffc;
    const rim = col;
    const drawBeam = (flick) => {
      const f = flick ?? 0.85;
      g.clear();
      g.fillGradientStyle(rim, rim, core, core, 0.32 * f, 0.48 * f, 0.62 * f, 0.52 * f);
      g.fillRect(left, top, w, h);
      g.lineStyle(4, core, 0.58 * f);
      g.strokeRect(left, top, w, h);
      g.lineStyle(2, 0xffffff, 0.42 * f);
      g.beginPath();
      g.moveTo(cx, top);
      g.lineTo(cx, beamBottom);
      g.strokePath();
      g.lineStyle(2, rim, 0.35 * f);
      g.beginPath();
      g.moveTo(left + 2, top);
      g.lineTo(left + 2, beamBottom);
      g.strokePath();
      g.beginPath();
      g.moveTo(left + w - 2, top);
      g.lineTo(left + w - 2, beamBottom);
      g.strokePath();
    };
    drawBeam(0.9);
    const pulse = this.tweens.add({
      targets: g,
      duration: Math.min(140, durationMs / 4),
      repeat: Math.max(4, Math.floor(durationMs / 120)),
      yoyo: true,
      onUpdate: () => {
        const flick = 0.65 + 0.35 * Math.sin(this.time.now * 0.022);
        drawBeam(flick);
      }
    });
    const spawnInner = () => {
      if (this.gameState !== "battle") return;
      const ix = cx + Phaser.Math.Between(-w * 0.35, w * 0.35);
      const iy = Phaser.Math.Between(top + h * 0.15, beamBottom - 20);
      const m = this.add.circle(ix, iy, Phaser.Math.Between(2, 5), 0xffffff, 0.55);
      m.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: m,
        y: iy - Phaser.Math.Between(30, 90),
        alpha: 0,
        scale: 0.3,
        duration: 320,
        ease: "Sine.easeOut",
        onComplete: () => m.destroy()
      });
    };
    const spawnEdge = (side) => {
      if (this.gameState !== "battle") return;
      const ex = side < 0 ? left + 4 : left + w - 4;
      const ey = Phaser.Math.Between(top + 30, beamBottom - 25);
      const s = this.add.circle(ex, ey, Phaser.Math.Between(2, 4), core, 0.65);
      s.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: s,
        x: ex + side * Phaser.Math.Between(8, 28),
        y: ey + Phaser.Math.Between(-12, 12),
        alpha: 0,
        duration: 260,
        ease: "Quad.easeOut",
        onComplete: () => s.destroy()
      });
    };
    const spawnGround = () => {
      if (this.gameState !== "battle") return;
      const gx = cx + Phaser.Math.Between(-w * 0.42, w * 0.42);
      const gy = groundY - 4;
      const d = this.add.ellipse(gx, gy, Phaser.Math.Between(10, 22), Phaser.Math.Between(5, 10), col, 0.55);
      d.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: d,
        y: gy + Phaser.Math.Between(4, 18),
        x: gx + Phaser.Math.Between(-16, 16),
        alpha: 0,
        scaleX: 1.4,
        scaleY: 0.4,
        duration: 380,
        ease: "Quad.easeOut",
        onComplete: () => d.destroy()
      });
    };
    const dust = this.time.addEvent({
      delay: 38,
      loop: true,
      callback: () => {
        spawnInner();
        if (Math.random() < 0.65) spawnEdge(-1);
        if (Math.random() < 0.65) spawnEdge(1);
        if (Math.random() < 0.85) spawnGround();
      }
    });
    this.time.delayedCall(durationMs, () => {
      dust.destroy();
      pulse.stop();
      if (g?.active) {
        this.tweens.add({
          targets: g,
          alpha: 0,
          duration: 120,
          onComplete: () => g.destroy()
        });
      }
    });
    for (let b = 0; b < 14; b += 1) {
      this.time.delayedCall(b * 28, spawnGround);
    }
  }

  spawnBehemothMossFissureTelegraph(bx, by, direction, durationMs, color) {
    const col = color || 0xb7ff7f;
    const d = direction < 0 ? -1 : 1;
    const g = this.add.graphics();
    g.setDepth(DEPTH.BOSS_TELEGRAPH);
    g.lineStyle(4, col, 0.45);
    g.beginPath();
    g.moveTo(bx + d * 40, by + 18);
    g.lineTo(bx + d * 320, by + 22);
    g.strokePath();
    this.tweens.add({
      targets: g,
      alpha: { from: 0.2, to: 0.75 },
      duration: Math.min(200, durationMs / 3),
      yoyo: true,
      repeat: Math.max(2, Math.floor(durationMs / 200)),
      onComplete: () => g.destroy()
    });
  }

  spawnBehemothMossFissureBurst(cx, cy, direction, color) {
    const col = color || 0x8a9e6a;
    const d = direction < 0 ? -1 : 1;
    for (let i = 0; i < 6; i += 1) {
      const rock = this.add.ellipse(cx + d * (20 + i * 28), cy + Phaser.Math.Between(-6, 6), 22, 14, 0x5a6848, 0.85);
      rock.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: rock,
        x: cx + d * (80 + i * 36),
        alpha: 0,
        duration: 220 + i * 20,
        ease: "Quad.easeOut",
        onComplete: () => rock.destroy()
      });
    }
    this.spawnImpactEffect(cx, cy, col, 36);
  }

  spawnWindupFan(x, y, direction, radius, spreadDeg, color, durationMs = 220) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (this.isTrueHitboxView()) {
      const graphics = this.add.graphics();
      const safeRadius = Math.max(18, Number.isFinite(radius) ? radius : 100);
      const safeSpread = Math.max(18, Number.isFinite(spreadDeg) ? spreadDeg : 90);
      const baseAngle = direction > 0 ? 0 : Math.PI;
      const half = Phaser.Math.DegToRad(safeSpread * 0.5);
      const segments = 8;
      const points = [{ x, y }];
      for (let i = 0; i <= segments; i += 1) {
        const t = i / segments;
        const angle = baseAngle - half + t * half * 2;
        points.push({
          x: x + Math.cos(angle) * safeRadius,
          y: y + Math.sin(angle) * safeRadius
        });
      }
      graphics.fillStyle(color || 0xffffff, 0.012);
      graphics.lineStyle(1, color || 0xffffff, 0.06);
      graphics.beginPath();
      graphics.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) {
        graphics.lineTo(points[i].x, points[i].y);
      }
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();
      this.trackHitboxOverlay(graphics);
      this.tweens.add({
        targets: graphics,
        alpha: 0.035,
        yoyo: true,
        repeat: 1,
        duration: Phaser.Math.Clamp(Number.isFinite(durationMs) ? durationMs : 220, 60, 3000),
        onComplete: () => graphics.destroy()
      });
      return;
    }
    const safeR = Math.max(18, Number.isFinite(radius) ? radius : 100);
    const safeSpread = Math.max(18, Number.isFinite(spreadDeg) ? spreadDeg : 90);
    const baseAngle = direction > 0 ? 0 : Math.PI;
    const half = Phaser.Math.DegToRad(safeSpread * 0.5);
    const g = this.add.graphics();
    g.setDepth(DEPTH.BOSS_TELEGRAPH);
    const segments = 18;
    const points = [{ x, y }];
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const angle = baseAngle - half + t * half * 2;
      points.push({
        x: x + Math.cos(angle) * safeR,
        y: y + Math.sin(angle) * safeR
      });
    }
    g.fillStyle(color, 0.022);
    g.lineStyle(1, color, 0.12);
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      g.lineTo(points[i].x, points[i].y);
    }
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.setAlpha(0.05);
    const beats = Math.max(2, Math.ceil(durationMs / 200));
    this.tweens.add({
      targets: g,
      alpha: { from: 0.05, to: 0.12 },
      duration: Math.min(220, durationMs / beats),
      yoyo: true,
      repeat: beats - 1,
      onComplete: () => g.destroy()
    });
  }

  spawnDashStreak(startX, y, direction, length, color, durationMs = 180) {
    if (this.isTrueHitboxView()) return;
    if (!Number.isFinite(startX) || !Number.isFinite(y)) return;
    const safeLength = Math.max(50, length || 180);
    const c = color || 0xffffff;
    const dur = Phaser.Math.Clamp(Number.isFinite(durationMs) ? durationMs : 180, 40, 3000);
    const centerX = startX + direction * safeLength * 0.5;

    const g = this.add.graphics();
    g.setDepth(DEPTH.BOSS_TELEGRAPH);
    g.fillStyle(c, 0.06);
    g.fillRect(startX, y - 10, direction * safeLength, 20);
    g.fillStyle(c, 0.12);
    g.fillRect(startX, y - 4, direction * safeLength, 8);
    g.lineStyle(1, 0xffffff, 0.15);
    g.lineBetween(startX, y - 1, startX + direction * safeLength, y - 1);
    this.tweens.add({ targets: g, x: g.x + direction * 20, alpha: 0, duration: dur, onComplete: () => g.destroy() });

    for (let i = 0; i < 4; i++) {
      const lx = startX + direction * (safeLength * (0.15 + i * 0.2));
      const line = this.add.rectangle(lx, y + Phaser.Math.Between(-5, 5), Phaser.Math.Between(12, 20), 2, c, 0.3 - i * 0.05);
      line.setDepth(DEPTH.BOSS_TELEGRAPH);
      this.tweens.add({ targets: line, x: lx - direction * 16, alpha: 0, duration: dur * 0.7, delay: i * 10, onComplete: () => line.destroy() });
    }

    const edge = this.add.circle(startX + direction * safeLength, y, 5, 0xffffff, 0.15);
    edge.setStrokeStyle(1, c, 0.3);
    edge.setDepth(DEPTH.BOSS_TELEGRAPH);
    this.tweens.add({ targets: edge, scaleX: 1.5, scaleY: 1.5, alpha: 0, duration: dur * 0.6, onComplete: () => edge.destroy() });
  }

  spawnHealChannelGroundPulse(x, y, color, channelMs) {
    if (this.isTrueHitboxView()) return;
    const safe = Phaser.Math.Clamp(channelMs, 400, 8000);
    const col = color || 0x7dffb6;
    const bright = 0x33ff99;

    const runeG = this.add.graphics();
    runeG.setDepth(DEPTH.PLAYER_FX);
    const runeR = 38;
    const drawRune = (rot) => {
      runeG.clear();
      runeG.lineStyle(2, col, 0.55);
      runeG.strokeCircle(x, y + 16, runeR);
      runeG.lineStyle(1, bright, 0.35);
      runeG.strokeCircle(x, y + 16, runeR * 0.65);
      for (let i = 0; i < 6; i++) {
        const a = rot + (i / 6) * Math.PI * 2;
        const ix = x + Math.cos(a) * runeR;
        const iy = y + 16 + Math.sin(a) * runeR;
        runeG.fillStyle(bright, 0.6);
        runeG.fillCircle(ix, iy, 2.5);
        if (i % 2 === 0) {
          const a2 = rot + ((i + 0.5) / 6) * Math.PI * 2;
          runeG.lineStyle(1, col, 0.3);
          runeG.lineBetween(x + Math.cos(a) * runeR * 0.65, y + 16 + Math.sin(a) * runeR * 0.65, x + Math.cos(a2) * runeR * 0.65, y + 16 + Math.sin(a2) * runeR * 0.65);
        }
      }
    };
    let runeRot = 0;

    const ring = this.add.circle(x, y + 16, 16, col, 0.18);
    ring.setStrokeStyle(2, col, 0.5);
    ring.setDepth(DEPTH.PLAYER_FX);
    const cycleMs = 380;
    const tw1 = this.tweens.add({ targets: ring, radius: 52, alpha: 0.35, duration: cycleMs, yoyo: true, repeat: -1 });

    const innerGlow = this.add.circle(x, y + 10, 8, bright, 0.15);
    innerGlow.setBlendMode(Phaser.BlendModes.ADD);
    innerGlow.setDepth(DEPTH.PLAYER_FX + 1);
    const twGlow = this.tweens.add({ targets: innerGlow, scaleX: 1.8, scaleY: 1.8, alpha: 0.3, duration: 500, yoyo: true, repeat: -1 });

    const channelStart = this.time.now;
    const rotEvt = this.time.addEvent({ delay: 30, loop: true, callback: () => {
      if (this.gameState !== "battle" || this.time.now - channelStart >= safe) { rotEvt.remove(); return; }
      runeRot += 0.02;
      drawRune(runeRot);
    }});

    const floatEvt = this.time.addEvent({ delay: 320, loop: true, callback: () => {
      if (this.gameState !== "battle" || this.time.now - channelStart >= safe) { floatEvt.remove(); return; }
      const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist = Phaser.Math.Between(12, runeR);
      const px = x + Math.cos(ang) * dist;
      const py = y + 16 + Math.sin(ang) * dist * 0.4;
      const mote = this.add.circle(px, py, Phaser.Math.Between(2, 4), bright, 0.7);
      mote.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({ targets: mote, y: py - Phaser.Math.Between(18, 35), x: px + Phaser.Math.Between(-6, 6), alpha: 0, scaleX: 0.3, scaleY: 0.3, duration: 500 + Phaser.Math.Between(0, 200), onComplete: () => mote.destroy() });
    }});

    const crossEvt = this.time.addEvent({ delay: 600, loop: true, callback: () => {
      if (this.gameState !== "battle" || this.time.now - channelStart >= safe) { crossEvt.remove(); return; }
      const cx = x + Phaser.Math.Between(-18, 18);
      const cy = y + Phaser.Math.Between(-4, 12);
      const v = this.add.rectangle(cx, cy, 3, 12, 0xffffff, 0.6);
      const h = this.add.rectangle(cx, cy, 12, 3, 0xffffff, 0.6);
      v.setDepth(DEPTH.PLAYER_FX + 1); h.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({ targets: [v, h], y: cy - 22, alpha: 0, scaleX: 0.5, scaleY: 0.5, duration: 600, onComplete: () => { v.destroy(); h.destroy(); } });
    }});

    this.time.delayedCall(safe, () => {
      if (tw1) tw1.stop(); if (twGlow) twGlow.stop();
      if (rotEvt) rotEvt.remove(); if (floatEvt) floatEvt.remove(); if (crossEvt) crossEvt.remove();
      if (ring?.active) ring.destroy(); if (innerGlow?.active) innerGlow.destroy(); if (runeG?.active) runeG.destroy();
    });
  }

  spawnGuardianShieldBubble(x, y, radius, color) {
    if (this.isTrueHitboxView()) return;
    const r = Math.max(40, radius || 100);
    const c = color || 0xff8b8b;

    const outerGlow = this.add.circle(x, y, r * 1.05, c, 0.06);
    outerGlow.setStrokeStyle(2, c, 0.2);
    outerGlow.setDepth(DEPTH.PLAYER_FX - 1);
    this.tweens.add({ targets: outerGlow, scaleX: 1.1, scaleY: 1.1, alpha: 0.18, duration: 280, yoyo: true, repeat: 1, onComplete: () => outerGlow.destroy() });

    const ring = this.add.circle(x, y, r * 0.92, c, 0.12);
    ring.setStrokeStyle(4, c, 0.55);
    ring.setDepth(DEPTH.PLAYER_FX);
    const inner = this.add.circle(x, y, r * 0.55, 0xffffff, 0.08);
    inner.setStrokeStyle(2, c, 0.4);
    inner.setDepth(DEPTH.PLAYER_FX - 1);

    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const edgeSp = this.add.circle(x + Math.cos(ang) * r * 0.88, y + Math.sin(ang) * r * 0.88, 2, 0xffffff, 0.5);
      edgeSp.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({ targets: edgeSp, alpha: 0, x: edgeSp.x + Math.cos(ang) * 12, y: edgeSp.y + Math.sin(ang) * 12, duration: 400, onComplete: () => edgeSp.destroy() });
    }

    this.tweens.add({
      targets: ring,
      alpha: 0.55,
      scaleX: 1.04,
      scaleY: 1.04,
      duration: 220,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        ring.destroy();
        inner.destroy();
      }
    });
  }

  spawnPersistentShieldDrIcon(target, color, durationMs) {
    if (!target || !target.active) return;
    const c = color || 0xff8b8b;
    const cont = this.add.container(target.x, target.y - 46);
    cont.setDepth(DEPTH.PLAYER_FX + 1);

    const glow = this.add.circle(0, 0, 12, c, 0.15);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    cont.add(glow);

    const shieldG = this.add.graphics();
    shieldG.fillStyle(c, 0.85);
    shieldG.beginPath();
    shieldG.moveTo(0, -9); shieldG.lineTo(-7, -6); shieldG.lineTo(-7, 3); shieldG.lineTo(0, 9); shieldG.lineTo(7, 3); shieldG.lineTo(7, -6);
    shieldG.closePath(); shieldG.fillPath();
    shieldG.lineStyle(1.5, 0xffffff, 0.75);
    shieldG.beginPath();
    shieldG.moveTo(0, -9); shieldG.lineTo(-7, -6); shieldG.lineTo(-7, 3); shieldG.lineTo(0, 9); shieldG.lineTo(7, 3); shieldG.lineTo(7, -6);
    shieldG.closePath(); shieldG.strokePath();
    shieldG.fillStyle(0xffffff, 0.3);
    shieldG.fillCircle(0, -2, 2.5);
    cont.add(shieldG);

    const endAt = this.time.now + Math.max(200, durationMs || 1000);
    const twPulse = this.tweens.add({ targets: glow, scaleX: 1.3, scaleY: 1.3, alpha: 0.3, duration: 400, yoyo: true, repeat: -1 });
    const evt = this.time.addEvent({
      delay: 16, loop: true,
      callback: () => {
        if (!target.active || !target.isAlive || this.time.now >= endAt) {
          if (twPulse) twPulse.stop();
          cont.destroy(true);
          evt.remove();
          return;
        }
        cont.x = target.x;
        cont.y = target.y - 46;
      }
    });
  }

  spawnGroundSlamShockwaveVisual(x, y, color, maxRadius = 140, durationMs = 220) {
    if (this.isTrueHitboxView()) return;
    const c = color || 0xc288ff;

    const flash = this.add.circle(x, y + 8, 18, 0xffffff, 0.75);
    flash.setBlendMode(Phaser.BlendModes.ADD);
    flash.setDepth(DEPTH.PLAYER_FX + 2);
    this.tweens.add({ targets: flash, scaleX: 2, scaleY: 2, alpha: 0, duration: 100, onComplete: () => flash.destroy() });

    for (let w = 0; w < 3; w++) {
      this.time.delayedCall(w * 45, () => {
        if (this.gameState !== "battle") return;
        const ring = this.add.circle(x, y + 12, 10 + w * 4, c, 0);
        ring.setStrokeStyle(4 - w, w === 0 ? 0xffffff : c, 0.9 - w * 0.2);
        ring.setDepth(DEPTH.PLAYER_FX);
        this.tweens.add({ targets: ring, radius: maxRadius * (1 - w * 0.08), alpha: 0, duration: durationMs + w * 30, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
      });
    }

    const dustG = this.add.graphics();
    dustG.setDepth(DEPTH.PLAYER_FX - 1);
    dustG.fillStyle(c, 0.15);
    dustG.fillEllipse(x, y + 16, maxRadius * 1.2, 20);
    this.tweens.add({ targets: dustG, scaleX: 1.3, alpha: 0, duration: durationMs * 1.2, onComplete: () => dustG.destroy() });

    for (let i = 0; i < 10; i++) {
      const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const sp = this.add.circle(x, y + 10, Phaser.Math.Between(2, 4), i % 3 === 0 ? 0xffffff : c, 0.8);
      sp.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({
        targets: sp,
        x: x + Math.cos(ang) * Phaser.Math.Between(20, maxRadius * 0.7),
        y: y + 10 + Math.sin(ang) * Phaser.Math.Between(8, maxRadius * 0.4),
        alpha: 0, duration: durationMs + Phaser.Math.Between(0, 80),
        ease: "Quad.easeOut", onComplete: () => sp.destroy()
      });
    }

    for (let i = 0; i < 6; i++) {
      const debX = x + Phaser.Math.Between(-maxRadius * 0.3, maxRadius * 0.3);
      const deb = this.add.rectangle(debX, y + 14, Phaser.Math.Between(3, 6), Phaser.Math.Between(3, 6), c, 0.7);
      deb.setRotation(Phaser.Math.FloatBetween(0, Math.PI));
      deb.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({
        targets: deb, y: y - Phaser.Math.Between(12, 35), x: debX + Phaser.Math.Between(-10, 10),
        alpha: 0, angle: deb.angle + Phaser.Math.Between(-80, 80),
        duration: 280, ease: "Quad.easeOut", onComplete: () => deb.destroy()
      });
    }
  }

  spawnAbilityBurst(x, y, color, radius = 52, durationMs = 260) {
    if (this.isTrueHitboxView()) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const safeRadius = Phaser.Math.Clamp(Number.isFinite(radius) ? radius : 52, 12, 260);
    const safeDuration = Phaser.Math.Clamp(Number.isFinite(durationMs) ? durationMs : 260, 60, 3000);
    const c = color || 0xffffff;

    const flash = this.add.circle(x, y, safeRadius * 0.3, 0xffffff, 0.5);
    flash.setBlendMode(Phaser.BlendModes.ADD);
    flash.setDepth(DEPTH.PLAYER_FX + 1);
    this.tweens.add({ targets: flash, scaleX: 1.8, scaleY: 1.8, alpha: 0, duration: safeDuration * 0.4, onComplete: () => flash.destroy() });

    for (let i = 0; i < 8; i++) {
      const spoke = this.add.rectangle(x, y, 3, safeRadius * 0.45, c, 0.65);
      spoke.angle = i * 45;
      spoke.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({ targets: spoke, scaleY: 1.5, alpha: 0, angle: spoke.angle + Phaser.Math.Between(-10, 10), duration: safeDuration, onComplete: () => spoke.destroy() });
    }

    const ring = this.add.circle(x, y, 8, c, 0);
    ring.setStrokeStyle(3, c, 0.95);
    ring.setDepth(DEPTH.PLAYER_FX);
    this.tweens.add({ targets: ring, radius: safeRadius, alpha: 0, duration: safeDuration, ease: "Quad.easeOut", onComplete: () => ring.destroy() });

    const ring2 = this.add.circle(x, y, 5, 0xffffff, 0);
    ring2.setStrokeStyle(2, 0xffffff, 0.4);
    ring2.setDepth(DEPTH.PLAYER_FX);
    this.tweens.add({ targets: ring2, radius: safeRadius * 0.7, alpha: 0, duration: safeDuration * 0.8, delay: 20, onComplete: () => ring2.destroy() });

    for (let i = 0; i < 6; i++) {
      const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const sp = this.add.circle(x, y, Phaser.Math.Between(1, 3), i % 2 === 0 ? 0xffffff : c, 0.7);
      sp.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({ targets: sp, x: x + Math.cos(ang) * Phaser.Math.Between(10, safeRadius * 0.6), y: y + Math.sin(ang) * Phaser.Math.Between(8, safeRadius * 0.5), alpha: 0, duration: safeDuration * 0.7, onComplete: () => sp.destroy() });
    }
  }

  /** Vanguard utility: launch surge at feet + forward speed lines. */
  spawnDashStrikeUtilityVfx(x, y, facing, color, trailMs = 160) {
    if (this.isTrueHitboxView()) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const f = facing >= 0 ? 1 : -1;
    const c = color || 0x5ca8ff;
    const dur = Phaser.Math.Clamp(trailMs || 160, 80, 400);

    const coneG = this.add.graphics();
    coneG.setDepth(DEPTH.PLAYER_FX);
    coneG.fillStyle(c, 0.2);
    coneG.fillTriangle(x, y - 12, x, y + 12, x + f * 65, y);
    coneG.fillStyle(0xffffff, 0.1);
    coneG.fillTriangle(x, y - 6, x, y + 6, x + f * 50, y);
    this.tweens.add({ targets: coneG, alpha: 0, duration: dur * 0.8, ease: "Quad.easeOut", onComplete: () => coneG.destroy() });

    for (let i = 0; i < 3; i++) {
      const afterG = this.add.graphics();
      afterG.setDepth(DEPTH.PLAYER_FX - 1);
      const ox = x - f * (6 + i * 14);
      afterG.fillStyle(c, 0.18 - i * 0.04);
      afterG.fillRoundedRect(ox - 8, y - 20, 16, 40, 4);
      afterG.lineStyle(1, c, 0.25 - i * 0.06);
      afterG.strokeRoundedRect(ox - 8, y - 20, 16, 40, 4);
      this.tweens.add({
        targets: afterG, alpha: 0, x: afterG.x - f * (20 + i * 8),
        duration: dur * 0.7, delay: i * 15, ease: "Quad.easeOut", onComplete: () => afterG.destroy()
      });
    }

    const kick = this.add.ellipse(x + f * 18, y + 6, 60, 16, c, 0.3);
    kick.setStrokeStyle(1, 0xffffff, 0.4);
    kick.setDepth(DEPTH.PLAYER_FX);
    this.tweens.add({ targets: kick, x: x + f * 48, scaleX: 1.5, scaleY: 0.6, alpha: 0, duration: dur, ease: "Cubic.easeOut", onComplete: () => kick.destroy() });

    for (let i = 0; i < 6; i++) {
      const line = this.add.rectangle(x - f * (6 + i * 8), y - 4 + Phaser.Math.Between(-6, 6), 14 + Phaser.Math.Between(0, 8), 2, i % 2 === 0 ? c : 0xffffff, 0.5 - i * 0.06);
      line.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({ targets: line, x: x - f * (42 + i * 12), alpha: 0, duration: dur + i * 10, delay: i * 6, onComplete: () => line.destroy() });
    }

    for (let i = 0; i < 4; i++) {
      const spark = this.add.circle(x + f * Phaser.Math.Between(-4, 12), y + Phaser.Math.Between(-10, 10), Phaser.Math.Between(1, 3), 0xffffff, 0.7);
      spark.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({ targets: spark, x: spark.x - f * Phaser.Math.Between(20, 45), alpha: 0, duration: dur * 0.6, delay: i * 12, onComplete: () => spark.destroy() });
    }
  }

  /** Ranger utility Skyrise Leap: shockwave ring, wind column, rising streaks, dust debris. */
  spawnSkyriseLeapVisual(x, y, facing, color) {
    if (this.isTrueHitboxView()) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const c = color || 0xf7d95c;
    const f = facing >= 0 ? 1 : -1;

    // ground shockwave ring that expands outward
    const shockwave = this.add.ellipse(x, y + 8, 20, 8, c, 0.0);
    shockwave.setStrokeStyle(3, 0xfff8d0, 0.7);
    shockwave.setDepth(DEPTH.PLAYER_FX - 1);
    this.tweens.add({
      targets: shockwave,
      scaleX: 4.5,
      scaleY: 2.8,
      alpha: 0,
      duration: 360,
      ease: "Cubic.easeOut",
      onComplete: () => shockwave.destroy()
    });

    // secondary dust ring, slightly delayed
    const dustRing = this.add.ellipse(x, y + 10, 30, 12, c, 0.15);
    dustRing.setStrokeStyle(2, c, 0.3);
    dustRing.setDepth(DEPTH.PLAYER_FX - 1);
    this.tweens.add({
      targets: dustRing,
      scaleX: 3.2,
      scaleY: 2.0,
      alpha: 0,
      delay: 60,
      duration: 300,
      ease: "Cubic.easeOut",
      onComplete: () => dustRing.destroy()
    });

    // vertical wind column (tall translucent pillar)
    const gfx = this.add.graphics();
    gfx.setDepth(DEPTH.PLAYER_FX);
    gfx.fillStyle(c, 0.1);
    gfx.fillRect(x - 14, y - 100, 28, 110);
    gfx.lineStyle(2, 0xffffff, 0.2);
    gfx.beginPath(); gfx.moveTo(x - 14, y + 10); gfx.lineTo(x - 14, y - 100); gfx.strokePath();
    gfx.beginPath(); gfx.moveTo(x + 14, y + 10); gfx.lineTo(x + 14, y - 100); gfx.strokePath();
    this.tweens.add({
      targets: gfx,
      alpha: 0,
      duration: 400,
      delay: 80,
      onComplete: () => gfx.destroy()
    });

    // rising wind streaks (varied widths, speeds, offsets)
    for (let i = 0; i < 10; i += 1) {
      const ox = Phaser.Math.Between(-18, 18);
      const sw = Phaser.Math.Between(2, 5);
      const sh = Phaser.Math.Between(18, 40);
      const alpha = Phaser.Math.FloatBetween(0.25, 0.55);
      const streak = this.add.rectangle(x + ox, y + 6, sw, sh, i % 3 === 0 ? 0xffffff : c, alpha);
      streak.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: streak,
        y: y - 80 - Phaser.Math.Between(20, 60),
        scaleY: 0.3,
        alpha: 0,
        duration: 180 + i * 30,
        delay: i * 15,
        ease: "Cubic.easeOut",
        onComplete: () => streak.destroy()
      });
    }

    // debris particles scattering outward from the ground
    for (let i = 0; i < 8; i += 1) {
      const ang = (i / 8) * Math.PI + Phaser.Math.FloatBetween(-0.2, 0.2);
      const dist = Phaser.Math.Between(28, 56);
      const sz = Phaser.Math.Between(3, 6);
      const chunk = this.add.rectangle(x, y + 8, sz, sz, 0xd8c888, 0.65);
      chunk.setRotation(Phaser.Math.FloatBetween(0, Math.PI));
      chunk.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: chunk,
        x: x + Math.cos(ang) * dist,
        y: y + 8 + Math.sin(ang) * dist * 0.4 - Phaser.Math.Between(8, 24),
        alpha: 0,
        rotation: chunk.rotation + Phaser.Math.FloatBetween(-1, 1),
        duration: 280 + i * 25,
        ease: "Cubic.easeOut",
        onComplete: () => chunk.destroy()
      });
    }

    // bright core flash at launch point
    const flash = this.add.circle(x, y + 4, 12, 0xffffff, 0.65);
    flash.setDepth(DEPTH.PLAYER_FX + 1);
    this.tweens.add({
      targets: flash,
      scaleX: 2.8,
      scaleY: 2.0,
      alpha: 0,
      duration: 180,
      onComplete: () => flash.destroy()
    });

    // directional wind gust (angled streaks behind the jump)
    for (let i = 0; i < 3; i += 1) {
      const gust = this.add.rectangle(
        x - f * (10 + i * 12), y - 10 - i * 14,
        24 - i * 4, 3, 0xffffff, 0.3 - i * 0.08
      );
      gust.setDepth(DEPTH.PLAYER_FX);
      this.tweens.add({
        targets: gust,
        x: gust.x - f * 30,
        alpha: 0,
        scaleX: 0.4,
        duration: 200 + i * 40,
        ease: "Sine.easeOut",
        onComplete: () => gust.destroy()
      });
    }
  }

  /** Guardian utility Aegis Parry: frontal guard arc, glints, soft core flash. */
  spawnAegisParryVisual(x, y, facing, color, windowMs = 300) {
    if (this.isTrueHitboxView()) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const c = color || 0xff8b8b;
    const f = facing >= 0 ? 1 : -1;
    const dur = Phaser.Math.Clamp(windowMs || 300, 120, 2000);
    const baseX = x + f * 24;
    const baseY = y - 8;

    const shieldFlash = this.add.graphics();
    shieldFlash.setDepth(DEPTH.PLAYER_FX + 2);
    shieldFlash.fillStyle(0xffffff, 0.75);
    const sw = 28; const sh = 42;
    const pts = [[-sw * 0.5, -sh * 0.5], [sw * 0.5, -sh * 0.5], [sw * 0.5, sh * 0.2], [0, sh * 0.5], [-sw * 0.5, sh * 0.2]];
    shieldFlash.beginPath();
    pts.forEach(([px, py], i) => { if (i === 0) shieldFlash.moveTo(baseX + px, baseY + py); else shieldFlash.lineTo(baseX + px, baseY + py); });
    shieldFlash.closePath(); shieldFlash.fillPath();
    shieldFlash.fillStyle(c, 0.5);
    shieldFlash.beginPath();
    const inner = pts.map(([px, py]) => [px * 0.65, py * 0.65]);
    inner.forEach(([px, py], i) => { if (i === 0) shieldFlash.moveTo(baseX + px, baseY + py); else shieldFlash.lineTo(baseX + px, baseY + py); });
    shieldFlash.closePath(); shieldFlash.fillPath();
    shieldFlash.fillStyle(0xffffff, 0.4);
    shieldFlash.fillCircle(baseX, baseY - 4, 5);
    this.tweens.add({ targets: shieldFlash, alpha: 0, duration: dur, onComplete: () => shieldFlash.destroy() });

    const arc = this.add.graphics();
    arc.setDepth(DEPTH.PLAYER_FX + 1);
    const radius = 52;
    const start = f > 0 ? -Math.PI * 0.4 : Math.PI * 1.4;
    const end = f > 0 ? Math.PI * 0.4 : Math.PI * 0.6;
    const sweep = { p: 0 };
    this.tweens.add({
      targets: sweep, p: 1, duration: Math.min(160, dur * 0.55), ease: "Sine.easeOut",
      onUpdate: () => {
        const prog = sweep.p;
        arc.clear();
        arc.lineStyle(8, c, 0.65 * (1 - prog * 0.3));
        arc.beginPath(); arc.arc(baseX, baseY, radius, start, Phaser.Math.Linear(start, end, prog), false); arc.strokePath();
        arc.lineStyle(3, 0xffffff, 0.5 * (1 - prog * 0.4));
        arc.beginPath(); arc.arc(baseX, baseY, radius - 5, start, Phaser.Math.Linear(start, end, prog), false); arc.strokePath();
        arc.lineStyle(2, c, 0.2 * (1 - prog * 0.3));
        arc.beginPath(); arc.arc(baseX, baseY, radius + 6, start, Phaser.Math.Linear(start, end, prog * 0.7), false); arc.strokePath();
      },
      onComplete: () => { this.tweens.add({ targets: arc, alpha: 0, duration: dur * 0.4, onComplete: () => arc.destroy() }); }
    });

    const pulseRing = this.add.circle(baseX, baseY, 14, c, 0);
    pulseRing.setStrokeStyle(3, 0xffffff, 0.7);
    pulseRing.setDepth(DEPTH.PLAYER_FX + 1);
    this.tweens.add({ targets: pulseRing, radius: 55, alpha: 0, duration: dur * 0.6, ease: "Quad.easeOut", onComplete: () => pulseRing.destroy() });

    for (let i = 0; i < 8; i++) {
      const spark = this.add.circle(
        baseX + f * Phaser.Math.Between(12, 36), baseY + Phaser.Math.Between(-20, 20),
        Phaser.Math.Between(1, 3), i % 3 === 0 ? 0xffffff : c, 0.8
      );
      spark.setDepth(DEPTH.PLAYER_FX + 2);
      this.tweens.add({
        targets: spark, x: spark.x + f * Phaser.Math.Between(10, 30), y: spark.y + Phaser.Math.Between(-12, 12),
        alpha: 0, duration: 160 + i * 15, onComplete: () => spark.destroy()
      });
    }

    const glint1 = this.add.rectangle(baseX + f * 6, baseY - 16, 3, 22, 0xffffff, 0.7);
    const glint2 = this.add.rectangle(baseX + f * 6, baseY - 16, 22, 3, 0xffffff, 0.7);
    glint1.setDepth(DEPTH.PLAYER_FX + 3); glint2.setDepth(DEPTH.PLAYER_FX + 3);
    this.tweens.add({ targets: [glint1, glint2], scaleX: 1.5, scaleY: 1.5, alpha: 0, duration: 140, onComplete: () => { glint1.destroy(); glint2.destroy(); } });
  }

  /** Striker utility Blink Step: origin shred, destination snap burst. */
  spawnBlinkStepUtilityVfx(startX, startY, endX, endY, facing, color) {
    if (this.isTrueHitboxView()) return;
    const c = color || 0xc288ff;
    const f = facing >= 0 ? 1 : -1;
    const sy = startY - 6;
    const ey = endY - 6;

    const tearG = this.add.graphics();
    tearG.setDepth(DEPTH.PLAYER_FX + 1);
    tearG.fillStyle(0x1a0a2e, 0.6);
    tearG.fillEllipse(startX, sy, 18, 36);
    tearG.lineStyle(2, c, 0.8);
    tearG.strokeEllipse(startX, sy, 18, 36);
    tearG.fillStyle(0x000000, 0.4);
    tearG.fillEllipse(startX, sy, 8, 24);
    this.tweens.add({ targets: tearG, scaleX: 0.1, scaleY: 1.3, alpha: 0, duration: 220, ease: "Quad.easeIn", onComplete: () => tearG.destroy() });

    for (let i = 0; i < 10; i++) {
      const shard = this.add.rectangle(
        startX + Phaser.Math.Between(-12, 12), sy + Phaser.Math.Between(-16, 16),
        Phaser.Math.Between(3, 8), Phaser.Math.Between(8, 20),
        i % 3 === 0 ? 0xe8d0ff : c, 0.5
      );
      shard.setDepth(DEPTH.PLAYER_FX);
      shard.angle = Phaser.Math.Between(-30, 30);
      this.tweens.add({
        targets: shard, x: startX + Phaser.Math.Between(-40, 40) - f * 20, y: sy + Phaser.Math.Between(-30, 30),
        alpha: 0, angle: shard.angle + Phaser.Math.Between(-45, 45), scaleX: 0.3, scaleY: 0.3,
        duration: 180 + i * 12, ease: "Cubic.easeOut", onComplete: () => shard.destroy()
      });
    }

    const trailG = this.add.graphics();
    trailG.setDepth(DEPTH.PLAYER_FX - 1);
    const dx = endX - startX;
    const dy = ey - sy;
    for (let i = 0; i < 5; i++) {
      const t = (i + 1) / 6;
      const mx = startX + dx * t;
      const my = sy + dy * t;
      trailG.fillStyle(c, 0.12 - i * 0.02);
      trailG.fillCircle(mx, my, 6 - i * 0.5);
    }
    this.tweens.add({ targets: trailG, alpha: 0, duration: 160, onComplete: () => trailG.destroy() });

    const snapFlash = this.add.circle(endX, ey, 14, 0xffffff, 0.7);
    snapFlash.setBlendMode(Phaser.BlendModes.ADD);
    snapFlash.setDepth(DEPTH.PLAYER_FX + 2);
    this.tweens.add({ targets: snapFlash, scaleX: 2.2, scaleY: 2.2, alpha: 0, duration: 120, onComplete: () => snapFlash.destroy() });

    const snap = this.add.circle(endX, ey, 8, c, 0);
    snap.setStrokeStyle(3, c, 0.85);
    snap.setDepth(DEPTH.PLAYER_FX + 1);
    this.tweens.add({ targets: snap, radius: 42, alpha: 0, duration: 220, ease: "Quad.easeOut", onComplete: () => snap.destroy() });

    const snap2 = this.add.circle(endX, ey, 5, 0xffffff, 0);
    snap2.setStrokeStyle(2, 0xffffff, 0.5);
    snap2.setDepth(DEPTH.PLAYER_FX + 1);
    this.tweens.add({ targets: snap2, radius: 28, alpha: 0, duration: 180, delay: 30, onComplete: () => snap2.destroy() });

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const ray = this.add.rectangle(endX, ey, 2, 18, c, 0.65);
      ray.setRotation(a);
      ray.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({ targets: ray, scaleY: 2, alpha: 0, duration: 150, onComplete: () => ray.destroy() });
    }

    for (let i = 0; i < 6; i++) {
      const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const sp = this.add.circle(endX + Math.cos(ang) * 6, ey + Math.sin(ang) * 6, Phaser.Math.Between(1, 3), i % 2 === 0 ? 0xffffff : c, 0.8);
      sp.setDepth(DEPTH.PLAYER_FX + 2);
      this.tweens.add({ targets: sp, x: sp.x + Math.cos(ang) * Phaser.Math.Between(15, 35), y: sp.y + Math.sin(ang) * Phaser.Math.Between(12, 28), alpha: 0, duration: 180 + i * 12, onComplete: () => sp.destroy() });
    }
  }

  spawnImpactEffect(x, y, color, size) {
    if (this.isTrueHitboxView()) return;
    const s = Math.max(12, size || 16);
    const c = color || 0xffffff;

    const flash = this.add.circle(x, y, s * 0.6, 0xffffff, 0.92);
    flash.setBlendMode(Phaser.BlendModes.ADD);
    flash.setDepth(DEPTH.PLAYER_FX + 3);
    this.tweens.add({ targets: flash, scaleX: 1.6, scaleY: 1.6, alpha: 0, duration: 80, ease: "Quad.easeOut", onComplete: () => flash.destroy() });

    const core = this.add.circle(x, y, 5, 0xffffff, 0.98);
    core.setDepth(DEPTH.PLAYER_FX + 2);
    this.tweens.add({ targets: core, radius: s * 0.45, alpha: 0, duration: 150, ease: "Quad.easeOut", onComplete: () => core.destroy() });

    const ring = this.add.circle(x, y, 7, c, 0);
    ring.setStrokeStyle(3, c, 0.92);
    ring.setDepth(DEPTH.PLAYER_FX + 1);
    this.tweens.add({ targets: ring, radius: s * 1.3, alpha: 0, duration: 240, ease: "Quad.easeOut", onComplete: () => ring.destroy() });

    const ring2 = this.add.circle(x, y, 5, c, 0);
    ring2.setStrokeStyle(2, 0xffffff, 0.55);
    ring2.setDepth(DEPTH.PLAYER_FX + 1);
    this.tweens.add({ targets: ring2, radius: s * 0.9, alpha: 0, duration: 180, delay: 30, ease: "Quad.easeOut", onComplete: () => ring2.destroy() });

    const numSparks = Math.min(8, Math.max(4, Math.round(s / 6)));
    for (let i = 0; i < numSparks; i++) {
      const a = (i / numSparks) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.3, 0.3);
      const dist = Phaser.Math.Between(Math.round(s * 0.5), Math.round(s * 1.2));
      const sp = this.add.circle(x, y, Phaser.Math.Between(1, 3), i % 2 === 0 ? 0xffffff : c, 0.9);
      sp.setDepth(DEPTH.PLAYER_FX + 2);
      this.tweens.add({
        targets: sp,
        x: x + Math.cos(a) * dist,
        y: y + Math.sin(a) * dist,
        alpha: 0,
        duration: 160 + Phaser.Math.Between(0, 80),
        ease: "Cubic.easeOut",
        onComplete: () => sp.destroy()
      });
    }

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const ray = this.add.rectangle(x, y, 2, s * 0.7, 0xffffff, 0.6);
      ray.setRotation(a);
      ray.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({ targets: ray, scaleY: 1.8, alpha: 0, duration: 130, ease: "Quad.easeOut", onComplete: () => ray.destroy() });
    }
  }

  spawnMuzzleFlash(x, y, color, visualStyle = "default") {
    if (this.isTrueHitboxView()) return;
    if (visualStyle === "riftBolt") {
      const glow = this.add.circle(x, y, 8, color, 0.32);
      glow.setBlendMode(Phaser.BlendModes.ADD);
      glow.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({ targets: glow, scaleX: 1.5, scaleY: 1.5, alpha: 0, duration: 100, onComplete: () => glow.destroy() });
      const hx = this.add.rectangle(x, y - 1, 2, 10, 0xffffff, 0.75);
      const hy = this.add.rectangle(x, y - 1, 10, 2, 0xffffff, 0.55);
      hx.setDepth(DEPTH.PLAYER_FX + 1);
      hy.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({ targets: [hx, hy], scaleX: 1.4, scaleY: 1.4, alpha: 0, duration: 120, onComplete: () => { hx.destroy(); hy.destroy(); } });
      return;
    }
    if (visualStyle === "pulse") {
      const glow = this.add.circle(x, y, 7, color, 0.3);
      glow.setBlendMode(Phaser.BlendModes.ADD);
      glow.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({ targets: glow, scaleX: 2, scaleY: 2, alpha: 0, duration: 120, onComplete: () => glow.destroy() });
      const c = this.add.circle(x, y, 4, color, 0.5);
      const v = this.add.rectangle(x, y - 1, 2, 12, 0xffffff, 0.85);
      const h = this.add.rectangle(x, y - 1, 12, 2, 0xffffff, 0.85);
      c.setDepth(DEPTH.PLAYER_FX + 1); v.setDepth(DEPTH.PLAYER_FX + 1); h.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({ targets: [c, v, h], scaleX: 1.8, scaleY: 1.8, alpha: 0, duration: 140, onComplete: () => { c.destroy(); v.destroy(); h.destroy(); } });
      for (let i = 0; i < 3; i++) {
        const sp = this.add.circle(x + Phaser.Math.Between(-4, 4), y + Phaser.Math.Between(-4, 4), 1.5, 0xffffff, 0.5);
        sp.setDepth(DEPTH.PLAYER_FX + 1);
        this.tweens.add({ targets: sp, y: sp.y - Phaser.Math.Between(6, 14), alpha: 0, duration: 120, onComplete: () => sp.destroy() });
      }
      return;
    }
    if (visualStyle === "arrow" || visualStyle === "tripleArrow") {
      const flash = this.add.circle(x, y, 6, 0xffffff, 0.5);
      flash.setBlendMode(Phaser.BlendModes.ADD);
      flash.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({ targets: flash, scaleX: 1.8, scaleY: 1.8, alpha: 0, duration: 80, onComplete: () => flash.destroy() });
      const burst = this.add.circle(x, y, 4, color, 0.6);
      burst.setStrokeStyle(1, 0xffffff, 0.5);
      burst.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({ targets: burst, radius: 12, alpha: 0, duration: 100, onComplete: () => burst.destroy() });
      for (let i = 0; i < 3; i++) {
        const ang = Phaser.Math.FloatBetween(-0.6, 0.6) + (visualStyle === "tripleArrow" ? (i - 1) * 0.4 : 0);
        const sp = this.add.circle(x + Math.cos(ang) * 4, y + Math.sin(ang) * 4, 2, 0xf7d95c, 0.6);
        sp.setDepth(DEPTH.PLAYER_FX + 1);
        this.tweens.add({ targets: sp, x: sp.x + Math.cos(ang) * 12, y: sp.y + Math.sin(ang) * 8, alpha: 0, duration: 90 + i * 10, onComplete: () => sp.destroy() });
      }
      return;
    }
    const flash = this.add.circle(x, y, 5, 0xffffff, 0.4);
    flash.setBlendMode(Phaser.BlendModes.ADD);
    flash.setDepth(DEPTH.PLAYER_FX + 1);
    this.tweens.add({ targets: flash, scaleX: 1.6, scaleY: 1.6, alpha: 0, duration: 70, onComplete: () => flash.destroy() });
    const burst = this.add.circle(x, y, 4, color, 0.6);
    burst.setDepth(DEPTH.PLAYER_FX + 1);
    this.tweens.add({ targets: burst, radius: 10, alpha: 0, duration: 100, onComplete: () => burst.destroy() });
  }

  spawnProjectileTrail(x, y, color, visualStyle, texKey = "") {
    if (this.isTrueHitboxView()) return;
    const c = color || 0xffffff;

    if (visualStyle === "soulWispBolt" || texKey === "proj_soulcaller_wisp") {
      const p = this.add.circle(x, y, 3.5, c, 0.5);
      p.setDepth(DEPTH.PLAYER_FX - 1);
      this.tweens.add({ targets: p, alpha: 0, scaleX: 0.5, scaleY: 0.5, duration: 100, onComplete: () => p.destroy() });
      return;
    }
    if (visualStyle === "soulTurretBolt" || texKey === "proj_soulcaller_turret") {
      const r = this.add.rectangle(x, y, 10, 3, c, 0.5);
      r.setDepth(DEPTH.PLAYER_FX - 1);
      this.tweens.add({ targets: r, x: x - 10, alpha: 0, duration: 90, onComplete: () => r.destroy() });
      return;
    }
    if (visualStyle === "riftBolt" || texKey === "proj_summoner" || texKey === "proj_summoner_charged") {
      const glow = this.add.circle(x, y, 6, c, 0.38);
      glow.setBlendMode(Phaser.BlendModes.ADD);
      glow.setDepth(DEPTH.PLAYER_FX - 1);
      this.tweens.add({ targets: glow, scaleX: 1.6, scaleY: 1.6, alpha: 0, duration: 110, onComplete: () => glow.destroy() });
      const sp = this.add.circle(x - 3, y, 3, 0xffffff, 0.35);
      sp.setDepth(DEPTH.PLAYER_FX - 1);
      this.tweens.add({ targets: sp, x: x - 12, alpha: 0, duration: 100, onComplete: () => sp.destroy() });
      return;
    }

    if (visualStyle === "pulse" || texKey === "proj_medic") {
      const glow = this.add.circle(x, y, 6, c, 0.2);
      glow.setBlendMode(Phaser.BlendModes.ADD);
      glow.setDepth(DEPTH.PLAYER_FX - 1);
      this.tweens.add({ targets: glow, scaleX: 1.5, scaleY: 1.5, alpha: 0, duration: 130, onComplete: () => glow.destroy() });
      const t1 = this.add.circle(x, y, 4, 0xffffff, 0.4);
      const t2 = this.add.circle(x + 4, y - 2, 3, c, 0.32);
      t1.setDepth(DEPTH.PLAYER_FX - 1); t2.setDepth(DEPTH.PLAYER_FX - 1);
      this.tweens.add({ targets: [t1, t2], x: x - 14, alpha: 0, duration: 120, onComplete: () => { t1.destroy(); t2.destroy(); } });
      return;
    }

    if (visualStyle === "arrow" || visualStyle === "tripleArrow" || texKey === "proj_ranger") {
      const streak = this.add.circle(x, y, 5, c, 0.45);
      streak.setScale(1.8, 0.5);
      streak.setDepth(DEPTH.PLAYER_FX - 1);
      this.tweens.add({ targets: streak, scaleX: 2.8, scaleY: 0.7, alpha: 0, duration: 90, onComplete: () => streak.destroy() });
      const sp = this.add.circle(x - 2, y + Phaser.Math.Between(-2, 2), 2, 0xffffff, 0.35);
      sp.setDepth(DEPTH.PLAYER_FX - 1);
      this.tweens.add({ targets: sp, x: x - 10, alpha: 0, duration: 80, onComplete: () => sp.destroy() });
      return;
    }

    const trail = this.add.circle(x, y, 3, c, 0.35);
    trail.setDepth(DEPTH.PLAYER_FX - 1);
    this.tweens.add({ targets: trail, radius: 7, alpha: 0, duration: 110, onComplete: () => trail.destroy() });
    const t2 = this.add.circle(x + Phaser.Math.Between(-3, 3), y + Phaser.Math.Between(-2, 2), 2, 0xffffff, 0.2);
    t2.setDepth(DEPTH.PLAYER_FX - 1);
    this.tweens.add({ targets: t2, alpha: 0, duration: 90, onComplete: () => t2.destroy() });
  }

  spawnHealMarker(x, y, color) {
    if (this.isTrueHitboxView()) return;
    const c = color || 0x7dffb6;

    const glow = this.add.circle(x, y, 10, c, 0.25);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    glow.setDepth(DEPTH.PLAYER_FX);
    this.tweens.add({ targets: glow, scaleX: 1.8, scaleY: 1.8, alpha: 0, y: y - 10, duration: 300, onComplete: () => glow.destroy() });

    const vert = this.add.rectangle(x, y, 4, 16, 0xffffff, 0.92);
    const horiz = this.add.rectangle(x, y, 16, 4, 0xffffff, 0.92);
    vert.setDepth(DEPTH.PLAYER_FX + 1); horiz.setDepth(DEPTH.PLAYER_FX + 1);
    this.tweens.add({ targets: [vert, horiz], y: y - 14, alpha: 0, scaleX: 1.3, scaleY: 1.3, duration: 350, onComplete: () => { vert.destroy(); horiz.destroy(); } });

    for (let i = 0; i < 4; i++) {
      const sp = this.add.circle(x + Phaser.Math.Between(-8, 8), y + Phaser.Math.Between(-4, 4), 2, c, 0.6);
      sp.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({ targets: sp, y: sp.y - Phaser.Math.Between(10, 22), x: sp.x + Phaser.Math.Between(-6, 6), alpha: 0, duration: 250 + i * 20, onComplete: () => sp.destroy() });
    }
  }

  spawnShieldSigil(x, y, color, facing) {
    if (this.isTrueHitboxView()) return;
    const c = color || 0xff8b8b;
    const g = this.add.graphics();
    g.setDepth(DEPTH.PLAYER_FX + 1);
    const f = facing > 0 ? 1 : -1;
    g.fillStyle(c, 0.35);
    g.beginPath();
    g.moveTo(x, y - 14); g.lineTo(x - 10 * f, y - 10); g.lineTo(x - 10 * f, y + 6);
    g.lineTo(x, y + 14); g.lineTo(x + 10 * f, y + 6); g.lineTo(x + 10 * f, y - 10);
    g.closePath(); g.fillPath();
    g.lineStyle(1, 0xffffff, 0.5);
    g.beginPath();
    g.moveTo(x, y - 14); g.lineTo(x - 10 * f, y - 10); g.lineTo(x - 10 * f, y + 6);
    g.lineTo(x, y + 14); g.lineTo(x + 10 * f, y + 6); g.lineTo(x + 10 * f, y - 10);
    g.closePath(); g.strokePath();
    g.fillStyle(0xffffff, 0.2);
    g.fillCircle(x, y - 2, 3);
    this.tweens.add({ targets: g, scaleX: 1.5, scaleY: 1.3, alpha: 0, duration: 200, onComplete: () => g.destroy() });
  }

  spawnBuffIcon(target, type, color, durationMs) {
    if (this.isTrueHitboxView()) return;
    if (!target || !target.active) return;
    const iconColor = color || 0xffffff;
    const px = target.x;
    const py = target.y - 42;
    const dur = durationMs || 800;

    const glow = this.add.circle(px, py, 8, iconColor, 0.2);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    glow.setDepth(DEPTH.PLAYER_FX + 1);
    this.tweens.add({ targets: glow, y: py - 14, scaleX: 1.5, scaleY: 1.5, alpha: 0, duration: dur * 0.7, onComplete: () => glow.destroy() });

    let icon;
    if (type === "shield") {
      const g = this.add.graphics();
      g.fillStyle(iconColor, 0.9);
      g.beginPath();
      g.moveTo(0, -8); g.lineTo(-6, -5); g.lineTo(-6, 3); g.lineTo(0, 8); g.lineTo(6, 3); g.lineTo(6, -5);
      g.closePath(); g.fillPath();
      g.lineStyle(1, 0xffffff, 0.7);
      g.beginPath();
      g.moveTo(0, -8); g.lineTo(-6, -5); g.lineTo(-6, 3); g.lineTo(0, 8); g.lineTo(6, 3); g.lineTo(6, -5);
      g.closePath(); g.strokePath();
      g.fillStyle(0xffffff, 0.35);
      g.fillCircle(0, -1, 2.5);
      icon = this.add.container(px, py, [g]);
    } else {
      const vert = this.add.rectangle(0, 0, 3, 12, iconColor, 0.96);
      const horiz = this.add.rectangle(0, 0, 12, 3, iconColor, 0.96);
      const coreGlow = this.add.circle(0, 0, 3, 0xffffff, 0.4);
      icon = this.add.container(px, py, [coreGlow, vert, horiz]);
    }
    icon.setDepth(DEPTH.PLAYER_FX + 2);
    this.tweens.add({ targets: icon, y: py - 14, alpha: 0, duration: dur, onComplete: () => icon.destroy() });
  }

  spawnGroundCrack(x, y, color) {
    if (this.isTrueHitboxView()) return;
    const c = color || 0xc288ff;
    const crackG = this.add.graphics();
    crackG.setDepth(DEPTH.PLAYER_FX);

    const branches = [
      { dx: -1, ang: -15 }, { dx: 1, ang: 15 },
      { dx: -1, ang: -35 }, { dx: 1, ang: 35 },
      { dx: -1, ang: -5 }, { dx: 1, ang: 5 }
    ];
    branches.forEach(({ dx, ang }) => {
      const rad = Phaser.Math.DegToRad(ang);
      const len = Phaser.Math.Between(18, 38);
      const ex = x + Math.cos(rad) * len * dx;
      const ey = y + 2 + Math.sin(rad) * len * 0.3;
      crackG.lineStyle(3, c, 0.7);
      crackG.lineBetween(x, y + 2, ex, ey);
      crackG.lineStyle(1, 0xffffff, 0.35);
      crackG.lineBetween(x, y + 3, ex, ey + 1);
      if (len > 25) {
        const bx = ex + Math.cos(rad + dx * 0.4) * 10;
        const by = ey + Math.sin(rad + dx * 0.4) * 4;
        crackG.lineStyle(2, c, 0.4);
        crackG.lineBetween(ex, ey, bx, by);
      }
    });

    crackG.fillStyle(c, 0.3);
    crackG.fillCircle(x, y + 2, 5);
    crackG.fillStyle(0xffffff, 0.2);
    crackG.fillCircle(x, y + 2, 3);

    this.tweens.add({ targets: crackG, alpha: 0, duration: 350, delay: 60, onComplete: () => crackG.destroy() });

    for (let i = 0; i < 4; i++) {
      const px = x + Phaser.Math.Between(-20, 20);
      const chip = this.add.rectangle(px, y, Phaser.Math.Between(2, 4), Phaser.Math.Between(2, 4), c, 0.6);
      chip.setDepth(DEPTH.PLAYER_FX + 1);
      this.tweens.add({ targets: chip, y: y - Phaser.Math.Between(8, 20), alpha: 0, duration: 200 + i * 20, onComplete: () => chip.destroy() });
    }
  }

  spawnAuraPulse(x, y, color, radius, durationMs) {
    if (this.isTrueHitboxView()) return;
    const c = color || 0xffffff;
    const r = radius || 52;
    const dur = durationMs || 300;

    const pulse = this.add.circle(x, y, 8, c, 0.6);
    pulse.setStrokeStyle(3, 0xffffff, 0.65);
    pulse.setDepth(DEPTH.PLAYER_FX);
    this.tweens.add({ targets: pulse, radius: r, alpha: 0, duration: dur, ease: "Quad.easeOut", onComplete: () => pulse.destroy() });

    const inner = this.add.circle(x, y, 5, 0xffffff, 0.3);
    inner.setStrokeStyle(2, c, 0.4);
    inner.setDepth(DEPTH.PLAYER_FX);
    this.tweens.add({ targets: inner, radius: r * 0.65, alpha: 0, duration: dur * 0.8, delay: 20, ease: "Quad.easeOut", onComplete: () => inner.destroy() });
  }

  spawnTelegraph(x, width, color, durationMs) {
    if (this.isTrueHitboxView()) return;
    const marker = this.add.rectangle(x, 510, width || 10, 20, color, 0.05);
    marker.setDepth(DEPTH.BOSS_TELEGRAPH);
    this.tweens.add({
      targets: marker,
      alpha: 0.015,
      duration: durationMs || 180,
      yoyo: true,
      repeat: 1,
      onComplete: () => marker.destroy()
    });
  }

  spawnDangerZone(centerX, centerY, width, height, color, durationMs) {
    if (this.isTrueHitboxView()) return;
    const zone = this.add.rectangle(centerX, centerY, width, height, color || 0xff8b8b, 0.03);
    zone.setStrokeStyle(1, color || 0xff8b8b, 0.12);
    zone.setDepth(DEPTH.BOSS_TELEGRAPH);
    this.tweens.add({
      targets: zone,
      alpha: 0.06,
      duration: durationMs || 240,
      yoyo: true,
      repeat: 1,
      onComplete: () => zone.destroy()
    });
    return zone;
  }

  spawnRangeHint(startX, y, direction, range, color, height = 10, durationMs = 120) {
    const centerX = startX + direction * range * 0.5;
    return this.spawnDangerZone(centerX, y, range, height, color, durationMs);
  }

  spawnLineTelegraph(startX, y, direction, length, thickness, color, durationMs) {
    return this.spawnRangeHint(startX, y, direction, length, color, thickness || 10, durationMs || 120);
  }

  spawnFanTelegraph(x, y, direction, radius, spreadDeg, color, durationMs) {
    return this.spawnFanStrikeVisual(x, y, direction, radius, spreadDeg, color, durationMs || 160);
  }

  createRectHitbox(centerX, centerY, width, height) {
    return new Phaser.Geom.Rectangle(centerX - width * 0.5, centerY - height * 0.5, width, height);
  }

  createCircleHitbox(centerX, centerY, radius) {
    return new Phaser.Geom.Circle(centerX, centerY, radius);
  }

  getBodyHitbox(target) {
    if (target && target.body) {
      return new Phaser.Geom.Rectangle(target.body.x, target.body.y, target.body.width, target.body.height);
    }
    return new Phaser.Geom.Rectangle((target?.x || 0) - 10, (target?.y || 0) - 10, 20, 20);
  }

  rectHitsTarget(rect, target) {
    if (!rect || !target || !target.active) return false;
    const targetRect = this.getBodyHitbox(target);
    return Phaser.Geom.Intersects.RectangleToRectangle(rect, targetRect);
  }

  circleHitsTarget(circle, target) {
    if (!circle || !target || !target.active) return false;
    const rect = this.getBodyHitbox(target);
    const nearestX = Phaser.Math.Clamp(circle.x, rect.left, rect.right);
    const nearestY = Phaser.Math.Clamp(circle.y, rect.top, rect.bottom);
    return Phaser.Math.Distance.Between(circle.x, circle.y, nearestX, nearestY) <= circle.radius;
  }

  isHollowPairFight() {
    return this.boss?.definition?.id === "hollowPair" && this.bossTwin?.active;
  }

  /** Returns boss or flying twin if rect hits either (shared HP — damage once via either). */
  rectHitsAnyBoss(rect) {
    if (!this.boss?.active) return null;
    if (this.rectHitsTarget(rect, this.boss)) return this.boss;
    if (this.isHollowPairFight() && this.rectHitsTarget(rect, this.bossTwin)) return this.bossTwin;
    return null;
  }

  circleHitsAnyBoss(circle) {
    if (!this.boss?.active) return null;
    if (this.circleHitsTarget(circle, this.boss)) return this.boss;
    if (this.isHollowPairFight() && this.circleHitsTarget(circle, this.bossTwin)) return this.bossTwin;
    return null;
  }

  /** Boss/twin OR any active damageable summon. */
  rectHitsAnyEnemy(rect) {
    const bossHit = this.rectHitsAnyBoss(rect);
    if (bossHit) return bossHit;
    const adds = typeof this.getDamageableSummonTargets === "function" ? this.getDamageableSummonTargets() : [];
    for (let i = 0; i < adds.length; i += 1) {
      const a = adds[i];
      if (a?.active && a.isAlive && this.rectHitsTarget(rect, a)) return a;
    }
    return null;
  }

  /** Boss/twin OR any active damageable summon. */
  circleHitsAnyEnemy(circle) {
    const bossHit = this.circleHitsAnyBoss(circle);
    if (bossHit) return bossHit;
    const adds = typeof this.getDamageableSummonTargets === "function" ? this.getDamageableSummonTargets() : [];
    for (let i = 0; i < adds.length; i += 1) {
      const a = adds[i];
      if (a?.active && a.isAlive && this.circleHitsTarget(circle, a)) return a;
    }
    return null;
  }

  /** Boss/twin OR any active damageable summon. */
  fanHitsAnyEnemy(originX, originY, direction, radius, spreadDeg, options = {}) {
    const bossHit = typeof this.fanHitsAnyBoss === "function"
      ? this.fanHitsAnyBoss(originX, originY, direction, radius, spreadDeg, options)
      : null;
    if (bossHit) return bossHit;
    const adds = typeof this.getDamageableSummonTargets === "function" ? this.getDamageableSummonTargets() : [];
    for (let i = 0; i < adds.length; i += 1) {
      const a = adds[i];
      if (a?.active && a.isAlive && this.fanHitsTarget(originX, originY, direction, radius, spreadDeg, a, options)) return a;
    }
    return null;
  }

  /** Damageable non-boss enemy targets (boss summons, etc.). */
  getDamageableSummonTargets() {
    const out = [];
    // Grave Warden summons
    const gw = this.graveWardenSummons;
    if (gw?.graves?.length) {
      gw.graves.forEach((e) => { if (e?.sprite?.active && e.sprite.isAlive) out.push(e.sprite); });
    }
    if (gw?.phantoms?.length) {
      gw.phantoms.forEach((e) => { if (e?.sprite?.active && e.sprite.isAlive) out.push(e.sprite); });
    }
    if (gw?.brutes?.length) {
      gw.brutes.forEach((e) => { if (e?.sprite?.active && e.sprite.isAlive) out.push(e.sprite); });
    }
    return out;
  }

  fanHitsAnyBoss(originX, originY, direction, radius, spreadDeg, options = {}) {
    if (!this.boss?.active) return null;
    if (this.fanHitsTarget(originX, originY, direction, radius, spreadDeg, this.boss, options)) return this.boss;
    if (this.isHollowPairFight() && this.fanHitsTarget(originX, originY, direction, radius, spreadDeg, this.bossTwin, options)) {
      return this.bossTwin;
    }
    return null;
  }

  distanceToNearestBossAnchor(px, py) {
    if (!this.boss?.active) return 0;
    const bh = this.boss.body?.height ? this.boss.body.height * 0.35 : 20;
    const by = this.boss.y - bh;
    let best = Phaser.Math.Distance.Between(px, py, this.boss.x, by);
    if (this.isHollowPairFight()) {
      const th = this.bossTwin.body?.height ? this.bossTwin.body.height * 0.35 : 20;
      const ty = this.bossTwin.y - th;
      best = Math.min(best, Phaser.Math.Distance.Between(px, py, this.bossTwin.x, ty));
    }
    return best;
  }

  fanHitsTarget(originX, originY, direction, radius, spreadDeg, target, options = {}) {
    if (!target || !target.active) return false;
    if (!Number.isFinite(originX) || !Number.isFinite(originY)) return false;
    const safeRadius = Number.isFinite(radius) ? Math.max(1, radius) : 1;
    const safeSpread = Number.isFinite(spreadDeg) ? Math.max(1, spreadDeg) : 1;
    const radiusPad = Number.isFinite(options.radiusPadding) ? options.radiusPadding : 6;
    const anglePadDeg = Number.isFinite(options.anglePaddingDeg) ? options.anglePaddingDeg : 4;
    const maxRadius = safeRadius + Math.max(0, radiusPad);
    const halfSpread = Phaser.Math.DegToRad(safeSpread * 0.5 + Math.max(0, anglePadDeg));
    const facingAngle = direction >= 0 ? 0 : Math.PI;
    const rect = this.getBodyHitbox(target);

    if (Phaser.Geom.Rectangle.Contains(rect, originX, originY)) return true;

    const centerX = rect.x + rect.width * 0.5;
    const centerY = rect.y + rect.height * 0.5;
    const nearestX = Phaser.Math.Clamp(originX, rect.left, rect.right);
    const nearestY = Phaser.Math.Clamp(originY, rect.top, rect.bottom);
    const points = [
      { x: centerX, y: centerY },
      { x: rect.left, y: rect.top },
      { x: rect.right, y: rect.top },
      { x: rect.left, y: rect.bottom },
      { x: rect.right, y: rect.bottom },
      { x: rect.left, y: centerY },
      { x: rect.right, y: centerY },
      { x: centerX, y: rect.top },
      { x: centerX, y: rect.bottom },
      { x: rect.left + rect.width * 0.25, y: rect.top },
      { x: rect.left + rect.width * 0.75, y: rect.top },
      { x: rect.left + rect.width * 0.25, y: rect.bottom },
      { x: rect.left + rect.width * 0.75, y: rect.bottom },
      { x: nearestX, y: nearestY }
    ];

    return points.some((point) => {
      const dx = point.x - originX;
      const dy = point.y - originY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > maxRadius) return false;
      const angle = Math.atan2(dy, dx);
      const relative = Phaser.Math.Angle.Wrap(angle - facingAngle);
      return Math.abs(relative) <= halfSpread;
    });
  }

  spawnRectHitboxOverlay(rect, color, durationMs = 100) {
    this.spawnRectStrikeVisual(rect, color, { durationMs });
  }

  spawnCircleHitboxOverlay(circle, color, durationMs = 120) {
    this.spawnCircleStrikeVisual(circle, color, { durationMs });
  }

  spawnDashTelegraph(startX, y, direction, length, color, durationMs) {
    return this.spawnDashStreak(startX, y, direction, length, color || 0xcf7cff, durationMs || 220);
  }

  getBossNavGraph() {
    if (this.bossNavGraph && this.bossNavGraph.nodes?.length) return this.bossNavGraph;
    if (this.platforms?.getChildren?.()?.length) {
      this.bossNavGraph = this.buildBossNavGraphFromPlatforms();
      if (this.bossNavGraph?.nodes?.length) return this.bossNavGraph;
    }
    const fallbackNodes = [
      { id: "floor_left", x: 120, y: 500 },
      { id: "floor_mid", x: 470, y: 500 },
      { id: "floor_right", x: 840, y: 500 },
      { id: "plat1", x: 220, y: 402 },
      { id: "plat2", x: 510, y: 348 },
      { id: "plat3", x: 780, y: 302 }
    ];
    this.bossNavGraph = this.buildBossNavGraphFromNodes(fallbackNodes);
    return this.bossNavGraph;
  }

  getBattlePlayerBySlot(slot) {
    return this.players.find((p) => p.label === `P${slot}`) || null;
  }

  buildBattlePauseHelpText(player) {
    if (!player?.definition) {
      return "No character data.";
    }
    const def = player.definition;
    const slot = player.label === "P2" ? 2 : 1;
    const getKeys = typeof window.getPlayerCombatKeys === "function" ? window.getPlayerCombatKeys : null;
    const fmt = typeof window.formatCombatKeyCode === "function" ? window.formatCombatKeyCode : (c) => String(c);
    const keys = getKeys ? getKeys(slot) : {};
    const atk = fmt(keys.attack);
    const ab = fmt(keys.ability);
    const ut = fmt(keys.utility);
    const ctrls =
      slot === 2
        ? `Move: Left / Right  ·  Jump: Up  ·  Attack: ${atk}  ·  Ability: ${ab}  ·  Utility: ${ut}`
        : `Move: A / D  ·  Jump: W  ·  Attack: ${atk}  ·  Ability: ${ab}  ·  Utility: ${ut}`;
    const lines = [
      def.name,
      "",
      def.blurb || "",
      "",
      "CONTROLS",
      ctrls,
      "",
      `BASIC — ${def.basicAttack.name}`,
      def.basicAttack.description || "",
      `Damage ${def.basicAttack.damage} · Cooldown ${def.basicAttack.cooldownMs} ms`,
      "",
      `ABILITY — ${def.ability.name}`,
      def.ability.description || "",
      `Cooldown ${(def.ability.cooldownMs / 1000).toFixed(1)} s`
    ];
    if (def.utility) {
      lines.push(
        "",
        `UTILITY — ${def.utility.name}`,
        def.utility.description || "",
        `Cooldown ${(def.utility.cooldownMs / 1000).toFixed(1)} s`
      );
    }
    return lines.join("\n");
  }

  refreshBattlePauseContent() {
    if (!this.battlePauseContent) return;
    if (this.battlePauseTab === "p1") {
      const p = this.getBattlePlayerBySlot(1);
      this.battlePauseContent.setText(p ? this.buildBattlePauseHelpText(p) : "No player one.");
    } else if (this.battlePauseTab === "p2") {
      const p = this.getBattlePlayerBySlot(2);
      this.battlePauseContent.setText(
        p ? this.buildBattlePauseHelpText(p) : "No second player in this match."
      );
    } else {
      this.battlePauseContent.setText(
        "Return to the main menu?\n\nYour current battle will end without saving progress."
      );
    }
    const showExit = this.battlePauseTab === "exit";
    if (this.battlePauseExitGroup) {
      this.battlePauseExitGroup.setVisible(showExit);
      if (this.battlePauseExitGroup._exitLabel) {
        this.battlePauseExitGroup._exitLabel.setVisible(showExit);
      }
    }
    if (this.battlePauseTabButtons) {
      this.battlePauseTabButtons.forEach((row) => {
        const on = row.tabId === this.battlePauseTab;
        row.rect.setFillStyle(on ? 0x243d62 : 0x152238, 0.96);
        row.rect.setStrokeStyle(2, on ? 0x9ec8ff : 0x5e88c6, on ? 1 : 0.85);
      });
    }
  }

  setBattlePauseTab(tab) {
    this.battlePauseTab = tab;
    this.refreshBattlePauseContent();
  }

  createBattlePauseMenu() {
    const z = 9200;
    const W = this.scale.width;
    const H = this.scale.height;
    const all = [];

    const dim = this.add.rectangle(W * 0.5, H * 0.5, W + 4, H + 4, 0x040810, 0.74).setScrollFactor(0).setDepth(z);
    dim.setInteractive();
    all.push(dim);

    const panelW = 688;
    const panelH = 452;
    const panelCx = W * 0.5;
    const panelCy = H * 0.5 + 6;
    const panelTop = panelCy - panelH * 0.5;

    const panel = this.add
      .rectangle(panelCx, panelCy, panelW, panelH, 0x101828, 0.97)
      .setScrollFactor(0)
      .setDepth(z + 1);
    panel.setStrokeStyle(2, 0x5e88c6, 0.92);
    all.push(panel);

    const title = this.add
      .text(panelCx, panelTop + 36, "PAUSED", {
        fontSize: "22px",
        color: "#e8f2ff",
        fontStyle: "bold",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(z + 2);
    all.push(title);

    const sub = this.add
      .text(panelCx, panelTop + 68, "Field manual · Press ESC again to resume", {
        fontSize: "11px",
        color: "#8fa8c8",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(z + 2);
    all.push(sub);

    const tabY = panelTop + 104;
    const tabW1 = 168;
    const tabW2 = 168;
    const tabW3 = 188;
    const tabGap = 10;
    const tabRowW = tabW1 + tabGap + tabW2 + tabGap + tabW3;
    const tabStartX = panelCx - tabRowW * 0.5;
    const mkTab = (cx, tabId, label, tw) => {
      const rect = this.add.rectangle(cx, tabY, tw, 36, 0x152238, 0.96).setScrollFactor(0).setDepth(z + 2);
      rect.setStrokeStyle(2, 0x5e88c6, 0.88);
      rect.setInteractive({ useHandCursor: true });
      const txt = this.add.text(cx, tabY, label, {
        fontSize: "11px",
        color: "#dde8ff",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      }).setOrigin(0.5).setScrollFactor(0).setDepth(z + 3);
      rect.on("pointerover", () => {
        if (this.battlePauseTab !== tabId) rect.setFillStyle(0x1a2d48, 0.98);
      });
      rect.on("pointerout", () => this.refreshBattlePauseContent());
      rect.on("pointerdown", () => this.setBattlePauseTab(tabId));
      all.push(rect, txt);
      return { rect, txt, tabId };
    };

    const t1cx = tabStartX + tabW1 * 0.5;
    const t2cx = tabStartX + tabW1 + tabGap + tabW2 * 0.5;
    const t3cx = tabStartX + tabW1 + tabGap + tabW2 + tabGap + tabW3 * 0.5;
    this.battlePauseTabButtons = [
      mkTab(t1cx, "p1", "Player 1", tabW1),
      mkTab(t2cx, "p2", "Player 2", tabW2),
      mkTab(t3cx, "exit", "Back to menu", tabW3)
    ];

    const contentTopY = panelTop + 138;
    this.battlePauseContent = this.add
      .text(panelCx, contentTopY, "", {
        fontSize: "12px",
        color: "#d7e7ff",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace",
        wordWrap: { width: panelW - 56, useAdvancedWrap: true },
        lineSpacing: 5
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(z + 2);
    all.push(this.battlePauseContent);

    const exitY = panelTop + panelH - 36;
    const exitBg = this.add.rectangle(panelCx, exitY, 300, 42, 0x3a2020, 0.95).setScrollFactor(0).setDepth(z + 2);
    exitBg.setStrokeStyle(2, 0xc07070, 0.9);
    exitBg.setInteractive({ useHandCursor: true });
    const exitTx = this.add.text(W * 0.5, exitY, "Confirm exit to main menu", {
      fontSize: "13px",
      color: "#ffd0d0",
      fontStyle: "bold",
      fontFamily: "Consolas, Monaco, 'Courier New', monospace"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(z + 3);
    exitBg.on("pointerover", () => exitBg.setFillStyle(0x4a2828, 0.98));
    exitBg.on("pointerout", () => exitBg.setFillStyle(0x3a2020, 0.95));
    exitBg.on("pointerdown", () => {
      this.physics.resume();
      this.time.paused = false;
      this.scene.start("MainMenuScene");
    });
    all.push(exitBg, exitTx);

    this.battlePauseExitGroup = exitBg;
    this.battlePauseExitGroup._exitLabel = exitTx;

    this.battlePauseObjects = all;
    this.refreshBattlePauseContent();
    all.forEach((o) => {
      if (o && o.setVisible) o.setVisible(false);
    });
  }

  setBattlePauseUiVisible(visible) {
    if (this.battlePauseObjects) {
      this.battlePauseObjects.forEach((o) => {
        if (o && o.setVisible) o.setVisible(visible);
      });
    }
    if (visible) {
      this.refreshBattlePauseContent();
    }
  }

  openBattlePauseMenu() {
    if (!this.battlePauseObjects) {
      this.createBattlePauseMenu();
    }
    this.setBattlePauseUiVisible(true);
    this.battlePauseMenuOpen = true;
    this.physics.pause();
    this.time.paused = true;
  }

  closeBattlePauseMenu() {
    this.battlePauseMenuOpen = false;
    this.setBattlePauseUiVisible(false);
    this.physics.resume();
    this.time.paused = false;
  }
}

window.BattleScene = BattleScene;
