class SettingsScene extends Phaser.Scene {
  constructor() {
    super("SettingsScene");
    this._rebindState = null;
    this._onCombatKeyCapture = this._onCombatKeyCapture.bind(this);
  }

  create() {
    this.createBackdrop();

    const headerZ = 6;
    this.add.rectangle(480, 38, 760, 52, 0x111e34, 0.84).setStrokeStyle(2, 0x5e88c6, 0.9).setDepth(headerZ);
    this.add
      .text(480, 32, "SETTINGS", {
        fontSize: "26px",
        color: "#f2f7ff",
        fontStyle: "bold",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      })
      .setOrigin(0.5)
      .setDepth(headerZ + 1);

    const current = typeof window.getHudDisplayMode === "function" ? window.getHudDisplayMode() : "both";

    this.add
      .text(
        480,
        78,
        "HUD: health & cooldown bars — saved automatically.",
        {
          fontSize: "11px",
          color: "#b8cce8",
          fontFamily: "Consolas, Monaco, 'Courier New', monospace",
          align: "center",
          lineSpacing: 3
        }
      )
      .setOrigin(0.5)
      .setDepth(headerZ + 1);

    const modes = [
      { id: "overhead", title: "Above heads only", sub: "Bars follow each hero in the arena" },
      { id: "corner", title: "Corners only", sub: "Compact bars in lower-left / lower-right" },
      { id: "both", title: "Both", sub: "Corners and overhead bars" }
    ];

    this._hudModeSelected = current;
    this._hudModeRows = [];

    this.refreshHudModeStyles = () => {
      this._hudModeRows.forEach((row) => {
        const on = row.id === this._hudModeSelected;
        row.rect.setFillStyle(on ? 0x1f3a58 : 0x152238, 0.98);
        row.rect.setStrokeStyle(2, on ? 0x8ec8ff : 0x5e88c6, on ? 1 : 0.85);
      });
    };

    modes.forEach((m, i) => {
      const y = 128 + i * 62;
      const rect = this.add
        .rectangle(480, y, 400, 52, 0x152238, 0.95)
        .setStrokeStyle(2, 0x5e88c6, 0.95)
        .setInteractive({ useHandCursor: true })
        .setDepth(10)
        .on("pointerover", () => {
          if (m.id !== this._hudModeSelected) rect.setFillStyle(0x1a2d48, 0.98);
        })
        .on("pointerout", () => this.refreshHudModeStyles())
        .on("pointerdown", () => {
          this._hudModeSelected = m.id;
          if (typeof window.setHudDisplayMode === "function") {
            window.setHudDisplayMode(this._hudModeSelected);
          }
          this.refreshHudModeStyles();
        });
      this.add
        .text(480, y - 8, m.title, {
          fontSize: "15px",
          color: "#ffffff",
          fontStyle: "bold",
          fontFamily: "Consolas, Monaco, 'Courier New', monospace"
        })
        .setOrigin(0.5)
        .setDepth(11);
      this.add
        .text(480, y + 10, m.sub, {
          fontSize: "10px",
          color: "#9fb8d8",
          fontFamily: "Consolas, Monaco, 'Courier New', monospace"
        })
        .setOrigin(0.5)
        .setDepth(11);
      this._hudModeRows.push({ id: m.id, rect });
    });
    this.refreshHudModeStyles();

    this.add
      .text(480, 318, "Combat keys (in battle) — movement stays WASD / arrows + jump.", {
        fontSize: "11px",
        color: "#c8dcf0",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace",
        align: "center",
        wordWrap: { width: 820 }
      })
      .setOrigin(0.5)
      .setDepth(11);

    this.add
      .text(480, 338, "Click a box, then press a key. Esc cancels. Same key twice moves the other binding to default.", {
        fontSize: "9px",
        color: "#7a94b8",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace",
        align: "center",
        wordWrap: { width: 820 }
      })
      .setOrigin(0.5)
      .setDepth(11);

    this._combatBindTexts = {};
    const actionIds = ["attack", "ability", "utility"];
    const actionTitles = ["Attack", "Ability", "Utility"];
    const rowY = [356, 388];
    /** Column centers: labels left of anchor, key boxes shifted right so text does not touch buttons. */
    const colStep = 250;
    const col0 = 210;

    [1, 2].forEach((slot, ri) => {
      const y = rowY[ri];
      this.add
        .text(56, y, `P${slot}`, {
          fontSize: "13px",
          color: slot === 1 ? "#9fd4ff" : "#b8ffd8",
          fontStyle: "bold",
          fontFamily: "Consolas, Monaco, 'Courier New', monospace"
        })
        .setOrigin(0, 0.5)
        .setDepth(11);
      actionIds.forEach((act, ai) => {
        const col = col0 + ai * colStep;
        const labelX = col - 52;
        const btnX = col + 72;
        this.add
          .text(labelX, y, `${actionTitles[ai]}`, {
            fontSize: "10px",
            color: "#8ea8c8",
            fontFamily: "Consolas, Monaco, 'Courier New', monospace"
          })
          .setOrigin(0, 0.5)
          .setDepth(11);
        const btn = this.add
          .rectangle(btnX, y, 76, 26, 0x152238, 0.96)
          .setStrokeStyle(2, 0x5e88c6, 0.9)
          .setInteractive({ useHandCursor: true })
          .setDepth(11);
        const fmt = typeof window.formatCombatKeyCode === "function" ? window.formatCombatKeyCode : (c) => String(c);
        const keys = typeof window.getPlayerCombatKeys === "function" ? window.getPlayerCombatKeys(slot) : {};
        const txt = this.add
          .text(btnX, y, fmt(keys[act]), {
            fontSize: "14px",
            color: "#e8f4ff",
            fontFamily: "Consolas, Monaco, 'Courier New', monospace"
          })
          .setOrigin(0.5)
          .setDepth(12);
        this._combatBindTexts[`${slot}_${act}`] = txt;
        btn.on("pointerover", () => {
          if (!this._rebindState || this._rebindState.text !== txt) btn.setFillStyle(0x1a3050, 0.98);
        });
        btn.on("pointerout", () => btn.setFillStyle(0x152238, 0.96));
        btn.on("pointerdown", () => {
          this.beginCombatRebind(slot, act, txt, btn);
        });
      });
    });

    const resetY = 424;
    const resetBtn = this.add
      .rectangle(480, resetY, 320, 32, 0x152238, 0.95)
      .setStrokeStyle(2, 0x6a7898, 0.85)
      .setInteractive({ useHandCursor: true })
      .setDepth(10)
      .on("pointerover", () => resetBtn.setFillStyle(0x1a2d48, 0.98))
      .on("pointerout", () => resetBtn.setFillStyle(0x152238, 0.95))
      .on("pointerdown", () => {
        if (typeof window.resetCombatKeysToDefaults === "function") {
          window.resetCombatKeysToDefaults();
        }
        this.refreshCombatBindLabels();
      });
    this.add
      .text(480, resetY, "Reset combat keys to defaults", {
        fontSize: "12px",
        color: "#c8d8e8",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      })
      .setOrigin(0.5)
      .setDepth(11);

    const backY = 472;
    const back = this.add
      .rectangle(480, backY, 280, 40, 0x152238, 0.95)
      .setStrokeStyle(2, 0x5e88c6, 0.95)
      .setInteractive({ useHandCursor: true })
      .setDepth(10)
      .on("pointerover", () => back.setFillStyle(0x1a2d48, 0.98))
      .on("pointerout", () => back.setFillStyle(0x152238, 0.95))
      .on("pointerdown", () => this.exitToMenu());
    this.add
      .text(480, backY, "Back to main menu", {
        fontSize: "15px",
        color: "#e8f0ff",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      })
      .setOrigin(0.5)
      .setDepth(11);

    this.add
      .text(
        480,
        514,
        "ESC — back   ·   1 / 2 / 3 — HUD layout   ·   Rebind keys for attack / ability / utility above",
        {
          fontSize: "10px",
          color: "#6a86a8",
          fontFamily: "Consolas, Monaco, 'Courier New', monospace",
          align: "center",
          wordWrap: { width: 900 }
        }
      )
      .setOrigin(0.5)
      .setDepth(11);

    this.keys = this.input.keyboard.addKeys({
      esc: Phaser.Input.Keyboard.KeyCodes.ESC,
      one: Phaser.Input.Keyboard.KeyCodes.ONE,
      two: Phaser.Input.Keyboard.KeyCodes.TWO,
      three: Phaser.Input.Keyboard.KeyCodes.THREE,
      numpadOne: Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE,
      numpadTwo: Phaser.Input.Keyboard.KeyCodes.NUMPAD_TWO,
      numpadThree: Phaser.Input.Keyboard.KeyCodes.NUMPAD_THREE
    });

    this.events.once("shutdown", () => this.cancelCombatRebind());
  }

