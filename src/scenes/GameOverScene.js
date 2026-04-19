class GameOverScene extends Phaser.Scene {
  constructor() {
    super("GameOverScene");
  }

  init(data) {
    this.result = data.result || "defeat";
    this.selectedPlayers = data.selectedPlayers || [];
    this.bossName = data.bossName || "Boss";
    const presets = window.DIFFICULTY_PRESETS;
    const d = data.difficulty;
    this.difficultyId = presets && presets[d] ? d : "medium";
    this.bossChoiceId = data.bossId !== undefined && data.bossId !== null ? data.bossId : "random";
    this.arenaId = data.arenaId || null;
  }

  create() {
    this.add.rectangle(480, 270, 960, 540, 0x111827, 1);

    const isVictory = this.result === "victory";
    const title = isVictory ? "Victory!" : "Defeat!";
    const subtitle = isVictory
      ? `You defeated ${this.bossName}.`
      : `${this.bossName} defeated the party.`;

    this.add.text(480, 190, title, {
      fontSize: "64px",
      color: isVictory ? "#8fffb3" : "#ff9f9f"
    }).setOrigin(0.5);

    this.add.text(480, 260, subtitle, {
      fontSize: "24px",
      color: "#e7efff"
    }).setOrigin(0.5);

    this.add.text(480, 330, "R: Retry battle with same players", {
      fontSize: "20px",
      color: "#d8e6ff"
    }).setOrigin(0.5);

    this.add.text(480, 370, "B: Back to main menu", {
      fontSize: "20px",
      color: "#d8e6ff"
    }).setOrigin(0.5);

    this.keys = this.input.keyboard.addKeys({
      retry: Phaser.Input.Keyboard.KeyCodes.R,
      back: Phaser.Input.Keyboard.KeyCodes.B
    });
    this._navPending = false;
    this._navTimer = null;
    this.events.once("shutdown", () => {
      if (this._navTimer) {
        try {
          this._navTimer.remove(false);
        } catch (e) {
          /* ignore */
        }
        this._navTimer = null;
      }
      this._navPending = false;
    });
    if (this.input?.keyboard) {
      this.input.keyboard.enabled = true;
    }
  }

  queueGoBattle() {
    if (this._navPending) return;
    this._navPending = true;
    if (this._navTimer) {
      try {
        this._navTimer.remove(false);
      } catch (e) {
        /* ignore */
      }
      this._navTimer = null;
    }
    const payload = {
      selectedPlayers: this.selectedPlayers,
      difficulty: this.difficultyId,
      bossId: this.bossChoiceId,
      arenaId: this.arenaId
    };
    this._navTimer = this.time.delayedCall(0, () => {
      this._navTimer = null;
      const sp = this.scene;
      if (!sp || !sp.isActive("GameOverScene")) {
        this._navPending = false;
        return;
      }
      sp.start("BattleScene", payload);
    });
  }

  queueGoMainMenu() {
    if (this._navPending) return;
    this._navPending = true;
    if (this._navTimer) {
      try {
        this._navTimer.remove(false);
      } catch (e) {
        /* ignore */
      }
      this._navTimer = null;
    }
    this._navTimer = this.time.delayedCall(0, () => {
      this._navTimer = null;
      const sp = this.scene;
      if (!sp || !sp.isActive("GameOverScene")) {
        this._navPending = false;
        return;
      }
      sp.start("MainMenuScene");
    });
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.keys.retry)) {
      this.queueGoBattle();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.back)) {
      this.queueGoMainMenu();
    }
  }
}

window.GameOverScene = GameOverScene;
