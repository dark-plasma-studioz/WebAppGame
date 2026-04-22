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
    // P2P wiring: host decides replay/leave; joiner can request replay or leave (disconnect) locally.
    this.net = window.NET_SESSION && window.NET_SESSION.kind === "webrtc" && window.NET_SESSION.dc?.readyState === "open"
      ? window.NET_SESSION
      : null;
    this.netRole = this.net?.role || null;
    if (this.netRole === "join") {
      this.add.text(480, 420, "P2P: waiting for host decision (R=request replay, B=leave)", {
        fontSize: "14px",
        color: "#a8e8c8"
      }).setOrigin(0.5);
      this.net.onMessage = (raw) => this._onNetMessage(raw);
    } else if (this.netRole === "host") {
      this.add.text(480, 420, "P2P HOST: R=replay (back to lobby) · B=end session", {
        fontSize: "14px",
        color: "#a8e8c8"
      }).setOrigin(0.5);
      this.net.onMessage = (raw) => this._onNetMessage(raw);
    }
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

  _onNetMessage(raw) {
    const net = window.NET_SESSION;
    if (!net || net.kind !== "webrtc" || net.dc?.readyState !== "open") return;
    let msg = null;
    try { msg = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return; }
    if (!msg || typeof msg !== "object") return;
    if (msg.t === "disconnect" && net.role === "join") {
      try {
        if (window.P2P && typeof window.P2P.reset === "function") window.P2P.reset();
      } catch {
        /* ignore */
      }
      this.queueGoMainMenu();
      return;
    }
    if (msg.t === "sceneSync" && net.role === "join") {
      const sk = msg.sceneKey;
      if (sk === "CharacterSelectScene") {
        this.time.delayedCall(0, () => this.scene.start("CharacterSelectScene"));
      } else if (sk === "MainMenuScene") {
        this.queueGoMainMenu();
      }
      return;
    }
    if (msg.t === "replayReq" && net.role === "host") {
      // Host can ignore; we just surface the request by enabling R flow (no UI change needed).
      return;
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
      const net = window.NET_SESSION;
      const host = !!(net && net.kind === "webrtc" && net.role === "host" && net.dc?.readyState === "open");
      const join = !!(net && net.kind === "webrtc" && net.role === "join" && net.dc?.readyState === "open");
      if (host) {
        try {
          if (typeof net.sendSceneSync === "function") net.sendSceneSync("CharacterSelectScene");
          else net.sendJson({ t: "sceneSync", sceneKey: "CharacterSelectScene", payload: null });
        } catch {
          /* ignore */
        }
        this.time.delayedCall(0, () => this.scene.start("CharacterSelectScene"));
        return;
      }
      if (join) {
        try { net.sendJson({ t: "replayReq" }); } catch { /* ignore */ }
        return;
      }
      this.queueGoBattle();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.back)) {
      const net = window.NET_SESSION;
      const host = !!(net && net.kind === "webrtc" && net.role === "host" && net.dc?.readyState === "open");
      const join = !!(net && net.kind === "webrtc" && net.role === "join" && net.dc?.readyState === "open");
      if (host) {
        try { net.sendJson({ t: "disconnect" }); } catch { /* ignore */ }
        try { if (window.P2P && typeof window.P2P.reset === "function") window.P2P.reset(); } catch { /* ignore */ }
        this.queueGoMainMenu();
        return;
      }
      if (join) {
        try { if (window.P2P && typeof window.P2P.reset === "function") window.P2P.reset(); } catch { /* ignore */ }
        this.queueGoMainMenu();
        return;
      }
      this.queueGoMainMenu();
    }
  }
}

window.GameOverScene = GameOverScene;
