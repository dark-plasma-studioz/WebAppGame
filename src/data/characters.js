/**
 * Ranger Power Shot — pulse visual scale vs distance (edit here; merged with code fallbacks).
 * peakMultiplier: size multiplier at muzzle (applied on top of charge-based scaleBoost).
 * minScale: scale at end of travel (world units relative to texture).
 * deadZone: fraction of maxRange at full peak before shrink begins (0–1).
 * shrinkExponent: higher = stays larger longer, then drops faster (power curve on distance).
 * spawnForward: pixels ahead of player to spawn (keeps huge sprite off platforms).
 * spawnScaleMulX / spawnScaleMulY: initial oval stretch vs peak scale.
 * clampMinMulX / clampMinMulY: minimum scale as fraction of minScale on each axis.
 * scaleYFromSc: Y scale uses sc * this vs X using sc (slight squash while flying).
 */
const RANGER_CHARGE_BOLT_VISUAL = {
  peakMultiplier: 1.42,
  minScale: 0.1,
  deadZone: 0.15,
  shrinkExponent: 0.3,
  spawnForward: 48,
  spawnScaleMulX: 0.98,
  spawnScaleMulY: 0.88,
  clampMinMulX: 0.5,
  clampMinMulY: 0.4,
  scaleYFromSc: 0.92
};

function mergeChargeBoltVisualPartial(partial) {
  return { ...RANGER_CHARGE_BOLT_VISUAL, ...(partial && typeof partial === "object" ? partial : {}) };
}

