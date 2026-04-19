/** Tuning for mission difficulty (applied in BattleScene + Boss). */
window.DIFFICULTY_IDS = ["easy", "medium", "hard", "extreme"];

window.DIFFICULTY_PRESETS = {
  easy: {
    label: "Easy",
    hpMult: 0.9,
    cooldownMult: 1.12,
    attackIntervalMult: 1.22,
    outgoingDamageMult: 0.78,
    spawnMult: 0.88,
    categoryRecoveryMult: 1.1
  },
  medium: {
    label: "Medium",
    hpMult: 1,
    cooldownMult: 1,
    attackIntervalMult: 1,
    outgoingDamageMult: 1,
    spawnMult: 1,
    categoryRecoveryMult: 1
  },
  hard: {
    label: "Hard",
    hpMult: 1.12,
    cooldownMult: 0.9,
    attackIntervalMult: 0.82,
    outgoingDamageMult: 1.14,
    spawnMult: 1.1,
    categoryRecoveryMult: 0.9
  },
  extreme: {
    label: "Extreme",
    hpMult: 1.25,
    cooldownMult: 0.8,
    attackIntervalMult: 0.70,
    outgoingDamageMult: 1.25,
    spawnMult: 1.2,
    categoryRecoveryMult: 0.8
  }
};

window.applyDifficultyToBossHealth = function applyDifficultyToBossHealth(definition, difficultyId) {
  const p = window.DIFFICULTY_PRESETS[difficultyId] || window.DIFFICULTY_PRESETS.medium;
  if (!definition || !Number.isFinite(definition.maxHealth)) return;
  definition.maxHealth = Math.max(80, Math.round(definition.maxHealth * p.hpMult));
};
