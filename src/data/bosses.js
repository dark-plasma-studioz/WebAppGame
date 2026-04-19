const BOSSES = [
  {
    id: "galeSovereign",
    name: "Gale Sovereign",
    brief: "Wind tyrant—screen dashes, homing bolts, and a teleporting gale sphere with returnable shards.",
    color: 0x3dd4c8,
    maxHealth: 600,
    speed: 145,
    contactDamage: 6,
    contactTuning: {
      cooldownMs: 850,
      minDamage: 4,
      scale: 0.55
    },
    attackTuning: {
      sovereignScreenDash: {
        windupMs: 520,
        width: 130,
        height: 64,
        yOffset: 8,
        dashSpeed: 1480,
        dashDurationMs: 480,
        damage: 18,
        hitIntervalMs: 72,
        cooldownMs: 1680,
        postLockMs: 340,
        rippleReach: 500
      },
      aetherColumn: {
        windupMs: 600,
        strikeDelayMs: 50,
        beamWidth: 225,
        beamHeight: 620,
        beamDurationMs: 750,
        tickIntervalMs: 80,
        particleCount: 20,
        damage: 20,
        cooldownMs: 1680,
        postLockMs: 420
      },
      galeSeekerVolley: {
        windupMs: 500,
        boltCount: 5,
        spreadDeg: 145,
        boltSpeed: 180,
        retargetDelayMs: 420,
        homingStrength: 0.055,
        projectileDamage: 8,
        seekerMaxLifeMs: 3000,
        snapOffset: 94,
        maxRange: 2400,
        cooldownMs: 1520,
        postLockMs: 280
      },
      typhoonSlam: {
        windupMs: 500,
        glowMs: 420,
        jumpVelocityY: -520,
        damage: 20,
        knockbackScale: 420,
        cooldownMs: 2280,
        postLockMs: 420
      },
      galeWindSphere: {
        windupMs: 520,
        durationMs: 3000,
        portalY: 128,
        teleportMarginX: 72,
        orbRadius: 200,
        orbContactDamage: 8,
        orbTickIntervalMs: 250,
        orbKnockback: 400,
        projectileCount: 12,
        projectileIntervalMs: 250,
        projectileSpeed: 350,
        projectileDamage: 8,
        returnDamageToBoss: 10,
        projectileMaxLifeMs: 4200,
        cooldownMs: 7800,
        postLockMs: 360
      }
    },
    pattern: "dasher",
    specialCooldown: 2900,
    basicAttackCooldown: 1450
  },
  {
    id: "wraith",
    name: "Night Wraith",
    brief: "Elusive reaper—blinks, scythe sweeps, spirit shots, void pulls, and a phase rush.",
    color: 0x9dbeff,
    maxHealth: 470,
    speed: 150,
    contactDamage: 5,
    contactTuning: {
      cooldownMs: 820,
      minDamage: 4,
      scale: 0.55
    },
    attackTuning: {
      wraithBlink: {
        windupMs: 500,
        radius: 80,
        damage: 16,
        offsetX: 30,
        dodgeWindowMs: 300,
        cooldownMs: 2100,
        postLockMs: 280
      },
      scytheArc: {
        holdMs: 400,
        sweepMs: 200,
        radius: 128,
        spreadDeg: 130,
        damage: 20,
        cooldownMs: 1180,
        postLockMs: 260
      },
      spiritVolley: { windupMs: 550, shotCount: 5, shotIntervalMs: 200, projectileDamage: 10, projectileSpeedX: 320 },
      phaseRush: {
        windupMs: 680,
        flashStopBeforeDashMs: 200,
        width: 230,
        height: 58,
        yOffset: 8,
        damage: 20,
        dashSpeed: 1040,
        dashDurationMs: 260,
        cooldownMs: 1480,
        postLockMs: 360
      },
      voidTendril: {
        windupMs: 800,
        pullDurationMs: 800,
        reachX: 400,
        reachUp: 280,
        pullStrength: 300,
        upwardBias: 0.38,
        platformGhostMs: 420,
        damageTickMs: 200,
        damagePerTick: 5,
        tendrilHitHalfWidth: 36,
        cooldownMs: 2200,
        postLockMs: 280
      }
    },
    pattern: "jumper",
    specialCooldown: 3200,
    basicAttackCooldown: 1280
  },
  {
    id: "pyromancer",
    name: "Pyromancer",
    brief: "Fire mage—flame jumps, ember bursts, and an inferno rift that rains shots from above.",
    color: 0xff8659,
    maxHealth: 475,
    speed: 100,
    contactDamage: 6,
    contactTuning: {
      cooldownMs: 900,
      minDamage: 4,
      scale: 0.55
    },
    attackTuning: {
      flameWarp: {
        windupMs: 740,
        radius: 108,
        damage: 18,
        offsetX: 24,
        dodgeWindowMs: 500,
        cooldownMs: 2571
      },
      emberVolley: {
        windupMs: 640,
        shotCount: 8,
        shotIntervalMs: 200,
        projectileDamage: 8,
        cooldownMs: 1786
      },
      fireNova: { windupMs: 580, radius: 160, damage: 20, cooldownMs: 1929 },
      cinderRush: {
        windupMs: 500,
        width: 300,
        height: 56,
        yOffset: 8,
        damage: 22,
        dashSpeed: 750,
        dashDurationMs: 360,
        cooldownMs: 2071
      },
      infernoRiftPortal: {
        windupMs: 1000,
        portalY: 128,
        telegraphRadius: 90,
        aimClampMargin: 72,
        durationMs: 3000,
        shotIntervalMs: 200,
        projectileDamage: 6,
        projectileSpeed: 330,
        cooldownMs: 4286,
        postLockMs: 200
      }
    },
    pattern: "shooter",
    specialCooldown: 3143,
    basicAttackCooldown: 2286
  },
  {
    id: "hollowPair",
    name: "Hollow Revenants",
    brief: "Twin spectres—linked beams, spears, splitting orbs, and pincer pressure from the air.",
    color: 0xc4a8ff,
    twinBoss: true,
    leaderSpawnOffsetX: -100,
    leaderSpawnOffsetY: 6,
    twinSpawnOffsetX: 108,
    twinSpawnOffsetY: -78,
    twinHover: {
      flankDistance: 128,
      floatHeight: 92,
      bobX: 38,
      bobY: 18,
      followLerp: 0.11,
      orbitRadius: 168,
      orbitPhaseSpeed: 0.00062,
      lateralWander: 72,
      minY: 118,
      maxY: 420
    },
    maxHealth: 550,
    speed: 108,
    contactDamage: 6,
    contactTuning: {
      cooldownMs: 960,
      minDamage: 4,
      scale: 0.52
    },
    attackTuning: {
      hollowSoulLink: {
        windupMs: 600,
        beamDurationMs: 960,
        beamWidth: 34,
        damageTickMs: 100,
        damagePerTick: 10,
        cooldownMs: 3880,
        postLockMs: 520
      },
      hollowImplosion: {
        windupMs: 800,
        radius: 112,
        damage: 18,
        cooldownMs: 2240,
        postLockMs: 480
      },
      hollowGroundSpear: {
        windupMs: 520,
        width: 325,
        height: 38,
        xOffset: 150,
        yOffset: -4,
        damage: 20,
        cooldownMs: 1920,
        postLockMs: 360
      },
      hollowBloomOrb: {
        speedX: 80,
        travelMs: 2800,
        explosionRadius: 98,
        explosionDamage: 20,
        splitCount: 10,
        splitProjectileDamage: 10,
        splitSpeed: 252,
        splitMaxRange: 520,
        cooldownMs: 1860,
        postLockMs: 140
      },
      hollowTwinSpear: {
        windupMs: 460,
        width: 210,
        height: 28,
        xOffset: 96,
        yOffset: -10,
        projectileDamage: 20,
        cooldownMs: 1880,
        postLockMs: 130
      },
      riftDash: { windupMs: 620, width: 245, height: 58, yOffset: 8, damage: 20, dashSpeed: 780, dashDurationMs: 260 }
    },
    pattern: "dasher",
    specialCooldown: 3520,
    basicAttackCooldown: 1220
  },
  {
    id: "behemoth",
    name: "Titan Behemoth",
    brief: "Colossal bruiser—charges, falling boulders, meteors, and arena-wide earthshatters.",
    color: 0xb7ff7f,
    maxHealth: 625,
    speed: 52,
    contactDamage: 10,
    contactTuning: {
      cooldownMs: 800,
      minDamage: 5,
      scale: 0.6
    },
    attackTuning: {
      titanCharge: {
        windupMs: 1100,
        width: 290,
        height: 78,
        damage: 35,
        dashSpeed: 900,
        dashDurationMs: 260,
        cooldownMs: 2400,
        postLockMs: 500
      },
      stalkBoulder: {
        behindOffsetPx: 100,
        hoverAboveGroundPx: 85,
        windupMs: 650,
        dropDurationMs: 155,
        smashDamage: 38,
        smashRadius: 115,
        smashForwardPx: 58,
        fallRecoverMs: 720,
        cooldownMs: 2800,
        postLockMs: 200
      },
      meteorCall: {
        windupMs: 1000,
        width: 210,
        height: 36,
        dropDurationMs: 180,
        meteorDamage: 26,
        cooldownMs: 2000,
        postLockMs: 380
      },
      earthshatter: {
        windupMs: 1600,
        shockwaveRadius: 220,
        damage: 48,
        cooldownMs: 4000,
        postLockMs: 700,
        crackCount: 8,
        debrisCount: 12
      },
      boulderBarrage: {
        windupMs: 1300,
        boulderCount: 4,
        boulderDamage: 24,
        boulderRadius: 55,
        dropDurationMs: 400,
        cooldownMs: 3200,
        postLockMs: 500,
        spreadX: 180
      }
    },
    pattern: "summoner",
    specialCooldown: 2600,
    basicAttackCooldown: 1800
  },
  {
    id: "graveWarden",
    name: "Grave Warden",
    brief:
      "Necromancer—summons phantom swarms, raises haunted graves, channels life-stealing beams, and reaps with spectral scythes.",
    color: 0xc084fc,
    maxHealth: 540,
    speed: 90,
    contactDamage: 5,
    contactTuning: {
      cooldownMs: 920,
      minDamage: 4,
      scale: 0.54
    },
    attackTuning: {
      /** Summon: chained bone brute (replaces old bone volley). */
      boneVolley: {
        windupMs: 2000,
        summonHp: 75,
        summonDamage: 20,
        slamRadius: 100,
        slamWindupMs: 650,
        slamCooldownMs: 1250,
        leashRadius: 300,
        healOnKill: 40,
        cooldownMs: 40000,
        postLockMs: 520,
        afterSummonLockMs: 850
      },
      /** Summon: haunted grave turret (replaces old grave hands). */
      graveRise: {
        windupMs: 1500,
        summonHp: 50,
        boneDamage: 9,
        fireIntervalMs: 1000,
        projectileSpeed: 340,
        attackRange: 550,
        projectileMaxRange: 650,
        durationMs: 15000,
        healOnKill: 20,
        cooldownMs: 25000,
        postLockMs: 520,
        afterSummonLockMs: 900
      },
      soulSiphon: {
        windupMs: 1000,
        beamDurationMs: 1500,
        beamWidth: 28,
        damageTickMs: 200,
        damagePerTick: 2,
        healPerTick: 3,
        maxRange: 250,
        breakRange: 200,
        cooldownMs: 3200,
        postLockMs: 400
      },
      /** Summon: 3 one-hit phantoms that stream toward nearest player. */
      phantomSwarm: {
        windupMs: 1000,
        phantomCount: 3,
        phantomSpeed: 150,
        phantomDuration: 6500,
        phantomDamage: 12,
        phantomRadius: 36,
        cooldownMs: 7500,
        postLockMs: 520,
        afterSummonLockMs: 800
      },
      deathsToll: {
        windupMs: 900,
        scytheWidth: 340,
        scytheHeight: 60,
        damage: 28,
        sweepDurationMs: 400,
        cooldownMs: 3600,
        postLockMs: 500
      }
    },
    pattern: "summoner",
    specialCooldown: 3600,
    basicAttackCooldown: 1650
  }
];

function getRandomBoss() {
  return BOSSES[Math.floor(Math.random() * BOSSES.length)];
}

function getBossById(id) {
  if (!id) return null;
  return BOSSES.find((b) => b.id === id) || null;
}

window.BOSSES = BOSSES;
window.getRandomBoss = getRandomBoss;
window.getBossById = getBossById;