  exitToMenu() {
    this.cancelCombatRebind();
    this.scene.start("MainMenuScene");
  }

  refreshCombatBindLabels() {
    const fmt = typeof window.formatCombatKeyCode === "function" ? window.formatCombatKeyCode : (c) => String(c);
    [1, 2].forEach((slot) => {
      const keys = typeof window.getPlayerCombatKeys === "function" ? window.getPlayerCombatKeys(slot) : {};
      ["attack", "ability", "utility"].forEach((act) => {
        const t = this._combatBindTexts[`${slot}_${act}`];
        if (t && t.active) t.setText(fmt(keys[act]));
      });
    });
  }

  beginCombatRebind(slot, action, text, btn) {
    this.cancelCombatRebind();
    this._rebindState = { slot, action, text, btn };
    text.setText("···");
    if (btn) btn.setFillStyle(0x2a5080, 0.98);
    this.input.keyboard.on("keydown", this._onCombatKeyCapture);
  }

  cancelCombatRebind() {
    if (this._rebindState) {
      this.input.keyboard.off("keydown", this._onCombatKeyCapture);
      const { slot, action, text, btn } = this._rebindState;
      const fmt = typeof window.formatCombatKeyCode === "function" ? window.formatCombatKeyCode : (c) => String(c);
      if (text && text.active) {
        const keys = typeof window.getPlayerCombatKeys === "function" ? window.getPlayerCombatKeys(slot) : {};
        text.setText(fmt(keys[action]));
      }
      if (btn && btn.active) btn.setFillStyle(0x152238, 0.96);
      this._rebindState = null;
    }
  }

