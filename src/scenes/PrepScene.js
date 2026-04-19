class PrepScene extends Phaser.Scene {
  constructor() {
    super("PrepScene");
  }

  init(data) {
    this.selectedPlayers = data?.selectedPlayers || [];
    this._restoreDifficulty = data?.difficulty || null;
    this._restoreBoss = data?.bossId || null;
  }

  create() {
    const diffs = window.DIFFICULTY_IDS;
    this.difficultyId = "medium";
    this.bossChoiceId = "random";

    const bosses = window.BOSSES || [];
    this.bossEntries = [
      ...bosses.map((b) => ({
        id: b.id,
        name: b.name,
        brief: b.brief || "",
        color: b.color,
        isRandom: false
      })),
      {
        id: "random",
        name: "Random",
        brief: "A boss is rolled when the battle starts—same modifiers as picking one directly.",
        color: 0xffdd77,
        isRandom: true
      }
    ];
    this._tweenBusy = false;
    this.carouselIndex = this.bossEntries.length - 1; // default: Random

    this._buildScene(diffs);

    const restoreDiff = this._restoreDifficulty && diffs.includes(this._restoreDifficulty)
      ? this._restoreDifficulty : "medium";
    this.setDifficulty(restoreDiff, diffs.indexOf(restoreDiff));

    const restoreBoss = this._restoreBoss || "random";
    const ri = this.bossEntries.findIndex((e) => e.id === restoreBoss);
    if (ri >= 0) this.carouselIndex = ri;
    this.refreshPreview(true);

    if (this.input?.keyboard) this.input.keyboard.enabled = true;
  }

  // ─── scene construction ───────────────────────────────────────────────────

  _buildScene(diffs) {
    this._createBackdrop();
    this._createHeader();
    this._createDifficultySection(diffs);
    this._createTargetLabel();
    this._createPreviewArea();
    this._createArrows();
    this._createInfoPanel();
    this._createDotIndicators();
    this._createLaunchButton();
    this._createControls();
  }

  _createBackdrop() {
    const g = this.add.graphics().setDepth(-10);
    g.fillGradientStyle(0x060a12, 0x0f1a2e, 0x0a1528, 0x152a48, 1, 1, 1, 1);
    g.fillRect(0, 0, 960, 540);
    this.add.rectangle(480, 62, 920, 2, 0x6db4ff, 0.3).setDepth(-10);
  }

  _createHeader() {
    this.add.text(480, 22, "MISSION PARAMETERS", {
      fontSize: "26px", color: "#f2f7ff", fontStyle: "bold",
      fontFamily: "Consolas, Monaco, 'Courier New', monospace"
    }).setOrigin(0.5);
    this.add.text(480, 48, "Set difficulty and choose your target.", {
      fontSize: "12px", color: "#8eaacc",
      fontFamily: "Consolas, Monaco, 'Courier New', monospace"
    }).setOrigin(0.5);
  }

  _createDifficultySection(diffs) {
    this.add.text(48, 78, "// DIFFICULTY", {
      fontSize: "13px", color: "#8ec5ff", fontStyle: "bold",
      fontFamily: "Consolas, Monaco, 'Courier New', monospace"
    });

    this.difficultyButtons = [];
    const diffLabels = diffs.map((id) => window.DIFFICULTY_PRESETS[id]?.label || id);
    const nDiff = diffs.length;
    const btnW = nDiff > 3 ? 154 : 168;
    const gap = nDiff > 3 ? 8 : 32;
    const step = btnW + gap;
    const firstCenterX = 480 - ((nDiff - 1) * step) / 2;
    diffs.forEach((id, i) => {
      const x = firstCenterX + i * step;
      const rect = this.add
        .rectangle(x, 112, btnW, 36, 0x152238, 0.96)
        .setStrokeStyle(2, 0x5e88c6, 0.85)
        .setInteractive({ useHandCursor: true })
        .on("pointerover", () => this._hoverDifficulty(i))
        .on("pointerout", () => this._hoverDifficulty(-1))
        .on("pointerdown", () => this.setDifficulty(id, i));
      const txt = this.add.text(x, 112, diffLabels[i], {
        fontSize: "15px", color: "#c8d8e8",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      }).setOrigin(0.5);
      this.difficultyButtons.push({ id, rect, text: txt });
    });

    this.modLine = this.add.text(480, 137, "", {
      fontSize: "10px", color: "#5a7898", align: "center",
      fontFamily: "Consolas, Monaco, 'Courier New', monospace"
    }).setOrigin(0.5);
  }

  _createTargetLabel() {
    this.add.text(48, 155, "// TARGET", {
      fontSize: "13px", color: "#8ec5ff", fontStyle: "bold",
      fontFamily: "Consolas, Monaco, 'Courier New', monospace"
    });
  }

  _createPreviewArea() {
    // Static border frame — never moves
    const border = this.add.graphics().setDepth(4);
    border.lineStyle(2, 0x4a6a9a, 0.8);
    border.strokeRoundedRect(178, 175, 604, 190, 6);

    // Sliding container — only the artwork inside here
    this.previewContainer = this.add.container(480, 270).setDepth(5);
    this.previewBg = this.add.graphics();
    this.previewContainer.add(this.previewBg);
  }

  _createArrows() {
    this.leftArrow = this.add.text(110, 270, "\u25C0", {
      fontSize: "34px", color: "#6db4ff", fontFamily: "Arial"
    }).setOrigin(0.5).setDepth(6)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.cycleEntry(-1))
      .on("pointerover", () => this.leftArrow.setColor("#ffffff"))
      .on("pointerout", () => this.leftArrow.setColor("#6db4ff"));

    this.rightArrow = this.add.text(850, 270, "\u25B6", {
      fontSize: "34px", color: "#6db4ff", fontFamily: "Arial"
    }).setOrigin(0.5).setDepth(6)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.cycleEntry(1))
      .on("pointerover", () => this.rightArrow.setColor("#ffffff"))
      .on("pointerout", () => this.rightArrow.setColor("#6db4ff"));
  }

  _createInfoPanel() {
    // These are static text objects — NOT inside the tween container
    this.bossCount = this.add.text(480, 389, "", {
      fontSize: "10px", color: "#5a7898",
      fontFamily: "Consolas, Monaco, 'Courier New', monospace"
    }).setOrigin(0.5).setDepth(6);

    this.bossName = this.add.text(480, 405, "", {
      fontSize: "20px", color: "#e8f0ff", fontStyle: "bold",
      fontFamily: "Consolas, Monaco, 'Courier New', monospace"
    }).setOrigin(0.5).setDepth(6);

    this.bossBrief = this.add.text(480, 428, "", {
      fontSize: "11px", color: "#8ea8c8",
      fontFamily: "Consolas, Monaco, 'Courier New', monospace",
      wordWrap: { width: 560 }, align: "center", lineSpacing: 3
    }).setOrigin(0.5, 0).setDepth(6);
  }

  _createDotIndicators() {
    this.dots = [];
    const n = this.bossEntries.length;
    const gap = 16;
    const startX = 480 - ((n - 1) * gap) / 2;
    for (let i = 0; i < n; i++) {
      const dot = this.add.circle(startX + i * gap, 375, 4, 0x4a6a9a, 0.6).setDepth(6);
      this.dots.push(dot);
    }
  }

  _createLaunchButton() {
    this.launchBtn = this.add
      .rectangle(480, 470, 256, 42, 0x1e3d2a, 0.96)
      .setStrokeStyle(2, 0x66f09e, 0.95)
      .setInteractive({ useHandCursor: true })
      .on("pointerover", () => this.launchBtn.setFillStyle(0x254d38, 0.98))
      .on("pointerout", () => this.launchBtn.setFillStyle(0x1e3d2a, 0.96))
      .on("pointerdown", () => this.launchBattle());
    this.add.text(480, 470, "SELECT MAP  (SPACE)", {
      fontSize: "16px", color: "#c8ffd8", fontStyle: "bold",
      fontFamily: "Consolas, Monaco, 'Courier New', monospace"
    }).setOrigin(0.5);
  }

  _createControls() {
    this.add.text(480, 518,
      "ESC — back  \u00B7  1 / 2 / 3 / 4 — difficulty  \u00B7  A / D or [\u2190][\u2192] — target  \u00B7  ENTER — launch", {
        fontSize: "10px", color: "#4a6888",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      }).setOrigin(0.5);

    this.keys = this.input.keyboard.addKeys({
      esc: Phaser.Input.Keyboard.KeyCodes.ESC,
      one: Phaser.Input.Keyboard.KeyCodes.ONE,
      two: Phaser.Input.Keyboard.KeyCodes.TWO,
      three: Phaser.Input.Keyboard.KeyCodes.THREE,
      four: Phaser.Input.Keyboard.KeyCodes.FOUR,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE
    });
  }

  // ─── difficulty ───────────────────────────────────────────────────────────

  _hoverDifficulty(hoverIdx) {
    this.difficultyButtons.forEach((b, i) => {
      const sel = b.id === this.difficultyId;
      b.rect.setFillStyle(i === hoverIdx ? 0x1f3350 : (sel ? 0x172d4a : 0x152238), 0.96);
    });
  }

  setDifficulty(id, index) {
    this.difficultyId = id;
    const diffs = window.DIFFICULTY_IDS;
    const idx = index >= 0 ? index : diffs.indexOf(id);
    this.difficultyButtons.forEach((b, i) => {
      const sel = i === idx;
      b.rect.setFillStyle(sel ? 0x172d4a : 0x152238, 0.96);
      b.rect.setStrokeStyle(sel ? 3 : 2, sel ? 0x8ec5ff : 0x5e88c6, 1);
      b.text.setColor(sel ? "#ffffff" : "#8eaac8");
    });
    const d = window.DIFFICULTY_PRESETS[id] || window.DIFFICULTY_PRESETS.medium;
    const cadence = d.attackIntervalMult < 1 ? "faster" : d.attackIntervalMult > 1 ? "slower" : "normal";
    this.modLine.setText(
      `${d.label}  \u2014  boss HP ${Math.round(d.hpMult * 100)}%  \u00B7  ` +
      `attack cadence ${cadence}  \u00B7  boss damage ${Math.round(d.outgoingDamageMult * 100)}%  \u00B7  ` +
      `volley density ~${Math.round(d.spawnMult * 100)}%`
    );
  }

  // ─── carousel ─────────────────────────────────────────────────────────────

  refreshPreview(instant) {
    const entry = this.bossEntries[this.carouselIndex];
    if (!entry) return;

    // ── artwork (inside tween container, local coords centred at 0,0) ──
    const g = this.previewBg;
    g.clear();
    const pw = 580;
    const ph = 176; // must fit inside the 190px border (190 - 7px padding each side = 176)
    const hw = pw / 2;
    const hh = ph / 2;

    if (entry.isRandom) {
      g.fillStyle(0x141c2e, 1);
      g.fillRoundedRect(-hw, -hh, pw, ph, 5);
      g.lineStyle(2, 0xffcc66, 0.8);
      g.strokeRoundedRect(-hw, -hh, pw, ph, 5);
      for (let i = 0; i < 22; i++) {
        g.fillStyle(0xffdd99, Phaser.Math.FloatBetween(0.04, 0.13));
        g.fillCircle(
          Phaser.Math.Between(-hw + 30, hw - 30),
          Phaser.Math.Between(-hh + 20, hh - 20),
          Phaser.Math.Between(1, 3)
        );
      }
    } else {
      const c = entry.color;
      g.fillStyle(0x07090f, 1);
      g.fillRoundedRect(-hw, -hh, pw, ph, 5);
      g.fillStyle(c, 0.32);
      g.fillRoundedRect(-hw + 16, -hh + 14, pw - 32, ph - 28, 4);
      g.lineStyle(2, c, 0.9);
      g.strokeRoundedRect(-hw, -hh, pw, ph, 5);
      for (let i = 0; i < 32; i++) {
        g.fillStyle(c, Phaser.Math.FloatBetween(0.03, 0.09));
        g.fillCircle(
          Phaser.Math.Between(-hw + 20, hw - 20),
          Phaser.Math.Between(-hh + 16, hh - 16),
          Phaser.Math.Between(1, 2)
        );
      }
    }

    // ── static text labels (outside container, update instantly) ──
    this.bossName.setText(entry.name);
    this.bossName.setColor(entry.isRandom ? "#ffe8b8" : "#e8f0ff");
    this.bossBrief.setText(entry.brief);
    this.bossCount.setText(`${this.carouselIndex + 1} / ${this.bossEntries.length}`);

    this.dots.forEach((dot, i) => {
      const on = i === this.carouselIndex;
      dot.setFillStyle(on ? 0x8ec5ff : 0x3a5070, on ? 1 : 0.5);
      dot.setRadius(on ? 5 : 3.5);
    });

    if (!instant) {
      this.previewContainer.setAlpha(0);
      this.tweens.add({ targets: this.previewContainer, alpha: 1, duration: 180, ease: "Quad.easeOut" });
    }
  }

  cycleEntry(dir) {
    if (this._tweenBusy || this.bossEntries.length <= 1) return;
    this._tweenBusy = true;
    const n = this.bossEntries.length;
    this.tweens.add({
      targets: this.previewContainer,
      x: 480 - dir * 120,
      alpha: 0,
      duration: 120,
      ease: "Quad.easeIn",
      onComplete: () => {
        this.carouselIndex = (this.carouselIndex + dir + n) % n;
        this.bossChoiceId = this.bossEntries[this.carouselIndex].id;
        this.previewContainer.setPosition(480 + dir * 120, 270);
        this.refreshPreview(true);
        this.tweens.add({
          targets: this.previewContainer,
          x: 480, alpha: 1,
          duration: 140,
          ease: "Quad.easeOut",
          onComplete: () => { this._tweenBusy = false; }
        });
      }
    });
  }

  // ─── navigation ───────────────────────────────────────────────────────────

  launchBattle() {
    this.scene.start("MapSelectScene", {
      selectedPlayers: this.selectedPlayers,
      difficulty: this.difficultyId,
      bossId: this.bossChoiceId
    });
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.keys.esc)) {
      this.scene.start("CharacterSelectScene");
      return;
    }
    const diffKeys = [this.keys.one, this.keys.two, this.keys.three, this.keys.four];
    const diffs = window.DIFFICULTY_IDS;
    for (let i = 0; i < diffs.length && i < diffKeys.length; i++) {
      if (Phaser.Input.Keyboard.JustDown(diffKeys[i])) {
        this.setDifficulty(diffs[i], i);
        break;
      }
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.left) || Phaser.Input.Keyboard.JustDown(this.keys.a)) {
      this.cycleEntry(-1);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.right) || Phaser.Input.Keyboard.JustDown(this.keys.d)) {
      this.cycleEntry(1);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.enter) || Phaser.Input.Keyboard.JustDown(this.keys.space)) {
      this.launchBattle();
    }
  }
}

window.PrepScene = PrepScene;
