/** Range / role metadata so bosses prefer viable attacks and do not only spam full-screen options. */
const BOSS_ATTACK_PROFILES = {
  sovereignScreenDash: { global: false, maxDist: 540, minDist: 36, maxVGap: 130 },
  aetherColumn: { global: false, maxDist: 400, maxVGap: 165 },
  galeSeekerVolley: { global: false, maxDist: 500, maxVGap: 145 },
  galeWindSphere: { global: true, ranged: true },
  typhoonSlam: { global: true, ranged: true },
  wraithBlink: { global: true, ranged: true },
  scytheArc: { global: false, maxDist: 150, maxVGap: 88 },
  spiritVolley: { global: false, maxDist: 360, maxVGap: 125 },
  phaseRush: { global: false, maxDist: 390, minDist: 40, maxVGap: 110 },
  voidTendril: { global: false, maxDist: 420, maxVGap: 200 },
  flameWarp: { global: true, ranged: true },
  infernoRiftPortal: { global: true, ranged: true },
  emberVolley: { global: false, maxDist: 410, maxVGap: 135 },
  fireNova: { global: false, maxDist: 130, maxVGap: 95 },
  cinderRush: { global: false, maxDist: 380, minDist: 38, maxVGap: 110 },
  voidPounce: { global: false, maxDist: 370, minDist: 18, maxVGap: 145 },
  shadowFlurry: { global: false, maxDist: 140, maxVGap: 85 },
  voidLance: { global: false, maxDist: 410, maxVGap: 110 },
  hollowImplosion: { global: false, maxDist: 195, maxVGap: 105 },
  hollowGroundSpear: { global: false, maxDist: 400, maxVGap: 118 },
  hollowSoulLink: { global: true, ranged: true },
  riftDash: { global: false, maxDist: 370, minDist: 42, maxVGap: 110 },
  titanCharge: { global: false, maxDist: 410, minDist: 32, maxVGap: 120 },
  meteorCall: { global: true, ranged: true },
  stalkBoulder: { global: true },
  earthshatter: { global: true },
  boulderBarrage: { global: true, ranged: true },
  gapDash: { global: false, maxDist: 430, minDist: 26, maxVGap: 125 },
  jumpSmash: { global: false, maxDist: 310, maxVGap: 145 },
  rangedPressure: { global: false, maxDist: 430, maxVGap: 115 },
  closeBurst: { global: false, maxDist: 165, maxVGap: 90 },
  boneVolley: { global: false, maxDist: 520, maxVGap: 145 },
  graveRise: { global: true, ranged: true },
  soulSiphon: { global: false, maxDist: 220, maxVGap: 100 },
  phantomSwarm: { global: true, ranged: true },
  deathsToll: { global: true, ranged: true }
};

class Boss extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, definition, textureKey) {
    super(scene, x, y, textureKey);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.scene = scene;
    this.definition = definition;
    this.lastContactHit = 0;
    this.nextSpecialTime = 0;
    this.nextBasicAttackTime = 0;
    this.dashLockUntil = 0;
    this.nextTraverseJumpTime = 0;
    this.nextPathRecalcTime = 0;
    this.nextAttackDecisionTime = 0;
    this.attackCooldowns = {};
    this.attackLockUntil = 0;
    this.nextAnyAttackTime = 0;
    this.movementLockUntil = 0;
    this.currentNavPath = [];
    this.lastAttackId = null;
    this.recentAttackIds = [];
    this.lastProgressCheckTime = 0;
    this.lastProgressX = x;
    this.lastProgressY = y;
    this.stuckSteps = 0;
    this.phase = 1;
    this.stunnedUntil = 0;
    this.consecutiveGlobalAttacks = 0;
    this._bossAttackEpoch = 0;
    this._interruptibleTimeEvents = [];
    this.typhoonSlamPending = false;
    this.typhoonSlamContext = null;
    this.typhoonSlamWasAirborne = false;
    this.galeWindSphereEndAt = 0;
    this.galeWindSphereContext = null;
    this._galeWindPrevGravity = true;
    this.lastNearPlayerTime = 0;
    /** Gale Sovereign: last time gale wind sphere was used (for minimum spacing). */
    this.lastGaleWindSphereUsedAt = null;
    this.sharedHp = definition.sharedHp || null;
    this.twinSibling = null;
    this.twinLeader = null;
    this.isTwinSecondary = definition.twinRole === "secondary";
    this.vulnerabilityEffects = [];

    this.body.setSize(54, 68);
    this.body.setOffset((78 - 54) / 2, 96 - 68 - 6);
    this.setCollideWorldBounds(true);
    this.setBounce(0.01);

