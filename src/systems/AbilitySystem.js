class AbilitySystem {
  static trigger(scene, player, boss, players, slot = "ability") {
    const now = scene.time.now;
    const def = slot === "utility" ? player.definition.utility : player.definition.ability;
    const nextKey = slot === "utility" ? "nextUtilityTime" : "nextAbilityTime";
    if (!def) return false;
    if (now < player[nextKey]) return false;
    try {
      player[nextKey] = now + def.cooldownMs;
      const ok = AbilitySystem.runAbilityType(scene, player, boss, players, def, slot);
      return ok !== false;
    } catch (error) {
      console.error("Ability execution failed", error);
      player[nextKey] = now + 400;
      return false;
    }
  }

  static runAbilityType(scene, player, boss, players, ability, slot) {
    switch (ability.type) {
      case "dashStrike":
        AbilitySystem.dashStrike(scene, player, boss, ability);
        return true;
      case "healPulse":
        AbilitySystem.healPulse(player, players, ability);
        return true;
      case "tripleShot":
        AbilitySystem.tripleShot(scene, player, ability);
        return true;
      case "shieldBurst":
        AbilitySystem.shieldBurst(scene, player, boss, ability, players);
        return true;
      case "groundSlam":
        AbilitySystem.groundSlam(scene, player, boss, ability);
        return true;
      case "skyLance":
        AbilitySystem.skyLance(scene, player, boss, ability);
        return true;
      case "sanctuaryBarrier":
        AbilitySystem.sanctuaryBarrier(scene, player, ability);
        return true;
      case "superJump":
        AbilitySystem.superJump(scene, player, ability);
        return true;
      case "parry":
        AbilitySystem.parry(scene, player, ability);
        return true;
      case "blinkStep":
        AbilitySystem.blinkStep(scene, player, boss, ability);
        return true;
      case "soulbondSpirits":
        AbilitySystem.soulbondSpirits(scene, player, ability);
        return true;
      case "covenantMark":
        AbilitySystem.covenantMark(scene, player, players, ability);
        return true;
      case "soulbondEntities":
        AbilitySystem.soulbondEntities(scene, player, boss, ability);
        return true;
      case "soulShroud":
        AbilitySystem.soulShroud(scene, player, boss, players, ability);
        return true;
      default:
        return false;
    }
  }

  /** Scales damage dealt by a hero to the boss (outgoing buffs). */
  static scaleOutgoing(player, raw) {
    if (!player || typeof player.scaleOutgoingDamageToBoss !== "function") {
      return Math.max(1, Math.round(raw));
    }
    return player.scaleOutgoingDamageToBoss(raw);
  }

  static dashStrike(scene, player, boss, ability) {
    const tuning = AbilitySystem.getAbilityTuning(ability, {
      dashSpeed: 520,
      trailDurationMs: 160,
      burstRadius: 44,
      burstDurationMs: 170,
      invulnMs: 0
    });
    const direction = player.facing;
    const durationMs = ability.durationMs || 260;
    const range = ability.range || 110;
    const now = scene.time.now;
    const invulnMs = Number.isFinite(tuning.invulnMs) && tuning.invulnMs > 0 ? Math.max(durationMs, tuning.invulnMs) : durationMs;

    player.damageReductionEffects = [];
    player.damageMultiplier = 1;
    player.invulnerableUntil = now + invulnMs;
    player.movementLockUntil = now + durationMs;
    player.movementLockType = "dash";
    player.setVelocityX(direction * tuning.dashSpeed);
    player.setTint(0xffffff);

    scene.spawnDashStrikeUtilityVfx(player.x, player.y - 4, direction, player.definition.color, tuning.trailDurationMs);

    if (player.definition.id === "vanguard") {
      player.vanguardSpearState = "dash";
      scene.spawnVanguardDashSpearPose(player, player.definition.color, durationMs);
    } else {
      scene.spawnDashStreak(player.x, player.y - 6, direction, range, player.definition.color, tuning.trailDurationMs);
    }

    let dealt = false;
    const rallyMult = Number.isFinite(tuning.rallyMult) ? tuning.rallyMult : 0;
    const rallyMs = Number.isFinite(tuning.rallyDurationMs) ? tuning.rallyDurationMs : 0;
    const rallyRadius = Number.isFinite(tuning.rallyRadius) ? tuning.rallyRadius : 70;
    const ralliedAllies = new Set();
    const isVanguard = player.definition.id === "vanguard";
    const poll = scene.time.addEvent({
      delay: 18,
      loop: true,
      callback: () => {
        if (!player.active || !player.isAlive || scene.gameState !== "battle") {
          poll.remove();
          return;
        }
        if (scene.time.now >= player.movementLockUntil) {
          poll.remove();
          return;
        }
        const hitH = 46;
        const centerX = player.x + direction * (28 + range * 0.42);
        const centerY = player.y - 6;
        const rect = scene.createRectHitbox(centerX, centerY, Math.min(range, 96), hitH);
        if (typeof scene.tryBatGaleWindSalvoProjectiles === "function") {
          scene.tryBatGaleWindSalvoProjectiles(player, rect);
        }
        if (scene.isTrueHitboxView()) {
          scene.playRectAttackVisual(rect, player.definition.color, { durationMs: 28, direction });
        }
        const hit =
          typeof scene.rectHitsAnyEnemy === "function"
            ? scene.rectHitsAnyEnemy(rect)
            : boss && boss.active && scene.rectHitsTarget(rect, boss)
              ? boss
              : scene.bossTwin?.active && scene.boss?.definition?.id === "hollowPair" && scene.rectHitsTarget(rect, scene.bossTwin)
                ? scene.bossTwin
                : null;
        if (!dealt && hit) {
          dealt = true;
          hit.takeDamage(AbilitySystem.scaleOutgoing(player, ability.power), player.definition.color);
          scene.spawnImpactEffect(hit.x, hit.y - 12, player.definition.color, 16);
          hit.setVelocityX(direction * 500);
        }
        if (isVanguard && rallyMult > 1 && rallyMs > 0) {
          const allies = scene.players || [];
          for (let i = 0; i < allies.length; i += 1) {
            const ally = allies[i];
            if (!ally || ally === player || !ally.isAlive || ralliedAllies.has(ally)) continue;
            if (Math.abs(ally.x - player.x) <= rallyRadius && Math.abs(ally.y - player.y) <= rallyRadius) {
              if (typeof ally.applyOutgoingDamageBuff === "function") {
                ally.applyOutgoingDamageBuff(rallyMult, rallyMs, "vanguardRally");
              }
              ralliedAllies.add(ally);
              if (typeof scene.spawnVanguardRallyAura === "function") {
                scene.spawnVanguardRallyAura(ally, rallyMs);
              } else if (typeof scene.spawnImpactEffect === "function") {
                scene.spawnImpactEffect(ally.x, ally.y - 12, 0x5ca8ff, 18);
              }
            }
          }
        }
      }
    });

    scene.time.delayedCall(durationMs, () => {
      player.clearTint();
      poll.remove();
      if (player.definition.id === "vanguard" && player.vanguardSpearState === "dash") {
        player.vanguardSpearState = "idle";
      }
    });
  }

  static skyLance(scene, player, boss, ability) {
    const tuning = AbilitySystem.getAbilityTuning(ability, {
      gapPx: 78,
      strikeWidth: 58,
      strikeHeight: 76,
      windupMs: 340,
      impactFlashMs: 140,
      pairLaneOffsetPx: 42,
      secondLanceDelayMs: 120
    });
    const facing = player.facing;
    const gap = tuning.gapPx;
    const w = tuning.strikeWidth;
    const h = tuning.strikeHeight;
    const baseStrikeX = player.x + facing * (gap + w * 0.5);
    const strikeCenterY = player.y - 8;
    const windup = tuning.windupMs;
    const lane = Math.max(24, tuning.pairLaneOffsetPx);
    const stagger = Math.max(0, tuning.secondLanceDelayMs);
    const strikeLeftX = baseStrikeX - lane;
    const strikeRightX = baseStrikeX + lane;
    const dmg = Number.isFinite(ability.power) ? ability.power : 22;

    scene.spawnSkyLanceTelegraph(strikeLeftX, strikeCenterY, player.definition.color, windup, w, h, 0);
    scene.spawnSkyLanceTelegraph(strikeRightX, strikeCenterY, player.definition.color, windup, w, h, stagger);

    const lanceSession = { hits: 0, resolved: 0 };
    const skyfallenMult = Number.isFinite(tuning.skyfallenMult) ? tuning.skyfallenMult : 1.75;
    const skyfallenMs = Number.isFinite(tuning.skyfallenDurationMs) ? tuning.skyfallenDurationMs : 4000;

    const resolveLance = (strikeX, impactAt) => {
      scene.time.delayedCall(impactAt, () => {
        if (!player.active || !player.isAlive || scene.gameState !== "battle") return;
        const rect = scene.createRectHitbox(strikeX, strikeCenterY, w, h);
        if (typeof scene.tryBatGaleWindSalvoProjectiles === "function") {
          scene.tryBatGaleWindSalvoProjectiles(player, rect);
        }
        scene.playRectAttackVisual(rect, player.definition.color, { durationMs: tuning.impactFlashMs, direction: facing });
        scene.spawnSkyLanceImpact(strikeX, strikeCenterY, player.definition.color, w, h);
        const hit =
          typeof scene.rectHitsAnyEnemy === "function"
            ? scene.rectHitsAnyEnemy(rect)
            : boss && boss.active && scene.rectHitsTarget(rect, boss)
              ? boss
              : scene.bossTwin?.active && scene.boss?.definition?.id === "hollowPair" && scene.rectHitsTarget(rect, scene.bossTwin)
                ? scene.bossTwin
                : null;
        if (hit) {
          hit.takeDamage(AbilitySystem.scaleOutgoing(player, dmg), player.definition.color);
          scene.spawnImpactEffect(hit.x, hit.y - 14, player.definition.color, 18);
          hit.setVelocityX(facing * 420);
          lanceSession.hits += 1;
        }
        lanceSession.resolved += 1;
        if (lanceSession.resolved >= 2 && lanceSession.hits >= 2) {
          if (typeof player.applyOutgoingDamageBuff === "function") {
            player.applyOutgoingDamageBuff(skyfallenMult, skyfallenMs, "vanguardSkyfallen");
          }
          player.vanguardSkyfallenUntil = scene.time.now + skyfallenMs;
          player.vanguardSkyfallenMult = skyfallenMult;
          player.vanguardSkyfallenDurationMs = skyfallenMs;
          if (typeof scene.spawnVanguardSkyfallenAura === "function") {
            scene.spawnVanguardSkyfallenAura(player, skyfallenMs);
          }
        }
      });
    };

    resolveLance(strikeLeftX, windup);
    resolveLance(strikeRightX, windup + stagger);
  }

  static sanctuaryBarrier(scene, player, ability) {
    const tuning = AbilitySystem.getAbilityTuning(ability, {
      durationMs: 4000,
      radius: 110,
      projectileHealAmount: 3
    });
    const expiresAt = scene.time.now + tuning.durationMs;
    const r = Math.max(
      48,
      Number.isFinite(tuning.radius)
        ? tuning.radius
        : Number.isFinite(tuning.radiusX)
          ? tuning.radiusX
          : 110
    );
    const castX = player.x;
    const castY = player.y;
    const domeCx = castX;
    const domeCy = castY - 18;
    const entry = {
      cx: domeCx,
      cy: domeCy,
      visualAnchorX: castX,
      visualAnchorY: castY,
      radiusX: r,
      radiusY: r,
      expiresAt,
      color: player.definition.color,
      bossDmgAcc: 0,
      healByPlayer: new WeakMap(),
      projectileHealAmount: Number.isFinite(tuning.projectileHealAmount) ? tuning.projectileHealAmount : 3
    };
    scene.medicBarriers.push(entry);
    entry.domeContainer = scene.spawnSanctuaryDomeVisual(entry, r, player.definition.color, tuning.durationMs);
  }

  static superJump(scene, player, ability) {
    const tuning = AbilitySystem.getAbilityTuning(ability, {
      boostY: 920,
      smokeRadius: 92,
      smokeDurationMs: 4000,
      smokeStunMs: 1000,
      smokeDps: 8
    });
    player.setVelocityY(-tuning.boostY);
    scene.spawnSkyriseLeapVisual(player.x, player.y, player.facing, player.definition.color);
    if (typeof scene.startSkyriseSmokeZone === "function") {
      scene.startSkyriseSmokeZone(player.x, player.y, player.definition.color, tuning);
    }
  }

  static parry(scene, player, ability) {
    const tuning = AbilitySystem.getAbilityTuning(ability, { windowMs: 300, meleeStunMs: 2000 });
    const now = scene.time.now;
    player.parryActiveUntil = now + tuning.windowMs;
    player.parryMeleeStunMs = tuning.meleeStunMs;
    player.setTint(0xffc4c4);
    scene.time.delayedCall(tuning.windowMs, () => {
      if (player.active) player.clearTint();
    });
    scene.spawnAegisParryVisual(player.x, player.y, player.facing, player.definition.color, tuning.windowMs);
  }

  static blinkStep(scene, player, boss, ability) {
    const tuning = AbilitySystem.getAbilityTuning(ability, { distancePx: 152, invulnMs: 120 });
    const now = scene.time.now;
    const dir = player.facing;
    const dx = dir * tuning.distancePx;
    const w = scene.scale?.width ?? 960;
    const startX = player.x;
    const startY = player.y;
    const invuln = tuning.invulnMs;
    player.invulnerableUntil = now + invuln;
    if (player.definition.id === "striker") {
      player.strikerBlinkEvadeUntil = now + invuln;
      player.strikerEvadeAmpGranted = false;
    }
    scene.spawnDashStreak(startX, startY - 6, dir, Math.abs(dx), player.definition.color, 140);
    player.x = Phaser.Math.Clamp(player.x + dx, 24, w - 24);
    player.setVelocityX(dir * 120);
    scene.spawnBlinkStepUtilityVfx(startX, startY, player.x, player.y, dir, player.definition.color);
  }

  static healPulse(player, players, ability) {
    const channelMs = ability.channelMs || 1800;
    const tuning = AbilitySystem.getAbilityTuning(ability, {
      windupZoneWidth: 76,
      windupZoneHeight: 52,
      reductionMultiplier: 0.86,
      reductionDurationMs: 2500
    });
    const scene = player.scene;
    player.movementLockUntil = scene.time.now + channelMs;
    player.movementLockType = "root";
    player.setVelocityX(0);
    player.setTint(0x7dffb6);
    scene.spawnHealChannelGroundPulse(player.x, player.y, 0x7dffb6, channelMs);

    if (scene.isTrueHitboxView()) {
      const healZone = scene.createRectHitbox(player.x, player.y + 18, tuning.windupZoneWidth, tuning.windupZoneHeight);
      scene.playRectAttackVisual(healZone, 0x7dffb6, { durationMs: channelMs, angle: 0, direction: 1 });
    }

    scene.time.delayedCall(channelMs, () => {
      if (!player.active || !player.isAlive || scene.gameState !== "battle") return;
      player.clearTint();
      players.forEach((ally) => {
        if (!ally.isAlive) return;
        ally.health = Math.min(ally.maxHealth, ally.health + ability.power);
        ally.applyDamageReduction(tuning.reductionMultiplier, tuning.reductionDurationMs);
        ally.flash(0x7dffb6);
        scene.spawnImpactEffect(ally.x, ally.y - 16, 0x7dffb6, 12);
        scene.spawnHealMarker(ally.x, ally.y - 24, 0x7dffb6);
        scene.spawnBuffIcon(ally, "heal", 0x7dffb6, 900);
        scene.spawnBuffIcon(ally, "shield", 0x8fffd3, 900);
      });
    });
  }

  static tripleShot(scene, player, ability) {
    const tuning = AbilitySystem.getAbilityTuning(ability, {
      shotDelayMs: 60,
      spreadOffsetsY: [-12, 0, 12],
      spreadVelocityY: [-85, 0, 85],
      windupRectWidth: 28,
      windupRectHeight: 8
    });
    const spread = tuning.spreadOffsetsY.map((offsetY, idx) => ({
      offsetY,
      velocityY: tuning.spreadVelocityY[idx] || 0
    }));
    spread.forEach(({ offsetY, velocityY }, index) => {
      scene.time.delayedCall(index * tuning.shotDelayMs, () => {
        if (!player.active || !player.isAlive || scene.gameState !== "battle") return;
        scene.spawnMuzzleFlash(player.x + player.facing * 18, player.y + offsetY, 0xf7d95c);
        const wind = scene.createRectHitbox(
          player.x + player.facing * 30,
          player.y + offsetY,
          tuning.windupRectWidth,
          tuning.windupRectHeight
        );
        scene.playRectAttackVisual(wind, 0xf7d95c, { durationMs: 90, direction: player.facing });
        scene.spawnPlayerProjectile(player.x, player.y + offsetY, player.facing, ability.power, {
          maxRange: ability.range || 230,
          effectColor: 0xf7d95c,
          speedX: 560,
          velocityY,
          style: "tripleArrow",
          textureKey: "proj_ranger",
          ownerPlayer: player
        });
      });
    });
  }

  /**
   * Hold ability to build power (caller: Player). One arrow; damage scales with charge and falls off with distance to boss.
   */
  static chargeShotRelease(scene, player, boss, _players, chargeDurationMs) {
    const ability = player.definition.ability;
    if (!ability || ability.type !== "chargeShot") return;
    const tuning = AbilitySystem.getAbilityTuning(ability, {
      chargeMsMax: 720,
      minChargeMs: 90,
      minDamage: 8,
      maxDamage: 45,
      falloffDistance: 520,
      minDistanceMult: 0.28,
      speedX: 600,
      windupRectWidth: 36,
      windupRectHeight: 10
    });
    if (!player.active || !player.isAlive || scene.gameState !== "battle") return;

    const maxD = Number.isFinite(tuning.maxDamage) ? tuning.maxDamage : ability.power || 45;
    const minD = tuning.minDamage;
    const maxCharge = tuning.chargeMsMax;
    const chargeT = Phaser.Math.Clamp(chargeDurationMs / maxCharge, 0, 1);
    const chargedLinear = Phaser.Math.Linear(minD, maxD, chargeT);

    let dist = 0;
    if (boss && boss.active) {
      const px = player.x;
      const py = player.y - 10;
      dist =
        typeof scene.distanceToNearestBossAnchor === "function"
          ? scene.distanceToNearestBossAnchor(px, py)
          : Phaser.Math.Distance.Between(
              px,
              py,
              boss.x,
              boss.y - (boss.body?.height ? boss.body.height * 0.35 : 20)
            );
    }
    const falloffD = Math.max(120, tuning.falloffDistance);
    const distFactor = Phaser.Math.Clamp(1 - (dist / falloffD) * 0.85, tuning.minDistanceMult, 1);
    let damage = Math.round(chargedLinear * distFactor);
    damage = Phaser.Math.Clamp(damage, 1, maxD);

    const facing = player.facing;
    const oy = -10;
    const wind = scene.createRectHitbox(player.x + facing * 34, player.y + oy, tuning.windupRectWidth, tuning.windupRectHeight);
    const heatCol = typeof scene.chargeShotHeatColor === "function"
      ? scene.chargeShotHeatColor(chargeT)
      : 0xf7d95c;
    scene.playRectAttackVisual(wind, heatCol, { durationMs: 110, direction: facing });
    const dmgNorm = damage / maxD;
    const scaleBoost = 0.85 + dmgNorm * 0.35;
    const shotRange = Math.max(ability.range || 2200, (scene.scale?.width || 960) + 400);
    const chargeBoltVisual =
      typeof window !== "undefined" && typeof window.mergeChargeBoltVisualPartial === "function"
        ? window.mergeChargeBoltVisualPartial(tuning.chargeBolt)
        : {};
    scene.spawnPlayerProjectile(player.x, player.y + oy, facing, damage, {
      maxRange: shotRange,
      effectColor: heatCol,
      speedX: tuning.speedX,
      velocityY: 0,
      style: "chargeBolt",
      textureKey: "proj_charge_pulse",
      ownerPlayer: player,
      scaleX: scaleBoost,
      scaleY: scaleBoost,
      chargeHeat: chargeT,
      chargeScaleBase: scaleBoost,
      chargeBolt: chargeBoltVisual
    });
  }

  static shieldBurst(scene, player, boss, ability, players) {
    const tuning = AbilitySystem.getAbilityTuning(ability, {
      shieldMultiplier: 0.66,
      healAmount: 14,
      tauntDurationMs: 4000,
      tauntDamageMultiplier: 0.70
    });
    const range = ability.range || 100;
    const allies = players && players.length ? players : scene.players || [];
    const bubbleColor = 0xff8b8b;

    allies.forEach((ally) => {
      if (!ally.isAlive) return;
      ally.applyDamageReduction(tuning.shieldMultiplier, ability.durationMs);
      ally.health = Math.min(ally.maxHealth, ally.health + tuning.healAmount);
      ally.flash(0xff8b8b);
      scene.spawnPersistentShieldDrIcon(ally, bubbleColor, ability.durationMs);
    });

    if (player.definition.id === "guardian") {
      const tauntMs = Number.isFinite(tuning.tauntDurationMs) ? tuning.tauntDurationMs : 4000;
      const tauntMult = Number.isFinite(tuning.tauntDamageMultiplier) ? tuning.tauntDamageMultiplier : 0.70;
      player.guardianTauntUntil = scene.time.now + tauntMs;
      if (typeof player.applyTaggedDamageReduction === "function") {
        player.applyTaggedDamageReduction("guardianTaunt", tauntMult, tauntMs);
      } else {
        player.applyDamageReduction(tauntMult, tauntMs);
      }
      if (typeof scene.spawnGuardianTauntAura === "function") {
        scene.spawnGuardianTauntAura(player, tauntMs);
      }
    }

    if (typeof scene.spawnShieldBurstVfx === "function") {
      scene.spawnShieldBurstVfx(player.x, player.y, Math.min(range, 140), bubbleColor);
    } else {
      scene.spawnGuardianShieldBubble(player.x, player.y, Math.min(range, 140), bubbleColor);
      scene.spawnAuraPulse(player.x, player.y, bubbleColor, 62, 200);
    }

    // Damage any enemy in range (boss/twin/summons).
    const burstCircle = scene.createCircleHitbox(player.x, player.y, range);
    const hit = typeof scene.circleHitsAnyEnemy === "function"
      ? scene.circleHitsAnyEnemy(burstCircle)
      : AbilitySystem.isBossInRange(player, boss, range)
        ? AbilitySystem.isPointNearBoss(player, boss, range)
          ? boss
          : scene.bossTwin?.active && scene.boss?.definition?.id === "hollowPair" && AbilitySystem.isPointNearBoss(player, scene.bossTwin, range)
            ? scene.bossTwin
            : null
        : null;
    if (hit) {
      hit.takeDamage(AbilitySystem.scaleOutgoing(player, ability.power), bubbleColor);
      scene.spawnImpactEffect(hit.x, hit.y - 14, bubbleColor, 22);
      if (typeof scene.spawnShieldBurstImpactFlare === "function") {
        scene.spawnShieldBurstImpactFlare(hit.x, hit.y - 12, bubbleColor);
      }
    }
  }

  static groundSlam(scene, player, boss, ability) {
    const tuning = AbilitySystem.getAbilityTuning(ability, {
      windupMs: 130,
      bossKnockbackScale: 2.1,
      hopVelocity: -260,
      dropVelocity: 680,
      strikerHopVelocity: -460,
      strikerHopPeakDelayMs: 210,
      strikerDropVelocity: 800,
      strikerSlamImpactDelayMs: 440,
      strikerBounceOnHitY: -420
    });
    const slamRange = ability.range || 135;
    const isStriker = player.definition.id === "striker";

    if (player.body.blocked.down) {
      if (isStriker) {
        player.setVelocityY(tuning.strikerHopVelocity);
        const peakMs = tuning.strikerHopPeakDelayMs;
        scene.time.delayedCall(peakMs, () => {
          if (!player.active || !player.isAlive) return;
          player.setVelocityY(tuning.strikerDropVelocity);
        });
      } else {
        player.setVelocityY(tuning.hopVelocity);
        scene.time.delayedCall(130, () => {
          if (!player.active || !player.isAlive) return;
          player.setVelocityY(tuning.dropVelocity);
        });
      }
    } else {
      player.setVelocityY(720);
    }

    const impactDelay = isStriker ? tuning.strikerSlamImpactDelayMs : tuning.windupMs + 200;
    scene.time.delayedCall(impactDelay, () => {
      if (!player.active || !player.isAlive || scene.gameState !== "battle") return;
      const slamCircle = scene.createCircleHitbox(player.x, player.y + 20, slamRange);
      scene.spawnGroundSlamShockwaveVisual(player.x, player.y, 0xc288ff, slamRange * 1.05, 260);
      scene.spawnGroundCrack(player.x, player.y + 20, 0xc288ff);
      scene.playCircleAttackVisual(slamCircle, 0xc288ff, { durationMs: 180 });
      const struck = typeof scene.circleHitsAnyEnemy === "function"
        ? scene.circleHitsAnyEnemy(slamCircle)
        : boss && boss.active && scene.circleHitsTarget(slamCircle, boss)
          ? boss
          : scene.bossTwin?.active && scene.boss?.definition?.id === "hollowPair" && scene.circleHitsTarget(slamCircle, scene.bossTwin)
            ? scene.bossTwin
            : null;
      if (struck) {
        struck.takeDamage(AbilitySystem.scaleOutgoing(player, ability.power), 0xc288ff);
        scene.spawnImpactEffect(struck.x, struck.y - 10, 0xc288ff, 16);
        if (isStriker) {
          player.setVelocityY(tuning.strikerBounceOnHitY);
        }
        // Only knock back the actual boss/twin; summons should not shove the boss.
        if ((struck === boss || struck === scene.bossTwin) && boss && boss.active) {
          boss.setVelocityX((boss.x - player.x) * tuning.bossKnockbackScale);
        }
      }
      player.flash(0xc288ff);
    });
  }

  static soulbondSpirits(scene, player, ability) {
    const tuning = AbilitySystem.getAbilityTuning(ability, {
      durationMs: 14000,
      spiritCount: 2,
      orbitRadius: 92,
      fireIntervalMs: 880,
      shotDamage: 6,
      projectileSpeed: 410
    });
    if (typeof scene.registerSummonerSoulbond === "function") {
      scene.registerSummonerSoulbond(player, tuning);
    }
  }

  static covenantMark(scene, player, players, ability) {
    const tuning = AbilitySystem.getAbilityTuning(ability, {
      damageMult: 1.22,
      durationMs: 9000
    });
    const dur = Number.isFinite(tuning.durationMs) ? tuning.durationMs : 9000;
    const mult = Number.isFinite(tuning.damageMult) ? tuning.damageMult : 1.22;
    const list = players && players.length ? players : scene.players || [];
    list.forEach((ally) => {
      if (!ally.isAlive) return;
      ally.applyOutgoingDamageBuff(mult, dur);
      ally.flash(0xe8c8ff);
      scene.spawnBuffIcon(ally, "heal", 0xe8c8ff, Math.min(1100, dur));
    });
    if (typeof scene.spawnCovenantMarkBurst === "function") {
      scene.spawnCovenantMarkBurst(player.x, player.y - 6, player.definition.color);
    }
  }

  static getAbilityTuning(ability, defaults) {
    const raw = ability?.tuning;
    if (!raw || typeof raw !== "object") return { ...defaults };
    const merged = { ...defaults, ...raw };
    if (Array.isArray(defaults.spreadOffsetsY)) {
      merged.spreadOffsetsY = Array.isArray(raw.spreadOffsetsY) ? raw.spreadOffsetsY : defaults.spreadOffsetsY;
    }
    if (Array.isArray(defaults.spreadVelocityY)) {
      merged.spreadVelocityY = Array.isArray(raw.spreadVelocityY) ? raw.spreadVelocityY : defaults.spreadVelocityY;
    }
    return merged;
  }

  static isPointNearBoss(player, boss, range) {
    if (!boss || !boss.active || !player.isAlive) return false;
    const dx = Math.abs(player.x - boss.x);
    const dy = Math.abs(player.y - boss.y);
    const floatingTwin =
      boss.twinLeader?.active && boss.definition?.id === "hollowPair" && boss.isTwinSecondary === true;
    const maxDy = floatingTwin ? 240 : 80;
    return dx <= range && dy <= maxDy;
  }

  static isBossInRange(player, boss, range) {
    if (!boss || !boss.active || !player.isAlive) return false;
    if (AbilitySystem.isPointNearBoss(player, boss, range)) return true;
    const scene = boss.scene;
    const twin = scene?.bossTwin;
    if (twin?.active && boss.definition?.id === "hollowPair") {
      return AbilitySystem.isPointNearBoss(player, twin, range);
    }
    return false;
  }

  static soulbondEntities(scene, player, boss, ability) {
    const tuning = AbilitySystem.getAbilityTuning(ability, {
      wispDurationMs: 14000,
      wispDamage: 6,
      wispFireIntervalMs: 1100,
      wispSpeed: 135,
      wispBossEngageRange: 440,
      wispFollowSpeed: 135,
      wispHomeOrbitRadius: 80,
      wispAttackRange: 460,
      wispProjectileMaxRange: 480,
      turretDurationMs: 14000,
      turretHealth: 60,
      turretDamage: 5,
      turretFireIntervalMs: 750,
      turretProjectileSpeed: 400,
      turretAttackRange: 500,
      turretProjectileMaxRange: 520
    });
    if (typeof scene.registerSoulcallerWisp === "function") {
      scene.registerSoulcallerWisp(player, tuning);
    }
    if (typeof scene.registerSoulcallerTurret === "function") {
      scene.registerSoulcallerTurret(player, tuning);
    }
    if (!scene.isTrueHitboxView() && typeof scene.spawnSoulbondCastPulse === "function") {
      scene.spawnSoulbondCastPulse(player.x, player.y - 8, player.definition.color);
    }
  }

  static soulShroud(scene, player, boss, players, ability) {
    const tuning = AbilitySystem.getAbilityTuning(ability, {
      stealthDurationMs: 6000,
      decoyHealth: 80,
      allyDamageMult: 1.5,
      allySpeedMult: 1.5,
      soulLinkProjectileSpeed: 550
    });
    if (typeof scene.registerSoulcallerDecoy === "function") {
      scene.registerSoulcallerDecoy(player, tuning);
    }
    player.startSoulShroud(tuning.stealthDurationMs);
    player._soulShroudTuning = tuning;
    if (!scene.isTrueHitboxView() && typeof scene.spawnSoulbondCastPulse === "function") {
      scene.spawnSoulbondCastPulse(player.x, player.y - 8, player.definition.color);
    }
  }
}

window.AbilitySystem = AbilitySystem;
