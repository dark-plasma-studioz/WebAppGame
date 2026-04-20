class TutorialScene extends Phaser.Scene {
  constructor() {
    super("TutorialScene");
  }

  init(data) {
    this._entryMode = data?.mode || "hub";
  }

  create() {
    const allowed = ["hub", "full", "guides"];
    this.mode = allowed.includes(this._entryMode) ? this._entryMode : "hub";
    if (this.mode === "hub") {
      this.createHub();
      return;
    }
    if (this.mode === "full") {
      this.createPagedView({
        kind: "full",
        pages: TutorialScene.getFullTutorialPages(),
        bodyFontSize: "16px",
        lastButtonLabel: "Deploy",
        onLastAdvance: () => {
          this.scene.start("CharacterSelectScene");
        }
      });
      return;
    }
    if (this.mode === "guides") {
      const pages =
        typeof window.buildTutorialCharacterGuidePages === "function"
          ? window.buildTutorialCharacterGuidePages()
          : [
              {
                title: "Character guides",
                lines: ["Character data failed to load. Return to the tutorial menu."]
              }
            ];
      this.createPagedView({
        kind: "guides",
        pages,
        bodyFontSize: "12px",
        lastButtonLabel: "Done",
        onLastAdvance: () => {
          this.scene.start("TutorialScene", { mode: "hub" });
        }
      });
    }
  }

  static getFullTutorialPages() {
    const getKeys = typeof window.getPlayerCombatKeys === "function" ? window.getPlayerCombatKeys : null;
    const fmt = typeof window.formatCombatKeyCode === "function" ? window.formatCombatKeyCode : (c) => String(c);
    const p1 = getKeys ? getKeys(1) : { attack: 70, ability: 71, utility: 69 };
    const p2 = getKeys ? getKeys(2) : { attack: 75, ability: 76, utility: 74 };
    const p1A = fmt(p1.attack);
    const p1B = fmt(p1.ability);
    const p1U = fmt(p1.utility);
    const p2A = fmt(p2.attack);
    const p2B = fmt(p2.ability);
    const p2U = fmt(p2.utility);
    return [
      {
        title: "Movement & what a run is",
        lines: [
          "Solo or two local players. A full run is: heroes → mission settings → arena → battle.",
          "You choose difficulty, which boss to face (or Random), and which arena to fight in.",
          "",
          "Player 1:  A / D move  ·  W jump",
          "Player 2:  ← / → move  ·  ↑ jump",
          "",
          "Stay on platforms, avoid hazards, and keep pressure on the boss."
        ]
      },
      {
        title: "Combat, HUD & settings",
        lines: [
          `P1 binds: ${p1A} attack · ${p1B} ability · ${p1U} utility`,
          `P2 binds: ${p2A} attack · ${p2B} ability · ${p2U} utility`,
          "",
          "Rebind attack / ability / utility in Settings (main menu). Movement stays fixed.",
          "Cooldowns show on the HUD. Some heroes charge by holding (e.g. Ranger Power Shot, Soulcaller Spirit Bolt).",
          "",
          "In battle, ` (backtick) toggles optional hitbox / effect debug overlays."
        ]
      },
      {
        title: "Hero roster (after Deploy)",
        lines: [
          "Browse portraits:  P1 uses A / D  ·  P2 uses ← / →  (P2 presses Enter to join first).",
          `Lock in:  ${p1A} (P1)  ·  ${p2A} (P2).  Same hero twice is not allowed for two players.`,
          "",
          "BACKSPACE clears locks. When everyone active is locked, SPACE continues — you are not in the fight yet.",
          "ESC returns to the main menu from here."
        ]
      },
      {
        title: "Mission parameters & arena",
        lines: [
          "Mission Parameters: pick difficulty Easy through Extreme (keys 1–4 or click).",
          "The line under the buttons summarizes HP, cadence, boss damage, and volley density.",
          "",
          "Carousel your target boss (or Random), then SPACE / ENTER opens arena select.",
          "ESC goes back to the hero roster.",
          "",
          "Select Arena: browse with A / D or arrows — SPACE / ENTER starts the battle. ESC returns to mission settings."
        ]
      },
      {
        title: "In the fight",
        lines: [
          "Watch wind-up telegraphs (rectangles, circles, flashes) and move before the hit.",
          "If the boss climbs or teleports, reposition — melee range is not always enough.",
          "Higher difficulties and Extreme in particular crank boss pressure — read the mission modifiers.",
          "",
          "You are done. Deploy from the last page to open the roster, or Esc to the tutorial menu."
        ]
      }
    ];
  }

  createHub() {
    this.createBackdrop();
    this.add
      .text(480, 44, "TUTORIAL", {
        fontSize: "30px",
        color: "#8ec5ff",
        fontStyle: "bold",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      })
      .setOrigin(0.5);
    this.add
      .text(480, 84, "Full walkthrough or per-hero deep dives — your choice.", {
        fontSize: "13px",
        color: "#8eaacc",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace",
        wordWrap: { width: 780, useAdvancedWrap: true },
        align: "center"
      })
      .setOrigin(0.5);

    const mkOption = (y, title, subtitle, mode) => {
      const rect = this.add
        .rectangle(480, y, 440, 58, 0x152238, 0.96)
        .setStrokeStyle(2, 0x5e88c6, 0.88)
        .setInteractive({ useHandCursor: true })
        .on("pointerover", () => rect.setFillStyle(0x1a2d48, 0.98))
        .on("pointerout", () => rect.setFillStyle(0x152238, 0.96))
        .on("pointerdown", () => {
          this.scene.start("TutorialScene", { mode });
        });
      this.add
        .text(480, y - 10, title, {
          fontSize: "18px",
          color: "#f2f7ff",
          fontStyle: "bold",
          fontFamily: "Consolas, Monaco, 'Courier New', monospace"
        })
        .setOrigin(0.5);
      this.add
        .text(480, y + 14, subtitle, {
          fontSize: "11px",
          color: "#7a94b8",
          fontFamily: "Consolas, Monaco, 'Courier New', monospace",
          wordWrap: { width: 400, useAdvancedWrap: true },
          align: "center"
        })
        .setOrigin(0.5);
      return rect;
    };

    mkOption(
      210,
      "Full tutorial",
      "Controls, mission flow, difficulty, arena select, combat tips — start to finish",
      "full"
    );
    mkOption(
      298,
      "Character guides",
      "Every hero: kit breakdown, synergies, and non-obvious mechanics",
      "guides"
    );

    const backY = 418;
    this.add
      .rectangle(320, backY, 200, 44, 0x1a2538, 0.96)
      .setStrokeStyle(2, 0x5a6a82, 0.9)
      .setInteractive({ useHandCursor: true })
      .on("pointerover", function () {
        this.setFillStyle(0x222e42, 0.98);
      })
      .on("pointerout", function () {
        this.setFillStyle(0x1a2538, 0.96);
      })
      .on("pointerdown", () => this.scene.start("MainMenuScene"));
    this.add
      .text(320, backY, "← Main menu", {
        fontSize: "15px",
        color: "#e8f0ff",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      })
      .setOrigin(0.5);

    this.add
      .text(480, 478, "1 — Full tutorial   ·   2 — Character guides   ·   Esc — main menu", {
        fontSize: "11px",
        color: "#5a7898",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      })
      .setOrigin(0.5);

    this.hubKeys = this.input.keyboard.addKeys({
      one: Phaser.Input.Keyboard.KeyCodes.ONE,
      two: Phaser.Input.Keyboard.KeyCodes.TWO,
      numpadOne: Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE,
      numpadTwo: Phaser.Input.Keyboard.KeyCodes.NUMPAD_TWO,
      escape: Phaser.Input.Keyboard.KeyCodes.ESC
    });
    if (this.input?.keyboard) {
      this.input.keyboard.enabled = true;
    }
  }

  /**
   * @param {{ kind: string, pages: { title: string, lines: string[] }[], bodyFontSize: string, lastButtonLabel: string, onLastAdvance: () => void }} cfg
   */
  createPagedView(cfg) {
    this._paged = cfg;
    this.pages = cfg.pages;
    this.pageIndex = 0;

    this.createBackdrop();
    this.titleText = this.add
      .text(480, 52, "", {
        fontSize: "26px",
        color: "#8ec5ff",
        fontStyle: "bold",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace",
        wordWrap: { width: 860, useAdvancedWrap: true },
        align: "center"
      })
      .setOrigin(0.5);

    this.bodyText = this.add
      .text(480, 265, "", {
        fontSize: cfg.bodyFontSize || "16px",
        color: "#dce9ff",
        fontFamily: "Consolas, Monaco, monospace",
        align: "center",
        lineSpacing: cfg.kind === "guides" ? 5 : 6,
        wordWrap: { width: cfg.kind === "guides" ? 840 : 820, useAdvancedWrap: true }
      })
      .setOrigin(0.5);

    this.pageLabel = this.add
      .text(480, 428, "", {
        fontSize: "12px",
        color: "#6a86a8",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace",
        wordWrap: { width: 900, useAdvancedWrap: true },
        align: "center"
      })
      .setOrigin(0.5);

    const btnY = 470;
    this.btnBack = this.add
      .rectangle(300, btnY, 200, 44, 0x1a2538, 0.96)
      .setStrokeStyle(2, 0x5a6a82, 0.9)
      .setInteractive({ useHandCursor: true })
      .on("pointerover", () => this.btnBack.setFillStyle(0x222e42, 0.98))
      .on("pointerout", () => this.btnBack.setFillStyle(0x1a2538, 0.96))
      .on("pointerdown", () => this.scene.start("TutorialScene", { mode: "hub" }));
    this.txtBackNav = this.add
      .text(300, btnY, "← Tutorial menu", {
        fontSize: "15px",
        color: "#e8f0ff",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      })
      .setOrigin(0.5);

    this.btnPrev = this.add
      .rectangle(480, btnY, 120, 44, 0x152238, 0.96)
      .setStrokeStyle(2, 0x5e88c6, 0.85)
      .setInteractive({ useHandCursor: true })
      .on("pointerover", () => {
        if (this.pageIndex > 0) this.btnPrev.setFillStyle(0x1a2d48, 0.98);
      })
      .on("pointerout", () => this.btnPrev.setFillStyle(0x152238, 0.96))
      .on("pointerdown", () => this.prevPage());
    this.txtPrev = this.add
      .text(480, btnY, "Prev", {
        fontSize: "15px",
        color: "#dce9ff",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      })
      .setOrigin(0.5);

    this.btnNext = this.add
      .rectangle(660, btnY, 120, 44, 0x152238, 0.96)
      .setStrokeStyle(2, 0x5e88c6, 0.85)
      .setInteractive({ useHandCursor: true })
      .on("pointerover", () => this.btnNext.setFillStyle(0x1a2d48, 0.98))
      .on("pointerout", () => this.btnNext.setFillStyle(0x152238, 0.96))
      .on("pointerdown", () => this.nextOrDeploy());

    this.txtNext = this.add
      .text(660, btnY, "Next", {
        fontSize: "15px",
        color: "#dce9ff",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      })
      .setOrigin(0.5);

    this.keys = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      escape: Phaser.Input.Keyboard.KeyCodes.ESC,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE
    });
    if (this.input?.keyboard) {
      this.input.keyboard.enabled = true;
    }

    this.renderPaged();
  }

  createBackdrop() {
    const z = -8;
    const bg = this.add.graphics();
    bg.setDepth(z);
    bg.fillGradientStyle(0x060a12, 0x0f1a2e, 0x0a1528, 0x152a48, 1, 1, 1, 1);
    bg.fillRect(0, 0, 960, 540);
    this.add.circle(140, 100, 120, 0x2a4580, 0.22).setDepth(z);
    this.add.circle(860, 90, 100, 0x6b42a8, 0.18).setDepth(z);
    this.add.rectangle(480, 112, 920, 2, 0x6db4ff, 0.35).setDepth(z);
  }

  renderPaged() {
    const p = this.pages[this.pageIndex];
    if (!p) return;
    this.titleText.setText(p.title);
    this.bodyText.setText(p.lines.join("\n"));
    const sub =
      this._paged?.kind === "guides"
        ? "Character guides"
        : "Full tutorial";
    this.pageLabel.setText(
      `${sub} · Page ${this.pageIndex + 1} / ${this.pages.length}  ·  ← →  ·  Enter / Space  ·  Esc = tutorial menu`
    );

    const last = this.pageIndex >= this.pages.length - 1;
    this.txtNext.setText(last ? this._paged.lastButtonLabel : "Next");
    const canPrev = this.pageIndex > 0;
    this.btnPrev.setAlpha(canPrev ? 1 : 0.4);
    this.txtPrev.setAlpha(canPrev ? 1 : 0.4);
  }

  prevPage() {
    if (this.pageIndex <= 0) return;
    this.pageIndex -= 1;
    this.renderPaged();
  }

  nextOrDeploy() {
    if (this.pageIndex >= this.pages.length - 1) {
      if (typeof this._paged.onLastAdvance === "function") {
        this._paged.onLastAdvance();
      }
      return;
    }
    this.pageIndex += 1;
    this.renderPaged();
  }

  update() {
    if (this.mode === "hub") {
      if (Phaser.Input.Keyboard.JustDown(this.hubKeys.escape)) {
        this.scene.start("MainMenuScene");
        return;
      }
      if (
        Phaser.Input.Keyboard.JustDown(this.hubKeys.one) ||
        Phaser.Input.Keyboard.JustDown(this.hubKeys.numpadOne)
      ) {
        this.scene.start("TutorialScene", { mode: "full" });
        return;
      }
      if (
        Phaser.Input.Keyboard.JustDown(this.hubKeys.two) ||
        Phaser.Input.Keyboard.JustDown(this.hubKeys.numpadTwo)
      ) {
        this.scene.start("TutorialScene", { mode: "guides" });
        return;
      }
      return;
    }

    if (this.mode === "full" || this.mode === "guides") {
      if (Phaser.Input.Keyboard.JustDown(this.keys.escape)) {
        this.scene.start("TutorialScene", { mode: "hub" });
        return;
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.left)) {
        this.prevPage();
        return;
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.right) || Phaser.Input.Keyboard.JustDown(this.keys.enter)) {
        this.nextOrDeploy();
        return;
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.space)) {
        this.nextOrDeploy();
      }
    }
  }
}

window.TutorialScene = TutorialScene;
