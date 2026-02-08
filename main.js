/* Referee Training V1+ (Phaser 3)
 * Pixel pitch + 2 players + 2 keepers.
 *
 * - Attacker (red) vs Defender (blue)
 * - Referee (yellow) is you: CONTACT incidents pause the sim.
 *   You decide FOUL / PLAY ON; if FOUL -> ADVANTAGE / STOP
 * - V1 rule: FOUL + STOP ends the position.
 *
 * Visual upgrades:
 * - Attack direction is random per scene (not always top->bottom).
 * - More randomized movement targets.
 * - High-likelihood foul contact triggers a small "slip" animation on the fouled player.
 * - Simple SHOT / SAVE / GOAL events (no referee decisions yet).
 * - Two keepers (purple + white) react laterally to ball.
 */

const UI = {
  game: document.getElementById('game'),
  simScreen: document.getElementById('simScreen'),
  simLog: document.getElementById('simLog'),
  simClock: document.getElementById('simClock'),
  simTests: document.getElementById('simTests'),
  testSimVisible: document.getElementById('testSimVisible'),
  testEventStream: document.getElementById('testEventStream'),
  testPositionFlow: document.getElementById('testPositionFlow'),
  testFullTime: document.getElementById('testFullTime'),
  btnContinueMatch: document.getElementById('btnContinueMatch'),
  btnNewMatch: document.getElementById('btnNewMatch'),
  scoreRed: document.getElementById('scoreRed'),
  scoreBlue: document.getElementById('scoreBlue'),
  pillSituation: document.getElementById('pillSituation'),
  pillHint: document.getElementById('pillHint'),
  pillTime: document.getElementById('pillTime'),
  pillMission: document.getElementById('pillMission'),
  prompt: document.getElementById('prompt'),
  btnFoul: document.getElementById('btnFoul'),
  btnNoFoul: document.getElementById('btnNoFoul'),
  btnAdv: document.getElementById('btnAdv'),
  btnStop: document.getElementById('btnStop'),
  btnReset: document.getElementById('btnReset'),
  btnContinue: document.getElementById('btnContinue'),
  hudMain: document.getElementById('hudMain'),
  hudSecondary: document.getElementById('hudSecondary'),
  hudFeedback: document.getElementById('hudFeedback'),
  feedback: document.getElementById('feedback'),
  hudWrap: document.querySelector('.hud'),
  decisionTimer: document.getElementById('decisionTimer'),
  decisionTimerBar: document.getElementById('decisionTimerBar'),
  debugPanel: document.getElementById('debugPanel'),
  dbgShotRandom: document.getElementById('dbgShotRandom'),
  dbgShotGoal: document.getElementById('dbgShotGoal'),
  dbgShotSave: document.getElementById('dbgShotSave'),
  dbgTriggerShot: document.getElementById('dbgTriggerShot'),
  dbgToggle: document.getElementById('dbgToggle'),
  dbgKeeperSkill: document.getElementById('dbgKeeperSkill'),
  dbgKeeperSkillVal: document.getElementById('dbgKeeperSkillVal'),
  dbgShotSpeed: document.getElementById('dbgShotSpeed'),
  dbgShotSpeedVal: document.getElementById('dbgShotSpeedVal'),
  dbgFeint: document.getElementById('dbgFeint'),
  dbgFeintVal: document.getElementById('dbgFeintVal'),
  dbgMisread: document.getElementById('dbgMisread'),
  dbgMisreadVal: document.getElementById('dbgMisreadVal'),
  dbgFatigueTop: document.getElementById('dbgFatigueTop'),
  dbgFatigueBottom: document.getElementById('dbgFatigueBottom'),
};

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(min, max) { return min + Math.random() * (max - min); }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Procedural dribble helpers
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
function signedAngleBetween(a, b) {
  const dot = a.x * b.x + a.y * b.y;
  const cross = a.x * b.y - a.y * b.x;
  return Math.atan2(cross, dot);
}
function wrapPi(x) {
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

// Dribble parameters (daha inertia / daha serbest)
const DRIBBLE = {
  forwardMin: 10,
  forwardMax: 18,
  sideBase: 5.5,
  sideTurnBoost: 3.0,
  strideAmp: 2.2,
  phaseBaseHz: 1.8,
  phaseSpeedHz: 0.010,
  footBiasMin: 4,          // top-down foot bias (px)
  footBiasMax: 10,
  kFree: 65,              // ↓ daha serbest (was 90)
  kTouch: 220,
  zetaFree: 1.25,         // ↑ daha smooth (was 1.10)
  zetaTouch: 1.05,
  maxBallSpeed: 520,
  regainRate: 1.8,
  loseTurnRate: 1.4,
  loseSpeedRate: 0.0012,
  closeDist: 20,
  maxLeash: 42,           // ↑ top daha uzağa gidebilir (was 34)
  leashK: 140,
};

const SOUND_ENABLED = false;
const DECISION_TIMER_ENABLED = false;

const RULES = {
  // Raising threshold reduces "everything is a foul" feeling.
  foulThreshold: 0.58,
  sigmoidK: 8.5,
  dtMs: 16,

  // visuals/gameplay
  minSeparation: 70,
  // Slightly larger so we can generate low/mid contacts before full collisions.
  incidentDistance: 22,
  incidentCooldownMs: 1400, // default; will be adapted per play-session

  // decision
  decisionTimeMs: 3500,     // deadline for FOUL_CALL decision (unused; timers disabled)
  advDecisionTimeMs: 2800,  // deadline for ADV_OR_STOP decision (unused; timers disabled)

  // cards
  yellowCardThreshold: 0.72,  // severity >= this => yellow candidate
  redCardThreshold: 0.88,     // severity >= this => red candidate
  repeatFoulYellowAfter: 2,   // 2nd foul on same player => yellow

  // keeper system (v1)
  keeperSkill: 0.62,          // 0..1 (higher = better)
  reactionMsMin: 90,
  reactionMsMax: 160,
  diveSpeed: 240,             // commit tween duration (ms)
  recoverMs: 360,
  positioningK: 0.08,         // pre-shot lateral tracking
  errorPxBase: 4,
  errorPxByEdge: 14,
  errorPxBySpeed: 10,
  fatiguePerDive: 0.12,       // v2: fatigue added per dive
  fatigueRecoverPerSec: 0.10, // v2: fatigue recovery per second
  misreadChance: 0.18,        // v2: chance to misread shot
  feintChance: 0.08,          // v2: chance of attacker feinting

  // ball physics (Sprint 1 / Gün 1)
  ballPickupDist: 18,       // distance for auto-pickup
  ballPickupRelSpeed: 80,   // max relative speed for pickup
  ballFrictionRebound: 0.985, // friction for loose ball (per frame)
  ballFrictionLoose: 0.975,   // stronger friction for loose ball

  // shot system
  shotZonePx: 110,          // distance to goal line to consider shooting
  shotCooldownMs: 1800,
  // Slower = more cinematic + readable.
  shotSpeed: 185,
  // Pure RNG outcome for shots (coin flip).
  saveChanceBase: 0.50,
  reboundMs: 520,
};

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
function foulProbability(severity) {
  const x = RULES.sigmoidK * (severity - RULES.foulThreshold);
  return sigmoid(x);
}
function hintFromP(p) {
  // Make HIGH rarer so UI isn't constantly "HIGH".
  if (p >= 0.82) return { label: 'HIGH', color: '#ff4a64' };
  if (p >= 0.55) return { label: 'MED', color: '#ffb020' };
  return { label: 'LOW', color: '#35d07f' };
}

function reasonFromIncidentFeatures({ relSpeed, distPx, speedN, closeN, heat }) {
  // Deterministic, short strings (pixel HUD friendly).
  const reasons = [];
  if (speedN >= 0.72) reasons.push('high speed');
  else if (speedN >= 0.45) reasons.push('speed');
  else reasons.push('low speed');

  if (closeN >= 0.72) reasons.push('very tight');
  else if (closeN >= 0.45) reasons.push('tight');
  else reasons.push('space');

  // Optional spice note (kept subtle)
  if (heat >= 1.18) reasons.push('spicy');

  // include one numeric hint for advanced players (kept small)
  const sp = Math.round(relSpeed);
  const dp = Math.round(distPx);
  return `${reasons[0]} + ${reasons[1]} · v${sp} d${dp}`;
}

function scoreDecision({ userFoul, userAdvantage }, gt) {
  let pts = 0;
  if (userFoul === gt.foulCall) pts += 10; else pts -= 12;
  if (userFoul === 'FOUL') {
    if (userAdvantage === gt.advantage) pts += 6; else pts -= 6;
  }
  const diff = clamp(1 - Math.abs(gt.severity - RULES.foulThreshold) * 2, 0, 1);
  pts *= (1 + 0.5 * diff);
  return Math.round(pts);
}

class RefereeScene extends Phaser.Scene {
  constructor() {
    super('RefereeScene');
  }

  // ========================================================================
  // BALL STATE MANAGEMENT (Sprint 1 / Gün 1)
  // Single source of truth: ball.ballState.{pos, vel}
  // ========================================================================

  ensureBallState(ball) {
    // Ensure ball has ballState (pos, vel as Vector2)
    if (!ball.ballState) {
      ball.ballState = {
        pos: new Phaser.Math.Vector2(ball.x, ball.y),
        vel: new Phaser.Math.Vector2(0, 0),
      };
    }
    return ball.ballState;
  }

  setBallMode(mode, opts = {}) {
    // Centralized mode switch with proper synchronization
    const { carrier, shotTarget, shotSpeed = RULES.shotSpeed, reboundVel } = opts;
    const bs = this.ensureBallState(this.ball);

    // Always sync current position before mode change
    bs.pos.set(this.ball.x, this.ball.y);

    const prevMode = this.play.ballMode;
    this.play.ballMode = mode;

    switch (mode) {
      case 'CARRIED':
        // Stop all velocity, ball follows carrier via dribble
        bs.vel.set(0, 0);
        this.play.ballVel.set(0, 0);
        if (carrier) {
          // Snap to carrier position
          bs.pos.set(carrier.pos.x, carrier.pos.y - 4);
        }
        break;

      case 'SHOT':
        // Set velocity toward shotTarget
        if (!shotTarget) {
          console.warn('setBallMode(SHOT) without shotTarget');
          bs.vel.set(0, 0);
          break;
        }
        const dir = new Phaser.Math.Vector2(shotTarget.x - bs.pos.x, shotTarget.y - bs.pos.y).normalize();
        bs.vel.copy(dir.scale(shotSpeed));
        this.play.ballVel.copy(bs.vel); // legacy sync
        break;

      case 'REBOUND':
        // Keep or set rebound velocity
        if (reboundVel) {
          bs.vel.copy(reboundVel);
          this.play.ballVel.copy(reboundVel);
        }
        // else keep current velocity
        break;

      default:
        console.warn(`Unknown ballMode: ${mode}`);
    }
  }

  setPossession(who, opts = {}) {
    // Centralized possession switch
    const { carrier, autoCarried = true } = opts;
    const prev = this.play.possession;
    this.play.possession = who;

    if (autoCarried && (who === 'attacker' || who === 'defender')) {
      const newCarrier = who === 'attacker' ? this.attacker : this.defender;
      this.setBallMode('CARRIED', { carrier: newCarrier });
    }
  }

  updateBall(time, dt) {
    // Single entry point for all ball updates
    // dt is already in seconds (RULES.dtMs / 1000)
    const bs = this.ensureBallState(this.ball);

    // Freeze ball integration when play is paused (UI can still update)
    if (!this.play.running && !this.replayMode) {
      this.ball.x = bs.pos.x;
      this.ball.y = bs.pos.y;
      this.ballOutline.x = bs.pos.x;
      this.ballOutline.y = bs.pos.y;
      return;
    }

    // Hit-stop: freeze ball physics for a brief moment
    if (this.play.hitStopUntil && time < this.play.hitStopUntil) {
      this.ball.x = bs.pos.x;
      this.ball.y = bs.pos.y;
      this.ballOutline.x = bs.pos.x;
      this.ballOutline.y = bs.pos.y;
      return;
    }

    switch (this.play.ballMode) {
      case 'CARRIED':
        this.updateCarriedBall(time, dt);
        break;
      case 'SHOT':
        this.updateShotBall(time, dt); // Pass time for collision check
        break;
      case 'REBOUND':
        this.updateLooseBall(time, dt);
        break;
      default:
        console.warn(`Unknown ballMode in updateBall: ${this.play.ballMode}`);
    }

    // CRITICAL: Render sync (single source of truth)
    this.ball.x = bs.pos.x;
    this.ball.y = bs.pos.y;
    this.ballOutline.x = bs.pos.x;
    this.ballOutline.y = bs.pos.y;

    // Depth: ball in front/behind based on y (simple y-sorting)
    this.ball.setDepth(Math.round(bs.pos.y));
    this.ballOutline.setDepth(Math.round(bs.pos.y) - 1);
  }

  updateCarriedBall(time, dt) {
    // Auto turnover logic
    if (this.play.possession === 'defender' && this.play.turnoverAt && time >= this.play.turnoverAt) {
      this.setPossession('attacker', { carrier: this.attacker });
      this.showFeedback('warn', 'POSSESSION!', { ms: 700 });
      return;
    }

    // Get carrier
    const carrier = (this.play.possession === 'defender') ? this.defender : this.attacker;
    if (!carrier) {
      console.warn('CARRIED mode but no valid carrier');
      return;
    }

    // Procedural dribble (updates ball.ballState internally)
    this.updateDribble(carrier, this.ball, dt);
  }

  updateShotBall(time, dt) {
    // Linear motion (ballState.vel is constant)
    const bs = this.ball.ballState;
    bs.pos.x += bs.vel.x * dt;
    bs.pos.y += bs.vel.y * dt;

    // If outcome is pre-decided as GOAL, skip keeper collision
    if (this.play?.shotOutcome === 'GOAL') {
      const boost = (this.play.trailBoostUntil && time < this.play.trailBoostUntil) ? 2 : 1;
      this.spawnBallTrail(bs.pos.x, bs.pos.y, boost);
      return;
    }

    // FIX: Check keeper collision during shot (early save trigger)
    const keeper = this.keeperForTarget(this.play.shotTargetSide);
    if (keeper) {
      const distToKeeper = Phaser.Math.Distance.Between(
        bs.pos.x, bs.pos.y,
        keeper.pos.x, keeper.pos.y
      );
      
      // If ball is very close to keeper (collision), trigger early save/goal check
      if (distToKeeper < 15) {
        // Determine outcome first
        const shot = this.play.shot || { edgeN: 0, speedN: 0 };
        const outcome = this.resolveShotVsKeeper(shot, keeper);
        const saved = outcome !== 'MISS';
        this.play.saveType = outcome;
        
        // Show appropriate collision effect based on outcome
        if (saved) {
          // SAVE: White impact flash
          const flash = this.add.rectangle(bs.pos.x, bs.pos.y, 12, 12, 0xffffff, 0.8).setOrigin(0.5);
          flash.setDepth(25);
          this.tweens.add({
            targets: flash,
            alpha: 0,
            scaleX: 2,
            scaleY: 2,
            duration: 150,
            ease: 'Cubic.easeOut',
            onComplete: () => flash.destroy()
          });
        }
        // If GOAL, no collision effect - ball continues to goal line
        
        // Resolve outcome
        this.endShotOutcome(saved ? 'SAVE' : 'GOAL');
        return; // Stop further motion
      }
    }

    // Trail effect
    const boost = (this.play.trailBoostUntil && time < this.play.trailBoostUntil) ? 2 : 1;
    this.spawnBallTrail(bs.pos.x, bs.pos.y, boost);
  }

  updateLooseBall(time, dt) {
    // Loose ball with friction + auto-pickup
    const bs = this.ball.ballState;
    
    // Apply velocity
    bs.pos.x += bs.vel.x * dt;
    bs.pos.y += bs.vel.y * dt;

    // Friction
    const friction = RULES.ballFrictionRebound;
    bs.vel.scale(friction);

    // Clamp to bounds
    const b = this.bounds;
    if (bs.pos.x < b.minX || bs.pos.x > b.maxX) {
      bs.vel.x *= -0.5; // bounce + damping
      bs.pos.x = clamp(bs.pos.x, b.minX, b.maxX);
    }
    if (bs.pos.y < b.minY || bs.pos.y > b.maxY) {
      bs.vel.y *= -0.5;
      bs.pos.y = clamp(bs.pos.y, b.minY, b.maxY);
    }

    // Trail
    this.spawnBallTrail(bs.pos.x, bs.pos.y, 1);

    // Auto-pickup condition
    this.checkBallPickup(time);

    // Timed rebound end (legacy support)
    if (this.play.reboundUntil && time >= this.play.reboundUntil) {
      this.play.reboundUntil = 0;
      this.setPossession('attacker', { carrier: this.attacker });
      this.showFeedback('warn', 'ATTACKER', { ms: 500 });
    }
  }

  checkBallPickup(time) {
    // Check if any player is close enough to pick up the ball
    const bs = this.ball.ballState;
    const players = [
      { obj: this.attacker, who: 'attacker' },
      { obj: this.defender, who: 'defender' },
    ];

    for (const { obj, who } of players) {
      const dist = Phaser.Math.Distance.Between(bs.pos.x, bs.pos.y, obj.pos.x, obj.pos.y);
      if (dist > RULES.ballPickupDist) continue;

      // Check relative speed
      const relVel = bs.vel.clone().subtract(obj.vel);
      const relSpeed = relVel.length();
      if (relSpeed > RULES.ballPickupRelSpeed) continue;

      // Pickup!
      this.setPossession(who, { carrier: obj });
      this.showFeedback('warn', `${who.toUpperCase()} PICKUP`, { ms: 500 });
      break;
    }
  }

  // ========================================================================
  // END BALL STATE MANAGEMENT
  // ========================================================================

  create() {
    // Internal resolution for pixel vibe
    this.W = 360;
    this.H = 640;

    // procedural audio context
    this.audioCtx = SOUND_ENABLED ? new (window.AudioContext || window.webkitAudioContext)() : null;

    // ring buffer for replay (store last 1.5s of positions @ 60fps = ~90 frames)
    this.replayBuffer = [];
    this.replayBufferMaxFrames = 90;
    this.replayMode = false;
    this.replayFrameIdx = 0;

    // dribble scratch vectors (module-level style, avoid per-frame allocs)
    this._tmpDir = new Phaser.Math.Vector2();
    this._tmpRight = new Phaser.Math.Vector2();
    this._tmpDesired = new Phaser.Math.Vector2();
    this._tmpFwd = new Phaser.Math.Vector2();
    this._tmpSide = new Phaser.Math.Vector2();

    // tiny pixel particle textures (dust + trail)
    this.makeParticleTextures();

    // small camera polish
    this.cameras.main.setRoundPixels(true);

    // camera follow state
    this.cameraTarget = new Phaser.Math.Vector2(0, 0);
    this.cameraPos = new Phaser.Math.Vector2(0, 0);

    this.bounds = { minX: 18, maxX: this.W - 18, minY: 66, maxY: this.H - 66 };
    this.goal = {
      topY: 64,
      bottomY: this.H - 64,
      xMin: this.W / 2 - 46,  // Goal width: 92px centered
      xMax: this.W / 2 + 46,
      xMin: this.W / 2 - 46,
      xMax: this.W / 2 + 46,
    };

    // Scores (referee performance)
    this.refScore = { red: 0, blue: 0 };

    // Play state
    this.play = {
      running: false,
      mode: 'PITCH',           // PITCH | SIM
      matchStartMs: null,
      matchDurationMs: 120000,
      matchScore: { red: 0, blue: 0 },
      eventLog: [],
      maxPositions: 7,
      positionCount: 0,
      nextPositionAtMs: 0,
      simUntilMs: 0,
      nextSimEventAt: 0,
      simStartAt: 0,
      simNextAttackingTeam: null,
      halfTimeShown: false,
      fullTimeShown: false,
      fullTime: false,
      startMs: 0,
      incident: null,
      waitingFor: null,
      // who is attacking this scene?
      attacking: 'red',          // 'red' | 'blue'
      attackDir: -1,             // direction of the attacking team: -1 => attacks up, +1 => attacks down
      lane: 'center',
      phase: 'DRIBBLE',
      ballMode: 'CARRIED',       // CARRIED | SHOT | REBOUND
      ballVel: new Phaser.Math.Vector2(0, 0),
      possession: 'attacker',    // 'attacker' | 'defender' | 'loose'
      turnoverAt: 0,
      lastShotAt: 0,
      incidentCooldownUntil: 0,
      shotTargetX: this.W / 2,
      shotTargetSide: null,      // 'TOP' | 'BOTTOM'
      pendingSimReason: null,
      pendingSimOpts: null,
    };

    this.makePitch();

    // Entities (players are fixed by color; roles (attacker/defender) swap per scene)
    this.redPlayer = this.makePlayer('red', 0xff3b3b);
    this.bluePlayer = this.makePlayer('blue', 0x3aa0ff);
    this.attacker = this.redPlayer;
    this.defender = this.bluePlayer;

    this.refSprite = this.makePlayer('ref', 0xffd34a);

    // Keepers (purple top, white bottom)
    this.keeperTop = this.makeKeeper('keeperTop', 0x8b5cf6);   // purple
    this.keeperBottom = this.makeKeeper('keeperBottom', 0xf3f4f6); // white

    // Ball: add outline + slightly bigger so it's always readable.
    this.ballOutline = this.add.rectangle(0, 0, 7, 7, 0x0b0f12, 0.9).setOrigin(0.5);
    this.ballOutline.setDepth(5);
    this.ballOutline.alpha = 1; // Ensure alpha is 1 for fade effects
    this.ball = this.add.rectangle(0, 0, 5, 5, 0xf3f4f6, 1).setOrigin(0.5);
    this.ball.setDepth(6);
    this.ball.alpha = 1; // Ensure alpha is 1 for fade effects


    // Debug state (shot outcome override)
    this.debug = {
      shotOutcome: 'RANDOM', // RANDOM | GOAL | SAVE
      panelVisible: true,
    };

    // UI wiring
    UI.btnReset.addEventListener('click', () => this.startPosition(this.time.now));
    UI.btnFoul.addEventListener('click', () => this.onUserFoulCall('FOUL'));
    UI.btnNoFoul.addEventListener('click', () => this.onUserFoulCall('NO_FOUL'));
    UI.btnAdv.addEventListener('click', () => this.onUserAdvStop('ADVANTAGE'));
    UI.btnStop.addEventListener('click', () => this.onUserAdvStop('STOP'));
    UI.btnContinue?.addEventListener('click', () => this.onContinueAfterGoal());
    UI.btnNewMatch?.addEventListener('click', () => this.startMatch(this.time.now));
    UI.btnContinueMatch?.addEventListener('click', () => this.startPosition(this.time.now));

    // Debug UI wiring
    UI.dbgShotRandom?.addEventListener('click', () => { this.debug.shotOutcome = 'RANDOM'; });
    UI.dbgShotGoal?.addEventListener('click', () => { this.debug.shotOutcome = 'GOAL'; });
    UI.dbgShotSave?.addEventListener('click', () => { this.debug.shotOutcome = 'SAVE'; });
    UI.dbgTriggerShot?.addEventListener('click', () => { this.debugTriggerShot(); });
    UI.dbgToggle?.addEventListener('click', () => {
      this.debug.panelVisible = !this.debug.panelVisible;
      if (UI.debugPanel) {
        UI.debugPanel.classList.toggle('minimized', !this.debug.panelVisible);
      }
      if (UI.dbgToggle) UI.dbgToggle.textContent = this.debug.panelVisible ? 'HIDE' : 'SHOW';
    });

    // Debug sliders
    UI.dbgKeeperSkill?.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      RULES.keeperSkill = v;
      if (UI.dbgKeeperSkillVal) UI.dbgKeeperSkillVal.textContent = v.toFixed(2);
    });
    UI.dbgShotSpeed?.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      RULES.shotSpeed = v;
      if (UI.dbgShotSpeedVal) UI.dbgShotSpeedVal.textContent = String(Math.round(v));
    });
    UI.dbgFeint?.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      RULES.feintChance = v;
      if (UI.dbgFeintVal) UI.dbgFeintVal.textContent = v.toFixed(2);
    });
    UI.dbgMisread?.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      RULES.misreadChance = v;
      if (UI.dbgMisreadVal) UI.dbgMisreadVal.textContent = v.toFixed(2);
    });

    // Init slider values
    if (UI.dbgKeeperSkill) UI.dbgKeeperSkill.value = String(RULES.keeperSkill);
    if (UI.dbgKeeperSkillVal) UI.dbgKeeperSkillVal.textContent = RULES.keeperSkill.toFixed(2);
    if (UI.dbgShotSpeed) UI.dbgShotSpeed.value = String(RULES.shotSpeed);
    if (UI.dbgShotSpeedVal) UI.dbgShotSpeedVal.textContent = String(RULES.shotSpeed);
    if (UI.dbgFeint) UI.dbgFeint.value = String(RULES.feintChance);
    if (UI.dbgFeintVal) UI.dbgFeintVal.textContent = RULES.feintChance.toFixed(2);
    if (UI.dbgMisread) UI.dbgMisread.value = String(RULES.misreadChance);
    if (UI.dbgMisreadVal) UI.dbgMisreadVal.textContent = RULES.misreadChance.toFixed(2);

    this.enableMainButtons(false);
    this.setDecisionMode('none');
    this.setPrompt('A position will start in a moment.');
    this.setPills({ situation: 'WAITING', hint: '—', hintColor: null });

    // mission system disabled for match score mode
    if (UI.pillMission) UI.pillMission.hidden = true;

    this.startMatch(this.time.now);
  }

  updateReferee(time, dt) {
    const ref = this.refSprite;
    if (!ref) return;
    if (this.play?.waitingForGoalContinue) return; // freeze during goal-continue

    // --- 1) focus = midpoint(attacker, defender)
    const focus = this.attacker.pos.clone().add(this.defender.pos).scale(0.5);

    // --- 2) ideal position on a trailing ring (100–150px behind focus)
    const desiredDist = this.play.refDesiredDist ?? 125;
    const avoidDist = this.play.refAvoidDist ?? 100;
    const hudClear = this.play.refHudClear ?? 90;

    let dir = ref.pos.clone().subtract(focus);
    const dirLen = dir.length();
    if (dirLen < 0.001) dir = new Phaser.Math.Vector2(0, 1);
    else dir.scale(1 / dirLen);

    let ideal = focus.clone().add(dir.clone().scale(desiredDist));

    // --- 4) avoid overlap with players (push away if too close)
    const push = new Phaser.Math.Vector2(0, 0);
    const repelFrom = (p) => {
      const away = ref.pos.clone().subtract(p.pos);
      const d = away.length();
      if (d < 0.001 || d >= avoidDist) return;
      const strength = (avoidDist - d) / avoidDist; // 0..1
      away.scale(1 / d);
      // push in "world px" (applied to ideal)
      push.add(away.scale(80 * strength));
    };
    repelFrom(this.attacker);
    repelFrom(this.defender);
    ideal.add(push);

    // --- 5) bounds + HUD clearance
    const b = this.bounds;
    const maxY = b.maxY - hudClear;
    ideal.x = clamp(ideal.x, b.minX + 10, b.maxX - 10);
    ideal.y = clamp(ideal.y, b.minY + 10, maxY);

    // --- 6) incident pause behavior: micro step, then lock (no jitter)
    const inDecision = !!this.play.incident && (this.play.waitingFor === 'FOUL_CALL' || this.play.waitingFor === 'ADV_OR_STOP');
    if (inDecision) {
      const until = this.play.refPauseMoveUntil ?? 0;
      if (until > 0 && time < until) {
        // allow a small approach toward the focus, but never closer than 100px
        const df = ref.pos.clone().subtract(focus);
        const dFocus = df.length();
        if (dFocus < 100) {
          const safeDir = dFocus < 0.001 ? new Phaser.Math.Vector2(0, 1) : df.scale(1 / dFocus);
          ideal = focus.clone().add(safeDir.scale(100));
        }
        // slightly higher cap so the micro step is visible
        this._moveRefTowards(ideal, dt, this.play.refArriveK ?? 0.9, 110, this.play.refSmooth ?? 0.09);
      } else {
        // lock in place during decision UI
        this.play.refPauseMoveUntil = 0;
        ref.vel.set(0, 0);
      }
    } else {
      // --- 3) arrive + smoothing (no jitter)
      this._moveRefTowards(
        ideal,
        dt,
        this.play.refArriveK ?? 0.9,
        this.play.refMaxSpeed ?? 75,
        this.play.refSmooth ?? 0.09
      );
    }

    // clamp final position
    ref.pos.x = clamp(ref.pos.x, b.minX + 10, b.maxX - 10);
    ref.pos.y = clamp(ref.pos.y, b.minY + 10, maxY);

    // --- 7) "look direction" toward focus (simple head offset)
    if (ref.kind === 'ref' && ref.list?.length >= 4) {
      const head = ref.list[3];
      const s = Math.sign(focus.x - ref.pos.x);
      head.x = s === 0 ? 0 : s * 1;
    }
  }

  _moveRefTowards(target, dt, arriveK, maxSpeed, smoothFactor) {
    const ref = this.refSprite;
    const toTarget = target.clone().subtract(ref.pos);
    const dist = toTarget.length();
    if (dist < 0.001) {
      ref.vel.lerp(new Phaser.Math.Vector2(0, 0), smoothFactor);
      return;
    }
    const speed = clamp(dist * arriveK, 0, maxSpeed);
    const desired = toTarget.scale(1 / dist).scale(speed);
    ref.vel.lerp(desired, smoothFactor);
    ref.pos.add(ref.vel.clone().scale(dt));
  }

  startKeeperCommit(targetSide, shotTargetX, shotSpeed = RULES.shotSpeed) {
    const keeper = this.keeperForTarget(targetSide);
    if (!keeper) return;

    // cancel any previous commit tweens
    if (keeper._commitTween) keeper._commitTween.stop();
    if (keeper._recoverTween) keeper._recoverTween.stop();

    const leftX = this.goal.xMin + 6;
    const rightX = this.goal.xMax - 6;

    // Keeper fatigue (v2)
    keeper._fatigue = clamp((keeper._fatigue || 0) + RULES.fatiguePerDive, 0, 0.8);

    // Keeper dives toward the ball target with small error margin
    // Error increases with distance from center + shot speed
    const distFromCenter = Math.abs(shotTargetX - this.W / 2);
    const edgeN = clamp(distFromCenter / (this.goal.xMax - this.W / 2), 0, 1);
    const speedN = clamp(shotSpeed / 240, 0, 1);
    const skill = RULES.keeperSkill;
    const maxError = RULES.errorPxBase
      + RULES.errorPxByEdge * edgeN
      + RULES.errorPxBySpeed * speedN
      - skill * 6
      + (keeper._fatigue || 0) * 10;
    const error = rand(-Math.max(2, maxError), Math.max(2, maxError));

    // If outcome is GOAL, make keeper dive the wrong way (miss)
    const misread = (Math.random() < RULES.misreadChance * (1 - skill));
    const miss = (this.play?.shotOutcome === 'GOAL') || misread;
    let diveTargetX = shotTargetX + error;
    if (miss) {
      // Mirror across center to dive away from the ball
      diveTargetX = (this.W / 2) - (shotTargetX - this.W / 2) + rand(-6, 6);
    }
    diveTargetX = clamp(diveTargetX, leftX, rightX);

    // store for later recovery
    this.play.committedKeeper = keeper;
    keeper._commitActive = true;
    keeper._commitTargetX = diveTargetX;

    const startX = keeper.pos.x;
    const startY = keeper.pos.y;
    const diveDir = Math.sign(diveTargetX - startX) || 1;

    // Dive also moves slightly toward the ball (forward leap)
    const diveDistanceX = Math.abs(diveTargetX - startX);
    const diveForwardY = Math.min(diveDistanceX * 0.3, 12); // slight forward jump
    const targetY = startY + (targetSide === 'TOP' ? diveForwardY : -diveForwardY);

    const basePose = {
      rotation: keeper.rotation || 0,
      scaleX: keeper.scaleX || 1,
      scaleY: keeper.scaleY || 1,
    };
    keeper._basePose = basePose;
    keeper._startY = startY;

    // reaction delay + telegraph ("set") before dive
    const reactionMs = rand(RULES.reactionMsMin, RULES.reactionMsMax);
    keeper._reactionDelay = reactionMs;
    if (keeper._telegraphTween) keeper._telegraphTween.stop();
    keeper._telegraphTween = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 120,
      ease: 'Cubic.easeOut',
      onUpdate: (tw) => {
        const t = tw.getValue();
        keeper.scaleY = lerp(basePose.scaleY, basePose.scaleY * 0.9, t);
        keeper.scaleX = lerp(basePose.scaleX, basePose.scaleX * 1.05, t);
      },
      onComplete: () => { keeper._telegraphTween = null; }
    });

    this.time.delayedCall(reactionMs, () => {
      // quick committed dive (more dramatic)
      keeper._commitTween = this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: RULES.diveSpeed,
        ease: 'Cubic.easeOut',
        onUpdate: (tw) => {
          const t = tw.getValue();
          keeper.pos.x = lerp(startX, diveTargetX, t);
          keeper.pos.y = lerp(startY, targetY, Phaser.Math.Easing.Sine.Out(t));
          // lean heavily into the dive direction
          keeper.rotation = diveDir * lerp(0, Math.PI / 3.2, t);
          // dramatic squash+stretch
          keeper.scaleX = lerp(basePose.scaleX, basePose.scaleX * 1.3, t);
          keeper.scaleY = lerp(basePose.scaleY, basePose.scaleY * 0.82, t);
        },
        onComplete: () => {
          keeper._commitTween = null;
        }
      });
    });
  }

  recoverKeeperCommit() {
    const keeper = this.play?.committedKeeper;
    if (!keeper) return;

    if (keeper._commitTween) keeper._commitTween.stop();
    if (keeper._recoverTween) keeper._recoverTween.stop();

    const base = keeper._basePose || { rotation: 0, scaleX: 1, scaleY: 1 };
    const fromX = keeper.pos.x;
    const fromY = keeper.pos.y;
    const toX = keeper.homeX ?? this.W / 2;
    const toY = keeper.homeY ?? (keeper._startY || keeper.pos.y);
    const fromRot = keeper.rotation || 0;
    const fromSX = keeper.scaleX || 1;
    const fromSY = keeper.scaleY || 1;

    keeper._recoverTween = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: RULES.recoverMs,
      ease: 'Back.easeOut',
      onUpdate: (tw) => {
        const t = tw.getValue();
        keeper.pos.x = lerp(fromX, toX, t);
        keeper.pos.y = lerp(fromY, toY, t);
        keeper.rotation = lerp(fromRot, base.rotation, t);
        keeper.scaleX = lerp(fromSX, base.scaleX, t);
        keeper.scaleY = lerp(fromSY, base.scaleY, t);
      },
      onComplete: () => {
        keeper._recoverTween = null;
        keeper._commitActive = false;
        keeper._commitTargetX = null;
        keeper.rotation = base.rotation;
        keeper.scaleX = base.scaleX;
        keeper.scaleY = base.scaleY;
      }
    });

    this.play.committedKeeper = null;
  }

  makePitch() {
    const g = this.add.graphics();
    g.setDepth(0);

    // base
    g.fillStyle(0x0f3b24, 1);
    g.fillRoundedRect(8, 56, this.W - 16, this.H - 120, 14);

    // stripes
    for (let i = 0; i < 7; i++) {
      const y = 56 + i * ((this.H - 120) / 7);
      const h = (this.H - 120) / 7;
      g.fillStyle(i % 2 === 0 ? 0x114428 : 0x0f3b24, 1);
      g.fillRect(8, y, this.W - 16, h);
    }

    // lines
    g.lineStyle(2, 0xbfe8cf, 0.55);
    g.strokeRoundedRect(14, 62, this.W - 28, this.H - 132, 12);

    g.lineStyle(2, 0xbfe8cf, 0.35);
    g.lineBetween(18, this.H / 2, this.W - 18, this.H / 2);

    g.strokeCircle(this.W / 2, this.H / 2, 42);
    g.fillStyle(0xbfe8cf, 0.35);
    g.fillCircle(this.W / 2, this.H / 2, 2);

    // Penalty areas (ceza sahaları)
    g.lineStyle(2, 0xbfe8cf, 0.35);
    // TOP penalty area (Y: 70 to 130)
    g.strokeRect(this.W / 2 - 70, 70, 140, 60);
    // BOTTOM penalty area (Y: this.H - 130 to this.H - 70)
    // FIX: Daha goal line'a yakın, symmetrical
    g.strokeRect(this.W / 2 - 70, this.H - 130, 140, 60);

    // Goal lines (kale çizgileri)
    g.fillStyle(0xbfe8cf, 0.25);
    g.fillRect(this.W / 2 - 46, 56, 92, 10);  // TOP goal
    g.fillRect(this.W / 2 - 46, this.H - 64, 92, 10); // BOTTOM goal

    const vignette = this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0x000000, 0.18);
    vignette.setBlendMode(Phaser.BlendModes.MULTIPLY);
    vignette.setDepth(1);

    // goal net overlays (tiny, tasteful) for GOAL shake
    const makeNet = (y) => {
      const c = this.add.container(0, 0);
      c.setDepth(2);
      const net = this.add.graphics();
      net.lineStyle(1, 0xbfe8cf, 0.35);
      // mouth
      net.strokeRect(this.W / 2 - 46, y - 2, 92, 10);
      // a few vertical strands
      for (let i = 0; i <= 6; i++) {
        const x = (this.W / 2 - 46) + i * (92 / 6);
        net.lineBetween(x, y - 2, x, y + 8);
      }
      c.add(net);
      c.x = 0; c.y = 0;
      c._g = net;
      return c;
    };
    this.netTopFx = makeNet(56);
    this.netBottomFx = makeNet(this.H - 64);
  }

  playGoalNetFx(side) {
    const net = side === 'TOP' ? this.netTopFx : this.netBottomFx;
    if (!net) return;
    if (net._tw) net._tw.stop();
    if (net._twScale) net._twScale.stop();
    net.x = 0; net.y = 0;
    net.scaleY = 1;
    net.alpha = 0.7;
    net._tw = this.tweens.add({
      targets: net,
      x: { from: 0, to: rand(-2, 2) },
      y: { from: 0, to: rand(-1, 1) },
      duration: 70,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        net._tw = null;
        net.x = 0; net.y = 0;
        net.alpha = 1;
        net.scaleY = 1;
      }
    });

    // Net swing (vertical stretch)
    net._twScale = this.tweens.add({
      targets: net,
      scaleY: { from: 1, to: 1.25 },
      duration: 140,
      yoyo: true,
      repeat: 1,
      ease: 'Cubic.easeOut',
      onComplete: () => { net._twScale = null; net.scaleY = 1; }
    });
  }

  updateDribble(player, ball, dt) {
    // dt stability clamp
    dt = clamp(dt, 0, 1 / 30);

    // ensure state
    if (!player.dribble) {
      player.dribble = {
        phase: Math.random() * Math.PI * 2,
        control: 1,
        prevDir: new Phaser.Math.Vector2(0, 1),
      };
    }
    if (!ball.ballState) {
      ball.ballState = {
        pos: new Phaser.Math.Vector2(ball.x, ball.y),
        vel: new Phaser.Math.Vector2(0, 0),
      };
    }

    const bs = ball.ballState;
    const ds = player.dribble;
    const p = DRIBBLE;

    const pPos = player.pos;
    const pVel = player.vel;

    // dir from velocity; fallback to prevDir if nearly stopped
    const speed = pVel.length();
    let dirX = ds.prevDir.x, dirY = ds.prevDir.y;
    if (speed > 1e-3) {
      dirX = pVel.x / speed;
      dirY = pVel.y / speed;
    }
    const dir = this._tmpDir.set(dirX, dirY);

    // turning detection
    const turnAngle = wrapPi(signedAngleBetween(ds.prevDir, dir));
    ds.prevDir.copy(dir);

    // phase update
    const phaseHz = p.phaseBaseHz + p.phaseSpeedHz * speed;
    ds.phase = (ds.phase + (Math.PI * 2) * phaseHz * dt) % (Math.PI * 2);

    // touch window
    const ph = wrapPi(ds.phase);
    const w = 0.55;
    const touch = 1 - smoothstep(w * 0.55, w, Math.abs(ph));

    // control dynamics
    const ballToPlayerX = pPos.x - bs.pos.x;
    const ballToPlayerY = pPos.y - bs.pos.y;
    const distToPlayer = Math.hypot(ballToPlayerX, ballToPlayerY);

    const lose = (Math.abs(turnAngle) * p.loseTurnRate + speed * p.loseSpeedRate) * dt;
    let control = ds.control;
    control = clamp(control - lose, 0, 1);

    const near = 1 - smoothstep(p.closeDist * 0.7, p.closeDist, distToPlayer);
    control = clamp(control + p.regainRate * near * dt, 0, 1);
    ds.control = control;

    // forward offset
    const sN = clamp(speed / 140, 0, 1);
    const fwd = lerp(p.forwardMin, p.forwardMax, sN) + (1 - control) * 6.0;

    // side offset
    const sideSign = Math.sign(Math.sin(ds.phase)) || 1;
    const side = (p.sideBase + p.sideTurnBoost * Math.abs(Math.sign(turnAngle))) * sideSign * lerp(1.0, 0.55, 1 - control);

    // stride
    const stride = p.strideAmp * Math.sin(ds.phase * 2) * lerp(1.0, 0.4, 1 - control);

    // orthonormal basis
    const right = this._tmpRight.set(-dir.y, dir.x);

    // desiredPos
    const desired = this._tmpDesired
      .copy(pPos)
      .add(this._tmpFwd.copy(dir).scale(fwd + stride))
      .add(this._tmpSide.copy(right).scale(side));

    // foot bias: keep ball near "feet" depending on travel direction
    // dir.y > 0 (moving down) => push ball down; dir.y < 0 => push up
    const footBias = lerp(p.footBiasMin, p.footBiasMax, sN);
    desired.y += footBias * dir.y * clamp(Math.abs(dir.y), 0, 1);

    // spring blending
    const k = lerp(p.kFree, p.kTouch, touch);
    const zeta = lerp(p.zetaFree, p.zetaTouch, touch);
    const c = 2 * zeta * Math.sqrt(k);

    // spring force
    let ax = k * (desired.x - bs.pos.x) - c * bs.vel.x;
    let ay = k * (desired.y - bs.pos.y) - c * bs.vel.y;

    // leash
    const dx = desired.x - bs.pos.x;
    const dy = desired.y - bs.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist > p.maxLeash) {
      const over = dist - p.maxLeash;
      const nx = dx / dist;
      const ny = dy / dist;
      ax += p.leashK * over * nx;
      ay += p.leashK * over * ny;
    }

    // semi-implicit Euler integrate
    bs.vel.x += ax * dt;
    bs.vel.y += ay * dt;

    // clamp ball speed
    const bv = Math.hypot(bs.vel.x, bs.vel.y);
    if (bv > p.maxBallSpeed) {
      const s = p.maxBallSpeed / bv;
      bs.vel.x *= s;
      bs.vel.y *= s;
    }

    bs.pos.x += bs.vel.x * dt;
    bs.pos.y += bs.vel.y * dt;

    // display sync happens in updateBall()
  }

  makeParticleTextures() {
    // 1x1 pixel textures used for particles (dust + trail)
    if (!this.textures.exists('px')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 1, 1);
      g.generateTexture('px', 1, 1);
      g.destroy();
    }

    this.dust = this.add.particles(0, 0, 'px', {
      // short "puff" for stumble/slip
      lifespan: { min: 120, max: 220 },
      speed: { min: 12, max: 46 },
      angle: { min: 205, max: 335 },
      gravityY: 90,
      quantity: 0,
      scale: { start: 2.0, end: 0 },
      alpha: { start: 0.55, end: 0 },
      tint: [0xd7f2e3, 0xbfe8cf, 0xffffff],
      emitting: false,
    });
    // behind players/ball (feels like ground dust)
    this.dust.setDepth(3);

    this.trail = this.add.particles(0, 0, 'px', {
      lifespan: { min: 120, max: 200 },
      speed: { min: 0, max: 0 },
      quantity: 0,
      // more readable trail during shots
      scale: { start: 1.55, end: 0 },
      alpha: { start: 0.48, end: 0 },
      tint: [0xffffff, 0xd7f2e3, 0xbfe8cf],
      emitting: false,
    });
    this.trail.setDepth(9);

    // whistle "spark" (visual hint on CONTACT)
    this.whistle = this.add.particles(0, 0, 'px', {
      lifespan: { min: 120, max: 220 },
      speed: { min: 18, max: 85 },
      angle: { min: 240, max: 300 }, // mostly upwards
      gravityY: 120,
      quantity: 0,
      scale: { start: 1.6, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xfff3a1, 0xffd34a, 0xffffff],
      emitting: false,
    });
    this.whistle.setDepth(12);
  }

  spawnDust(x, y, n = 8) {
    if (!this.dust) return;
    this.dust.emitParticleAt(x, y, n);
  }

  spawnBallTrail(x, y, n = 1) {
    if (!this.trail) return;
    // low intensity trail
    this.trail.emitParticleAt(x, y, n);
  }

  spawnWhistleHint(x, y, n = 6) {
    if (!this.whistle) return;
    this.whistle.emitParticleAt(x, y, n);
  }

  spawnContactFlash(x, y) {
    if (!this._contactRing) {
      this._contactRing = this.add.circle(0, 0, 10);
      this._contactRing.setFillStyle(0xffffff, 0);
      this._contactRing.setStrokeStyle(2, 0xfff3a1, 1);
      this._contactRing.setDepth(13);
      this._contactRing.setVisible(false);
    }

    const ring = this._contactRing;
    ring.setVisible(true);
    ring.setPosition(Math.round(x), Math.round(y));
    ring.setScale(0.7);
    ring.setAlpha(1);

    // kill prior tween if any
    if (ring._tw) ring._tw.stop();
    ring._tw = this.tweens.add({
      targets: ring,
      scale: 1.55,
      alpha: 0,
      duration: 180,
      ease: 'Quad.easeOut',
      onComplete: () => {
        ring.setVisible(false);
        ring._tw = null;
      }
    });
  }

  stumbleSprite(container, dir = 1) {
    // micro "2–3 frame" stumble: body/head offset (pixel-y)
    if (!container || !container.list?.length) return;
    const [body, stripe, sock, head] = container.list;

    // cancel any previous stumble (prevents stacking timers)
    if (container._stumbleTimers?.length) {
      container._stumbleTimers.forEach(t => t.remove(false));
    }
    container._stumbleTimers = [];

    const base = {
      bodyX: body.x, bodyY: body.y,
      stripeX: stripe.x, stripeY: stripe.y,
      sockX: sock.x, sockY: sock.y,
      headX: head.x, headY: head.y,
    };

    const frame1 = () => {
      // lead with head a bit more than body
      body.x = base.bodyX + dir * 1;
      body.y = base.bodyY + 1;
      stripe.x = base.stripeX + dir * 1;
      stripe.y = base.stripeY + 1;
      head.x = base.headX + dir * 2;
      head.y = base.headY + 1;
    };

    const frame2 = () => {
      body.x = base.bodyX - dir * 1;
      body.y = base.bodyY;
      stripe.x = base.stripeX - dir * 1;
      stripe.y = base.stripeY;
      head.x = base.headX - dir * 1;
      head.y = base.headY - 1;
    };

    const reset = () => {
      body.x = base.bodyX; body.y = base.bodyY;
      stripe.x = base.stripeX; stripe.y = base.stripeY;
      sock.x = base.sockX; sock.y = base.sockY;
      head.x = base.headX; head.y = base.headY;
      container._stumbleTimers = [];
    };

    // 2–3 frames, timed like 60fps-ish "frames"
    frame1();
    container._stumbleTimers.push(this.time.delayedCall(48, frame2));
    container._stumbleTimers.push(this.time.delayedCall(96, reset));
  }

  makePlayer(kind, color) {
    const c = this.add.container(0, 0);
    c.kind = kind;

    // cheap pixel shadow (separate object; not affected by rotation/squash)
    c.shadow = this.add.ellipse(0, 0, 10, 4, 0x000000, 0.22).setOrigin(0.5);
    c.shadow.setDepth(2);

    const body = this.add.rectangle(0, 0, 8, 10, color, 1).setOrigin(0.5);
    const head = this.add.rectangle(0, -8, 6, 6, 0xf3f4f6, 1).setOrigin(0.5);
    const sock = this.add.rectangle(0, 7, 8, 2, 0x0b0f12, 1).setOrigin(0.5);
    const stripe = this.add.rectangle(0, 0, 2, 10, 0xffffff, 0.14).setOrigin(0.5);

    c.add([body, stripe, sock, head]);
    c.setDepth(kind === 'ref' ? 4 : 5);

    c.pos = new Phaser.Math.Vector2(0, 0);
    c.vel = new Phaser.Math.Vector2(0, 0);
    c.maxSpeed = kind === 'defender' ? 78 : 84;
    c.bodySize = 8;

    return c;
  }

  makeKeeper(kind, color) {
    const c = this.add.container(0, 0);
    c.kind = kind;

    c.shadow = this.add.ellipse(0, 0, 12, 5, 0x000000, 0.20).setOrigin(0.5);
    c.shadow.setDepth(2);

    const body = this.add.rectangle(0, 0, 10, 12, color, 1).setOrigin(0.5);
    const head = this.add.rectangle(0, -9, 7, 7, 0xf3f4f6, 1).setOrigin(0.5);
    const gloveL = this.add.rectangle(-7, 0, 3, 3, 0x0b0f12, 1).setOrigin(0.5);
    const gloveR = this.add.rectangle(7, 0, 3, 3, 0x0b0f12, 1).setOrigin(0.5);

    c.add([body, gloveL, gloveR, head]);
    c.setDepth(4);

    c.pos = new Phaser.Math.Vector2(0, 0);
    c.vel = new Phaser.Math.Vector2(0, 0);
    c.homeX = this.W / 2;
    c.homeY = 0;

    // dive target (used during SHOT)
    c.diveTargetX = c.homeX;

    return c;
  }

  // Procedural audio
  playWhistleSound() {
    if (!SOUND_ENABLED || !this.audioCtx) return;
    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(2800, now);
      osc.frequency.linearRampToValueAtTime(3400, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);
      osc.connect(gain).connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch (e) {
      console.warn('Whistle sound failed:', e);
    }
  }

  playThudSound() {
    if (!SOUND_ENABLED || !this.audioCtx) return;
    try {
      const now = this.audioCtx.currentTime;
      // Soft "puf" sound: low noise burst + lowpass filter
      const bufferSize = this.audioCtx.sampleRate * 0.08;
      const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        // soft noise, gently decaying
        const t = i / bufferSize;
        data[i] = (Math.random() * 2 - 1) * (1 - t) * 0.25;
      }

      const src = this.audioCtx.createBufferSource();
      const gain = this.audioCtx.createGain();
      const filter = this.audioCtx.createBiquadFilter();

      src.buffer = buffer;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(280, now);
      filter.Q.value = 0.7;

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      src.connect(filter).connect(gain).connect(this.audioCtx.destination);
      src.start(now);
    } catch (e) {
      console.warn('Thud sound failed:', e);
    }
  }

  determineCard(severity, foulCount) {
    // red card for extreme severity
    if (severity >= RULES.redCardThreshold && !this.play.defenderRedCard) return 'RED';
    // yellow card for high severity or repeat fouls
    if (severity >= RULES.yellowCardThreshold && !this.play.defenderYellowCard) return 'YELLOW';
    if (foulCount >= RULES.repeatFoulYellowAfter && !this.play.defenderYellowCard) return 'YELLOW';
    // second yellow => red
    if (this.play.defenderYellowCard && severity >= RULES.yellowCardThreshold) return 'RED';
    return null;
  }

  showCard(cardType) {
    const color = cardType === 'YELLOW' ? 0xffd34a : 0xff1744;
    const cx = this.W / 2;
    const cy = this.H / 2;
    const card = this.add.rectangle(cx, cy, 18, 26, color, 1).setOrigin(0.5).setDepth(100);
    this.tweens.add({
      targets: card,
      scaleX: 1.2,
      scaleY: 1.2,
      alpha: 0,
      duration: 800,
      ease: 'Back.easeOut',
      onComplete: () => card.destroy()
    });
  }

  startReplay() {
    if (this.replayBuffer.length === 0) return;
    this.replayMode = true;
    this.replayFrameIdx = 0;
  }

  startReplayThenSim(reason, opts = {}) {
    if (this.replayBuffer.length === 0) {
      this.enterSimMode(reason, opts);
      return;
    }
    this.play.pendingSimReason = reason;
    this.play.pendingSimOpts = opts;
    this.startReplay();
  }

  updateReplay() {
    // playback at 0.5x speed (skip every other update)
    if (this.replayFrameIdx % 2 === 0 && this.replayFrameIdx / 2 < this.replayBuffer.length) {
      const frame = this.replayBuffer[Math.floor(this.replayFrameIdx / 2)];
      this.attacker.x = Math.round(frame.attackerX);
      this.attacker.y = Math.round(frame.attackerY);
      this.defender.x = Math.round(frame.defenderX);
      this.defender.y = Math.round(frame.defenderY);
      this.ball.x = Math.round(frame.ballX);
      this.ball.y = Math.round(frame.ballY);
      this.ballOutline.x = this.ball.x;
      this.ballOutline.y = this.ball.y;
    }
    this.replayFrameIdx++;
    if (this.replayFrameIdx / 2 >= this.replayBuffer.length) {
      this.replayMode = false;
      this.replayFrameIdx = 0;
      if (this.play.pendingSimReason) {
        const reason = this.play.pendingSimReason;
        const opts = this.play.pendingSimOpts || {};
        this.play.pendingSimReason = null;
        this.play.pendingSimOpts = null;
        this.enterSimMode(reason, opts);
      }
    }
  }

  // --- MATCH FLOW (SIM + PITCH) ---

  startMatch(time) {
    this.play.mode = 'PITCH';
    this.play.matchStartMs = time;
    this.play.fullTime = false;
    this.play.fullTimeShown = false;
    this.play.halfTimeShown = false;
    this.play.simNextAttackingTeam = null;
    this.play.matchDurationMs = 120000; // 2 minutes real-time => 90' UI
    this.play.matchScore = { red: 0, blue: 0 };
    this.play.eventLog = [];
    this.play.positionCount = 0;
    this.play.maxPositions = 7;
    this.play.nextPositionAtMs = time;
    this.play.simUntilMs = 0;
    this.play.nextSimEventAt = 0;
    this.updateMatchScoreUI();
    this.setViewMode('PITCH');
    if (UI.simLog) UI.simLog.innerHTML = '';
    if (UI.btnContinueMatch) UI.btnContinueMatch.hidden = true;
    if (UI.btnNewMatch) UI.btnNewMatch.hidden = true;
    this.startPosition(time);
  }

  startPosition(time) {
    if (this.play.fullTime) return;
    if (this.play.positionCount >= this.play.maxPositions) {
      this.play.fullTime = true;
      this.enterSimMode('FULL TIME', { noNextPosition: true });
      return;
    }
    this.play.positionCount += 1;
    this.play.mode = 'PITCH';
    this.play.nextPositionAtMs = 0;
    this.play.simUntilMs = 0;
    this.play.nextSimEventAt = 0;
    this.play.simStartAt = 0;
    this.setViewMode('PITCH');
    this.pushSimEvent(`Position ${this.play.positionCount} starts`);
    this.resetScene();
  }

  enterSimMode(reason, opts = {}) {
    const { delayMs = 0, noNextPosition = false } = opts;
    const now = this.time.now;
    const remainingMs = (this.play.matchStartMs + this.play.matchDurationMs) - now;
    const positionsLeft = this.play.maxPositions - this.play.positionCount;
    const noNext = noNextPosition || remainingMs <= 0 || positionsLeft <= 0;

    this.play.mode = 'SIM';
    this.play.simNextAttackingTeam = noNext ? null : (Math.random() < 0.5 ? 'red' : 'blue');
    this.play.running = false;
    this.play.simStartAt = now + delayMs;
    this.setViewMode('SIM');
    if (reason) this.pushSimEvent(reason);
    if (UI.btnContinueMatch) UI.btnContinueMatch.hidden = reason !== 'HALF TIME';
    if (UI.btnNewMatch) UI.btnNewMatch.hidden = reason !== 'FULL TIME';

    if (noNext) {
      this.play.simUntilMs = 0;
      this.play.nextPositionAtMs = 0;
      this.play.nextSimEventAt = 0;
      return;
    }

    const simDur = rand(3000, 6000);
    const simUntil = this.play.simStartAt + simDur;
    this.play.simUntilMs = Math.min(simUntil, this.play.matchStartMs + this.play.matchDurationMs);
    this.play.nextPositionAtMs = this.play.simUntilMs;
    this.play.nextSimEventAt = this.play.simStartAt + rand(400, 900);
  }

  updateSimMode(time) {
    if (this.play.matchStartMs == null) return;
    if (!this.play.simStartAt) this.play.simStartAt = time;
    if (this.play.simStartAt && time < this.play.simStartAt) {
      this.updateSimTests(time);
      return;
    }
    if (this.play.fullTime) {
      this.updateSimTests(time);
      return;
    }
    if (!this.play.simUntilMs) {
      const simDur = rand(3000, 6000);
      this.play.simUntilMs = Math.min(time + simDur, this.play.matchStartMs + this.play.matchDurationMs);
      this.play.nextPositionAtMs = this.play.simUntilMs;
    }
    if (this.play.simUntilMs && time >= this.play.simUntilMs) {
      if (this.play.positionCount >= this.play.maxPositions) {
        this.play.fullTime = true;
        this.enterSimMode('FULL TIME', { noNextPosition: true });
      } else {
        this.startPosition(time);
      }
      return;
    }
    if (this.play.simUntilMs && !this.play.nextSimEventAt) {
      this.play.nextSimEventAt = time + rand(400, 900);
    }
    if (this.play.nextSimEventAt && time >= this.play.nextSimEventAt) {
      this.pushSimEvent(this.randomSimEvent());
      this.play.nextSimEventAt = time + rand(700, 1400);
    }
    this.updateSimTests(time);
  }

  setViewMode(mode) {
    const isSim = mode === 'SIM';
    if (UI.simScreen) UI.simScreen.hidden = !isSim;
    if (UI.game) {
      UI.game.style.visibility = isSim ? 'hidden' : '';
      UI.game.style.opacity = isSim ? '0' : '1';
      UI.game.style.pointerEvents = isSim ? 'none' : '';
    }
    if (UI.hudWrap) UI.hudWrap.style.display = isSim ? 'none' : '';
  }

  pushSimEvent(text) {
    if (!UI.simLog) return;
    const minute = this.getMatchMinute(this.time.now);
    const line = document.createElement('div');
    line.className = 'sim-line';
    line.innerHTML = `<span class="sim-time">${minute}'</span><span>${text}</span>`;
    UI.simLog.appendChild(line);
    this.play.lastSimEventAt = this.time.now;
    // keep last 24 lines
    while (UI.simLog.children.length > 24) {
      UI.simLog.removeChild(UI.simLog.firstChild);
    }
    UI.simLog.scrollTop = UI.simLog.scrollHeight;
  }

  setSimTest(el, label, status, state) {
    if (!el) return;
    el.textContent = `${label}: ${status}`;
    el.dataset.state = state;
  }

  updateSimTests(time) {
    if (!UI.simTests) return;
    const inSim = this.play.mode === 'SIM';
    this.setSimTest(UI.testSimVisible, 'SIM visible', inSim ? 'OK' : 'WAIT', inSim ? 'ok' : 'warn');
    if (!inSim) {
      this.setSimTest(UI.testEventStream, 'Event stream', '—', 'neutral');
      this.setSimTest(UI.testPositionFlow, 'Positions', `${this.play.positionCount}/${this.play.maxPositions}`, 'neutral');
      this.setSimTest(UI.testFullTime, 'Full time', this.play.fullTime ? 'YES' : 'NO', 'neutral');
      return;
    }
    const since = this.play.lastSimEventAt ? (time - this.play.lastSimEventAt) : null;
    if (since === null) {
      this.setSimTest(UI.testEventStream, 'Event stream', 'WAIT', 'warn');
    } else {
      const seconds = (since / 1000).toFixed(1);
      this.setSimTest(UI.testEventStream, 'Event stream', `${seconds}s`, since < 2.0 ? 'ok' : 'warn');
    }
    this.setSimTest(UI.testPositionFlow, 'Positions', `${this.play.positionCount}/${this.play.maxPositions}`, 'ok');
    this.setSimTest(UI.testFullTime, 'Full time', this.play.fullTime ? 'YES' : 'NO', this.play.fullTime ? 'ok' : 'neutral');
  }

  randomSimEvent() {
    const nextAttack = this.play.simNextAttackingTeam || this.play.attacking || (Math.random() < 0.5 ? 'red' : 'blue');
    const team = nextAttack === 'red' ? 'KIRMIZI' : 'MAVI';
    const opp = team === 'KIRMIZI' ? 'MAVI' : 'KIRMIZI';
    const events = [
      `Atak: ${team} yerleşiyor`,
      `Savunma: ${opp} blokta`,
      `Atak: ${team} hızlı çıkıyor`,
      `Savunma: ${opp} topu karşıladı`,
      `Sonuç: ${team} şutu auta gitti`,
      `Sonuç: ${team} şutu kaleyi bulmadı`,
      `Sonuç: ${opp} topu kazandı`,
      `Orta sahada paslaşma`,
      `Taç atışı`,
      `Köşe vuruşu hazırlanıyor`,
      `Uzun top denemesi`,
      `İkili mücadele`,
      `Kanat bindirmesi`,
    ];
    return choice(events);
  }

  getMatchMinute(time) {
    if (this.play.matchStartMs == null) return 0;
    const elapsed = clamp(time - this.play.matchStartMs, 0, this.play.matchDurationMs);
    return Math.floor((elapsed / this.play.matchDurationMs) * 90);
  }

  updateMatchClock(time) {
    if (this.play.matchStartMs == null) return;
    const minute = this.getMatchMinute(time);
    if (UI.pillTime) UI.pillTime.textContent = `${minute}'`;
    if (UI.simClock) UI.simClock.textContent = `${minute}'`;
  }

  updateMatchScoreUI() {
    if (!this.play.matchScore) return;
    UI.scoreRed.textContent = String(this.play.matchScore.red);
    UI.scoreBlue.textContent = String(this.play.matchScore.blue);
  }

  resetScene() {
    // Ensure ball is visible (may have been hidden after goal)
    if (this.ball) this.ball.visible = true;
    if (this.ballOutline) this.ballOutline.visible = true;
    
    // reset state
    this.play.running = false;
    this.play.incident = null;
    this.play.waitingFor = null;
    this.play.waitingForGoalContinue = false;
    this.play.phase = 'DRIBBLE';
    this.play.ballMode = 'CARRIED';
    this.play.ballVel.set(0, 0);
    this.play.possession = 'attacker';
    this.play.turnoverAt = 0;
    this.play.incidentCooldownUntil = 0;
    this.play.lastShotAt = 0;
    this.play.lastIncidentAt = 0;
    // adaptive incident density (ms)
    this.play.incidentCooldownMs = RULES.incidentCooldownMs;
    this.play._incidentTuneAt = 0;
    // streak/pressure tracking
    this.play.correctStreak = 0;
    this.play.wrongStreak = 0;
    // card tracking (persistent across scenes in session)
    if (this.play.defenderFouls === undefined) this.play.defenderFouls = 0;
    if (this.play.defenderYellowCard === undefined) this.play.defenderYellowCard = false;
    if (this.play.defenderRedCard === undefined) this.play.defenderRedCard = false;

    UI.hudSecondary.hidden = true;
    UI.hudFeedback.hidden = true;
    this.setDecisionMode('none');
    this.setContinueVisible(false);
    if (UI.hudWrap) UI.hudWrap.classList.remove('streak', 'pressure');

    // Randomize which side attacks (swap roles) + direction
    this.play.attacking = this.play.simNextAttackingTeam || (Math.random() < 0.5 ? 'red' : 'blue');
    this.play.simNextAttackingTeam = null;
    this.play.attackDir = Math.random() < 0.5 ? -1 : 1;

    // "Scene heat" influences how spicy contacts are (but not always HIGH).
    // clean: fewer/softer incidents, spicy: more frequent/harder challenges.
    this.play.sceneType = Math.random() < 0.25 ? 'clean' : (Math.random() < 0.55 ? 'normal' : 'spicy');
    this.play.sceneHeat = this.play.sceneType === 'clean' ? rand(0.78, 0.92)
      : this.play.sceneType === 'spicy' ? rand(1.05, 1.25)
        : rand(0.92, 1.08);

    // Tempo variation per scene (feel): build-up vs steady vs burst.
    // We apply this as a multiplier to maxSpeed + to target refresh timing.
    this.play.tempoType = choice(['build', 'steady', 'burst']);
    this.play.tempoStart = this.play.tempoType === 'build' ? rand(0.72, 0.86) : (this.play.tempoType === 'burst' ? rand(1.05, 1.15) : rand(0.92, 1.05));
    this.play.tempoEnd = this.play.tempoType === 'build' ? rand(1.02, 1.14) : this.play.tempoStart;
    this.play.tempoRampMs = this.play.tempoType === 'build' ? rand(2400, 3800) : 0;

    // Randomize attack corridor style (keeps it from feeling straight-line)
    this.play.lane = choice(['center', 'left', 'right', 'diagonal']);

    // Assign roles based on who attacks
    this.attacker = this.play.attacking === 'red' ? this.redPlayer : this.bluePlayer;
    this.defender = this.play.attacking === 'red' ? this.bluePlayer : this.redPlayer;

    // Per-scene speed tuning (adds variety, helps avoid identical outcomes)
    this.attacker.maxSpeed = rand(82, 94);
    this.defender.maxSpeed = rand(76, 90);

    // Spawn players closer to ref but not overlapping.
    const b = this.bounds;
    const centerY = this.H / 2;

    // Attacking side starts on its attacking half depending on direction.
    // If attacking UP (-1): attacker starts lower half; else upper half.
    const attackerStartY = this.play.attackDir === -1 ? rand(centerY + 60, b.maxY - 120) : rand(b.minY + 120, centerY - 60);
    const defenderStartY = this.play.attackDir === -1 ? rand(b.minY + 120, centerY - 20) : rand(centerY + 20, b.maxY - 120);

    // X positions: slightly offset so they don't collapse instantly.
    let ax = this.W / 2 + rand(-70, 70);
    let dx = this.W / 2 + rand(-70, 70);

    // Ensure min separation
    let tries = 0;
    while (tries++ < 12) {
      const d = Phaser.Math.Distance.Between(ax, attackerStartY, dx, defenderStartY);
      if (d >= RULES.minSeparation) break;
      dx = this.W / 2 + rand(-90, 90);
    }

    this.attacker.pos.set(ax, attackerStartY);
    this.defender.pos.set(dx, defenderStartY);
    this.attacker.vel.set(0, 0);
    this.defender.vel.set(0, 0);

    // Referee closer to action (near center) but not colliding
    const refY = clamp((attackerStartY + defenderStartY) / 2 + rand(-40, 40), centerY - 40, centerY + 90);
    const refX = clamp(this.W / 2 + rand(-40, 40), b.minX + 20, b.maxX - 20);
    this.refSprite.pos.set(refX, refY);
    this.refSprite.vel.set(0, 0);
    // Referee movement tuning (per scene)
    this.play.refDesiredDist = rand(100, 150);
    this.play.refMaxSpeed = rand(60, 85);
    this.play.refSmooth = rand(0.06, 0.12);
    this.play.refArriveK = 0.9;
    this.play.refAvoidDist = 100;
    this.play.refHudClear = 90;
    this.play.refPauseMoveUntil = 0;

    // Keepers (FIX: Adjusted Y positions to be inside penalty areas)
    this.keeperTop.pos.set(this.W / 2, 78);
    this.keeperTop.homeY = 78;
    this.keeperBottom.pos.set(this.W / 2, this.H - 78);
    this.keeperBottom.homeY = this.H - 78;
    this.keeperTop.homeX = this.W / 2;
    this.keeperBottom.homeX = this.W / 2;
    // clear any keeper commit pose
    [this.keeperTop, this.keeperBottom].forEach(k => {
      if (!k) return;
      if (k._commitTween) k._commitTween.stop();
      if (k._recoverTween) k._recoverTween.stop();
      k._commitTween = null;
      k._recoverTween = null;
      k._commitActive = false;
      k._commitTargetX = null;
      k._basePose = null;
      k.rotation = 0;
      k.scaleX = 1;
      k.scaleY = 1;
    });
    this.play.committedKeeper = null;

    // Ball carried by attacker
    // Occasional defender possession start (~30%): simulate early turnover.
    if (Math.random() < 0.30) {
      this.play.turnoverAt = this.time.now + rand(900, 1500);
      this.setPossession('defender', { carrier: this.defender });
      this.showFeedback('warn', 'TURNOVER!', { ms: 900 });
    } else {
      this.setPossession('attacker', { carrier: this.attacker });
    }

    // init dribble state for both players + ball
    [this.attacker, this.defender].forEach(p => {
      if (!p.dribble) {
        p.dribble = {
          phase: Math.random() * Math.PI * 2,
          control: 1,
          prevDir: new Phaser.Math.Vector2(0, 1),
        };
      } else {
        p.dribble.phase = Math.random() * Math.PI * 2;
        p.dribble.control = 1;
        p.dribble.prevDir.set(0, 1);
      }
    });

    // ========================================================================
    // Sprint 1 / Gün 1: Centralized ball state initialization
    // ========================================================================
    this.ensureBallState(this.ball);

    // UI
    this.enableMainButtons(false);
    this.setPrompt('New scene. Starting…');
    this.setPills({
      situation: 'WAITING',
      hint: `ATTACK ${this.play.attackDir === -1 ? 'UP' : 'DOWN'} · ${this.play.lane.toUpperCase()}`,
      hintColor: null
    });

    // camera init: center on midpoint
    const midPtX = (this.attacker.pos.x + this.defender.pos.x) / 2;
    const midPtY = (this.attacker.pos.y + this.defender.pos.y) / 2;
    this.cameraTarget.set(midPtX, midPtY);
    this.cameraPos.set(midPtX, midPtY);
    this.cameras.main.scrollX = Math.round(this.cameraPos.x - this.W / 2);
    this.cameras.main.scrollY = Math.round(this.cameraPos.y - this.H / 2);

    this.time.delayedCall(520, () => {
      this.play.running = true;
      this.play.startMs = this.time.now;
      this.setPills({ situation: 'PLAYING', hint: '—', hintColor: null });
      this.setPrompt('');
    });
  }

  tempoMultiplier(time) {
    const start = this.play.tempoStart ?? 1;
    const end = this.play.tempoEnd ?? start;
    const ramp = this.play.tempoRampMs ?? 0;
    if (!ramp) return start;
    const t0 = this.play.startMs ?? time;
    const a = clamp((time - t0) / ramp, 0, 1);
    return lerp(start, end, a);
  }

  enableMainButtons(on) {
    UI.btnFoul.disabled = !on;
    UI.btnNoFoul.disabled = !on;
  }

  setDecisionMode(mode) {
    // mode: 'none' | 'FOUL_CALL' | 'ADV_OR_STOP'
    const showMain = mode === 'FOUL_CALL';
    // Force visibility via inline styles so this is immune to CSS `[hidden]` issues.
    UI.btnFoul.style.display = showMain ? '' : 'none';
    UI.btnNoFoul.style.display = showMain ? '' : 'none';
    if (!showMain) this.enableMainButtons(false);

    const showSecondary = (mode === 'ADV_OR_STOP');
    UI.hudSecondary.hidden = !showSecondary;
    UI.hudSecondary.style.display = showSecondary ? 'flex' : 'none';

    // decision timer (disabled: user decides when ready)
    const showTimer = DECISION_TIMER_ENABLED && (mode === 'FOUL_CALL' || mode === 'ADV_OR_STOP');
    if (UI.decisionTimer) {
      UI.decisionTimer.hidden = !showTimer;
      if (showTimer && UI.decisionTimerBar) {
        UI.decisionTimerBar.style.width = '100%';
        UI.decisionTimerBar.classList.remove('critical');
      }
    }

    // Keep main HUD row present (prompt + reset), but avoid showing stale decision text.
    // (Buttons are controlled above; reset stays accessible.)
    if (!UI.hudMain) return;
    UI.hudMain.hidden = false;
    UI.hudMain.style.display = '';
  }

  setPrompt(text) { UI.prompt.textContent = text; }

  setPills({ situation, hint, hintColor }) {
    UI.pillSituation.textContent = situation;
    UI.pillHint.textContent = hint;
    UI.pillHint.style.borderColor = hintColor ? hintColor : 'var(--stroke)';
    UI.pillHint.style.color = hintColor ? hintColor : 'var(--muted)';
  }

  setContinueVisible(on) {
    if (!UI.btnContinue) return;
    UI.btnContinue.hidden = !on;
    UI.btnContinue.style.display = on ? '' : 'none';
  }

  onContinueAfterGoal() {
    if (!this.play?.waitingForGoalContinue) return;
    this.play.waitingForGoalContinue = false;
    this.setContinueVisible(false);
    UI.hudFeedback.hidden = true;

    // Do NOT auto-restart scene. Wait for user to click NEW SCENE.
    this.play.running = false;
    this.setPrompt('Paused. Click NEW SCENE when ready.');
    this.setPills({ situation: 'GOAL', hint: 'Waiting for you…', hintColor: null });
  }

  showFeedback(kind, text, opts = {}) {
    const { sticky = false, ms = 1400 } = opts;
    UI.hudFeedback.hidden = false;
    UI.feedback.className = 'feedback ' + kind;
    UI.feedback.textContent = text;
    if (!sticky) {
      this.time.delayedCall(ms, () => { UI.hudFeedback.hidden = true; });
    }
  }

  applyPoints(pts) {
    if (pts >= 0) this.refScore.red += pts;
    else this.refScore.blue += Math.abs(pts);
  }

  applyStreakUX(isCorrect) {
    // streak bonus / pressure feedback (subtle)
    if (isCorrect) {
      this.play.correctStreak = (this.play.correctStreak || 0) + 1;
      this.play.wrongStreak = 0;

      if (this.play.correctStreak === 3) {
        // small bonus
        this.refScore.red += 4;
        if (UI.hudWrap) {
          UI.hudWrap.classList.add('streak');
          this.time.delayedCall(1100, () => UI.hudWrap && UI.hudWrap.classList.remove('streak'));
        }
        this.showFeedback('good', '+4 streak bonus', { ms: 900 });
      }
    } else {
      this.play.wrongStreak = (this.play.wrongStreak || 0) + 1;
      this.play.correctStreak = 0;

      if (this.play.wrongStreak === 2) {
        if (UI.hudWrap) {
          UI.hudWrap.classList.add('pressure');
          this.time.delayedCall(1400, () => UI.hudWrap && UI.hudWrap.classList.remove('pressure'));
        }
      }
    }
    // update mission progress
    this.updateMissionProgress(isCorrect);
  }

  // --- INCIDENTS ---

  maybeGenerateIncident(time) {
    const d = Phaser.Math.Distance.Between(
      this.attacker.pos.x, this.attacker.pos.y,
      this.defender.pos.x, this.defender.pos.y
    );
    if (d > RULES.incidentDistance) return null;

    const relSpeed = this.attacker.vel.clone().subtract(this.defender.vel).length();
    const close = 1 - clamp(d / RULES.incidentDistance, 0, 1);     // 0..1
    const speedN = clamp(relSpeed / 125, 0, 1);                    // 0..1
    const heat = this.play.sceneHeat ?? 1;

    // Mix closeness + speed into severity; keep a healthy spread (not always HIGH).
    const randomness = rand(-0.14, 0.20);
    const severity = clamp((0.18 + 0.36 * close + 0.34 * speedN + randomness) * heat, 0, 1);

    // Attack promising: attacker moving towards target goal
    const attackPromising = (this.play.attackDir === -1)
      ? (this.attacker.vel.y < -12)
      : (this.attacker.vel.y > 12);

    // Control after contact
    let ballControlAfter = 'attacker';
    const r = Math.random();
    if (severity > 0.72 && r < 0.55) ballControlAfter = 'loose';
    else if (severity > 0.58 && r < 0.35) ballControlAfter = 'defender';

    const p = foulProbability(severity);
    const hint = hintFromP(p);
    const reason = reasonFromIncidentFeatures({ relSpeed, distPx: d, speedN, closeN: close, heat });
    const gt = {
      severity,
      foulCall: p >= 0.5 ? 'FOUL' : 'NO_FOUL',
      advantage: null,
      attackPromising,
      ballControlAfter,
    };
    if (gt.foulCall === 'FOUL') {
      gt.advantage = (ballControlAfter === 'attacker' && attackPromising) ? 'ADVANTAGE' : 'STOP';
    }

    return { id: crypto.randomUUID(), timeMs: time, severity, hint, reason, features: { relSpeed, distPx: d, speedN, closeN: close, heat }, gt };
  }

  playSlipAnimation(severity) {
    // small slip on high fouls: attacker stumbles sideways + dust + body jitter.
    if (severity < 0.70) return;

    const c = this.attacker;
    const basePose = {
      rotation: c.rotation || 0,
      scaleX: c.scaleX || 1,
      scaleY: c.scaleY || 1,
      depth: c.depth ?? 5,
    };

    const dir = Math.random() < 0.5 ? -1 : 1;
    // Make the actual slide more noticeable (was too subtle).
    const slide = lerp(16, 30, clamp((severity - 0.70) / 0.30, 0, 1));
    const dx = dir * rand(slide * 0.85, slide);
    const dy = rand(-8, 8);

    // dust burst (tiny, short)
    this.spawnDust(c.pos.x - dir * 2, c.pos.y + 7, 9);

    // Make it look like the player goes down on the turf during the slide.
    // Lower depth so it reads as "on the ground" under others/ball.
    c.setDepth(3);

    const FALL_ROT = 1.35; // ~77deg, reads like "lying down" in pixel style
    const poseAt = (amt) => {
      // amt: 0..1 (0 upright, 1 on ground)
      c.rotation = lerp(basePose.rotation, dir * FALL_ROT, amt);
      c.scaleX = lerp(basePose.scaleX, 1.18, amt);
      c.scaleY = lerp(basePose.scaleY, 0.72, amt);
    };

    const start = c.pos.clone();
    const target = start.clone().add(new Phaser.Math.Vector2(dx, dy));

    // micro "stumble" by offsetting children
    this.stumbleSprite(c, dir);

    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 220,
      ease: 'Quad.easeOut',
      onUpdate: (tw) => {
        const t = tw.getValue();
        c.pos.x = lerp(start.x, target.x, t);
        c.pos.y = lerp(start.y, target.y, t);
        poseAt(t);
      },
      onComplete: () => {
        // spring back slightly
        this.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 180,
          ease: 'Back.easeOut',
          onUpdate: (tw2) => {
            const t2 = tw2.getValue();
            c.pos.x = lerp(target.x, start.x, t2);
            c.pos.y = lerp(target.y, start.y, t2);
            // recover upright
            poseAt(1 - t2);
          },
          onComplete: () => {
            // hard reset pose + depth (prevents drift)
            c.rotation = basePose.rotation;
            c.scaleX = basePose.scaleX;
            c.scaleY = basePose.scaleY;
            c.setDepth(basePose.depth);
          }
        });
      }
    });
  }

  pauseForIncident(incident) {
    this.play.running = false;
    this.play.incident = incident;
    this.play.waitingFor = 'FOUL_CALL';
    // referee: allow a short micro-step, then lock for the decision UI
    this.play.refPauseMoveUntil = this.time.now + rand(180, 260);

    // contact flash + whistle hint + audio
    const cx = (this.attacker.pos.x + this.defender.pos.x) / 2;
    const cy = (this.attacker.pos.y + this.defender.pos.y) / 2;
    this.spawnContactFlash(cx, cy);
    this.spawnWhistleHint(cx, cy - 4, 6);
    this.playThudSound();
    this.playWhistleSound();

    this.enableMainButtons(true);
    this.setDecisionMode('FOUL_CALL');

    const pct = Math.round(foulProbability(incident.severity) * 100);
    this.setPills({
      situation: 'CONTACT',
      hint: `${incident.hint.label} FOUL (${pct}%) · ${incident.reason}`,
      hintColor: incident.hint.color,
    });

    this.setPrompt('Contact! Your call.');

    // slip effect (visual hint)
    this.playSlipAnimation(incident.severity);
  }

  onUserFoulCall(call) {
    if (!this.play.incident || this.play.waitingFor !== 'FOUL_CALL') return;
    const incident = this.play.incident;

    if (call === 'FOUL') {
      this.play.waitingFor = 'ADV_OR_STOP';
      this.setDecisionMode('ADV_OR_STOP');
      // "You called FOUL" is shown in the secondary panel; keep main prompt concise.
      this.setPrompt('Advantage or stop?');
      return;
    }

    const pts = scoreDecision({ userFoul: 'NO_FOUL', userAdvantage: null }, incident.gt);
    this.applyPoints(pts);
    this.applyStreakUX(pts >= 0);
    this.showFeedback(pts >= 0 ? 'good' : 'bad', `${pts >= 0 ? 'RIGHT' : 'WRONG'} · ${pts} pts`);

    // End position -> enter sim mode
    this.setDecisionMode('none');
    this.play.incident = null;
    this.play.waitingFor = null;
    this.play.running = false;
    this.enterSimMode('Play on');
  }

  onUserAdvStop(choiceStr) {
    if (!this.play.incident || this.play.waitingFor !== 'ADV_OR_STOP') return;
    const incident = this.play.incident;

    const pts = scoreDecision({ userFoul: 'FOUL', userAdvantage: choiceStr }, incident.gt);
    this.applyPoints(pts);
    this.applyStreakUX(pts >= 0);

    const kind = pts >= 0 ? 'good' : 'bad';
    const label = pts >= 0 ? 'RIGHT' : 'WRONG';
    this.showFeedback(kind, `${label} · ${pts} pts`);

    if (choiceStr === 'STOP') {
      // check if card should be shown
      this.play.defenderFouls++;
      const cardType = this.determineCard(incident.severity, this.play.defenderFouls);
      if (cardType) {
        this.showCard(cardType);
        if (cardType === 'YELLOW') this.play.defenderYellowCard = true;
        if (cardType === 'RED') this.play.defenderRedCard = true;
      }
      // end position -> enter sim mode
      this.enterSimMode('Foul: stop', { delayMs: 500 });
      return;
    }

    // Advantage chosen -> end position for match flow
    this.enterSimMode('Foul: advantage', { delayMs: 500 });
  }

  resumeAfterDecision() {
    this.setDecisionMode('none');
    this.play.incident = null;
    this.play.waitingFor = null;
    this.play.refPauseMoveUntil = 0;

    this.setPills({ situation: 'PLAYING', hint: '—', hintColor: null });
    this.setPrompt('Play continues…');

    this.time.delayedCall(520, () => {
      this.play.running = true;
      this.enableMainButtons(false);
      this.setPrompt('');
    });
  }

  // Mission system
  generateMission() {
    const missions = [
      { type: 'CORRECT_CALLS', target: 5, label: '5 Correct Calls', reward: 50 },
      { type: 'NO_MISTAKES', target: 3, label: '3 Scenes, No Mistakes', reward: 100 },
      { type: 'STREAK', target: 3, label: '3-Call Streak', reward: 75 },
    ];
    return missions[Math.floor(Math.random() * missions.length)];
  }

  startMission() {
    this.play.mission = this.generateMission();
    this.play.missionProgress = 0;
    this.play.missionTarget = this.play.mission.target;
    if (UI.pillMission) {
      UI.pillMission.textContent = `MISSION: ${this.play.mission.label} (${this.play.missionProgress}/${this.play.missionTarget})`;
      UI.pillMission.hidden = false;
    }
  }

  updateMissionProgress(isCorrect) {
    if (!this.play.mission) return;

    if (this.play.mission.type === 'CORRECT_CALLS' && isCorrect) {
      this.play.missionProgress++;
    } else if (this.play.mission.type === 'NO_MISTAKES') {
      if (!isCorrect) {
        this.play.missionProgress = 0;
      } else {
        this.play.missionProgress++;
      }
    } else if (this.play.mission.type === 'STREAK' && this.play.correctStreak >= this.play.mission.target) {
      this.play.missionProgress = this.play.correctStreak;
    }

    // update UI
    if (UI.pillMission) {
      UI.pillMission.textContent = `MISSION: ${this.play.mission.label} (${this.play.missionProgress}/${this.play.missionTarget})`;
    }

    // complete mission
    if (this.play.missionProgress >= this.play.missionTarget) {
      this.completeMission();
    }
  }

  completeMission() {
    if (!this.play.mission) return;
    const reward = this.play.mission.reward;
    this.play.redScore = (this.play.redScore || 0) + reward;
    this.showFeedback('good', `MISSION COMPLETE! +${reward} pts`, { ms: 2000 });
    if (UI.pillMission) {
      UI.pillMission.hidden = true;
    }
    this.play.mission = null;
    // start new mission after a delay
    this.time.delayedCall(3000, () => this.startMission());
  }

  endPosition() {
    this.play.running = false;
    this.setDecisionMode('none');
    this.enterSimMode('Free kick awarded');
  }

  // --- SHOT / SAVE / GOAL ---

  maybeStartShot(time, force = false) {
    if (this.play.ballMode !== 'CARRIED') return;
    if (time - this.play.lastShotAt < RULES.shotCooldownMs) return;

    // distance to target goal line
    const targetGoalY = this.play.attackDir === -1 ? this.goal.topY : this.goal.bottomY;
    const dy = Math.abs(this.attacker.pos.y - targetGoalY);
    if (dy > RULES.shotZonePx) return;

    // random chance to actually shoot
    if (!force && Math.random() > 0.14) return;

    // v2: occasional feint (no shot, but small animation)
    if (!force && Math.random() < RULES.feintChance) {
      this.showFeedback('warn', 'FEINT!', { ms: 500 });
      // quick ball fake (small forward nudge + return)
      const bs = this.ball.ballState;
      const dir = this.attacker.vel.clone().normalize();
      const fakeX = bs.pos.x + dir.x * 6;
      const fakeY = bs.pos.y + dir.y * 6;
      this.tweens.add({
        targets: bs.pos,
        x: fakeX,
        y: fakeY,
        duration: 120,
        yoyo: true,
        ease: 'Sine.easeInOut'
      });
      return;
    }

    this.play.lastShotAt = time;
    // brief trail burst window right after the kick
    this.play.trailBoostUntil = time + 420;

    // shot target x within goal width + small randomness
    const tx = clamp(this.W / 2 + rand(-28, 28), this.goal.xMin + 4, this.goal.xMax - 4);
    const ty = targetGoalY;

    this.play.shotTargetX = tx;
    this.play.shotTargetSide = this.play.attackDir === -1 ? 'TOP' : 'BOTTOM';

    const speedN = clamp(RULES.shotSpeed / 240, 0, 1);
    const edgeN = clamp(Math.abs(tx - this.W / 2) / (this.goal.xMax - this.W / 2), 0, 1);

    // Decide shot outcome ONCE per shot (debug override supported)
    if (this.debug?.shotOutcome === 'GOAL') this.play.shotOutcome = 'GOAL';
    else if (this.debug?.shotOutcome === 'SAVE') this.play.shotOutcome = 'SAVE';
    else this.play.shotOutcome = null;

    // ========================================================================
    // Sprint 1 / Gün 1: Centralized ball mode switch
    // ========================================================================
    this.setBallMode('SHOT', {
      shotTarget: new Phaser.Math.Vector2(tx, ty),
      shotSpeed: RULES.shotSpeed
    });

    this.play.shot = {
      targetX: tx,
      targetSide: this.play.shotTargetSide,
      speed: RULES.shotSpeed,
      speedN,
      edgeN,
      startAt: time
    };

    // keeper commits immediately on shot start (corner guess)
    this.startKeeperCommit(this.play.shotTargetSide, tx, RULES.shotSpeed);

    // cinematic polish
    // 120ms mini shake (a bit stronger so it's noticeable)
    this.cameras.main.shake(120, 0.004);

    this.setPills({ situation: 'SHOT', hint: '—', hintColor: null });
    this.showFeedback('warn', 'SHOT!');
  }

  resolveShotIfGoalLineCrossed() {
    if (this.play.ballMode !== 'SHOT') return null;

    const bs = this.ball.ballState;
    const y = bs.pos.y;
    const isTop = this.play.attackDir === -1;

    // Check if ball crossed the goal line (inside the goal mouth)
    const xInGoal = (bs.pos.x >= this.goal.xMin && bs.pos.x <= this.goal.xMax);

    if (isTop && y <= this.goal.topY && xInGoal) return 'TOP';
    if (!isTop && y >= this.goal.bottomY && xInGoal) return 'BOTTOM';

    return null;
  }

  keeperForTarget(side) {
    return side === 'TOP' ? this.keeperTop : this.keeperBottom;
  }

  attemptSave(targetSide) {
    // Pure random outcome: SAVE vs GOAL (independent of alignment).
    // The keeper dive itself is now started at shot time (commit tween).
    void targetSide;
    if (this.play?.shotOutcome === 'GOAL') return false;
    if (this.play?.shotOutcome === 'SAVE') return true;
    return Math.random() < RULES.saveChanceBase;
  }

  resolveShotVsKeeper(shot, keeper) {
    // Debug override: force outcome
    if (this.play?.shotOutcome === 'GOAL') return 'MISS';
    if (this.play?.shotOutcome === 'SAVE') return 'PARRY';

    // Compute save probability from edge + speed + skill + reaction
    const edgeN = clamp(shot.edgeN, 0, 1);
    const speedN = clamp(shot.speedN, 0, 1);
    const skill = RULES.keeperSkill;
    const reactionPenalty = clamp((keeper?._reactionDelay || 0) / RULES.reactionMsMax, 0, 1) * 0.15;
    const fatiguePenalty = clamp((keeper?._fatigue || 0), 0, 0.8) * 0.25;

    let saveProb = 0.65 + skill * 0.25;
    saveProb -= edgeN * 0.35;
    saveProb -= speedN * 0.25;
    saveProb -= reactionPenalty;
    saveProb -= fatiguePenalty;
    saveProb = clamp(saveProb, 0.05, 0.95);

    const r = Math.random();
    if (r < saveProb * 0.45) return 'HOLD';
    if (r < saveProb) return 'PARRY';
    return 'MISS';
  }

  debugTriggerShot() {
    // Force a shot immediately for testing
    if (this.play.ballMode !== 'CARRIED') return;
    this.maybeStartShot(this.time.now, true);
  }

  endShotOutcome(outcome) {
    // CRITICAL: Stop ball velocity and movement immediately
    this.play.ballVel.set(0, 0);
    if (this.ball.ballState) {
      this.ball.ballState.vel.set(0, 0);
    }

    if (outcome === 'GOAL') {
      // GOAL: NO keeper recovery animation (he failed!)
      // Reset keeper pose immediately without animation (instant reset)
      const keeper = this.play?.committedKeeper;
      if (keeper) {
        if (keeper._commitTween) keeper._commitTween.stop();
        if (keeper._recoverTween) keeper._recoverTween.stop();
        
        // Instant reset to home (no animation on failure)
        const base = keeper._basePose || { rotation: 0, scaleX: 1, scaleY: 1 };
        keeper.pos.x = keeper.homeX ?? this.W / 2;
        keeper.pos.y = keeper.homeY ?? keeper._startY ?? keeper.pos.y;
        keeper.rotation = base.rotation;
        keeper.scaleX = base.scaleX;
        keeper.scaleY = base.scaleY;
        keeper._commitActive = false;
        this.play.committedKeeper = null;
      }
      
      // ========================================================================
      // Sprint 1 / Gün 1: Centralized ball mode switch
      // FIX: Hide ball completely at goal, show explosion effect
      // ========================================================================
      
      // GOAL: Change mode IMMEDIATELY to prevent further updates
      this.play.ballMode = 'CARRIED';
      this.play.possession = 'attacker';
      
      // Goal explosion + flash effect at ball position
      const goalX = this.ball.x;
      const goalY = this.ball.y;

      // Stronger camera shake for GOAL
      this.cameras.main.shake(160, 0.008);

      // Big flash ring
      const ring = this.add.circle(goalX, goalY, 12, 0xfff6bf, 0.9);
      ring.setDepth(30);
      this.tweens.add({
        targets: ring,
        radius: 34,
        alpha: 0,
        duration: 260,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy()
      });

      // Net ripple (goal mouth)
      const netY = (this.play.shotTargetSide === 'TOP') ? (this.goal.topY + 6) : (this.goal.bottomY - 6);
      const netRipple = this.add.circle(this.W / 2, netY, 10, 0xbfe8cf, 0.5);
      netRipple.setDepth(20);
      this.tweens.add({
        targets: netRipple,
        radius: 42,
        alpha: 0,
        duration: 380,
        ease: 'Cubic.easeOut',
        onComplete: () => netRipple.destroy()
      });
      
      // Explosion particles (yellow/gold for GOAL)
      for (let i = 0; i < 18; i++) {
        const angle = (Math.PI * 2 * i) / 12;
        const speed = rand(90, 180);
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const particle = this.add.rectangle(goalX, goalY, 3, 3, 0xffd34a, 1).setOrigin(0.5);
        particle.setDepth(20);
        
        this.tweens.add({
          targets: particle,
          x: goalX + vx * 0.3,
          y: goalY + vy * 0.3,
          alpha: 0,
          scaleX: 0,
          scaleY: 0,
          duration: 520,
          ease: 'Cubic.easeOut',
          onComplete: () => particle.destroy()
        });
      }

      // GOAL text overlay (big, clear)
      const goalText = this.add.text(this.W / 2, this.H / 2 - 10, 'GOAL!', {
        fontFamily: 'VT323',
        fontSize: '48px',
        color: '#ffd34a',
        stroke: '#0b0f12',
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(40);
      this.tweens.add({
        targets: goalText,
        scaleX: 1.2,
        scaleY: 1.2,
        alpha: 0,
        duration: 700,
        ease: 'Cubic.easeOut',
        onComplete: () => goalText.destroy()
      });
      
      // Hide ball immediately (no teleport visible)
      this.ball.visible = false;
      this.ballOutline.visible = false;

      // net shake near the scored goal mouth
      this.playGoalNetFx(this.play.shotTargetSide);
      this.play.running = false;

      // update match score
      if (this.play.matchScore) {
        if (this.play.attacking === 'red') this.play.matchScore.red += 1;
        else this.play.matchScore.blue += 1;
        this.updateMatchScoreUI();
      }

      const goalTeam = this.play.attacking === 'red' ? 'RED' : 'BLUE';
      this.showFeedback('good', 'GOAL!', { sticky: true });
      this.setPills({ situation: 'GOAL', hint: '—', hintColor: null });
      this.startReplayThenSim(`Goal by ${goalTeam}`, { delayMs: 700 });
      // Clear shot outcome after resolution
      this.play.shotOutcome = null;
      this.play.saveType = null;
      return;
    } else {
      // SAVE -> rebound + keeper follow-through
      this.showFeedback('warn', 'SAVE!', { ms: 900 });
      this.play.reboundUntil = this.time.now + RULES.reboundMs;

      // Keep ball at current position, but check keeper collision
      const awayY = this.play.shotTargetSide === 'TOP' ? 1 : -1;
      const keeper = this.keeperForTarget(this.play.shotTargetSide);
      
      // Ball position for save
      let saveX = this.ball.x;
      let saveY = this.ball.y;
      let hadCollision = false;
      
      // FIX: If ball is too close to keeper (inside), push it away
      if (keeper) {
        const distToKeeper = Phaser.Math.Distance.Between(
          this.ball.x, this.ball.y,
          keeper.pos.x, keeper.pos.y
        );
        
        if (distToKeeper < 20) {
          hadCollision = true;
          // Push ball away from keeper to avoid overlap
          const awayFromKeeper = new Phaser.Math.Vector2(
            this.ball.x - keeper.pos.x,
            this.ball.y - keeper.pos.y
          ).normalize();
          saveX = keeper.pos.x + awayFromKeeper.x * 20;
          saveY = keeper.pos.y + awayFromKeeper.y * 20;
          this.ball.x = saveX;
          this.ball.y = saveY;
        }
      }
      
      // SAVE collision effect (impact particles) - Only if keeper touched ball
      if (hadCollision) {
        // Camera micro-shake for SAVE
        this.cameras.main.shake(90, 0.004);

        // Blue flash ring at save point
        const saveRing = this.add.circle(saveX, saveY, 10, 0x7dd3fc, 0.85);
        saveRing.setDepth(30);
        this.tweens.add({
          targets: saveRing,
          radius: 26,
          alpha: 0,
          duration: 220,
          ease: 'Cubic.easeOut',
          onComplete: () => saveRing.destroy()
        });

        // Hit-stop (mini freeze) + slow-mo for SAVE impact
        this.play.hitStopUntil = this.time.now + 120;
        this.play.slowMoUntil = this.time.now + 220;

        // Keeper punch animation (more obvious save)
        if (keeper) {
          if (keeper._savePunchTween) keeper._savePunchTween.stop();
          const base = keeper._basePose || { rotation: 0, scaleX: 1, scaleY: 1 };
          keeper._savePunchTween = this.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 180,
            ease: 'Back.easeOut',
            onUpdate: (tw) => {
              const t = tw.getValue();
              keeper.scaleX = lerp(base.scaleX, base.scaleX * 1.25, t);
              keeper.scaleY = lerp(base.scaleY, base.scaleY * 0.85, t);
            },
            onComplete: () => {
              keeper.scaleX = base.scaleX;
              keeper.scaleY = base.scaleY;
              keeper._savePunchTween = null;
            }
          });
        }

        // Glove sparks (white ticks)
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI * 2 * i) / 6 + rand(-0.2, 0.2);
          const spark = this.add.rectangle(saveX, saveY, 6, 2, 0xffffff, 0.9).setOrigin(0.5);
          spark.setDepth(25);
          spark.rotation = angle;
          this.tweens.add({
            targets: spark,
            x: saveX + Math.cos(angle) * 10,
            y: saveY + Math.sin(angle) * 10,
            alpha: 0,
            duration: 180,
            ease: 'Cubic.easeOut',
            onComplete: () => spark.destroy()
          });
        }

        for (let i = 0; i < 8; i++) {
          const angle = (Math.PI * 2 * i) / 8 + Math.random() * 0.3;
          const speed = rand(80, 140);
          const vx = Math.cos(angle) * speed;
          const vy = Math.sin(angle) * speed;
          const particle = this.add.rectangle(saveX, saveY, 3, 3, 0x3aa0ff, 1).setOrigin(0.5);
          particle.setDepth(20);
          
          this.tweens.add({
            targets: particle,
            x: saveX + vx * 0.25,
            y: saveY + vy * 0.25,
            alpha: 0,
            scaleX: 0,
            scaleY: 0,
            duration: 420,
            ease: 'Cubic.easeOut',
            onComplete: () => particle.destroy()
          });
        }
      }
      
      // Save type: HOLD | PARRY
      const saveType = this.play.saveType || 'PARRY';

      if (saveType === 'HOLD') {
        // short hold pose before recovery
        this.time.delayedCall(220, () => this.recoverKeeperCommit());
        this.play.running = false;
        this.setPills({ situation: 'STOPPED', hint: 'Keeper holds', hintColor: '#7dd3fc' });
        this.startReplayThenSim('Keeper holds', { delayMs: 500 });
        this.play.shotOutcome = null;
        this.play.saveType = null;
        return;
      }

      // Parry follow-through (small lunge) before recovery
      if (keeper) {
        if (keeper._parryTween) keeper._parryTween.stop();
        const dx = clamp(this.ball.x - keeper.pos.x, -28, 28);
        const dy = clamp(this.ball.y - keeper.pos.y, -18, 18);
        keeper._parryTween = this.tweens.add({
          targets: keeper.pos,
          x: keeper.pos.x + dx * 0.4,
          y: keeper.pos.y + dy * 0.25,
          duration: 140,
          yoyo: true,
          ease: 'Sine.easeOut',
          onComplete: () => { keeper._parryTween = null; }
        });
      }
      this.time.delayedCall(200, () => this.recoverKeeperCommit());

      // Deflection direction: away from goal + toward keeper's dive position for realism
      let vx = rand(-120, 120);
      if (keeper) {
        // Bias deflection toward keeper's position (like a save/punch)
        const toKeeperX = keeper.pos.x - this.ball.x;
        vx = toKeeperX * 0.6 + rand(-60, 60);
      }
      const vy = awayY * rand(140, 220);
      
      // small dust at the deflection point
      this.spawnDust(this.ball.x, this.ball.y, 8);

      // end position after save
      this.play.running = false;
      this.setPills({ situation: 'STOPPED', hint: 'Parry save', hintColor: '#7dd3fc' });
      this.startReplayThenSim('Parry save', { delayMs: 500 });
      // Clear shot outcome after resolution
      this.play.shotOutcome = null;
      this.play.saveType = null;
    }
  }

  // --- UPDATE LOOP ---

  update(time) {
    // replay mode: playback 0.5x slow-mo from buffer
    if (this.replayMode) {
      this.updateReplay();
      return;
    }

    // match clock (2 min real time -> 90' UI)
    this.updateMatchClock(time);

    // Full time check
    if (this.play.matchStartMs != null) {
      const elapsed = time - this.play.matchStartMs;
      if (!this.play.halfTimeShown && elapsed >= this.play.matchDurationMs / 2) {
        this.play.halfTimeShown = true;
        this.enterSimMode('HALF TIME');
        return;
      }
      if (!this.play.fullTime && elapsed >= this.play.matchDurationMs) {
        this.play.fullTime = true;
        this.play.fullTimeShown = true;
        this.enterSimMode('FULL TIME', { noNextPosition: true });
        return;
      }
    }

    // SIM mode: show sim screen and wait for next position
    if (this.play.mode === 'SIM') {
      this.updateSimMode(time);
      return;
    }

    // decision timer disabled: user decides when ready

    // referee updates even when play is paused (micro-step / then lock)
    const dtBase = clamp(RULES.dtMs / 1000, 0, 1 / 30);
    const slowMo = (this.play.slowMoUntil && time < this.play.slowMoUntil) ? 0.5 : 1;
    const dt = dtBase * slowMo;
    this.updateReferee(time, dt);

    // camera follow (ball)
    this.cameraTarget.set(this.ball.x, this.ball.y);
    // smooth lerp (higher = faster follow, 0.08 = smooth)
    const camSpeed = 0.08;
    this.cameraPos.x = lerp(this.cameraPos.x, this.cameraTarget.x, camSpeed);
    this.cameraPos.y = lerp(this.cameraPos.y, this.cameraTarget.y, camSpeed);
    // clamp camera to bounds (keep centered on canvas view)
    const minCamX = this.W / 2;
    const maxCamX = this.W - this.W / 2;
    const minCamY = this.H / 2;
    const maxCamY = this.H - this.H / 2;
    this.cameraPos.x = clamp(this.cameraPos.x, minCamX, maxCamX);
    this.cameraPos.y = clamp(this.cameraPos.y, minCamY, maxCamY);
    this.cameras.main.scrollX = Math.round(this.cameraPos.x - this.W / 2);
    this.cameras.main.scrollY = Math.round(this.cameraPos.y - this.H / 2);

    // record frame to ring buffer (only when running, skip during pause/decision)
    if (this.play.running && !this.replayMode) {
      const frame = {
        attackerX: this.attacker.pos.x, attackerY: this.attacker.pos.y,
        defenderX: this.defender.pos.x, defenderY: this.defender.pos.y,
        ballX: this.ball.x, ballY: this.ball.y,
      };
      this.replayBuffer.push(frame);
      if (this.replayBuffer.length > this.replayBufferMaxFrames) {
        this.replayBuffer.shift();
      }
    }

    // render transforms
    this.attacker.x = Math.round(this.attacker.pos.x);
    this.attacker.y = Math.round(this.attacker.pos.y);
    this.defender.x = Math.round(this.defender.pos.x);
    this.defender.y = Math.round(this.defender.pos.y);
    this.refSprite.x = Math.round(this.refSprite.pos.x);
    this.refSprite.y = Math.round(this.refSprite.pos.y);

    this.keeperTop.x = Math.round(this.keeperTop.pos.x);
    this.keeperTop.y = Math.round(this.keeperTop.pos.y);
    this.keeperBottom.x = Math.round(this.keeperBottom.pos.x);
    this.keeperBottom.y = Math.round(this.keeperBottom.pos.y);

    // shadows follow (slightly below feet)
    const syncShadow = (c, dy = 7) => {
      if (!c?.shadow) return;
      c.shadow.x = c.x;
      c.shadow.y = c.y + dy;
    };
    syncShadow(this.attacker, 7);
    syncShadow(this.defender, 7);
    syncShadow(this.refSprite, 7);
    syncShadow(this.keeperTop, 8);
    syncShadow(this.keeperBottom, 8);

    // ========================================================================
    // BALL UPDATE (Sprint 1 / Gün 1 - Centralized)
    // ========================================================================
    this.updateBall(time, dt);

    if (!this.play.running) return;

    // keepers react to ball (simple lateral tracking)
    this.updateKeepers();
    // v2: fatigue recovery when playing
    const top = this.keeperTop;
    const bottom = this.keeperBottom;
    if (top) top._fatigue = Math.max(0, (top._fatigue || 0) - RULES.fatigueRecoverPerSec * dt);
    if (bottom) bottom._fatigue = Math.max(0, (bottom._fatigue || 0) - RULES.fatigueRecoverPerSec * dt);

    // debug fatigue UI
    if (UI.dbgFatigueTop && top) UI.dbgFatigueTop.textContent = `Top: ${top._fatigue?.toFixed(2) ?? '0.00'}`;
    if (UI.dbgFatigueBottom && bottom) UI.dbgFatigueBottom.textContent = `Bottom: ${bottom._fatigue?.toFixed(2) ?? '0.00'}`;

    const tempo = this.tempoMultiplier(time);

    // movement targets (random drift, not straight lines)
    const targetGoalY = this.play.attackDir === -1 ? this.goal.topY + 24 : this.goal.bottomY - 24;

    // attacker target changes slightly over time
    // lane modes:
    //  - left/right/center: bias X strongly
    //  - diagonal: both X and Y drift + wider X swing
    if (!this._target || time > this._targetUntil) {
      // Tempo affects how often the attacker changes lane/target.
      // build-up => slower changes early, burst => faster changes.
      const refresh = rand(420, 820) / clamp(tempo, 0.65, 1.25);
      this._targetUntil = time + refresh;

      const b = this.bounds;
      const centerX = this.W / 2;
      const width = (b.maxX - b.minX);

      // lane anchors
      const leftX = centerX - width * 0.28;
      const rightX = centerX + width * 0.28;

      let laneX;
      if (this.play.lane === 'left') {
        laneX = leftX + rand(-18, 18);
      } else if (this.play.lane === 'right') {
        laneX = rightX + rand(-18, 18);
      } else if (this.play.lane === 'center') {
        laneX = centerX + rand(-28, 28);
      } else {
        // diagonal
        const diagonalBias = (this.play.attackDir === -1) ? -1 : 1;
        laneX = centerX + diagonalBias * rand(35, 95) + rand(-20, 20);
      }

      // Y target: mostly towards goal, but diagonal adds more variance
      const yJitter = this.play.lane === 'diagonal' ? rand(-70, 40) : rand(-30, 30);
      const laneY = targetGoalY + yJitter;

      laneX = clamp(laneX, b.minX + 12, b.maxX - 12);
      const clampedY = clamp(laneY, b.minY + 10, b.maxY - 10);
      this._target = new Phaser.Math.Vector2(laneX, clampedY);
    }

    const toT = this._target.clone().subtract(this.attacker.pos);
    const desiredA = toT.normalize().scale(this.attacker.maxSpeed * tempo);
    this.attacker.vel.lerp(desiredA, 0.045);

    // defender pursues attacker but with slight offset (avoid perfect overlap)
    const offset = new Phaser.Math.Vector2(rand(-10, 10), rand(-10, 10));
    const toA = this.attacker.pos.clone().add(offset).subtract(this.defender.pos);
    const desiredD = toA.normalize().scale(this.defender.maxSpeed * tempo);
    this.defender.vel.lerp(desiredD, 0.055);

    // separation force to prevent collapsing on top of each other
    const sep = this.attacker.pos.clone().subtract(this.defender.pos);
    const dist = sep.length();
    if (dist < 10 && dist > 0.001) {
      const push = sep.normalize().scale((10 - dist) * 4.2);
      this.attacker.vel.add(push);
      this.defender.vel.add(push.clone().scale(-0.7));
    }

    // clamp player speeds
    const aSpeed = this.attacker.vel.length();
    if (aSpeed > this.attacker.maxSpeed) {
      this.attacker.vel.scale(this.attacker.maxSpeed / aSpeed);
    }
    const dSpeed = this.defender.vel.length();
    if (dSpeed > this.defender.maxSpeed) {
      this.defender.vel.scale(this.defender.maxSpeed / dSpeed);
    }

    // integrate
    this.attacker.pos.add(this.attacker.vel.clone().scale(dt));
    this.defender.pos.add(this.defender.vel.clone().scale(dt));

    // keep inside
    const b = this.bounds;
    this.attacker.pos.x = clamp(this.attacker.pos.x, b.minX, b.maxX);
    this.attacker.pos.y = clamp(this.attacker.pos.y, b.minY, b.maxY);
    this.defender.pos.x = clamp(this.defender.pos.x, b.minX, b.maxX);
    this.defender.pos.y = clamp(this.defender.pos.y, b.minY, b.maxY);

    // generate incidents
    if (time >= this.play.incidentCooldownUntil) {
      const incident = this.maybeGenerateIncident(time);
      if (incident) {
        // adaptive incident cooldown tuning
        const last = this.play.lastIncidentAt || 0;
        if (last) {
          const dtIncident = time - last;
          // too frequent => increase cooldown, too rare => decrease
          if (dtIncident < 900) this.play.incidentCooldownMs += 140;
          else if (dtIncident > 2800) this.play.incidentCooldownMs -= 120;
          this.play.incidentCooldownMs = clamp(this.play.incidentCooldownMs, 850, 2600);
        }
        this.play.lastIncidentAt = time;

        this.play.incidentCooldownUntil = time + this.play.incidentCooldownMs;
        this.pauseForIncident(incident);
        return;
      }
    }

    // If we haven't had incidents for a while, gently reduce cooldown (at most ~1x/sec)
    if (this.play.lastIncidentAt && time - this.play.lastIncidentAt > 5200 && time > (this.play._incidentTuneAt || 0)) {
      this.play._incidentTuneAt = time + 900;
      this.play.incidentCooldownMs = clamp(this.play.incidentCooldownMs - 90, 850, 2600);
    }

    // shot events
    this.maybeStartShot(time);

    // Check if shot crossed goal line
    const crossed = this.resolveShotIfGoalLineCrossed();
    if (crossed) {
      // Only process if not already handled by keeper collision
      if (this.play.ballMode === 'SHOT') {
        const shot = this.play.shot || { edgeN: 0, speedN: 0 };
        const keeper = this.keeperForTarget(crossed);
        const outcome = this.resolveShotVsKeeper(shot, keeper);
        this.play.saveType = outcome;
        this.endShotOutcome(outcome === 'MISS' ? 'GOAL' : 'SAVE');
      }
    }
  }

  updateKeepers() {
    const b = this.bounds;
    const ballX = this.ball.x;

    // keeper lateral track, but limited to goal width
    const top = this.keeperTop;
    const bottom = this.keeperBottom;

    // subtle bob animation based on time
    const bob = Math.sin(this.time.now / 260) * 0.8;

    top.pos.y = 78 + bob;
    bottom.pos.y = this.H - 78 - bob;

    const tx = clamp(ballX, this.goal.xMin + 10, this.goal.xMax - 10);
    // During a shot, the relevant keeper "commits" and stops tracking ball.x.
    const shotSide = this.play.shotTargetSide;
    const topCommitted = (this.play.ballMode === 'SHOT' && shotSide === 'TOP' && top._commitActive);
    const botCommitted = (this.play.ballMode === 'SHOT' && shotSide === 'BOTTOM' && bottom._commitActive);

    if (!topCommitted) this.updateKeeperPreShot(top, ballX, RULES.positioningK);
    if (!botCommitted) this.updateKeeperPreShot(bottom, ballX, RULES.positioningK);

    top.pos.x = clamp(top.pos.x, b.minX + 10, b.maxX - 10);
    bottom.pos.x = clamp(bottom.pos.x, b.minX + 10, b.maxX - 10);
  }

  updateKeeperPreShot(keeper, ballX, k = 0.08) {
    if (!keeper) return;
    const tx = clamp(ballX, this.goal.xMin + 10, this.goal.xMax - 10);
    keeper.pos.x = lerp(keeper.pos.x, lerp(keeper.homeX, tx, 0.55), k);
  }

}

const config = {
  type: Phaser.CANVAS,
  parent: 'game',
  width: 360,
  height: 640,
  backgroundColor: '#0b0f12',
  pixelArt: true,
  scene: [RefereeScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 360,
    height: 640,
  },
};

new Phaser.Game(config);
