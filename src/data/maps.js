/**
 * Arena / map definitions.
 * All arenas are ~10% wider than the original 1200 → 1320.
 *
 * Jump budget (gravity 1200, height = v² / 2g):
 *   Guardian 550 → 126px   Vanguard 570 → 135px
 *   Medic/Ranger 575 → 138px   Striker 590 → 145px
 *
 * Floor surface (standing level) sits at y ≈ 511 (center 522, half-height 11).
 *
 * TIER RULES
 *   Tier 1 (just above floor): gap ≤ 105px → reachable by ALL characters + bosses.
 *     Platform center y ≥ 417  (top ≥ 406, gap = 511−406 = 105).
 *   Tier 2 (mid): gap from tier 1 ~90-110px → reachable by Vanguard+ (135+).
 *   Tier 3 (high): gap from tier 2 ~80-100px → reachable by Striker/Ranger from tier 2.
 *
 * Each map has a unique platform layout silhouette.
 */
window.ARENA_MAPS = [
  {
    id: "ashen-battlegrounds",
    name: "Ashen Battlegrounds",
    lore: "The scorched remains of a forgotten war. Ash drifts endlessly on the wind while the cracked ground still smolders beneath every step.",
    width: 1320,
    cameraZoom: 0.727,
    backgroundColor: 0x1a1510,
    floorScaleX: 8.0,
    playerSpawns: [{ x: 220, y: 370 }, { x: 360, y: 360 }],
    bossSpawn: { x: 1080, y: 360 },
    // Layout: wide center shelf + two small high perches
    platforms: [
      { x: 660, y: 420, scaleX: 2.2 },
      { x: 340, y: 310, scaleX: 0.85 },
      { x: 980, y: 320, scaleX: 0.85 }
    ]
  },
  {
    id: "twilight-sanctum",
    name: "Twilight Sanctum",
    lore: "A crumbling shrine bathed in perpetual dusk. Shards of stained glass litter the hallowed ground, and hymns echo from nowhere.",
    width: 1320,
    cameraZoom: 0.727,
    backgroundColor: 0x12101e,
    floorScaleX: 8.0,
    playerSpawns: [{ x: 210, y: 365 }, { x: 350, y: 355 }],
    bossSpawn: { x: 1100, y: 355 },
    // Layout: cathedral arch — low center bridge, two higher side balconies
    platforms: [
      { x: 560, y: 425, scaleX: 1.5 },
      { x: 270, y: 320, scaleX: 1.0 },
      { x: 1050, y: 320, scaleX: 1.0 },
      { x: 660, y: 230, scaleX: 0.75 }
    ]
  },
  {
    id: "frozen-wastes",
    name: "Frozen Wastes",
    lore: "A vast expanse beneath a dying glacier. The cold numbs the body but sharpens the mind. Ice groans and fractures with each tremor.",
    width: 1320,
    cameraZoom: 0.727,
    backgroundColor: 0x0e1a24,
    floorScaleX: 8.0,
    playerSpawns: [{ x: 200, y: 370 }, { x: 340, y: 360 }],
    bossSpawn: { x: 1090, y: 360 },
    // Layout: ascending staircase left→right (each step ≤ 100 gap)
    platforms: [
      { x: 280, y: 420, scaleX: 1.1 },
      { x: 530, y: 365, scaleX: 1.0 },
      { x: 790, y: 320, scaleX: 1.0 },
      { x: 1060, y: 270, scaleX: 0.9 }
    ]
  },
  {
    id: "verdant-canopy",
    name: "Verdant Canopy",
    lore: "An ancient forest clearing where gnarled roots and living branches form natural platforms above a carpet of moss and fallen leaves.",
    width: 1320,
    cameraZoom: 0.727,
    backgroundColor: 0x0c1a10,
    floorScaleX: 8.0,
    playerSpawns: [{ x: 230, y: 365 }, { x: 370, y: 355 }],
    bossSpawn: { x: 1070, y: 355 },
    // Layout: organic spread — two low outer branches, one mid-wide trunk ledge, one high nest
    platforms: [
      { x: 250, y: 418, scaleX: 1.0 },
      { x: 660, y: 380, scaleX: 1.6 },
      { x: 1060, y: 418, scaleX: 1.0 },
      { x: 500, y: 270, scaleX: 0.8 }
    ]
  },
  {
    id: "crimson-depths",
    name: "Crimson Depths",
    lore: "Deep within a volcanic rift where magma rivers cast flickering light on obsidian walls. The heat warps the air itself.",
    width: 1320,
    cameraZoom: 0.727,
    backgroundColor: 0x1a0c08,
    floorScaleX: 8.0,
    playerSpawns: [{ x: 220, y: 368 }, { x: 350, y: 358 }],
    bossSpawn: { x: 1080, y: 358 },
    // Layout: two massive wide ledges stacked offset (volcanic shelves)
    platforms: [
      { x: 420, y: 418, scaleX: 1.8 },
      { x: 940, y: 418, scaleX: 1.5 },
      { x: 660, y: 310, scaleX: 1.4 }
    ]
  },
  {
    id: "spectral-hollow",
    name: "Spectral Hollow",
    lore: "A liminal space between worlds where spirits wander aimlessly. Reality bends at the edges and the ground flickers in and out of existence.",
    width: 1320,
    cameraZoom: 0.727,
    backgroundColor: 0x0a0c18,
    floorScaleX: 8.0,
    playerSpawns: [{ x: 210, y: 370 }, { x: 340, y: 360 }],
    bossSpawn: { x: 1100, y: 360 },
    // Layout: three scattered floating shards at different heights (asymmetric)
    platforms: [
      { x: 380, y: 420, scaleX: 0.9 },
      { x: 760, y: 355, scaleX: 1.05 },
      { x: 1050, y: 420, scaleX: 0.85 },
      { x: 550, y: 260, scaleX: 0.7 }
    ]
  },
  {
    id: "iron-citadel",
    name: "Iron Citadel",
    lore: "The heart of a forge-fortress long since abandoned. Iron beams and corroded gears groan under the weight of centuries of silence.",
    width: 1320,
    cameraZoom: 0.727,
    backgroundColor: 0x121418,
    floorScaleX: 8.0,
    playerSpawns: [{ x: 220, y: 365 }, { x: 360, y: 355 }],
    bossSpawn: { x: 1080, y: 355 },
    // Layout: symmetric scaffolding — two low walkways, one long high catwalk
    platforms: [
      { x: 300, y: 420, scaleX: 1.3 },
      { x: 1020, y: 420, scaleX: 1.3 },
      { x: 660, y: 310, scaleX: 2.0 }
    ]
  },
  {
    id: "skyborne-ruins",
    name: "Skyborne Ruins",
    lore: "Remnants of a civilization that built among the clouds. The wind howls between fractured towers suspended above an endless drop.",
    width: 1320,
    cameraZoom: 0.727,
    backgroundColor: 0x101828,
    floorScaleX: 8.0,
    playerSpawns: [{ x: 230, y: 370 }, { x: 360, y: 360 }],
    bossSpawn: { x: 1080, y: 360 },
    // Layout: broken bridge — 5 small stepping stones forming a diagonal arc
    platforms: [
      { x: 240, y: 417, scaleX: 0.7 },
      { x: 440, y: 370, scaleX: 0.7 },
      { x: 660, y: 325, scaleX: 0.75 },
      { x: 880, y: 370, scaleX: 0.7 },
      { x: 1080, y: 417, scaleX: 0.7 }
    ]
  }
];
