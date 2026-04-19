window.gameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  width: 960,
  height: 540,
  backgroundColor: "#1b2230",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: "app",
    width: 960,
    height: 540
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: 1200 },
      debug: false
    }
  },
  scene: [
    window.BootScene,
    window.MainMenuScene,
    window.SettingsScene,
    window.TutorialScene,
    window.CharacterSelectScene,
    window.PrepScene,
    window.MapSelectScene,
    window.BattleScene,
    window.GameOverScene
  ]
};
