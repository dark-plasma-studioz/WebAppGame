/**
 * Rebindable combat keys (attack / ability / utility) per player slot.
 * Movement (WASD / arrows) stays fixed in code.
 */
const COMBAT_KEYS_STORAGE_KEY = "platformerBossCombatKeysV1";

const COMBAT_ACTIONS = ["attack", "ability", "utility"];

/** Defaults match BattleScene PLAYER_CONTROLS combat keys (Phaser key codes). */
const COMBAT_KEY_DEFAULTS = {
  1: { attack: 70, ability: 71, utility: 69 },
  2: { attack: 75, ability: 76, utility: 74 }
};

function cloneDefaults() {
  return {
    1: { ...COMBAT_KEY_DEFAULTS[1] },
    2: { ...COMBAT_KEY_DEFAULTS[2] }
  };
}

function normalizeCombatKeys(raw) {
  const out = cloneDefaults();
  if (!raw || typeof raw !== "object") return out;
  [1, 2].forEach((slot) => {
    const row = raw[slot] || raw[String(slot)];
    if (!row || typeof row !== "object") return;
    COMBAT_ACTIONS.forEach((act) => {
      const v = row[act];
      if (Number.isFinite(v) && v > 0 && v < 256) {
        out[slot][act] = Math.floor(v);
      }
    });
  });
  return out;
}

function loadCombatKeys() {
  try {
    const s = localStorage.getItem(COMBAT_KEYS_STORAGE_KEY);
    if (!s) return cloneDefaults();
    return normalizeCombatKeys(JSON.parse(s));
  } catch (e) {
    return cloneDefaults();
  }
}

function saveCombatKeys(data) {
  try {
    localStorage.setItem(COMBAT_KEYS_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    /* ignore */
  }
}

function getPlayerCombatKeys(slot) {
  const s = slot === 2 ? 2 : 1;
  const data = loadCombatKeys();
  return { ...data[s] };
}

/**
 * Sets one combat binding. If another action on the same player used this key, that action resets to default.
 */
function setPlayerCombatKey(slot, action, keyCode) {
  if (!COMBAT_ACTIONS.includes(action)) return;
  const s = slot === 2 ? 2 : 1;
  const kc = Number.isFinite(keyCode) ? Math.floor(keyCode) : 0;
  if (kc <= 0 || kc >= 256) return;

  const data = loadCombatKeys();
  const row = { ...data[s] };
  COMBAT_ACTIONS.forEach((a) => {
    if (a !== action && row[a] === kc) {
      row[a] = COMBAT_KEY_DEFAULTS[s][a];
    }
  });
  row[action] = kc;
  data[s] = row;
  saveCombatKeys(data);
}

function resetCombatKeysToDefaults() {
  const fresh = cloneDefaults();
  saveCombatKeys(fresh);
  return fresh;
}

/** Short label for settings / HUD (no Phaser dependency). */
function formatCombatKeyCode(keyCode) {
  if (!Number.isFinite(keyCode)) return "?";
  const k = Math.floor(keyCode);
  const map = {
    8: "Bksp",
    9: "Tab",
    13: "Enter",
    16: "Shift",
    17: "Ctrl",
    18: "Alt",
    27: "Esc",
    32: "Space",
    33: "PgUp",
    34: "PgDn",
    35: "End",
    36: "Home",
    37: "Left",
    38: "Up",
    39: "Right",
    40: "Down",
    45: "Ins",
    46: "Del",
    96: "Num0",
    97: "Num1",
    98: "Num2",
    99: "Num3",
    100: "Num4",
    101: "Num5",
    102: "Num6",
    103: "Num7",
    104: "Num8",
    105: "Num9",
    106: "Num*",
    107: "Num+",
    109: "Num-",
    110: "Num.",
    111: "Num/"
  };
  if (map[k]) return map[k];
  if (k >= 65 && k <= 90) return String.fromCharCode(k);
  if (k >= 48 && k <= 57) return String.fromCharCode(k);
  if (k >= 112 && k <= 123) return `F${k - 111}`;
  return `K${k}`;
}

window.COMBAT_KEY_DEFAULTS = COMBAT_KEY_DEFAULTS;
window.getPlayerCombatKeys = getPlayerCombatKeys;
window.setPlayerCombatKey = setPlayerCombatKey;
window.resetCombatKeysToDefaults = resetCombatKeysToDefaults;
window.formatCombatKeyCode = formatCombatKeyCode;
