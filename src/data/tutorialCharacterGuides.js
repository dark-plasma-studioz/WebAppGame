/**
 * Long-form tutorial copy for each hero. Stats (HP / speed / jump) are injected at runtime from CHARACTERS.
 * Keep in sync with gameplay when kits change.
 */
window.TUTORIAL_CHARACTER_GUIDE_BODY = {
  vanguard: [
    "ROLE - Frontline spearman who scales with skillful combos and teamplay. Rewards tight timing and good positioning.",
    "",
    "SPEAR THRUST (attack) - Long melee thrust. On hit the boss is 'Pierced' (+5% vulnerability for 2.5s, stacks with other debuffs). Land another thrust within 1.2s and it becomes a Momentum thrust: 1.5x damage and longer reach. Chain your hits to keep the combo alive.",
    "HEAVENFALL LANCE (ability) - Two lances drop in parallel lanes with a short delay. Landing BOTH on the boss grants 'Skyfallen': your next Spear Thrusts deal +75% damage for 4s, and each thrust hit refreshes the timer. W combio with Momentum.",
    "DASH STRIKE (utility) - Surge forward with invulnerability, hitting the boss hard at impact. Passing ALLIES during the dash grants them 'Rally' (+25% damage for 3s) - smash your team before you hit the boss to buff their damage."
  ],
  medic: [
    "ROLE - Fragile support: every hit and every ward shapes the fight. High skill ceiling - the better you aim, the stronger your heals.",
    "",
    "PULSE BOLT (attack) - Small damage + small ally-heal per hit. Hitting the BOSS builds Resonance (max 3 stacks, 5s fresh). Your next ally-hit consumes all stacks and adds +3 HP per stack to the heal. Tag the boss, then rescue-heal for a huge burst.",
    "HEAL PULSE (ability) - Rooted channel: short windup then team heal + brief damage reduction. You cannot move during the windup - place it where attacks can't reach you.",
    "SANCTUARY VEIL (utility) - Stationary circle that deletes enemy projectiles, heals allies inside (5 HP/s), and burns the boss (8 DPS). Each projectile stripped pulses an extra +3 HP to everyone inside - the more you drop it in a projectile spam, the harder it heals."
  ],
  ranger: [
    "ROLE - Mobile archer: longest honest range on the basic attack and a jump tailored for tall arenas.",
    "",
    "ARROW SHOT (attack) - Straight, fast shots. Keep spacing; don't get too close as your small HP pool will be drained quickly.",
    "POWER SHOT (ability) - Hold the ability key to charge (up to ~2s). The pulse is huge up close and shrinks with distance; damage also falls off with range. Get very close for the highest single-shot damage in the game.",
    "SKYRISE LEAP (utility) - Massive vertical jump. On takeoff, a smoke cloud stuns the boss briefly and ticks damage over time if they stay in it. Use the stun to stop an attack."
  ],
  guardian: [
    "ROLE - Anchoring tank. Holds ground, eats hits, and pulls aggro so the squishies can work.",
    "",
    "SHIELD CLEAVE (attack) - Wide arc in front of you. Each landing cleave grants 'Fortitude' (10% damage reduction for 1.5s, refreshes on hit). Stay in melee to keep it running.",
    "SHIELD BURST (ability) - AoE bash + ally shields + TAUNT. The boss strongly prefers targeting you for 4s and you take 20% less damage during it. Pop it when a teammate is getting focused, or before a heavy boss telegraph so you eat it instead of your team.",
    "AEGIS PARRY (utility) - Short parry window. Melee blocked = long stun on the boss; blocked projectiles turn back at them. A successful parry also grants nearby ALLIES 50% damage reduction for 4s, so a well-read parry saves the whole team."
  ],
  striker: [
    "ROLE - Fast melee skirmisher: two-hit chains, a slam, and a blink with a damage reward for clean dodges. Very high risk, very high reward.",
    "",
    "DOUBLE STRIKE (attack) - Two quick slashes per press; learn the rhythm so you do not whiff the second swing during boss movement.",
    "GROUND SLAM (ability) - Leap and slam for heavy knockback. Useful when you need to buy space or spike the boss into hazards / your team’s zone effects. Try not to shove the boss into a teammate. Thats not nice.",
    "BLINK STEP (utility) - Short teleport with brief invulnerability. If you dodge a non-contact threat during the blink, you gain a double damage buff: your next Double Strike deals double damage, save that proc for a safe window."
  ],
  summoner: [
    "ROLE - Spirit mage: applies a boss vulnerability debuff, summons sustained pressure, and can stealth-buff an ally. Low HP support unit, get your teamate to defend you.",
    "",
    "SPIRIT BOLT (attack) - Summon a homing spirit that applies a short vulnerability debuff (boss takes +10% damage for 2s). Spam it to keep the debuff uptime high.",
    "BOUND SPIRITS (ability) - Spawns two entities: a roaming wisp that hunts the boss and a stationary turret at your feet that shoots until it dies or expires.",
    "SOUL SHROUD (utility) — Drops a decoy at your position while you become stealthed. Attacks buff your ally’s damage and speed. Press utility again to end early; ending causes an AoE around you, damage is higher the shorter you stayed in shroud."
  ]
};

/**
 * @returns {{ title: string, lines: string[] }[]}
 */
window.buildTutorialCharacterGuidePages = function buildTutorialCharacterGuidePages() {
  const Cs = window.CHARACTERS || [];
  const bodies = window.TUTORIAL_CHARACTER_GUIDE_BODY || {};
  const pages = [
    {
      title: "Character guides",
      lines: [
        "One page per hero: how they are meant to be played, what each button does, and tips that are not obvious from the short roster text.",
        "Use Next / Prev (or arrows). Esc returns to the tutorial menu.",
        "",
        `Roster size: ${Cs.length} — flip through with Next.`
      ]
    }
  ];
  Cs.forEach((c) => {
    const extra = bodies[c.id];
    if (!extra || !extra.length) return;
    const statLine = `Stats (current data): HP ${c.maxHealth} · Speed ${c.speed} · Jump ${c.jumpPower}`;
    pages.push({
      title: `${c.name}`,
      lines: [c.blurb || "", "", statLine, "", ...extra]
    });
  });
  return pages;
};
