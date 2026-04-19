class CharacterSelectScene extends Phaser.Scene {
  constructor() {
    super("CharacterSelectScene");
  }

  static uiTrimDesc(text, maxLen) {
    if (!text) return "";
    const t = String(text).replace(/\s+/g, " ").trim();
    if (t.length <= maxLen) return t;
    return `${t.slice(0, maxLen - 1)}…`;
  }

  static formatAttackBlock(character, descMax = 52) {
    const lines = [];
    const ba = character.basicAttack;
    const ab = character.ability;
    const ut = character.utility;
    lines.push(`${ba.name} (${ba.damage}) — ${CharacterSelectScene.uiTrimDesc(ba.description, descMax)}`);
    lines.push(`${ab.name} — ${CharacterSelectScene.uiTrimDesc(ab.description, descMax)}`);
    if (ut) {
      lines.push(`${ut.name} — ${CharacterSelectScene.uiTrimDesc(ut.description, descMax)}`);
    }
    return lines.join("\n");
  }

  create() {
    this.selected = {
      p1Index: 0,
      p2Index: 1,
      p1Locked: false,
      p2Joined: false,
      p2Locked: false
    };

    /** Vertical layout: header → match strip → gap → portraits → gap → P1/P2 panels (no overlap). */
    const cardCenterY = 212;
    this.createBackdrop();
    this.createHeader();
    this.createMatchStatusStrip();
    this.createPlayerPanels();

    const cardW = 160;
    const cardH = 198;
    const numChars = window.CHARACTERS.length;
    const cardSpacing = Math.min(180, (920 - cardW) / (numChars - 1));
    const totalSpan = cardSpacing * (numChars - 1);
    const cardStartX = (960 - totalSpan) / 2;

    this.cards = window.CHARACTERS.map((character, index) => {
      const x = cardStartX + index * cardSpacing;
      const boxShadow = this.add.rectangle(x + 4, cardCenterY + 4, cardW + 2, cardH + 4, 0x0a0f1a, 0.42);
      const env = this.add.graphics();
      this.paintCharacterCardEnv(env, x, cardCenterY, character.id);
      env.setDepth(10);
      const box = this.add
        .rectangle(x, cardCenterY, cardW, cardH, 0x18263d, 0.88)
        .setStrokeStyle(2, 0x49678f)
        .setOrigin(0.5)
        .setDepth(11);
      const accent = this.add.rectangle(x, cardCenterY - cardH / 2 + 4, cardW - 10, 5, character.color, 0.85).setOrigin(0.5).setDepth(12);
      const sprite = this.add.image(x, cardCenterY - 38, `player_${index}`).setScale(0.82).setDepth(13);
      const title = this.add.text(x, cardCenterY + 18, character.name, {
        fontSize: "15px",
        color: "#ffffff",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace",
        fontStyle: "bold"
      }).setOrigin(0.5).setDepth(14);
      const detailLines = [`HP ${character.maxHealth}  ·  ${character.basicAttack.name}`];
      if (character.ability) detailLines.push(character.ability.name);
      if (character.utility) detailLines.push(character.utility.name);
      const details = this.add
        .text(x, cardCenterY + 56, detailLines.join("\n"), {
          fontSize: "10px",
          color: "#b0c8e8",
          align: "center",
          fontFamily: "Consolas, Monaco, 'Courier New', monospace",
          lineSpacing: 3,
          wordWrap: { width: cardW - 16, useAdvancedWrap: true }
        })
        .setOrigin(0.5, 0)
        .setDepth(14);
      boxShadow.setDepth(9);
      return { boxShadow, env, box, accent, sprite, title, details };
    });

    const uiZ = 40;
    const hintStyle = {
      fontSize: "11px",
      color: "#8fa6c4",
      fontFamily: "Consolas, Monaco, 'Courier New', monospace",
      lineSpacing: 4,
      wordWrap: { width: 900, useAdvancedWrap: true }
    };
    this.helpText = this.add
      .text(480, 508, "BACKSPACE — clear locks   ·   ESC — main menu   ·   SPACE — deploy when all picks are locked", hintStyle)
      .setOrigin(0.5, 0)
      .setDepth(uiZ + 2);

    this.leaveButton = this.add
      .rectangle(848, 78, 96, 26, 0x1a2a3d, 0.96)
      .setStrokeStyle(2, 0x8ab2dd, 0.95)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.toggleP2Join())
      .setDepth(uiZ + 2);
    this.leaveButtonLabel = this.add
      .text(848, 78, "P2 leave", {
        fontSize: "11px",
        color: "#e9f3ff",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      })
      .setOrigin(0.5)
      .setDepth(uiZ + 3);

    this.startBanner = this.add
      .text(480, 524, "LOCK PICKS, THEN PRESS SPACE TO DEPLOY", {
        fontSize: "12px",
        color: "#ffe9a4",
        fontStyle: "bold",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.tryStartBattle())
      .setDepth(uiZ + 2);

    const getKeys = typeof window.getPlayerCombatKeys === "function" ? window.getPlayerCombatKeys : null;
    const p1Keys = getKeys ? getKeys(1) : { attack: Phaser.Input.Keyboard.KeyCodes.F };
    const p2Keys = getKeys ? getKeys(2) : { attack: Phaser.Input.Keyboard.KeyCodes.K };
    this.keys = this.input.keyboard.addKeys({
      p1Left: Phaser.Input.Keyboard.KeyCodes.A,
      p1Right: Phaser.Input.Keyboard.KeyCodes.D,
      p1Lock: p1Keys.attack || Phaser.Input.Keyboard.KeyCodes.F,
      p2Join: Phaser.Input.Keyboard.KeyCodes.ENTER,
      p2Left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      p2Right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      p2Lock: p2Keys.attack || Phaser.Input.Keyboard.KeyCodes.K,
      start: Phaser.Input.Keyboard.KeyCodes.SPACE,
      reset: Phaser.Input.Keyboard.KeyCodes.BACKSPACE,
      escape: Phaser.Input.Keyboard.KeyCodes.ESC
    });
    this._deployPending = false;
    this._deployTimer = null;
    this.events.once("shutdown", () => {
      if (this._deployTimer) {
        try {
          this._deployTimer.remove(false);
        } catch (e) {
          /* ignore */
        }
        this._deployTimer = null;
      }
      this._deployPending = false;
    });

    if (this.input?.keyboard) {
      this.input.keyboard.enabled = true;
    }

    this.refreshUi();
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
    this.add.rectangle(480, 104, 920, 2, 0x6db4ff, 0.28).setDepth(z);
    const stars = this.add.graphics();
    stars.setDepth(z);
    for (let i = 0; i < 50; i += 1) {
      stars.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.04, 0.14));
      stars.fillCircle(Phaser.Math.Between(0, 960), Phaser.Math.Between(0, 280), Phaser.Math.Between(1, 2));
    }
  }

  paintCharacterCardEnv(g, cx, cy, characterId) {
    const w = 164;
    const h = 202;
    const left = cx - w * 0.5;
    const top = cy - h * 0.5;
    g.fillStyle(0x0a0f18, 0.55);
    g.fillRect(left, top, w, h);
    switch (characterId) {
      case "vanguard":
        g.fillGradientStyle(0x0d1a30, 0x1a3058, 0x0d1a30, 0x152848, 0.9, 0.9, 0.9, 0.9);
        g.fillRect(left, top, w, h);
        g.lineStyle(2, 0x5ca8ff, 0.25);
        g.lineBetween(left + 20, top + 40, left + w - 20, top + 70);
        g.fillStyle(0x5ca8ff, 0.12);
        for (let i = 0; i < 6; i += 1) {
          g.fillTriangle(
            left + 30 + i * 22,
            top + h - 35,
            left + 40 + i * 22,
            top + h - 55,
            left + 20 + i * 22,
            top + h - 50
          );
        }
        break;
      case "medic":
        g.fillGradientStyle(0x0a2218, 0x143828, 0x0a2218, 0x122820, 0.95, 0.95, 0.95, 0.95);
        g.fillRect(left, top, w, h);
        g.fillStyle(0x7dffb6, 0.1);
        g.fillCircle(cx, top + 50, 48);
        for (let i = 0; i < 5; i += 1) {
          g.lineStyle(1, 0x7dffb6, 0.15);
          g.strokeEllipse(cx + (i - 2) * 18, top + h - 40, 24, 10);
        }
        break;
      case "ranger":
        g.fillGradientStyle(0x1c1608, 0x2a2410, 0x1c1608, 0x282010, 1, 1, 1, 1);
        g.fillRect(left, top, w, h);
        g.fillStyle(0xf7d95c, 0.08);
        for (let i = 0; i < 12; i += 1) {
          g.fillCircle(left + Phaser.Math.Between(10, w - 10), top + Phaser.Math.Between(20, h - 30), 2);
        }
        g.lineStyle(1, 0xc9a030, 0.2);
        g.lineBetween(left, top + 30, left + w, top + 90);
        break;
      case "guardian":
        g.fillGradientStyle(0x280a0c, 0x381418, 0x280a0c, 0x301820, 1, 1, 1, 1);
        g.fillRect(left, top, w, h);
        g.lineStyle(3, 0xff8b8b, 0.2);
        g.strokeRoundedRect(left + 40, top + 50, 88, 100, 8);
        g.fillStyle(0xff8b8b, 0.06);
        g.fillCircle(cx, top + h * 0.45, 40);
        break;
      case "striker":
        g.fillGradientStyle(0x140818, 0x221028, 0x140818, 0x1a1430, 1, 1, 1, 1);
        g.fillRect(left, top, w, h);
        g.lineStyle(2, 0xc288ff, 0.22);
        for (let i = 0; i < 4; i += 1) {
          g.lineBetween(left + 15 + i * 38, top + 25, left + 35 + i * 38, top + h - 35);
        }
        g.fillStyle(0xc288ff, 0.1);
        g.fillCircle(cx, top + 55, 36);
        break;
      case "summoner":
        g.fillGradientStyle(0x120818, 0x1a0e28, 0x120818, 0x201038, 1, 1, 1, 1);
        g.fillRect(left, top, w, h);
        g.fillStyle(0xc9a0ff, 0.12);
        g.fillCircle(cx - 28, top + 48, 14);
        g.fillCircle(cx + 30, top + 52, 12);
        g.lineStyle(1.5, 0xc9a0ff, 0.2);
        g.strokeCircle(cx - 28, top + 48, 14);
        g.strokeCircle(cx + 30, top + 52, 12);
        g.lineStyle(1, 0xe8d8ff, 0.15);
        for (let i = 0; i < 5; i += 1) {
          g.lineBetween(left + 20 + i * 36, top + 30, cx + (i - 2) * 8, top + h - 42);
        }
        g.fillStyle(0xc9a0ff, 0.08);
        g.fillCircle(cx, top + 58, 40);
        break;
      default:
        break;
    }
  }

  createHeader() {
    const d = 6;
    this.add.rectangle(480, 32, 700, 46, 0x111e34, 0.84).setStrokeStyle(2, 0x5e88c6, 0.9).setDepth(d);
    this.add
      .text(480, 22, "HERO ASSEMBLY TERMINAL", {
        fontSize: "22px",
        color: "#f2f7ff",
        fontStyle: "bold",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      })
      .setOrigin(0.5)
      .setDepth(d + 1);
    this.add
      .text(480, 42, "Browse portraits, lock in, then deploy.", {
        fontSize: "12px",
        color: "#b8cce8",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      })
      .setOrigin(0.5)
      .setDepth(d + 1);
  }

  createMatchStatusStrip() {
    const d = 38;
    this.matchStatusBg = this.add
      .rectangle(480, 78, 920, 36, 0x0f1a2e, 0.95)
      .setStrokeStyle(2, 0x4f74a8, 0.92)
      .setDepth(d);
    this.matchStatusLabel = this.add
      .text(42, 64, "MATCH STATUS", {
        fontSize: "11px",
        color: "#7aa8d8",
        fontStyle: "bold",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      })
      .setOrigin(0, 0)
      .setDepth(d + 1);
    this.matchStatusText = this.add
      .text(480, 78, "", {
        fontSize: "12px",
        color: "#d7e7ff",
        align: "center",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace",
        lineSpacing: 3,
        wordWrap: { width: 680, useAdvancedWrap: true }
      })
      .setOrigin(0.5, 0.5)
      .setDepth(d + 1);
  }

  createPlayerPanels() {
    const d = 40;
    const top = 322;
    const panelH = 180;
    const gap = 14;
    const margin = 16;
    const innerW = (960 - margin * 2 - gap) / 2;
    const cx1 = margin + innerW / 2;
    const cx2 = margin + gap + innerW + innerW / 2;
    const textInset = 12;

    const panelStyle = {
      fontSize: "9.5px",
      fontFamily: "Consolas, Monaco, 'Courier New', monospace",
      lineSpacing: 2,
      wordWrap: { width: innerW - textInset * 2 - 4, useAdvancedWrap: true }
    };

    this.p1PanelBg = this.add
      .rectangle(cx1, top + panelH / 2, innerW, panelH, 0x0e1626, 0.96)
      .setStrokeStyle(2, 0x4a8fd4, 0.95)
      .setDepth(d);
    this.p1PanelTitle = this.add
      .text(margin + textInset, top + 8, "PLAYER 1", {
        fontSize: "12px",
        color: "#9fd4ff",
        fontStyle: "bold",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      })
      .setDepth(d + 1);
    this.p1PanelText = this.add.text(margin + textInset, top + 26, "", { ...panelStyle, color: "#dce9ff" }).setDepth(d + 1);

    this.p2PanelBg = this.add
      .rectangle(cx2, top + panelH / 2, innerW, panelH, 0x0e1626, 0.96)
      .setStrokeStyle(2, 0x4ad4a0, 0.95)
      .setDepth(d);
    this.p2PanelTitle = this.add
      .text(margin + gap + innerW + textInset, top + 8, "PLAYER 2", {
        fontSize: "12px",
        color: "#b8ffd8",
        fontStyle: "bold",
        fontFamily: "Consolas, Monaco, 'Courier New', monospace"
      })
      .setDepth(d + 1);
    this.p2PanelText = this.add
      .text(margin + gap + innerW + textInset, top + 26, "", { ...panelStyle, color: "#e6fff0" })
      .setDepth(d + 1);

    this._panelLayout = { top, panelH, innerW, margin, gap, textInset };
  }

  update() {
    if (!this.selected.p1Locked) {
      if (Phaser.Input.Keyboard.JustDown(this.keys.p1Left)) {
        this.movePick("p1", -1);
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.p1Right)) {
        this.movePick("p1", 1);
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.p1Lock)) {
        this.selected.p1Locked = true;
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.p2Join)) {
      this.toggleP2Join();
    }

    if (this.selected.p2Joined && !this.selected.p2Locked) {
      if (Phaser.Input.Keyboard.JustDown(this.keys.p2Left)) {
        this.movePick("p2", -1);
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.p2Right)) {
        this.movePick("p2", 1);
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.p2Lock)) {
        this.selected.p2Locked = true;
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.reset)) {
      this.selected.p1Locked = false;
      this.selected.p2Locked = false;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.start) && this.tryStartBattle()) {
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.escape) && !this._deployPending) {
      this.time.delayedCall(0, () => {
        const sp = this.scene;
        if (sp && sp.isActive("CharacterSelectScene")) {
          sp.start("MainMenuScene");
        }
      });
      return;
    }

    this.refreshUi();
  }

  movePick(playerSlot, direction) {
    const key = playerSlot === "p1" ? "p1Index" : "p2Index";
    const otherKey = playerSlot === "p1" ? "p2Index" : "p1Index";
    const next = Phaser.Math.Wrap(this.selected[key] + direction, 0, window.CHARACTERS.length);
    this.selected[key] = next;

    if (!this.selected.p2Joined || this.selected.p1Index !== this.selected.p2Index) {
      return;
    }

    this.selected[key] = this.findNextAvailableIndex(next, direction, this.selected[otherKey]);
  }

  findNextAvailableIndex(startIndex, direction, blockedIndex) {
    const step = direction >= 0 ? 1 : -1;
    let index = startIndex;
    for (let i = 0; i < window.CHARACTERS.length; i += 1) {
      index = Phaser.Math.Wrap(index + step, 0, window.CHARACTERS.length);
      if (index !== blockedIndex) {
        return index;
      }
    }
    return startIndex;
  }

  canStartBattle() {
    return this.selected.p1Locked && (!this.selected.p2Joined || this.selected.p2Locked);
  }

  tryStartBattle() {
    if (!this.canStartBattle() || this._deployPending) return false;
    this._deployPending = true;
    if (this._deployTimer) {
      try {
        this._deployTimer.remove(false);
      } catch (e) {
        /* ignore */
      }
      this._deployTimer = null;
    }
    this._deployTimer = this.time.delayedCall(0, () => {
      this._deployTimer = null;
      const scenePlugin = this.scene;
      if (!scenePlugin || !scenePlugin.isActive("CharacterSelectScene")) {
        this._deployPending = false;
        return;
      }
      if (!this.canStartBattle()) {
        this._deployPending = false;
        return;
      }
      const payload = { selectedPlayers: this.buildSelectedPlayers() };
      scenePlugin.start("PrepScene", payload);
    });
    return true;
  }

  toggleP2Join() {
    if (!this.selected.p2Joined) {
      this.selected.p2Joined = true;
      if (this.selected.p2Index === this.selected.p1Index) {
        this.selected.p2Index = Phaser.Math.Wrap(this.selected.p1Index + 1, 0, window.CHARACTERS.length);
      }
      return;
    }
    this.selected.p2Joined = false;
    this.selected.p2Locked = false;
  }

  buildSelectedPlayers() {
    const selectedPlayers = [
      {
        slot: 1,
        characterId: window.CHARACTERS[this.selected.p1Index].id
      }
    ];
    if (this.selected.p2Joined) {
      selectedPlayers.push({
        slot: 2,
        characterId: window.CHARACTERS[this.selected.p2Index].id
      });
    }
    return selectedPlayers;
  }

  /** Returns the current key label ("F", "K", etc.) for a combat action on a given slot. */
  static getPlayerKeyLabel(slot, action) {
    const getKeys = typeof window.getPlayerCombatKeys === "function" ? window.getPlayerCombatKeys : null;
    const fmt = typeof window.formatCombatKeyCode === "function" ? window.formatCombatKeyCode : (c) => String(c);
    const keys = getKeys ? getKeys(slot) : {};
    const code = keys?.[action];
    return fmt(code);
  }

  buildP1PanelString() {
    const c = window.CHARACTERS[this.selected.p1Index];
    const st = this.selected.p1Locked ? "LOCKED" : "SELECT";
    const atk = CharacterSelectScene.getPlayerKeyLabel(1, "attack");
    const ab = CharacterSelectScene.getPlayerKeyLabel(1, "ability");
    const ut = CharacterSelectScene.getPlayerKeyLabel(1, "utility");
    return [
      `${c.name}  ·  ${st}  ·  HP ${c.maxHealth}`,
      c.blurb || "",
      "",
      `Select: A/D move · ${atk} lock · BACKSPACE clear`,
      `Battle: W jump · ${atk} atk · ${ab} ability · ${ut} util`,
      "",
      CharacterSelectScene.formatAttackBlock(c, 42)
    ].join("\n");
  }

  buildP2PanelString() {
    const atk = CharacterSelectScene.getPlayerKeyLabel(2, "attack");
    const ab = CharacterSelectScene.getPlayerKeyLabel(2, "ability");
    const ut = CharacterSelectScene.getPlayerKeyLabel(2, "utility");
    if (!this.selected.p2Joined) {
      return [
        "Waiting for second player.",
        "",
        "Press Enter to join.",
        "Cannot pick the same portrait as P1.",
        "",
        `After joining: ←/→ move · ${atk} lock`,
        `Battle: ↑ jump · ${atk} atk · ${ab} ability · ${ut} util`
      ].join("\n");
    }
    const c = window.CHARACTERS[this.selected.p2Index];
    const st = this.selected.p2Locked ? "LOCKED" : "SELECT";
    return [
      `${c.name}  ·  ${st}  ·  HP ${c.maxHealth}`,
      c.blurb || "",
      "",
      `Select: ←/→ move · ${atk} lock · Enter leave`,
      `Battle: ↑ jump · ${atk} atk · ${ab} ability · ${ut} util`,
      "",
      CharacterSelectScene.formatAttackBlock(c, 42)
    ].join("\n");
  }

  refreshUi() {
    this.cards.forEach((card, index) => {
      let stroke = 0x3f5372;
      let width = 2;
      let cardColor = 0x18263d;
      if (index === this.selected.p1Index) {
        stroke = this.selected.p1Locked ? 0x53a6ff : 0x8fc0ff;
        width = 4;
        cardColor = 0x20385a;
      }
      if (this.selected.p2Joined && index === this.selected.p2Index) {
        stroke = this.selected.p2Locked ? 0x64f39b : 0xb6ffcc;
        width = 4;
        cardColor = 0x203d4d;
      }
      if (index === this.selected.p1Index && this.selected.p2Joined && index === this.selected.p2Index) {
        stroke = 0xff7575;
      }
      card.box.setStrokeStyle(width, stroke);
      card.box.setFillStyle(cardColor, 0.95);
      card.title.setColor(
        index === this.selected.p1Index || (this.selected.p2Joined && index === this.selected.p2Index) ? "#ffffff" : "#d8e5ff"
      );
    });

    this.p1PanelText.setText(this.buildP1PanelString());
    this.p2PanelText.setText(this.buildP2PanelString());

    const allReady = this.canStartBattle();
    const p1Atk = CharacterSelectScene.getPlayerKeyLabel(1, "attack");
    const p2Atk = CharacterSelectScene.getPlayerKeyLabel(2, "attack");
    this.matchStatusText.setText(
      allReady
        ? "ARMED — All locked. Press SPACE or click the banner to deploy."
        : `STANDBY — Lock each active player (${p1Atk} for P1, ${p2Atk} for P2). Solo runs need P1 only.`
    );
    this.matchStatusText.setColor(allReady ? "#b8ffd2" : "#d7e7ff");
    this.matchStatusBg.setStrokeStyle(2, allReady ? 0x66f09e : 0x4f74a8, 0.95);
    this.startBanner.setColor(allReady ? "#9cffb0" : "#ffe9a4");

    if (!this.selected.p2Joined) {
      this.leaveButton.setVisible(false);
      this.leaveButtonLabel.setVisible(false);
    } else {
      this.leaveButton.setVisible(true);
      this.leaveButtonLabel.setVisible(true);
      this.leaveButton.setStrokeStyle(2, this.selected.p2Locked ? 0x66f09e : 0x8ab2dd);
    }
  }
}

window.CharacterSelectScene = CharacterSelectScene;