  _onCombatKeyCapture(event) {
    if (!this._rebindState) return;
    const dom = event && event.originalEvent ? event.originalEvent : event;
    const kc = dom?.keyCode ?? dom?.which ?? event?.keyCode;
    if (!Number.isFinite(kc) || kc <= 0) return;

    if (kc === Phaser.Input.Keyboard.KeyCodes.ESC) {
      this.cancelCombatRebind();
      return;
    }

    if (typeof dom.preventDefault === "function") dom.preventDefault();

    const { slot, action, btn } = this._rebindState;
    if (typeof window.setPlayerCombatKey === "function") {
      window.setPlayerCombatKey(slot, action, kc);
    }
    this.input.keyboard.off("keydown", this._onCombatKeyCapture);
    this._rebindState = null;
    if (btn && btn.active) btn.setFillStyle(0x152238, 0.96);
    this.refreshCombatBindLabels();
  }

  createBackdrop() {
    const z = -8;
    const bg = this.add.graphics();
    bg.setDepth(z);
    bg.fillGradientStyle(0x060a12, 0x0f1a2e, 0x0a1528, 0x152a48, 1, 1, 1, 1);
    bg.fillRect(0, 0, 960, 540);
  }

  update() {
    if (this._rebindState) {
      if (Phaser.Input.Keyboard.JustDown(this.keys.esc)) {
        this.cancelCombatRebind();
      }
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.esc)) {
      this.exitToMenu();
      return;
    }
    const pick = (id) => {
      this._hudModeSelected = id;
      if (typeof window.setHudDisplayMode === "function") {
        window.setHudDisplayMode(id);
      }
      this.refreshHudModeStyles();
    };
    if (Phaser.Input.Keyboard.JustDown(this.keys.one) || Phaser.Input.Keyboard.JustDown(this.keys.numpadOne)) {
      pick("overhead");
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.two) || Phaser.Input.Keyboard.JustDown(this.keys.numpadTwo)) {
      pick("corner");
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.three) || Phaser.Input.Keyboard.JustDown(this.keys.numpadThree)) {
      pick("both");
    }
  }
}

window.SettingsScene = SettingsScene;
