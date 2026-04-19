/** Bright red tint when this hero takes damage (ignores attack color for readability). */
const PLAYER_DAMAGE_FLASH_COLOR = 0xff6a6a;
const PLAYER_DAMAGE_FLASH_MS = 170;

class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, definition, controls, textureKey, label) {
    super(scene, x, y, textureKey);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.scene = scene;
    this.definition = definition;
    this.controls = controls;
    this.label = label;
    this.facing = 1;
    this.maxHealth = definition.maxHealth;
    this.health = definition.maxHealth;
    this.isAlive = true;
    this.nextAttackTime = 0;
    this.nextAbilityTime = 0;
    this.nextUtilityTime = 0;
    this.parryActiveUntil = 0;
    this.parryMeleeStunMs = 2000;
    this.damageMultiplier = 1;
    this.damageReductionEffects = [];
    /** Temporary outgoing damage multipliers (e.g. Soulcaller rally) — separate from incoming DR. */
    this.outgoingDamageBuffs = [];
    this.movementLockUntil = 0;
    this.movementLockType = null;
    this.invulnerableUntil = 0;
    /** Brief window after Gale seeker snap where boss contact damage is ignored. */
    this.bossContactGraceUntil = 0;
    this.wraithPlatformPassUntil = 0;
    this.vanguardSpearState = definition.id === "vanguard" ? "idle" : null;
    this.vanguardSpearG = null;
    this.strikerTwinBladesDoubleNext = false;
    this.strikerBlinkEvadeUntil = 0;
    this.strikerEvadeAmpGranted = false;
    this.strikerAmpAuraG = null;
    this.strikerAmpPartAcc = 0;
    this.abilityChargeActive = false;
    this.abilityChargeStartedAt = 0;
    this.abilityChargeNeedKeyRelease = false;
    this.rangerChargeNotch = -1;
    this.soulShroudActive = false;
    this.soulShroudExpiresAt = 0;
    this.soulShroudDecoy = null;
    /** After soul-link projectile hits an ally: fully hidden, no attacks until shroud ends. */
    this.soulShroudSoulLinked = false;
    this.soulLinkAlly = null;
    this.speedBuffs = [];

