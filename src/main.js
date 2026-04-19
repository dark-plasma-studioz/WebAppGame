(function bootGame() {
  const app = document.getElementById("app");
  if (typeof Phaser === "undefined") {
    const msg =
      "Phaser did not load. If you opened index.html as a file, use a local web server, or check that the CDN script is not blocked.";
    console.error(msg);
    if (app) {
      app.innerHTML = `<p style="padding:24px;font-family:sans-serif;color:#ffb0b0;max-width:520px">${msg}</p>`;
    }
    return;
  }
  if (
    !window.BootScene ||
    !window.MainMenuScene ||
    !window.SettingsScene ||
    !window.TutorialScene ||
    !window.CharacterSelectScene ||
    !window.PrepScene ||
    !window.BattleScene ||
    !window.GameOverScene
  ) {
    const msg =
      "A game script failed before scenes were registered. Open the console (F12) — often a syntax error in the last loaded file before main.js.";
    console.error(msg, {
      BootScene: !!window.BootScene,
      MainMenuScene: !!window.MainMenuScene,
      SettingsScene: !!window.SettingsScene,
      TutorialScene: !!window.TutorialScene,
      CharacterSelectScene: !!window.CharacterSelectScene,
      PrepScene: !!window.PrepScene,
      BattleScene: !!window.BattleScene,
      GameOverScene: !!window.GameOverScene
    });
    if (app) {
      app.innerHTML = `<p style="padding:24px;font-family:sans-serif;color:#ffb0b0;max-width:560px">${msg}</p>`;
    }
    return;
  }

  let game;
  try {
    game = new Phaser.Game(window.gameConfig);
  } catch (err) {
    console.error("Phaser.Game failed", err);
    if (app) {
      app.innerHTML = `<p style="padding:24px;font-family:sans-serif;color:#ffb0b0">Phaser.Game failed: ${String(
        err && err.message ? err.message : err
      )}</p>`;
    }
    return;
  }

  window.addEventListener("focus", () => {
  const kb = game.input?.keyboard;
  if (kb && typeof kb.resetKeys === "function") {
    try {
      kb.resetKeys();
    } catch (e) {
      /* ignore */
    }
  }
  });
})();
