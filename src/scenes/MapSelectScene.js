class MapSelectScene extends Phaser.Scene {
  constructor() {
    super("MapSelectScene");
  }

  init(data) {
    this.selectedPlayers = data?.selectedPlayers || [];
    this.difficultyId = data?.difficulty || "medium";
    this.bossChoiceId = data?.bossId ?? "random";
  }

  create() {
    this.arenas = window.ARENA_MAPS || [];
    this.selectedIndex = 0;
    this._tweenBusy = false;

    this.createBackdrop();
    this.createTitle();
    this.createPreviewArea();
    this.createArrowButtons();
    this.createInfoPanel();
    this.createLaunchButton();
    this.createControls();
    this.createDotIndicators();
    this.refreshPreview(true);

    if (this.input?.keyboard) {
      this.input.keyboard.enabled = true;
    }

    // P2P: joiner waits; host decides arena and starts battle.
    this.net = window.NET_SESSION && window.NET_SESSION.kind === "webrtc" && window.NET_SESSION.dc?.readyState === "open"
      ? window.NET_SESSION
      : null;
    this.netRole = this.net?.role || null;
    if (this.netRole === "join") {
      this.add.text(480, 500, "P2P — mirroring host arena selection (read-only)", {
        fontSize: "11px",
        color: "#a8e8c8",
        fontStyle: "bold",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      }).setOrigin(0.5);
      this.net.onMessage = (raw) => this._onNetMessage(raw);
    }

    this.time.delayedCall(80, () => this._broadcastMapStateIfHost());
  }

  _broadcastMapStateIfHost() {
    const net = window.NET_SESSION;
    if (!net || net.kind !== "webrtc" || net.role !== "host" || net.dc?.readyState !== "open") return;
    try {
      net.sendJson({ t: "mapSync", selectedIndex: this.selectedIndex });
    } catch {
      /* ignore */
    }
  }

  _onNetMessage(raw) {
    if (this.netRole !== "join") return;
    let msg = null;
    try { msg = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return; }
    if (!msg || typeof msg !== "object") return;
    if (msg.t === "mapSync" && Number.isFinite(msg.selectedIndex) && this.arenas?.length) {
      const max = this.arenas.length - 1;
      const si = Phaser.Math.Clamp(Math.floor(msg.selectedIndex), 0, max);
      if (si !== this.selectedIndex) {
        this.selectedIndex = si;
        this.refreshPreview(true);
      }
      return;
    }
    if (msg.t === "goBattle" && msg.payload && typeof msg.payload === "object") {
      this.scene.start("BattleScene", msg.payload);
    }
    if (msg.t === "sceneSync" && msg.sceneKey === "BattleScene") {
      if (msg.payload && typeof msg.payload === "object") {
        this.scene.start("BattleScene", msg.payload);
      }
    }
  }

  createBackdrop() {
    const bg = this.add.graphics();
    bg.setDepth(-10);
    bg.fillGradientStyle(0x060a12, 0x0f1a2e, 0x0a1528, 0x152a48, 1, 1, 1, 1);
    bg.fillRect(0, 0, 960, 540);
    this.add.rectangle(480, 68, 920, 2, 0x6db4ff, 0.3).setDepth(-10);
  }

  createTitle() {
    this.add.text(480, 32, "SELECT ARENA", {
      fontSize: "28px",
      color: "#f2f7ff",
      fontStyle: "bold",
      fontFamily: "Consolas, Monaco, 'Courier New', monospace"
    }).setOrigin(0.5);
    this.add.text(480, 58, "Choose your battlefield.", {
      fontSize: "12px",
      color: "#8eaacc",
      fontFamily: "Consolas, Monaco, 'Courier New', monospace"
    }).setOrigin(0.5);
  }

  createPreviewArea() {
    this.previewContainer = this.add.container(480, 240);
    this.previewContainer.setDepth(5);

    this.previewBorder = this.add.graphics();
    this.previewBorder.setDepth(4);
    this.previewBorder.lineStyle(2, 0x4a6a9a, 0.8);
    this.previewBorder.strokeRoundedRect(480 - 302, 240 - 152, 604, 304, 6);

    this.previewBg = this.add.graphics();
    this.previewContainer.add(this.previewBg);

    this.previewPlatforms = this.add.graphics();
    this.previewContainer.add(this.previewPlatforms);

    this.previewSpawns = this.add.graphics();
    this.previewContainer.add(this.previewSpawns);
  }

  createArrowButtons() {
    const arrowY = 240;
    this.leftArrow = this.add.text(110, arrowY, "\u25C0", {
      fontSize: "36px",
      color: "#6db4ff",
      fontFamily: "Arial"
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.cycleMap(-1))
      .on("pointerover", () => this.leftArrow.setColor("#ffffff"))
      .on("pointerout", () => this.leftArrow.setColor("#6db4ff"));

    this.rightArrow = this.add.text(850, arrowY, "\u25B6", {
      fontSize: "36px",
      color: "#6db4ff",
      fontFamily: "Arial"
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.cycleMap(1))
      .on("pointerover", () => this.rightArrow.setColor("#ffffff"))
      .on("pointerout", () => this.rightArrow.setColor("#6db4ff"));
  }

  createInfoPanel() {
    this.mapName = this.add.text(480, 408, "", {
      fontSize: "22px",
      color: "#e8f0ff",
      fontStyle: "bold",
      fontFamily: "Consolas, Monaco, 'Courier New', monospace"
    }).setOrigin(0.5);

    this.mapLore = this.add.text(480, 438, "", {
      fontSize: "11px",
      color: "#8ea8c8",
      fontFamily: "Consolas, Monaco, 'Courier New', monospace",
      wordWrap: { width: 560 },
      align: "center",
      lineSpacing: 3
    }).setOrigin(0.5, 0);

    this.mapCount = this.add.text(480, 396, "", {
      fontSize: "10px",
      color: "#5a7898",
      fontFamily: "Consolas, Monaco, 'Courier New', monospace"
    }).setOrigin(0.5);
  }

  createLaunchButton() {
    const ly = 500;
    this.launchBtn = this.add.rectangle(480, ly, 240, 40, 0x1e3d2a, 0.96)
      .setStrokeStyle(2, 0x66f09e, 0.95)
      .setInteractive({ useHandCursor: true })
      .on("pointerover", () => this.launchBtn.setFillStyle(0x254d38, 0.98))
      .on("pointerout", () => this.launchBtn.setFillStyle(0x1e3d2a, 0.96))
      .on("pointerdown", () => this.launchBattle());

    this.add.text(480, ly, "DEPLOY (SPACE)", {
      fontSize: "16px",
      color: "#c8ffd8",
      fontStyle: "bold",
      fontFamily: "Consolas, Monaco, 'Courier New', monospace"
    }).setOrigin(0.5);
  }

  createControls() {
    this.add.text(480, 530, "A / D  or  \u2190 / \u2192 — browse    SPACE / ENTER — deploy    ESC — back", {
      fontSize: "10px",
      color: "#5a7898",
      fontFamily: "Consolas, Monaco, 'Courier New', monospace"
    }).setOrigin(0.5);

    this.keys = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      esc: Phaser.Input.Keyboard.KeyCodes.ESC
    });
  }

  createDotIndicators() {
    this.dots = [];
    const n = this.arenas.length;
    const dotGap = 18;
    const startX = 480 - ((n - 1) * dotGap) / 2;
    for (let i = 0; i < n; i++) {
      const dot = this.add.circle(startX + i * dotGap, 386, 4, 0x4a6a9a, 0.6);
      this.dots.push(dot);
    }
  }

  refreshPreview(instant) {
    const arena = this.arenas[this.selectedIndex];
    if (!arena) return;

    const previewW = 580;
    const previewH = 280;
    const scaleX = previewW / arena.width;
    const scaleY = previewH / 540;

    this.previewBg.clear();
    this.previewBg.fillStyle(arena.backgroundColor, 1);
    this.previewBg.fillRoundedRect(-previewW / 2, -previewH / 2, previewW, previewH, 4);

    this.drawPreviewTheme(this.previewBg, arena, previewW, previewH, scaleX, scaleY);

    this.previewPlatforms.clear();
    const platW = 180;
    const platH = 22;
    const floorW = (arena.floorScaleX || 8) * platW;
    const floorScreenW = floorW * scaleX;
    const floorScreenH = platH * scaleY;
    const floorY = 522 * scaleY - previewH / 2;
    this.previewPlatforms.fillStyle(0x4a6888, 0.85);
    this.previewPlatforms.fillRoundedRect(-floorScreenW / 2, floorY, floorScreenW, floorScreenH, 3);

    (arena.platforms || []).forEach((p) => {
      const pw = (p.scaleX || 1) * platW * scaleX;
      const ph = platH * scaleY;
      const px = p.x * scaleX - previewW / 2;
      const py = p.y * scaleY - previewH / 2;
      this.previewPlatforms.fillStyle(0x5a8aaa, 0.75);
      this.previewPlatforms.fillRoundedRect(px - pw / 2, py - ph / 2, pw, ph, 2);
    });

    this.previewSpawns.clear();
    (arena.playerSpawns || []).forEach((s) => {
      const sx = s.x * scaleX - previewW / 2;
      const sy = s.y * scaleY - previewH / 2;
      this.previewSpawns.fillStyle(0x66ccff, 0.7);
      this.previewSpawns.fillTriangle(sx, sy - 8, sx - 5, sy, sx + 5, sy);
    });
    if (arena.bossSpawn) {
      const bx = arena.bossSpawn.x * scaleX - previewW / 2;
      const by = arena.bossSpawn.y * scaleY - previewH / 2;
      this.previewSpawns.fillStyle(0xff6644, 0.7);
      this.previewSpawns.fillTriangle(bx, by - 10, bx - 6, by, bx + 6, by);
    }

    this.mapName.setText(arena.name);
    this.mapLore.setText(arena.lore);
    this.mapCount.setText(`${this.selectedIndex + 1} / ${this.arenas.length}`);

    this.dots.forEach((dot, i) => {
      dot.setFillStyle(i === this.selectedIndex ? 0x8ec5ff : 0x3a5070, i === this.selectedIndex ? 1 : 0.5);
      dot.setRadius(i === this.selectedIndex ? 5 : 3.5);
    });

    if (!instant) {
      this.previewContainer.setAlpha(0);
      this.tweens.add({
        targets: this.previewContainer,
        alpha: 1,
        duration: 180,
        ease: "Quad.easeOut"
      });
    }
  }

  drawPreviewTheme(g, arena, pw, ph) {
    const id = arena.id;
    const hw = pw / 2;
    const hh = ph / 2;

    if (id === "ashen-battlegrounds") {
      g.fillStyle(0x5a2810, 0.1);
      g.fillRect(-hw, hh - 50, pw, 50);
      for (let i = 0; i < 5; i++) {
        g.fillStyle(0x2a1c0e, 0.12);
        g.fillRect(-hw + 60 + i * 130, -hh + 30, 10, ph * 0.4);
      }
      for (let i = 0; i < 40; i++) {
        g.fillStyle(0xaa8855, Phaser.Math.FloatBetween(0.05, 0.14));
        g.fillCircle(Phaser.Math.Between(-hw, hw), Phaser.Math.Between(-hh, hh), 1);
      }
      g.fillStyle(0xff6622, 0.03);
      g.fillEllipse(-hw + pw * 0.25, hh * 0.1, 50, 20);
      g.fillStyle(0x2a1a0a, 0.25);
      g.fillRect(-hw, hh - 18, pw, 18);

    } else if (id === "twilight-sanctum") {
      // pillars
      for (let i = 0; i < 6; i++) {
        const cx = -hw + 40 + i * (pw - 80) / 5;
        g.fillStyle(0x2a2040, 0.15);
        g.fillRect(cx - 3, -hh + 15, 6, ph - 40);
        g.fillStyle(0x3a3058, 0.08);
        g.fillRect(cx - 5, -hh + 12, 10, 6);
      }
      // rose window
      g.fillStyle(0x8060c0, 0.06);
      g.fillCircle(0, -hh + 25, 30);
      g.fillStyle(0xc090ff, 0.04);
      g.fillCircle(0, -hh + 25, 16);
      // dust motes
      for (let i = 0; i < 25; i++) {
        g.fillStyle(0xd0c0f0, Phaser.Math.FloatBetween(0.04, 0.1));
        g.fillCircle(Phaser.Math.Between(-hw, hw), Phaser.Math.Between(-hh, hh * 0.5), 1);
      }
      g.fillStyle(0x1a1428, 0.28);
      g.fillRect(-hw, hh - 18, pw, 18);

    } else if (id === "frozen-wastes") {
      g.fillStyle(0x3088aa, 0.05);
      g.fillRect(-hw, -hh, pw, ph * 0.28);
      // icicles
      for (let i = 0; i < 10; i++) {
        const ix = -hw + 30 + i * (pw / 10);
        g.fillStyle(0x80ccee, 0.1);
        g.fillTriangle(ix - 2, -hh, ix + 2, -hh, ix, -hh + 8 + Phaser.Math.Between(0, 10));
      }
      // ice crystals at bottom
      for (let i = 0; i < 5; i++) {
        const cx = -hw + i * (pw / 4) + 50;
        g.fillStyle(0x60aacc, 0.08);
        g.fillTriangle(cx, hh - 28, cx - 6, hh - 10, cx + 6, hh - 10);
      }
      // snowflakes
      for (let i = 0; i < 35; i++) {
        g.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.06, 0.2));
        g.fillCircle(Phaser.Math.Between(-hw, hw), Phaser.Math.Between(-hh, hh * 0.5), 1);
      }
      g.fillStyle(0x1a2838, 0.3);
      g.fillRect(-hw, hh - 16, pw, 16);

    } else if (id === "verdant-canopy") {
      // canopy foliage
      for (let i = 0; i < 10; i++) {
        g.fillStyle(i < 5 ? 0x1a5020 : 0x308838, 0.1);
        g.fillCircle(Phaser.Math.Between(-hw, hw), -hh + Phaser.Math.Between(0, 40), Phaser.Math.Between(16, 40));
      }
      // tree trunks
      g.fillStyle(0x2a1a0e, 0.1);
      g.fillRect(-hw + 30, -hh + 20, 8, ph * 0.35);
      g.fillRect(hw - 40, -hh + 25, 7, ph * 0.3);
      // vines
      for (let i = 0; i < 6; i++) {
        g.lineStyle(1, 0x40884a, 0.1);
        const vx = Phaser.Math.Between(-hw + 20, hw - 20);
        g.lineBetween(vx, -hh, vx + Phaser.Math.Between(-8, 8), -hh + Phaser.Math.Between(40, 90));
      }
      // dappled light
      for (let i = 0; i < 5; i++) {
        g.fillStyle(0xaaff88, 0.03);
        g.fillEllipse(Phaser.Math.Between(-hw, hw), Phaser.Math.Between(0, hh - 30), 18, 7);
      }
      g.fillStyle(0x1a3820, 0.25);
      g.fillRect(-hw, hh - 18, pw, 18);

    } else if (id === "crimson-depths") {
      // cave walls
      g.fillStyle(0x120404, 0.2);
      g.fillRect(-hw, -hh, 22, ph);
      g.fillRect(hw - 22, -hh, 22, ph);
      // lava glow
      g.fillStyle(0xff4422, 0.1);
      g.fillRect(-hw, hh - 45, pw, 45);
      g.fillStyle(0xff6622, 0.06);
      g.fillRect(-hw, hh - 25, pw, 25);
      // magma bubbles
      for (let i = 0; i < 14; i++) {
        g.fillStyle(0xff8844, Phaser.Math.FloatBetween(0.05, 0.14));
        g.fillCircle(Phaser.Math.Between(-hw + 30, hw - 30), hh - Phaser.Math.Between(5, 35), Phaser.Math.Between(1, 4));
      }
      // embers
      for (let i = 0; i < 10; i++) {
        g.fillStyle(0xffaa44, 0.08);
        g.fillCircle(Phaser.Math.Between(-hw, hw), Phaser.Math.Between(-hh * 0.3, hh - 40), 1);
      }
      g.fillStyle(0x180404, 0.3);
      g.fillRect(-hw, hh - 16, pw, 16);

    } else if (id === "spectral-hollow") {
      // void rift
      g.lineStyle(1, 0x5530aa, 0.08);
      g.strokeEllipse(0, -hh * 0.1, 150, 90);
      g.lineStyle(1, 0x6644aa, 0.06);
      for (let r = 30; r < 160; r += 40) {
        g.strokeCircle(0, -hh * 0.1, r);
      }
      // spirit wisps
      for (let i = 0; i < 35; i++) {
        const wc = i % 3 === 0 ? 0xaa88ee : i % 3 === 1 ? 0x6644aa : 0x8866cc;
        g.fillStyle(wc, Phaser.Math.FloatBetween(0.04, 0.12));
        g.fillCircle(Phaser.Math.Between(-hw, hw), Phaser.Math.Between(-hh, hh), Phaser.Math.Between(1, 3));
      }
      // ghostly silhouettes
      for (let i = 0; i < 2; i++) {
        g.fillStyle(0x4a3070, 0.04);
        g.fillEllipse(Phaser.Math.Between(-hw * 0.6, hw * 0.6), Phaser.Math.Between(0, hh * 0.6), 10, 18);
      }
      g.fillStyle(0x08061a, 0.25);
      g.fillRect(-hw, hh - 14, pw, 14);

    } else if (id === "iron-citadel") {
      // I-beams
      for (let i = 0; i < 7; i++) {
        const bx = -hw + 30 + i * (pw - 60) / 6;
        g.fillStyle(0x2a2c34, 0.14);
        g.fillRect(bx - 2, -hh, 4, ph);
      }
      // girders
      g.fillStyle(0x4a4c54, 0.08);
      g.fillRect(-hw, -hh + ph * 0.15, pw, 3);
      g.fillRect(-hw, hh - 55, pw, 3);
      // gears
      g.lineStyle(1, 0x555566, 0.08);
      g.strokeCircle(-hw + pw * 0.12, -hh + ph * 0.3, 18);
      g.strokeCircle(hw - pw * 0.12, -hh + ph * 0.35, 14);
      // rivets
      for (let i = 0; i < 12; i++) {
        g.fillStyle(0x888888, 0.08);
        g.fillCircle(-hw + 20 + i * (pw / 12), -hh + ph * 0.15 + 2, 1);
      }
      g.fillStyle(0x22242a, 0.3);
      g.fillRect(-hw, hh - 16, pw, 16);

    } else if (id === "skyborne-ruins") {
      // clouds
      for (let i = 0; i < 5; i++) {
        g.fillStyle(0x4488cc, 0.05);
        g.fillEllipse(Phaser.Math.Between(-hw, hw), -hh + Phaser.Math.Between(10, 50), Phaser.Math.Between(50, 120), Phaser.Math.Between(10, 22));
      }
      // towers
      for (let i = 0; i < 4; i++) {
        const tx = -hw + 60 + i * (pw / 3.5);
        g.fillStyle(0x2a3848, 0.1);
        g.fillRect(tx - 5, -hh + 20, 10, ph * 0.35 + i * 10);
        g.fillStyle(0x3a4858, 0.06);
        g.fillRect(tx - 8, -hh + 18, 16, 5);
      }
      // stars
      for (let i = 0; i < 30; i++) {
        g.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.06, 0.18));
        g.fillCircle(Phaser.Math.Between(-hw, hw), Phaser.Math.Between(-hh, 0), 1);
      }
      // wind
      g.lineStyle(1, 0x88aacc, 0.05);
      for (let i = 0; i < 5; i++) {
        const sy = Phaser.Math.Between(-hh * 0.3, hh * 0.5);
        g.lineBetween(Phaser.Math.Between(-hw, 0), sy, Phaser.Math.Between(0, hw), sy + Phaser.Math.Between(-2, 2));
      }
      g.fillStyle(0x1a2838, 0.25);
      g.fillRect(-hw, hh - 14, pw, 14);
    }
  }

  cycleMap(dir) {
    if (this._tweenBusy) return;
    const n = this.arenas.length;
    if (n <= 1) return;
    this._tweenBusy = true;

    const slideDir = dir;
    this.tweens.add({
      targets: this.previewContainer,
      x: 480 - slideDir * 120,
      alpha: 0,
      duration: 120,
      ease: "Quad.easeIn",
      onComplete: () => {
        this.selectedIndex = (this.selectedIndex + dir + n) % n;
        this.previewContainer.setPosition(480 + slideDir * 120, 240);
        this.refreshPreview(true);
        this.tweens.add({
          targets: this.previewContainer,
          x: 480,
          alpha: 1,
          duration: 140,
          ease: "Quad.easeOut",
          onComplete: () => {
            this._tweenBusy = false;
            this._broadcastMapStateIfHost();
          }
        });
      }
    });
  }

  launchBattle() {
    const arena = this.arenas[this.selectedIndex];
    if (!arena) return;
    const net = window.NET_SESSION;
    if (net && net.kind === "webrtc" && net.role === "join") return;
    // Host must resolve random boss ONCE so joiners never roll a different boss.
    let resolvedBossId = this.bossChoiceId;
    if (resolvedBossId === "random") {
      try {
        const rb = window.getRandomBoss && window.getRandomBoss();
        if (rb && rb.id) resolvedBossId = rb.id;
      } catch {
        /* ignore */
      }
    }
    if (net && net.kind === "webrtc" && net.role === "host" && net.dc?.readyState === "open") {
      net.sendJson({
        t: "goBattle",
        payload: {
          selectedPlayers: this.selectedPlayers,
          difficulty: this.difficultyId,
          bossId: resolvedBossId,
          arenaId: arena.id
        }
      });
      if (typeof net.sendSceneSync === "function") {
        net.sendSceneSync("BattleScene", {
          selectedPlayers: this.selectedPlayers,
          difficulty: this.difficultyId,
          bossId: resolvedBossId,
          arenaId: arena.id
        });
      }
    }
    this.scene.start("BattleScene", {
      selectedPlayers: this.selectedPlayers,
      difficulty: this.difficultyId,
      bossId: resolvedBossId,
      arenaId: arena.id
    });
  }

  update() {
    const net = window.NET_SESSION;
    if (net && net.kind === "webrtc" && net.role === "join") return;
    if (Phaser.Input.Keyboard.JustDown(this.keys.esc)) {
      this.scene.start("PrepScene", {
        selectedPlayers: this.selectedPlayers,
        difficulty: this.difficultyId,
        bossId: this.bossChoiceId
      });
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.left) || Phaser.Input.Keyboard.JustDown(this.keys.a)) {
      this.cycleMap(-1);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.right) || Phaser.Input.Keyboard.JustDown(this.keys.d)) {
      this.cycleMap(1);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.space) || Phaser.Input.Keyboard.JustDown(this.keys.enter)) {
      this.launchBattle();
    }
  }
}

window.MapSelectScene = MapSelectScene;