    this.setScale(0.66);
    this.body.setSize(Math.ceil(30 / 0.66), Math.ceil(46 / 0.66), false);
    this.body.setOffset(11, 11);
    this.setCollideWorldBounds(true);
    this.setBounce(0.01);
  }

  update(time, boss, activePlayers) {
    if (!this.isAlive) return;
    this.updateDamageReduction(time);
    this.updateOutgoingDamageBuffs(time);
    if (time >= this.movementLockUntil) {
      this.movementLockType = null;
    }

    const moveLeft = this.controls.left.isDown;
    const moveRight = this.controls.right.isDown;
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.controls.jump);
    const attackPressed = Phaser.Input.Keyboard.JustDown(this.controls.attack);
    const abilityPressed = Phaser.Input.Keyboard.JustDown(this.controls.ability);
    const utilityPressed = this.controls.utility && Phaser.Input.Keyboard.JustDown(this.controls.utility);

    const isMovementLocked = time < this.movementLockUntil;
    const shroudRoot = this.soulShroudActive;
    if (shroudRoot) {
      this.setVelocity(0, 0);
      if (Number.isFinite(this.soulShroudExpiresAt)) {
        this.invulnerableUntil = this.soulShroudExpiresAt;
      }
    }

    const effSpeed = this.definition.speed * this.getSpeedMultiplier();
    if (!isMovementLocked && !shroudRoot && moveLeft) {
      this.setVelocityX(-effSpeed);
      this.facing = -1;
    } else if (!isMovementLocked && !shroudRoot && moveRight) {
      this.setVelocityX(effSpeed);
      this.facing = 1;
    } else if (isMovementLocked) {
      if (this.movementLockType === "root") {
        this.setVelocityX(0);
      }
    } else if (!shroudRoot) {
      this.setVelocityX(0);
    }

    if (!isMovementLocked && !shroudRoot && jumpPressed && this.body.blocked.down) {
      this.setVelocityY(-this.definition.jumpPower);
    }

    const isSpiritBolt = this.definition.basicAttack?.type === "spiritBolt";
    if (!isMovementLocked && attackPressed && time >= this.nextAttackTime) {
      this.nextAttackTime = time + this.definition.basicAttack.cooldownMs;
      if (isSpiritBolt) {
        this.fireSpiritBolt(boss, activePlayers, false);
      } else {
        this.tryBasicAttack(boss);
      }
    }

    if (utilityPressed && (this.soulShroudActive || !isMovementLocked)) {
      if (this.soulShroudActive) {
        this.endSoulShroud(true);
      } else {
        window.AbilitySystem.trigger(this.scene, this, boss, activePlayers, "utility");
      }
    }

    if (this.soulShroudActive) {
      const dt = Number.isFinite(this.scene?.game?.loop?.delta) ? this.scene.game.loop.delta : 16.67;
      this.nextUtilityTime += dt;
      if (time >= this.soulShroudExpiresAt) {
        this.endSoulShroud(false);
      }
    }

    const chargeAbility = this.definition.ability?.type === "chargeShot";
    const abilKey = this.controls.ability;
    if (!isMovementLocked && !this.soulShroudActive && chargeAbility && abilKey && time >= this.nextAbilityTime) {
      if (this.abilityChargeNeedKeyRelease) {
        if (!abilKey.isDown) {
          this.abilityChargeNeedKeyRelease = false;
        }
      } else if (abilKey.isDown) {
        if (!this.abilityChargeActive) {
          this.abilityChargeActive = true;
          this.abilityChargeStartedAt = time;
          this.rangerChargeNotch = -1;
        } else {
          const maxC = this.definition.ability.tuning?.chargeMsMax || 720;
          if (time - this.abilityChargeStartedAt >= maxC) {
            window.AbilitySystem.chargeShotRelease(this.scene, this, boss, activePlayers, maxC);
            this.nextAbilityTime = time + this.definition.ability.cooldownMs;
            this.abilityChargeActive = false;
            this.rangerChargeNotch = -1;
            if (abilKey.isDown) {
              this.abilityChargeNeedKeyRelease = true;
            }
          }
        }
      } else if (this.abilityChargeActive && !abilKey.isDown) {
        const dur = time - this.abilityChargeStartedAt;
        const minC = this.definition.ability.tuning?.minChargeMs ?? 90;
        this.abilityChargeActive = false;
        this.rangerChargeNotch = -1;
        if (dur >= minC) {
          window.AbilitySystem.chargeShotRelease(this.scene, this, boss, activePlayers, dur);
          this.nextAbilityTime = time + this.definition.ability.cooldownMs;
        }
      }
      if (this.abilityChargeActive && this.scene?.spawnMuzzleFlash) {
        const maxC = this.definition.ability.tuning?.chargeMsMax || 720;
        const t = Phaser.Math.Clamp((time - this.abilityChargeStartedAt) / maxC, 0, 1);
        const notch = Math.floor(t * 5);
        if (notch > this.rangerChargeNotch) {
          this.rangerChargeNotch = notch;
          this.scene.spawnMuzzleFlash(this.x + this.facing * 16, this.y - 10, 0xf7d95c, "arrow");
        }
      }
    } else if (!isMovementLocked && !this.soulShroudActive && abilityPressed && !chargeAbility) {
      window.AbilitySystem.trigger(this.scene, this, boss, activePlayers, "ability");
    }

    if (this.definition.id === "vanguard") {
      this.scene.drawVanguardIdleSpear(this);
    }
    if (this.definition.id === "striker" && this.strikerTwinBladesDoubleNext && this.strikerAmpAuraG) {
      if (typeof this.scene.drawStrikerEvadeAmpAura === "function") {
        this.scene.drawStrikerEvadeAmpAura(this);
      } else {
        const g = this.strikerAmpAuraG;
        g.clear();
        g.lineStyle(2.5, 0xb968ff, 0.92);
        g.strokeEllipse(this.x, this.y - 14, 54, 42);
      }
      this.strikerAmpPartAcc = (this.strikerAmpPartAcc || 0) + 16;
      if (this.strikerAmpPartAcc > 48 && typeof this.scene.spawnStrikerEvadeAmpParticle === "function") {
        this.strikerAmpPartAcc = 0;
        this.scene.spawnStrikerEvadeAmpParticle(this);
      }
    } else {
      this.strikerAmpPartAcc = 0;
    }
  }

  tryBasicAttack(boss) {
    if (this.soulShroudSoulLinked) return;
    if (!boss || !boss.active) return;
    const basicAttack = this.definition.basicAttack || {};
    const type = basicAttack.type || "spearThrust";

    switch (type) {
      case "pulseBolt":
        this.scene.spawnPlayerProjectile(this.x, this.y - this.getAttackTuningValue(basicAttack, "projectileOffsetY", 4), this.facing, basicAttack.damage, {
          speedX: this.getAttackTuningValue(basicAttack, "projectileSpeedX", 390),
          maxRange: basicAttack.range,
          effectColor: this.definition.color,
          style: "pulse",
          textureKey: "proj_medic",
          ownerPlayer: this,
          allyHeal: this.getAttackTuningValue(basicAttack, "allyHealOnHit", 0),
          medicResonance: true
        });
        break;
      case "arrowShot":
        this.scene.spawnPlayerProjectile(this.x, this.y - this.getAttackTuningValue(basicAttack, "projectileOffsetY", 10), this.facing, basicAttack.damage, {
          speedX: this.getAttackTuningValue(basicAttack, "projectileSpeedX", 560),
          maxRange: basicAttack.range,
          effectColor: this.definition.color,
          style: "arrow",
          textureKey: "proj_ranger",
          ownerPlayer: this
        });
        break;
      case "riftBolt":
        this.scene.spawnPlayerProjectile(
          this.x,
          this.y - this.getAttackTuningValue(basicAttack, "projectileOffsetY", 8),
          this.facing,
          basicAttack.damage,
          {
            speedX: this.getAttackTuningValue(basicAttack, "projectileSpeedX", 430),
            maxRange: basicAttack.range,
            effectColor: this.definition.color,
            style: "riftBolt",
            textureKey: "proj_summoner",
            ownerPlayer: this
          }
        );
        break;
      case "shieldCleave": {
        const cleaveSpread = this.getAttackTuningValue(basicAttack, "fanSpreadDeg", 125);
        this.scene.spawnShieldArcSwing(this, this.definition.color, {
          radius: Math.max(28, basicAttack.range * 0.82),
          spreadDeg: cleaveSpread,
          offsetX: 16,
          offsetY: -6,
          durationMs: 125
        });
        const struck = this.applyFanHit(
          boss,
          basicAttack.damage,
          basicAttack.range,
          cleaveSpread
        );
        if (struck && this.definition.id === "guardian") {
          const fortMult = this.getAttackTuningValue(basicAttack, "fortitudeMultiplier", 0.80);
          const fortMs = this.getAttackTuningValue(basicAttack, "fortitudeDurationMs", 3500);
          if (typeof this.applyTaggedDamageReduction === "function") {
            this.applyTaggedDamageReduction("guardianFortitude", fortMult, fortMs);
          }
          if (typeof this.scene.refreshGuardianFortitudeAura === "function") {
            this.scene.refreshGuardianFortitudeAura(this, fortMs);
          }
        }
        break;
      }
      case "doubleStrike": {
        const firstSwing = this.getAttackTuningObject(basicAttack, "firstSwing", { width: 38, height: 10, angle: 24, offsetX: 32, offsetY: -9, style: "double" });
        const secondSwing = this.getAttackTuningObject(basicAttack, "secondSwing", { width: 38, height: 10, angle: -16, offsetX: 30, offsetY: -9, style: "double" });
        const doubleVertical = this.getAttackTuningValue(basicAttack, "hitboxVerticalRange", 62);
        const doubleYOffset = this.getAttackTuningValue(basicAttack, "hitboxYOffset", -10);
        const secondDelayMs = this.getAttackTuningValue(basicAttack, "secondDelayMs", 90);
        const twinAmp = this.definition.id === "striker" && this.strikerTwinBladesDoubleNext;
        const strikeDmg = basicAttack.damage * (twinAmp ? 2 : 1);
        this.scene.spawnStrikerSwordBursts(this, this.definition.color, basicAttack.range, doubleYOffset, 0);
        this.applyMeleeHit(boss, strikeDmg, basicAttack.range, doubleVertical, false, 0, doubleYOffset, {
          angle: this.facing > 0 ? firstSwing.angle : -firstSwing.angle,
          durationMs: this.getAttackTuningValue(basicAttack, "strikeVisualDurationMs", 95)
        });
        this.scene.time.delayedCall(secondDelayMs, () => {
          if (!this.active || !this.isAlive || !boss || !boss.active) return;
          this.scene.spawnStrikerSwordBursts(this, this.definition.color, basicAttack.range, doubleYOffset, 1);
          this.applyMeleeHit(boss, strikeDmg, basicAttack.range, doubleVertical, false, 0, doubleYOffset, {
            angle: this.facing > 0 ? secondSwing.angle : -secondSwing.angle,
            durationMs: this.getAttackTuningValue(basicAttack, "strikeVisualDurationMs", 95)
          });
          if (twinAmp) {
            this.clearStrikerTwinAmp();
          }
        });
        break;
      }
      case "spearThrust":
      default: {
        const thrustSwing = this.getAttackTuningObject(
          basicAttack,
          "swing",
          { width: 62, height: 7, angle: 4, offsetX: 42, offsetY: -6, style: "thrust" }
        );
        this.vanguardSpearState = "thrust";
        const now = this.scene.time.now;
        const momentumWindow = this.getAttackTuningValue(basicAttack, "momentumWindowMs", 1200);
        const momentumDmgMul = this.getAttackTuningValue(basicAttack, "momentumDamageMult", 1.5);
        const momentumRngMul = this.getAttackTuningValue(basicAttack, "momentumRangeMult", 1.25);
        const momentumActive = Number.isFinite(this.vanguardMomentumUntil) && now < this.vanguardMomentumUntil;
        const dmgMul = momentumActive ? momentumDmgMul : 1;
        const rngMul = momentumActive ? momentumRngMul : 1;
        const atkRange = basicAttack.range * rngMul;
        const atkDamage = basicAttack.damage * dmgMul;
        const visLen = Math.max(26, atkRange + 4);
        this.scene.spawnSpearThrustVisual(this, momentumActive ? 0xcfe6ff : this.definition.color, {
          length: visLen,
          offsetX: Math.max(10, thrustSwing.offsetX - 24),
          offsetY: thrustSwing.offsetY,
          durationMs: this.getAttackTuningValue(basicAttack, "strikeVisualDurationMs", 95) + 10,
          onComplete: () => {
            if (this.active && this.definition.id === "vanguard") this.vanguardSpearState = "idle";
          }
        });
        const victim = this.applyMeleeHit(
          boss,
          atkDamage,
          atkRange,
          this.getAttackTuningValue(basicAttack, "hitboxVerticalRange", 54),
          false,
          0,
          this.getAttackTuningValue(basicAttack, "hitboxYOffset", -6),
          {
            angle: this.facing > 0 ? thrustSwing.angle : -thrustSwing.angle,
            durationMs: this.getAttackTuningValue(basicAttack, "strikeVisualDurationMs", 95)
          }
        );
        if (victim) {
          this.vanguardMomentumUntil = now + momentumWindow;
          if (momentumActive && typeof this.scene.spawnVanguardMomentumFlare === "function") {
            this.scene.spawnVanguardMomentumFlare(this, victim);
          }
          if (boss && victim === boss && typeof boss.applyVulnerability === "function") {
            const pMult = this.getAttackTuningValue(basicAttack, "pierceMult", 1.15);
            const pMs = this.getAttackTuningValue(basicAttack, "pierceDurationMs", 2500);
            boss.applyVulnerability(pMult, pMs);
            if (typeof this.scene.spawnVanguardPierceMark === "function") {
              this.scene.spawnVanguardPierceMark(boss);
            }
          }
          if (
            Number.isFinite(this.vanguardSkyfallenUntil)
            && now < this.vanguardSkyfallenUntil
            && Number.isFinite(this.vanguardSkyfallenMult)
            && Number.isFinite(this.vanguardSkyfallenDurationMs)
          ) {
            this.applyOutgoingDamageBuff(
              this.vanguardSkyfallenMult,
              this.vanguardSkyfallenDurationMs,
              "vanguardSkyfallen"
            );
            this.vanguardSkyfallenUntil = now + this.vanguardSkyfallenDurationMs;
          }
        }
        break;
      }
    }
  }

  getAttackTuningValue(basicAttack, key, fallback) {
    const tuning = basicAttack?.tuning || {};
    const value = tuning[key];
    return Number.isFinite(value) ? value : fallback;
  }

  getAttackTuningObject(basicAttack, key, fallback) {
    const tuning = basicAttack?.tuning || {};
    const value = tuning[key];
    if (!value || typeof value !== "object") return fallback;
    return { ...fallback, ...value };
  }

  applyMeleeHit(boss, damage, range, verticalRange, allowBehind, behindPad = 0, yOffset = 0, visuals = {}) {
    if (this.soulShroudActive) return;
    const forwardReach = Math.max(20, range);
    const backwardsReach = allowBehind ? Math.max(12, behindPad) : 0;
    const width = forwardReach + backwardsReach;
    const centerX = this.x + this.facing * (forwardReach - backwardsReach) * 0.5;
    const centerY = this.y + yOffset;
    const hitbox = this.scene.createRectHitbox(centerX, centerY, width, verticalRange * 2);
    this.scene.playRectAttackVisual(hitbox, this.definition.color, {
      durationMs: Number.isFinite(visuals.durationMs) ? visuals.durationMs : 95,
      angle: visuals.angle || 0,
      direction: this.facing,
      variant: this.definition.id
    });

    if (typeof this.scene.tryBatGaleWindSalvoProjectiles === "function") {
      this.scene.tryBatGaleWindSalvoProjectiles(this, hitbox);
    }

    const twin =
      typeof this.scene.isHollowPairFight === "function" && this.scene.isHollowPairFight()
        ? this.scene.bossTwin
        : null;
    const hitBoss = this.scene.rectHitsTarget(hitbox, boss);
    const hitTwin = twin && this.scene.rectHitsTarget(hitbox, twin);
    const adds = typeof this.scene.getDamageableSummonTargets === "function" ? this.scene.getDamageableSummonTargets() : [];
    const hitAdd = adds.find((a) => a?.active && a.isAlive && this.scene.rectHitsTarget(hitbox, a)) || null;
    if (!hitBoss && !hitTwin && !hitAdd) return null;

    const victim = hitBoss ? boss : hitTwin ? twin : hitAdd;
    const outDmg = this.scaleOutgoingDamageToBoss(damage);
    if (victim && typeof victim.takeDamage === "function") {
      victim.takeDamage(outDmg, this.definition.color);
    } else {
      return null;
    }

    let ix = victim.x;
    let iy = victim.y - 14;
    if (hitBoss && hitTwin) {
      ix = (boss.x + twin.x) * 0.5;
      iy = (boss.y + twin.y) * 0.5 - 14;
    }
    this.scene.spawnImpactEffect(ix, iy, this.definition.color, 22);
    this.flash(0xffffff);
    return victim;
  }

  applyFanHit(boss, damage, radius, spreadDeg) {
    if (this.soulShroudActive) return;
    const hitRadius = Math.max(20, radius);
    this.scene.playFanAttackVisual(this.x, this.y - 2, this.facing, hitRadius, spreadDeg, this.definition.color, 100, this.definition.id);

    if (typeof this.scene.tryBatGaleWindSalvoProjectilesFan === "function") {
      this.scene.tryBatGaleWindSalvoProjectilesFan(this, this.x, this.y - 2, this.facing, hitRadius, spreadDeg);
    }

    let struck =
      typeof this.scene.fanHitsAnyBoss === "function"
        ? this.scene.fanHitsAnyBoss(this.x, this.y - 2, this.facing, hitRadius, spreadDeg)
        : this.scene.fanHitsTarget(this.x, this.y - 2, this.facing, hitRadius, spreadDeg, boss)
          ? boss
          : null;
    if (!struck && typeof this.scene.getDamageableSummonTargets === "function") {
      const adds = this.scene.getDamageableSummonTargets();
      struck = adds.find((a) => a?.active && a.isAlive && this.scene.fanHitsTarget(this.x, this.y - 2, this.facing, hitRadius, spreadDeg, a)) || null;
    }
    if (!struck) return null;

    if (typeof struck.takeDamage !== "function") return null;
    struck.takeDamage(this.scaleOutgoingDamageToBoss(damage), this.definition.color);
    this.scene.spawnImpactEffect(struck.x, struck.y - 14, this.definition.color, 22);
    this.flash(0xffffff);
    return struck;
  }

  takeDamage(amount, hitColor, meta) {
    if (!this.isAlive) return 0;
    const now = this.scene?.time?.now ?? 0;
    if (this.movementLockType === "dash" && now < this.movementLockUntil) return 0;
    if (meta && this.definition.id === "guardian" && now < this.parryActiveUntil) {
      const kind = meta.attackKind;
      if (kind === "projectile" && meta.projectile && this.scene.reflectBossProjectile) {
        this.scene.reflectBossProjectile(meta.projectile, this);
        this.parryActiveUntil = 0;
        this.clearTint();
        this.grantAegisParryDrToAllies();
        return 0;
      }
      if ((kind === "melee" || kind === "contact") && meta.boss && typeof meta.boss.applyStun === "function") {
        meta.boss.applyStun(this.parryMeleeStunMs || 2000);
        this.parryActiveUntil = 0;
        this.clearTint();
        this.grantAegisParryDrToAllies();
        if (typeof this.scene.spawnParrySuccessVfx === "function") {
          this.scene.spawnParrySuccessVfx(this, meta.boss, "melee");
        } else {
          this.scene.spawnImpactEffect(this.x, this.y - 18, 0xffffff, 26);
        }
        return 0;
      }
    }
    if (this.invulnerableUntil && now < this.invulnerableUntil) {
      if (
        this.definition.id === "striker"
        && Number.isFinite(this.strikerBlinkEvadeUntil)
        && now < this.strikerBlinkEvadeUntil
        && meta?.attackKind !== "contact"
      ) {
        this.applyStrikerBlinkEvadeAmp();
      }
      return 0;
    }
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    const safeMultiplier = Number.isFinite(this.damageMultiplier) && this.damageMultiplier > 0
      ? this.damageMultiplier
      : 1;
    const applied = Math.max(0, Math.ceil(safeAmount * safeMultiplier));
    if (applied <= 0) return 0;
    this.health = Math.max(0, this.health - applied);
    if (!Number.isFinite(this.health)) {
      this.health = this.maxHealth;
    }
    this.flash(PLAYER_DAMAGE_FLASH_COLOR, PLAYER_DAMAGE_FLASH_MS);
    if (meta?.bossKnockbackX && this.body) {
      const kx = Phaser.Math.Clamp(meta.bossKnockbackX, -980, 980);
      this.setVelocityX(Phaser.Math.Clamp(this.body.velocity.x + kx, -920, 920));
    }
    if (this.health <= 0) {
      this.clearStrikerTwinAmp();
      this.isAlive = false;
      this.movementLockUntil = 0;
      this.movementLockType = null;
      this.setTint(0x333333);
      this.setVelocity(0, 0);
      if (this.body) this.body.enable = false;
    }
    return applied;
  }

  updateDamageReduction(time) {
    if (!this.damageReductionEffects.length) {
      this.damageMultiplier = 1;
      return;
    }
    this.damageReductionEffects = this.damageReductionEffects.filter((effect) => (
      effect
      && Number.isFinite(effect.expiresAt)
      && effect.expiresAt > time
      && Number.isFinite(effect.multiplier)
      && effect.multiplier > 0
    ));
    if (!this.damageReductionEffects.length) {
      this.damageMultiplier = 1;
      return;
    }
    this.damageMultiplier = this.damageReductionEffects.reduce(
      (best, effect) => Math.min(best, Phaser.Math.Clamp(effect.multiplier, 0.05, 1)),
      1
    );
  }

  updateOutgoingDamageBuffs(time) {
    if (!this.outgoingDamageBuffs?.length) return;
    this.outgoingDamageBuffs = this.outgoingDamageBuffs.filter(
      (e) => e && Number.isFinite(e.expiresAt) && e.expiresAt > time && Number.isFinite(e.mult) && e.mult > 0
    );
  }

  getOutgoingDamageMultiplier() {
    if (!this.outgoingDamageBuffs?.length) return 1;
    return this.outgoingDamageBuffs.reduce((prod, e) => prod * Phaser.Math.Clamp(e.mult, 1, 3), 1);
  }

  applyOutgoingDamageBuff(mult, durationMs, tag) {
    if (!Number.isFinite(mult) || mult < 1) return;
    const now = this.scene.time.now;
    const safe = Phaser.Math.Clamp(mult, 1, 2.5);
    const ms = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
    if (tag) {
      this.outgoingDamageBuffs = this.outgoingDamageBuffs.filter((e) => e && e.tag !== tag);
    }
    this.outgoingDamageBuffs.push({ mult: safe, expiresAt: now + ms, tag: tag || null });
  }

  scaleOutgoingDamageToBoss(base) {
    const b = Number.isFinite(base) ? base : 0;
    const m = this.getOutgoingDamageMultiplier();
    return Math.max(1, Math.round(b * m));
  }

  applyDamageReduction(multiplier, durationMs, tag) {
    if (!Number.isFinite(multiplier) || multiplier <= 0) return;
    const now = this.scene.time.now;
    const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
    const safeMultiplier = Phaser.Math.Clamp(multiplier, 0.05, 1);
    if (tag) {
      this.damageReductionEffects = this.damageReductionEffects.filter((e) => e && e.tag !== tag);
    }
    this.damageReductionEffects.push({
      multiplier: safeMultiplier,
      expiresAt: now + safeDuration,
      tag: tag || null
    });
    this.updateDamageReduction(now);
  }

  applyTaggedDamageReduction(tag, multiplier, durationMs) {
    this.applyDamageReduction(multiplier, durationMs, tag);
  }

  grantAegisParryDrToAllies() {
    const util = this.definition.utility || {};
    const t = util.tuning || {};
    const mult = Number.isFinite(t.allyAegisMultiplier) ? t.allyAegisMultiplier : 0;
    const ms = Number.isFinite(t.allyAegisDurationMs) ? t.allyAegisDurationMs : 0;
    if (!(mult > 0 && mult < 1) || ms <= 0) return;
    const allies = this.scene?.players || [];
    for (let i = 0; i < allies.length; i += 1) {
      const a = allies[i];
      if (!a || a === this || !a.isAlive) continue;
      if (typeof a.applyTaggedDamageReduction === "function") {
        a.applyTaggedDamageReduction("guardianAegisParry", mult, ms);
      } else {
        a.applyDamageReduction(mult, ms);
      }
      if (typeof this.scene.spawnGuardianAegisParryAura === "function") {
        this.scene.spawnGuardianAegisParryAura(a, ms);
      }
    }
  }

  flash(color, durationMs = 120) {
    if (!this.active) return;
    this.setTint(color);
    if (!this.scene || !this.scene.time) return;
    const ms = Number.isFinite(durationMs) ? Math.max(40, durationMs) : 120;
    this.scene.time.delayedCall(ms, () => {
      if (this.active) this.clearTint();
    });
  }

  applyStrikerBlinkEvadeAmp() {
    if (this.definition.id !== "striker" || this.strikerEvadeAmpGranted) return;
    this.strikerEvadeAmpGranted = true;
    this.strikerTwinBladesDoubleNext = true;
    if (!this.strikerAmpAuraG && this.scene) {
      this.strikerAmpAuraG = this.scene.add.graphics();
      this.strikerAmpAuraG.setDepth(18);
    }
    if (this.scene && typeof this.scene.spawnImpactEffect === "function") {
      this.scene.spawnImpactEffect(this.x, this.y - 22, 0xc084fc, 18);
    }
  }

  clearStrikerTwinAmp() {
    this.strikerTwinBladesDoubleNext = false;
    this.strikerBlinkEvadeUntil = 0;
    this.strikerAmpPartAcc = 0;
    if (this.strikerAmpAuraG) {
      this.strikerAmpAuraG.destroy();
      this.strikerAmpAuraG = null;
    }
  }

  fireSpiritBolt(boss, activePlayers, _charged) {
    const ba = this.definition.basicAttack;
    const t = ba?.tuning || {};
    if (this.soulShroudSoulLinked) return;
    if (this.soulShroudActive) {
      const pool = activePlayers && activePlayers.length ? activePlayers : (this.scene?.players || []);
      const ally = pool.find((p) => p && p !== this && p.isAlive);
      if (ally && typeof this.scene.spawnSoulLinkProjectile === "function") {
        this.scene.spawnSoulLinkProjectile(this, ally);
      }
      return;
    }
    if (!boss || !boss.active) return;
    const dmg = ba.damage || 8;
    const spd = t.projectileSpeedX || 330;
    const oy = t.projectileOffsetY || -8;
    const homing = t.homingStrength || 0.06;
    const debuffM = t.debuffMult || 1.10;
    const debuffMs = t.debuffDurationMs || 2000;
    this.scene.spawnPlayerProjectile(this.x, this.y + oy, this.facing, dmg, {
      speedX: spd,
      maxRange: ba.range || 300,
      effectColor: this.definition.color,
      style: "spiritBolt",
      textureKey: "proj_summoner",
      ownerPlayer: this,
      spiritBoltHoming: true,
      spiritHomingStrength: homing,
      spiritDebuffMult: debuffM,
      spiritDebuffMs: debuffMs,
      spiritCharged: false
    });
  }

  startSoulShroud(durationMs) {
    this.soulShroudSoulLinked = false;
    this.soulLinkAlly = null;
    this.soulShroudActive = true;
    this.soulShroudStartedAt = this.scene.time.now;
    this.soulShroudDurationMs = durationMs;
    this.soulShroudExpiresAt = this.scene.time.now + durationMs;
    this.setAlpha(0);
    if (Number.isFinite(this.soulShroudExpiresAt)) {
      this.invulnerableUntil = this.soulShroudExpiresAt;
    }
  }

  onSoulLinkConnected(ally) {
    if (!ally?.active || !ally.isAlive) return;
    this.soulShroudSoulLinked = true;
    this.soulLinkAlly = ally;
    this.setAlpha(0);
    if (typeof this.scene?.removeSoulcallerDecoy === "function") {
      this.scene.removeSoulcallerDecoy(this);
    }
    this.soulShroudDecoy = null;
  }

  /**
   * @param {boolean} [earlyCancel] true = utility pressed to end early (explosion at respawn). false = timer expired.
   */
  endSoulShroud(earlyCancel = false) {
    if (!this.soulShroudActive) return;
    const now = this.scene?.time?.now ?? 0;
    const elapsed = now - (this.soulShroudStartedAt || now);
    const totalDur = this.soulShroudDurationMs || 6000;
    const timeFrac = Phaser.Math.Clamp(elapsed / totalDur, 0, 1);
    const allyFromLink = this.soulLinkAlly;
    const pool = this.scene?.players || [];
    const allyResolved =
      allyFromLink && allyFromLink.active && allyFromLink.isAlive
        ? allyFromLink
        : pool.find((p) => p && p !== this && p.isAlive) || null;
    if (typeof this.scene?.clearSoulLinkBondVfxForOwner === "function") {
      this.scene.clearSoulLinkBondVfxForOwner(this);
    }
    this.soulShroudActive = false;
    this.soulShroudSoulLinked = false;
    this.soulLinkAlly = null;
    this.soulShroudExpiresAt = 0;
    if (allyResolved?.active && allyResolved.isAlive) {
      this.setPosition(allyResolved.x, allyResolved.y);
      if (this.body && typeof this.body.reset === "function") {
        this.body.reset(allyResolved.x, allyResolved.y);
      }
    }
    this.invulnerableUntil = 0;
    this.setAlpha(1);
    if (this.soulShroudDecoy?.active) {
      this.soulShroudDecoy.destroy(true);
    }
    this.soulShroudDecoy = null;
    if (typeof this.scene?.removeSoulcallerDecoy === "function") {
      this.scene.removeSoulcallerDecoy(this);
    }
    const t = this._soulShroudTuning || {};
    const maxDmg = t.shroudExplosionMaxDamage || 40;
    const radius = t.shroudExplosionRadius || 120;
    const damage = Math.max(1, Math.round(maxDmg * (1 - timeFrac)));
    if (earlyCancel && typeof this.scene?.fireSoulShroudExplosion === "function") {
      this.scene.fireSoulShroudExplosion(this, damage, radius);
    }
  }

  getSpeedMultiplier() {
    if (!this.speedBuffs?.length) return 1;
    const now = this.scene?.time?.now ?? 0;
    this.speedBuffs = this.speedBuffs.filter((e) => e.expiresAt > now);
    if (!this.speedBuffs.length) return 1;
    return this.speedBuffs.reduce((best, e) => Math.max(best, e.mult), 1);
  }

  applySpeedBuff(mult, durationMs) {
    if (!Number.isFinite(mult) || mult <= 1) return;
    const now = this.scene?.time?.now ?? 0;
    this.speedBuffs.push({ mult: Phaser.Math.Clamp(mult, 1, 2.5), expiresAt: now + durationMs });
  }
}

window.Player = Player;
