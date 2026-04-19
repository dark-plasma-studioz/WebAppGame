class MainMenuScene extends Phaser.Scene {
  constructor() {
    super("MainMenuScene");
  }

  create() {
    this.createBackdrop();

    const headerZ = 6;
    this.add.rectangle(480, 42, 720, 56, 0x111e34, 0.84).setStrokeStyle(2, 0x5e88c6, 0.9).setDepth(headerZ);
    this.add
      .text(480, 28, "PLATFORMER BOSS", {
        fontSize: "28px",
        color: "#f2f7ff",
        fontStyle: "bold",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      })
      .setOrigin(0.5)
      .setDepth(headerZ + 1);
    this.add
      .text(480, 52, "Squad vs. one big health bar · local 1–2 players", {
        fontSize: "12px",
        color: "#b8cce8",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      })
      .setOrigin(0.5)
      .setDepth(headerZ + 1);

    const statusZ = 38;
    this.add
      .rectangle(480, 86, 920, 36, 0x0f1a2e, 0.95)
      .setStrokeStyle(2, 0x4f74a8, 0.92)
      .setDepth(statusZ);
    this.add
      .text(48, 74, "SESSION", {
        fontSize: "11px",
        color: "#7aa8d8",
        fontStyle: "bold",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      })
      .setOrigin(0, 0)
      .setDepth(statusZ + 1);
    this.add
      .text(
        480,
        86,
        "Deploy to pick heroes · Tutorial hub (full walkthrough + character guides) · Settings for HUD layout and rebinding attack / ability / utility keys.",
        {
        fontSize: "13px",
        color: "#d7e7ff",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace",
        wordWrap: { width: 780, useAdvancedWrap: true },
        align: "center",
        lineSpacing: 2
      })
      .setOrigin(0.5, 0.5)
      .setDepth(statusZ + 1);

    const mkBtn = (y, label, sub, onClick) => {
      const w = 300;
      const h = 52;
      const bx = 480;
      const rect = this.add
        .rectangle(bx, y, w, h, 0x152238, 0.95)
        .setStrokeStyle(2, 0x5e88c6, 0.95)
        .setInteractive({ useHandCursor: true })
        .on("pointerover", () => rect.setFillStyle(0x1a2d48, 0.98))
        .on("pointerout", () => rect.setFillStyle(0x152238, 0.95))
        .on("pointerdown", onClick);
      this.add
        .text(bx, y - 8, label, {
          fontSize: "20px",
          color: "#ffffff",
          fontStyle: "bold",
          fontFamily: "Consolas, Monaco, 'Courier New', monospace"
        })
        .setOrigin(0.5);
      if (sub) {
        this.add
          .text(bx, y + 16, sub, {
            fontSize: "11px",
            color: "#9fb8d8",
            fontFamily: "Consolas, Monaco, 'Courier New', monospace"
          })
          .setOrigin(0.5);
      }
      return rect;
    };

    mkBtn(220, "Deploy", "Choose heroes and launch a battle", () => {
      this.goCharacterSelect();
    });
    mkBtn(296, "Tutorial", "Full tutorial, character guides, or both", () => {
      this.goTutorial();
    });
    mkBtn(372, "Settings", "HUD layout + combat keybinds (saved)", () => {
      this.goSettings();
    });

    this.add
      .text(480, 448, "Click a button  ·  1 Deploy  ·  2 Tutorial  ·  3 Settings", {
        fontSize: "11px",
        color: "#6a86a8",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      })
      .setOrigin(0.5);

    this.keys = this.input.keyboard.addKeys({
      one: Phaser.Input.Keyboard.KeyCodes.ONE,
      two: Phaser.Input.Keyboard.KeyCodes.TWO,
      three: Phaser.Input.Keyboard.KeyCodes.THREE,
      numpadOne: Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE,
      numpadTwo: Phaser.Input.Keyboard.KeyCodes.NUMPAD_TWO,
      numpadThree: Phaser.Input.Keyboard.KeyCodes.NUMPAD_THREE
    });
    if (this.input?.keyboard) {
      this.input.keyboard.enabled = true;
    }
  }

  createBackdrop() {
    const z = -8;
    const bg = this.add.graphics();
    bg.setDepth(z);
    bg.fillGradientStyle(0x060a12, 0x0f1a2e, 0x0a1528, 0x152a48, 1, 1, 1, 1);
    bg.fillRect(0, 0, 960, 540);
    this.add.circle(140, 100, 120, 0x2a4580, 0.22).setDepth(z);
    this.add.circle(860, 90, 100, 0x6b42a8, 0.18).setDepth(z);
    this.add.circle(720, 420, 200, 0x1f7d88, 0.1).setDepth(z);
    this.add.rectangle(480, 96, 920, 2, 0x6db4ff, 0.35).setDepth(z);
    const stars = this.add.graphics();
    stars.setDepth(z);
    for (let i = 0; i < 50; i += 1) {
      stars.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.04, 0.14));
      stars.fillCircle(Phaser.Math.Between(0, 960), Phaser.Math.Between(0, 280), Phaser.Math.Between(1, 2));
    }
  }

  goCharacterSelect() {
    this.scene.start("CharacterSelectScene");
  }

  goTutorial() {
    this.scene.start("TutorialScene");
  }

  goSettings() {
    this.scene.start("SettingsScene");
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.keys.one) || Phaser.Input.Keyboard.JustDown(this.keys.numpadOne)) {
      this.goCharacterSelect();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.two) || Phaser.Input.Keyboard.JustDown(this.keys.numpadTwo)) {
      this.goTutorial();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.three) || Phaser.Input.Keyboard.JustDown(this.keys.numpadThree)) {
      this.goSettings();
    }
  }
}

window.MainMenuScene = MainMenuScene;
