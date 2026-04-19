class Hud {
  constructor(scene, players, boss) {
    this.scene = scene;
    this.players = players;
    this.boss = boss;
    this.uiDepth = 5000;
    const W = scene.scale.width;
    const H = scene.scale.height;

    this.bossBarBg = scene.add
      .rectangle(W * 0.5, 20, 240, 12, 0x1f1418, 0.88)
      .setStrokeStyle(2, 0x664444, 0.85)
      .setScrollFactor(0)
      .setDepth(this.uiDepth);
    this.bossBarFill = scene.add
      .rectangle(W * 0.5 - 118, 20, 236, 8, 0xe85d5d, 0.95)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(this.uiDepth + 1);
    this.bossText = scene.add
      .text(W * 0.5, 34, "", {
        fontSize: "12px",
        color: "#ffd4d4",
        fontFamily: "Arial, sans-serif"
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(this.uiDepth + 1);

    this.cornerSlots = players.map((p, i) => this.createCornerCluster(p, i, W, H));
    this.overheads = players.map((player) => this.createPlayerOverhead(player));

    this.viewModeText = scene.add
      .text(W - 8, 52, "", {
        fontSize: "10px",
        color: "#8fa8c8",
        fontFamily: "Arial, sans-serif"
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(this.uiDepth);
  }

  createCornerCluster(player, index, W, H) {
    const leftSide = index === 0;
    const depth = this.uiDepth;
    const col = player.definition.color || 0xffffff;
    const barW = 156;
    const padEdge = 10;
    const labelGap = 8;
    const labelW = 58;
    const barHpH = 11;
    const barCdH = 10;
    const barUtH = 9;
    const rowGap = 15;

    const padB = 10;
    const yUt = H - padB - barUtH * 0.5;
    const yCd = yUt - rowGap - (barUtH * 0.5 + barCdH * 0.5);
    const yHp = yCd - rowGap - (barCdH * 0.5 + barHpH * 0.5);
    const yTitle = yHp - 18;

    let barLeftEdge;
    let cx;
    let hpLbl;
    let ablLbl;
    let utlLbl;
    let titleLbl;

    const labelStyle = {
      fontSize: "11px",
      color: leftSide ? "#c8ddff" : "#c8ffe8",
      fontFamily: "Consolas, Monaco, 'Courier New', monospace",
      fontStyle: "bold"
    };

    if (leftSide) {
      barLeftEdge = padEdge + labelW + labelGap;
      cx = barLeftEdge + barW * 0.5;
      hpLbl = this.scene.add
        .text(padEdge, yHp, "HP", labelStyle)
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(depth + 1);
      ablLbl = this.scene.add
        .text(padEdge, yCd, "Ability", labelStyle)
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(depth + 1);
      utlLbl = this.scene.add
        .text(padEdge, yUt, "Utility", labelStyle)
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(depth + 1);
      titleLbl = this.scene.add
        .text(padEdge, yTitle, `${player.label} · ${player.definition.name}`, {
          fontSize: "10px",
          color: "#e8f2ff",
          fontFamily: "Consolas, Monaco, 'Courier New', monospace"
        })
        .setOrigin(0, 1)
        .setScrollFactor(0)
        .setDepth(depth + 1);
    } else {
      barLeftEdge = W - padEdge - barW;
      cx = barLeftEdge + barW * 0.5;
      const labelX = barLeftEdge - labelGap;
      hpLbl = this.scene.add
        .text(labelX, yHp, "HP", labelStyle)
        .setOrigin(1, 0.5)
        .setScrollFactor(0)
        .setDepth(depth + 1);
      ablLbl = this.scene.add
        .text(labelX, yCd, "Ability", labelStyle)
        .setOrigin(1, 0.5)
        .setScrollFactor(0)
        .setDepth(depth + 1);
      utlLbl = this.scene.add
        .text(labelX, yUt, "Utility", labelStyle)
        .setOrigin(1, 0.5)
        .setScrollFactor(0)
        .setDepth(depth + 1);
      titleLbl = this.scene.add
        .text(W - padEdge, yTitle, `${player.label} · ${player.definition.name}`, {
          fontSize: "10px",
          color: "#e8f2ff",
          fontFamily: "Consolas, Monaco, 'Courier New', monospace"
        })
        .setOrigin(1, 1)
        .setScrollFactor(0)
        .setDepth(depth + 1);
    }

    const hpBg = this.scene.add
      .rectangle(cx, yHp, barW, barHpH, 0x14141c, 0.94)
      .setStrokeStyle(1, 0x3a4050, 0.95)
      .setScrollFactor(0)
      .setDepth(depth);
    const hpFill = this.scene.add
      .rectangle(barLeftEdge + 1, yHp, barW - 2, barHpH - 2, col, 1)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(depth + 1);
    const cdBg = this.scene.add
      .rectangle(cx, yCd, barW, barCdH, 0x14141c, 0.94)
      .setStrokeStyle(1, 0x354050, 0.9)
      .setScrollFactor(0)
      .setDepth(depth);
    const cdFill = this.scene.add
      .rectangle(barLeftEdge + 1, yCd, barW - 2, barCdH - 2, 0x66ccff, 0.95)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(depth + 1);
    const utBg = this.scene.add
      .rectangle(cx, yUt, barW, barUtH, 0x14141c, 0.94)
      .setStrokeStyle(1, 0x354050, 0.85)
      .setScrollFactor(0)
      .setDepth(depth);
    const utFill = this.scene.add
      .rectangle(barLeftEdge + 1, yUt, barW - 2, barUtH - 2, 0xffb86c, 0.95)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(depth + 1);

    return {
      player,
      barW,
      barLeftEdge,
      cx,
      yHp,
      yCd,
      yUt,
      hpBg,
      hpFill,
      cdBg,
      cdFill,
      utBg,
      utFill,
      hpLbl,
      ablLbl,
      utlLbl,
      titleLbl
    };
  }

  createPlayerOverhead(player) {
    const depth = 450;
    const barW = 56;
    const col = player.definition.color || 0xffffff;
    const hpBg = this.scene.add
      .rectangle(0, 0, barW, 6, 0x14141c, 0.94)
      .setStrokeStyle(1, 0x3a4050, 0.95)
      .setDepth(depth);
    const hpFill = this.scene.add
      .rectangle(0, 0, barW - 2, 4, col, 1)
      .setOrigin(0, 0.5)
      .setDepth(depth + 1);
    const cdBg = this.scene.add
      .rectangle(0, 0, barW, 5, 0x14141c, 0.94)
      .setStrokeStyle(1, 0x354050, 0.9)
      .setDepth(depth);
    const cdFill = this.scene.add
      .rectangle(0, 0, barW - 2, 3, 0x66ccff, 0.95)
      .setOrigin(0, 0.5)
      .setDepth(depth + 1);
    const utBg = this.scene.add
      .rectangle(0, 0, barW, 4, 0x14141c, 0.94)
      .setStrokeStyle(1, 0x354050, 0.85)
      .setDepth(depth);
    const utFill = this.scene.add
      .rectangle(0, 0, barW - 2, 2, 0xffb86c, 0.95)
      .setOrigin(0, 0.5)
      .setDepth(depth + 1);
    const tag = this.scene.add
      .text(0, 0, player.label, {
        fontSize: "9px",
        color: "#f0f4ff",
        fontFamily: "Arial, sans-serif"
      })
      .setOrigin(0.5, 1)
      .setDepth(depth + 2)
      .setAlpha(0.9);
    hpBg.setScrollFactor(1);
    hpFill.setScrollFactor(1);
    cdBg.setScrollFactor(1);
    cdFill.setScrollFactor(1);
    utBg.setScrollFactor(1);
    utFill.setScrollFactor(1);
    tag.setScrollFactor(1);
    return { hpBg, hpFill, cdBg, cdFill, utBg, utFill, tag, barW };
  }

  updateCornerSlot(slot, now, visible) {
    const parts = [
      slot.hpBg,
      slot.hpFill,
      slot.cdBg,
      slot.cdFill,
      slot.utBg,
      slot.utFill,
      slot.hpLbl,
      slot.ablLbl,
      slot.utlLbl,
      slot.titleLbl
    ];
    const player = slot.player;
    if (!visible || !player || !player.active || !player.isAlive) {
      parts.forEach((obj) => obj.setAlpha(0));
      return;
    }
    parts.forEach((obj) => obj.setAlpha(1));
    slot.titleLbl.setAlpha(0.95);

    const barW = slot.barW;
    const left = slot.barLeftEdge;
    const hpFrac = player.maxHealth > 0 ? Phaser.Math.Clamp(player.health / player.maxHealth, 0, 1) : 0;
    slot.hpFill.width = Math.max(1, (barW - 2) * hpFrac);
    slot.hpFill.setPosition(left + 1, slot.yHp);

    const cdMax = Math.max(1, player.definition.ability.cooldownMs || 1000);
    const cdLeft = Math.max(0, player.nextAbilityTime - now);
    const ready = cdLeft <= 0;
    const cdFrac = ready ? 1 : Phaser.Math.Clamp(1 - cdLeft / cdMax, 0, 1);
    slot.cdFill.width = Math.max(1, (barW - 2) * cdFrac);
    slot.cdFill.setFillStyle(ready ? 0x66ff99 : 0x66aadd, 1);
    slot.cdFill.setPosition(left + 1, slot.yCd);

    const utilDef = player.definition.utility;
    const utilMax = Math.max(1, utilDef?.cooldownMs || 1000);
    const uLeft = Math.max(0, player.nextUtilityTime - now);
    const uReady = uLeft <= 0;
    const shroudUt = utilDef?.type === "soulShroud";
    if (shroudUt && player.soulShroudActive) {
      const totalMs = Math.max(
        1,
        player.soulShroudDurationMs || utilDef?.tuning?.stealthDurationMs || 8000
      );
      const remainMs = Math.max(0, (player.soulShroudExpiresAt || now) - now);
      const uFrac = Phaser.Math.Clamp(remainMs / totalMs, 0, 1);
      slot.utFill.width = Math.max(1, (barW - 2) * uFrac);
      slot.utFill.setFillStyle(0x58d8e8, 1);
      slot.utlLbl.setText(`Shroud ${Math.ceil(remainMs / 1000)}s`);
    } else {
      const uFrac = uReady ? 1 : Phaser.Math.Clamp(1 - uLeft / utilMax, 0, 1);
      slot.utFill.width = Math.max(1, (barW - 2) * uFrac);
      slot.utFill.setFillStyle(uReady ? 0xffdd99 : 0xffb86c, 1);
      if (shroudUt && !uReady) {
        slot.utlLbl.setText(`Shroud CD ${Math.ceil(uLeft / 1000)}s`);
      } else {
        slot.utlLbl.setText("Utility");
      }
    }
    slot.utFill.setPosition(left + 1, slot.yUt);
  }

  update() {
    const now = this.scene.time.now;
    const maxBoss = Math.max(1, this.boss.maxHealth);
    const bossHp = Math.max(0, this.boss.health);
    const bossFrac = Phaser.Math.Clamp(bossHp / maxBoss, 0, 1);
    this.bossBarFill.width = 236 * bossFrac;
    this.bossText.setText(`${this.boss.definition.name}   ${Math.ceil(bossHp)} / ${maxBoss}`);

    const mode = typeof window.getHudDisplayMode === "function" ? window.getHudDisplayMode() : "both";
    const showOverhead = mode === "overhead" || mode === "both";
    const showCorner = mode === "corner" || mode === "both";

    this.players.forEach((player, index) => {
      const slot = this.cornerSlots[index];
      if (slot) {
        this.updateCornerSlot(slot, now, showCorner);
      }
    });

    this.overheads.forEach((o, index) => {
      const player = this.players[index];
      if (!showOverhead || !player || !player.active || !player.isAlive) {
        [o.hpBg, o.hpFill, o.cdBg, o.cdFill, o.utBg, o.utFill, o.tag].forEach((obj) => obj.setAlpha(0));
        return;
      }
      [o.hpBg, o.hpFill, o.cdBg, o.cdFill, o.utBg, o.utFill, o.tag].forEach((obj) => obj.setAlpha(1));
      o.tag.setAlpha(0.9);

      const x = player.x;
      const y = player.y;
      const barW = o.barW;
      o.tag.setPosition(x, y - 72);
      o.hpBg.setPosition(x, y - 64);
      const hpFrac = player.maxHealth > 0 ? Phaser.Math.Clamp(player.health / player.maxHealth, 0, 1) : 0;
      o.hpFill.width = Math.max(1, (barW - 2) * hpFrac);
      o.hpFill.setPosition(x - barW * 0.5 + 1, y - 64);

      const cdMax = Math.max(1, player.definition.ability.cooldownMs || 1000);
      const left = Math.max(0, player.nextAbilityTime - now);
      const ready = left <= 0;
      const cdFrac = ready ? 1 : Phaser.Math.Clamp(1 - left / cdMax, 0, 1);
      o.cdFill.width = Math.max(1, (barW - 2) * cdFrac);
      o.cdFill.setFillStyle(ready ? 0x66ff99 : 0x66aadd, 1);
      o.cdBg.setPosition(x, y - 56);
      o.cdFill.setPosition(x - barW * 0.5 + 1, y - 56);

      const utilDefO = player.definition.utility;
      const utilMaxO = Math.max(1, utilDefO?.cooldownMs || 1000);
      const uLeftO = Math.max(0, player.nextUtilityTime - now);
      const uReadyO = uLeftO <= 0;
      const shroudUtO = utilDefO?.type === "soulShroud";
      if (shroudUtO && player.soulShroudActive) {
        const totalMsO = Math.max(
          1,
          player.soulShroudDurationMs || utilDefO?.tuning?.stealthDurationMs || 8000
        );
        const remainMsO = Math.max(0, (player.soulShroudExpiresAt || now) - now);
        const uFracO = Phaser.Math.Clamp(remainMsO / totalMsO, 0, 1);
        o.utFill.width = Math.max(1, (barW - 2) * uFracO);
        o.utFill.setFillStyle(0x58d8e8, 1);
      } else {
        const uFracO = uReadyO ? 1 : Phaser.Math.Clamp(1 - uLeftO / utilMaxO, 0, 1);
        o.utFill.width = Math.max(1, (barW - 2) * uFracO);
        o.utFill.setFillStyle(uReadyO ? 0xffdd99 : 0xffb86c, 1);
      }
      o.utBg.setPosition(x, y - 48);
      o.utFill.setPosition(x - barW * 0.5 + 1, y - 48);
    });

    const hbMode = this.scene.isTrueHitboxView && this.scene.isTrueHitboxView() ? "Hitboxes" : "VFX";
    this.viewModeText.setText(`\` : ${hbMode}`);
  }
}

window.Hud = Hud;