    if (this.sharedHp) {
      this.maxHealth = this.sharedHp.max;
      this.health = this.sharedHp.current;
    } else {
      this.maxHealth = definition.maxHealth;
      this.health = definition.maxHealth;
    }
  }

  update(time, players) {
    if (!this.active) return;
    if (this.isTwinSecondary) return;
    const targets = players.filter((player) => player.isAlive);
    if (!targets.length) {
      this.setVelocityX(0);
      return;
    }

    const target = this.getPriorityTarget(targets);
    if (!target) return;
    const direction = target.x >= this.x ? 1 : -1;
    const distance = Math.abs(target.x - this.x);
    const verticalGap = this.y - target.y;
    if (distance < 300) {
      this.lastNearPlayerTime = time;
    }

    if (time < this.stunnedUntil) {
      this.setVelocityX(0);
      this.flipX = direction < 0;
      return;
    }

    if (this.definition.id === "galeSovereign" && this.galeWindSphereContext) {
      if (time >= this.galeWindSphereEndAt) {
        this.endGaleWindSphereAttack();
      } else {
        this.setVelocity(0, 0);
        this.flipX = target.x < this.x;
        this.applyGaleWindSphereOrbHits(time, targets);
        return;
      }
    }

    if (this.typhoonSlamPending && this.definition.id === "galeSovereign") {
      if (!this.body.blocked.down) {
        this.typhoonSlamWasAirborne = true;
        this.setVelocityX(this.body.velocity.x * 0.94);
        this.flipX = direction < 0;
        this.trackMovementProgress(time, target, direction, distance, verticalGap);
        return;
      }
      if (this.typhoonSlamWasAirborne && this.body.blocked.down && this.body.velocity.y > -95) {
        this.finishTyphoonSlam(targets, time);
      }
    }

    const speedScale = this.health < this.maxHealth * 0.45 ? 1.18 : 1;
    if (time < this.movementLockUntil) {
      // Hold position during committed attack windups/recoveries.
      this.setVelocityX(0);
    } else if (time >= this.dashLockUntil) {
      this.followPathToTarget(target, direction, distance, verticalGap, time, speedScale);
    } else if (!this.body.blocked.down) {
      const maxAirSpeed = this.definition.speed * 1.45;
      const steered = Phaser.Math.Clamp(this.body.velocity.x + direction * 12, -maxAirSpeed, maxAirSpeed);
      this.setVelocityX(steered);
    }
    this.flipX = direction < 0;
    this.trackMovementProgress(time, target, direction, distance, verticalGap);

    if (this.health <= this.maxHealth * 0.5 && this.phase === 1) {
      this.phase = 2;
      this.definition.speed += 18;
      this.definition.contactDamage += 2;
      this.nextAttackDecisionTime = time + 300;
    }

    if (time >= this.nextAttackDecisionTime && time >= this.attackLockUntil && time >= this.nextAnyAttackTime) {
      this.selectAndExecuteAttack(targets, target, direction, distance, verticalGap, time);
      let cadence = Number.isFinite(this.scene?.bossAttackDecisionIntervalMs)
        ? this.scene.bossAttackDecisionIntervalMs
        : 140;
      if (this.definition.id === "hollowPair") {
        cadence = Math.round(cadence * 1.34);
      }
      this.nextAttackDecisionTime = time + cadence;
    }
  }

  trackMovementProgress(time, target, direction, distance, verticalGap) {
    if (!this.active || !target) return;
    if (time < this.lastProgressCheckTime + 260) return;
    const moved = Phaser.Math.Distance.Between(this.x, this.y, this.lastProgressX, this.lastProgressY);
    const canMove = time >= this.movementLockUntil && time >= this.dashLockUntil;
    const likelyStuck = canMove && this.body.blocked.down && distance > 120 && moved < 8;
    if (likelyStuck) {
      this.stuckSteps += 1;
    } else {
      this.stuckSteps = Math.max(0, this.stuckSteps - 1);
    }
    if (this.stuckSteps >= 3) {
      this.currentNavPath = [];
      this.nextPathRecalcTime = 0;
      this.attemptSmartLeap(target.x, target.y, direction, time, { aggressive: true });
      this.stuckSteps = 0;
    }
    this.lastProgressX = this.x;
    this.lastProgressY = this.y;
    this.lastProgressCheckTime = time;
  }

  /**
   * True only when a platform underside is a short hop above the head (tunnel / overhang).
   * The next full tier on stepped arenas is often 70–120px above — that must NOT count as a
   * "low ceiling" or traversal jumps get flattened and bosses never climb.
   */
  hasLowCeilingAbove(clearance = 110, horizontalPadding = 22) {
    if (!this.body || !this.scene?.platforms) return false;
    const bossLeft = this.body.x - horizontalPadding;
    const bossRight = this.body.x + this.body.width + horizontalPadding;
    const bossTop = this.body.y;
    const maxCrampedGap = Math.min(clearance, 46);
    const platforms = this.scene.platforms.getChildren ? this.scene.platforms.getChildren() : [];
    for (let i = 0; i < platforms.length; i += 1) {
      const platform = platforms[i];
      const b = platform?.body;
      if (!b) continue;
      const platLeft = b.x;
      const platRight = b.x + b.width;
      const platBottom = b.y + b.height;
      const overlapsHoriz = platRight >= bossLeft && platLeft <= bossRight;
      if (!overlapsHoriz) continue;
      const gapAbove = bossTop - platBottom;
      if (gapAbove > 0 && gapAbove < maxCrampedGap) {
        return true;
      }
    }
    return false;
  }

  attemptSmartLeap(targetX, targetY, fallbackDirection, time, options = {}) {
    if (!this.body?.blocked.down) return false;
    if (time < this.nextTraverseJumpTime) return false;
    const dx = targetX - this.x;
    const moveDir = dx === 0 ? (fallbackDirection >= 0 ? 1 : -1) : (dx > 0 ? 1 : -1);
    const horizontalDistance = Math.abs(dx);
    const targetAbove = this.y - targetY;
    const needHighReach = targetAbove > 88 || options.forceHighArc === true;
    const lowCeiling = !needHighReach && this.hasLowCeilingAbove(options.ceilingClearance || 120, options.horizontalPadding || 24);
    const minSpeed = options.aggressive || needHighReach ? 300 : 230;
    const maxSpeed = options.aggressive || needHighReach ? 820 : 600;
    const speed = Phaser.Math.Clamp(horizontalDistance * 2.25 + 225, minSpeed, maxSpeed);
    let launchAngleDeg = Phaser.Math.Clamp(
      30 + Math.max(0, targetAbove) * (needHighReach ? 0.12 : 0.08),
      26,
      needHighReach ? 68 : 56
    );
    if (lowCeiling) {
      launchAngleDeg = Phaser.Math.Clamp(16 + Math.max(0, targetAbove) * 0.035, 14, 28);
    }
    const radians = Phaser.Math.DegToRad(launchAngleDeg);
    let launchVX = moveDir * Math.cos(radians) * speed;
    let launchVY = -Math.sin(radians) * speed;
    if (lowCeiling) {
      launchVY = Math.max(launchVY, -300);
      launchVX = moveDir * Math.max(Math.abs(launchVX), 268);
    } else if (needHighReach && targetAbove > 40) {
      launchVY = Math.min(-420, launchVY);
    }
    this.setVelocityX(launchVX);
    this.setVelocityY(launchVY);
    const cooldown = needHighReach ? 520 : lowCeiling ? 440 : 580;
    this.nextTraverseJumpTime = time + cooldown;
    return true;
  }

  getPriorityTarget(targets) {
    const now = this.scene?.time?.now ?? 0;
    let chosen = null;
    let bestScore = Number.POSITIVE_INFINITY;
    targets.forEach((target) => {
      if (!target) return;
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const distSq = dx * dx + dy * dy;
      // Prefer targets on higher platforms so ranged kiting is less safe.
      const platformBias = target.y < this.y - 60 ? -7000 : 0;
      // Guardian taunt: strongly prefer the taunted guardian for its duration.
      const tauntActive =
        target.definition?.id === "guardian"
        && Number.isFinite(target.guardianTauntUntil)
        && now < target.guardianTauntUntil;
      const tauntBias = tauntActive ? -250000 : 0;
      const score = distSq + platformBias + tauntBias;
      if (score < bestScore) {
        bestScore = score;
        chosen = target;
      }
    });
    return chosen;
  }

  handleTraversal(target, direction, distance, verticalGap, time) {
    if (!target || !this.body.blocked.down) return;
    if (time < this.nextTraverseJumpTime) return;

    const blockedHorizontally = this.body.blocked.left || this.body.blocked.right;
    const targetAbove = verticalGap > 48;
    const targetFar = distance > 260 && Math.abs(verticalGap) < 145;
    const alignedUnderTarget = Math.abs(target.x - this.x) < 95;

    if (targetAbove && distance <= 380 && alignedUnderTarget) {
      this.attemptSmartLeap(target.x, target.y, direction, time, {
        aggressive: verticalGap > 92,
        forceHighArc: verticalGap > 100
      });
      return;
    }

    if (blockedHorizontally) {
      this.attemptSmartLeap(target.x, target.y - 20, direction, time, { aggressive: true });
      return;
    }

    if (targetFar) {
      this.attemptSmartLeap(target.x, target.y, direction, time, { aggressive: true });
    }
  }

  followPathToTarget(target, direction, distance, verticalGap, time, speedScale) {
    if (!target) return;
    const graph = this.scene.getBossNavGraph();
    const pickNav =
      typeof this.scene.getClosestBossNavNodeId === "function"
        ? (x, y) => this.scene.getClosestBossNavNodeId(x, y)
        : (x, y) => this.getClosestNodeId(x, y, graph.nodes);

    if (time >= this.nextPathRecalcTime) {
      this.currentNavPath = this.computePathToTarget(target);
      this.nextPathRecalcTime = time + 170;
    }

    const goalId = pickNav(target.x, target.y);
    const goalNode = goalId && graph?.nodes ? graph.nodes.find((n) => n.id === goalId) : null;

    const nextWaypoint =
      this.currentNavPath.length > 1 ? graph.nodes.find((node) => node.id === this.currentNavPath[1]) : null;

    if (nextWaypoint) {
      const dx = nextWaypoint.x - this.x;
      const dy = this.y - nextWaypoint.y;
      const moveDir = dx >= 0 ? 1 : -1;
      const pathMul = distance > 300 ? 1.12 : 1;
      this.setVelocityX(moveDir * this.definition.speed * speedScale * pathMul);

      if (Math.abs(dx) <= 38 && Math.abs(dy) <= 72 && this.currentNavPath.length > 1) {
        this.currentNavPath.shift();
      }

      if (this.body.blocked.down && time >= this.nextTraverseJumpTime) {
        if (dy > 64) {
          this.attemptSmartLeap(nextWaypoint.x, nextWaypoint.y, moveDir, time, {
            aggressive: true,
            forceHighArc: dy > 88
          });
        } else if ((this.body.blocked.left || this.body.blocked.right) && Math.abs(dx) > 18) {
          this.attemptSmartLeap(nextWaypoint.x, nextWaypoint.y - 20, moveDir, time, { aggressive: true });
        }
      }
      return;
    }

    if (goalNode && verticalGap > 40) {
      const horizToGoal = Math.abs(this.x - goalNode.x);
      const headBlocked = this.body.blocked.up && verticalGap > 50;
      if (horizToGoal > 88) {
        const gxDir = goalNode.x >= this.x ? 1 : -1;
        const lateralMul = headBlocked ? 1.72 : 1.42;
        this.setVelocityX(gxDir * this.definition.speed * speedScale * lateralMul);
        return;
      }
      if (time < this.nextTraverseJumpTime) {
        const gxDir = goalNode.x >= this.x ? 1 : -1;
        this.setVelocityX(gxDir * this.definition.speed * speedScale * (headBlocked ? 0.85 : 0.4));
        return;
      }
      if (this.body.blocked.down) {
        this.attemptSmartLeap(goalNode.x, goalNode.y, direction, time, {
          aggressive: true,
          forceHighArc: verticalGap > 72
        });
      }
      return;
    }

    const runMul = distance > 280 ? 1.2 : 1;
    let chaseMul = 1;
    if ((this.definition.id === "galeSovereign" || this.definition.id === "behemoth") && distance > 360) {
      chaseMul = 1.28;
    }
    if (this.definition.id === "hollowPair") {
      chaseMul *= 1.14;
    }
    this.setVelocityX(direction * this.definition.speed * speedScale * runMul * chaseMul);
    this.handleTraversal(target, direction, distance, verticalGap, time);
  }

  computePathToTarget(target) {
    const graph = this.scene.getBossNavGraph();
    const pick =
      typeof this.scene.getClosestBossNavNodeId === "function"
        ? (x, y) => this.scene.getClosestBossNavNodeId(x, y)
        : (x, y) => this.getClosestNodeId(x, y, graph.nodes);
    const startId = pick(this.x, this.y);
    const goalId = pick(target.x, target.y);
    if (!startId || !goalId) return [];
    return this.findPathAStar(startId, goalId, graph);
  }

  getClosestNodeId(x, y, nodes) {
    let bestId = null;
    let bestDist = Number.POSITIVE_INFINITY;
    nodes.forEach((node) => {
      const dx = node.x - x;
      const dy = node.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        bestId = node.id;
      }
    });
    return bestId;
  }

  findPathAStar(startId, goalId, graph) {
    if (startId === goalId) return [startId];
    const openSet = [startId];
    const cameFrom = {};
    const gScore = {};
    const fScore = {};
    graph.nodes.forEach((node) => {
      gScore[node.id] = Number.POSITIVE_INFINITY;
      fScore[node.id] = Number.POSITIVE_INFINITY;
    });
    gScore[startId] = 0;
    fScore[startId] = this.heuristicCost(startId, goalId, graph);

    while (openSet.length) {
      let current = openSet[0];
      let currentIdx = 0;
      for (let i = 1; i < openSet.length; i += 1) {
        if (fScore[openSet[i]] < fScore[current]) {
          current = openSet[i];
          currentIdx = i;
        }
      }
      if (current === goalId) {
        const path = [current];
        while (cameFrom[current]) {
          current = cameFrom[current];
          path.unshift(current);
        }
        return path;
      }
      openSet.splice(currentIdx, 1);
      const neighbors = graph.edges[current] || [];
      neighbors.forEach((neighbor) => {
        const tentative = gScore[current] + this.heuristicCost(current, neighbor, graph);
        if (tentative < gScore[neighbor]) {
          cameFrom[neighbor] = current;
          gScore[neighbor] = tentative;
          fScore[neighbor] = tentative + this.heuristicCost(neighbor, goalId, graph);
          if (!openSet.includes(neighbor)) {
            openSet.push(neighbor);
          }
        }
      });
    }
    return [startId];
  }

  heuristicCost(fromId, toId, graph) {
    const from = graph.nodes.find((node) => node.id === fromId);
    const to = graph.nodes.find((node) => node.id === toId);
    if (!from || !to) return 9999;
    return Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y);
  }

  getAttackProfile(attackId) {
    return BOSS_ATTACK_PROFILES[attackId] || { global: false, maxDist: 320, maxVGap: 100 };
  }

  isAttackInRange(attackId, distance, verticalGap) {
    const p = this.getAttackProfile(attackId);
    if (p.global) return true;
    const absV = Math.abs(verticalGap);
    if (p.maxVGap != null && absV > p.maxVGap + 12) return false;
    if (p.maxDist != null && distance > p.maxDist + 25) return false;
    if (p.minDist != null && distance < p.minDist - 8) return false;
    return true;
  }

  adjustAttackScore(entry, distance, verticalGap, time) {
    let mult = 1;
    const p = this.getAttackProfile(entry.id);
    const d = distance;
    const closing = d > 220;
    const veryFar = d > 420;

    if (p.global && p.ranged) {
      if (this.consecutiveGlobalAttacks >= 1) mult *= 0.42;
      if (this.lastAttackId && this.getAttackProfile(this.lastAttackId).global) mult *= 0.5;
      if (closing && !veryFar) mult *= 0.72;
      if (veryFar) mult *= 1.15;
    } else if (!p.global) {
      const gapCloser =
        entry.id.includes("Rush")
        || entry.id.includes("Dash")
        || entry.id.includes("Charge")
        || entry.id.includes("Drive")
        || entry.id === "voidPounce"
        || entry.id === "sovereignScreenDash";
      if (closing && gapCloser) {
        mult *= 1 + Math.min(0.55, Math.max(0, d - 180) * 0.0018);
      }
      if (!closing && d < 160 && (entry.id.includes("Stomp") || entry.id.includes("Nova") || entry.id === "shadowFlurry" || entry.id === "closeBurst" || entry.id === "scytheArc")) {
        mult *= 1.35;
      }
    }

    return Math.max(8, entry.score * mult);
  }

  selectAndExecuteAttack(targets, target, direction, distance, verticalGap, time) {
    const hasGround = this.body.blocked.down;
    const d = distance;
    let scores = [];
    switch (this.definition.id) {
      case "galeSovereign": {
        const rangedBias = this.hasRangedAlive(targets) ? 26 : 0;
        scores = [
          { id: "sovereignScreenDash", category: "special", score: Math.max(46, 54 + (d > 200 ? 22 : 0) + (hasGround ? 8 : 0)) },
          { id: "aetherColumn", category: "basic", score: Math.max(48, 62 + (Math.abs(verticalGap) > 55 ? 16 : 0)) },
          {
            id: "galeSeekerVolley",
            category: "basic",
            score: Math.max(46, 58 + rangedBias * 0.65 + d * 0.028)
          },
          {
            id: "galeWindSphere",
            category: "special",
            score: Math.max(18, 32 + (d > 160 ? 4 : 0) + rangedBias * 0.12)
          },
          { id: "typhoonSlam", category: "special", score: Math.max(50, 64 + (d < 280 ? 20 : 0)) }
        ];
        break;
      }
      case "wraith":
        scores = [
          { id: "wraithBlink", category: "special", score: Math.max(50, 76 + d * 0.05 + (d >= 130 ? 12 : 0)) },
          { id: "voidTendril", category: "special", score: Math.max(48, 70 + d * 0.04 + (Math.abs(verticalGap) > 40 ? 10 : 0)) },
          { id: "scytheArc", category: "basic", score: Math.max(46, 66 + Math.max(0, 200 - d) * 0.08) },
          { id: "spiritVolley", category: "basic", score: Math.max(48, 60 + d * 0.04) },
          { id: "phaseRush", category: "special", score: hasGround ? Math.max(46, 62 + d * 0.045 + (d >= 150 ? 12 : 0)) : 42 }
        ];
        break;
      case "pyromancer":
        scores = [
          { id: "flameWarp", category: "special", score: Math.max(50, 74 + d * 0.05 + (d >= 160 ? 14 : 0)) },
          {
            id: "infernoRiftPortal",
            category: "special",
            score: Math.max(48, 70 + d * 0.042 + (d >= 130 ? 12 : 0))
          },
          { id: "emberVolley", category: "basic", score: Math.max(48, 66 + d * 0.045) },
          { id: "fireNova", category: "basic", score: Math.max(46, 68 + Math.max(0, 170 - d) * 0.09) },
          { id: "cinderRush", category: "special", score: hasGround ? Math.max(44, 60 + d * 0.04 + (d >= 150 ? 12 : 0)) : 40 }
        ];
        break;
      case "hollowPair": {
        const far = d > 185;
        const twinSpan = this.twinSibling?.active
          ? Math.abs((this.twinSibling.x || 0) - (this.x || 0))
          : 0;
        scores = [
          {
            id: "hollowSoulLink",
            category: "special",
            score:
              this.twinSibling?.active
                ? Math.max(54, 66 + Math.min(90, twinSpan * 0.12) + (far ? 8 : 4))
                : 0
          },
          {
            id: "hollowImplosion",
            category: "basic",
            score: hasGround ? Math.max(50, 72 + Math.max(0, 190 - d) * 0.11 + (d < 200 ? 14 : 0)) : 38
          },
          {
            id: "hollowGroundSpear",
            category: "basic",
            score: Math.max(48, 66 + d * 0.035 + (d > 120 && d < 340 ? 14 : 0))
          }
        ];
        break;
      }
      case "behemoth":
        scores = [
          { id: "titanCharge", category: "special", score: hasGround ? Math.max(48, 74 + d * 0.05 + (d >= 120 ? 14 : 0)) : 42 },
          { id: "stalkBoulder", category: "special", score: Math.max(50, 68 + Math.max(0, 260 - d) * 0.06) },
          { id: "meteorCall", category: "basic", score: Math.max(40, 58 + d * 0.045) },
          { id: "earthshatter", category: "special", score: hasGround ? Math.max(52, 70 + Math.max(0, 180 - d) * 0.08) : 38 },
          { id: "boulderBarrage", category: "basic", score: Math.max(44, 60 + d * 0.04 + (d >= 200 ? 16 : 0)) }
        ];
        break;
      case "graveWarden":
        scores = [
          { id: "boneVolley", category: "basic", score: Math.max(48, 64 + d * 0.04 + (d > 120 ? 12 : 0)) },
          { id: "graveRise", category: "special", score: Math.max(50, 70 + (d < 300 ? 14 : 0) + (d > 100 ? 8 : 0)) },
          { id: "soulSiphon", category: "special", score: Math.max(44, 66 + Math.max(0, 320 - d) * 0.08) },
          { id: "phantomSwarm", category: "special", score: Math.max(40, 58 + d * 0.035 + (d >= 160 ? 16 : 0)) },
          { id: "deathsToll", category: "special", score: Math.max(46, 62 + d * 0.042 + (d >= 140 ? 10 : 0)) }
        ];
        break;
      default:
        scores = [
          { id: "gapDash", category: "special", score: hasGround ? Math.max(46, 68 + d * 0.055) : 40 },
          { id: "jumpSmash", category: "special", score: hasGround ? Math.max(44, 62 + Math.max(0, verticalGap) * 0.08 + (d > 180 ? 10 : 0)) : 38 },
          { id: "rangedPressure", category: "basic", score: Math.max(46, 54 + d * 0.045) },
          { id: "closeBurst", category: "basic", score: Math.max(48, 66 + Math.max(0, 170 - d) * 0.09) }
        ];
        break;
    }
    let candidates = scores
      .map((entry) => ({ ...entry, score: this.adjustAttackScore(entry, d, verticalGap, time) }))
      .filter((entry) => entry.score > 0 && this.isAttackReady(entry.id, time) && this.isAttackInRange(entry.id, d, verticalGap));
    if (this.definition.id === "hollowPair") {
      candidates = candidates.filter((entry) => {
        if (entry.id === "hollowSoulLink") {
          return !!(this.twinSibling && this.twinSibling.active);
        }
        return true;
      });
    }
    if (this.definition.id === "behemoth" && candidates.length) {
      const starved = time - (this.lastNearPlayerTime || 0) > 3200;
      const far = d > 300;
      const groundedOk = targets.some((p) => p.isAlive && p.body && p.body.blocked.down);
      candidates = candidates.filter((e) => {
        if (e.id === "meteorCall") return far || starved;
        if (e.id === "stalkBoulder") return groundedOk;
        return true;
      });
    }
    if (!candidates.length) {
      const groundedOk = targets.some((p) => p.isAlive && p.body && p.body.blocked.down);
      candidates = scores
        .map((entry) => ({ ...entry, score: this.adjustAttackScore(entry, d, verticalGap, time) }))
        .filter((entry) => {
          const prof = this.getAttackProfile(entry.id);
          if (entry.id === "stalkBoulder" && !groundedOk) return false;
          return entry.score > 0 && this.isAttackReady(entry.id, time) && prof.global;
        });
    }
    if (!candidates.length) {
      const groundedOkLoose = targets.some((p) => p.isAlive && p.body && p.body.blocked.down);
      candidates = scores
        .map((entry) => ({ ...entry, score: Math.max(12, entry.score * 0.72) }))
        .filter((entry) => {
          if (entry.id === "stalkBoulder" && !groundedOkLoose) return false;
          return entry.score > 0 && this.isAttackReady(entry.id, time);
        });
    }
    if (this.definition.id === "galeSovereign") {
      candidates = candidates.filter((e) => e.id !== "galeWindSphere" || this.canPickGaleWindSphere(time));
    }
    candidates = candidates.sort((a, b) => b.score - a.score);
    const picked = this.pickAttackCandidate(candidates);
    if (!picked) return;
    this.beginBossAttackEpoch();

    switch (picked.id) {
      case "sovereignScreenDash":
        this.executeSovereignScreenDash(targets, direction, time);
        break;
      case "aetherColumn":
        this.executeAetherColumn(targets, time);
        break;
      case "galeSeekerVolley":
        this.executeGaleSeekerVolley(targets, direction, time);
        break;
      case "galeWindSphere":
        this.executeGaleWindSphere(targets, target, direction, time);
        break;
      case "typhoonSlam":
        this.executeTyphoonSlam(targets, time);
        break;
      case "wraithBlink":
        this.executeWraithBlink(targets, target, time);
        break;
      case "scytheArc":
        this.executeScytheArc(targets, direction, time);
        break;
      case "spiritVolley":
        this.executeSpiritVolley(target, direction, time);
        break;
      case "phaseRush":
        if (this.definition.id === "wraith") {
          this.executeWraithPhaseRush(targets, direction, time);
        } else {
          this.executeGapDash(targets, direction, time);
        }
        break;
      case "voidTendril":
        this.executeWraithVoidTendril(targets, time);
        break;
      case "flameWarp":
        this.executeFlameWarp(targets, target, time);
        break;
      case "infernoRiftPortal":
        this.executeInfernoRiftPortal(targets, target, time);
        break;
      case "emberVolley":
        this.executeEmberVolley(target, direction, time);
        break;
      case "fireNova":
        this.executeFireNova(targets, time);
        break;
      case "cinderRush":
        if (this.definition.id === "pyromancer") {
          this.executePyromancerCinderRush(targets, direction, time);
        } else {
          this.executeGapDash(targets, direction, time);
        }
        break;
      case "voidPounce":
        this.executeVoidPounce(targets, target, direction, time);
        break;
      case "shadowFlurry":
        this.executeShadowFlurry(targets, direction, time);
        break;
      case "voidLance":
        this.executeVoidLance(target, direction, time);
        break;
      case "hollowSoulLink":
        this.executeHollowSoulLink(targets, time);
        break;
      case "hollowImplosion":
        this.executeHollowImplosion(targets, time);
        break;
      case "hollowGroundSpear":
        this.executeHollowGroundSpear(targets, target, direction, time);
        break;
      case "riftDash":
        if (this.definition.id === "hollowPair") {
          this.executeStalkerRiftDash(targets, direction, time);
        } else {
          this.executeGapDash(targets, direction, time);
        }
        break;
      case "titanCharge":
        this.executeTitanCharge(targets, target, direction, time);
        break;
      case "meteorCall":
        this.executeMeteorCall(targets, time);
        break;
      case "stalkBoulder":
        this.executeBehemothStalkBoulder(targets, target, time);
        break;
      case "earthshatter":
        this.executeBehemothEarthshatter(targets, time);
        break;
      case "boulderBarrage":
        this.executeBehemothBoulderBarrage(targets, time);
        break;
      case "boneVolley":
        this.executeGraveWardenBoneVolley(targets, target, direction, time);
        break;
      case "graveRise":
        this.executeGraveWardenGraveRise(targets, time);
        break;
      case "soulSiphon":
        this.executeGraveWardenSoulSiphon(targets, target, time);
        break;
      case "phantomSwarm":
        this.executeGraveWardenPhantomSwarm(targets, time);
        break;
      case "deathsToll":
        this.executeGraveWardenDeathsToll(targets, target, direction, time);
        break;
      case "gapDash":
        this.executeGapDash(targets, direction, time);
        break;
      case "jumpSmash":
        this.executeJumpSmash(targets, target, direction, time);
        break;
      case "rangedPressure":
        this.executeRangedPressure(target, direction, time);
        break;
      case "closeBurst":
      default:
        this.executeCloseBurst(targets, direction, time);
        break;
    }
    this.rememberAttack(picked.id);
    this.applyCategoryCooldown(picked.category, time);
  }

  pickAttackCandidate(candidates) {
    if (!candidates.length) return null;
    const adjusted = candidates.map((entry) => {
      let score = entry.score;
      if (entry.id === this.lastAttackId) {
        score *= 0.55;
      }
      if (this.recentAttackIds.includes(entry.id)) {
        score *= 0.82;
      }
      if (!this.recentAttackIds.includes(entry.id)) {
        score += 20;
      }
      score += Phaser.Math.Between(-3, 3);
      return { ...entry, weightedScore: Math.max(1, score) };
    }).sort((a, b) => b.weightedScore - a.weightedScore);

    const pool = adjusted.slice(0, Math.min(5, adjusted.length));
    const total = pool.reduce((sum, entry) => sum + entry.weightedScore, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < pool.length; i += 1) {
      roll -= pool[i].weightedScore;
      if (roll <= 0) return pool[i];
    }
    return pool[0];
  }

  rememberAttack(id) {
    const p = BOSS_ATTACK_PROFILES[id];
    if (p?.global && p?.ranged) {
      this.consecutiveGlobalAttacks += 1;
    } else {
      this.consecutiveGlobalAttacks = 0;
    }
    this.lastAttackId = id;
    this.recentAttackIds.push(id);
    while (this.recentAttackIds.length > 4) {
      this.recentAttackIds.shift();
    }
  }

  applyCategoryCooldown(category, time) {
    if (category === "special") {
      const base = Number.isFinite(this.definition.specialCooldown) ? this.definition.specialCooldown : 3000;
      const cr = this.scene?.difficultyCategoryRecoveryMult ?? 1;
      const specialRecoveryMs = Math.max(600, Math.round(Math.max(1200, base * 0.72) * cr));
      this.nextAnyAttackTime = Math.max(this.nextAnyAttackTime, time + specialRecoveryMs);
    }
  }

  canPickGaleWindSphere(time) {
    const minGap = 12000;
    if (this.lastGaleWindSphereUsedAt == null) return true;
    return time - this.lastGaleWindSphereUsedAt >= minGap;
  }

  isAttackReady(id, time) {
    return !this.attackCooldowns[id] || time >= this.attackCooldowns[id];
  }

  setAttackCooldown(id, time, cooldownMs) {
    const mult = this.scene?.difficultyCooldownMult ?? 1;
    const ms = Math.max(200, Math.round((Number.isFinite(cooldownMs) ? cooldownMs : 1200) * mult));
    this.attackCooldowns[id] = time + ms;
  }

  applyDifficultySpawnTuning(tuning) {
    const sm = this.scene?.difficultySpawnMult ?? 1;
    const out = { ...tuning };
    if (Number.isFinite(out.shotCount)) {
      out.shotCount = Math.max(1, Math.round(out.shotCount * sm));
    }
    if (Number.isFinite(out.hits)) {
      out.hits = Math.max(1, Math.round(out.hits * sm));
    }
    return out;
  }

  getAttackTuning(id, defaults) {
    const attackTuning = this.definition.attackTuning || {};
    const entry = attackTuning[id];
    const base = !entry || typeof entry !== "object" ? { ...defaults } : { ...defaults, ...entry };
    return this.applyDifficultySpawnTuning(base);
  }

  hasRangedAlive(targets) {
    const ranged = (typeof window !== "undefined" && window.RANGED_CHARACTER_IDS) || ["ranger", "medic"];
    return targets.some((p) => p?.definition?.id && ranged.includes(p.definition.id));
  }

  getContactTuning() {
    const defaults = { cooldownMs: 900, minDamage: 4, scale: 0.55 };
    const raw = this.definition.contactTuning;
    if (!raw || typeof raw !== "object") return defaults;
    return {
      cooldownMs: Number.isFinite(raw.cooldownMs) ? raw.cooldownMs : defaults.cooldownMs,
      minDamage: Number.isFinite(raw.minDamage) ? raw.minDamage : defaults.minDamage,
      scale: Number.isFinite(raw.scale) ? raw.scale : defaults.scale
    };
  }

  lockMovement(time, durationMs) {
    this.movementLockUntil = Math.max(this.movementLockUntil, time + durationMs);
    this.setVelocityX(0);
  }

  repositionBoss(x, y) {
    const worldWidth = this.scene?.physics?.world?.bounds?.width || 960;
    const worldH = this.scene?.physics?.world?.bounds?.height || 540;
    const nx = Phaser.Math.Clamp(x, 70, worldWidth - 70);
    const footDelta =
      this.body?.bottom != null && Number.isFinite(this.y) ? this.body.bottom - this.y : (this.body?.height || 68) * 0.5;
    const ny =
      typeof this.scene.snapBossTeleportCenterY === "function"
        ? this.scene.snapBossTeleportCenterY(nx, y, this)
        : Phaser.Math.Clamp(y, 120, 500);
    const clampedY = Phaser.Math.Clamp(ny, 130, worldH - footDelta - 10);
    this.setPosition(nx, clampedY);
    if (this.body && typeof this.body.reset === "function") {
      this.body.reset(nx, clampedY);
    }
    this.setVelocity(0, 0);
  }

  beginBossAttackEpoch() {
    this._bossAttackEpoch = (this._bossAttackEpoch || 0) + 1;
  }

  scheduleBossAttackDelay(delayMs, callback) {
    if (!this.scene?.time) return null;
    const delay = Math.max(0, Number.isFinite(delayMs) ? delayMs : 0);
    const epochAtSchedule = this._bossAttackEpoch;
    return this.scene.time.delayedCall(delay, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      if (this._bossAttackEpoch !== epochAtSchedule) return;
      callback();
    });
  }

  registerInterruptibleTimeEvent(ev) {
    if (!ev || typeof ev.remove !== "function") return;
    if (!this._interruptibleTimeEvents) this._interruptibleTimeEvents = [];
    this._interruptibleTimeEvents.push(ev);
  }

  clearInterruptibleTimeEvents() {
    const list = this._interruptibleTimeEvents || [];
    list.forEach((ev) => {
      try {
        ev.remove();
      } catch (e) {
        /* ignore */
      }
    });
    this._interruptibleTimeEvents = [];
  }

  cancelBossOngoingAttackState() {
    this.clearInterruptibleTimeEvents();
    if (this.galeWindSphereContext && typeof this.endGaleWindSphereAttack === "function") {
      this.endGaleWindSphereAttack();
    }
    if (this.typhoonSlamPending || this.typhoonSlamContext) {
      this.typhoonSlamPending = false;
      this.typhoonSlamWasAirborne = false;
      this.typhoonSlamContext = null;
    }
    this.clearTint();
    if (this.setAlpha) this.setAlpha(1);
    this.setVelocity(0, 0);
    if (this.scene?.time) {
      this.dashLockUntil = this.scene.time.now;
    }
  }

  executeStoneRush(targets, target, direction, time) {
    const tuning = this.getAttackTuning("stoneRush", {
      windupMs: 260,
      flashStopBeforeDashMs: 200,
      width: 230,
      height: 64,
      yOffset: 10,
      damage: 15,
      cooldownMs: 1700,
      dashDurationMs: 300,
      dashSpeed: 560,
      postLockMs: 360
    });
    const d = target.x >= this.x ? 1 : -1;
    const windupRect = this.scene.createRectHitbox(this.x + d * tuning.width * 0.45, this.y + tuning.yOffset, tuning.width, tuning.height);
    this.scene.spawnGolemStoneRushTelegraph(windupRect, tuning.windupMs, tuning.flashStopBeforeDashMs);
    this.setAttackCooldown("stoneRush", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + tuning.windupMs + tuning.postLockMs);
    this.lockMovement(time, tuning.windupMs);
    this.scheduleBossAttackDelay(tuning.windupMs, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      this.dashLockUntil = this.scene.time.now + tuning.dashDurationMs;
      this.setVelocityX(d * tuning.dashSpeed);
      const rushRect = this.scene.createRectHitbox(this.x + d * tuning.width * 0.45, this.y + tuning.yOffset, tuning.width, tuning.height);
      this.scene.playRectAttackVisual(rushRect, this.definition.color, { durationMs: 140, direction: d });
      targets.forEach((player) => {
        if (!player.isAlive) return;
        if (this.scene.rectHitsTarget(rushRect, player)) {
          if (this.hitPlayer(player, tuning.damage, this.definition.color, "melee") > 0) {
          this.scene.spawnImpactEffect(player.x, player.y - 8, this.definition.color, 14);
          }
        }
      });
    });
  }

  executeQuakeStomp(targets, time) {
    const tuning = this.getAttackTuning("quakeStomp", {
      liftMs: 340,
      holdMs: 220,
      radius: 126,
      damage: 14,
      cooldownMs: 1400,
      postLockMs: 260
    });
    const liftMs = tuning.liftMs;
    const holdMs = tuning.holdMs;
    const totalWindup = liftMs + holdMs;
    const hx = this.x;
    const hy = this.y;
    const stompCy = hy + 18;
    const baseRot = this.rotation;
    const circle = this.scene.createCircleHitbox(hx, stompCy, tuning.radius);
    this.scene.spawnWindupCircle(circle, this.definition.color, totalWindup);
    this.setAttackCooldown("quakeStomp", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + totalWindup + tuning.postLockMs);
    this.lockMovement(time, totalWindup);
    this.scene.tweens.add({
      targets: this,
      y: hy - 18,
      rotation: -0.11,
      duration: liftMs,
      ease: "Sine.easeOut"
    });
    this.scheduleBossAttackDelay(totalWindup, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      this.setPosition(hx, hy);
      this.setRotation(baseRot);
      const stomp = this.scene.createCircleHitbox(hx, stompCy, tuning.radius);
      this.scene.playGolemQuakeStompHit(stomp, this.definition.color, { durationMs: 140 });
      targets.forEach((player) => {
        if (!player.isAlive) return;
        if (this.scene.circleHitsTarget(stomp, player)) {
          if (this.hitPlayer(player, tuning.damage, this.definition.color, "melee") > 0) {
          this.scene.spawnImpactEffect(player.x, player.y - 10, this.definition.color, 14);
          }
        }
      });
    });
  }

  executeRockSpikes(targets, target, time) {
    const tuning = this.getAttackTuning("rockSpikes", {
      windupMs: 240,
      width: 210,
      height: 30,
      damage: 12,
      dropDurationMs: 150,
      cooldownMs: 1450,
      postLockMs: 220
    });
    const dropMs = tuning.dropDurationMs || 150;
    const footY = target.body ? target.body.y + target.body.height : target.y + 28;
    const aimX = target.x;
    const slamAt = tuning.windupMs + dropMs;
    const rect = this.scene.createRectHitbox(aimX, footY, tuning.width, tuning.height);
    this.scene.spawnWindupRect(rect, this.definition.color, slamAt);
    this.scene.spawnGolemRockSpikeMeteor(aimX, footY, tuning.windupMs, dropMs);
    this.setAttackCooldown("rockSpikes", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + slamAt + tuning.postLockMs);
    this.lockMovement(time, slamAt);
    this.scheduleBossAttackDelay(slamAt, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      const hitRect = this.scene.createRectHitbox(aimX, footY, tuning.width, tuning.height);
      this.scene.playRectAttackVisual(hitRect, this.definition.color, { durationMs: 120 });
      targets.forEach((player) => {
        if (!player.isAlive) return;
        if (this.scene.rectHitsTarget(hitRect, player)) {
          if (this.hitPlayer(player, tuning.damage, this.definition.color, "melee") > 0) {
          this.scene.spawnImpactEffect(player.x, player.y - 8, this.definition.color, 15);
          }
        }
      });
    });
  }

  executeGolemBoulderDrive(targets, direction, time) {
    const tuning = this.getAttackTuning("boulderDrive", {
      windupMs: 780,
      width: 250,
      height: 70,
      yOffset: 10,
      damage: 30,
      dashSpeed: 900,
      dashDurationMs: 300,
      hopVelocityY: -400,
      hopMoveX: 200,
      divePopMs: 120,
      cooldownMs: 1750,
      postLockMs: 420
    });
    const d = direction < 0 ? -1 : 1;
    const width = tuning.width;
    const windupMs = tuning.windupMs;
    const windupRect = this.scene.createRectHitbox(this.x + d * width * 0.45, this.y + tuning.yOffset, width, tuning.height);
    this.scene.spawnWindupRect(windupRect, this.definition.color, windupMs);
    this.scene.spawnGolemBoulderDiveTelegraph(this.x, this.y + tuning.yOffset, d, width, windupMs);
    this.setAttackCooldown("boulderDrive", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + windupMs + tuning.postLockMs);
    this.lockMovement(time, windupMs);
    this.scheduleBossAttackDelay(windupMs, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      const pop = tuning.divePopMs || 120;
      this.dashLockUntil = this.scene.time.now + tuning.dashDurationMs + pop + 80;
      this.setVelocityY(tuning.hopVelocityY);
      this.setVelocityX(d * (tuning.hopMoveX || 200));
      this.scene.spawnImpactEffect(this.x, this.y + 12, 0x7a7e88, 18);
      this.scheduleBossAttackDelay(pop, () => {
        if (!this.active || this.scene.gameState !== "battle") return;
        this.setVelocityY(Math.min(120, this.body?.velocity?.y * 0.35 || 40));
        this.setVelocityX(d * tuning.dashSpeed);
        const dashRect = this.scene.createRectHitbox(this.x + d * width * 0.45, this.y + tuning.yOffset, width, tuning.height);
        this.scene.playRectAttackVisual(dashRect, this.definition.color, {
          durationMs: 160,
          direction: d,
          angle: d > 0 ? 8 : -8
        });
        this.scene.spawnDashStreak(this.x, this.y + tuning.yOffset - 6, d, width * 0.85, 0x9a9ea8, 200);
        targets.forEach((player) => {
          if (!player.isAlive) return;
          if (this.scene.rectHitsTarget(dashRect, player)) {
            if (this.hitPlayer(player, tuning.damage, this.definition.color, "melee") > 0) {
            this.scene.spawnImpactEffect(player.x, player.y - 10, this.definition.color, 16);
            }
          }
        });
      });
    });
  }

  executeWraithBlink(targets, target, time) {
    const tuning = this.getAttackTuning("wraithBlink", {
      windupMs: 220, radius: 96, damage: 14, cooldownMs: 1800, postLockMs: 260, offsetX: 34, dodgeWindowMs: 500
    });
    const ix = this.x;
    const iy = this.y + 10;
    this.scene.spawnWraithImplosionLines(ix, iy, tuning.radius, tuning.windupMs);
    this.scene.spawnWindupCircle(this.scene.createCircleHitbox(ix, iy, tuning.radius), this.definition.color, tuning.windupMs);
    let pulse = 0;
    const tintEv = this.scene.time.addEvent({
      delay: 70,
      loop: true,
      callback: () => {
        pulse += 1;
        this.setTint(pulse % 2 === 0 ? 0xb388ff : 0x6644aa);
      }
    });
    this.registerInterruptibleTimeEvent(tintEv);
    this.setAttackCooldown("wraithBlink", time, tuning.cooldownMs);
    const totalLockMs = tuning.windupMs + tuning.dodgeWindowMs;
    this.attackLockUntil = Math.max(this.attackLockUntil, time + totalLockMs + tuning.postLockMs);
    this.lockMovement(time, totalLockMs);
    this.scheduleBossAttackDelay(Math.max(40, tuning.windupMs - 90), () => {
      if (this.active) this.setAlpha(0.25);
    });
    this.scheduleBossAttackDelay(tuning.windupMs, () => {
      tintEv.remove();
      if (!this.active || this.scene.gameState !== "battle") return;
      const dir = target.x >= this.x ? 1 : -1;
      const lockedX = target.x - dir * tuning.offsetX;
      const lockedY = target.y;
      const destinationPreview = this.scene.createCircleHitbox(lockedX, lockedY + 10, tuning.radius);
      this.scene.spawnWindupCircle(destinationPreview, this.definition.color, tuning.dodgeWindowMs);
      this.scene.spawnWraithGroundPortal(lockedX, lockedY + 12, tuning.radius * 0.5, tuning.dodgeWindowMs);
      this.scheduleBossAttackDelay(tuning.dodgeWindowMs, () => {
        if (!this.active || this.scene.gameState !== "battle") return;
        this.repositionBoss(lockedX, lockedY);
        this.clearTint();
        this.setAlpha(1);
        const burst = this.scene.createCircleHitbox(this.x, this.y + 10, tuning.radius);
        this.scene.playCircleAttackVisual(burst, this.definition.color, { durationMs: 120 });
        targets.forEach((player) => {
          if (!player.isAlive) return;
          if (this.scene.circleHitsTarget(burst, player)) {
            if (this.hitPlayer(player, tuning.damage, this.definition.color, "melee") > 0) {
            this.scene.spawnImpactEffect(player.x, player.y - 8, this.definition.color, 13);
            }
          }
        });
      });
    });
  }

  executeScytheArc(targets, direction, time) {
    const tuning = this.getAttackTuning("scytheArc", {
      holdMs: 320,
      sweepMs: 220,
      radius: 120,
      spreadDeg: 130,
      damage: 16,
      cooldownMs: 1180,
      postLockMs: 260
    });
    if (this.definition.id === "wraith") {
      const hold = tuning.holdMs ?? 320;
      const sweep = tuning.sweepMs ?? 220;
      if (typeof this.scene.spawnWraithScytheHoldAbove === "function") {
        this.scene.spawnWraithScytheHoldAbove(this, direction, hold, tuning.radius, this.definition.color);
      }
      this.setAttackCooldown("scytheArc", time, tuning.cooldownMs);
      const total = hold + sweep;
      this.attackLockUntil = Math.max(this.attackLockUntil, time + total + (tuning.postLockMs || 260));
      this.lockMovement(time, total);
      this.scheduleBossAttackDelay(hold, () => {
        if (!this.active || this.scene.gameState !== "battle") return;
        if (typeof this.scene.playWraithScytheSlamSweep === "function") {
          this.scene.playWraithScytheSlamSweep(
            this.x,
            this.y + 8,
            direction,
            tuning.radius,
            tuning.spreadDeg,
            sweep,
            this.definition.color
          );
        } else {
          this.scene.playWraithScytheArcSweep(this.x, this.y + 8, direction, tuning.radius, tuning.spreadDeg, sweep);
        }
      });
      this.scheduleBossAttackDelay(hold + sweep * 0.82, () => {
        if (!this.active || this.scene.gameState !== "battle") return;
        this.scene.playFanAttackVisual(this.x, this.y + 8, direction, tuning.radius, tuning.spreadDeg, this.definition.color, 110);
        targets.forEach((player) => {
          if (!player.isAlive) return;
          if (this.scene.fanHitsTarget(this.x, this.y + 8, direction, tuning.radius, tuning.spreadDeg, player)) {
            if (this.hitPlayer(player, tuning.damage, this.definition.color, "melee") > 0) {
              this.scene.spawnImpactEffect(player.x, player.y - 8, this.definition.color, 12);
            }
          }
        });
      });
      return;
    }
    this.scene.spawnWindupFan(this.x, this.y + 8, direction, tuning.radius, tuning.spreadDeg, this.definition.color, 320);
    this.setAttackCooldown("scytheArc", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + 320 + (tuning.postLockMs || 220));
    this.lockMovement(time, 320);
    this.scheduleBossAttackDelay(320, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      this.scene.playFanAttackVisual(this.x, this.y + 8, direction, tuning.radius, tuning.spreadDeg, this.definition.color, 110);
      targets.forEach((player) => {
        if (!player.isAlive) return;
        if (this.scene.fanHitsTarget(this.x, this.y + 8, direction, tuning.radius, tuning.spreadDeg, player)) {
          if (this.hitPlayer(player, tuning.damage, this.definition.color, "melee") > 0) {
            this.scene.spawnImpactEffect(player.x, player.y - 8, this.definition.color, 12);
          }
        }
      });
    });
  }

  executeWraithVoidTendril(targets, time) {
    const tuning = this.getAttackTuning("voidTendril", {
      windupMs: 420,
      pullDurationMs: 1100,
      reachX: 400,
      reachUp: 280,
      pullStrength: 400,
      upwardBias: 0.38,
      platformGhostMs: 420,
      damageTickMs: 220,
      damagePerTick: 4,
      tendrilHitHalfWidth: 36,
      cooldownMs: 2200,
      postLockMs: 280
    });
    if (typeof this.scene.spawnWraithTendrilWindup === "function") {
      this.scene.spawnWraithTendrilWindup(this, tuning.windupMs, this.definition.color);
    }
    this.setAttackCooldown("voidTendril", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(
      this.attackLockUntil,
      time + tuning.windupMs + tuning.pullDurationMs + (tuning.postLockMs || 280)
    );
    const pullMs = tuning.pullDurationMs || 1100;
    this.lockMovement(time, tuning.windupMs + pullMs);
    this.scheduleBossAttackDelay(tuning.windupMs, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      if (typeof this.scene.startWraithVoidTendrilPull === "function") {
        this.scene.startWraithVoidTendrilPull(this, targets, tuning);
      }
    });
  }

  finishTyphoonSlam(targets, time) {
    const ctx = this.typhoonSlamContext;
    if (!ctx) {
      this.typhoonSlamPending = false;
      this.typhoonSlamWasAirborne = false;
      return;
    }
    this.typhoonSlamPending = false;
    this.typhoonSlamWasAirborne = false;
    this.typhoonSlamContext = null;
    const { damage, postLockMs, knockbackScale } = ctx;
    const worldW = this.scene.physics?.world?.bounds?.width || this.scene.scale?.width || 1200;
    const cy = this.y + 24;
    if (typeof this.scene.spawnTyphoonSlamFullRipple === "function") {
      this.scene.spawnTyphoonSlamFullRipple(this.x, cy, worldW, this.definition.color);
    } else if (typeof this.scene.spawnGaleRippleFastSlamBurst === "function") {
      this.scene.spawnGaleRippleFastSlamBurst(this.x, this.y + 32, worldW, this.definition.color);
    }
    const hitRect = this.scene.createRectHitbox(worldW * 0.5, cy, worldW, 88);
    const kb = knockbackScale || 400;
    targets.forEach((player) => {
      if (!player.isAlive) return;
      if (this.scene.rectHitsTarget(hitRect, player)) {
        const dx = player.x - this.x;
        const kbx = Phaser.Math.Clamp(dx * 0.35, -kb, kb);
        if (
          this.hitPlayer(player, damage, this.definition.color, "melee", {
            bossKnockbackX: kbx
          }) > 0
        ) {
          this.scene.spawnImpactEffect(player.x, player.y - 8, this.definition.color, 16);
        }
      }
    });
    this.attackLockUntil = Math.max(this.attackLockUntil, time + (postLockMs || 360));
  }

  executeSovereignScreenDash(targets, direction, time) {
    const tuning = this.getAttackTuning("sovereignScreenDash", {
      windupMs: 520,
      width: 130,
      height: 64,
      yOffset: 8,
      dashSpeed: 1480,
      dashDurationMs: 480,
      damage: 18,
      hitIntervalMs: 72,
      cooldownMs: 1680,
      postLockMs: 340,
      rippleReach: 500
    });
    const d = direction < 0 ? -1 : 1;
    if (typeof this.scene.spawnSquallDirectionalConvergeRipples === "function") {
      this.scene.spawnSquallDirectionalConvergeRipples(
        this.x,
        this.y + tuning.yOffset,
        d,
        this.definition.color,
        tuning.windupMs,
        tuning.rippleReach || 500
      );
    }
    this.setAttackCooldown("sovereignScreenDash", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + tuning.windupMs + tuning.postLockMs);
    this.lockMovement(time, tuning.windupMs);
    const dashMs = tuning.dashDurationMs || 360;
    const hitEvery = tuning.hitIntervalMs || 72;
    this.scheduleBossAttackDelay(tuning.windupMs, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      this.dashLockUntil = this.scene.time.now + dashMs + 120;
      this.setVelocityX(d * tuning.dashSpeed);
      const steps = Math.max(3, Math.ceil(dashMs / hitEvery));
      const hitOnce = new Set();
      for (let s = 0; s < steps; s += 1) {
        this.scheduleBossAttackDelay(s * hitEvery, () => {
          if (!this.active || this.scene.gameState !== "battle") return;
          const rx = this.scene.createRectHitbox(this.x + d * 70, this.y + tuning.yOffset, tuning.width, tuning.height);
          targets.forEach((player) => {
            if (!player.isAlive) return;
            const key = player.label || player;
            if (hitOnce.has(key)) return;
            if (this.scene.rectHitsTarget(rx, player)) {
              hitOnce.add(key);
              if (this.hitPlayer(player, tuning.damage, this.definition.color, "melee") > 0) {
                this.scene.spawnImpactEffect(player.x, player.y - 10, this.definition.color, 13);
              }
            }
          });
        });
      }
      this.scheduleBossAttackDelay(dashMs, () => {
        if (this.active) this.setVelocityX(0);
      });
    });
  }

  executeAetherColumn(targets, time) {
    const tuning = this.getAttackTuning("aetherColumn", {
      windupMs: 1120,
      strikeDelayMs: 55,
      beamWidth: 92,
      beamHeight: 620,
      beamDurationMs: 520,
      tickIntervalMs: 86,
      particleCount: 20,
      damage: 20,
      cooldownMs: 1680,
      postLockMs: 420
    });
    if (typeof this.scene.spawnAetherColumnWindup === "function") {
      this.scene.spawnAetherColumnWindup(this, tuning.windupMs, tuning.particleCount || 14, this.definition.color);
    }
    this.setAttackCooldown("aetherColumn", time, tuning.cooldownMs);
    const beamMs = tuning.beamDurationMs || 520;
    const postMs = tuning.postLockMs || 380;
    this.attackLockUntil = Math.max(this.attackLockUntil, time + tuning.windupMs + beamMs + postMs);
    this.lockMovement(time, tuning.windupMs);
    const delay = tuning.windupMs + (tuning.strikeDelayMs || 40);
    const tickMs = Math.max(56, tuning.tickIntervalMs || 86);
    const totalDmg = Math.max(1, tuning.damage || 20);
    const maxTicks = Math.max(1, Math.ceil(beamMs / tickMs));
    const basePer = Math.floor(totalDmg / maxTicks);
    const remainder = totalDmg - basePer * maxTicks;
    const worldH = this.scene.physics?.world?.bounds?.height || this.scene.scale?.height || 600;
    const beamW = tuning.beamWidth || 52;
    const beamH = Math.min(worldH + 120, tuning.beamHeight || 560);
    const cx = this.x;
    const cy = worldH * 0.5;
    this.scheduleBossAttackDelay(delay, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      if (typeof this.scene.spawnAetherColumnSkyLaser === "function") {
        const groundY = 522;
        this.scene.spawnAetherColumnSkyLaser(cx, cy, beamW, beamH, beamMs, this.definition.color, {
          groundY
        });
      } else if (typeof this.scene.spawnAetherColumnStrikeBurst === "function") {
        this.scene.spawnAetherColumnStrikeBurst(this.x, this.y + 12, 168, this.definition.color);
      }
      const strike = this.scene.createRectHitbox(cx, cy, beamW, beamH);
      for (let i = 0; i < maxTicks; i += 1) {
        const dmg = Math.max(1, basePer + (i < remainder ? 1 : 0));
        this.scheduleBossAttackDelay(i * tickMs, () => {
          if (!this.active || this.scene.gameState !== "battle") return;
          targets.forEach((player) => {
            if (!player.isAlive) return;
            if (this.scene.rectHitsTarget(strike, player)) {
              if (this.hitPlayer(player, dmg, this.definition.color, "melee") > 0) {
                this.scene.spawnImpactEffect(player.x, player.y - 8, this.definition.color, 12);
              }
            }
          });
        });
      }
    });
  }

  executeGaleSeekerVolley(targets, direction, time) {
    const tuning = this.getAttackTuning("galeSeekerVolley", {
      windupMs: 420,
      boltCount: 5,
      spreadDeg: 56,
      boltSpeed: 188,
      retargetDelayMs: 420,
      homingStrength: 0.055,
      projectileDamage: 5,
      seekerMaxLifeMs: 5000,
      snapOffset: 94,
      maxRange: 2400,
      cooldownMs: 1520,
      postLockMs: 280
    });
    if (typeof this.scene.spawnSkybreakFanWindup === "function") {
      this.scene.spawnSkybreakFanWindup(this.x, this.y - 12, direction, this.definition.color, tuning.windupMs, 22);
    }
    this.setAttackCooldown("galeSeekerVolley", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + tuning.windupMs + tuning.postLockMs);
    this.lockMovement(time, tuning.windupMs);
    const n = Math.max(3, tuning.boltCount || 5);
    const half = Phaser.Math.DegToRad((tuning.spreadDeg || 56) * 0.5);
    const baseAngle = direction > 0 ? 0 : Math.PI;
    const spd = tuning.boltSpeed || 188;
    const rt = tuning.retargetDelayMs || 420;
    this.scheduleBossAttackDelay(tuning.windupMs, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      for (let i = 0; i < n; i += 1) {
        const t = n <= 1 ? 0 : (i / (n - 1)) * 2 - 1;
        const ang = baseAngle + t * half;
        const vx = Math.cos(ang) * spd;
        const vy = Math.sin(ang) * spd * 0.42;
        const mag = Math.hypot(vx, vy) || spd;
        this.scene.spawnBossProjectile(this.x + direction * 22, this.y - 12, direction, tuning.projectileDamage, {
          textureKey: this.scene.textures.exists("proj_gale_seeker") ? "proj_gale_seeker" : "proj_gale_air",
          useAbsoluteVelocity: true,
          velocityX: vx,
          velocityY: vy,
          spawnOffsetX: 0,
          maxRange: tuning.maxRange || 2400,
          ignorePlatforms: true,
          galeSeekerBolt: true,
          galeSeekRetargetAt: this.scene.time.now + rt,
          galeHomingStrength: tuning.homingStrength ?? 0.055,
          galeBaseSpeed: mag,
          galeSeekerMaxLifeMs: tuning.seekerMaxLifeMs ?? 5000,
          galeSeekerSnapOffset: tuning.snapOffset ?? 94,
          skipMuzzleFlash: true,
          noBossTrail: true,
          scaleX: 1.05,
          scaleY: 1.05
        });
      }
    });
  }

  applyGaleWindSphereOrbHits(time, targets) {
    const ctx = this.galeWindSphereContext;
    if (!ctx || !this.scene) return;
    const cx = this.x;
    const cy = this.y - 20;
    const r = ctx.orbRadius ?? 74;
    const tick = ctx.orbTickIntervalMs ?? 200;
    const dmg = ctx.orbContactDamage ?? 8;
    const kb = ctx.orbKnockback ?? 400;
    const pad = 26;
    if (!ctx.lastOrbHit) ctx.lastOrbHit = {};
    const last = ctx.lastOrbHit;
    targets.forEach((player) => {
      if (!player.isAlive || !player.body) return;
      const px = player.x;
      const py = player.y - 14;
      const dist = Math.hypot(px - cx, py - cy);
      if (dist > r + pad) return;
      const key = player.label || player;
      if ((last[key] || 0) + tick > time) return;
      last[key] = time;
      const dx = px - cx;
      const sign = dx >= 0 ? 1 : -1;
      const kbx = sign * Phaser.Math.Clamp(Math.abs(dx) * 0.45 + kb * 0.35, kb * 0.5, kb);
      if (
        this.hitPlayer(player, dmg, this.definition.color, "melee", {
          bossKnockbackX: kbx
        }) > 0
      ) {
        this.scene.spawnImpactEffect(player.x, player.y - 8, this.definition.color, 14);
      }
    });
  }

  endGaleWindSphereAttack() {
    if (this.body) {
      this.body.setAllowGravity(this._galeWindPrevGravity !== false);
    }
    this.galeWindSphereEndAt = 0;
    this.galeWindSphereContext = null;
    if (typeof this.scene?.detachGaleWindSphereVfx === "function") {
      this.scene.detachGaleWindSphereVfx(this);
    }
  }

  executeGaleWindSphere(targets, target, direction, time) {
    const tuning = this.getAttackTuning("galeWindSphere", {
      windupMs: 520,
      durationMs: 3800,
      portalY: 128,
      teleportMarginX: 72,
      orbRadius: 125,
      orbContactDamage: 8,
      orbTickIntervalMs: 200,
      orbKnockback: 400,
      projectileCount: 16,
      projectileIntervalMs: 250,
      projectileSpeed: 235,
      projectileDamage: 8,
      returnDamageToBoss: 8,
      projectileMaxLifeMs: 4200,
      cooldownMs: 7800,
      postLockMs: 360
    });
    this.lastGaleWindSphereUsedAt = time;
    const scene = this.scene;
    const bounds = scene.physics?.world?.bounds;
    const worldW = bounds?.width || scene.scale?.width || 1200;
    const worldH = bounds?.height || scene.scale?.height || 540;
    const portalY = Number.isFinite(tuning.portalY) ? tuning.portalY : 128;
    const margin = Number.isFinite(tuning.teleportMarginX) ? tuning.teleportMarginX : 72;
    const duration = tuning.durationMs ?? 3800;
    const windup = tuning.windupMs ?? 520;

    if (typeof scene.spawnGaleWindSphereWindup === "function") {
      scene.spawnGaleWindSphereWindup(this, windup, this.definition.color);
    }
    this.setAttackCooldown("galeWindSphere", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + windup + duration + (tuning.postLockMs ?? 360));
    this.lockMovement(time, windup);

    this.scheduleBossAttackDelay(windup, () => {
      if (!this.active || scene.gameState !== "battle") return;
      const nx0 = margin;
      const nx1 = worldW - margin;
      const tx = nx1 <= nx0 ? worldW * 0.5 : Phaser.Math.Between(nx0, nx1);
      const footDelta =
        this.body?.bottom != null && Number.isFinite(this.y)
          ? this.body.bottom - this.y
          : ((this.body?.height || 68) * 0.5);
      const ty = Phaser.Math.Clamp(portalY, 110, worldH - footDelta - 10);
      this._galeWindPrevGravity = this.body ? this.body.allowGravity : true;
      if (this.body) this.body.setAllowGravity(false);
      this.setPosition(tx, ty);
      if (this.body && typeof this.body.reset === "function") {
        this.body.reset(tx, ty);
      }
      this.setVelocity(0, 0);
      const endAt = scene.time.now + duration;
      this.galeWindSphereEndAt = endAt;
      this.galeWindSphereContext = {
        orbRadius: tuning.orbRadius ?? 74,
        orbContactDamage: tuning.orbContactDamage ?? 8,
        orbTickIntervalMs: tuning.orbTickIntervalMs ?? 200,
        orbKnockback: tuning.orbKnockback ?? 400,
        lastOrbHit: {}
      };
      if (typeof scene.attachGaleWindSphereVfx === "function") {
        scene.attachGaleWindSphereVfx(this, duration, tuning.orbRadius ?? 74, this.definition.color);
      }
      const n = Math.max(4, tuning.projectileCount ?? 12);
      const intv = Math.max(120, tuning.projectileIntervalMs ?? 270);
      const pd = tuning.projectileDamage ?? 7;
      const spd = tuning.projectileSpeed ?? 235;
      const retDmg = tuning.returnDamageToBoss ?? 5;
      const maxLife = tuning.projectileMaxLifeMs ?? 4200;
      for (let i = 0; i < n; i += 1) {
        this.scheduleBossAttackDelay(i * intv, () => {
          if (!this.active || scene.gameState !== "battle") return;
          if (!this.galeWindSphereContext || scene.time.now >= this.galeWindSphereEndAt) return;
          const tgs = scene.players?.filter((p) => p.isAlive) || targets.filter((p) => p.isAlive);
          const tgt = tgs.length ? tgs[Math.floor(Math.random() * tgs.length)] : null;
          const ax = tgt?.x ?? this.x;
          const ay = (tgt?.y ?? this.y) - 14;
          const ang =
            Math.atan2(ay - (this.y - 14), ax - this.x) + Phaser.Math.FloatBetween(-0.4, 0.4);
          const vx = Math.cos(ang) * spd;
          const vy = Math.sin(ang) * spd;
          const mag = Math.hypot(vx, vy) || spd;
          scene.spawnBossProjectile(this.x, this.y - 14, direction, pd, {
            textureKey: scene.textures.exists("proj_gale_air") ? "proj_gale_air" : "projectile_boss",
            useAbsoluteVelocity: true,
            velocityX: vx,
            velocityY: vy,
            maxRange: 2400,
            ignorePlatforms: true,
            galeWindSalvoBolt: true,
            galeWindSalvoReturnable: true,
            galeWindSalvoReturnDamage: retDmg,
            galeBaseSpeed: mag,
            galeWindSalvoSpawnAt: scene.time.now,
            galeWindSalvoMaxLifeMs: maxLife,
            skipMuzzleFlash: true,
            noBossTrail: false,
            effectColor: this.definition.color,
            scaleX: 1.02,
            scaleY: 1.02
          });
        });
      }
      this.scheduleBossAttackDelay(duration, () => {
        if (!this.active || scene.gameState !== "battle") return;
        this.endGaleWindSphereAttack();
      });
    });
  }

  executeTyphoonSlam(targets, time) {
    const tuning = this.getAttackTuning("typhoonSlam", {
      windupMs: 560,
      glowMs: 420,
      jumpVelocityY: -520,
      damage: 16,
      knockbackScale: 420,
      cooldownMs: 2280,
      postLockMs: 420
    });
    if (typeof this.scene.spawnTyphoonSlamChargeGlow === "function") {
      this.scene.spawnTyphoonSlamChargeGlow(this, tuning.windupMs, tuning.glowMs || 420, this.definition.color);
    }
    this.setAttackCooldown("typhoonSlam", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + tuning.windupMs + tuning.postLockMs + 600);
    this.lockMovement(time, tuning.windupMs + 720);
    this.typhoonSlamContext = {
      damage: tuning.damage,
      postLockMs: tuning.postLockMs,
      knockbackScale: tuning.knockbackScale || 420
    };
    this.typhoonSlamWasAirborne = false;
    this.scheduleBossAttackDelay(tuning.windupMs, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      this.typhoonSlamPending = true;
      this.setVelocityX(0);
      this.setVelocityY(tuning.jumpVelocityY || -520);
      if (typeof this.scene.spawnTyphoonSlamJumpBurst === "function") {
        this.scene.spawnTyphoonSlamJumpBurst(this, this.definition.color);
      }
    });
    this.scheduleBossAttackDelay(tuning.windupMs + 2800, () => {
      if (!this.active || this.scene.gameState !== "battle" || !this.typhoonSlamPending) return;
      this.finishTyphoonSlam(targets, this.scene.time.now);
    });
  }

  executeSpiritVolley(target, direction, time) {
    const tuning = this.getAttackTuning("spiritVolley", {
      windupMs: 210, width: 210, height: 34, xOffset: 110, yOffset: -14, cooldownMs: 1300, postLockMs: 220,
      shotCount: 3, shotIntervalMs: 70, projectileDamage: 11, projectileSpeedX: 300
    });
    const rect = this.scene.createRectHitbox(this.x + direction * tuning.xOffset, this.y + tuning.yOffset, tuning.width, tuning.height);
    this.scene.spawnWindupRect(rect, this.definition.color, tuning.windupMs);
    this.setAttackCooldown("spiritVolley", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + tuning.windupMs + tuning.postLockMs);
    this.lockMovement(time, tuning.windupMs);
    const wraithShot = this.definition.id === "wraith";
    for (let i = 0; i < tuning.shotCount; i += 1) {
      this.scheduleBossAttackDelay(tuning.windupMs + i * tuning.shotIntervalMs, () => {
        if (!this.active || this.scene.gameState !== "battle") return;
        const dy = Phaser.Math.Clamp(target.y - this.y, -130, 130) * 0.18;
        this.scene.spawnBossProjectile(this.x, this.y - 14 + i * 10, direction, tuning.projectileDamage, {
          speedX: tuning.projectileSpeedX + i * 12,
          velocityY: dy,
          maxRange: 290,
          effectColor: this.definition.color,
          textureKey: wraithShot ? "proj_wraith_ghost" : undefined,
          skipMuzzleFlash: wraithShot,
          alpha: wraithShot ? 0.92 : undefined
        });
      });
    }
  }

  executeWraithPhaseRush(targets, direction, time) {
    const tuning = this.getAttackTuning("phaseRush", {
      windupMs: 700,
      flashStopBeforeDashMs: 220,
      width: 230,
      height: 58,
      yOffset: 8,
      damage: 22,
      dashSpeed: 980,
      dashDurationMs: 260,
      cooldownMs: 1550,
      postLockMs: 380
    });
    const d = direction < 0 ? -1 : 1;
    const width = tuning.width;
    const windupMs = tuning.windupMs;
    const windupRect = this.scene.createRectHitbox(this.x + d * width * 0.45, this.y + tuning.yOffset, width, tuning.height);
    this.scene.spawnWraithPhaseRushTelegraph(windupRect, windupMs, tuning.flashStopBeforeDashMs);
    let charge = 0;
    const glowEv = this.scene.time.addEvent({
      delay: 85,
      loop: true,
      callback: () => {
        charge += 1;
        this.setTint(charge % 2 === 0 ? 0xaa77ff : 0x7744cc);
      }
    });
    this.registerInterruptibleTimeEvent(glowEv);
    this.setAttackCooldown("phaseRush", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + windupMs + tuning.postLockMs);
    this.lockMovement(time, windupMs);
    this.scheduleBossAttackDelay(windupMs, () => {
      glowEv.remove();
      this.clearTint();
      if (!this.active || this.scene.gameState !== "battle") return;
      this.dashLockUntil = this.scene.time.now + tuning.dashDurationMs;
      this.setVelocityX(direction * tuning.dashSpeed);
      const dashRect = this.scene.createRectHitbox(this.x + d * width * 0.45, this.y + tuning.yOffset, width, tuning.height);
      this.scene.playRectAttackVisual(dashRect, this.definition.color, {
        durationMs: 130,
        direction: d,
        angle: d > 0 ? 6 : -6
      });
      this.scene.spawnDashStreak(this.x, this.y + tuning.yOffset - 4, d, width * 0.82, 0xb388ff, 190);
      targets.forEach((player) => {
        if (!player.isAlive) return;
        if (this.scene.rectHitsTarget(dashRect, player)) {
          if (this.hitPlayer(player, tuning.damage, this.definition.color, "melee") > 0) {
          this.scene.spawnImpactEffect(player.x, player.y - 10, this.definition.color, 14);
          }
        }
      });
    });
  }

  executeFlameWarp(targets, target, time) {
    const tuning = this.getAttackTuning("flameWarp", {
      windupMs: 240, radius: 102, damage: 14, cooldownMs: 1800, postLockMs: 280, offsetX: 26, dodgeWindowMs: 500
    });
    const dir = target.x >= this.x ? 1 : -1;
    const lockedX = target.x - dir * tuning.offsetX;
    const lockedY = target.y - 8;
    const destCy = lockedY + 10;
    const telegraphMs = tuning.windupMs + tuning.dodgeWindowMs;
    this.scene.spawnPyromancerWarpEmberMarker(lockedX, destCy, tuning.radius, telegraphMs);
    let pulse = 0;
    const tintEv = this.scene.time.addEvent({
      delay: 78,
      loop: true,
      callback: () => {
        pulse += 1;
        this.setTint(pulse % 2 === 0 ? 0xff3333 : 0xff6633);
      }
    });
    this.registerInterruptibleTimeEvent(tintEv);
    this.setAttackCooldown("flameWarp", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + telegraphMs + tuning.postLockMs);
    this.lockMovement(time, telegraphMs);
    this.scheduleBossAttackDelay(telegraphMs, () => {
      tintEv.remove();
      this.clearTint();
      if (!this.active || this.scene.gameState !== "battle") return;
      this.repositionBoss(lockedX, lockedY);
      const blast = this.scene.createCircleHitbox(this.x, this.y + 10, tuning.radius);
      this.scene.playCircleAttackVisual(blast, this.definition.color, { durationMs: 130 });
      targets.forEach((player) => {
        if (!player.isAlive) return;
        if (this.scene.circleHitsTarget(blast, player)) {
          if (this.hitPlayer(player, tuning.damage, this.definition.color, "melee") > 0) {
          this.scene.spawnImpactEffect(player.x, player.y - 10, this.definition.color, 14);
          }
        }
      });
    });
  }

  executeInfernoRiftPortal(targets, target, time) {
    const tuning = this.getAttackTuning("infernoRiftPortal", {
      windupMs: 620,
      portalY: 128,
      telegraphRadius: 90,
      aimClampMargin: 72,
      durationMs: 5000,
      shotIntervalMs: 115,
      projectileDamage: 9,
      projectileSpeed: 330,
      cooldownMs: 4286,
      postLockMs: 380
    });
    const scene = this.scene;
    const worldW = scene.physics?.world?.bounds?.width || 1080;
    const margin = Number.isFinite(tuning.aimClampMargin) ? tuning.aimClampMargin : 72;
    const aimX = Phaser.Math.Clamp(target.x, margin, worldW - margin);
    const portalY = Number.isFinite(tuning.portalY) ? tuning.portalY : 128;
    const teleR = Number.isFinite(tuning.telegraphRadius) ? tuning.telegraphRadius : 90;
    const windupMs = tuning.windupMs;
    const durationMs = Number.isFinite(tuning.durationMs) ? tuning.durationMs : 5000;
    const shotInterval = Math.max(40, Number.isFinite(tuning.shotIntervalMs) ? tuning.shotIntervalMs : 115);
    const projSpeed = Number.isFinite(tuning.projectileSpeed) ? tuning.projectileSpeed : 330;
    const d = target.x >= aimX ? 1 : -1;
    scene.spawnPyromancerWarpEmberMarker(aimX, portalY + 10, teleR, windupMs);
    this.setAttackCooldown("infernoRiftPortal", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + windupMs + tuning.postLockMs);
    this.lockMovement(time, windupMs);
    this.scheduleBossAttackDelay(windupMs, () => {
      if (!this.active || scene.gameState !== "battle") return;
      scene.spawnPyromancerEmberPortal(aimX, portalY, d, durationMs);
      const endAt = scene.time.now + durationMs;
      let shotEv = null;
      const stopShots = () => {
        if (shotEv) {
          shotEv.remove();
          shotEv = null;
        }
      };
      const fire = () => {
        if (!this.active || scene.gameState !== "battle" || scene.time.now >= endAt) {
          stopShots();
          return;
        }
        const alive = targets.filter((p) => p.isAlive);
        const aim = alive.length ? this.getPriorityTarget(alive) : null;
        const px = aimX + Phaser.Math.Between(-14, 14);
        const py = portalY + Phaser.Math.Between(-6, 6);
        let vx = 0;
        let vy = projSpeed;
        if (aim?.active) {
          const tx = aim.x;
          const ty = aim.y - 12;
          const dx = tx - px;
          const dy = ty - py;
          const len = Math.hypot(dx, dy) || 1;
          vx = (dx / len) * projSpeed;
          vy = (dy / len) * projSpeed;
        }
        scene.spawnBossProjectile(px, py, 1, tuning.projectileDamage, {
          useAbsoluteVelocity: true,
          velocityX: vx,
          velocityY: vy,
          spawnOffsetX: 0,
          maxRange: 960,
          effectColor: this.definition.color,
          textureKey: "proj_rift_bolt",
          skipMuzzleFlash: true,
          scaleX: 1.1,
          scaleY: 1.1,
          projectileTag: "riftBolt"
        });
      };
      fire();
      shotEv = scene.time.addEvent({
        delay: shotInterval,
        loop: true,
        callback: fire
      });
      this.registerInterruptibleTimeEvent(shotEv);
      this.scheduleBossAttackDelay(durationMs + 24, () => stopShots());
    });
  }

  executeEmberVolley(target, direction, time) {
    const tuning = this.getAttackTuning("emberVolley", {
      windupMs: 220, width: 240, height: 36, xOffset: 120, yOffset: -8, cooldownMs: 1250, postLockMs: 220,
      shotCount: 4, shotIntervalMs: 80, projectileDamage: 10
    });
    const rect = this.scene.createRectHitbox(this.x + direction * tuning.xOffset, this.y + tuning.yOffset, tuning.width, tuning.height);
    this.scene.spawnWindupRect(rect, this.definition.color, tuning.windupMs);
    const portalX = this.x + direction * (tuning.xOffset * 0.42);
    const portalY = this.y + tuning.yOffset;
    this.scene.spawnPyromancerEmberPortal(portalX, portalY, direction, tuning.windupMs);
    this.setAttackCooldown("emberVolley", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + tuning.windupMs + tuning.postLockMs);
    this.lockMovement(time, tuning.windupMs);
    for (let i = 0; i < tuning.shotCount; i += 1) {
      this.scheduleBossAttackDelay(tuning.windupMs + i * tuning.shotIntervalMs, () => {
        if (!this.active || this.scene.gameState !== "battle") return;
        const offsetY = -16 + i * 10;
        const dy = Phaser.Math.Clamp(target.y - this.y + offsetY, -140, 140) * 0.2;
        this.scene.spawnBossProjectile(this.x, this.y + offsetY, direction, tuning.projectileDamage, {
          speedX: 315 + i * 14,
          velocityY: dy,
          maxRange: 340,
          effectColor: this.definition.color,
          textureKey: "proj_pyro_ember_rock",
          skipMuzzleFlash: true,
          scaleX: 1.05,
          scaleY: 1.02
        });
      });
    }
  }

  executeFireNova(targets, time) {
    const tuning = this.getAttackTuning("fireNova", {
      windupMs: 220, radius: 96, damage: 13, cooldownMs: 1350, postLockMs: 240
    });
    const circle = this.scene.createCircleHitbox(this.x, this.y + 12, tuning.radius);
    this.scene.spawnWindupCircle(circle, this.definition.color, tuning.windupMs);
    this.setAttackCooldown("fireNova", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + tuning.windupMs + tuning.postLockMs);
    this.lockMovement(time, tuning.windupMs);
    this.scheduleBossAttackDelay(tuning.windupMs, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      const nova = this.scene.createCircleHitbox(this.x, this.y + 12, tuning.radius);
      if (this.scene.isTrueHitboxView()) {
        this.scene.spawnCircleStrikeVisual(nova, this.definition.color, { durationMs: 120 });
      }
      this.scene.spawnPyromancerFireNovaBurst(nova.x, nova.y, nova.radius, this.definition.color);
      targets.forEach((player) => {
        if (!player.isAlive) return;
        if (this.scene.circleHitsTarget(nova, player)) {
          if (this.hitPlayer(player, tuning.damage, this.definition.color, "melee") > 0) {
          this.scene.spawnImpactEffect(player.x, player.y - 8, this.definition.color, 13);
          }
        }
      });
    });
  }

  executePyromancerCinderRush(targets, direction, time) {
    const tuning = this.getAttackTuning("cinderRush", {
      windupMs: 760,
      width: 220,
      height: 56,
      yOffset: 8,
      damage: 22,
      dashSpeed: 560,
      dashDurationMs: 360,
      cooldownMs: 1450,
      postLockMs: 360
    });
    const d = direction < 0 ? -1 : 1;
    const width = tuning.width;
    const windupMs = tuning.windupMs;
    const windupRect = this.scene.createRectHitbox(this.x + d * width * 0.45, this.y + tuning.yOffset, width, tuning.height);
    this.scene.spawnPyromancerCinderTrailTelegraph(windupRect, windupMs);
    this.setAttackCooldown("cinderRush", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + windupMs + tuning.postLockMs);
    this.lockMovement(time, windupMs);
    this.scheduleBossAttackDelay(windupMs, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      this.dashLockUntil = this.scene.time.now + tuning.dashDurationMs;
      this.setVelocityX(direction * tuning.dashSpeed);
      const dashRect = this.scene.createRectHitbox(this.x + d * width * 0.45, this.y + tuning.yOffset, width, tuning.height);
      this.scene.playRectAttackVisual(dashRect, this.definition.color, {
        durationMs: 130,
        direction: d,
        angle: d > 0 ? 5 : -5
      });
      this.scene.spawnDashStreak(this.x, this.y + tuning.yOffset - 4, d, width * 0.88, 0xff6622, 210);
      targets.forEach((player) => {
        if (!player.isAlive) return;
        if (this.scene.rectHitsTarget(dashRect, player)) {
          if (this.hitPlayer(player, tuning.damage, this.definition.color, "melee") > 0) {
          this.scene.spawnImpactEffect(player.x, player.y - 10, this.definition.color, 14);
          }
        }
      });
    });
  }

  executeVoidPounce(targets, target, direction, time) {
    const tuning = this.getAttackTuning("voidPounce", {
      windupMs: 210, radius: 110, damage: 15, cooldownMs: 1650, postLockMs: 280, leapSpeedX: 430, leapSpeedY: -620
    });
    const aimDir = target.x >= this.x ? 1 : -1;
    this.scene.spawnWindupCircle(this.scene.createCircleHitbox(this.x, this.y + 12, 70), this.definition.color, tuning.windupMs);
    this.scene.spawnStalkerGroundClaws(this.x, this.y, aimDir, tuning.windupMs);
    this.setAttackCooldown("voidPounce", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + tuning.windupMs + tuning.postLockMs);
    this.lockMovement(time, tuning.windupMs);
    this.scheduleBossAttackDelay(tuning.windupMs, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      const d = target.x >= this.x ? 1 : -1;
      this.scene.spawnStalkerLeapClawsFollowing(this, d, 380);
      const dx = target.x - this.x;
      const distance = Math.abs(dx);
      const lowCeiling = this.hasLowCeilingAbove(120, 28);
      const maxSpeedX = Number.isFinite(tuning.leapSpeedX) ? Math.abs(tuning.leapSpeedX) : 520;
      const maxUpwardSpeed = Number.isFinite(tuning.leapSpeedY) ? Math.abs(tuning.leapSpeedY) : 700;
      const launchSpeed = Phaser.Math.Clamp(distance * 2.35 + 220, 260, Math.max(300, maxSpeedX + 80));
      let launchAngleDeg = Phaser.Math.Clamp(28 + Math.max(0, this.y - target.y) * 0.08, 24, 56);
      if (lowCeiling) {
        launchAngleDeg = Phaser.Math.Clamp(14 + Math.max(0, this.y - target.y) * 0.03, 12, 24);
      }
      const rad = Phaser.Math.DegToRad(launchAngleDeg);
      let vx = d * Math.cos(rad) * launchSpeed;
      let vy = -Math.sin(rad) * launchSpeed;
      vx = Phaser.Math.Clamp(vx, -maxSpeedX, maxSpeedX);
      vy = Phaser.Math.Clamp(vy, -maxUpwardSpeed, -180);
      if (lowCeiling) {
        vy = Math.max(vy, -280);
        vx = d * Math.max(Math.abs(vx), Math.min(maxSpeedX, 280));
      }
      this.setVelocityY(vy);
      this.setVelocityX(vx);
      this.scheduleBossAttackDelay(90, () => {
        if (!this.active || this.scene.gameState !== "battle" || this.body.blocked.down) return;
        if (this.body.blocked.up) {
          this.setVelocityX(d * Math.max(Math.abs(vx), Math.min(maxSpeedX, 320)));
        }
      });
    });
    this.scheduleBossAttackDelay(tuning.windupMs + 260, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      const burst = this.scene.createCircleHitbox(this.x, this.y + 14, tuning.radius);
      this.scene.playCircleAttackVisual(burst, this.definition.color, { durationMs: 120 });
      targets.forEach((player) => {
        if (!player.isAlive) return;
        if (this.scene.circleHitsTarget(burst, player)) {
          if (this.hitPlayer(player, tuning.damage, this.definition.color, "melee") > 0) {
          this.scene.spawnImpactEffect(player.x, player.y - 9, this.definition.color, 13);
          }
        }
      });
    });
  }

  executeShadowFlurry(targets, direction, time) {
    const tuning = this.getAttackTuning("shadowFlurry", {
      windupMs: 180, radius: 110, spreadDeg: 110, damage: 11, cooldownMs: 1200, postLockMs: 230, hits: 3, hitIntervalMs: 90
    });
    this.scene.spawnWindupFan(this.x, this.y + 8, direction, tuning.radius, tuning.spreadDeg, this.definition.color, tuning.windupMs);
    this.setAttackCooldown("shadowFlurry", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + tuning.windupMs + tuning.postLockMs);
    this.lockMovement(time, tuning.windupMs);
    const hitCount = Math.max(1, tuning.hits || 3);
    for (let i = 0; i < hitCount; i += 1) {
      this.scheduleBossAttackDelay(tuning.windupMs + i * tuning.hitIntervalMs, () => {
        if (!this.active || this.scene.gameState !== "battle") return;
        this.scene.spawnStalkerShadowSpearJab(this.x, this.y + 8, direction, tuning.radius, tuning.spreadDeg, i);
        targets.forEach((player) => {
          if (!player.isAlive) return;
          if (this.scene.fanHitsTarget(this.x, this.y + 8, direction, tuning.radius, tuning.spreadDeg, player)) {
            if (this.hitPlayer(player, tuning.damage, this.definition.color, "melee") > 0) {
            this.scene.spawnImpactEffect(player.x, player.y - 9, this.definition.color, 12);
            }
          }
        });
      });
    }
  }

  executeVoidLance(target, direction, time) {
    const tuning = this.getAttackTuning("voidLance", {
      windupMs: 190, width: 260, height: 30, xOffset: 130, yOffset: -8, cooldownMs: 1200, postLockMs: 200, projectileDamage: 13
    });
    const rect = this.scene.createRectHitbox(this.x + direction * tuning.xOffset, this.y + tuning.yOffset, tuning.width, tuning.height);
    this.scene.spawnWindupRect(rect, this.definition.color, tuning.windupMs);
    this.setAttackCooldown("voidLance", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + tuning.windupMs + tuning.postLockMs);
    this.lockMovement(time, tuning.windupMs);
    this.scheduleBossAttackDelay(tuning.windupMs, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      const dy = Phaser.Math.Clamp(target.y - this.y, -120, 120) * 0.15;
      this.scene.spawnBossProjectile(this.x, this.y - 4, direction, tuning.projectileDamage, {
        speedX: 380,
        velocityY: dy,
        maxRange: 360,
        effectColor: this.definition.color
      });
    });
  }

  /**
   * Hollow Pair: ranged twin only — windup at floater, bolt fires from twin position.
   * Called from BattleScene on its own cadence (leader does not select this attack).
   */
  spawnTwinVoidBoltFromFloater(target, time) {
    const twin = this.twinSibling;
    if (this.definition.id !== "hollowPair" || !twin?.active || !target?.isAlive) return;
    const tuning = this.getAttackTuning("hollowTwinSpear", {
      windupMs: 320,
      width: 210,
      height: 28,
      xOffset: 96,
      yOffset: -10,
      projectileDamage: 16,
      cooldownMs: 1380,
      postLockMs: 90
    });
    const col = this.definition.color;
    const aimDir = target.x >= twin.x ? 1 : -1;
    const rect = this.scene.createRectHitbox(
      twin.x + aimDir * tuning.xOffset,
      twin.y + tuning.yOffset,
      tuning.width,
      tuning.height
    );
    this.scene.spawnWindupRect(rect, col, tuning.windupMs);

    // windup glow at book
    const bookGlow = this.scene.add.circle(twin.x, twin.y - 6, 5, col, 0.4);
    bookGlow.setDepth(18);
    this.scene.tweens.add({
      targets: bookGlow,
      scale: { from: 0.4, to: 1.5 },
      alpha: { from: 0.5, to: 0 },
      duration: tuning.windupMs,
      ease: "Quad.easeOut",
      onComplete: () => bookGlow.destroy()
    });

    this.scheduleBossAttackDelay(tuning.windupMs, () => {
      if (!this.active || !twin?.active || this.scene.gameState !== "battle" || !target.isAlive) return;
      const dy = Phaser.Math.Clamp(target.y - twin.y, -115, 115) * 0.14;
      const dir = target.x >= twin.x ? 1 : -1;
      const spearKey = this.scene.textures?.exists?.("proj_hollow_void_spear")
        ? "proj_hollow_void_spear"
        : "proj_void_arrow";

      // muzzle flash
      const muzzle = this.scene.add.circle(twin.x + dir * 12, twin.y - 4, 8, 0xe8b8ff, 0.65);
      muzzle.setDepth(18);
      this.scene.tweens.add({
        targets: muzzle,
        scale: { from: 0.8, to: 2 },
        alpha: { from: 0.65, to: 0 },
        duration: 140,
        ease: "Quad.easeOut",
        onComplete: () => muzzle.destroy()
      });

      this.scene.spawnBossProjectile(twin.x, twin.y - 4, dir, tuning.projectileDamage, {
        speedX: 395,
        velocityY: dy,
        maxRange: 400,
        effectColor: 0xd8a8ff,
        textureKey: spearKey,
        skipMuzzleFlash: true,
        scaleX: spearKey === "proj_hollow_void_spear" ? 0.88 : 0.56,
        scaleY: spearKey === "proj_hollow_void_spear" ? 0.88 : 0.56,
        alpha: 0.94
      });
    });
  }

  executeHollowImplosion(targets, time) {
    const tuning = this.getAttackTuning("hollowImplosion", {
      windupMs: 560,
      radius: 112,
      damage: 19,
      cooldownMs: 1720,
      postLockMs: 360
    });
    const r = tuning.radius;
    const col = this.definition.color;
    const circle = this.scene.createCircleHitbox(this.x, this.y + 10, r);
    this.scene.spawnWindupCircle(circle, col, tuning.windupMs);
    this.setAttackCooldown("hollowImplosion", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + tuning.windupMs + tuning.postLockMs);
    this.lockMovement(time, tuning.windupMs + 100);

    // windup VFX — swirling void particles converging to center
    const cx = this.x;
    const cy = this.y + 10;
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const dist = r * (0.7 + Math.random() * 0.4);
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist * 0.65;
      const dot = this.scene.add.circle(px, py, 2 + Math.random() * 1.5,
        i % 2 === 0 ? 0xff66cc : col, 0.6);
      dot.setDepth(18);
      this.scene.tweens.add({
        targets: dot,
        x: cx, y: cy,
        alpha: 0, scale: 0.15,
        duration: tuning.windupMs * 0.85,
        delay: i * 22,
        ease: "Cubic.easeIn",
        onComplete: () => dot.destroy()
      });
    }
    // pulsing dark core during windup
    const wCore = this.scene.add.circle(cx, cy, r * 0.15, 0x08010e, 0.5);
    wCore.setDepth(18);
    this.scene.tweens.add({
      targets: wCore,
      scale: { from: 0.3, to: 1.2 },
      alpha: { from: 0.6, to: 0 },
      duration: tuning.windupMs,
      ease: "Quad.easeIn",
      onComplete: () => wCore.destroy()
    });

    this.scheduleBossAttackDelay(tuning.windupMs, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      if (typeof this.scene.spawnHollowBlackHoleImplosion === "function") {
        this.scene.spawnHollowBlackHoleImplosion(this.x, this.y + 10, r, col);
      }
      const pulse = this.scene.createCircleHitbox(this.x, this.y + 10, r * 0.92);
      if (typeof this.scene.spawnAuraPulse === "function") {
        this.scene.spawnAuraPulse(this.x, this.y + 10, 0x1a0828, Math.floor(r * 0.4), 240);
      }
      targets.forEach((player) => {
        if (!player.isAlive) return;
        if (this.scene.circleHitsTarget(pulse, player)) {
          if (this.hitPlayer(player, tuning.damage, col, "melee") > 0) {
            this.scene.spawnImpactEffect(player.x, player.y - 10, col, 18);
          }
        }
      });
    });
  }

  executeHollowGroundSpear(targets, target, direction, time) {
    const tuning = this.getAttackTuning("hollowGroundSpear", {
      windupMs: 360,
      width: 300,
      height: 38,
      xOffset: 150,
      yOffset: -4,
      damage: 21,
      cooldownMs: 1480,
      postLockMs: 260
    });
    const d = direction < 0 ? -1 : 1;
    const col = this.definition.color;
    const rect = this.scene.createRectHitbox(this.x + d * tuning.xOffset, this.y + tuning.yOffset, tuning.width, tuning.height);
    this.scene.spawnWindupRect(rect, col, tuning.windupMs);
    this.setAttackCooldown("hollowGroundSpear", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + tuning.windupMs + tuning.postLockMs);
    this.lockMovement(time, tuning.windupMs);

    // windup — shadow energy gathering at hand
    const handX = this.x + d * 20;
    const handY = this.y - 4;
    for (let i = 0; i < 5; i++) {
      const sp = this.scene.add.circle(
        handX + Phaser.Math.FloatBetween(-14, 14) * d,
        handY + Phaser.Math.FloatBetween(-10, 10),
        2, col, 0.5
      );
      sp.setDepth(18);
      this.scene.tweens.add({
        targets: sp,
        x: handX, y: handY,
        alpha: 0, scale: 0.2,
        duration: tuning.windupMs * 0.7,
        delay: i * 25,
        ease: "Quad.easeIn",
        onComplete: () => sp.destroy()
      });
    }

    this.scheduleBossAttackDelay(tuning.windupMs, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      const hit = this.scene.createRectHitbox(this.x + d * tuning.xOffset, this.y + tuning.yOffset, tuning.width, tuning.height);
      if (typeof this.scene.spawnHollowShadowSpearSweep === "function") {
        this.scene.spawnHollowShadowSpearSweep(hit.x + hit.width * 0.5, hit.y + hit.height * 0.5, hit.width, d, col);
      }
      this.scene.playRectAttackVisual(hit, col, { durationMs: 150, direction: d });
      targets.forEach((player) => {
        if (!player.isAlive) return;
        if (this.scene.rectHitsTarget(hit, player)) {
          if (this.hitPlayer(player, tuning.damage, col, "melee") > 0) {
            this.scene.spawnImpactEffect(player.x, player.y - 10, col, 17);
          }
        }
      });
    });
  }

  executeHollowSoulLink(targets, time) {
    const twin = this.twinSibling;
    if (!twin?.active || this.definition.id !== "hollowPair") return;
    const tuning = this.getAttackTuning("hollowSoulLink", {
      windupMs: 520,
      beamDurationMs: 900,
      beamWidth: 34,
      damageTickMs: 180,
      damagePerTick: 5,
      cooldownMs: 3000,
      postLockMs: 420
    });
    this.setAttackCooldown("hollowSoulLink", time, tuning.cooldownMs);
    const totalMs = tuning.windupMs + tuning.beamDurationMs + (tuning.postLockMs || 0);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + totalMs);
    this.lockMovement(time, tuning.windupMs + tuning.beamDurationMs);
    if (typeof this.scene.startHollowSoulLink === "function") {
      this.scene.startHollowSoulLink(this, twin, targets, tuning, this.definition.color);
    }
  }

  executeStalkerRiftDash(targets, direction, time) {
    const tuning = this.getAttackTuning("riftDash", {
      windupMs: 620,
      width: 245,
      height: 58,
      yOffset: 8,
      damage: 24,
      dashSpeed: 780,
      dashDurationMs: 260,
      cooldownMs: 1500,
      postLockMs: 360
    });
    const d = direction < 0 ? -1 : 1;
    const width = tuning.width;
    const windupMs = tuning.windupMs;
    const windupRect = this.scene.createRectHitbox(this.x + d * width * 0.45, this.y + tuning.yOffset, width, tuning.height);
    const tcx = windupRect.x + windupRect.width * 0.5;
    const tcy = windupRect.y + windupRect.height * 0.5;
    this.scene.spawnStalkerRiftTendril(this.x, this.y + 10, tcx, tcy, windupMs);
    this.scene.spawnStalkerRiftChargeGlow(this, windupMs);
    this.scene.spawnWindupRect(windupRect, this.definition.color, windupMs);
    this.setAttackCooldown("riftDash", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + windupMs + tuning.postLockMs);
    this.lockMovement(time, windupMs);
    this.scheduleBossAttackDelay(windupMs, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      this.dashLockUntil = this.scene.time.now + tuning.dashDurationMs;
      this.setVelocityX(direction * tuning.dashSpeed);
      const dashRect = this.scene.createRectHitbox(this.x + d * width * 0.45, this.y + tuning.yOffset, width, tuning.height);
      this.scene.playRectAttackVisual(dashRect, this.definition.color, {
        durationMs: 125,
        direction: d,
        angle: d > 0 ? 5 : -5
      });
      this.scene.spawnDashStreak(this.x, this.y + tuning.yOffset - 4, d, width * 0.85, 0xcf7cff, 200);
      targets.forEach((player) => {
        if (!player.isAlive) return;
        if (this.scene.rectHitsTarget(dashRect, player)) {
          if (this.hitPlayer(player, tuning.damage, this.definition.color, "melee") > 0) {
          this.scene.spawnImpactEffect(player.x, player.y - 10, this.definition.color, 14);
          }
        }
      });
    });
  }

  executeTitanCharge(targets, target, direction, time) {
    const tuning = this.getAttackTuning("titanCharge", {
      windupMs: 320,
      width: 260,
      height: 70,
      yOffset: 10,
      damage: 17,
      cooldownMs: 1900,
      postLockMs: 380,
      dashSpeed: 620,
      dashDurationMs: 300
    });
    const d = target.x >= this.x ? 1 : -1;
    const rect = this.scene.createRectHitbox(this.x + d * tuning.width * 0.45, this.y + tuning.yOffset, tuning.width, tuning.height);
    this.scene.spawnWindupRect(rect, this.definition.color, tuning.windupMs);
    this.scene.spawnBehemothShieldBashTelegraph(rect, d, tuning.windupMs, this.definition.color);
    this.setAttackCooldown("titanCharge", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + tuning.windupMs + tuning.postLockMs);
    this.lockMovement(time, tuning.windupMs);
    this.scheduleBossAttackDelay(tuning.windupMs, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      this.dashLockUntil = this.scene.time.now + tuning.dashDurationMs;
      this.setVelocityX(d * tuning.dashSpeed);
      const hit = this.scene.createRectHitbox(this.x + d * tuning.width * 0.45, this.y + tuning.yOffset, tuning.width, tuning.height);
      const hcx = hit.x + hit.width * 0.5;
      const hcy = hit.y + hit.height * 0.5;
      this.scene.spawnBehemothShieldBashImpact(hcx, hcy, d, this.definition.color);
      this.scene.playRectAttackVisual(hit, this.definition.color, { durationMs: 150, direction: d });
      targets.forEach((player) => {
        if (!player.isAlive) return;
        if (this.scene.rectHitsTarget(hit, player)) {
          if (this.hitPlayer(player, tuning.damage, this.definition.color, "melee") > 0) {
          this.scene.spawnImpactEffect(player.x, player.y - 8, this.definition.color, 15);
          }
        }
      });
    });
  }

  executeMeteorCall(targets, time) {
    const tuning = this.getAttackTuning("meteorCall", {
      windupMs: 760,
      width: 220,
      height: 32,
      dropDurationMs: 160,
      meteorDamage: 20,
      cooldownMs: 1500,
      postLockMs: 280
    });
    const dropMs = tuning.dropDurationMs || 160;
    const slamAt = tuning.windupMs + dropMs;
    const w = tuning.width || 220;
    const h = tuning.height || 32;
    const meteorLocks = [];
    const seenLock = new Set();
    targets.forEach((player) => {
      if (!player.isAlive) return;
      const footY = player.body ? player.body.y + player.body.height : player.y + 30;
      const aimX = player.x;
      const lockKey = `${Math.round(aimX)}_${Math.round(footY)}`;
      if (seenLock.has(lockKey)) return;
      seenLock.add(lockKey);
      meteorLocks.push({ aimX, footY });
      const rect = this.scene.createRectHitbox(aimX, footY, w, h);
      this.scene.spawnWindupRect(rect, this.definition.color, slamAt);
      this.scene.spawnBehemothMeteorAtAim(aimX, footY, tuning.windupMs, dropMs);
    });
    this.setAttackCooldown("meteorCall", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + slamAt + tuning.postLockMs);
    this.lockMovement(time, slamAt);
    this.scheduleBossAttackDelay(slamAt, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      meteorLocks.forEach(({ aimX, footY }) => {
        const hitRect = this.scene.createRectHitbox(aimX, footY, w, h);
        this.scene.playRectAttackVisual(hitRect, this.definition.color, { durationMs: 110 });
        targets.forEach((player) => {
          if (!player.isAlive) return;
          if (this.scene.rectHitsTarget(hitRect, player)) {
            const dmg = Number.isFinite(tuning.meteorDamage) ? tuning.meteorDamage : 20;
            if (this.hitPlayer(player, dmg, this.definition.color, "melee") > 0) {
              this.scene.spawnImpactEffect(player.x, player.y - 10, this.definition.color, 16);
            }
          }
        });
      });
    });
  }

  executeBehemothStalkBoulder(targets, target, time) {
    const grounded = targets.filter((p) => p.isAlive && p.body && p.body.blocked.down);
    if (!grounded.length) return;

    const tuning = this.getAttackTuning("stalkBoulder", {
      behindOffsetPx: 102,
      hoverAboveGroundPx: 28,
      windupMs: 820,
      dropDurationMs: 155,
      smashDamage: 38,
      smashRadius: 112,
      smashForwardPx: 58,
      fallRecoverMs: 720,
      cooldownMs: 2800,
      postLockMs: 200
    });

    const victim = grounded.includes(target) ? target : grounded[Phaser.Math.Between(0, grounded.length - 1)];
    let pf;
    if (typeof victim.facing === "number" && Number.isFinite(victim.facing)) {
      pf = Math.sign(victim.facing) === 0 ? 1 : Math.sign(victim.facing);
    } else {
      // Turrets/decoys may omit `facing`; stalk from the side opposite the boss (victim "faces" the boss).
      const towardBoss = Math.sign(this.x - victim.x);
      pf = towardBoss !== 0 ? towardBoss : 1;
    }
    const behindX = victim.x - pf * tuning.behindOffsetPx;
    const victimFeet = victim.body.bottom;
    const col = this.definition.color;

    const testY = victim.body.bottom - tuning.hoverAboveGroundPx;
    if (!Number.isFinite(behindX) || !Number.isFinite(testY) || !Number.isFinite(victimFeet)) return;

    this.setPosition(behindX, testY);

    if (typeof this.scene.spawnBehemothStalkTeleportBurst === "function") {
      this.scene.spawnBehemothStalkTeleportBurst(this.x, this.y, victim.x, victim.y, col);
    }

    const direction = victim.x >= this.x ? 1 : -1;
    this.flipX = direction < 0;

    if (this.body.setAllowGravity) {
      this.body.setAllowGravity(false);
    } else {
      this.body.allowGravity = false;
    }
    this.setVelocity(0, 0);

    const windup = tuning.windupMs;
    const drop = tuning.dropDurationMs;
    const r = tuning.smashRadius;
    const impactX = this.x + direction * tuning.smashForwardPx;
    const impactCy = victimFeet - r * 0.28;

    const telegraphCircle = this.scene.createCircleHitbox(impactX, impactCy, r);
    this.scene.spawnWindupCircle(telegraphCircle, col, windup);

    if (typeof this.scene.spawnBehemothStalkBoulderSequence === "function") {
      this.scene.spawnBehemothStalkBoulderSequence(this, impactX, impactCy, col, windup, drop, r);
    }

    const totalLock = windup + drop + tuning.fallRecoverMs;
    this.setAttackCooldown("stalkBoulder", time, tuning.cooldownMs);
    this.lockMovement(time, totalLock);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + totalLock + tuning.postLockMs);

    const smashAt = windup + drop;
    this.scheduleBossAttackDelay(smashAt, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      if (this.body.setAllowGravity) {
        this.body.setAllowGravity(true);
      } else {
        this.body.allowGravity = true;
      }
      this.setVelocity(0, 0);

      const hit = this.scene.createCircleHitbox(impactX, impactCy, r);
      if (this.scene.isTrueHitboxView()) {
        this.scene.spawnCircleStrikeVisual(hit, col, { durationMs: 150 });
      }
      if (typeof this.scene.spawnBehemothStalkSlamBurst === "function") {
        this.scene.spawnBehemothStalkSlamBurst(impactX, impactCy, r, col);
      }
      this.scene.playCircleAttackVisual(hit, col, { durationMs: 140 });
      targets.forEach((player) => {
        if (!player.isAlive) return;
        if (this.scene.circleHitsTarget(hit, player)) {
          if (this.hitPlayer(player, tuning.smashDamage, col, "melee") > 0) {
            this.scene.spawnImpactEffect(player.x, player.y - 10, col, 18);
          }
        }
      });
    });
  }

  executeBehemothEarthshatter(targets, time) {
    const tuning = this.getAttackTuning("earthshatter", {
      windupMs: 1600,
      shockwaveRadius: 220,
      damage: 48,
      cooldownMs: 4000,
      postLockMs: 700,
      crackCount: 8,
      debrisCount: 12
    });
    const windupMs = tuning.windupMs;
    const r = tuning.shockwaveRadius;
    const col = this.definition.color;

    if (typeof this.scene.spawnBehemothEarthshatterWindup === "function") {
      this.scene.spawnBehemothEarthshatterWindup(this.x, this.y, col, windupMs);
    }
    this.scene.spawnWindupCircle(this.scene.createCircleHitbox(this.x, this.y + 16, r), col, windupMs);

    this.setAttackCooldown("earthshatter", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + windupMs + tuning.postLockMs);
    this.lockMovement(time, windupMs + tuning.postLockMs);

    this.scheduleBossAttackDelay(windupMs, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      const hitCircle = this.scene.createCircleHitbox(this.x, this.y + 16, r);

      if (typeof this.scene.spawnBehemothEarthshatterImpact === "function") {
        this.scene.spawnBehemothEarthshatterImpact(this.x, this.y + 16, r, col, tuning.crackCount, tuning.debrisCount);
      }
      if (this.scene.isTrueHitboxView()) {
        this.scene.spawnCircleStrikeVisual(hitCircle, col, { durationMs: 160 });
      }

      targets.forEach((player) => {
        if (!player.isAlive) return;
        if (this.scene.circleHitsTarget(hitCircle, player)) {
          if (this.hitPlayer(player, tuning.damage, col, "melee") > 0) {
            this.scene.spawnImpactEffect(player.x, player.y - 10, col, 22);
            player.setVelocityY(-320);
          }
        }
      });
    });
  }

  executeBehemothBoulderBarrage(targets, time) {
    const tuning = this.getAttackTuning("boulderBarrage", {
      windupMs: 1300,
      boulderCount: 4,
      boulderDamage: 24,
      boulderRadius: 55,
      dropDurationMs: 400,
      cooldownMs: 3200,
      postLockMs: 500,
      spreadX: 180
    });
    const windupMs = tuning.windupMs;
    const dropMs = tuning.dropDurationMs;
    const slamAt = windupMs + dropMs;
    const col = this.definition.color;
    const bR = tuning.boulderRadius;

    if (typeof this.scene.spawnBehemothBoulderWindup === "function") {
      this.scene.spawnBehemothBoulderWindup(this.x, this.y, col, windupMs);
    }

    const boulderTargets = [];
    const alivePlayers = targets.filter((p) => p.isAlive);
    for (let i = 0; i < tuning.boulderCount; i++) {
      const tgt = alivePlayers[i % alivePlayers.length];
      if (!tgt) continue;
      const aimX = tgt.x + Phaser.Math.Between(-tuning.spreadX * 0.5, tuning.spreadX * 0.5);
      const footY = tgt.body ? tgt.body.y + tgt.body.height : tgt.y + 30;
      boulderTargets.push({ aimX, footY });

      const telegraphCircle = this.scene.createCircleHitbox(aimX, footY, bR);
      this.scene.spawnWindupCircle(telegraphCircle, col, slamAt);
      if (typeof this.scene.spawnBehemothBoulderFalling === "function") {
        this.scene.spawnBehemothBoulderFalling(aimX, footY, windupMs + i * 60, dropMs, col);
      }
    }

    this.setAttackCooldown("boulderBarrage", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + slamAt + tuning.postLockMs);
    this.lockMovement(time, windupMs);

    boulderTargets.forEach(({ aimX, footY }, idx) => {
      this.scheduleBossAttackDelay(slamAt + idx * 60, () => {
        if (!this.active || this.scene.gameState !== "battle") return;
        const hitCircle = this.scene.createCircleHitbox(aimX, footY, bR);
        if (typeof this.scene.spawnBehemothBoulderImpact === "function") {
          this.scene.spawnBehemothBoulderImpact(aimX, footY, bR, col);
        }
        targets.forEach((player) => {
          if (!player.isAlive) return;
          if (this.scene.circleHitsTarget(hitCircle, player)) {
            if (this.hitPlayer(player, tuning.boulderDamage, col, "melee") > 0) {
              this.scene.spawnImpactEffect(player.x, player.y - 10, col, 18);
            }
          }
        });
      });
    });
  }

  executeGapDash(targets, direction, time) {
    const tuning = this.getAttackTuning("gapDash", {
      windupMs: 220,
      width: this.definition.id === "hollowPair" ? 240 : 210,
      height: 58,
      yOffset: 8,
      damage: this.definition.id === "hollowPair" ? 16 : 13,
      cooldownMs: 1450,
      dashDurationMs: 260,
      dashSpeed: 500,
      postLockMs: 360
    });
    const width = tuning.width;
    const damage = tuning.damage;
    const windupMs = tuning.windupMs;
    const windupRect = this.scene.createRectHitbox(this.x + direction * width * 0.45, this.y + tuning.yOffset, width, tuning.height);
    this.scene.spawnWindupRect(windupRect, this.definition.color, windupMs);
    this.setAttackCooldown("gapDash", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + windupMs + tuning.postLockMs);
    this.lockMovement(time, windupMs);
    this.scheduleBossAttackDelay(windupMs, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      this.dashLockUntil = this.scene.time.now + tuning.dashDurationMs;
      this.setVelocityX(direction * tuning.dashSpeed);
        const dashRect = this.scene.createRectHitbox(this.x + direction * width * 0.45, this.y + tuning.yOffset, width, tuning.height);
        this.scene.playRectAttackVisual(dashRect, this.definition.color, {
          durationMs: 120,
          direction,
          angle: direction > 0 ? 5 : -5
        });
      targets.forEach((player) => {
        if (!player.isAlive) return;
          if (this.scene.rectHitsTarget(dashRect, player)) {
            if (this.hitPlayer(player, damage, this.definition.color, "melee") > 0) {
          this.scene.spawnImpactEffect(player.x, player.y - 10, this.definition.color, 14);
            }
        }
      });
    });
  }

  executeJumpSmash(targets, target, direction, time) {
    const tuning = this.getAttackTuning("jumpSmash", {
      windupMs: 260,
      previewRadius: 78,
      smashRadius: 86,
      smashDamage: 14,
      cooldownMs: 1700,
      postLockMs: 500,
      jumpVelocityY: -640,
      jumpVelocityX: 240,
      smashDelayMs: 560
    });
    const windupMs = tuning.windupMs;
    this.scene.spawnWindupCircle(this.scene.createCircleHitbox(this.x, this.y + 18, tuning.previewRadius), this.definition.color, windupMs);
    this.setAttackCooldown("jumpSmash", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + windupMs + tuning.postLockMs);
    this.lockMovement(time, windupMs);
    this.scheduleBossAttackDelay(windupMs, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      this.setVelocityY(tuning.jumpVelocityY);
      this.setVelocityX(direction * tuning.jumpVelocityX);
    });
    this.scheduleBossAttackDelay(tuning.smashDelayMs, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      const smashCircle = this.scene.createCircleHitbox(this.x, this.y + 18, tuning.smashRadius);
      this.scene.playCircleAttackVisual(smashCircle, this.definition.color, { durationMs: 130 });
      this.scene.spawnAbilityBurst(this.x, this.y + 16, this.definition.color, 78, 180);
      targets.forEach((player) => {
        if (!player.isAlive) return;
        if (this.scene.circleHitsTarget(smashCircle, player)) {
          if (this.hitPlayer(player, tuning.smashDamage, this.definition.color, "melee") > 0) {
          this.scene.spawnImpactEffect(player.x, player.y - 10, this.definition.color, 14);
          }
        }
      });
      this.scene.spawnAuraPulse(this.x, this.y + 20, this.definition.color, 68, 170);
    });
  }

  executeRangedPressure(target, direction, time) {
    const tuning = this.getAttackTuning("rangedPressure", {
      windupMs: 240,
      width: 230,
      height: 34,
      xOffset: 115,
      yOffset: -6,
      cooldownMs: 1250,
      postLockMs: 340,
      shotCount: this.definition.id === "pyromancer" ? 3 : 2,
      shotIntervalMs: 85,
      projectileDamage: 10,
      projectileBaseSpeedX: 320,
      projectileSpeedStep: 16,
      projectileMaxRange: 330,
      verticalAimScale: 0.18
    });
    const windupMs = tuning.windupMs;
    const windupRect = this.scene.createRectHitbox(this.x + direction * tuning.xOffset, this.y + tuning.yOffset, tuning.width, tuning.height);
    this.scene.spawnWindupRect(windupRect, this.definition.color, windupMs);
    this.setAttackCooldown("rangedPressure", time, tuning.cooldownMs);
    const shotCount = tuning.shotCount;
    this.attackLockUntil = Math.max(this.attackLockUntil, time + windupMs + tuning.postLockMs);
    this.lockMovement(time, windupMs);
    for (let i = 0; i < shotCount; i += 1) {
      this.scheduleBossAttackDelay(windupMs + i * tuning.shotIntervalMs, () => {
        if (!this.active || this.scene.gameState !== "battle") return;
        const dy = Phaser.Math.Clamp(target.y - this.y, -120, 120) * tuning.verticalAimScale;
        this.scene.spawnBossProjectile(this.x, this.y + tuning.yOffset + i * 8 - 8, direction, tuning.projectileDamage, {
          speedX: tuning.projectileBaseSpeedX + i * tuning.projectileSpeedStep,
          velocityY: dy,
          maxRange: tuning.projectileMaxRange,
          effectColor: this.definition.color
        });
      });
    }
  }

  executeCloseBurst(targets, direction, time) {
    const tuning = this.getAttackTuning("closeBurst", {
      windupMs: 220,
      radius: 112,
      spreadDeg: 96,
      damage: 12,
      cooldownMs: 1350,
      postLockMs: 320,
      hitDelayMs: 220
    });
    const windupMs = tuning.windupMs;
    this.scene.spawnWindupFan(this.x, this.y + 10, direction, tuning.radius, tuning.spreadDeg, this.definition.color, windupMs);
    this.setAttackCooldown("closeBurst", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + windupMs + tuning.postLockMs);
    this.lockMovement(time, windupMs);
    this.scheduleBossAttackDelay(windupMs, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      this.scene.playFanAttackVisual(this.x, this.y + 10, direction, tuning.radius, tuning.spreadDeg, this.definition.color, 120);
      targets.forEach((player) => {
        if (!player.isAlive) return;
        if (this.scene.fanHitsTarget(this.x, this.y + 10, direction, tuning.radius, tuning.spreadDeg, player)) {
          if (this.hitPlayer(player, tuning.damage, this.definition.color, "melee") > 0) {
          this.scene.spawnImpactEffect(player.x, player.y - 8, this.definition.color, 13);
          }
        }
      });
    });
  }

  executeGraveWardenBoneVolley(targets, target, direction, time) {
    const tuning = this.getAttackTuning("boneVolley", {
      windupMs: 1150,
      summonHp: 170,
      summonDamage: 34,
      slamRadius: 96,
      slamWindupMs: 500,
      slamCooldownMs: 1250,
      leashRadius: 280,
      healOnKill: 40,
      cooldownMs: 7200,
      postLockMs: 520,
      afterSummonLockMs: 850
    });
    const col = this.definition.color;
    const landX = this.x + (this.flipX ? -1 : 1) * 70;
    const landY = this.body?.bottom ?? this.y + 24;
    if (typeof this.scene.spawnGraveWardenBruteWindup === "function") {
      this.scene.spawnGraveWardenBruteWindup(this, landX, landY, col, tuning.windupMs);
    } else if (typeof this.scene.spawnAuraPulse === "function") {
      this.scene.spawnAuraPulse(this.x, this.y - 10, col, 58, tuning.windupMs);
    }
    this.setAttackCooldown("boneVolley", time, tuning.cooldownMs);
    const extraLock = Number.isFinite(tuning.afterSummonLockMs) ? tuning.afterSummonLockMs : 0;
    this.attackLockUntil = Math.max(this.attackLockUntil, time + tuning.windupMs + tuning.postLockMs + extraLock);
    this.lockMovement(time, tuning.windupMs);
    this.scheduleBossAttackDelay(tuning.windupMs, () => {
      if (!this.active || this.scene.gameState !== "battle") return;
      if (typeof this.scene.registerGraveWardenBoneBrute === "function") {
        this.scene.registerGraveWardenBoneBrute(this, target, tuning, col);
      }
    });
  }

  executeGraveWardenGraveRise(targets, time) {
    const tuning = this.getAttackTuning("graveRise", {
      windupMs: 1050,
      summonHp: 90,
      boneDamage: 9,
      fireIntervalMs: 620,
      projectileSpeed: 340,
      attackRange: 780,
      projectileMaxRange: 820,
      durationMs: 12000,
      cooldownMs: 7600,
      postLockMs: 520,
      afterSummonLockMs: 900
    });
    const col = this.definition.color;
    const scene = this.scene;
    const alive = targets.filter((p) => p.isAlive);
    if (!alive.length) return;
    this.setAttackCooldown("graveRise", time, tuning.cooldownMs);
    const extraLock = Number.isFinite(tuning.afterSummonLockMs) ? tuning.afterSummonLockMs : 0;
    this.attackLockUntil = Math.max(this.attackLockUntil, time + tuning.windupMs + tuning.postLockMs + extraLock);
    this.lockMovement(time, tuning.windupMs);
    const tgt = alive[Phaser.Math.Between(0, alive.length - 1)];
    const pos = { x: tgt.x + Phaser.Math.Between(-30, 30), y: tgt.body?.bottom ?? tgt.y + 24 };
    if (typeof scene.spawnGraveWardenGraveWindup === "function") {
      scene.spawnGraveWardenGraveWindup(this, pos.x, pos.y, col, tuning.windupMs);
    } else {
      const tele = scene.createCircleHitbox(pos.x, pos.y - 30, 64);
      scene.spawnWindupCircle(tele, col, tuning.windupMs);
      if (typeof scene.spawnAuraPulse === "function") {
        scene.spawnAuraPulse(this.x, this.y - 8, 0x4a0e2e, 52, tuning.windupMs);
      }
    }
    this.scheduleBossAttackDelay(tuning.windupMs, () => {
      if (!this.active || scene.gameState !== "battle") return;
      if (typeof scene.registerGraveWardenHauntedGrave === "function") {
        scene.registerGraveWardenHauntedGrave(this, pos.x, pos.y, tuning, col);
      } else if (typeof scene.spawnGraveHand === "function") {
        // Fallback to old hazard if summon system is missing.
        scene.spawnGraveHand(pos.x, pos.y, { handWidth: 42, handHeight: 50, durationMs: 1200, damage: 18 }, col, targets, this);
      }
    });
  }

  executeGraveWardenSoulSiphon(targets, target, time) {
    const tuning = this.getAttackTuning("soulSiphon", {
      windupMs: 600, beamDurationMs: 1400, beamWidth: 28, damageTickMs: 200,
      damagePerTick: 6, healPerTick: 8, maxRange: 350, cooldownMs: 3200, postLockMs: 400
    });
    const col = this.definition.color;
    const scene = this.scene;
    if (!target?.isAlive) return;
    this.setAttackCooldown("soulSiphon", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + tuning.windupMs + tuning.beamDurationMs + tuning.postLockMs);
    this.lockMovement(time, tuning.windupMs + tuning.beamDurationMs);
    if (typeof scene.spawnGraveWardenSiphonWindup === "function") {
      scene.spawnGraveWardenSiphonWindup(this, target, col, tuning.windupMs);
    } else if (typeof scene.spawnAuraPulse === "function") {
      scene.spawnAuraPulse(this.x, this.y - 10, 0x6b1d5e, 48, tuning.windupMs);
    }
    this.scheduleBossAttackDelay(tuning.windupMs, () => {
      if (!this.active || scene.gameState !== "battle") return;
      if (typeof scene.spawnSoulSiphonBeam === "function") {
        scene.spawnSoulSiphonBeam(this, target, tuning, col, targets);
      }
    });
  }

  executeGraveWardenPhantomSwarm(targets, time) {
    const tuning = this.getAttackTuning("phantomSwarm", {
      windupMs: 950,
      phantomCount: 3,
      phantomSpeed: 130,
      phantomDuration: 6500,
      phantomDamage: 14,
      phantomRadius: 36,
      cooldownMs: 6800,
      postLockMs: 520,
      afterSummonLockMs: 800
    });
    const col = this.definition.color;
    const scene = this.scene;
    this.setAttackCooldown("phantomSwarm", time, tuning.cooldownMs);
    const extraLock = Number.isFinite(tuning.afterSummonLockMs) ? tuning.afterSummonLockMs : 0;
    this.attackLockUntil = Math.max(this.attackLockUntil, time + tuning.windupMs + tuning.postLockMs + extraLock);
    this.lockMovement(time, tuning.windupMs);
    if (typeof scene.spawnGraveWardenPhantomWindup === "function") {
      scene.spawnGraveWardenPhantomWindup(this, col, tuning.windupMs);
    } else if (typeof scene.spawnAuraPulse === "function") {
      scene.spawnAuraPulse(this.x, this.y - 10, col, 60, tuning.windupMs);
    }
    this.scheduleBossAttackDelay(tuning.windupMs, () => {
      if (!this.active || scene.gameState !== "battle") return;
      if (typeof scene.registerGraveWardenPhantomSwarm === "function") {
        scene.registerGraveWardenPhantomSwarm(this, tuning, col, targets);
      } else if (typeof scene.spawnPhantomSwarm === "function") {
        scene.spawnPhantomSwarm(this, tuning, col, targets);
      }
    });
  }

  executeGraveWardenDeathsToll(targets, target, direction, time) {
    const tuning = this.getAttackTuning("deathsToll", {
      windupMs: 900, scytheWidth: 340, scytheHeight: 60, damage: 28,
      sweepDurationMs: 400, cooldownMs: 3600, postLockMs: 500
    });
    const col = this.definition.color;
    const scene = this.scene;
    const aimX = target?.x ?? this.x + direction * 120;
    const groundY = this.body?.bottom ?? this.y + 24;
    const sweepCx = (this.x + aimX) * 0.5;
    const sweepCy = groundY - tuning.scytheHeight * 0.35;
    if (typeof scene.spawnGraveWardenTollWindup === "function") {
      scene.spawnGraveWardenTollWindup(sweepCx, sweepCy, tuning.scytheWidth, tuning.scytheHeight, direction, col, tuning.windupMs);
    } else {
      const rect = scene.createRectHitbox(sweepCx, sweepCy, tuning.scytheWidth, tuning.scytheHeight);
      scene.spawnWindupRect?.(rect, col, tuning.windupMs);
      if (!scene.spawnWindupRect) {
        const c = scene.createCircleHitbox(sweepCx, sweepCy, tuning.scytheWidth * 0.45);
        scene.spawnWindupCircle(c, col, tuning.windupMs);
      }
    }
    this.setAttackCooldown("deathsToll", time, tuning.cooldownMs);
    this.attackLockUntil = Math.max(this.attackLockUntil, time + tuning.windupMs + tuning.postLockMs);
    this.lockMovement(time, tuning.windupMs);
    if (typeof scene.spawnAuraPulse === "function") {
      scene.spawnAuraPulse(this.x, this.y - 8, 0x5e0a3a, 54, tuning.windupMs);
    }
    this.scheduleBossAttackDelay(tuning.windupMs, () => {
      if (!this.active || scene.gameState !== "battle") return;
      if (typeof scene.spawnDeathsTollSweep === "function") {
        scene.spawnDeathsTollSweep(sweepCx, sweepCy, tuning, col, targets, this, direction);
      } else {
        const hit = scene.createRectHitbox(sweepCx, sweepCy, tuning.scytheWidth, tuning.scytheHeight);
        if (scene.isTrueHitboxView?.()) {
          scene.spawnRectStrikeVisual?.(hit, col, { durationMs: 160 });
        }
        scene.playRectAttackVisual(hit, col, { durationMs: tuning.sweepDurationMs });
        targets.forEach((p) => {
          if (!p.isAlive) return;
          if (scene.rectHitsTarget(hit, p)) {
            this.hitPlayer(p, tuning.damage, col, "melee");
          }
        });
      }
    });
  }

  usePattern(target, direction, distance, time) {
    switch (this.definition.pattern) {
      case "jumper":
        this.scene.playRectAttackVisual(this.scene.createRectHitbox(this.x, this.y + 28, 110, 26), 0xa3d0ff, { durationMs: 260 });
        this.scheduleBossAttackDelay(180, () => {
          if (!this.active || this.scene.gameState !== "battle") return;
          if (this.body.blocked.down) {
            this.setVelocityY(-620);
            this.setVelocityX(direction * 220);
          }
        });
        break;
      case "shooter":
        this.scene.spawnDashStreak(this.x, this.y - 8, direction, 220, 0xff8b8b, 300);
        this.scheduleBossAttackDelay(220, () => {
          if (!this.active || this.scene.gameState !== "battle") return;
          this.scene.spawnBossProjectile(this.x, this.y - 6, direction, 14, {
            speedX: 330,
            maxRange: 320,
            effectColor: 0xff8b8b
          });
        });
        this.scheduleBossAttackDelay(380, () => {
          if (this.active && this.scene.gameState === "battle") {
            this.scene.spawnBossProjectile(this.x, this.y + 10, direction, 14, {
              speedX: 330,
              maxRange: 320,
              effectColor: 0xff8b8b
            });
          }
        });
        break;
      case "dasher":
        this.scene.spawnDashStreak(this.x, this.y + 8, direction, 250, 0xe3a2ff, 220);
        this.scheduleBossAttackDelay(180, () => {
          if (!this.active || this.scene.gameState !== "battle") return;
          this.dashLockUntil = this.scene.time.now + 240;
          this.setVelocityX(direction * 480);
        });
        break;
      case "summoner":
        this.scene.spawnAuraPulse(this.x, this.y - 8, 0xb7ff7f, 50, 220);
        this.scene.playRectAttackVisual(this.scene.createRectHitbox(target.x, 510, 220, 24), 0xb7ff7f, { durationMs: 320 });
        this.scheduleBossAttackDelay(220, () => {
          if (!this.active || this.scene.gameState !== "battle") return;
          this.scene.spawnHazardRain(target.x);
        });
        break;
      case "chaser":
      default:
        if (distance < 170 && this.body.blocked.down) {
          this.scene.playRectAttackVisual(this.scene.createRectHitbox(this.x + direction * 70, this.y + 18, 150, 36), 0xd0d0d0, { durationMs: 220, direction });
          this.scheduleBossAttackDelay(170, () => {
            if (!this.active || this.scene.gameState !== "battle") return;
            this.setVelocityY(-520);
          });
        }
        break;
    }

    if (this.health <= this.maxHealth * 0.5 && this.phase === 1) {
      this.phase = 2;
      this.definition.speed += 15;
      this.definition.contactDamage += 2;
      this.nextSpecialTime = time + 800;
      this.nextBasicAttackTime = time + 520;
    }
  }

  useFrequentAttack(targets, target, direction, distance, time) {
    if (!target || !target.active || !target.isAlive) return;

    switch (this.definition.id) {
      case "galeSovereign":
        if (typeof this.scene.spawnGaleCollapsingRingWindup === "function") {
          this.scene.spawnGaleCollapsingRingWindup(this.x, this.y + 8, this.definition.color, 160);
        }
        this.scheduleBossAttackDelay(160, () => {
          if (!this.active || this.scene.gameState !== "battle") return;
          const r = this.scene.createCircleHitbox(this.x, this.y + 10, 100);
          this.scene.playCircleAttackVisual(r, this.definition.color, { durationMs: 90 });
          targets.forEach((player) => {
            if (!player.isAlive) return;
            if (this.scene.circleHitsTarget(r, player)) {
              if (this.hitPlayer(player, 8, this.definition.color, "melee") > 0) {
                this.scene.spawnImpactEffect(player.x, player.y - 8, this.definition.color, 10);
              }
            }
          });
        });
        break;
      case "wraith":
        this.scene.spawnDashStreak(this.x, this.y - 20, direction, 180, 0x9dbeff, 210);
        this.scheduleBossAttackDelay(200, () => {
          if (!this.active || this.scene.gameState !== "battle") return;
          this.scene.spawnBossProjectile(this.x, this.y - 14, direction, 11, {
            speedX: 280,
            velocityY: -120,
            gravity: 220,
            maxRange: 260,
            effectColor: 0x9dbeff
          });
        });
        break;
      case "pyromancer":
        this.scene.spawnDashStreak(this.x, this.y, direction, 220, 0xff9a66, 210);
        this.scheduleBossAttackDelay(210, () => {
          if (!this.active || this.scene.gameState !== "battle") return;
          [-10, 10].forEach((offsetY) => {
            this.scene.spawnBossProjectile(this.x, this.y + offsetY, direction, 10, {
              speedX: 300,
              maxRange: 280,
              effectColor: 0xff9a66
            });
          });
        });
        break;
      case "hollowPair": {
        const hc = this.definition.color || 0xc4a8ff;
        const twin = this.twinSibling;
        const tx = twin?.active ? twin.x : this.x;
        const ty = twin?.active ? twin.y - 12 : this.y - 12;
        const dir = target.x >= tx ? 1 : -1;
        this.scene.spawnDashStreak(tx, ty, dir, 200, hc, 160);
        this.scheduleBossAttackDelay(110, () => {
          if (!this.active || this.scene.gameState !== "battle") return;
          const dy = Phaser.Math.Clamp((target.y - ty) * 0.14, -95, 95);
          const sk = this.scene.textures?.exists?.("proj_hollow_void_spear") ? "proj_hollow_void_spear" : "proj_void_arrow";
          this.scene.spawnBossProjectile(tx, ty - 2, dir, 9, {
            speedX: 360,
            velocityY: dy,
            maxRange: 400,
            effectColor: hc,
            textureKey: sk,
            skipMuzzleFlash: true,
            scaleX: sk === "proj_hollow_void_spear" ? 0.85 : 0.52,
            scaleY: sk === "proj_hollow_void_spear" ? 0.85 : 0.52,
            alpha: 0.92
          });
        });
        break;
      }
      case "behemoth":
      default:
        if (this.body.blocked.down) {
          const windupMs = 400;
          const stompR = 140;
          const stompCol = 0xb7ff7f;
          this.scene.playCircleAttackVisual(this.scene.createCircleHitbox(this.x, this.y + 18, stompR), stompCol, { durationMs: windupMs });
          if (typeof this.scene.spawnBehemothStompWindup === "function") {
            this.scene.spawnBehemothStompWindup(this.x, this.y, stompCol, windupMs);
          }
          this.scheduleBossAttackDelay(windupMs, () => {
            if (!this.active || this.scene.gameState !== "battle") return;
            const stompCircle = this.scene.createCircleHitbox(this.x, this.y + 18, stompR);
            this.scene.playCircleAttackVisual(stompCircle, stompCol, { durationMs: 140 });
            if (typeof this.scene.spawnBehemothColossusShockwave === "function") {
              this.scene.spawnBehemothColossusShockwave(this.x, this.y + 18, stompR * 0.8, stompCol);
            }
            targets.forEach((player) => {
              if (!player.isAlive) return;
              if (this.scene.circleHitsTarget(stompCircle, player)) {
                if (this.hitPlayer(player, 18, stompCol, "melee") > 0) {
                  this.scene.spawnImpactEffect(player.x, player.y - 9, stompCol, 16);
                }
              }
            });
          });
        }
        break;
    }
  }

  hitPlayer(player, amount, color, attackKind = "melee", extraMeta = null) {
    if (!player || !player.active || !player.isAlive || typeof player.takeDamage !== "function") return 0;
    const m = this.scene?.bossOutgoingDamageMult ?? 1;
    const scaled = Math.max(1, Math.round((Number.isFinite(amount) ? amount : 0) * m));
    const meta = { attackKind, boss: this };
    if (extraMeta && typeof extraMeta === "object") {
      Object.assign(meta, extraMeta);
    }
    return player.takeDamage(scaled, color, meta);
  }

  applyStun(durationMs) {
    const t = this.scene.time.now;
    const safe = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
    const end = t + safe;
    this.beginBossAttackEpoch();
    this.cancelBossOngoingAttackState();
    this.stunnedUntil = Math.max(this.stunnedUntil, end);
    this.movementLockUntil = Math.max(this.movementLockUntil, end);
    this.attackLockUntil = Math.max(this.attackLockUntil, end);
    this.setVelocityX(0);
  }

  tryContactDamage(player, time) {
    if (!player || !player.active || !player.isAlive || typeof player.takeDamage !== "function") return;
    if (player.movementLockType === "dash" && time < player.movementLockUntil) return;
    if (Number.isFinite(player.invulnerableUntil) && time < player.invulnerableUntil) return;
    if (Number.isFinite(player.bossContactGraceUntil) && time < player.bossContactGraceUntil) return;
    const contactTuning = this.getContactTuning();
    if (time < this.lastContactHit + contactTuning.cooldownMs) return;
    this.lastContactHit = time;
    const baseContactDamage = Number.isFinite(this.definition.contactDamage) ? this.definition.contactDamage : 8;
    const dm = this.scene?.bossOutgoingDamageMult ?? 1;
    const contactDamage = Math.max(
      contactTuning.minDamage,
      Math.floor(baseContactDamage * contactTuning.scale * dm)
    );
    const dealt = player.takeDamage(contactDamage, 0xff8b8b, { attackKind: "contact", boss: this });
    if (dealt > 0) {
      this.scene.spawnImpactEffect(player.x, player.y - 10, 0xff8b8b, 20);
    }
  }

  applyVulnerability(mult, durationMs) {
    const now = this.scene?.time?.now ?? 0;
    if (!this.vulnerabilityEffects) this.vulnerabilityEffects = [];
    this.vulnerabilityEffects.push({
      mult: Phaser.Math.Clamp(mult, 1, 2),
      expiresAt: now + (Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0)
    });
  }

  getVulnerabilityMultiplier() {
    if (!this.vulnerabilityEffects?.length) return 1;
    const now = this.scene?.time?.now ?? 0;
    this.vulnerabilityEffects = this.vulnerabilityEffects.filter((e) => e.expiresAt > now);
    if (!this.vulnerabilityEffects.length) return 1;
    return this.vulnerabilityEffects.reduce((best, e) => Math.max(best, e.mult), 1);
  }

  takeDamage(amount, hitColor) {
    let safeAmount = Number.isFinite(amount) ? amount : 0;
    const vulnMult = this.getVulnerabilityMultiplier();
    if (vulnMult > 1) {
      safeAmount = Math.round(safeAmount * vulnMult);
    }
    if (this.sharedHp) {
      this.sharedHp.current = Math.max(0, this.sharedHp.current - safeAmount);
      const h = this.sharedHp.current;
      this.health = h;
      if (this.twinSibling?.active) this.twinSibling.health = h;
      if (this.twinLeader?.active) this.twinLeader.health = h;
    } else {
      this.health = Math.max(0, this.health - safeAmount);
    }
    if (!Number.isFinite(this.health)) {
      this.health = Math.max(1, this.maxHealth * 0.5);
    }
    const tintTargets = [this];
    if (this.twinSibling?.active) tintTargets.push(this.twinSibling);
    if (this.twinLeader?.active) tintTargets.push(this.twinLeader);
    const uniq = [...new Set(tintTargets)];
    uniq.forEach((b) => {
      if (b?.active) b.setTint(hitColor || 0xfff0f0);
    });
    this.scene.time.delayedCall(80, () => {
      uniq.forEach((b) => {
        if (b?.active) b.clearTint();
      });
    });
    if (this.health <= 0) {
      if (this.definition?.id === "galeSovereign" && this.galeWindSphereContext) {
        this.endGaleWindSphereAttack();
      }
      const pair = [this];
      if (this.twinSibling?.active) pair.push(this.twinSibling);
      if (this.twinLeader?.active) pair.push(this.twinLeader);
      [...new Set(pair)].forEach((b) => {
        b.setVelocity(0, 0);
        if (b.body) b.body.enable = false;
        b.setTint(0x2f2f2f);
      });
      this.scene.onBossDefeated();
    }
  }
}

window.Boss = Boss;
