/** Phaser.GameObjects.Graphics has no quadraticCurveTo — sample the curve with lineTo. */
function graphicsQuadBezier(g, x0, y0, cpx, cpy, x1, y1, segments = 12) {
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    const px = u * u * x0 + 2 * u * t * cpx + t * t * x1;
    const py = u * u * y0 + 2 * u * t * cpy + t * t * y1;
    g.lineTo(px, py);
  }
}

class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {}

  create() {
    try {
      if (!window.CHARACTERS || !Array.isArray(window.CHARACTERS)) {
        throw new Error("characters.js did not load (window.CHARACTERS missing).");
      }
      if (!window.BOSSES || !Array.isArray(window.BOSSES)) {
        throw new Error("bosses.js did not load (window.BOSSES missing).");
      }

      this.createSimpleTexture("pixel", 8, 8, 0xffffff);
      this.createSimpleTexture("projectile_player", 12, 6, 0xfff7a8);
      this.createPlayerProjectileTextures();
      this.createSimpleTexture("projectile_boss", 12, 6, 0xff7f7f);
      this.createSimpleTexture("hazard", 10, 24, 0xffbb66);
      this.createGolemRockMeteorTexture();
      this.createWraithExtraTextures();
      this.createPyromancerExtraTextures();
      this.createStalkerExtraTextures();
      this.createHollowExtraTextures();
      this.createBehemothExtraTextures();
      this.createGaleSovereignExtraTextures();
      this.createSimpleTexture("platform", 180, 22, 0x5d6b80);

      window.CHARACTERS.forEach((character, i) => this.createCharacterTexture(`player_${i}`, character));
      window.BOSSES.forEach((boss, i) => {
        this.createBossTexture(`boss_${i}`, boss);
        if (boss.twinBoss) {
          this.createBossTexture(`boss_${i}_twin`, { ...boss, twinVisual: true });
        }
      });

      this.scene.start("MainMenuScene");
    } catch (err) {
      console.error("BootScene.create failed", err);
      this.add
        .text(
          this.scale.width * 0.5,
          this.scale.height * 0.5,
          [
            "Could not finish loading.",
            "Open the browser console (F12) and look for red errors.",
            String(err && err.message ? err.message : err)
          ],
          {
            fontSize: "16px",
            color: "#ffaaaa",
            align: "center",
            wordWrap: { width: this.scale.width - 80 }
          }
        )
        .setOrigin(0.5);
    }
  }

  createSimpleTexture(key, width, height, fillColor) {
    if (this.textures.exists(key)) return;
    const graphics = this.make.graphics({ x: 0, y: 0, add: false });
    graphics.fillStyle(fillColor, 1);
    graphics.fillRoundedRect(0, 0, width, height, 6);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }

  createWraithExtraTextures() {
    if (!this.textures.exists("proj_wraith_ghost")) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      const body = 0xd8e8ff;
      const core = 0xa8c8ff;
      const eye = 0x6a48a8;
      g.fillStyle(body, 0.55);
      g.fillEllipse(14, 12, 22, 18);
      g.fillStyle(core, 0.4);
      g.fillEllipse(12, 11, 16, 12);
      g.fillStyle(eye, 0.85);
      g.fillCircle(9, 11, 2.2);
      g.fillCircle(17, 11, 2.2);
      g.fillStyle(body, 0.35);
      g.beginPath();
      g.moveTo(4, 14);
      graphicsQuadBezier(g, 4, 14, 2, 22, 8, 26);
      g.lineTo(12, 22);
      graphicsQuadBezier(g, 12, 22, 10, 18, 4, 14);
      g.closePath();
      g.fillPath();
      g.beginPath();
      g.moveTo(24, 14);
      graphicsQuadBezier(g, 24, 14, 28, 22, 22, 26);
      g.lineTo(18, 22);
      graphicsQuadBezier(g, 18, 22, 20, 18, 24, 14);
      g.closePath();
      g.fillPath();
      g.generateTexture("proj_wraith_ghost", 28, 28);
      g.destroy();
    }
    if (!this.textures.exists("wraith_scythe")) {
      const s = this.make.graphics({ x: 0, y: 0, add: false });
      const blade = 0xc8d8f0;
      const edge = 0xe8f4ff;
      const shaft = 0x4a5060;
      s.fillStyle(shaft, 1);
      s.fillRoundedRect(4, 38, 6, 42, 2);
      s.fillStyle(blade, 0.95);
      s.beginPath();
      s.moveTo(7, 38);
      graphicsQuadBezier(s, 7, 38, 52, 8, 58, 4);
      s.lineTo(54, 12);
      graphicsQuadBezier(s, 54, 12, 36, 28, 10, 40);
      s.closePath();
      s.fillPath();
      s.lineStyle(2, edge, 0.85);
      s.beginPath();
      s.moveTo(10, 36);
      graphicsQuadBezier(s, 10, 36, 48, 10, 56, 6);
      s.strokePath();
      s.fillStyle(0x8899b8, 0.5);
      s.fillCircle(7, 58, 4);
      s.generateTexture("wraith_scythe", 64, 88);
      s.destroy();
    }
  }

  createPyromancerExtraTextures() {
    if (!this.textures.exists("proj_pyro_ember_rock")) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      const rock = 0x4a3828;
      const ember = 0xff5522;
      const core = 0xffcc44;
      g.fillStyle(rock, 1);
      g.fillEllipse(16, 16, 22, 16);
      g.fillStyle(0x3a2818, 0.9);
      g.fillEllipse(12, 18, 8, 5);
      g.fillStyle(ember, 0.95);
      g.fillEllipse(16, 11, 16, 12);
      g.fillStyle(core, 0.85);
      g.fillEllipse(12, 8, 6, 5);
      g.fillEllipse(20, 9, 5, 4);
      g.fillStyle(0xff2200, 0.65);
      g.fillCircle(16, 6, 5);
      g.fillStyle(0xffffaa, 0.5);
      g.fillCircle(14, 5, 2);
      g.generateTexture("proj_pyro_ember_rock", 32, 26);
      g.destroy();
    }
    if (!this.textures.exists("proj_rift_bolt")) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      // outer void-fire halo
      g.fillStyle(0x220808, 0.5);
      g.fillCircle(16, 16, 14);
      g.fillStyle(0x881100, 0.45);
      g.fillCircle(16, 16, 11);
      // swirling fire ring
      g.lineStyle(3, 0xff4400, 0.7);
      g.beginPath();
      g.arc(16, 16, 10, 0, Math.PI * 1.4);
      g.strokePath();
      g.lineStyle(2, 0xffaa22, 0.6);
      g.beginPath();
      g.arc(16, 16, 7, Math.PI * 0.6, Math.PI * 2.0);
      g.strokePath();
      // hot core
      g.fillStyle(0xff6622, 0.9);
      g.fillCircle(16, 16, 6);
      g.fillStyle(0xffcc44, 0.85);
      g.fillCircle(16, 15, 3.5);
      g.fillStyle(0xfff8dd, 0.7);
      g.fillCircle(15, 14, 1.8);
      // ember sparks
      g.fillStyle(0xff8833, 0.75);
      g.fillCircle(8, 10, 2);
      g.fillCircle(24, 12, 1.5);
      g.fillCircle(22, 22, 1.8);
      g.fillCircle(10, 23, 1.5);
      g.generateTexture("proj_rift_bolt", 32, 32);
      g.destroy();
    }
    if (!this.textures.exists("proj_bone_shard")) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      const bone = 0xe8d8cc;
      const marrow = 0xf472b6;
      const shadow = 0x3a1828;
      g.fillStyle(shadow, 0.5);
      g.fillEllipse(10, 9, 18, 8);
      g.fillStyle(bone, 0.92);
      g.beginPath();
      g.moveTo(2, 7);
      g.lineTo(18, 4);
      g.lineTo(20, 8);
      g.lineTo(18, 12);
      g.lineTo(2, 9);
      g.closePath();
      g.fillPath();
      g.fillStyle(0xffffff, 0.35);
      g.fillRect(5, 6, 8, 2);
      g.fillStyle(marrow, 0.55);
      g.fillCircle(17, 8, 3);
      g.fillStyle(marrow, 0.3);
      g.fillCircle(4, 8, 2);
      g.lineStyle(1, shadow, 0.4);
      g.strokeRoundedRect(2, 4, 18, 8, 2);
      g.generateTexture("proj_bone_shard", 22, 16);
      g.destroy();
    }
  }

  createStalkerExtraTextures() {
    if (!this.textures.exists("proj_void_arrow")) {
      const a = this.make.graphics({ x: 0, y: 0, add: false });
      const tip = 0xcf7cff;
      const core = 0x2a1048;
      a.fillStyle(core, 0.95);
      a.beginPath();
      a.moveTo(2, 6);
      a.lineTo(14, 6);
      a.lineTo(18, 8);
      a.lineTo(14, 10);
      a.lineTo(2, 10);
      a.closePath();
      a.fillPath();
      a.lineStyle(2, tip, 0.85);
      a.beginPath();
      a.moveTo(2, 6);
      a.lineTo(18, 8);
      a.lineTo(2, 10);
      a.strokePath();
      a.fillStyle(tip, 0.55);
      a.fillCircle(6, 8, 2);
      a.generateTexture("proj_void_arrow", 20, 16);
      a.destroy();
    }
    if (!this.textures.exists("stalker_claw")) {
      const c = this.make.graphics({ x: 0, y: 0, add: false });
      const claw = 0x9a6acc;
      const dark = 0x3a2060;
      c.fillStyle(dark, 0.95);
      c.beginPath();
      c.moveTo(4, 22);
      c.lineTo(10, 4);
      c.lineTo(14, 20);
      c.lineTo(18, 6);
      c.lineTo(22, 22);
      c.lineTo(16, 24);
      c.lineTo(12, 12);
      c.lineTo(8, 24);
      c.closePath();
      c.fillPath();
      c.lineStyle(2, claw, 0.9);
      c.beginPath();
      c.moveTo(10, 4);
      c.lineTo(14, 20);
      c.lineTo(18, 6);
      c.strokePath();
      c.generateTexture("stalker_claw", 28, 28);
      c.destroy();
    }
    if (!this.textures.exists("shadow_spear")) {
      const s = this.make.graphics({ x: 0, y: 0, add: false });
      const blade = 0x1a0a28;
      const edge = 0xcf7cff;
      s.fillStyle(blade, 0.92);
      s.fillTriangle(2, 8, 52, 6, 52, 10);
      s.fillStyle(edge, 0.35);
      s.fillTriangle(2, 8, 20, 7, 20, 9);
      s.lineStyle(2, edge, 0.65);
      s.beginPath();
      s.moveTo(4, 8);
      s.lineTo(50, 7);
      s.strokePath();
      s.lineStyle(1, 0x8866aa, 0.4);
      s.beginPath();
      s.moveTo(8, 8);
      s.lineTo(48, 7.5);
      s.strokePath();
      s.generateTexture("shadow_spear", 56, 16);
      s.destroy();
    }
  }

  createHollowExtraTextures() {
    if (!this.textures.exists("proj_hollow_void_spear")) {
      const s = this.make.graphics({ x: 0, y: 0, add: false });
      const tip = 0xe8b8ff;
      const blade = 0x7a48b0;
      const shaft = 0x1a0c28;
      const glow = 0xd090ff;
      // trailing wisp
      s.fillStyle(glow, 0.15);
      s.fillEllipse(8, 10, 14, 6);
      // shaft
      s.fillStyle(shaft, 1);
      s.fillRoundedRect(2, 7, 26, 6, 2);
      s.lineStyle(1, 0x2a1840, 0.7);
      s.strokeRoundedRect(2, 7, 26, 6, 2);
      // shaft rune marks
      s.fillStyle(glow, 0.35);
      s.fillRect(8, 8, 2, 4);
      s.fillRect(14, 8, 2, 4);
      s.fillRect(20, 8, 2, 4);
      // spearhead
      s.fillStyle(blade, 0.98);
      s.beginPath();
      s.moveTo(28, 10); s.lineTo(44, 4); s.lineTo(46, 10); s.lineTo(44, 16);
      s.closePath(); s.fillPath();
      // spearhead edge glow
      s.lineStyle(1.5, tip, 0.92);
      s.beginPath(); s.moveTo(28, 10); s.lineTo(45, 5); s.strokePath();
      s.lineStyle(1, tip, 0.6);
      s.beginPath(); s.moveTo(28, 10); s.lineTo(45, 15); s.strokePath();
      // bright tip
      s.fillStyle(0xffffff, 0.7);
      s.fillCircle(44, 10, 2);
      // energy core on shaft
      s.fillStyle(tip, 0.5);
      s.fillEllipse(16, 10, 8, 4);
      s.generateTexture("proj_hollow_void_spear", 48, 20);
      s.destroy();
    }
    if (!this.textures.exists("hollow_blackhole_orb")) {
      const o = this.make.graphics({ x: 0, y: 0, add: false });
      const cx = 30;
      const cy = 30;
      // outer distortion halo
      o.fillStyle(0xff66cc, 0.2);
      o.fillCircle(cx, cy, 29);
      // accretion ring
      o.lineStyle(4, 0xc040c8, 0.4);
      o.beginPath(); o.arc(cx, cy, 24, 0, Math.PI * 1.5); o.strokePath();
      o.lineStyle(3, 0xff88ee, 0.5);
      o.beginPath(); o.arc(cx, cy, 21, Math.PI * 0.5, Math.PI * 2); o.strokePath();
      o.lineStyle(2, 0xffa8ff, 0.35);
      o.beginPath(); o.arc(cx, cy, 18, Math.PI, Math.PI * 2.3); o.strokePath();
      // mid ring
      o.fillStyle(0x6020a0, 0.65);
      o.fillCircle(cx, cy, 16);
      // dark core
      o.fillStyle(0x060010, 0.98);
      o.fillCircle(cx, cy, 10);
      o.fillStyle(0x0a0418, 0.85);
      o.fillCircle(cx - 2, cy - 2, 5);
      // bright hot spots on accretion
      o.fillStyle(0xffa0ff, 0.55);
      o.fillCircle(cx + 14, cy - 12, 3);
      o.fillCircle(cx - 16, cy + 8, 2.5);
      o.fillStyle(0xffffff, 0.35);
      o.fillCircle(cx + 12, cy - 14, 1.5);
      // inner glow ring
      o.lineStyle(1.5, 0xff60dd, 0.4);
      o.strokeCircle(cx, cy, 12);
      o.generateTexture("hollow_blackhole_orb", 60, 60);
      o.destroy();
    }
    if (!this.textures.exists("hollow_bloom_shard")) {
      const h = this.make.graphics({ x: 0, y: 0, add: false });
      const edge = 0xd060f0;
      const dark = 0x3a1060;
      const bright = 0xf0c0ff;
      // outer glow
      h.fillStyle(edge, 0.15);
      h.fillEllipse(18, 12, 28, 14);
      // crystal body
      h.fillStyle(dark, 0.96);
      h.beginPath();
      h.moveTo(2, 12); h.lineTo(16, 4); h.lineTo(32, 8);
      h.lineTo(34, 12); h.lineTo(32, 16); h.lineTo(16, 20);
      h.closePath(); h.fillPath();
      // inner facet highlight
      h.fillStyle(0x6a30a0, 0.65);
      h.beginPath();
      h.moveTo(6, 12); h.lineTo(16, 6); h.lineTo(26, 9); h.lineTo(24, 14);
      h.closePath(); h.fillPath();
      // edge glow lines
      h.lineStyle(2, edge, 0.88);
      h.beginPath(); h.moveTo(4, 12); h.lineTo(16, 5); h.lineTo(33, 9); h.strokePath();
      h.lineStyle(1.5, bright, 0.5);
      h.beginPath(); h.moveTo(6, 12); h.lineTo(16, 7); h.strokePath();
      // bright tip
      h.fillStyle(bright, 0.6);
      h.fillCircle(32, 12, 2.5);
      // core glow
      h.fillStyle(edge, 0.45);
      h.fillCircle(14, 12, 3.5);
      h.generateTexture("hollow_bloom_shard", 36, 24);
      h.destroy();
    }
  }

  createBehemothExtraTextures() {
    if (!this.textures.exists("behemoth_meteor")) {
      const m = this.make.graphics({ x: 0, y: 0, add: false });
      const rock = 0x3a4838;
      const rockHi = 0x5a6858;
      const moss = 0x5a9868;
      const core = 0xb7ff7f;
      const glow = 0xd8ffc8;
      m.fillStyle(rock, 1);
      m.fillEllipse(48, 52, 82, 64);
      m.fillStyle(rockHi, 0.85);
      m.fillEllipse(42, 48, 48, 36);
      m.fillStyle(0x1a2818, 0.9);
      m.fillEllipse(30, 56, 28, 18);
      m.fillEllipse(58, 50, 20, 14);
      m.lineStyle(2, 0x2a3828, 0.7);
      m.beginPath();
      m.moveTo(22, 44);
      m.lineTo(38, 62);
      m.lineTo(28, 68);
      m.strokePath();
      m.beginPath();
      m.moveTo(62, 38);
      m.lineTo(78, 58);
      m.lineTo(70, 66);
      m.strokePath();
      m.lineStyle(3, moss, 0.75);
      m.beginPath();
      m.moveTo(14, 52);
      graphicsQuadBezier(m, 14, 52, 48, 72, 82, 50);
      m.strokePath();
      m.fillStyle(core, 0.55);
      m.fillEllipse(48, 40, 36, 26);
      m.fillStyle(glow, 0.35);
      m.fillEllipse(44, 36, 14, 10);
      m.fillEllipse(56, 42, 10, 8);
      m.lineStyle(2, 0xe8ffd0, 0.65);
      m.beginPath();
      m.moveTo(36, 34);
      m.lineTo(52, 48);
      m.lineTo(48, 52);
      m.lineTo(32, 40);
      m.closePath();
      m.strokePath();
      m.lineStyle(1, glow, 0.4);
      m.beginPath();
      m.arc(48, 40, 22, 0, Math.PI * 2);
      m.strokePath();
      m.fillStyle(0xa8e888, 0.25);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        m.fillCircle(48 + Math.cos(a) * 18, 40 + Math.sin(a) * 12, 2.5);
      }
      m.generateTexture("behemoth_meteor", 96, 96);
      m.destroy();
    }
    if (!this.textures.exists("behemoth_boulder_slam")) {
      const s = this.make.graphics({ x: 0, y: 0, add: false });
      const stone = 0x4a5048;
      const stoneHi = 0x6a7870;
      const band = 0x3a3530;
      const rivet = 0x8a9088;
      const vein = 0x9ae878;
      const veinCore = 0xe8ffd0;
      s.fillStyle(stone, 1);
      s.fillRoundedRect(8, 18, 80, 68, 10);
      s.fillStyle(stoneHi, 0.6);
      s.fillRoundedRect(14, 24, 68, 24, 6);
      s.lineStyle(4, band, 0.95);
      s.beginPath();
      s.moveTo(12, 38);
      s.lineTo(84, 38);
      s.strokePath();
      s.lineStyle(3, band, 0.85);
      s.beginPath();
      s.moveTo(12, 58);
      s.lineTo(84, 58);
      s.strokePath();
      for (let i = 0; i < 5; i++) {
        s.fillStyle(rivet, 0.9);
        s.fillCircle(20 + i * 14, 38, 3);
        s.fillCircle(20 + i * 14, 58, 3);
      }
      s.lineStyle(2, 0x2a3028, 0.8);
      s.beginPath();
      s.moveTo(28, 22);
      s.lineTo(36, 34);
      s.lineTo(32, 40);
      s.strokePath();
      s.beginPath();
      s.moveTo(64, 20);
      s.lineTo(58, 32);
      s.lineTo(62, 42);
      s.strokePath();
      s.fillStyle(vein, 0.45);
      s.beginPath();
      s.moveTo(48, 28);
      s.lineTo(42, 52);
      s.lineTo(52, 56);
      s.lineTo(56, 32);
      s.closePath();
      s.fillPath();
      s.lineStyle(2, veinCore, 0.7);
      s.beginPath();
      s.moveTo(46, 34);
      s.lineTo(44, 48);
      s.strokePath();
      s.fillStyle(veinCore, 0.5);
      s.fillCircle(48, 44, 5);
      s.lineStyle(3, 0x1a1e18, 0.5);
      s.strokeRoundedRect(8, 18, 80, 68, 10);
      s.fillStyle(0x1a1e18, 0.35);
      s.fillTriangle(40, 78, 32, 88, 56, 88);
      s.generateTexture("behemoth_boulder_slam", 96, 96);
      s.destroy();
    }
  }

  createGaleSovereignExtraTextures() {
    if (!this.textures.exists("proj_gale_air")) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      const cx = 20;
      const cy = 20;
      const edge = 0x5ee0d4;
      const mid = 0xa8f8ff;
      const core = 0xf0ffff;
      g.fillStyle(edge, 0.35);
      g.fillCircle(cx, cy, 18);
      g.fillStyle(mid, 0.5);
      g.fillCircle(cx, cy, 13);
      g.fillStyle(core, 0.72);
      g.fillCircle(cx, cy, 8);
      g.lineStyle(2, edge, 0.55);
      g.strokeCircle(cx, cy, 16);
      g.lineStyle(1, 0xffffff, 0.45);
      g.strokeCircle(cx - 2, cy - 2, 6);
      g.generateTexture("proj_gale_air", 40, 40);
      g.destroy();
    }
    if (!this.textures.exists("proj_gale_seeker")) {
      const b = this.make.graphics({ x: 0, y: 0, add: false });
      const rim = 0x7df5e8;
      const core = 0xf8fffe;
      const tail = 0xb8fff5;
      b.fillStyle(tail, 0.35);
      b.fillEllipse(20, 20, 28, 12);
      b.fillStyle(rim, 0.85);
      b.fillEllipse(20, 20, 18, 10);
      b.fillStyle(core, 0.95);
      b.fillEllipse(22, 20, 10, 6);
      b.lineStyle(1, 0xffffff, 0.65);
      b.strokeEllipse(20, 20, 18, 10);
      b.generateTexture("proj_gale_seeker", 40, 40);
      b.destroy();
    }
    if (!this.textures.exists("proj_gale_shear")) {
      const s = this.make.graphics({ x: 0, y: 0, add: false });
      s.fillStyle(0xa8fff0, 0.55);
      s.fillEllipse(10, 10, 18, 10);
      s.fillStyle(0xffffff, 0.85);
      s.fillEllipse(10, 10, 8, 5);
      s.lineStyle(1, 0x3dd4c8, 0.8);
      s.strokeEllipse(10, 10, 18, 10);
      s.generateTexture("proj_gale_shear", 20, 20);
      s.destroy();
    }
  }

  createGolemRockMeteorTexture() {
    if (this.textures.exists("golem_rock_meteor")) return;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const base = 0x6a6e78;
    const hi = 0x9ca0a8;
    const lo = 0x3a3c44;
    g.fillStyle(base, 1);
    g.fillEllipse(48, 52, 88, 72);
    g.fillStyle(hi, 1);
    g.fillEllipse(40, 44, 52, 40);
    g.fillStyle(lo, 0.85);
    g.fillEllipse(58, 58, 36, 28);
    g.lineStyle(3, lo, 0.9);
    g.beginPath();
    g.moveTo(22, 48);
    g.lineTo(38, 62);
    g.lineTo(30, 70);
    g.strokePath();
    g.beginPath();
    g.moveTo(62, 36);
    g.lineTo(74, 50);
    g.lineTo(68, 58);
    g.strokePath();
    g.fillStyle(0x5a7a5a, 0.35);
    g.fillEllipse(52, 64, 22, 10);
    g.generateTexture("golem_rock_meteor", 96, 96);
    g.destroy();
  }

  /** Distinct silhouettes for HUD / character select / in-game. */
  createCharacterTexture(key, character) {
    if (this.textures.exists(key)) return;
    const w = 78;
    const h = 96;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const skin = 0xffe5ce;
    const hairDk = 0x1a1420;

    const drawEyes = (x1, y1, x2, y2, glow = 0xf4f8ff, r = 2.2) => {
      g.fillStyle(0x08080e, 0.95);
      g.fillCircle(x1, y1, r + 0.4);
      g.fillCircle(x2, y2, r + 0.4);
      g.fillStyle(glow, 0.92);
      g.fillCircle(x1 - 0.4, y1 - 0.3, r * 0.52);
      g.fillCircle(x2 - 0.4, y2 - 0.3, r * 0.52);
    };

    const drawMouth = (cx, cy) => {
      g.lineStyle(1, 0x3f2a1f, 0.7);
      g.beginPath();
      g.moveTo(cx - 3, cy);
      g.lineTo(cx + 3, cy);
      g.strokePath();
    };

    switch (character.id) {
      case "vanguard": {
        const plate = 0x8eaed0;
        const cloth = 0x2d5088;
        const steel = 0xc0d0e8;
        const dark = 0x1a2e4a;
        g.fillStyle(0x101830, 0.45);
        g.fillEllipse(39, 88, 46, 12);
        g.fillStyle(cloth, 0.98);
        g.fillRoundedRect(20, 34, 38, 48, 7);
        g.fillStyle(0x243e6a, 0.5);
        g.fillRect(36, 42, 4, 36);
        g.fillStyle(dark, 0.95);
        g.fillRoundedRect(16, 32, 46, 22, 6);
        g.fillStyle(plate, 0.98);
        g.fillRoundedRect(14, 30, 50, 18, 5);
        g.lineStyle(1, steel, 0.75);
        g.strokeRoundedRect(14, 30, 50, 18, 5);
        g.fillStyle(steel, 0.3);
        g.fillRect(16, 30, 46, 3);
        g.fillStyle(0x5a7aaa, 0.95);
        g.fillRoundedRect(16, 33, 14, 12, 2);
        g.fillRoundedRect(48, 33, 14, 12, 2);
        g.fillStyle(steel, 0.5);
        g.fillRect(16, 36, 14, 2);
        g.fillRect(48, 36, 14, 2);
        g.fillStyle(steel, 0.25);
        g.fillRect(17, 39, 12, 1);
        g.fillRect(49, 39, 12, 1);
        g.fillStyle(cloth, 0.9);
        g.fillRoundedRect(22, 50, 14, 14, 2);
        g.fillRoundedRect(42, 50, 14, 14, 2);
        g.fillStyle(0x3a5a90, 0.6);
        g.fillRect(24, 53, 10, 2);
        g.fillRect(44, 53, 10, 2);
        g.fillStyle(0x6090c0, 0.7);
        g.fillRect(22, 62, 34, 3);
        g.fillStyle(steel, 0.5);
        g.fillRect(36, 62, 6, 3);
        g.fillStyle(0x1e3052, 1);
        g.fillRoundedRect(20, 66, 10, 20, 4);
        g.fillRoundedRect(48, 66, 10, 20, 4);
        g.fillStyle(0x2a4470, 0.5);
        g.fillRect(22, 80, 6, 4);
        g.fillRect(50, 80, 6, 4);
        g.fillStyle(skin, 1);
        g.fillCircle(39, 22, 12);
        g.fillStyle(0x4a6898, 0.96);
        g.beginPath();
        g.moveTo(39, 6); g.lineTo(28, 17); g.lineTo(50, 17);
        g.closePath(); g.fillPath();
        g.fillStyle(plate, 0.85);
        g.fillTriangle(39, 8, 32, 16, 46, 16);
        g.lineStyle(1.5, steel, 0.85);
        g.beginPath(); g.moveTo(39, 9); g.lineTo(34, 15); g.lineTo(44, 15); g.closePath(); g.strokePath();
        g.fillStyle(steel, 0.4);
        g.fillCircle(39, 12, 2);
        drawEyes(35, 21, 43, 21, 0xd8e8ff);
        drawMouth(39, 27);
        g.fillStyle(dark, 0.96);
        g.fillRoundedRect(2, 30, 14, 38, 4);
        g.lineStyle(2, 0x8ab0d8, 0.92);
        g.strokeRoundedRect(2, 30, 14, 38, 4);
        g.fillStyle(plate, 0.3);
        g.fillRect(4, 34, 10, 2);
        g.lineStyle(4, steel, 0.95);
        g.beginPath(); g.moveTo(12, 38); g.lineTo(4, 68); g.strokePath();
        g.lineStyle(2, 0x7a9cc0, 0.5);
        g.beginPath(); g.moveTo(11, 40); g.lineTo(5, 64); g.strokePath();
        g.fillStyle(character.color, 0.95);
        g.fillTriangle(2, 70, 10, 68, 6, 78);
        g.lineStyle(1, 0xe0eeff, 0.6);
        g.beginPath(); g.moveTo(4, 68); g.lineTo(6, 76); g.strokePath();
        break;
      }
      case "medic": {
        const coat = 0xeef7ff;
        const trim = 0x5ce8a8;
        const scrubs = 0x2c6956;
        g.fillStyle(0x0a1a18, 0.4);
        g.fillEllipse(39, 88, 46, 12);
        g.fillStyle(scrubs, 0.95);
        g.fillRoundedRect(22, 38, 34, 42, 6);
        g.fillStyle(0x1e4a3a, 0.4);
        g.fillRect(37, 46, 3, 28);
        g.fillStyle(coat, 0.97);
        g.fillRoundedRect(12, 30, 54, 34, 6);
        g.lineStyle(1, 0xc0d8e8, 0.7);
        g.strokeRoundedRect(12, 30, 54, 34, 6);
        g.fillStyle(0xd8e8f0, 0.25);
        g.fillRect(14, 30, 50, 4);
        g.fillStyle(0xffffff, 0.95);
        g.fillRoundedRect(8, 36, 10, 38, 3);
        g.fillRoundedRect(60, 36, 10, 38, 3);
        g.fillStyle(0xd8e8f0, 0.45);
        g.fillRect(10, 56, 6, 14);
        g.fillRect(62, 56, 6, 14);
        g.fillStyle(skin, 0.7);
        g.fillRect(10, 70, 6, 6);
        g.fillRect(62, 70, 6, 6);
        g.fillStyle(scrubs, 0.88);
        g.fillRoundedRect(26, 62, 12, 18, 3);
        g.fillRoundedRect(40, 62, 12, 18, 3);
        g.fillStyle(0x1e4a3a, 0.35);
        g.fillRect(28, 76, 8, 3);
        g.fillRect(42, 76, 8, 3);
        g.fillStyle(skin, 1);
        g.fillCircle(39, 20, 12);
        g.fillStyle(0xf0f8ff, 0.97);
        g.fillCircle(39, 8, 4.5);
        g.lineStyle(1, 0xd0e8f0, 0.6);
        g.strokeCircle(39, 8, 4.5);
        g.fillStyle(trim, 0.4);
        g.fillCircle(39, 8, 2);
        g.fillStyle(hairDk, 0.92);
        g.beginPath();
        g.moveTo(28, 16); g.lineTo(33, 10); g.lineTo(39, 8); g.lineTo(45, 10); g.lineTo(50, 16); g.lineTo(48, 19); g.lineTo(30, 19);
        g.closePath(); g.fillPath();
        g.fillStyle(0x2a2030, 0.4);
        g.fillRect(30, 11, 18, 2);
        g.fillStyle(skin, 1);
        g.fillCircle(39, 22, 10);
        drawEyes(35, 21, 43, 21, 0xd8fff0);
        drawMouth(39, 27);
        g.lineStyle(2.5, trim, 0.88);
        g.beginPath();
        g.arc(39, 44, 11, Phaser.Math.DegToRad(150), Phaser.Math.DegToRad(30), false);
        g.strokePath();
        g.fillStyle(trim, 0.96);
        g.fillRect(36, 38, 6, 14);
        g.fillRect(32, 43, 14, 6);
        g.fillStyle(0xffffff, 0.5);
        g.fillRect(38, 40, 2, 10);
        g.fillRect(34, 45, 10, 2);
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(24, 44, 3);
        g.fillCircle(54, 44, 3);
        g.lineStyle(1, trim, 0.5);
        g.strokeCircle(24, 44, 3);
        g.strokeCircle(54, 44, 3);
        g.fillStyle(coat, 0.7);
        g.fillRoundedRect(50, 32, 10, 8, 2);
        g.fillStyle(trim, 0.4);
        g.fillRect(52, 34, 6, 4);
        break;
      }
      case "ranger": {
        const leather = 0x50402c;
        const hood = 0x302820;
        const quiver = 0x5a4430;
        const bow = 0x8a7050;
        g.fillStyle(0x1a150e, 0.42);
        g.fillEllipse(39, 88, 46, 12);
        g.fillStyle(leather, 0.96);
        g.fillRoundedRect(18, 38, 42, 40, 7);
        g.fillStyle(0x604c38, 0.3);
        g.fillRect(20, 38, 38, 4);
        g.fillStyle(0x443422, 0.9);
        g.fillRoundedRect(22, 48, 14, 12, 2);
        g.fillRoundedRect(42, 48, 14, 12, 2);
        g.fillStyle(0x604c38, 0.85);
        g.fillRect(30, 52, 18, 3);
        g.fillStyle(0x7a6040, 0.6);
        g.fillCircle(39, 53, 3);
        g.fillStyle(leather, 0.92);
        g.fillRoundedRect(24, 66, 10, 20, 4);
        g.fillRoundedRect(44, 66, 10, 20, 4);
        g.fillStyle(0x3a2c1c, 0.5);
        g.fillRect(26, 78, 6, 6);
        g.fillRect(46, 78, 6, 6);
        g.fillStyle(hood, 0.98);
        g.beginPath();
        g.moveTo(14, 38); g.lineTo(39, 8); g.lineTo(64, 38); g.lineTo(56, 40); g.lineTo(22, 40);
        g.closePath(); g.fillPath();
        g.fillStyle(0x3a3028, 0.6);
        g.fillTriangle(24, 36, 39, 12, 54, 36);
        g.fillStyle(0x40382e, 0.35);
        g.fillRect(36, 14, 6, 20);
        g.lineStyle(1, 0x4a4030, 0.4);
        g.lineBetween(20, 37, 39, 12);
        g.lineBetween(58, 37, 39, 12);
        g.fillStyle(skin, 0.97);
        g.fillCircle(39, 30, 10.5);
        drawEyes(35, 29, 43, 29, 0xfef7d0);
        drawMouth(39, 35);
        g.fillStyle(quiver, 0.95);
        g.fillRoundedRect(56, 38, 12, 32, 3);
        g.lineStyle(1, 0x7a6240, 0.7);
        g.strokeRoundedRect(56, 38, 12, 32, 3);
        g.fillStyle(0x6a5438, 0.4);
        g.fillRect(58, 44, 8, 2);
        g.fillRect(58, 52, 8, 2);
        g.fillRect(58, 60, 8, 2);
        g.fillStyle(0xd0ab4a, 0.9);
        g.fillTriangle(60, 36, 64, 30, 66, 38);
        g.fillTriangle(62, 36, 68, 28, 70, 38);
        g.fillStyle(0xe8c050, 0.6);
        g.fillTriangle(58, 36, 62, 32, 64, 38);
        g.lineStyle(2.5, bow, 0.92);
        g.beginPath();
        g.moveTo(10, 26); g.lineTo(6, 38); g.lineTo(8, 52); g.lineTo(10, 60);
        g.strokePath();
        g.lineStyle(1.5, 0xa08860, 0.5);
        g.beginPath(); g.moveTo(8, 30); g.lineTo(6, 42); g.lineTo(8, 54); g.strokePath();
        g.lineStyle(1, 0xc0a878, 0.7);
        g.lineBetween(10, 28, 10, 58);
        g.fillStyle(character.color, 0.8);
        g.fillTriangle(50, 12, 54, 6, 56, 14);
        g.fillStyle(character.color, 0.4);
        g.fillTriangle(48, 14, 52, 8, 54, 16);
        break;
      }
      case "guardian": {
        const plate = 0x5f3540;
        const plateHi = 0x7a4452;
        const shield = 0xc8d4e8;
        const shieldRim = 0xa0b4d0;
        g.fillStyle(0x1a1014, 0.48);
        g.fillEllipse(39, 88, 48, 13);
        g.fillStyle(plate, 0.97);
        g.fillRoundedRect(18, 32, 42, 48, 8);
        g.fillStyle(0x4a2530, 0.4);
        g.fillRect(36, 38, 5, 36);
        g.fillStyle(0x3d2028, 0.95);
        g.fillRoundedRect(14, 28, 50, 20, 5);
        g.fillStyle(plateHi, 0.55);
        g.fillRect(16, 32, 46, 3);
        g.fillStyle(0x8a5060, 0.25);
        g.fillRect(16, 28, 46, 3);
        g.fillStyle(plate, 0.92);
        g.fillRoundedRect(20, 52, 14, 12, 2);
        g.fillRoundedRect(44, 52, 14, 12, 2);
        g.fillStyle(plateHi, 0.3);
        g.fillRect(22, 55, 10, 2);
        g.fillRect(46, 55, 10, 2);
        g.fillStyle(0x6a3540, 0.75);
        g.fillRect(22, 62, 34, 4);
        g.fillStyle(plateHi, 0.5);
        g.fillCircle(39, 64, 3);
        g.fillStyle(0x4a2830, 1);
        g.fillRoundedRect(22, 68, 12, 20, 5);
        g.fillRoundedRect(44, 68, 12, 20, 5);
        g.fillStyle(plate, 0.4);
        g.fillRect(24, 72, 8, 3);
        g.fillRect(46, 72, 8, 3);
        g.fillStyle(skin, 1);
        g.fillCircle(39, 20, 12);
        g.fillStyle(0x7f2630, 1);
        g.beginPath();
        g.moveTo(34, 6); g.lineTo(39, 2); g.lineTo(44, 6); g.lineTo(50, 10); g.lineTo(28, 10);
        g.closePath(); g.fillPath();
        g.fillStyle(0x9a3040, 0.5);
        g.fillTriangle(39, 3, 36, 8, 42, 8);
        g.fillStyle(0x5a2028, 0.9);
        g.fillRoundedRect(28, 10, 22, 8, 3);
        g.fillStyle(0x4a1820, 0.4);
        g.fillRect(30, 14, 18, 2);
        drawEyes(35, 20, 43, 20, 0xffd8d8);
        drawMouth(39, 26);
        g.fillStyle(shield, 0.96);
        g.beginPath();
        g.moveTo(12, 38); g.lineTo(2, 42); g.lineTo(2, 66); g.lineTo(10, 72); g.lineTo(18, 66); g.lineTo(18, 42);
        g.closePath(); g.fillPath();
        g.lineStyle(3, shieldRim, 0.95);
        g.beginPath();
        g.moveTo(12, 38); g.lineTo(2, 42); g.lineTo(2, 66); g.lineTo(10, 72); g.lineTo(18, 66); g.lineTo(18, 42);
        g.closePath(); g.strokePath();
        g.fillStyle(0xe0e8f0, 0.3);
        g.fillRect(4, 42, 12, 4);
        g.fillStyle(character.color, 0.96);
        g.fillRect(6, 50, 12, 3);
        g.fillRect(10, 46, 4, 12);
        g.lineStyle(1, 0xffe0e0, 0.6);
        g.lineBetween(10, 48, 10, 56);
        g.fillStyle(shieldRim, 0.3);
        g.fillCircle(10, 52, 2);
        g.fillStyle(0x4a2028, 0.96);
        g.fillRoundedRect(60, 34, 14, 34, 4);
        g.lineStyle(1, plateHi, 0.65);
        g.strokeRoundedRect(60, 34, 14, 34, 4);
        g.fillStyle(plate, 0.4);
        g.fillRect(62, 40, 10, 2);
        g.fillRect(62, 52, 10, 2);
        break;
      }
      case "striker": {
        const suit = 0x2a1838;
        const glow = character.color || 0xc288ff;
        const band = 0x4a2860;
        g.fillStyle(0x15101e, 0.48);
        g.fillEllipse(39, 88, 46, 12);
        g.fillStyle(suit, 0.98);
        g.fillRoundedRect(20, 34, 38, 46, 6);
        g.fillStyle(0x1e1028, 0.5);
        g.fillRect(36, 40, 5, 32);
        g.fillStyle(band, 0.65);
        g.fillRoundedRect(22, 36, 34, 14, 3);
        g.fillStyle(glow, 0.28);
        g.fillRect(26, 38, 26, 4);
        g.fillStyle(glow, 0.12);
        g.fillRect(28, 44, 22, 2);
        g.fillStyle(suit, 0.96);
        g.fillRoundedRect(24, 52, 12, 12, 2);
        g.fillRoundedRect(42, 52, 12, 12, 2);
        g.fillStyle(band, 0.35);
        g.fillRect(26, 56, 8, 2);
        g.fillRect(44, 56, 8, 2);
        g.fillStyle(0x3a2048, 0.75);
        g.fillRect(26, 64, 26, 3);
        g.fillStyle(glow, 0.2);
        g.fillCircle(39, 65, 2.5);
        g.fillStyle(0x1e1228, 1);
        g.fillRoundedRect(26, 68, 10, 20, 4);
        g.fillRoundedRect(42, 68, 10, 20, 4);
        g.fillStyle(0x2a1838, 0.5);
        g.fillRect(28, 80, 6, 5);
        g.fillRect(44, 80, 6, 5);
        g.fillStyle(suit, 1);
        g.fillCircle(39, 22, 13);
        g.fillStyle(0x1a1020, 1);
        g.beginPath();
        g.moveTo(27, 18); g.lineTo(39, 8); g.lineTo(51, 18); g.lineTo(49, 26); g.lineTo(29, 26);
        g.closePath(); g.fillPath();
        g.fillStyle(skin, 1);
        g.fillCircle(39, 22, 10);
        drawEyes(35, 21, 43, 21, 0xf0deff);
        drawMouth(39, 27);
        g.fillStyle(0x2a1838, 0.7);
        g.fillRect(30, 26, 18, 3);
        g.fillStyle(glow, 0.15);
        g.fillRect(34, 26, 10, 2);
        g.fillStyle(0xffb0ff, 0.92);
        g.fillRoundedRect(4, 36, 10, 32, 3);
        g.fillRoundedRect(64, 36, 10, 32, 3);
        g.fillStyle(glow, 0.4);
        g.fillRect(6, 42, 6, 2);
        g.fillRect(66, 42, 6, 2);
        g.fillRect(6, 56, 6, 2);
        g.fillRect(66, 56, 6, 2);
        g.fillStyle(glow, 0.78);
        g.beginPath(); g.moveTo(4, 38); g.lineTo(0, 30); g.lineTo(10, 34); g.closePath(); g.fillPath();
        g.beginPath(); g.moveTo(74, 38); g.lineTo(78, 30); g.lineTo(68, 34); g.closePath(); g.fillPath();
        g.lineStyle(2, glow, 0.92);
        g.beginPath(); g.moveTo(0, 30); g.lineTo(4, 46); g.strokePath();
        g.beginPath(); g.moveTo(78, 30); g.lineTo(74, 46); g.strokePath();
        g.lineStyle(1, 0xffffff, 0.35);
        g.beginPath(); g.moveTo(2, 32); g.lineTo(5, 42); g.strokePath();
        g.beginPath(); g.moveTo(76, 32); g.lineTo(73, 42); g.strokePath();
        g.lineStyle(2, glow, 0.88);
        g.beginPath(); g.moveTo(39, 10); g.lineTo(33, 18); g.lineTo(45, 18); g.closePath(); g.strokePath();
        g.fillStyle(glow, 0.3);
        g.fillCircle(39, 14, 2);
        break;
      }
      case "summoner": {
        const robe = 0x081620;
        const robeMid = 0x0e2030;
        const trim = character.color || 0x58d8e8;
        const trimHi = 0xb0f0ff;
        const soulGlow = 0x40c8d8;

        // Shadow
        g.fillStyle(0x041018, 0.45);
        g.fillEllipse(39, 90, 52, 14);

        // Ghostly tendrils from hem
        g.lineStyle(1.5, trim, 0.15);
        g.beginPath(); g.moveTo(20, 80); graphicsQuadBezier(g, 20, 80, 14, 92, 8, 96); g.strokePath();
        g.beginPath(); g.moveTo(30, 82); graphicsQuadBezier(g, 30, 82, 26, 94, 22, 100); g.strokePath();
        g.beginPath(); g.moveTo(48, 82); graphicsQuadBezier(g, 48, 82, 52, 94, 56, 100); g.strokePath();
        g.beginPath(); g.moveTo(58, 80); graphicsQuadBezier(g, 58, 80, 64, 92, 70, 96); g.strokePath();
        g.fillStyle(trim, 0.06);
        g.fillCircle(8, 96, 3);
        g.fillCircle(70, 96, 3);

        // Robe body — wide & tattered
        g.fillStyle(robe, 0.97);
        g.beginPath();
        g.moveTo(14, 34); g.lineTo(12, 82); g.lineTo(22, 86); g.lineTo(34, 84);
        g.lineTo(39, 86); g.lineTo(44, 84); g.lineTo(56, 86); g.lineTo(66, 82);
        g.lineTo(64, 34);
        g.closePath(); g.fillPath();

        // Robe folds & seams
        g.fillStyle(robeMid, 0.35);
        g.fillRect(36, 38, 5, 40);
        g.fillStyle(0x0a1828, 0.3);
        g.fillRect(24, 54, 30, 2);
        g.fillRect(26, 66, 26, 2);

        // Rune trim on robe
        g.lineStyle(1, trim, 0.2);
        g.lineBetween(18, 36, 18, 78);
        g.lineBetween(60, 36, 60, 78);
        g.fillStyle(trim, 0.18);
        g.fillCircle(18, 46, 2);
        g.fillCircle(60, 46, 2);
        g.fillCircle(18, 62, 2);
        g.fillCircle(60, 62, 2);

        // Shoulders / mantle
        g.fillStyle(robeMid, 0.96);
        g.beginPath();
        g.moveTo(8, 36); g.lineTo(14, 28); g.lineTo(64, 28); g.lineTo(70, 36);
        g.lineTo(66, 46); g.lineTo(12, 46);
        g.closePath(); g.fillPath();
        g.fillStyle(trim, 0.12);
        g.fillRect(16, 32, 46, 3);
        g.lineStyle(1, trim, 0.25);
        g.strokeRoundedRect(10, 28, 58, 18, 4);

        // Chain of bound souls across chest
        g.lineStyle(1, trim, 0.35);
        g.lineBetween(20, 38, 58, 38);
        for (let cx = 24; cx <= 54; cx += 10) {
          g.fillStyle(soulGlow, 0.5);
          g.fillCircle(cx, 38, 2.5);
          g.fillStyle(0xffffff, 0.3);
          g.fillCircle(cx, 37, 1);
        }

        // Head
        g.fillStyle(skin, 1);
        g.fillCircle(39, 20, 12);

        // Hood — deep cowl
        g.fillStyle(0x061018, 0.97);
        g.beginPath();
        g.moveTo(24, 22); g.lineTo(30, 4); g.lineTo(39, 0); g.lineTo(48, 4); g.lineTo(54, 22);
        g.lineTo(50, 28); g.lineTo(28, 28);
        g.closePath(); g.fillPath();
        g.fillStyle(robeMid, 0.5);
        g.fillTriangle(30, 20, 39, 4, 48, 20);
        g.lineStyle(1, trim, 0.3);
        g.beginPath(); g.moveTo(28, 24); g.lineTo(39, 2); g.lineTo(50, 24); g.strokePath();

        // Glowing eyes under hood
        g.fillStyle(trimHi, 0.95);
        g.fillEllipse(34, 21, 5, 3.5);
        g.fillEllipse(44, 21, 5, 3.5);
        g.fillStyle(0xffffff, 0.7);
        g.fillCircle(35, 20, 1.2);
        g.fillCircle(45, 20, 1.2);
        g.fillStyle(0x0a2030, 0.6);
        g.fillCircle(33, 21, 1);
        g.fillCircle(43, 21, 1);

        // Legs (dark, almost hidden)
        g.fillStyle(0x06121c, 0.96);
        g.fillRoundedRect(26, 72, 10, 18, 4);
        g.fillRoundedRect(42, 72, 10, 18, 4);
        g.fillStyle(trim, 0.1);
        g.fillRect(28, 78, 6, 2);
        g.fillRect(44, 78, 6, 2);

        // Spirit orbs (floating at hands)
        g.fillStyle(soulGlow, 0.55);
        g.fillCircle(4, 42, 6);
        g.fillCircle(74, 42, 6);
        g.fillStyle(trimHi, 0.35);
        g.fillCircle(3, 40, 3);
        g.fillCircle(73, 40, 3);
        g.lineStyle(1, trim, 0.5);
        g.strokeCircle(4, 42, 6);
        g.strokeCircle(74, 42, 6);
        g.fillStyle(0xffffff, 0.55);
        g.fillCircle(2, 40, 1.5);
        g.fillCircle(72, 40, 1.5);

        // Spirit tethers from hands to orbs
        g.lineStyle(1, trim, 0.22);
        g.lineBetween(12, 40, 4, 42);
        g.lineBetween(66, 40, 74, 42);

        // Soul crown orb above hood
        g.fillStyle(soulGlow, 0.45);
        g.fillCircle(39, -6, 5);
        g.fillStyle(trimHi, 0.65);
        g.fillCircle(39, -7, 2.5);
        g.fillStyle(0xffffff, 0.5);
        g.fillCircle(38, -8, 1);
        g.lineStyle(1, trim, 0.4);
        g.strokeCircle(39, -6, 5);
        g.lineStyle(1, trim, 0.2);
        g.lineBetween(39, -1, 39, 4);

        break;
      }
      default:
        g.fillStyle(character.color || 0xffffff, 1);
        g.fillRoundedRect(18, 30, 42, 48, 8);
        g.fillStyle(skin, 1);
        g.fillCircle(39, 20, 12);
        drawEyes(35, 20, 43, 20, 0xf4f8ff);
        break;
    }

    g.generateTexture(key, w, h);
    g.destroy();
  }

  /** Unique bolt / arrow art for ranged basics & abilities. */
  createPlayerProjectileTextures() {
    if (!this.textures.exists("proj_medic")) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      const r = 10;
      g.fillStyle(0x7dffb6, 0.35);
      g.fillCircle(r, r, r);
      g.lineStyle(2, 0xb8ffe0, 0.75);
      g.strokeCircle(r, r, r - 2);
      g.fillStyle(0xffffff, 0.95);
      g.fillRect(r - 2, 4, 4, 12);
      g.fillRect(4, r - 2, 12, 4);
      g.fillStyle(0x4fd98f, 0.9);
      g.fillCircle(r, r, 4);
      g.generateTexture("proj_medic", 20, 20);
      g.destroy();
    }
    if (!this.textures.exists("proj_ranger")) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x5a4030, 1);
      g.fillRoundedRect(4, 5, 16, 4, 1);
      g.fillStyle(0xc0c8d8, 1);
      g.beginPath();
      g.moveTo(20, 7);
      g.lineTo(28, 7);
      g.lineTo(24, 3);
      g.lineTo(20, 5);
      g.closePath();
      g.fillPath();
      g.fillStyle(0xf7d95c, 0.95);
      g.fillRect(2, 4, 3, 6);
      g.fillRect(2, 11, 3, 6);
      g.fillStyle(0xe85a4a, 0.9);
      g.fillTriangle(28, 7, 32, 5, 32, 9);
      g.generateTexture("proj_ranger", 34, 18);
      g.destroy();
    }
    if (!this.textures.exists("proj_summoner")) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      const C = 0x58d8e8;
      const Cdeep = 0x2a6d7c;
      const Chi = 0xc8f8ff;
      const Cmist = 0x6ec8dc;
      const w = 38;
      const h = 24;
      const cy = h / 2;

      // Trailing wisps (rear of flight)
      g.fillStyle(Cmist, 0.2);
      g.fillCircle(4, cy + 1, 5);
      g.fillStyle(C, 0.16);
      g.fillCircle(2, cy + 2, 3);
      g.fillCircle(6, cy + 3, 2.5);
      g.fillStyle(Chi, 0.14);
      g.fillEllipse(8, cy, 9, 7);

      // Outer veil
      g.fillStyle(Cmist, 0.32);
      g.fillEllipse(20, cy, 24, 15);

      // Hood / mantle (ghost silhouette)
      g.fillStyle(Cdeep, 0.5);
      g.fillEllipse(21, cy - 1, 16, 14);
      g.fillStyle(C, 0.62);
      g.fillEllipse(22, cy, 13, 12);
      g.fillStyle(Chi, 0.35);
      g.fillEllipse(22, cy - 4, 11, 8);

      // Inner luminous core
      g.fillStyle(Chi, 0.45);
      g.fillEllipse(24, cy, 8, 9);

      // Wisp “eyes” — bright spectral sockets
      g.fillStyle(0xffffff, 0.88);
      g.fillEllipse(26, cy - 2.5, 3.2, 4);
      g.fillEllipse(26, cy + 2.5, 3.2, 4);
      g.fillStyle(Cdeep, 0.85);
      g.fillCircle(26, cy - 2.5, 1.3);
      g.fillCircle(26, cy + 2.5, 1.3);

      // Leading pulse (direction of travel)
      g.fillStyle(0xffffff, 0.5);
      g.fillCircle(33, cy, 2.2);
      g.fillStyle(Chi, 0.35);
      g.fillCircle(34, cy - 1, 1);

      // Soft outer ring
      g.lineStyle(1, Chi, 0.4);
      g.strokeEllipse(22, cy, 17, 14);

      g.generateTexture("proj_summoner", w, h);
      g.destroy();
    }
    if (!this.textures.exists("proj_summoner_charged")) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      const C = 0x58d8e8;
      const Cdeep = 0x1e4a58;
      const Chi = 0xe0ffff;
      const Cviolet = 0x8898ff;
      const Cmist = 0x5ab8d0;
      const w = 52;
      const h = 32;
      const cy = h / 2;

      // Broad aura
      g.fillStyle(Cmist, 0.18);
      g.fillEllipse(26, cy, 44, 26);
      g.lineStyle(1, Cviolet, 0.22);
      g.strokeEllipse(26, cy, 40, 24);

      // Rear tendrils
      for (let i = 0; i < 5; i++) {
        const ty = cy + (i - 2) * 3.5;
        g.fillStyle(C, 0.12 + i * 0.04);
        g.fillCircle(4 + i * 0.8, ty, 4 - i * 0.35);
      }
      g.fillStyle(Chi, 0.2);
      g.fillEllipse(12, cy, 14, 12);

      // Twin orbiting motes (static pose — reads as bound spirits)
      g.fillStyle(Chi, 0.55);
      g.fillCircle(18, cy - 9, 3);
      g.fillCircle(18, cy + 9, 3);
      g.fillStyle(Cdeep, 0.5);
      g.fillCircle(18, cy - 9, 1.5);
      g.fillCircle(18, cy + 9, 1.5);

      // Main mass
      g.fillStyle(Cdeep, 0.55);
      g.fillEllipse(28, cy, 22, 18);
      g.fillStyle(C, 0.72);
      g.fillEllipse(29, cy, 17, 15);
      g.fillStyle(Chi, 0.38);
      g.fillEllipse(29, cy - 5, 14, 10);

      // Bright heart
      g.fillStyle(0xffffff, 0.35);
      g.fillEllipse(31, cy, 10, 11);

      // Larger spirit face
      g.fillStyle(0xffffff, 0.92);
      g.fillEllipse(33, cy - 3.5, 4, 5.5);
      g.fillEllipse(33, cy + 3.5, 4, 5.5);
      g.fillStyle(0x2a1810, 0.88);
      g.fillCircle(33, cy - 3.5, 1.6);
      g.fillCircle(33, cy + 3.5, 1.6);
      g.lineStyle(1, Chi, 0.5);
      g.strokeEllipse(33, cy - 3.5, 4, 5.5);
      g.strokeEllipse(33, cy + 3.5, 4, 5.5);

      // Forward crown flare
      g.fillStyle(Chi, 0.55);
      g.fillCircle(44, cy, 3.5);
      g.fillStyle(0xffffff, 0.65);
      g.fillCircle(46, cy, 2);

      g.lineStyle(1.5, Chi, 0.45);
      g.strokeEllipse(29, cy, 21, 17);

      g.generateTexture("proj_summoner_charged", w, h);
      g.destroy();
    }
    if (!this.textures.exists("proj_soulcaller_wisp")) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      const C = 0x58d8e8;
      const Chi = 0xc8f8ff;
      const Cdeep = 0x1a4858;
      const w = 22;
      const h = 16;
      const cy = h / 2;
      // Trailing mist
      g.fillStyle(C, 0.1);
      g.fillCircle(3, cy, 4);
      g.fillStyle(C, 0.16);
      g.fillCircle(5, cy + 1, 3);
      g.fillStyle(C, 0.22);
      g.fillEllipse(8, cy, 8, 6);
      // Core orb
      g.fillStyle(Cdeep, 0.45);
      g.fillEllipse(13, cy, 12, 11);
      g.fillStyle(C, 0.55);
      g.fillEllipse(13, cy, 10, 9);
      g.fillStyle(Chi, 0.3);
      g.fillEllipse(14, cy - 2, 7, 5);
      // Inner spark
      g.fillStyle(0xffffff, 0.55);
      g.fillCircle(15, cy - 1, 2);
      g.fillStyle(0xffffff, 0.3);
      g.fillCircle(12, cy + 1, 1);
      // Front glow
      g.fillStyle(Chi, 0.45);
      g.fillCircle(19, cy, 2);
      // Rim
      g.lineStyle(1, Chi, 0.3);
      g.strokeEllipse(13, cy, 12, 11);
      g.generateTexture("proj_soulcaller_wisp", w, h);
      g.destroy();
    }
    if (!this.textures.exists("proj_soulcaller_turret")) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      const C = 0x58d8e8;
      const dark = 0x0e2838;
      const hi = 0xb8f0ff;
      const w = 28;
      const h = 14;
      const cy = h / 2;
      g.fillStyle(dark, 0.92);
      g.fillRoundedRect(2, cy - 4, 18, 8, 2);
      g.fillStyle(C, 0.65);
      g.fillRoundedRect(4, cy - 3, 14, 6, 1);
      g.lineStyle(1, hi, 0.45);
      g.strokeRoundedRect(3, cy - 3.5, 16, 7, 2);
      g.fillStyle(hi, 0.85);
      g.beginPath(); g.moveTo(20, cy - 3); g.lineTo(26, cy); g.lineTo(20, cy + 3); g.closePath(); g.fillPath();
      g.fillStyle(0xffffff, 0.55);
      g.fillCircle(24, cy, 1.5);
      g.fillStyle(C, 0.3);
      g.fillCircle(8, cy, 2);
      g.generateTexture("proj_soulcaller_turret", w, h);
      g.destroy();
    }
    if (!this.textures.exists("proj_charge_pulse")) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      const cx = 32;
      const cy = 32;
      g.fillStyle(0xffffff, 0.45);
      g.fillCircle(cx, cy, 28);
      g.fillStyle(0xffffff, 0.65);
      g.fillCircle(cx, cy, 20);
      g.fillStyle(0xffffff, 0.88);
      g.fillCircle(cx, cy, 12);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(cx, cy, 6);
      g.lineStyle(3, 0xffffff, 0.85);
      g.strokeCircle(cx, cy, 26);
      g.lineStyle(2, 0xfff8e0, 0.75);
      g.strokeCircle(cx, cy, 17);
      g.generateTexture("proj_charge_pulse", 64, 64);
      g.destroy();
    }
  }

  createBossTexture(key, boss) {
    if (this.textures.exists(key)) return;
    const w = 78;
    const h = 96;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const col = boss.color || 0xffffff;

    const drawEyes = (x1, y1, x2, y2, r = 3) => {
      g.fillStyle(0x0a0c10, 1);
      g.fillCircle(x1, y1, r + 0.5);
      g.fillCircle(x2, y2, r + 0.5);
      g.fillStyle(0xe8f0ff, 0.95);
      g.fillCircle(x1 - 0.5, y1 - 0.5, r * 0.45);
      g.fillCircle(x2 - 0.5, y2 - 0.5, r * 0.45);
    };

    switch (boss.id) {
      case "galeSovereign": {
        const mint = 0x5ee0c8;
        const deep = 0x0c2228;
        const robe = 0xf2fffc;
        const robeSh = 0xb8e8e0;
        const gold = 0xe8f8a8;
        const cape = 0x7df0d8;
        const sash = 0x3aa898;
        // ground shadow
        g.fillStyle(deep, 0.7);
        g.fillEllipse(39, 84, 52, 14);
        // cape behind body
        g.fillStyle(cape, 0.35);
        g.beginPath();
        g.moveTo(14, 36); g.lineTo(64, 36);
        g.lineTo(60, 80); g.lineTo(18, 80);
        g.closePath(); g.fillPath();
        g.fillStyle(cape, 0.2);
        g.fillTriangle(18, 80, 24, 70, 10, 88);
        g.fillTriangle(60, 80, 54, 70, 68, 88);
        // main robe body
        g.fillStyle(robe, 1);
        g.beginPath();
        g.moveTo(20, 32); g.lineTo(58, 32);
        g.lineTo(54, 78); g.lineTo(24, 78);
        g.closePath(); g.fillPath();
        // robe fold shadow
        g.fillStyle(robeSh, 0.5);
        g.beginPath();
        g.moveTo(32, 42); g.lineTo(39, 74); g.lineTo(46, 42);
        g.closePath(); g.fillPath();
        g.fillStyle(robeSh, 0.35);
        g.fillRect(26, 50, 4, 24);
        g.fillRect(48, 50, 4, 24);
        // sash / belt
        g.fillStyle(sash, 0.9);
        g.fillRoundedRect(22, 44, 34, 6, 2);
        g.fillStyle(gold, 0.85);
        g.fillCircle(39, 47, 3);
        // shoulder pads
        g.fillStyle(deep, 0.92);
        g.fillRoundedRect(12, 30, 16, 10, 4);
        g.fillRoundedRect(50, 30, 16, 10, 4);
        g.lineStyle(1, mint, 0.65);
        g.strokeRoundedRect(12, 30, 16, 10, 4);
        g.strokeRoundedRect(50, 30, 16, 10, 4);
        // arms / sleeves
        g.fillStyle(robe, 0.9);
        g.fillRoundedRect(8, 38, 12, 28, 4);
        g.fillRoundedRect(58, 38, 12, 28, 4);
        g.fillStyle(robeSh, 0.4);
        g.fillRect(10, 50, 8, 3);
        g.fillRect(60, 50, 8, 3);
        // legs
        g.fillStyle(deep, 0.95);
        g.fillRoundedRect(26, 70, 10, 14, 4);
        g.fillRoundedRect(42, 70, 10, 14, 4);
        // staff in left hand
        g.lineStyle(3, 0x5a7868, 0.95);
        g.beginPath(); g.moveTo(8, 40); g.lineTo(4, 86); g.strokePath();
        g.fillStyle(mint, 0.92);
        g.fillCircle(8, 36, 5);
        g.fillStyle(0xeefffa, 0.75);
        g.fillCircle(8, 36, 2.5);
        g.lineStyle(1.5, gold, 0.7);
        g.strokeCircle(8, 36, 5);
        // hood
        g.fillStyle(deep, 1);
        g.beginPath();
        g.moveTo(24, 24);
        graphicsQuadBezier(g, 24, 24, 39, 4, 54, 24);
        g.lineTo(50, 32); g.lineTo(28, 32);
        g.closePath(); g.fillPath();
        g.fillStyle(0x1a3838, 0.6);
        g.fillTriangle(30, 28, 39, 10, 48, 28);
        // crown
        g.fillStyle(gold, 0.92);
        g.beginPath();
        g.moveTo(30, 10); g.lineTo(33, 4); g.lineTo(36, 8);
        g.lineTo(39, 2); g.lineTo(42, 8);
        g.lineTo(45, 4); g.lineTo(48, 10);
        g.lineTo(46, 14); g.lineTo(32, 14);
        g.closePath(); g.fillPath();
        g.lineStyle(1, 0xffffff, 0.5);
        g.strokePath();
        // face
        drawEyes(34, 20, 44, 20, 2.4);
        g.lineStyle(1, 0x3a5a58, 0.6);
        g.beginPath(); g.moveTo(36, 25); g.lineTo(42, 25); g.strokePath();
        // wind wisps
        g.lineStyle(1.5, mint, 0.4);
        g.beginPath(); g.moveTo(66, 42); g.lineTo(76, 38); g.strokePath();
        g.beginPath(); g.moveTo(68, 52); g.lineTo(76, 50); g.strokePath();
        g.beginPath(); g.moveTo(2, 48); g.lineTo(10, 44); g.strokePath();
        break;
      }
      case "wraith": {
        const voidBg = 0x0e0a18;
        const robe = 0x2a2048;
        const robeHi = 0x4a3888;
        const mist = 0x7a58b8;
        const trim = 0xd8c8ff;
        const blade = 0xa8b8e8;
        const wisp = 0x6af0ff;
        // shadow pool
        g.fillStyle(voidBg, 0.65);
        g.fillEllipse(39, 84, 54, 16);
        g.fillStyle(mist, 0.12);
        g.fillEllipse(39, 84, 40, 10);
        // tattered robe body
        g.fillStyle(robe, 1);
        g.beginPath();
        g.moveTo(18, 28);
        graphicsQuadBezier(g, 18, 28, 12, 52, 10, 80);
        g.lineTo(14, 86); g.lineTo(26, 82);
        g.lineTo(30, 86); g.lineTo(39, 80);
        g.lineTo(48, 86); g.lineTo(52, 82);
        g.lineTo(64, 86); g.lineTo(68, 80);
        graphicsQuadBezier(g, 68, 80, 66, 52, 60, 28);
        g.lineTo(52, 20); g.lineTo(26, 20);
        g.closePath(); g.fillPath();
        // robe highlight panel
        g.fillStyle(robeHi, 0.85);
        g.beginPath();
        g.moveTo(26, 32); g.lineTo(52, 32);
        g.lineTo(48, 68); g.lineTo(30, 68);
        g.closePath(); g.fillPath();
        // center fold shadow
        g.fillStyle(robe, 0.7);
        g.fillRect(37, 34, 4, 36);
        // collar trim
        g.lineStyle(2, trim, 0.5);
        g.beginPath();
        g.moveTo(24, 28); g.lineTo(39, 34); g.lineTo(54, 28);
        g.strokePath();
        // deep hood
        g.fillStyle(voidBg, 1);
        g.beginPath();
        g.moveTo(20, 18);
        graphicsQuadBezier(g, 20, 18, 39, 0, 58, 18);
        g.lineTo(54, 28); g.lineTo(24, 28);
        g.closePath(); g.fillPath();
        // hood inner shadow
        g.fillStyle(0x060410, 0.8);
        g.fillTriangle(28, 24, 39, 6, 50, 24);
        // ghostly face glow
        g.fillStyle(mist, 0.2);
        g.fillEllipse(39, 14, 26, 14);
        // eyes
        g.fillStyle(trim, 0.8);
        g.fillCircle(33, 12, 3.4);
        g.fillCircle(45, 12, 3.4);
        g.fillStyle(wisp, 0.96);
        g.fillCircle(33, 12, 1.8);
        g.fillCircle(45, 12, 1.8);
        g.fillStyle(0xffffff, 0.8);
        g.fillCircle(32.4, 11.4, 0.7);
        g.fillCircle(44.4, 11.4, 0.7);
        // eye trails
        g.lineStyle(1.5, wisp, 0.35);
        g.beginPath(); g.moveTo(30, 12); g.lineTo(24, 16); g.strokePath();
        g.beginPath(); g.moveTo(48, 12); g.lineTo(54, 16); g.strokePath();
        // skeletal arms
        g.lineStyle(2.5, mist, 0.6);
        g.beginPath(); g.moveTo(20, 36); g.lineTo(8, 64); g.strokePath();
        g.beginPath(); g.moveTo(58, 36); g.lineTo(70, 64); g.strokePath();
        // claw hands
        g.fillStyle(trim, 0.55);
        g.fillTriangle(6, 62, 2, 72, 10, 70);
        g.fillTriangle(4, 64, 0, 68, 8, 66);
        g.fillTriangle(72, 62, 76, 72, 68, 70);
        g.fillTriangle(74, 64, 78, 68, 70, 66);
        // void blade (left)
        g.fillStyle(blade, 0.5);
        g.beginPath();
        g.moveTo(6, 60); g.lineTo(2, 90); g.lineTo(8, 88);
        g.lineTo(14, 76); g.closePath(); g.fillPath();
        g.lineStyle(2, blade, 0.7);
        g.beginPath(); g.moveTo(4, 62); g.lineTo(2, 88); g.strokePath();
        g.fillStyle(wisp, 0.3);
        g.fillTriangle(3, 86, 6, 82, 5, 92);
        // chest rune
        g.lineStyle(1.5, trim, 0.4);
        g.beginPath();
        g.arc(39, 44, 10, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(-20), false);
        g.strokePath();
        g.fillStyle(mist, 0.22);
        g.fillCircle(39, 44, 6);
        // floating wisps
        g.fillStyle(mist, 0.18);
        g.fillCircle(16, 80, 4);
        g.fillCircle(62, 78, 3);
        g.fillCircle(22, 88, 2.5);
        break;
      }
      case "pyromancer": {
        const ember = col;
        const ash = 0x1a0c0a;
        const robe = 0x3a1810;
        const fold = 0x5a2820;
        const coal = 0x2a1008;
        const flameTip = 0xffaa44;
        const flameHi = 0xfff0c0;
        // ground shadow with ember glow
        g.fillStyle(ash, 0.85);
        g.fillEllipse(39, 84, 50, 14);
        g.fillStyle(ember, 0.15);
        g.fillEllipse(39, 84, 36, 8);
        // main robe
        g.fillStyle(robe, 1);
        g.fillRoundedRect(14, 34, 50, 46, 10);
        // robe fold
        g.fillStyle(fold, 0.88);
        g.beginPath();
        g.moveTo(22, 36); g.lineTo(39, 72); g.lineTo(56, 36);
        g.closePath(); g.fillPath();
        // belt / sash
        g.fillStyle(0x5a3020, 0.92);
        g.fillRoundedRect(18, 50, 42, 5, 2);
        g.fillStyle(ember, 0.7);
        g.fillCircle(39, 52, 2.5);
        // robe hem detail
        g.fillStyle(coal, 0.6);
        g.fillRect(18, 74, 42, 4);
        g.fillStyle(ember, 0.25);
        g.fillRect(20, 75, 38, 2);
        // legs
        g.fillStyle(coal, 0.95);
        g.fillRoundedRect(24, 72, 10, 14, 4);
        g.fillRoundedRect(44, 72, 10, 14, 4);
        g.fillStyle(0xff4400, 0.25);
        g.fillTriangle(24, 84, 30, 78, 34, 86);
        g.fillTriangle(44, 84, 50, 78, 54, 86);
        // shoulder pads
        g.fillStyle(coal, 0.95);
        g.fillRoundedRect(8, 30, 16, 10, 4);
        g.fillRoundedRect(54, 30, 16, 10, 4);
        g.fillStyle(ember, 0.35);
        g.fillRect(10, 34, 12, 2);
        g.fillRect(56, 34, 12, 2);
        // arms
        g.fillStyle(robe, 0.92);
        g.fillRoundedRect(6, 38, 12, 26, 4);
        g.fillRoundedRect(60, 38, 12, 26, 4);
        // smoldering hands
        g.fillStyle(ember, 0.5);
        g.fillEllipse(12, 66, 8, 6);
        g.fillEllipse(66, 66, 8, 6);
        g.fillStyle(flameTip, 0.55);
        g.fillCircle(12, 64, 3);
        g.fillCircle(66, 64, 3);
        // hood
        g.fillStyle(coal, 1);
        g.beginPath();
        g.moveTo(20, 20);
        graphicsQuadBezier(g, 20, 20, 39, 4, 58, 20);
        g.lineTo(54, 34); g.lineTo(24, 34);
        g.closePath(); g.fillPath();
        // face area
        g.fillStyle(0x3a1410, 1);
        g.fillEllipse(39, 24, 30, 18);
        // ember halo / crown
        g.fillStyle(ember, 0.6);
        g.fillTriangle(30, 8, 33, 0, 36, 6);
        g.fillTriangle(37, 6, 39, -2, 41, 6);
        g.fillTriangle(42, 8, 45, 0, 48, 6);
        g.fillStyle(flameTip, 0.45);
        g.fillTriangle(32, 6, 34, 0, 36, 4);
        g.fillTriangle(42, 6, 44, 0, 46, 4);
        g.fillStyle(flameHi, 0.3);
        g.fillCircle(39, 2, 2);
        // eyes
        g.fillStyle(0x0a0608, 1);
        g.fillCircle(32, 24, 3.4);
        g.fillCircle(46, 24, 3.4);
        g.fillStyle(flameTip, 0.96);
        g.fillCircle(32, 24, 1.8);
        g.fillCircle(46, 24, 1.8);
        g.fillStyle(flameHi, 0.85);
        g.fillCircle(31.6, 23.6, 0.7);
        g.fillCircle(45.6, 23.6, 0.7);
        // mouth glow
        g.fillStyle(ember, 0.3);
        g.fillEllipse(39, 30, 8, 3);
        // chest ember rune
        g.fillStyle(ember, 0.22);
        g.fillEllipse(39, 44, 16, 10);
        g.lineStyle(1.5, ember, 0.45);
        g.beginPath();
        g.arc(39, 44, 9, 0, Math.PI * 2);
        g.strokePath();
        g.fillStyle(flameTip, 0.35);
        g.fillCircle(39, 44, 4);
        // staff in right hand
        g.lineStyle(3, 0x5a3020, 0.95);
        g.beginPath(); g.moveTo(66, 58); g.lineTo(72, 86); g.strokePath();
        g.fillStyle(ember, 0.85);
        g.fillCircle(66, 56, 4);
        g.fillStyle(flameTip, 0.9);
        g.fillCircle(66, 54, 2.5);
        g.fillStyle(flameHi, 0.65);
        g.fillCircle(66, 52, 1.5);
        break;
      }
      case "hollowPair": {
        const twin = boss.twinVisual === true;
        const cx = 39;
        const edge = twin ? 0xc898ff : 0xcf7cff;
        const cloak = twin ? 0x2e2048 : 0x241838;
        const cloakHi = twin ? 0x3e3060 : 0x342048;
        const trim = twin ? 0x6a5090 : 0x5a4080;
        const skin = 0x2a2038;
        const rune = twin ? 0xb080e0 : 0xd080ff;
        // ground shadow
        g.fillStyle(edge, 0.18);
        g.fillEllipse(cx, 88, 50, 10);
        if (twin) {
          // --- Floating Cultist Caster ---
          // spectral wing membranes (behind body)
          g.fillStyle(0x18102a, 0.5);
          g.beginPath();
          g.moveTo(cx - 12, 26); g.lineTo(cx - 38, 16);
          g.lineTo(cx - 36, 32); g.lineTo(cx - 28, 42);
          g.lineTo(cx - 22, 52); g.lineTo(cx - 18, 70);
          g.lineTo(cx - 14, 56);
          g.closePath(); g.fillPath();
          g.beginPath();
          g.moveTo(cx + 12, 26); g.lineTo(cx + 38, 16);
          g.lineTo(cx + 36, 32); g.lineTo(cx + 28, 42);
          g.lineTo(cx + 22, 52); g.lineTo(cx + 18, 70);
          g.lineTo(cx + 14, 56);
          g.closePath(); g.fillPath();
          // wing inner membrane tint
          g.fillStyle(trim, 0.12);
          g.beginPath();
          g.moveTo(cx - 14, 30); g.lineTo(cx - 34, 20);
          g.lineTo(cx - 30, 38); g.lineTo(cx - 20, 48);
          g.closePath(); g.fillPath();
          g.beginPath();
          g.moveTo(cx + 14, 30); g.lineTo(cx + 34, 20);
          g.lineTo(cx + 30, 38); g.lineTo(cx + 20, 48);
          g.closePath(); g.fillPath();
          // wing bone structure
          g.lineStyle(2, trim, 0.5);
          g.beginPath(); g.moveTo(cx - 14, 28); g.lineTo(cx - 36, 18); g.strokePath();
          g.lineStyle(1.5, trim, 0.35);
          g.beginPath(); g.moveTo(cx - 16, 34); g.lineTo(cx - 32, 30); g.strokePath();
          g.beginPath(); g.moveTo(cx - 18, 42); g.lineTo(cx - 26, 44); g.strokePath();
          g.lineStyle(2, trim, 0.5);
          g.beginPath(); g.moveTo(cx + 14, 28); g.lineTo(cx + 36, 18); g.strokePath();
          g.lineStyle(1.5, trim, 0.35);
          g.beginPath(); g.moveTo(cx + 16, 34); g.lineTo(cx + 32, 30); g.strokePath();
          g.beginPath(); g.moveTo(cx + 18, 42); g.lineTo(cx + 26, 44); g.strokePath();
          // wing tip glow
          g.fillStyle(edge, 0.25);
          g.fillCircle(cx - 37, 17, 2.5);
          g.fillCircle(cx + 37, 17, 2.5);
          // main cloak body
          g.fillStyle(cloak, 0.97);
          g.beginPath();
          g.moveTo(cx - 15, 28); g.lineTo(cx, 6);
          g.lineTo(cx + 15, 28); g.lineTo(cx + 13, 72);
          g.lineTo(cx + 5, 78); g.lineTo(cx, 74);
          g.lineTo(cx - 5, 78); g.lineTo(cx - 13, 72);
          g.closePath(); g.fillPath();
          // cloak folds
          g.fillStyle(cloakHi, 0.4);
          g.fillRect(cx - 2, 34, 4, 36);
          g.fillStyle(0x1a1020, 0.3);
          g.fillRect(cx - 10, 54, 8, 2);
          g.fillRect(cx + 2, 56, 8, 2);
          // collar trim V
          g.lineStyle(2, trim, 0.6);
          g.beginPath();
          g.moveTo(cx - 13, 28); g.lineTo(cx, 36); g.lineTo(cx + 13, 28);
          g.strokePath();
          // rune symbols on cloak
          g.lineStyle(1, rune, 0.25);
          g.strokeCircle(cx, 50, 5);
          g.beginPath(); g.moveTo(cx - 3, 48); g.lineTo(cx + 3, 52); g.strokePath();
          g.beginPath(); g.moveTo(cx + 3, 48); g.lineTo(cx - 3, 52); g.strokePath();
          // head
          g.fillStyle(skin, 0.9);
          g.fillEllipse(cx, 20, 17, 15);
          // deep hood
          g.fillStyle(0x08040e, 0.96);
          g.beginPath();
          g.moveTo(cx - 11, 14); g.lineTo(cx, 4);
          g.lineTo(cx + 11, 14); g.lineTo(cx + 9, 26);
          g.lineTo(cx - 9, 26);
          g.closePath(); g.fillPath();
          // hood inner shadow
          g.fillStyle(0x040208, 0.5);
          g.fillTriangle(cx - 7, 20, cx, 8, cx + 7, 20);
          // eyes with glow trail
          g.fillStyle(0xe8d8ff, 0.9);
          g.fillCircle(cx - 4, 18, 2.2);
          g.fillCircle(cx + 4, 18, 2.2);
          g.fillStyle(edge, 0.6);
          g.fillCircle(cx - 4, 18, 1.2);
          g.fillCircle(cx + 4, 18, 1.2);
          g.fillStyle(0xffffff, 0.5);
          g.fillCircle(cx - 4.5, 17.5, 0.6);
          g.fillCircle(cx + 3.5, 17.5, 0.6);
          // eye glow wisps
          g.lineStyle(1, edge, 0.3);
          g.beginPath(); g.moveTo(cx - 6, 18); g.lineTo(cx - 10, 16); g.strokePath();
          g.beginPath(); g.moveTo(cx + 6, 18); g.lineTo(cx + 10, 16); g.strokePath();
          // book (held in front, open)
          g.fillStyle(0x3a2850, 0.97);
          g.fillRoundedRect(cx - 10, 38, 20, 16, 3);
          g.lineStyle(1.5, 0x8a70b0, 0.75);
          g.strokeRoundedRect(cx - 10, 38, 20, 16, 3);
          // book spine
          g.fillStyle(0x140c20, 0.92);
          g.fillRect(cx - 1, 39, 2, 14);
          // book pages
          g.fillStyle(0x4a3868, 0.88);
          g.fillRoundedRect(cx - 8, 40, 7, 12, 1);
          g.fillRoundedRect(cx + 1, 40, 7, 12, 1);
          // page rune lines
          g.fillStyle(rune, 0.35);
          g.fillRect(cx - 7, 42, 5, 1);
          g.fillRect(cx - 7, 44, 4, 1);
          g.fillRect(cx - 7, 46, 5, 1);
          g.fillRect(cx + 2, 42, 5, 1);
          g.fillRect(cx + 2, 44, 4, 1);
          g.fillRect(cx + 2, 46, 5, 1);
          // book glow
          g.fillStyle(edge, 0.15);
          g.fillEllipse(cx, 46, 22, 12);
          // floating void particles
          g.fillStyle(edge, 0.3);
          g.fillCircle(cx - 18, 40, 2.5);
          g.fillCircle(cx + 18, 36, 2);
          g.fillCircle(cx - 10, 72, 2);
          g.fillCircle(cx + 12, 70, 2.5);
          g.fillCircle(cx, 80, 1.5);
          g.fillStyle(rune, 0.18);
          g.fillCircle(cx - 22, 52, 1.5);
          g.fillCircle(cx + 22, 48, 1.5);
        } else {
          // --- Grounded Cultist Warrior ---
          // main cloak body
          g.fillStyle(cloak, 0.97);
          g.beginPath();
          g.moveTo(cx - 17, 30); g.lineTo(cx, 4);
          g.lineTo(cx + 17, 30); g.lineTo(cx + 15, 72);
          g.lineTo(cx - 15, 72);
          g.closePath(); g.fillPath();
          // cloak folds
          g.fillStyle(cloakHi, 0.4);
          g.fillRect(cx - 2, 34, 4, 36);
          g.fillStyle(0x1a1020, 0.3);
          g.fillRect(cx - 11, 54, 9, 2);
          g.fillRect(cx + 2, 56, 9, 2);
          // cloak rune circle
          g.lineStyle(1, rune, 0.22);
          g.strokeCircle(cx, 46, 8);
          g.fillStyle(rune, 0.12);
          g.fillCircle(cx, 46, 4);
          // heavy pauldrons
          g.fillStyle(0x3a2850, 0.75);
          g.fillRoundedRect(cx - 24, 28, 16, 10, 4);
          g.fillRoundedRect(cx + 8, 28, 16, 10, 4);
          g.lineStyle(1.5, trim, 0.55);
          g.strokeRoundedRect(cx - 24, 28, 16, 10, 4);
          g.strokeRoundedRect(cx + 8, 28, 16, 10, 4);
          // pauldron rune accent
          g.fillStyle(edge, 0.3);
          g.fillRect(cx - 22, 32, 12, 2);
          g.fillRect(cx + 10, 32, 12, 2);
          g.fillStyle(rune, 0.2);
          g.fillCircle(cx - 16, 33, 1.5);
          g.fillCircle(cx + 16, 33, 1.5);
          // belt with buckle
          g.fillStyle(0x4a3068, 0.88);
          g.fillRoundedRect(cx - 13, 52, 26, 5, 2);
          g.fillStyle(edge, 0.6);
          g.fillCircle(cx, 54, 2.5);
          g.lineStyle(1, 0x8060a0, 0.5);
          g.strokeCircle(cx, 54, 2.5);
          // arms with wraps
          g.fillStyle(0x5a4878, 0.9);
          g.fillRoundedRect(cx - 26, 34, 14, 26, 4);
          g.fillRoundedRect(cx + 12, 34, 14, 26, 4);
          g.lineStyle(1.5, trim, 0.4);
          g.strokeRoundedRect(cx - 26, 34, 14, 26, 4);
          g.strokeRoundedRect(cx + 12, 34, 14, 26, 4);
          // arm band details
          g.fillStyle(0x1a1028, 0.5);
          g.fillRect(cx - 24, 42, 10, 2);
          g.fillRect(cx + 14, 44, 10, 2);
          // legs
          g.fillStyle(0x1a1028, 0.96);
          g.fillRoundedRect(cx - 11, 68, 9, 18, 4);
          g.fillRoundedRect(cx + 2, 68, 9, 18, 4);
          g.fillStyle(0x2a1838, 0.7);
          g.fillRect(cx - 9, 76, 7, 2);
          g.fillRect(cx + 4, 78, 7, 2);
          // head
          g.fillStyle(skin, 0.9);
          g.fillEllipse(cx, 22, 17, 15);
          // hood
          g.fillStyle(0x08040e, 0.94);
          g.beginPath();
          g.moveTo(cx - 11, 16); g.lineTo(cx, 6);
          g.lineTo(cx + 11, 16); g.lineTo(cx + 9, 28);
          g.lineTo(cx - 9, 28);
          g.closePath(); g.fillPath();
          // hood inner shadow
          g.fillStyle(0x040208, 0.45);
          g.fillTriangle(cx - 7, 22, cx, 10, cx + 7, 22);
          // eyes
          g.fillStyle(0xf0e0ff, 0.94);
          g.fillCircle(cx - 4, 20, 2.4);
          g.fillCircle(cx + 5, 20, 2.4);
          g.fillStyle(edge, 0.55);
          g.fillCircle(cx - 4, 20, 1.3);
          g.fillCircle(cx + 5, 20, 1.3);
          g.fillStyle(0xffffff, 0.45);
          g.fillCircle(cx - 4.5, 19.5, 0.6);
          g.fillCircle(cx + 4.5, 19.5, 0.6);
          // shadow spear — shaft
          g.fillStyle(0x140e24, 0.97);
          g.beginPath();
          g.moveTo(cx + 16, 40); g.lineTo(cx + 38, 28);
          g.lineTo(cx + 40, 32); g.lineTo(cx + 20, 50);
          g.closePath(); g.fillPath();
          // spear inner glow band
          g.fillStyle(edge, 0.45);
          g.beginPath();
          g.moveTo(cx + 18, 42); g.lineTo(cx + 36, 30);
          g.lineTo(cx + 38, 34); g.lineTo(cx + 22, 48);
          g.closePath(); g.fillPath();
          // spear energy edge line
          g.lineStyle(2.5, edge, 0.82);
          g.beginPath(); g.moveTo(cx + 16, 44); g.lineTo(cx + 38, 32); g.strokePath();
          // spear tip with glow
          g.fillStyle(edge, 0.75);
          g.fillTriangle(cx + 38, 26, cx + 44, 32, cx + 38, 38);
          g.fillStyle(0xffffff, 0.35);
          g.fillCircle(cx + 42, 32, 2);
          // spear rune marks
          g.lineStyle(1, rune, 0.4);
          g.beginPath(); g.moveTo(cx + 22, 46); g.lineTo(cx + 34, 35); g.strokePath();
          g.fillStyle(rune, 0.25);
          g.fillCircle(cx + 28, 40, 1.5);
          // left arm shield glyph
          g.lineStyle(1, rune, 0.2);
          g.strokeCircle(cx - 19, 46, 4);
        }
        break;
      }
      case "behemoth": {
        const stone = 0x4a5a48;
        const stoneHi = 0x6a7a68;
        const moss = 0x5a8a50;
        const lichen = 0x8ab878;
        const core = 0xb7ff7f;
        const dark = 0x1a2818;
        const crack = 0x3a4838;
        // ground shadow
        g.fillStyle(dark, 0.85);
        g.fillEllipse(39, 84, 58, 18);
        // massive torso
        g.fillStyle(stone, 1);
        g.fillRoundedRect(8, 24, 62, 56, 14);
        // stone texture cracks
        g.lineStyle(1.5, crack, 0.7);
        g.beginPath(); g.moveTo(22, 30); g.lineTo(26, 50); g.lineTo(24, 72); g.strokePath();
        g.beginPath(); g.moveTo(54, 28); g.lineTo(50, 48); g.lineTo(52, 70); g.strokePath();
        g.beginPath(); g.moveTo(34, 34); g.lineTo(38, 56); g.strokePath();
        g.beginPath(); g.moveTo(44, 36); g.lineTo(42, 58); g.strokePath();
        // moss patches
        g.fillStyle(moss, 0.6);
        g.fillEllipse(24, 48, 18, 10);
        g.fillEllipse(56, 52, 14, 8);
        g.fillStyle(lichen, 0.4);
        g.fillEllipse(38, 42, 22, 10);
        g.fillStyle(moss, 0.35);
        g.fillEllipse(16, 60, 10, 6);
        g.fillEllipse(62, 58, 8, 5);
        // core vein glow
        g.lineStyle(2, core, 0.3);
        g.beginPath(); g.moveTo(30, 40); g.lineTo(39, 46); g.lineTo(48, 40); g.strokePath();
        g.fillStyle(core, 0.35);
        g.fillCircle(39, 46, 5);
        g.fillStyle(0xeeffcc, 0.2);
        g.fillCircle(39, 46, 2.5);
        // stone brow / head
        g.fillStyle(0x3a4838, 1);
        g.fillRoundedRect(10, 14, 58, 22, 10);
        // brow ridges
        g.fillStyle(0x4a5848, 0.95);
        g.fillRoundedRect(12, 14, 22, 8, 4);
        g.fillRoundedRect(44, 14, 22, 8, 4);
        g.lineStyle(1.5, stoneHi, 0.5);
        g.beginPath(); g.moveTo(14, 20); g.lineTo(32, 20); g.strokePath();
        g.beginPath(); g.moveTo(46, 20); g.lineTo(64, 20); g.strokePath();
        // glowing eye sockets
        g.fillStyle(core, 0.45);
        g.fillEllipse(28, 26, 14, 8);
        g.fillEllipse(50, 26, 14, 8);
        drawEyes(28, 26, 50, 26, 3.2);
        g.fillStyle(core, 0.25);
        g.fillCircle(28, 26, 2);
        g.fillCircle(50, 26, 2);
        // jaw
        g.fillStyle(0x2a3828, 0.95);
        g.fillRoundedRect(20, 30, 38, 8, 3);
        g.fillStyle(0x3a4838, 0.7);
        g.fillRect(26, 32, 4, 4);
        g.fillRect(34, 32, 4, 4);
        g.fillRect(42, 32, 4, 4);
        // thick arms
        g.fillStyle(0x2a3828, 1);
        g.fillRoundedRect(0, 32, 16, 44, 6);
        g.fillRoundedRect(62, 32, 16, 44, 6);
        // arm stone texture
        g.fillStyle(stoneHi, 0.85);
        g.fillRoundedRect(2, 36, 12, 34, 4);
        g.fillRoundedRect(64, 36, 12, 34, 4);
        g.lineStyle(1.5, lichen, 0.45);
        g.beginPath();
        g.arc(8, 54, 10, Phaser.Math.DegToRad(110), Phaser.Math.DegToRad(250), false);
        g.strokePath();
        g.beginPath();
        g.arc(70, 54, 10, Phaser.Math.DegToRad(-70), Phaser.Math.DegToRad(70), false);
        g.strokePath();
        // boulder fists
        g.fillStyle(0x3a4838, 1);
        g.fillCircle(6, 78, 8);
        g.fillCircle(72, 78, 8);
        g.fillStyle(stoneHi, 0.6);
        g.fillCircle(6, 78, 5);
        g.fillCircle(72, 78, 5);
        g.lineStyle(1, crack, 0.6);
        g.beginPath(); g.moveTo(4, 74); g.lineTo(8, 82); g.strokePath();
        g.beginPath(); g.moveTo(70, 74); g.lineTo(74, 82); g.strokePath();
        // legs / feet
        g.fillStyle(0x2a3020, 1);
        g.fillRoundedRect(18, 76, 16, 12, 6);
        g.fillRoundedRect(44, 76, 16, 12, 6);
        g.fillStyle(0x3a4030, 0.9);
        g.fillRoundedRect(20, 78, 12, 8, 3);
        g.fillRoundedRect(46, 78, 12, 8, 3);
        // moss on feet
        g.fillStyle(moss, 0.4);
        g.fillEllipse(26, 84, 10, 4);
        g.fillEllipse(52, 84, 10, 4);
        break;
      }
      case "graveWarden": {
        const necro = col;
        const deep = 0x0b0414;
        const robe = 0x22102e;
        const robeMid = 0x341844;
        const fold = 0x4e2666;
        const stone = 0x30283c;
        const stoneDk = 0x1a1626;
        const bone = 0xe8d8cc;
        const boneShadow = 0x8a7a80;
        const sick = 0x9affc2;
        const soulGold = 0xfff0a8;

        // Ground shadow with purple glow
        g.fillStyle(deep, 0.85);
        g.fillEllipse(39, 90, 64, 14);
        g.fillStyle(necro, 0.12);
        g.fillEllipse(39, 90, 48, 8);

        // Gravestone throne (tall, arched, behind her)
        g.fillStyle(stoneDk, 0.95);
        g.fillRoundedRect(14, 18, 50, 62, 8);
        g.fillStyle(stone, 0.9);
        g.fillRoundedRect(17, 20, 44, 58, 7);
        // arch top
        g.beginPath();
        g.arc(39, 18, 25, Math.PI, 0, false);
        g.fillPath();
        g.fillStyle(stoneDk, 1);
        g.beginPath();
        g.arc(39, 18, 22, Math.PI, 0, false);
        g.fillPath();
        g.fillStyle(stone, 0.8);
        g.beginPath();
        g.arc(39, 20, 20, Math.PI, 0, false);
        g.fillPath();
        // throne edge cracks
        g.lineStyle(1.2, necro, 0.3);
        g.lineBetween(17, 46, 14, 56);
        g.lineBetween(61, 46, 64, 56);
        g.lineBetween(14, 70, 20, 74);
        g.lineBetween(64, 70, 58, 74);
        // engraved cross/sigil on throne back
        g.lineStyle(1.5, necro, 0.4);
        g.strokeCircle(39, 32, 8);
        g.lineStyle(1.2, necro, 0.35);
        g.lineBetween(39, 22, 39, 42);
        g.lineBetween(29, 32, 49, 32);

        // Skulls mounted on throne corners
        g.fillStyle(bone, 0.85);
        g.fillCircle(18, 24, 4);
        g.fillCircle(60, 24, 4);
        g.fillStyle(0x000000, 0.8);
        g.fillCircle(17, 23, 0.9);
        g.fillCircle(19, 23, 0.9);
        g.fillCircle(59, 23, 0.9);
        g.fillCircle(61, 23, 0.9);

        // Bone pile at her feet
        g.fillStyle(bone, 0.55);
        g.fillEllipse(24, 86, 12, 4);
        g.fillEllipse(54, 86, 12, 4);
        g.fillCircle(18, 86, 2.8);
        g.fillCircle(60, 86, 2.8);
        g.fillStyle(0x000000, 0.75);
        g.fillCircle(17, 85, 0.7);
        g.fillCircle(19, 85, 0.7);
        g.fillCircle(59, 85, 0.7);
        g.fillCircle(61, 85, 0.7);
        g.lineStyle(0.9, bone, 0.55);
        g.lineBetween(28, 88, 36, 88);
        g.lineBetween(42, 88, 50, 88);

        // Spectral mist pooling at feet
        g.fillStyle(sick, 0.16);
        g.fillEllipse(39, 82, 42, 8);

        // Royal cape (outer layer, pulled outward)
        g.fillStyle(robe, 0.95);
        g.beginPath();
        g.moveTo(12, 34);
        graphicsQuadBezier(g, 12, 34, 6, 60, 14, 84);
        g.lineTo(64, 84);
        graphicsQuadBezier(g, 64, 84, 72, 60, 66, 34);
        g.closePath();
        g.fillPath();
        // cape inner shadow
        g.fillStyle(deep, 0.55);
        g.beginPath();
        g.moveTo(17, 38);
        graphicsQuadBezier(g, 17, 38, 11, 58, 18, 80);
        g.lineTo(60, 80);
        graphicsQuadBezier(g, 60, 80, 67, 58, 61, 38);
        g.closePath();
        g.fillPath();
        // cape royal trim (gold)
        g.lineStyle(1.5, soulGold, 0.45);
        g.beginPath();
        g.moveTo(12, 34);
        graphicsQuadBezier(g, 12, 34, 6, 60, 14, 84);
        g.strokePath();
        g.beginPath();
        g.moveTo(66, 34);
        graphicsQuadBezier(g, 66, 34, 72, 60, 64, 84);
        g.strokePath();

        // Main gown (front, slimmer silhouette)
        g.fillStyle(robeMid, 1);
        g.beginPath();
        g.moveTo(26, 32);
        g.lineTo(52, 32);
        g.lineTo(56, 82);
        g.lineTo(48, 80);
        g.lineTo(44, 84);
        g.lineTo(39, 78);
        g.lineTo(34, 84);
        g.lineTo(30, 80);
        g.lineTo(22, 82);
        g.closePath();
        g.fillPath();

        // Central fold
        g.fillStyle(fold, 0.5);
        g.fillRect(37, 34, 4, 46);
        g.fillStyle(fold, 0.3);
        g.fillRect(29, 38, 2, 40);
        g.fillRect(47, 38, 2, 40);

        // Gold embroidered belt / sash
        g.fillStyle(soulGold, 0.5);
        g.fillRect(26, 54, 26, 3);
        g.fillStyle(soulGold, 0.85);
        g.fillRect(37, 53, 4, 5);
        g.fillStyle(necro, 0.7);
        g.fillCircle(39, 55, 1.5);

        // Bone corset (ribs exposed over gown chest)
        g.lineStyle(1.4, bone, 0.7);
        for (let rib = 0; rib < 4; rib++) {
          const ry = 40 + rib * 3.5;
          g.beginPath();
          g.arc(39, ry, 9 - rib, -Math.PI * 0.75, -Math.PI * 0.25);
          g.strokePath();
          g.beginPath();
          g.arc(39, ry, 9 - rib, Math.PI * 0.25, Math.PI * 0.75);
          g.strokePath();
        }
        // central sternum plate
        g.fillStyle(bone, 0.8);
        g.fillRoundedRect(37, 38, 4, 15, 1);

        // Arms (commanding, one raising orb, one holding scythe)
        g.fillStyle(robeMid, 1);
        // left arm bent up holding orb
        g.beginPath();
        g.moveTo(22, 36);
        g.lineTo(16, 52);
        g.lineTo(22, 58);
        g.lineTo(28, 44);
        g.closePath();
        g.fillPath();
        // right arm down holding scythe
        g.beginPath();
        g.moveTo(56, 36);
        g.lineTo(62, 40);
        g.lineTo(60, 66);
        g.lineTo(54, 62);
        g.closePath();
        g.fillPath();

        // Bone hands
        g.fillStyle(bone, 0.9);
        g.fillRoundedRect(14, 48, 9, 8, 2);
        g.fillRoundedRect(58, 60, 9, 9, 2);
        g.fillStyle(boneShadow, 0.45);
        g.fillRect(15, 51, 7, 1);
        g.fillRect(59, 63, 7, 1);
        // fingers
        g.lineStyle(1.1, bone, 0.7);
        g.lineBetween(14, 49, 10, 44);
        g.lineBetween(17, 48, 15, 42);
        g.lineBetween(20, 48, 20, 42);
        g.lineBetween(59, 61, 56, 56);
        g.lineBetween(62, 60, 62, 54);
        g.lineBetween(65, 60, 68, 54);

        // Scythe (right hand - massive and ornate)
        g.lineStyle(3.5, boneShadow, 0.8);
        g.beginPath();
        g.moveTo(63, 30);
        g.lineTo(60, 88);
        g.strokePath();
        g.lineStyle(2.2, bone, 0.9);
        g.beginPath();
        g.moveTo(63, 30);
        g.lineTo(60, 88);
        g.strokePath();
        // scythe staff wrappings (gold)
        g.fillStyle(soulGold, 0.6);
        g.fillRect(59, 48, 5, 1.5);
        g.fillRect(59, 66, 5, 1.5);
        // scythe blade (curved, menacing)
        g.fillStyle(stoneDk, 0.95);
        g.beginPath();
        g.moveTo(63, 24);
        graphicsQuadBezier(g, 63, 24, 78, 12, 76, 4);
        graphicsQuadBezier(g, 76, 4, 70, 18, 63, 28);
        g.closePath();
        g.fillPath();
        // blade edge glow
        g.lineStyle(1.8, necro, 0.75);
        g.beginPath();
        graphicsQuadBezier(g, 63, 24, 78, 12, 76, 4);
        g.strokePath();
        g.lineStyle(1, sick, 0.5);
        g.beginPath();
        graphicsQuadBezier(g, 64, 22, 74, 14, 74, 8);
        g.strokePath();
        // scythe pommel skull
        g.fillStyle(bone, 0.95);
        g.fillCircle(60, 88, 3.5);
        g.fillStyle(0x000000, 0.85);
        g.fillCircle(59, 88, 0.8);
        g.fillCircle(61, 88, 0.8);

        // Floating soul urn/orb (left hand raised)
        g.fillStyle(deep, 0.9);
        g.fillEllipse(16, 42, 11, 7);
        g.fillStyle(stone, 0.85);
        g.fillCircle(16, 38, 5);
        g.fillStyle(necro, 0.3);
        g.fillCircle(16, 38, 4);
        // glowing souls inside the urn
        g.fillStyle(sick, 0.7);
        g.fillCircle(14, 37, 1.5);
        g.fillCircle(17, 36, 1.2);
        g.fillStyle(0xffffff, 0.7);
        g.fillCircle(15, 36, 0.8);
        // flames rising from urn
        g.fillStyle(sick, 0.55);
        g.fillTriangle(16, 30, 13, 36, 19, 36);
        g.fillStyle(sick, 0.3);
        g.fillTriangle(16, 26, 11, 34, 21, 34);

        // Tall peaked hood (veil-like)
        g.fillStyle(deep, 1);
        g.beginPath();
        g.moveTo(22, 16);
        graphicsQuadBezier(g, 22, 16, 39, -4, 56, 16);
        g.lineTo(54, 32);
        graphicsQuadBezier(g, 54, 32, 39, 26, 24, 32);
        g.closePath();
        g.fillPath();
        // hood inner darkness
        g.fillStyle(0x000000, 0.55);
        g.beginPath();
        g.moveTo(25, 18);
        graphicsQuadBezier(g, 25, 18, 39, 2, 53, 18);
        g.lineTo(51, 30);
        g.lineTo(27, 30);
        g.closePath();
        g.fillPath();

        // Face: gilded skull mask
        g.fillStyle(0x000000, 0.92);
        g.fillEllipse(39, 22, 24, 14);
        g.fillStyle(bone, 0.88);
        g.fillEllipse(39, 22, 20, 12);
        g.fillStyle(boneShadow, 0.4);
        g.fillEllipse(39, 26, 18, 4);
        // mask gold trim
        g.lineStyle(1, soulGold, 0.55);
        g.strokeEllipse(39, 22, 20, 12);
        g.lineBetween(39, 16, 39, 28);
        // mask cheek etchings
        g.lineStyle(0.8, necro, 0.45);
        g.lineBetween(30, 24, 28, 28);
        g.lineBetween(48, 24, 50, 28);
        // glowing eye sockets (distinct green)
        g.fillStyle(0x000000, 1);
        g.fillEllipse(32, 22, 5.5, 4);
        g.fillEllipse(46, 22, 5.5, 4);
        g.fillStyle(sick, 0.95);
        g.fillCircle(32, 22, 2);
        g.fillCircle(46, 22, 2);
        g.fillStyle(0xffffff, 0.7);
        g.fillCircle(32, 21, 0.9);
        g.fillCircle(46, 21, 0.9);
        // eye glow drip
        g.fillStyle(sick, 0.35);
        g.fillEllipse(32, 27, 2.5, 4);
        g.fillEllipse(46, 27, 2.5, 4);
        // small nose hole
        g.fillStyle(0x000000, 0.8);
        g.fillTriangle(38, 25, 40, 25, 39, 28);

        // Crown of soul flames (candle tips)
        g.fillStyle(boneShadow, 0.7);
        g.fillRect(23, 12, 2, 4);
        g.fillRect(30, 6, 2, 5);
        g.fillRect(38, 3, 2, 5);
        g.fillRect(46, 6, 2, 5);
        g.fillRect(53, 12, 2, 4);
        // flames
        g.fillStyle(sick, 0.55);
        g.fillTriangle(24, 6, 22, 12, 26, 12);
        g.fillTriangle(31, 0, 29, 6, 33, 6);
        g.fillTriangle(39, -3, 37, 3, 41, 3);
        g.fillTriangle(47, 0, 45, 6, 49, 6);
        g.fillTriangle(54, 6, 52, 12, 56, 12);
        // inner bright flames
        g.fillStyle(soulGold, 0.6);
        g.fillTriangle(24, 8, 23, 11, 25, 11);
        g.fillTriangle(31, 2, 30, 5, 32, 5);
        g.fillTriangle(39, -1, 38, 2, 40, 2);
        g.fillTriangle(47, 2, 46, 5, 48, 5);
        g.fillTriangle(54, 8, 53, 11, 55, 11);

        // Floating soul orbs orbiting her (3 small ones)
        g.fillStyle(sick, 0.5);
        g.fillCircle(10, 46, 2.8);
        g.fillCircle(68, 56, 2.8);
        g.fillCircle(70, 28, 2.2);
        g.fillStyle(sick, 0.85);
        g.fillCircle(10, 46, 1.4);
        g.fillCircle(68, 56, 1.4);
        g.fillCircle(70, 28, 1.1);
        g.fillStyle(0xffffff, 0.6);
        g.fillCircle(10, 45, 0.6);
        g.fillCircle(68, 55, 0.6);

        // Chains dangling from throne arms
        g.lineStyle(1.2, boneShadow, 0.5);
        for (let ch = 0; ch < 4; ch += 1) {
          const cy = 40 + ch * 8;
          g.strokeCircle(14, cy, 1.6);
          g.strokeCircle(64, cy, 1.6);
        }
        break;
      }
      default: {
        g.fillStyle(col, 1);
        g.fillRoundedRect(12, 18, 54, 66, 10);
        drawEyes(30, 36, 48, 36, 3);
        g.fillStyle(0xffffff, 0.45);
        g.fillRect(22, 56, 34, 4);
        break;
      }
    }

    g.generateTexture(key, w, h);
    g.destroy();
  }
}

window.BootScene = BootScene;