const CHARACTERS = [
  {
    id: "vanguard",
    name: "Vanguard",
    blurb:
      "Frontline spearman: a combo-rewarding spear, a sky punish that empowers follow-ups, and a dash that rallies allies.",
    color: 0x5ca8ff,
    maxHealth: 180,
    speed: 270,
    jumpPower: 570,
    basicAttack: {
      type: "spearThrust",
      name: "Spear Thrust",
      description:
        "Armor-lined lunge. On hit: 'Pierced' (+10% boss vulnerability, 2.5s). Landing thrusts within 1.2s chain into Momentum (1.5x dmg, longer reach).",
      damage: 14,
      range: 92,
      cooldownMs: 500,
      tuning: {
        hitboxVerticalRange: 7,
        hitboxYOffset: -6,
        strikeVisualDurationMs: 95,
        swing: { width: 92, height: 7, angle: 4, offsetX: 42, offsetY: -6, style: "thrust" },
        pierceMult: 1.15,
        pierceDurationMs: 2500,
        momentumWindowMs: 1200,
        momentumDamageMult: 1.5,
        momentumRangeMult: 1.25
      }
    },
    ability: {
      type: "skyLance",
      name: "Heavenfall Lance",
      cooldownMs: 12500,
      power: 20,
      range: 120,
      description:
        "Twin lances drop in sequence (20 dmg each). If both connect: 'Skyfallen' - next Spear Thrusts deal +25% damage for 4s, refreshing on hit.",
      tuning: {
        gapPx: 70,
        strikeWidth: 70,
        strikeHeight: 76,
        windupMs: 340,
        impactFlashMs: 175,
        pairLaneOffsetPx: 25,
        secondLanceDelayMs: 100,
        skyfallenMult: 1.25,
        skyfallenDurationMs: 4000
      }
    },
    utility: {
      type: "dashStrike",
      name: "Dash Strike",
      cooldownMs: 7500,
      power: 18,
      range: 206,
      durationMs: 325,
      description:
        "Surge along the spear line while invulnerable; impact knocks the boss back. Allies passed through gain 'Rally' (+25% damage, 3s).",
      tuning: {
        dashSpeed:650,
        trailDurationMs: 160,
        burstRadius: 100,
        burstDurationMs: 170,
        invulnMs: 750,
        rallyMult: 1.25,
        rallyDurationMs: 4000,
        rallyRadius: 100
      }
    }
  },
  {
    id: "medic",
    name: "Medic",
    blurb:
      "Fragile skill-support: harmonic bolts that build Resonance for huge ally heals, a team heal channel, and a projectile-eating ward.",
    color: 0x7dffb6,
    maxHealth: 100,
    speed: 295,
    jumpPower: 575,
    basicAttack: {
      type: "pulseBolt",
      name: "Pulse Bolt",
      description:
        "Harmonic dart. Hit the boss to stack Resonance (max 3, 5s). Each stack adds +3 HP to your next ally-heal bolt, which consumes the stacks.",
      damage: 8,
      range: 185,
      cooldownMs: 650,
      tuning: {
        projectileOffsetY: -4,
        projectileSpeedX: 390,
        allyHealOnHit: 6,
        resonanceMaxStacks: 3,
        resonanceStackDurationMs: 5000,
        resonanceHealPerStack: 3
      }
    },
    ability: {
      type: "healPulse",
      name: "Heal Pulse",
      cooldownMs: 20000,
      power: 40,
      channelMs: 2000,
      durationMs: 300,
      description: "Root and channel: pulsing ward on the ground, rising crosses, then team heal + mitigation.",
      tuning: {
        windupZoneWidth: 76,
        windupZoneHeight: 52,
        reductionMultiplier: 0.85,
        reductionDurationMs: 2000
      }
    },
    utility: {
      type: "sanctuaryBarrier",
      name: "Sanctuary Veil",
      cooldownMs: 17500,
      description:
        "Stationary ward: strips enemy projectiles, passively heals allies inside (5 HP/s), burns boss (8 DPS). Every projectile stripped pulses +3 HP to everyone inside.",
      tuning: {
        durationMs: 4000,
        radius: 110,
        projectileHealAmount: 3
      }
    }
  },
  {
    id: "ranger",
    name: "Ranger",
    blurb: "Mobile archer: long-range shots, a hold-to-charge energy pulse, and a huge jump for vertical arenas.",
    color: 0xf7d95c,
    maxHealth: 140,
    speed: 310,
    jumpPower: 575,
    basicAttack: {
      type: "arrowShot",
      name: "Arrow Shot",
      description: "Fletched bolt with bowstring snap and stretched air trails.",
      damage: 14,
      range: 275,
      cooldownMs: 700,
      tuning: {
        projectileOffsetY: -10,
        projectileSpeedX: 750
      }
    },
    ability: {
      type: "chargeShot",
      name: "Power Shot",
      cooldownMs: 17500,
      power: 75,
      range: 2200,
      durationMs: 350,
      description:
        "Hold the ability key to charge. Massive damage. Fires one energy pulse across the arena — larger near you, fading with distance; up to 65 damage, reduced the farther the boss is.",
      tuning: {
        chargeMsMax: 2000,
        minChargeMs: 90,
        minDamage: 12,
        maxDamage: 75,
        falloffDistance: 520,
        minDistanceMult: 0.28,
        speedX: 620,
        windupRectWidth: 36,
        windupRectHeight: 20,
        chargeBolt: { ...RANGER_CHARGE_BOLT_VISUAL }
      }
    },
    utility: {
      type: "superJump",
      name: "Skyrise Leap",
      cooldownMs: 10000,
      description:
        "Channel leg strength into a towering jump. On takeoff, drops a smoke cloud that briefly stuns the boss and deals 15 damage per second for 4 seconds while they stand in it.",
      tuning: {
        boostY: 750,
        smokeRadius: 120,
        smokeDurationMs: 4000,
        smokeStunMs: 1500,
        smokeDps: 15
      }
    }
  },
  {
    id: "guardian",
    name: "Guardian",
    blurb:
      "Anchoring tank: cleaves that build Fortitude, a taunting burst that bolts boss aggro to you, and a W parry.",
    color: 0xff8b8b,
    maxHealth: 200,
    speed: 225,
    jumpPower: 550,
    basicAttack: {
      type: "shieldCleave",
      name: "Shield Cleave",
      description:
        "Tower shield sweeps a wide arc. Landing hits grants Fortitude (10% damage reduction, refreshes for 1.5s).",
      damage: 9,
      range: 84,
      cooldownMs: 520,
      tuning: {
        fanSpreadDeg: 75,
        swing: { width: 48, height: 10, angle: 24, offsetX: 34, offsetY: -8, style: "cleave" },
        fortitudeMultiplier: 0.90,
        fortitudeDurationMs: 1500
      }
    },
    ability: {
      type: "shieldBurst",
      name: "Shield Burst",
      cooldownMs: 20000,
      power: 25,
      range: 154,
      durationMs: 5000,
      description:
        "Double-ring burst: allies gain a shield, boss takes a bash, and you Taunt - the boss fixates on you (lower priority for allies) and you take 30% less damage for 4s.",
      tuning: {
        shieldMultiplier: 0.25,
        healAmount: 0,
        tauntDurationMs: 4000,
        tauntDamageMultiplier: 0.70
      }
    },
    utility: {
      type: "parry",
      name: "Aegis Parry",
      cooldownMs: 12500,
      description:
        "Brief guard: block a melee blow to stun the boss, or turn a projectile back at them. Successful parries grant allies 25% damage reduction for 4s.",
      tuning: {
        windowMs: 300,
        meleeStunMs: 3000,
        allyAegisMultiplier: 0.75,
        allyAegisDurationMs: 4000
      }
    }
  },
  {
    id: "striker",
    name: "Striker",
    blurb: "Fast dual-blade fighter: rapid double cuts, a slam that knocks back, and a short blink through threats.",
    color: 0xc288ff,
    maxHealth: 160,
    speed: 295,
    jumpPower: 590,
    basicAttack: {
      type: "doubleStrike",
      name: "Double Strike",
      description: "Twin violet blades: two offset slashes with a pale edge line each swing.",
      damage: 10,
      range: 92,
      cooldownMs: 400,
      tuning: {
        hitboxVerticalRange: 30,
        hitboxYOffset: -10,
        strikeVisualDurationMs: 95,
        secondDelayMs: 90,
        firstSwing: { width: 45, height: 10, angle: 24, offsetX: 32, offsetY: -9, style: "double" },
        secondSwing: { width: 45, height: 10, angle: -16, offsetX: 30, offsetY: -9, style: "double" }
      }
    },
    ability: {
      type: "groundSlam",
      name: "Ground Slam",
      cooldownMs: 12000,
      power: 40,
      range: 150,
      durationMs: 280,
      description: "High leap, heavy slam, and a rebound on a clean hit — shock rings and boss knockback.",
      tuning: {
        windupMs: 130,
        bossKnockbackScale: 75.0,
        strikerHopVelocity: -480,
        strikerHopPeakDelayMs: 220,
        strikerDropVelocity: 820,
        strikerSlamImpactDelayMs: 460,
        strikerBounceOnHitY: -440
      }
    },
    utility: {
      type: "blinkStep",
      name: "Blink Step",
      cooldownMs: 6000,
      description:
        "Snap forward with brief invulnerability. Dodging a non-contact hit grants a purple aura — your next Double Strike deals double damage.",
      tuning: {
        distancePx: 175,
        invulnMs: 400
      }
    }
  },
  {
    id: "summoner",
    name: "Soulcaller",
    blurb:
      "Spirit channeler: homing wisps that weaken the boss, a roaming spirit and turret for pressure, and a decoy shroud that empowers allies.",
    color: 0x58d8e8,
    maxHealth: 100,
    speed: 265,
    jumpPower: 560,
    basicAttack: {
      type: "spiritBolt",
      name: "Spirit Bolt",
      description:
        "Homing spirit wisp. Debuffs the boss to take 15% more damage for 2.5s on hit.",
      damage: 8,
      range: 350,
      cooldownMs: 550,
      tuning: {
        projectileOffsetY: -8,
        projectileSpeedX: 330,
        homingStrength: 0.06,
        debuffMult: 1.15,
        debuffDurationMs: 2500
      }
    },
    ability: {
      type: "soulbondEntities",
      name: "Bound Spirits",
      cooldownMs: 30000,
      power: 0,
      description:
        "Summon two spirits: a roaming wisp that seeks the boss, and a stationary turret that shoots at it. The turret has HP and can be targeted.",
      tuning: {
        wispDurationMs: 10000,
        wispDamage: 4,
        wispFireIntervalMs: 650,
        wispSpeed: 135,
        wispBossEngageRange: 500,
        wispFollowSpeed: 125,
        wispHomeOrbitRadius: 125,
        wispAttackRange: 250,
        wispProjectileMaxRange: 350,
        turretDurationMs: 15000,
        turretHealth: 40,
        turretDamage: 10,
        turretFireIntervalMs: 500,
        turretProjectileSpeed: 500,
        turretAttackRange: 500,
        turretProjectileMaxRange: 520
      }
    },
    utility: {
      type: "soulShroud",
      name: "Soul Shroud",
      cooldownMs: 25000,
      description:
        "Leave a decoy. Turn invisible for 8s—attacks send your soul into the other player, boosting their damage and speed by 50%. Press again to end. Cooldown pauses during stealth.",
      tuning: {
        stealthDurationMs: 8000,
        decoyHealth: 100,
        allyDamageMult: 2,
        allySpeedMult: 1.5,
        soulLinkProjectileSpeed: 550,
        shroudExplosionMaxDamage: 35,
        shroudExplosionRadius: 120
      }
    }
  }
];

function getCharacterById(id) {
  return CHARACTERS.find((character) => character.id === id);
}

window.CHARACTERS = CHARACTERS;
window.getCharacterById = getCharacterById;
/** Boss AI: prefer these for “ranged” targeting bias. */
window.RANGED_CHARACTER_IDS = ["ranger", "medic", "summoner"];
window.CHARGE_BOLT_VISUAL_DEFAULTS = RANGER_CHARGE_BOLT_VISUAL;
window.mergeChargeBoltVisualPartial = mergeChargeBoltVisualPartial;
