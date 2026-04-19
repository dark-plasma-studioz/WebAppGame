const HUD_DISPLAY_STORAGE_KEY = "platformerBossHudDisplayMode";

/** @type {readonly ["overhead", "corner", "both"]} */
const HUD_DISPLAY_MODES = ["overhead", "corner", "both"];

function normalizeHudDisplayMode(value) {
  if (value === "overhead" || value === "corner" || value === "both") return value;
  return "both";
}

function getHudDisplayMode() {
  try {
    return normalizeHudDisplayMode(localStorage.getItem(HUD_DISPLAY_STORAGE_KEY));
  } catch (e) {
    return "both";
  }
}

function setHudDisplayMode(mode) {
  const m = normalizeHudDisplayMode(mode);
  try {
    localStorage.setItem(HUD_DISPLAY_STORAGE_KEY, m);
  } catch (e) {
    /* ignore */
  }
  return m;
}

window.HUD_DISPLAY_MODES = HUD_DISPLAY_MODES;
window.getHudDisplayMode = getHudDisplayMode;
window.setHudDisplayMode = setHudDisplayMode;
