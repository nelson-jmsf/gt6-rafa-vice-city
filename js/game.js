/**
 * GT6 RAFA: FUGA DE VICE CITY (EDTECH PT-13 EDITION)
 * Core Gameplay Mechanics, Realistic Motorcycle Steering, Sweeping Highway Curves,
 * Non-Falling Gyroscopic Physics & GTA Wanted AI Engine
 * Attached to window.GT6Game
 */
(function () {
  'use strict';

  const LANES = [-4.5, -1.5, 1.5, 4.5];
  const ROAD_HALF_WIDTH = 7.2;      // Playable 4-lane asphalt + shoulder bounds (-7.2m to +7.2m)
  const ROAD_SOFT_BOUND = 6.6;      // Soft curb spring threshold
  const BASE_BOUNTY_CASH = 1956791; // Exact initial cash counter from Rafa's Vice City video ($1956791)
  const INITIAL_AMMO = 558;         // Exact ammo reserve from video HUD (558-30)
  const CLIP_SIZE = 30;

  const RADIO_MESSAGES = {
    start: 'Atenção todas as unidades, suspeito em fuga na avenida!',
    speed: 'Ele está em alta velocidade, enviem reforços!',
    blockade: 'Cuidado, ele está furando o bloqueio!',
    air_support: 'Apoio aéreo a caminho, cerquem a área!',
    roadblock_warn: 'Não deixem ele escapar, fechem a via!',
    max_wanted: 'ALERTA MÁXIMO 6 ESTRELAS! Suspeito na Chopper EDTECH PT-13 dominando a avenida!'
  };

  const STAR_THRESHOLDS = [
    { stars: 1, dist: 0,    heat: 0,   radioKey: 'start' },
    { stars: 2, dist: 180,  heat: 18,  radioKey: 'speed' },
    { stars: 3, dist: 450,  heat: 40,  radioKey: 'blockade' },
    { stars: 4, dist: 820,  heat: 65,  radioKey: 'roadblock_warn' },
    { stars: 5, dist: 1250, heat: 95,  radioKey: 'air_support' },
    { stars: 6, dist: 1750, heat: 135, radioKey: 'max_wanted' }
  ];

  class GT6GameEngine {
    constructor() {
      this.LANES = LANES;
      this.BASE_BOUNTY_CASH = BASE_BOUNTY_CASH;
      this._initialized = false;
      this._rafId = null;
      this._lastFrameTime = 0;
      this._entityIdCounter = 1;
      this._touchStartX = 0;
      this._touchStartY = 0;
      this._touchStartTime = 0;
      this._keysDown = {};
      this.keys = {
        left: false,
        right: false,
        up: false,
        down: false,
        drift: false,
        boost: false
      };
      this._analogSteerInput = 0;
      this._tapSteerTimer = 0;
      this._driftSparkAccum = 0;

      // Spawner timers
      this._spawnTimer = 0;
      this._pickupTimer = 0;
      this._blockadeTimer = 0;
      this._radioCooldown = 0;

      this.state = this._createInitialState('MENU');
    }

    /**
     * Builds a fresh, fully populated state object compatible with
     * GT6Renderer, GT6UI, GT6Audio, and GT6Backend.
     */
    _createInitialState(mode = 'MENU', playerName = 'RAFA PT-13') {
      const initialLane = 1;
      const initialX = LANES[initialLane];
      const initialCurve = mode === 'PLAYING' ? 0.24 : 0.32;

      const state = {
        mode: mode, // 'MENU' | 'PLAYING' | 'PAUSED' | 'BUSTED'
        lanes: LANES.slice(),
        playerName: playerName || 'RAFA PT-13',
        vehicleTag: 'EDTECH PT-13 CHOPPER',

        // Continuous analog-style steering & non-falling motorcycle state (z = 0 is Rafa's anchor position)
        laneIndex: initialLane,
        lane: initialLane,
        x: initialX,
        targetX: initialX,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        pitch: 0,
        roll: 0,
        steerDir: 0,
        steerAngle: 0,
        driftAngle: 0,
        wheelRotation: 0,

        // Gyroscopic Never-Fall Guarantee ("sem que o boneco possa cair")
        neverFall: true,
        riderSeated: true,
        isFallen: false,
        ragdoll: false,

        // Continuous input state reference
        keys: this.keys,

        // Sweeping 3D Highway Curvature State (-1.0 sharp left to +1.0 sharp right)
        roadCurve: initialCurve,
        roadCurvature: initialCurve,
        roadTargetCurve: initialCurve,
        roadCurveOffset: 0,
        roadBank: -initialCurve * 0.06,
        roadHeading: 0,
        centrifugalForce: 0,

        // Action flags & timers
        isJumping: false,
        isAirborne: false,
        isDrifting: false,
        driftTimer: 0,
        isBoosting: false,
        nitroActive: false,
        isCinematicJump: false,
        cinematicTimer: 0,
        timeScale: 1.0,
        invulnerableTimer: 0,
        empTimer: 0,
        empCooldown: 0,
        cameraShake: 0,

        // Speed & GTA Stats
        speed: mode === 'PLAYING' ? 95 : 115,
        baseSpeed: 95,
        maxSpeed: 95,
        speedRatio: 95 / 300,
        worldSpeed: 42,

        // Cash & Score (video starts at $1,956,791 and ticks up!)
        baseBountyCash: BASE_BOUNTY_CASH,
        cash: BASE_BOUNTY_CASH,
        totalBountyCash: BASE_BOUNTY_CASH,
        runCashEarned: 0,
        runScore: 0,
        score: 0,

        // Distance & Vitals
        distance: 0,
        distanceM: 0,
        health: 100,
        maxHealth: 100,
        armor: 100,
        maxArmor: 100,
        nitro: 100,
        maxNitro: 100,
        ammo: INITIAL_AMMO,
        ammoClip: CLIP_SIZE,
        ammoDisplay: `${INITIAL_AMMO}-${CLIP_SIZE}`,

        // GTA Wanted System & Combo
        wantedStars: mode === 'MENU' ? 6 : 1,
        stars: mode === 'MENU' ? 6 : 1,
        heat: 0,
        combo: 1,
        maxCombo: 1,
        comboTimer: 0,

        // Run Telemetry Counters
        roadblocksBroken: 0,
        copsEvaded: 0,
        nearMisses: 0,
        rampsJumped: 0,
        elapsedTime: 0,

        // Helicopter Aerial Pursuit State (active at 4-6 stars or cinematic jump)
        heliActive: mode === 'MENU',
        heliSearchlightX: initialX,
        heliSearchlightZ: -10,
        heliLockTimer: 0,

        // Dynamic World Entities
        // Coordinate convention: Rafa is at z = 0; oncoming entities spawn at z = -150 and move toward z = +25.
        obstacles: [],
        ramps: [],
        pickups: [],
        chasers: []
      };

      // Provide a synchronized nested `state.player` view for renderers/UI that inspect `state.player.*`
      state.player = {
        laneIndex: state.laneIndex,
        lane: state.laneIndex,
        x: state.x,
        targetX: state.targetX,
        y: state.y,
        z: state.z,
        vx: state.vx,
        vy: state.vy,
        pitch: state.pitch,
        roll: state.roll,
        steerAngle: state.steerAngle,
        driftAngle: state.driftAngle,
        isJumping: state.isJumping,
        isAirborne: state.isAirborne,
        isDrifting: state.isDrifting,
        isBoosting: state.isBoosting,
        isCinematicJump: state.isCinematicJump,
        invulnerable: false,
        neverFall: true,
        riderSeated: true,
        isFallen: false
      };

      this._seedChasers(state);
      return state;
    }

    /**
     * Computes dynamic lane index (0..3) from continuous lateral coordinate `x`.
     */
    _computeLaneIndexFromX(x) {
      return Math.max(0, Math.min(3, Math.round(((Number(x) || 0) + 4.5) / 3)));
    }

    /**
     * Keeps `state.player`, dynamic `laneIndex`, road curvature aliases, and Never-Fall guarantees in sync every frame.
     */
    _syncAliases() {
      const s = this.state;
      s.laneIndex = this._computeLaneIndexFromX(s.x);
      s.lane = s.laneIndex;
      s.isAirborne = Boolean(s.isJumping || s.y > 0.05);
      s.nitroActive = Boolean(s.isBoosting);
      s.stars = s.wantedStars;
      s.totalBountyCash = Math.floor(s.cash);
      s.score = Math.floor(s.runScore);
      s.distanceM = Math.floor(s.distance);
      s.speedRatio = Math.min(1, Math.max(0, s.speed / 300));
      s.ammoDisplay = `${s.ammo}-${s.ammoClip}`;
      s.roadCurvature = s.roadCurve;
      s.roadBank = -s.roadCurve * 0.06;

      // Never-Fall Guarantee: Rafa is permanently stabilized in the saddle
      s.neverFall = true;
      s.riderSeated = true;
      s.isFallen = false;
      s.ragdoll = false;

      if (s.player) {
        s.player.laneIndex = s.laneIndex;
        s.player.lane = s.laneIndex;
        s.player.x = s.x;
        s.player.targetX = s.targetX;
        s.player.y = s.y;
        s.player.z = s.z;
        s.player.vx = s.vx;
        s.player.vy = s.vy;
        s.player.pitch = s.pitch;
        s.player.roll = s.roll;
        s.player.steerAngle = s.steerAngle;
        s.player.driftAngle = s.driftAngle;
        s.player.isJumping = s.isJumping;
        s.player.isAirborne = s.isAirborne;
        s.player.isDrifting = s.isDrifting;
        s.player.isBoosting = s.isBoosting;
        s.player.isCinematicJump = s.isCinematicJump;
        s.player.invulnerable = s.invulnerableTimer > 0;
        s.player.neverFall = true;
        s.player.riderSeated = true;
        s.player.isFallen = false;
      }
    }

    /**
     * Returns the lateral X offset of the curving 3D highway at depth `z` (in meters, negative ahead of Rafa).
     * Used by `js/renderer.js` to curve the highway, buildings, streetlights, and traffic ahead of Rafa.
     */
    getRoadOffsetAtZ(z = 0) {
      const curve = (this.state && Number.isFinite(this.state.roadCurve)) ? this.state.roadCurve : 0;
      const normZ = (Number(z) || 0) / 100;
      return curve * (normZ * normZ) * 28;
    }

    /**
     * Returns the yaw tangent angle (in radians) of the curving highway at depth `z`.
     */
    getRoadAngleAtZ(z = 0) {
      const curve = (this.state && Number.isFinite(this.state.roadCurve)) ? this.state.roadCurve : 0;
      const normZ = (Number(z) || 0) / 100;
      return Math.atan2(curve * 2 * normZ * 0.28, 1);
    }

    /**
     * Populates pursuing police cruisers trailing behind Rafa (positive Z).
     */
    _seedChasers(state) {
      state.chasers = [
        {
          id: 'chaser-1',
          type: 'police_car',
          subtype: 'chaser',
          lane: 1,
          laneIndex: 1,
          x: LANES[1] - 0.6,
          targetX: LANES[1],
          y: 0,
          z: 8.5,
          width: 2.0,
          length: 4.4,
          height: 1.5,
          speed: state.speed,
          sirenPhase: 0,
          active: true
        },
        {
          id: 'chaser-2',
          type: 'police_car',
          subtype: 'chaser',
          lane: 2,
          laneIndex: 2,
          x: LANES[2] + 0.6,
          targetX: LANES[2],
          y: 0,
          z: 12.0,
          width: 2.0,
          length: 4.4,
          height: 1.5,
          speed: state.speed,
          sirenPhase: Math.PI,
          active: true
        }
      ];
    }

    /**
     * Initializes controls and starts the main requestAnimationFrame loop.
     */
    init(options = {}) {
      if (this._initialized) {
        return this;
      }
      this._initialized = true;

      if (options.container && window.GT6Renderer && !window.GT6Renderer._initialized) {
        try {
          window.GT6Renderer.init(options.container);
        } catch (err) {
          console.warn('[GT6Game] Renderer init warning:', err);
        }
      }

      this._bindControls();
      this._syncAliases();

      // Update initial HUD if present
      if (window.GT6UI && typeof window.GT6UI.updateHUD === 'function') {
        try {
          window.GT6UI.updateHUD(this.state);
        } catch (err) {
          console.warn('[GT6Game] Initial HUD sync warning:', err);
        }
      }

      this._lastFrameTime = performance.now();
      this._rafId = requestAnimationFrame((ts) => this._loop(ts));
      return this;
    }

    /**
     * Reads current continuous lateral steering input in [-1, +1] from keyboard or touch hold.
     */
    _getSteerInput() {
      const kd = this._keysDown || {};
      const sk = (this.state && this.state.keys) || this.keys || {};
      const leftHeld = Boolean(
        this.keys.left ||
        sk.left ||
        kd['ArrowLeft'] ||
        kd['KeyA'] ||
        kd['a'] ||
        kd['A']
      );
      const rightHeld = Boolean(
        this.keys.right ||
        sk.right ||
        kd['ArrowRight'] ||
        kd['KeyD'] ||
        kd['d'] ||
        kd['D']
      );

      let dir = 0;
      if (leftHeld) dir -= 1;
      if (rightHeld) dir += 1;
      if (dir === 0 && Number.isFinite(this._analogSteerInput) && Math.abs(this._analogSteerInput) > 0.01) {
        dir = Math.max(-1, Math.min(1, this._analogSteerInput));
      }
      return dir;
    }

    /**
     * Reads whether the rear-wheel drift brake (`S` / `ArrowDown`) is currently held.
     */
    _isDriftKeyHeld() {
      const kd = this._keysDown || {};
      const sk = (this.state && this.state.keys) || this.keys || {};
      return Boolean(
        this.keys.down ||
        this.keys.drift ||
        sk.down ||
        sk.drift ||
        kd['ArrowDown'] ||
        kd['KeyS'] ||
        kd['s'] ||
        kd['S']
      );
    }

    /**
     * Binds Keyboard, Touch Hold & Touch Swipe controls for continuous analog-style steering.
     */
    _bindControls() {
      window.addEventListener('keydown', (e) => {
        // Ignore keyboard shortcuts when typing in an input field (e.g. player name or Supabase URL)
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
          return;
        }

        this._keysDown[e.code] = true;

        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          this.keys.left = true;
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          this.keys.right = true;
        } else if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') {
          this.keys.up = true;
        } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
          this.keys.down = true;
          this.keys.drift = true;
        } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyE') {
          this.keys.boost = true;
        }

        if (e.code === 'KeyP' || e.code === 'Escape') {
          if (this.state.mode === 'PLAYING') {
            e.preventDefault();
            this.pauseGame();
          } else if (this.state.mode === 'PAUSED') {
            e.preventDefault();
            this.resumeGame();
          }
          return;
        }

        if (this.state.mode !== 'PLAYING') {
          if (e.code === 'Enter' && this.state.mode === 'BUSTED') {
            e.preventDefault();
            this.restartGame();
          }
          return;
        }

        switch (e.code) {
          case 'ArrowLeft':
          case 'KeyA':
            e.preventDefault();
            if (!e.repeat) this.moveLeft();
            break;

          case 'ArrowRight':
          case 'KeyD':
            e.preventDefault();
            if (!e.repeat) this.moveRight();
            break;

          case 'ArrowUp':
          case 'KeyW':
          case 'Space':
            e.preventDefault();
            if (!e.repeat) this.jump();
            break;

          case 'ArrowDown':
          case 'KeyS':
            e.preventDefault();
            this.drift(true);
            break;

          case 'ShiftLeft':
          case 'ShiftRight':
          case 'KeyE':
            e.preventDefault();
            this.triggerNitro();
            break;

          case 'KeyF':
          case 'KeyQ':
            e.preventDefault();
            if (!e.repeat) this.fireWeapon();
            break;

          default:
            break;
        }
      });

      window.addEventListener('keyup', (e) => {
        this._keysDown[e.code] = false;
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          this.keys.left = Boolean(this._keysDown['ArrowLeft'] || this._keysDown['KeyA']);
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          this.keys.right = Boolean(this._keysDown['ArrowRight'] || this._keysDown['KeyD']);
        } else if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') {
          this.keys.up = false;
        } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
          this.keys.down = Boolean(this._keysDown['ArrowDown'] || this._keysDown['KeyS']);
          this.keys.drift = this.keys.down;
          if (!this.keys.down && this.state.isDrifting && this.state.driftTimer <= 0.15) {
            this.state.isDrifting = false;
          }
        } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyE') {
          this.keys.boost = false;
        }
      });

      window.addEventListener('blur', () => {
        this._keysDown = {};
        this.keys.left = false;
        this.keys.right = false;
        this.keys.up = false;
        this.keys.down = false;
        this.keys.drift = false;
        this.keys.boost = false;
        this._analogSteerInput = 0;
      });

      // Continuous pointer-hold support on mobile steering buttons (#btn-ctrl-left / #btn-ctrl-right / #btn-ctrl-drift)
      if (typeof document !== 'undefined') {
        const bindHoldBtn = (id, keyProp) => {
          const btn = document.getElementById(id);
          if (!btn) return;
          btn.addEventListener('pointerdown', () => {
            this.keys[keyProp] = true;
          });
          const release = () => {
            this.keys[keyProp] = false;
          };
          btn.addEventListener('pointerup', release);
          btn.addEventListener('pointercancel', release);
          btn.addEventListener('pointerleave', release);
        };
        bindHoldBtn('btn-ctrl-left', 'left');
        bindHoldBtn('btn-ctrl-right', 'right');
        bindHoldBtn('btn-ctrl-drift', 'drift');
      }

      // Touch drag / swipe controls on the game canvas / document
      window.addEventListener('touchstart', (e) => {
        if (!e.touches || e.touches.length === 0) return;
        const t = e.touches[0];
        this._touchStartX = t.clientX;
        this._touchStartY = t.clientY;
        this._touchStartTime = performance.now();
      }, { passive: true });

      window.addEventListener('touchmove', (e) => {
        if (this.state.mode !== 'PLAYING') return;
        if (!e.touches || e.touches.length === 0) return;
        const target = e.target;
        if (target && target.closest && target.closest('button, input, a, .modal, .hud-btn')) {
          return;
        }
        const t = e.touches[0];
        const dx = t.clientX - this._touchStartX;
        if (Math.abs(dx) > 14) {
          this._analogSteerInput = Math.max(-1, Math.min(1, dx / 75));
        }
      }, { passive: true });

      window.addEventListener('touchend', (e) => {
        this._analogSteerInput = 0;
        if (this.state.mode !== 'PLAYING') return;
        if (!e.changedTouches || e.changedTouches.length === 0) return;

        // Avoid hijacking taps on buttons or modals
        const target = e.target;
        if (target && target.closest && target.closest('button, input, a, .modal, .hud-btn')) {
          return;
        }

        const t = e.changedTouches[0];
        const dx = t.clientX - this._touchStartX;
        const dy = t.clientY - this._touchStartY;
        const elapsed = performance.now() - this._touchStartTime;

        if (elapsed > 600) return;

        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        if (Math.max(absX, absY) < 28) {
          return;
        }

        if (absX > absY) {
          if (dx < 0) {
            this.moveLeft();
          } else {
            this.moveRight();
          }
        } else {
          if (dy < 0) {
            this.jump();
          } else {
            this.drift(true);
          }
        }
      }, { passive: true });
    }

    // =========================================================================
    // PUBLIC GAME LIFECYCLE & CONTROL API (called by Keyboard, Touch & GT6UI)
    // =========================================================================

    startGame(playerName) {
      const resolvedName = (typeof playerName === 'string' && playerName.trim())
        ? playerName.trim().toUpperCase()
        : (this.state.playerName || 'RAFA PT-13');

      this._keysDown = {};
      this.keys.left = false;
      this.keys.right = false;
      this.keys.up = false;
      this.keys.down = false;
      this.keys.drift = false;
      this.keys.boost = false;
      this._analogSteerInput = 0;
      this._tapSteerTimer = 0;

      this.state = this._createInitialState('PLAYING', resolvedName);
      this.state.invulnerableTimer = 1.5;

      // Reset spawner timers so the first traffic appears quickly and the first
      // iconic "FURANDO O BLOQUEIO" ramp + police blockade arrives around ~6.2s!
      this._spawnTimer = 0.6;
      this._pickupTimer = 1.1;
      this._blockadeTimer = 6.2;
      this._radioCooldown = 0;

      // Spawn a welcoming trail of cash & a police car far ahead right away
      this._spawnCashLine(1, -55, 4);
      this._spawnSingleObstacle('police_car', 2, -95);

      this._syncAliases();

      // Initialize & trigger Audio Engine + Police Dispatch
      if (window.GT6Audio) {
        try {
          window.GT6Audio.init?.();
          window.GT6Audio.startEngine?.();
          window.GT6Audio.setWantedLevel?.(this.state.wantedStars);
        } catch (err) {
          console.warn('[GT6Game] Audio start warning:', err);
        }
      }

      this._dispatchPoliceRadio('start', RADIO_MESSAGES.start);

      if (window.GT6Renderer) {
        window.GT6Renderer.setCameraMode?.('chase');
      }

      if (window.GT6UI) {
        window.GT6UI.showCinematicToast?.('FUGA INICIADA!', 'EDTECH PT-13 • VICE CITY NIGHT RUN');
        window.GT6UI.updateHUD?.(this.state);
      }

      if (window.GT6Backend) {
        window.GT6Backend.logTelemetry?.('run_started', {
          player_name: resolvedName,
          vehicle: this.state.vehicleTag,
          starting_bounty: BASE_BOUNTY_CASH
        });
      }

      if (!this._rafId) {
        this._lastFrameTime = performance.now();
        this._rafId = requestAnimationFrame((ts) => this._loop(ts));
      }

      return this.state;
    }

    pauseGame() {
      if (this.state.mode !== 'PLAYING') return;
      this.state.mode = 'PAUSED';
      window.GT6Audio?.stopEngine?.();
      window.GT6UI?.updateHUD?.(this.state);
    }

    resumeGame() {
      if (this.state.mode !== 'PAUSED') return;
      this.state.mode = 'PLAYING';
      this._lastFrameTime = performance.now();
      window.GT6Audio?.startEngine?.();
      window.GT6Audio?.setWantedLevel?.(this.state.wantedStars);
      window.GT6UI?.updateHUD?.(this.state);
    }

    togglePause() {
      if (this.state.mode === 'PLAYING') {
        this.pauseGame();
      } else if (this.state.mode === 'PAUSED') {
        this.resumeGame();
      }
    }

    restartGame(playerName) {
      return this.startGame(playerName || this.state.playerName);
    }

    /**
     * Smooth analog-style left steering nudge (~2.2m targetX shift + lateral velocity impulse & counter-steering lean).
     * Works seamlessly with both quick taps of `A`/`Left` and continuous key hold!
     */
    moveLeft() {
      if (this.state.mode !== 'PLAYING') return false;
      const s = this.state;
      if (s.x <= -ROAD_HALF_WIDTH + 0.05 && s.vx <= 0) {
        return false;
      }

      const baseTarget = Number.isFinite(s.targetX) ? s.targetX : s.x;
      s.targetX = Math.max(-ROAD_SOFT_BOUND, Math.min(ROAD_SOFT_BOUND, Math.min(s.x - 1.6, baseTarget - 2.2)));
      s.vx = Math.max(-16.5, Math.min(-6.8, s.vx - 8.2));
      s.x = Math.max(-ROAD_HALF_WIDTH, s.x - 0.22);
      s.steerDir = -1;
      s.steerAngle = Math.min(0.38, Math.max(0.18, s.steerAngle + 0.22));
      s.roll = Math.min(0.46, Math.max(s.roll + 0.14, 0.26));
      this._tapSteerTimer = 0.26;
      s.nitro = Math.min(100, s.nitro + 1.8);

      // High-speed sharp counter-steer triggers controlled rear-wheel power-slide sparks
      if (s.speed > 135 && Math.abs(s.vx) > 8.5) {
        s.isDrifting = true;
        s.driftTimer = Math.max(s.driftTimer, 0.22);
        s.driftAngle = 0.20;
        window.GT6Renderer?.triggerEffect?.('sparks', { x: s.x, y: Math.max(0.08, s.y), z: 0.45 });
      }

      this._syncAliases();
      return true;
    }

    /**
     * Smooth analog-style right steering nudge (~2.2m targetX shift + lateral velocity impulse & counter-steering lean).
     * Works seamlessly with both quick taps of `D`/`Right` and continuous key hold!
     */
    moveRight() {
      if (this.state.mode !== 'PLAYING') return false;
      const s = this.state;
      if (s.x >= ROAD_HALF_WIDTH - 0.05 && s.vx >= 0) {
        return false;
      }

      const baseTarget = Number.isFinite(s.targetX) ? s.targetX : s.x;
      s.targetX = Math.max(-ROAD_SOFT_BOUND, Math.min(ROAD_SOFT_BOUND, Math.max(s.x + 1.6, baseTarget + 2.2)));
      s.vx = Math.min(16.5, Math.max(6.8, s.vx + 8.2));
      s.x = Math.min(ROAD_HALF_WIDTH, s.x + 0.22);
      s.steerDir = 1;
      s.steerAngle = Math.max(-0.38, Math.min(-0.18, s.steerAngle - 0.22));
      s.roll = Math.max(-0.46, Math.min(s.roll - 0.14, -0.26));
      this._tapSteerTimer = 0.26;
      s.nitro = Math.min(100, s.nitro + 1.8);

      if (s.speed > 135 && Math.abs(s.vx) > 8.5) {
        s.isDrifting = true;
        s.driftTimer = Math.max(s.driftTimer, 0.22);
        s.driftAngle = -0.20;
        window.GT6Renderer?.triggerEffect?.('sparks', { x: s.x, y: Math.max(0.08, s.y), z: 0.45 });
      }

      this._syncAliases();
      return true;
    }

    /**
     * Grounded Wheelie / Bunny-Hop (`y` max ~1.08m, `pitch` wheelie tilt) on the Red Fat-Tire Chopper
     * to hop over spike strips or low barriers without flying unrealistically into the sky.
     */
    jump() {
      if (this.state.mode !== 'PLAYING') return false;
      const s = this.state;
      if (!s.isJumping && s.y <= 0.08) {
        s.isJumping = true;
        s.isAirborne = true;
        s.vy = 7.5; // With gravity 26.0 m/s^2, reaches realistic grounded bunny-hop apex of ~1.08m
        s.pitch = 0.26; // Realistic front-wheel wheelie lift

        window.GT6Audio?.playSfx?.('jump');
        window.GT6Renderer?.triggerEffect?.('sparks', { x: s.x, y: 0.08, z: 0.5 });
        return true;
      }
      return false;
    }

    /**
     * Rear-Wheel Drift / Power-Slide (`S` / `ArrowDown` or cornering slide):
     * Kicks the rear wheel out into a controlled power-slide (`state.isDrifting = true`, `state.driftAngle`),
     * sprays orange friction sparks and white tire smoke, builds EDTECH Nitro battery, and breaks Helicopter lock-on!
     */
    drift(active = true) {
      if (this.state.mode !== 'PLAYING') return false;
      const s = this.state;
      if (active) {
        const steerInput = this._getSteerInput();
        const slideDir = steerInput !== 0
          ? steerInput
          : (s.steerDir !== 0 ? s.steerDir : (Math.abs(s.roadCurve) > 0.08 ? Math.sign(s.roadCurve) : (s.x > 0 ? -1 : 1)));

        s.isDrifting = true;
        s.driftTimer = 0.65;
        s.heliLockTimer = 0; // Dodges helicopter lock-on!
        s.steerDir = slideDir;
        s.roll = Math.max(-0.46, Math.min(0.46, -slideDir * 0.44));
        s.driftAngle = -slideDir * 0.24;
        s.steerAngle = slideDir * 0.22; // Counter-steering handlebars into the slide
        s.nitro = Math.min(100, s.nitro + 6);

        window.GT6Renderer?.triggerEffect?.('sparks', { x: s.x, y: Math.max(0.08, s.y), z: 0.45 });
        return true;
      } else {
        s.isDrifting = false;
        s.driftTimer = 0;
        return false;
      }
    }

    /**
     * Activates EDTECH PT-13 Nitro Boost (pushes speed up toward 300 km/h and smashes through roadblocks).
     */
    triggerNitro() {
      if (this.state.mode !== 'PLAYING') return false;
      const s = this.state;
      if (s.isBoosting) return true;
      if (s.nitro < 20) {
        window.GT6UI?.showCinematicToast?.('BATERIA EDTECH BAIXA!', 'FAÇA DRIFT OU COLETE CÉLULAS DE NITRO');
        return false;
      }

      s.isBoosting = true;
      s.nitroActive = true;
      s.pitch = Math.max(s.pitch, 0.20); // Wheelie boost posture
      s.cameraShake = Math.max(s.cameraShake, 0.35);

      window.GT6Audio?.playSfx?.('nitro');
      window.GT6Renderer?.triggerEffect?.('nitro', { x: s.x, y: s.y + 0.4, z: 1.0 });
      window.GT6UI?.showCinematicToast?.('TURBO EDTECH PT-13!', '300 KM/H • IMPACTO BLINDADO ATIVO');
      return true;
    }

    /**
     * Fires SMG / EDTECH EMP Burst (`558-30`) to blast police blockades and cruisers ahead!
     */
    fireWeapon() {
      if (this.state.mode !== 'PLAYING') return false;
      const s = this.state;
      if (s.empCooldown > 0) return false;

      if (s.ammo <= 0 && s.ammoClip <= 0) {
        window.GT6UI?.showCinematicToast?.('SEM MUNIÇÃO / EMP!', 'COLETE CÁPSULAS EMP NA PISTA');
        return false;
      }

      // Consume 30-round burst from reserve (558-30 style)
      s.ammo = Math.max(0, s.ammo - CLIP_SIZE);
      s.ammoClip = CLIP_SIZE;
      s.ammoDisplay = `${s.ammo}-${s.ammoClip}`;

      return this.triggerEmpBlast(false);
    }

    /**
     * Executes the EMP / Weapon wave that destroys police roadblocks & cruisers ahead.
     */
    triggerEmpBlast(fromPickup = false) {
      const s = this.state;
      s.empTimer = 1.15;
      s.empCooldown = fromPickup ? 0.4 : 1.8;
      s.cameraShake = Math.max(s.cameraShake, 0.65);

      window.GT6Audio?.playSfx?.('emp');
      window.GT6Renderer?.triggerEffect?.('emp', { x: s.x, y: s.y + 0.6, z: -18 });

      let destroyedCount = 0;
      for (let i = 0; i < s.obstacles.length; i++) {
        const obs = s.obstacles[i];
        if (!obs.active) continue;
        // Destroy any obstacle ahead within 95 meters or right beside Rafa
        if (obs.z >= -95 && obs.z <= 8) {
          obs.active = false;
          obs.hit = true;
          destroyedCount++;

          if (obs.type === 'roadblock' || obs.isBlockadePart) {
            s.roadblocksBroken += 1;
          } else if (obs.type === 'police_car' || obs.type === 'swat_van') {
            s.copsEvaded += 1;
          }

          window.GT6Renderer?.triggerEffect?.('explosion', { x: obs.x, y: 0.7, z: obs.z });
        }
      }

      // Push chasing police cruisers backward
      for (let i = 0; i < s.chasers.length; i++) {
        s.chasers[i].z = Math.min(20, s.chasers[i].z + 5.5);
      }

      if (destroyedCount > 0) {
        const bonus = destroyedCount * 1500 * s.combo;
        this._awardCashAndScore(bonus, bonus);
        s.heat += destroyedCount * 6;
        this._bumpCombo(1);
        window.GT6UI?.showCinematicToast?.(
          `CERCO DESTRUÍDO! +$${bonus.toLocaleString('pt-BR')}`,
          `${destroyedCount} VIATURA(S) NEUTRALIZADA(S) • 558-30`
        );
      } else if (!fromPickup) {
        window.GT6UI?.showCinematicToast?.('DISPARO EMP 558-30!', 'ONDA DE CHOQUE EDTECH DISPARADA');
      }

      this._checkWantedEscalation();
      return true;
    }

    // =========================================================================
    // SWEEPING 3D HIGHWAY CURVATURE GENERATOR
    // =========================================================================

    /**
     * Generates smooth, continuous highway curvature (`-1.0` sharp left curve to `+1.0` sharp right curve),
     * transitioning organically through straightaways, Ocean Drive sweepers, and high-speed S-curves.
     */
    _computeTargetRoadCurve(distance, elapsedTime, isMenu = false) {
      if (isMenu) {
        return Math.max(
          -0.85,
          Math.min(
            0.85,
            Math.sin(elapsedTime * 0.38 + 0.6) * 0.55 + Math.cos(elapsedTime * 0.19) * 0.25
          )
        );
      }

      const d = (Number(distance) || 0) + (Number(elapsedTime) || 0) * 14.0;
      const primarySweep = Math.sin(d * 0.0046 + 0.45);
      const secondaryBend = Math.sin(d * 0.0112 - 0.8) * 0.45;
      const chicaneWave = Math.cos(d * 0.0215 + 0.3) * 0.25;
      let raw = primarySweep * 0.72 + secondaryBend + chicaneWave;

      // Smoothly shape straight sections and full sweeping curves up to ±1.0
      if (Math.abs(raw) < 0.12) {
        raw *= 0.35;
      } else {
        const sign = Math.sign(raw);
        const norm = Math.min(1.0, (Math.abs(raw) - 0.04) / 0.96);
        raw = sign * Math.pow(norm, 0.86);
      }
      return Math.max(-1.0, Math.min(1.0, raw));
    }

    /**
     * Advances `state.roadCurve`, `state.roadCurvature`, `state.roadCurveOffset`, `state.roadBank`, and `state.roadHeading`.
     */
    _updateRoadCurvature(dt, metersDelta, isMenu = false) {
      const s = this.state;
      s.roadTargetCurve = this._computeTargetRoadCurve(s.distance, s.elapsedTime, isMenu);
      const curveLerp = Math.min(1, dt * (isMenu ? 1.5 : 2.1));
      s.roadCurve += (s.roadTargetCurve - s.roadCurve) * curveLerp;
      s.roadCurve = Math.max(-1.0, Math.min(1.0, s.roadCurve));
      s.roadCurvature = s.roadCurve;
      s.roadBank = -s.roadCurve * 0.06;
      s.roadCurveOffset += s.roadCurve * s.worldSpeed * dt * 0.05;
      s.roadHeading += s.roadCurve * ((metersDelta || 0) / 115);
    }

    // =========================================================================
    // MAIN GAME LOOP & PHYSICS STEP
    // =========================================================================

    _loop(timestamp) {
      const rawDt = Math.min(0.05, Math.max(0.001, (timestamp - this._lastFrameTime) / 1000));
      this._lastFrameTime = timestamp;

      if (this.state.mode === 'PLAYING') {
        this._updatePlaying(rawDt);
      } else if (this.state.mode === 'MENU') {
        this._updateMenuPreview(rawDt);
      }

      this._syncAliases();

      // Render 3D scene
      if (window.GT6Renderer && typeof window.GT6Renderer.renderFrame === 'function') {
        try {
          window.GT6Renderer.renderFrame(this.state, rawDt * (this.state.timeScale || 1));
        } catch (err) {
          console.warn('[GT6Game] renderFrame error:', err);
        }
      }

      // Update HUD
      if (window.GT6UI && typeof window.GT6UI.updateHUD === 'function' && this.state.mode === 'PLAYING') {
        try {
          window.GT6UI.updateHUD(this.state);
        } catch (err) {
          console.warn('[GT6Game] updateHUD error:', err);
        }
      }

      this._rafId = requestAnimationFrame((ts) => this._loop(ts));
    }

    /**
     * Keeps the 3D Vice City background alive while the user is viewing the Start Menu.
     */
    _updateMenuPreview(rawDt) {
      const s = this.state;
      s.elapsedTime += rawDt;
      s.speed = 148 + Math.sin(s.elapsedTime * 0.8) * 18;
      s.worldSpeed = s.speed * 0.42;
      const metersDelta = (s.speed / 3.6) * rawDt;
      s.distance += metersDelta;
      s.wheelRotation += s.worldSpeed * rawDt * 1.8;

      this._updateRoadCurvature(rawDt, metersDelta, true);

      // Smooth continuous carving along the curving avenue on the menu preview
      s.targetX = Math.sin(s.elapsedTime * 0.55) * 3.4 + s.roadCurve * 1.6;
      const dx = s.targetX - s.x;
      s.vx = dx * 3.8;
      s.x += dx * Math.min(1, rawDt * 4.5);
      s.laneIndex = this._computeLaneIndexFromX(s.x);
      s.roll = Math.max(-0.38, Math.min(0.38, -s.vx * 0.055 - s.roadCurve * 0.14));
      s.steerAngle = -s.roll * 0.55;
      s.heliSearchlightX = Math.sin(s.elapsedTime * 1.5) * 4.5;
      s.heliSearchlightZ = -9 + Math.cos(s.elapsedTime * 1.1) * 3.5;

      for (let i = 0; i < s.chasers.length; i++) {
        const c = s.chasers[i];
        c.sirenPhase += rawDt * 12;
        c.x += (LANES[c.laneIndex] - c.x) * Math.min(1, rawDt * 4);
        c.z = 8.5 + i * 3.2 + Math.sin(s.elapsedTime * 2 + i) * 1.1;
      }
    }

    /**
     * Core frame update during active gameplay (`mode === 'PLAYING'`).
     */
    _updatePlaying(rawDt) {
      const s = this.state;

      // 1. Handle Cinematic Ramp Jump Slow-Motion (0.55x dramatic time dilation like 0:08 in video)
      if (s.isCinematicJump) {
        s.cinematicTimer -= rawDt;
        s.timeScale = 0.55;
        if (s.cinematicTimer <= 0 && s.y <= 0.1) {
          s.isCinematicJump = false;
          s.timeScale = 1.0;
          window.GT6Renderer?.setCameraMode?.('chase');
        }
      } else {
        s.timeScale = 1.0;
      }

      const dt = rawDt * s.timeScale;
      s.elapsedTime += rawDt;

      if (this._radioCooldown > 0) this._radioCooldown = Math.max(0, this._radioCooldown - rawDt);
      if (s.invulnerableTimer > 0) s.invulnerableTimer = Math.max(0, s.invulnerableTimer - rawDt);
      if (s.empTimer > 0) s.empTimer = Math.max(0, s.empTimer - rawDt);
      if (s.empCooldown > 0) s.empCooldown = Math.max(0, s.empCooldown - rawDt);
      if (s.cameraShake > 0) s.cameraShake = Math.max(0, s.cameraShake - rawDt * 2.2);

      // Combo decay
      if (s.combo > 1) {
        s.comboTimer -= rawDt;
        if (s.comboTimer <= 0) {
          s.combo = 1;
        }
      }

      // 2. Speed, EDTECH Nitro Boost & Distance Progression
      // Base speed scales from 95 km/h up to 240 km/h with distance and wanted stars
      const starBonus = (s.wantedStars - 1) * 14;
      const distBonus = Math.min(85, s.distance * 0.038);
      s.baseSpeed = Math.min(240, 95 + starBonus + distBonus);

      if (s.isBoosting) {
        s.nitro = Math.max(0, s.nitro - rawDt * 24);
        const targetBoostSpeed = 300;
        s.speed += (targetBoostSpeed - s.speed) * Math.min(1, rawDt * 6.5);
        if (s.nitro <= 0) {
          s.isBoosting = false;
          s.nitroActive = false;
        }
      } else {
        // Passive battery regeneration + faster regen when drifting
        const regenRate = s.isDrifting ? 15.5 : 3.5;
        s.nitro = Math.min(100, s.nitro + rawDt * regenRate);
        const targetSpeed = s.isDrifting ? s.baseSpeed * 0.95 : s.baseSpeed;
        s.speed += (targetSpeed - s.speed) * Math.min(1, rawDt * 3.8);
      }

      if (s.speed > s.maxSpeed) {
        s.maxSpeed = s.speed;
      }
      s.speedRatio = Math.min(1, Math.max(0, s.speed / 300));

      // Convert km/h to 3D world units/sec and meters traveled
      s.worldSpeed = s.speed * 0.44;
      const metersDelta = (s.speed / 3.6) * dt;
      s.distance += metersDelta;

      // Update Sweeping Highway Curves (`state.roadCurve` & `state.roadCurvature`)
      this._updateRoadCurvature(dt, metersDelta, false);

      // Continuous GTA bounty cash & score ticking upward like the video ($1,956,791 -> $1,956,898+)
      const continuousCash = metersDelta * 2.4 * s.combo;
      const continuousScore = metersDelta * 5.0 * s.combo;
      this._awardCashAndScore(continuousCash, continuousScore);

      // 3. Continuous Analog-Style Motorcycle Steering, Centrifugal Curve Pull, Lean & Rear-Wheel Drift
      const steerInput = this._getSteerInput();
      const driftKeyHeld = this._isDriftKeyHeld();

      // Rear-Wheel Drift engagement when holding S / ArrowDown OR hard cornering at speed
      if (driftKeyHeld || (Math.abs(steerInput) > 0 && s.speed > 135 && (Math.abs(s.roadCurve) > 0.38 || Math.abs(s.vx) > 9.2))) {
        s.isDrifting = true;
        s.driftTimer = Math.max(s.driftTimer, driftKeyHeld ? 0.25 : 0.18);
        s.heliLockTimer = 0;
      }

      if (s.driftTimer > 0) {
        s.driftTimer -= rawDt;
        if (s.driftTimer <= 0 && !driftKeyHeld) {
          s.isDrifting = false;
        }
      }

      // Apply continuous lateral steering acceleration when A/D or Left/Right is held
      if (steerInput !== 0) {
        s.steerDir = Math.sign(steerInput);
        const steerAccel = (s.isDrifting ? 42.0 : 35.0) * (0.85 + s.speedRatio * 0.35);
        s.vx += steerInput * steerAccel * rawDt;
        s.targetX = Math.max(-ROAD_SOFT_BOUND, Math.min(ROAD_SOFT_BOUND, s.x + s.vx * 0.22));
      } else if (this._tapSteerTimer > 0) {
        // Complete smooth ~2.2m quick-tap nudge without robotic snapping
        this._tapSteerTimer = Math.max(0, this._tapSteerTimer - rawDt);
        const tapError = s.targetX - s.x;
        s.vx += (tapError * 11.5 - s.vx) * Math.min(1, rawDt * 14.0);
        if (Math.abs(tapError) < 0.08) {
          this._tapSteerTimer = 0;
        }
      } else {
        s.steerDir = Math.abs(s.vx) > 0.45 ? Math.sign(s.vx) : 0;
        s.targetX += (s.x - s.targetX) * Math.min(1, rawDt * 9.0);
      }

      // Apply Realistic Centrifugal Curve Force when riding through a sweeping turn (|roadCurve| > 0.05)
      if (Math.abs(s.roadCurve) > 0.05) {
        const speedCurveFactor = 0.24 + (s.speedRatio * s.speedRatio) * 0.96;
        const centrifugalAccel = -s.roadCurve * speedCurveFactor * 7.8;
        s.centrifugalForce = centrifugalAccel;
        s.vx += centrifugalAccel * rawDt;
      } else {
        s.centrifugalForce = 0;
      }

      // Realistic tire lateral grip damping
      const gripDamping = steerInput !== 0
        ? (s.isDrifting ? 2.3 : 3.1)
        : (this._tapSteerTimer > 0 ? 3.5 : (s.isDrifting ? 4.8 : 8.4));
      s.vx *= Math.exp(-gripDamping * rawDt);
      s.vx = Math.max(-16.5, Math.min(16.5, s.vx));

      // Integrate continuous lateral position
      s.x += s.vx * rawDt;

      // Soft shoulder & curb rebound (-7.2m to +7.2m) so Rafa never gets stuck off-road
      if (s.x < -ROAD_SOFT_BOUND) {
        s.vx += (-ROAD_SOFT_BOUND - s.x) * 24.0 * rawDt;
      } else if (s.x > ROAD_SOFT_BOUND) {
        s.vx += (ROAD_SOFT_BOUND - s.x) * 24.0 * rawDt;
      }

      if (s.x <= -ROAD_HALF_WIDTH) {
        s.x = -ROAD_HALF_WIDTH;
        if (s.vx < 0) s.vx = Math.max(2.8, -s.vx * 0.45);
        s.targetX = Math.max(-ROAD_SOFT_BOUND, s.targetX);
        window.GT6Renderer?.triggerEffect?.('sparks', { x: s.x, y: 0.1, z: 0.2 });
      } else if (s.x >= ROAD_HALF_WIDTH) {
        s.x = ROAD_HALF_WIDTH;
        if (s.vx > 0) s.vx = Math.min(-2.8, -s.vx * 0.45);
        s.targetX = Math.min(ROAD_SOFT_BOUND, s.targetX);
        window.GT6Renderer?.triggerEffect?.('sparks', { x: s.x, y: 0.1, z: 0.2 });
      }

      // Dynamically compute `state.laneIndex` from `state.x`
      s.laneIndex = this._computeLaneIndexFromX(s.x);
      s.lane = s.laneIndex;

      // Counter-steering lean angle (`state.roll` smoothly banking up to ±0.46 rad / 26°)
      const velLean = -s.vx * 0.032;
      const inputLean = -steerInput * (s.isDrifting ? 0.24 : 0.16);
      const curveCounterLean = -s.roadCurve * s.speedRatio * 0.12;
      let targetRoll = velLean + inputLean + curveCounterLean;
      if (s.isDrifting && Math.abs(targetRoll) < 0.30) {
        const driftSign = steerInput !== 0 ? -steerInput : (Math.sign(s.roll || -s.roadCurve || 1));
        targetRoll = driftSign * 0.38;
      }
      targetRoll = Math.max(-0.46, Math.min(0.46, targetRoll));
      s.roll += (targetRoll - s.roll) * Math.min(1, rawDt * 11.5);

      // Handlebar steering angle (`state.steerAngle`) & rear-wheel power-slide yaw (`state.driftAngle`)
      const targetSteerAngle = s.isDrifting
        ? Math.max(-0.38, Math.min(0.38, s.roll * 0.65 - steerInput * 0.22))
        : Math.max(-0.36, Math.min(0.36, -s.roll * 0.62 - steerInput * 0.12));
      s.steerAngle += (targetSteerAngle - s.steerAngle) * Math.min(1, rawDt * 13.0);

      const targetDriftAngle = s.isDrifting
        ? Math.max(-0.28, Math.min(0.28, s.roll * 0.58))
        : Math.max(-0.10, Math.min(0.10, -s.vx * 0.006));
      s.driftAngle += (targetDriftAngle - s.driftAngle) * Math.min(1, rawDt * 10.5);

      // Continuous orange friction sparks & tire smoke while drifting or leaning hard in curves (like 0:03 in video)
      if ((s.isDrifting || Math.abs(s.roll) > 0.24) && !s.isAirborne) {
        this._driftSparkAccum += rawDt;
        if (this._driftSparkAccum >= 0.075) {
          this._driftSparkAccum = 0;
          window.GT6Renderer?.triggerEffect?.('sparks', { x: s.x, y: 0.08, z: 0.55 });
        }
      } else {
        this._driftSparkAccum = 0;
      }

      // 4. Grounded Vertical Wheelie Bunny-Hop (~1.1m max) & Overpass Ramp Jump (~3.0m max) Physics
      if (s.isJumping || s.y > 0) {
        const gravity = s.isCinematicJump ? 22.0 : 26.0;
        s.y += s.vy * dt;
        s.vy -= gravity * dt;

        // Clamp jump ceiling so normal bunny-hops never exceed ~1.12m and overpass ramp jumps stay grounded at ~3.0m
        const maxAllowedY = s.isCinematicJump ? 3.02 : 1.12;
        if (s.y > maxAllowedY) {
          s.y = maxAllowedY;
          if (s.vy > 0) s.vy = 0;
        }

        // Dynamic wheelie pitch in air
        const targetPitch = Math.max(-0.18, Math.min(0.34, s.vy * 0.026));
        s.pitch += (targetPitch - s.pitch) * Math.min(1, rawDt * 10);

        if (s.y <= 0) {
          const wasCinematic = s.isCinematicJump;
          s.y = 0;
          s.vy = 0;
          s.isJumping = false;
          s.isAirborne = false;
          s.pitch = 0;

          if (wasCinematic) {
            s.isCinematicJump = false;
            s.timeScale = 1.0;
            s.cameraShake = Math.max(s.cameraShake, 0.45);
            window.GT6Renderer?.setCameraMode?.('chase');
          }

          // Landing sparks!
          window.GT6Renderer?.triggerEffect?.('sparks', { x: s.x, y: 0.08, z: 0 });
        }
      } else {
        const targetPitch = s.isBoosting ? 0.16 : 0;
        s.pitch += (targetPitch - s.pitch) * Math.min(1, rawDt * 8);
      }

      s.wheelRotation += s.worldSpeed * dt * 1.9;

      // 5. Helicopter Searchlight Sweep (4-6 Stars)
      s.heliActive = s.wantedStars >= 4 || s.isCinematicJump;
      if (s.heliActive) {
        const sweepSpeed = 1.4 + (s.wantedStars - 4) * 0.45;
        const targetHeliX = Math.sin(s.elapsedTime * sweepSpeed) * 4.2 + (s.x * 0.35);
        s.heliSearchlightX += (targetHeliX - s.heliSearchlightX) * Math.min(1, dt * 3.0);
        s.heliSearchlightZ = -8 + Math.cos(s.elapsedTime * 1.2) * 3.5;

        // If Rafa stays directly inside the helicopter spotlight without drifting or boosting
        if (Math.abs(s.x - s.heliSearchlightX) < 1.35 && !s.isDrifting && !s.isBoosting && !s.isJumping) {
          s.heliLockTimer += dt;
          if (s.heliLockTimer > 2.6) {
            s.heliLockTimer = 0;
            this._applyDamage(8, 'MIRA DO HELICÓPTERO POLICIAL');
            window.GT6UI?.showCinematicToast?.('MIRA AÉREA!', 'FAÇA DRIFT (S / ↓) PARA DESVIAR DO HELICÓPTERO!');
          }
        } else {
          s.heliLockTimer = Math.max(0, s.heliLockTimer - dt * 1.5);
        }
      }

      // 6. Update Pursuing Police Chasers (`state.chasers`)
      this._updateChasers(dt);

      // 7. Spawn & Update Dynamic Obstacles, Ramps & Pickups
      this._updateSpawners(dt);
      this._updateRamps(dt);
      this._updatePickups(dt);
      this._updateObstacles(dt);

      // 8. Check Wanted Stars Escalation & Sync Audio Engine
      this._checkWantedEscalation();

      if (window.GT6Audio && typeof window.GT6Audio.updateEngine === 'function') {
        try {
          window.GT6Audio.updateEngine(s.speedRatio, s.isDrifting, s.isAirborne);
        } catch (err) {
          // Ignore audio transient errors
        }
      }
    }

    /**
     * Updates pursuing police cruisers behind Rafa (`z > 0`).
     */
    _updateChasers(dt) {
      const s = this.state;
      const desiredChasers = Math.min(4, 1 + Math.floor(s.wantedStars / 2));

      while (s.chasers.length < desiredChasers) {
        const idx = s.chasers.length;
        const laneIdx = idx % LANES.length;
        s.chasers.push({
          id: `chaser-${idx + 1}`,
          type: 'police_car',
          subtype: 'chaser',
          lane: laneIdx,
          laneIndex: laneIdx,
          x: LANES[laneIdx],
          targetX: LANES[laneIdx],
          y: 0,
          z: 10 + idx * 3.5,
          width: 2.0,
          length: 4.4,
          height: 1.5,
          speed: s.speed,
          sirenPhase: idx * 1.5,
          active: true
        });
      }

      for (let i = 0; i < s.chasers.length; i++) {
        const c = s.chasers[i];
        c.sirenPhase += dt * 14;
        // Chaser 0 shadows Rafa's continuous X position; others spread across nearby lanes
        const targetLane = i === 0
          ? s.laneIndex
          : (s.laneIndex + i) % LANES.length;
        c.lane = targetLane;
        c.laneIndex = targetLane;
        c.targetX = i === 0 ? s.x : LANES[targetLane];
        c.x += (c.targetX - c.x) * Math.min(1, dt * (2.6 + i * 0.4));

        // Distance behind Rafa modulates with boost & wanted level
        const baseZ = (s.isBoosting ? 13.5 : 7.2) + i * 3.4 - (s.wantedStars * 0.35);
        const waveZ = Math.sin(s.elapsedTime * 2.3 + i * 1.7) * 1.2;
        const targetZ = Math.max(4.8, baseZ + waveZ);
        c.z += (targetZ - c.z) * Math.min(1, dt * 3.0);
        c.speed = s.speed;
      }
    }

    // =========================================================================
    // DYNAMIC SPAWNER SYSTEM (Obstacles, Overpass Ramps, Blockades & Pickups)
    // =========================================================================

    _updateSpawners(dt) {
      const s = this.state;

      this._blockadeTimer -= dt;
      this._spawnTimer -= dt;
      this._pickupTimer -= dt;

      // 1. Special Wave: "FURANDO O BLOQUEIO" (Multi-lane Police Blockade + Overpass Jump Ramp)
      if (this._blockadeTimer <= 0) {
        this.spawnBlockadeWave();
        // Next blockade wave in 12..16 seconds (faster at higher stars)
        this._blockadeTimer = Math.max(10.5, 16.5 - s.wantedStars * 0.85);
        // Pause regular traffic briefly so the ramp approach is clean and dramatic
        this._spawnTimer = 2.4;
        return;
      }

      // 2. Regular Traffic & Police Obstacles
      if (this._spawnTimer <= 0) {
        this._spawnTrafficWave();
        const interval = Math.max(0.62, 1.55 - (s.wantedStars * 0.13) - (s.speed / 700));
        this._spawnTimer = interval;
      }

      // 3. Pickups ('cash', 'nitro', 'armor', 'emp')
      if (this._pickupTimer <= 0) {
        this._spawnPickupWave();
        this._pickupTimer = 1.65 + Math.random() * 0.9;
      }
    }

    /**
     * Spawns the signature "FURANDO O BLOQUEIO" wave:
     * - Multi-lane police roadblock at z = -148
     * - Overpass Jump Ramp (`type: 'ramp'`) right in front of it at z = -136
     * - Grounded aerial arc (`y <= 2.9m`) of cash & boost pickups over the blockade!
     */
    spawnBlockadeWave() {
      const s = this.state;
      const blockadeId = `blockade-${this._entityIdCounter++}`;

      // Pick a strategic lane for the Jump Ramp (prefer near Rafa's current lane so it's reachable)
      const candidateLanes = [s.laneIndex];
      if (s.laneIndex > 0) candidateLanes.push(s.laneIndex - 1);
      if (s.laneIndex < 3) candidateLanes.push(s.laneIndex + 1);
      const rampLane = candidateLanes[Math.floor(Math.random() * candidateLanes.length)];

      const blockadeZ = -148;
      const rampZ = -136; // Placed 12m in front of the blockade so Rafa launches right over the police cars!

      // Spawn the Overpass Ramp in `state.ramps`
      s.ramps.push({
        id: `ramp-${this._entityIdCounter++}`,
        type: 'ramp',
        subtype: 'overpass_ramp',
        lane: rampLane,
        laneIndex: rampLane,
        x: LANES[rampLane],
        y: 0,
        z: rampZ,
        width: 2.6,
        length: 6.5,
        height: 1.8,
        blockadeId: blockadeId,
        triggered: false,
        active: true
      });

      // Spawn Police Blockade across all 4 lanes behind the ramp
      for (let lane = 0; lane < LANES.length; lane++) {
        const isSwat = s.wantedStars >= 4 && lane !== rampLane && Math.random() < 0.45;
        const obsType = isSwat ? 'swat_van' : (lane === rampLane ? 'roadblock' : 'police_car');
        s.obstacles.push({
          id: `obs-${this._entityIdCounter++}`,
          type: obsType,
          subtype: 'blockade_unit',
          lane: lane,
          laneIndex: lane,
          x: LANES[lane],
          y: 0,
          z: blockadeZ + (lane % 2 === 0 ? -1.2 : 1.2),
          width: 2.3,
          length: isSwat ? 5.2 : 4.4,
          height: isSwat ? 2.1 : 1.5,
          speed: 0, // Stationary roadblock!
          rotationY: Math.PI * 0.45 * (lane % 2 === 0 ? 1 : -1), // Angled police blockade
          isBlockadePart: true,
          blockadeId: blockadeId,
          hit: false,
          nearMissed: false,
          active: true
        });
      }

      // Spawn a grounded aerial arc of cash + nitro/emp matching the ~3.0m overpass ramp jump trajectory
      const arcHeights = [1.25, 2.25, 2.85, 2.30, 1.35];
      for (let i = 0; i < arcHeights.length; i++) {
        const pickupType = i === 2 ? (s.ammo < 180 ? 'emp' : 'nitro') : 'cash';
        s.pickups.push({
          id: `pickup-${this._entityIdCounter++}`,
          type: pickupType,
          lane: rampLane,
          laneIndex: rampLane,
          x: LANES[rampLane],
          y: arcHeights[i],
          z: rampZ - 4 - i * 4.5,
          width: 1.2,
          length: 1.2,
          height: 1.2,
          active: true
        });
      }

      window.GT6UI?.showCinematicToast?.(
        '⚠️ BLOQUEIO POLICIAL À FRENTE!',
        `USE A RAMPA NA FAIXA ${rampLane + 1} OU DISPARE EMP (F)`
      );

      if (this._radioCooldown <= 0) {
        this._dispatchPoliceRadio('roadblock_warn', RADIO_MESSAGES.roadblock_warn);
      }
    }

    /**
     * Spawns normal oncoming/moving obstacles (`police_car`, `roadblock`, `spike_strip`, `traffic_car`, `swat_van`).
     */
    _spawnTrafficWave() {
      const s = this.state;
      const spawnZ = -145;

      // Determine how many lanes to occupy (1 to 3 lanes, ALWAYS leaving at least 1 clear path)
      const maxOccupied = s.wantedStars >= 4 ? 3 : (s.wantedStars >= 2 ? 2 : 1);
      const count = 1 + Math.floor(Math.random() * maxOccupied);

      const availableLanes = [0, 1, 2, 3];
      // Shuffle lanes
      for (let i = availableLanes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = availableLanes[i];
        availableLanes[i] = availableLanes[j];
        availableLanes[j] = tmp;
      }

      for (let i = 0; i < count; i++) {
        const lane = availableLanes[i];
        const zOffset = i * -7.5;
        const type = this._pickObstacleType();
        this._spawnSingleObstacle(type, lane, spawnZ + zOffset);
      }

      // Occasionally place a jump ramp in front of an obstacle on the remaining lane
      if (Math.random() < 0.22) {
        const rampLane = availableLanes[count];
        s.ramps.push({
          id: `ramp-${this._entityIdCounter++}`,
          type: 'ramp',
          subtype: 'street_ramp',
          lane: rampLane,
          laneIndex: rampLane,
          x: LANES[rampLane],
          y: 0,
          z: spawnZ + 8,
          width: 2.5,
          length: 5.8,
          height: 1.65,
          blockadeId: null,
          triggered: false,
          active: true
        });
      }
    }

    _pickObstacleType() {
      const stars = this.state.wantedStars;
      const r = Math.random();
      if (stars >= 5) {
        if (r < 0.30) return 'police_car';
        if (r < 0.52) return 'swat_van';
        if (r < 0.72) return 'roadblock';
        if (r < 0.88) return 'spike_strip';
        return 'traffic_car';
      } else if (stars >= 3) {
        if (r < 0.34) return 'police_car';
        if (r < 0.56) return 'roadblock';
        if (r < 0.74) return 'spike_strip';
        if (r < 0.86) return 'swat_van';
        return 'traffic_car';
      } else {
        if (r < 0.38) return 'traffic_car';
        if (r < 0.70) return 'police_car';
        if (r < 0.88) return 'roadblock';
        return 'spike_strip';
      }
    }

    _spawnSingleObstacle(type, lane, zPos) {
      const dims = {
        police_car:  { width: 2.0, length: 4.5, height: 1.5, ownSpeed: 28 },
        roadblock:   { width: 2.4, length: 3.2, height: 1.4, ownSpeed: 0 },
        spike_strip: { width: 2.5, length: 1.6, height: 0.35, ownSpeed: 0 },
        traffic_car: { width: 2.0, length: 4.4, height: 1.5, ownSpeed: 18 },
        swat_van:    { width: 2.3, length: 5.4, height: 2.2, ownSpeed: 20 }
      }[type] || { width: 2.0, length: 4.2, height: 1.5, ownSpeed: 15 };

      this.state.obstacles.push({
        id: `obs-${this._entityIdCounter++}`,
        type: type,
        subtype: type,
        lane: lane,
        laneIndex: lane,
        x: LANES[lane],
        y: 0,
        z: zPos,
        width: dims.width,
        length: dims.length,
        height: dims.height,
        speed: dims.ownSpeed,
        rotationY: 0,
        isBlockadePart: false,
        blockadeId: null,
        hit: false,
        nearMissed: false,
        active: true
      });
    }

    _spawnPickupWave() {
      const s = this.state;
      const lane = Math.floor(Math.random() * LANES.length);
      const r = Math.random();

      if (r < 0.55) {
        // Line of 3-5 GTA cash bundles
        this._spawnCashLine(lane, -135, 3 + Math.floor(Math.random() * 3));
      } else {
        let type = 'nitro';
        if (s.health < 65 || s.armor < 50) {
          type = Math.random() < 0.6 ? 'armor' : 'nitro';
        } else if (r < 0.78) {
          type = 'nitro';
        } else if (r < 0.91) {
          type = 'armor';
        } else {
          type = 'emp';
        }

        s.pickups.push({
          id: `pickup-${this._entityIdCounter++}`,
          type: type,
          lane: lane,
          laneIndex: lane,
          x: LANES[lane],
          y: 0.6,
          z: -138,
          width: 1.3,
          length: 1.3,
          height: 1.3,
          active: true
        });
      }
    }

    _spawnCashLine(lane, startZ, count) {
      for (let i = 0; i < count; i++) {
        this.state.pickups.push({
          id: `pickup-${this._entityIdCounter++}`,
          type: 'cash',
          lane: lane,
          laneIndex: lane,
          x: LANES[lane],
          y: 0.55,
          z: startZ - i * 5.2,
          width: 1.2,
          length: 1.2,
          height: 1.2,
          active: true
        });
      }
    }

    // =========================================================================
    // ENTITY MOVEMENT & COLLISION DETECTION (WITH NEVER-FALL DEFLECTION)
    // =========================================================================

    _updateRamps(dt) {
      const s = this.state;
      for (let i = s.ramps.length - 1; i >= 0; i--) {
        const ramp = s.ramps[i];
        if (!ramp.active) {
          s.ramps.splice(i, 1);
          continue;
        }

        ramp.z += s.worldSpeed * dt;

        // Check if Rafa drives onto the ramp
        if (!ramp.triggered && Math.abs(ramp.z) <= 3.6 && Math.abs(ramp.x - s.x) <= 1.55 && s.y <= 1.6) {
          ramp.triggered = true;
          this._triggerRampLaunch(ramp);
        }

        if (ramp.z > 28) {
          s.ramps.splice(i, 1);
        }
      }
    }

    /**
     * Launches Rafa on a realistic grounded overpass jump arc (`y` max ~2.95m, matching 0:08–0:09 in the user's video)
     * right over the crashing police blockade below!
     */
    _triggerRampLaunch(ramp) {
      const s = this.state;
      s.isJumping = true;
      s.isAirborne = true;
      s.y = Math.max(s.y, 0.40);
      s.vy = 10.6; // With gravity 22.0 m/s^2 + 0.40m ramp lip, reaches realistic ~2.95m overpass jump apex!
      s.pitch = 0.32;
      s.isCinematicJump = true;
      s.cinematicTimer = 1.65;
      s.timeScale = 0.55; // Brief 0.55x slow-mo dramatic jump just like 0:08 in the video!
      s.invulnerableTimer = Math.max(s.invulnerableTimer, 2.0);
      s.rampsJumped += 1;
      s.roadblocksBroken += 1;
      s.copsEvaded += 2;
      s.heat += 22;

      this._bumpCombo(2);
      const bonus = 5000;
      this._awardCashAndScore(bonus, bonus * s.combo);

      // Audio & Police Radio: "Cuidado, ele está furando o bloqueio!"
      window.GT6Audio?.playSfx?.('jump');
      window.GT6Audio?.playSfx?.('roadblock');
      this._dispatchPoliceRadio('blockade', RADIO_MESSAGES.blockade);

      // Renderer & UI Cinematic Highlights
      window.GT6Renderer?.setCameraMode?.('cinematic_jump');
      window.GT6Renderer?.triggerEffect?.('jump_cinematic', { x: s.x, y: s.y + 0.8, z: 0 });
      window.GT6Renderer?.triggerEffect?.('sparks', { x: s.x, y: 0.4, z: 0 });

      window.GT6UI?.showCinematicToast?.('FURANDO O BLOQUEIO! +$5.000', 'SALTO CINEMATOGRÁFICO SOBRE O CERCO POLICIAL');
      window.GT6UI?.triggerHeliCamHighlight?.();
    }

    _updatePickups(dt) {
      const s = this.state;
      for (let i = s.pickups.length - 1; i >= 0; i--) {
        const p = s.pickups[i];
        if (!p.active) {
          s.pickups.splice(i, 1);
          continue;
        }

        p.z += s.worldSpeed * dt;

        // Generous magnetic pickup radius around Rafa
        const dx = Math.abs(p.x - s.x);
        const dz = Math.abs(p.z);
        const dy = Math.abs((p.y || 0.5) - s.y);

        if (dz <= 2.6 && dx <= 1.75 && dy <= 2.4) {
          p.active = false;
          this._collectPickup(p);
          s.pickups.splice(i, 1);
          continue;
        }

        if (p.z > 25) {
          s.pickups.splice(i, 1);
        }
      }
    }

    _collectPickup(p) {
      const s = this.state;
      const pos = { x: p.x, y: p.y || 0.6, z: 0 };

      switch (p.type) {
        case 'cash': {
          const amount = 500 * s.combo;
          this._awardCashAndScore(500, amount);
          window.GT6Audio?.playSfx?.('cash');
          window.GT6Renderer?.triggerEffect?.('cash', pos);
          break;
        }
        case 'nitro': {
          s.nitro = Math.min(100, s.nitro + 35);
          this._awardCashAndScore(250, 500);
          window.GT6Audio?.playSfx?.('nitro');
          window.GT6Renderer?.triggerEffect?.('nitro', pos);
          window.GT6UI?.showCinematicToast?.('BATERIA EDTECH +35%', 'CARGA TURBO PT-13 RECARREGADA');
          break;
        }
        case 'armor': {
          s.armor = Math.min(100, s.armor + 30);
          s.health = Math.min(100, s.health + 15);
          this._awardCashAndScore(250, 500);
          window.GT6Audio?.playSfx?.('cash');
          window.GT6Renderer?.triggerEffect?.('cash', pos);
          window.GT6UI?.showCinematicToast?.('COLETE PT-13 +30%', 'BLINDAGEM REFORÇADA');
          break;
        }
        case 'emp': {
          s.ammo += 60;
          s.ammoDisplay = `${s.ammo}-${s.ammoClip}`;
          this.triggerEmpBlast(true);
          break;
        }
        default:
          break;
      }
    }

    _updateObstacles(dt) {
      const s = this.state;

      for (let i = s.obstacles.length - 1; i >= 0; i--) {
        const obs = s.obstacles[i];
        if (!obs.active) {
          s.obstacles.splice(i, 1);
          continue;
        }

        // Move obstacle toward Rafa (stationary blockades move at worldSpeed; oncoming cruisers move faster)
        const relSpeed = s.worldSpeed + (obs.speed || 0) * 0.35;
        obs.z += relSpeed * dt;

        const halfLen = (obs.length || 4.0) * 0.45;
        const halfWid = (obs.width || 2.0) * 0.45;

        // Check Z overlap with Rafa at z = 0
        if (!obs.hit && obs.z >= -halfLen - 1.1 && obs.z <= halfLen + 1.1) {
          const lateralDist = Math.abs(obs.x - s.x);

          if (lateralDist <= halfWid + 0.55) {
            // Did Rafa hop or jump cleanly over this obstacle?
            // Grounded bunny-hop (~1.08m) clears spike strips & low barriers; overpass ramp jump (~3.0m) clears all vehicles
            const clearHeight = obs.type === 'spike_strip'
              ? 0.25
              : (obs.type === 'roadblock' ? 0.78 : (obs.height || 1.5) * 0.72);

            if (s.y > clearHeight || s.isCinematicJump) {
              if (!obs.nearMissed) {
                obs.nearMissed = true;
                s.copsEvaded += 1;
                this._awardCashAndScore(400, 600 * s.combo);
              }
            } else {
              // Direct collision! Apply Non-Falling Gyroscopic Deflection Bounce
              obs.hit = true;
              this._handleObstacleCollision(obs);
              if (s.mode === 'BUSTED') return;
            }
          } else if (!obs.nearMissed && lateralDist <= halfWid + 2.1) {
            // High-speed Near-Miss in adjacent lane!
            obs.nearMissed = true;
            this._triggerNearMiss(obs);
          }
        }

        // Count evaded police once obstacle passes behind Rafa
        if (!obs.passed && obs.z > 4.5) {
          obs.passed = true;
          if (obs.type === 'police_car' || obs.type === 'swat_van' || obs.type === 'roadblock') {
            s.copsEvaded += 1;
          }
        }

        if (obs.z > 28) {
          s.obstacles.splice(i, 1);
        }
      }
    }

    /**
     * Handles obstacle collisions with Gyroscopic Never-Fall Stabilization ("sem que o boneco possa cair"):
     * Rafa NEVER falls off or ragdolls — instead, collisions apply a realistic lateral deflection bounce (`vx` impulse
     * away from the obstacle), speed drop, sparks/camera shake, and armor-buffered damage while keeping Rafa seated!
     */
    _handleObstacleCollision(obs) {
      const s = this.state;

      // Guarantee Rafa stays seated on the Chopper
      s.neverFall = true;
      s.riderSeated = true;
      s.isFallen = false;

      // If EDTECH Nitro Boost is active, Rafa smashes straight through the police blockade!
      if (s.isBoosting) {
        obs.active = false;
        s.roadblocksBroken += 1;
        s.copsEvaded += 1;
        s.heat += 12;
        s.cameraShake = Math.max(s.cameraShake, 0.6);
        this._bumpCombo(1);
        this._awardCashAndScore(2000, 2000 * s.combo);

        window.GT6Audio?.playSfx?.('roadblock');
        window.GT6Renderer?.triggerEffect?.('explosion', { x: obs.x, y: 0.8, z: obs.z });
        window.GT6Renderer?.triggerEffect?.('sparks', { x: s.x, y: 0.4, z: 0 });
        window.GT6UI?.showCinematicToast?.('IMPACTO TURBO EDTECH! +$2.000', 'VIATURA DESTRUÍDA NO IMPACTO');
        return;
      }

      if (s.invulnerableTimer > 0) {
        return;
      }

      const damageMap = {
        spike_strip: 14,
        traffic_car: 18,
        police_car:  22,
        roadblock:   24,
        swat_van:    28
      };
      const rawDamage = damageMap[obs.type] || 20;

      if (obs.type === 'roadblock' || obs.isBlockadePart) {
        s.roadblocksBroken += 1;
      }

      // Compute realistic physics deflection impulse away from the obstacle (toward open road)
      let deflectDir = s.x >= obs.x ? 1 : -1;
      if (Math.abs(s.x - obs.x) < 0.25) {
        deflectDir = s.x > 0 ? -1 : 1;
      }
      if (s.x + deflectDir * 1.8 > ROAD_SOFT_BOUND) deflectDir = -1;
      if (s.x + deflectDir * 1.8 < -ROAD_SOFT_BOUND) deflectDir = 1;

      s.vx = deflectDir * 8.5;
      s.x = Math.max(-ROAD_SOFT_BOUND, Math.min(ROAD_SOFT_BOUND, s.x + deflectDir * 0.65));
      s.targetX = Math.max(-ROAD_SOFT_BOUND, Math.min(ROAD_SOFT_BOUND, s.x + deflectDir * 1.1));
      s.roll = Math.max(-0.42, Math.min(0.42, -deflectDir * 0.28)); // Gyroscopic counter-roll stabilization
      s.laneIndex = this._computeLaneIndexFromX(s.x);
      s.lane = s.laneIndex;

      obs.active = (obs.type === 'swat_van'); // SWAT van stays intact; cars/barriers shatter
      s.speed = Math.max(95, s.speed * 0.76);
      s.combo = 1;
      s.comboTimer = 0;
      s.invulnerableTimer = 1.35;
      s.cameraShake = 0.75;

      window.GT6Audio?.playSfx?.('crash');
      window.GT6Renderer?.triggerEffect?.('explosion', { x: obs.x, y: 0.7, z: obs.z });
      window.GT6Renderer?.triggerEffect?.('sparks', { x: s.x, y: 0.35, z: 0 });

      this._applyDamage(rawDamage, obs.type);
    }

    _applyDamage(amount, source) {
      const s = this.state;
      // PT-13 Armor Vest absorbs 70% of incoming damage while armor > 0
      if (s.armor > 0) {
        const armorAbsorb = Math.min(s.armor, amount * 0.70);
        s.armor = Math.max(0, s.armor - armorAbsorb);
        const remaining = amount - armorAbsorb;
        s.health = Math.max(0, s.health - remaining);
      } else {
        s.health = Math.max(0, s.health - amount);
      }

      if (s.health <= 0) {
        s.health = 0;
        this._triggerBusted(source);
      }
    }

    _triggerNearMiss(obs) {
      const s = this.state;
      s.nearMisses += 1;
      s.copsEvaded += 1;
      s.nitro = Math.min(100, s.nitro + 7);
      s.heat += 4;
      this._bumpCombo(1);

      const bonus = 350 * s.combo;
      this._awardCashAndScore(350, bonus);

      window.GT6Renderer?.triggerEffect?.('sparks', { x: s.x, y: 0.3, z: 0 });
    }

    // =========================================================================
    // WANTED STARS ESCALATION, COPOM RADIO & BUSTED / GAME OVER
    // =========================================================================

    _checkWantedEscalation() {
      const s = this.state;
      let targetStars = s.wantedStars;
      let triggeredStep = null;

      for (let i = 0; i < STAR_THRESHOLDS.length; i++) {
        const step = STAR_THRESHOLDS[i];
        if (s.distance >= step.dist || s.heat >= step.heat) {
          if (step.stars > targetStars) {
            targetStars = step.stars;
            triggeredStep = step;
          }
        }
      }

      if (targetStars > s.wantedStars) {
        s.wantedStars = Math.min(6, targetStars);
        s.stars = s.wantedStars;

        window.GT6Audio?.playSfx?.('star');
        window.GT6Audio?.setWantedLevel?.(s.wantedStars);

        if (triggeredStep) {
          const msg = RADIO_MESSAGES[triggeredStep.radioKey] || RADIO_MESSAGES.speed;
          this._dispatchPoliceRadio(triggeredStep.radioKey, msg);
        }

        if (s.wantedStars >= 5) {
          s.heliActive = true;
          window.GT6UI?.triggerHeliCamHighlight?.();
          window.GT6UI?.showCinematicToast?.(
            `★ ${s.wantedStars} ESTRELAS • APOIO AÉREO!`,
            'HELICÓPTERO POLICIAL NA COLA DA CHOPPER EDTECH!'
          );
        } else {
          window.GT6UI?.showCinematicToast?.(
            `NÍVEL DE PROCURADO: ${'★'.repeat(s.wantedStars)}`,
            'REFORÇOS POLICIAIS ENVIADOS PARA A AVENIDA'
          );
        }
      }
    }

    _dispatchPoliceRadio(key, fallbackText) {
      this._radioCooldown = 5.5;
      let subtitle = fallbackText || RADIO_MESSAGES[key] || RADIO_MESSAGES.start;

      if (window.GT6Audio && typeof window.GT6Audio.playPoliceDispatch === 'function') {
        try {
          const returned = window.GT6Audio.playPoliceDispatch(key);
          if (typeof returned === 'string' && returned.trim()) {
            subtitle = returned;
          }
        } catch (err) {
          console.warn('[GT6Game] playPoliceDispatch warning:', err);
        }
      }

      if (window.GT6UI && typeof window.GT6UI.showRadioMessage === 'function') {
        try {
          window.GT6UI.showRadioMessage(subtitle, 'COPOM');
        } catch (err) {
          console.warn('[GT6Game] showRadioMessage warning:', err);
        }
      }
    }

    _awardCashAndScore(cashDelta, scoreDelta) {
      const s = this.state;
      s.runCashEarned += cashDelta;
      s.cash = BASE_BOUNTY_CASH + s.runCashEarned;
      s.totalBountyCash = Math.floor(s.cash);
      s.runScore += scoreDelta;
      s.score = Math.floor(s.runScore);
    }

    _bumpCombo(amount = 1) {
      const s = this.state;
      s.combo = Math.min(10, s.combo + amount);
      if (s.combo > s.maxCombo) s.maxCombo = s.combo;
      s.comboTimer = 4.8;
    }

    /**
     * Handles `health <= 0` ("BUSTED / CERCO FECHADO"):
     * Enters `'BUSTED'` state (Rafa still never falls off the bike — police surround him),
     * submits score to `window.GT6Backend`, and triggers `window.GT6UI.showGameOver`.
     */
    _triggerBusted(source) {
      const s = this.state;
      if (s.mode === 'BUSTED') return;

      s.mode = 'BUSTED';
      s.isBoosting = false;
      s.isDrifting = false;
      s.isCinematicJump = false;
      s.timeScale = 1.0;
      s.neverFall = true;
      s.riderSeated = true;
      s.isFallen = false;
      this._syncAliases();

      if (window.GT6Audio) {
        try {
          window.GT6Audio.stopEngine?.();
          window.GT6Audio.playSfx?.('busted');
        } catch (err) {
          console.warn('[GT6Game] Audio busted warning:', err);
        }
      }

      const summary = {
        player_name: s.playerName || 'RAFA PT-13',
        playerName: s.playerName || 'RAFA PT-13',
        bounty_cash: Math.floor(s.cash),
        bountyCash: Math.floor(s.cash),
        totalBountyCash: Math.floor(s.cash),
        cash: Math.floor(s.cash),
        run_cash: Math.floor(s.runCashEarned),
        runCashEarned: Math.floor(s.runCashEarned),
        score: Math.floor(s.runScore),
        runScore: Math.floor(s.runScore),
        distance_m: Math.floor(s.distance),
        distanceM: Math.floor(s.distance),
        distance: Math.floor(s.distance),
        max_speed_kmh: Math.round(s.maxSpeed),
        maxSpeedKmh: Math.round(s.maxSpeed),
        maxSpeed: Math.round(s.maxSpeed),
        wanted_stars: s.wantedStars,
        wantedStars: s.wantedStars,
        stars: s.wantedStars,
        roadblocks_broken: s.roadblocksBroken,
        roadblocksBroken: s.roadblocksBroken,
        cops_evaded: s.copsEvaded,
        copsEvaded: s.copsEvaded,
        ramps_jumped: s.rampsJumped,
        rampsJumped: s.rampsJumped,
        near_misses: s.nearMisses,
        nearMisses: s.nearMisses,
        max_combo: s.maxCombo,
        maxCombo: s.maxCombo,
        vehicle_tag: s.vehicleTag || 'EDTECH PT-13 CHOPPER',
        vehicleTag: s.vehicleTag || 'EDTECH PT-13 CHOPPER',
        duration_s: Math.round(s.elapsedTime),
        cause: source || 'police_blockade'
      };

      // Update HUD one final time for 0 health
      window.GT6UI?.updateHUD?.(s);
      window.GT6UI?.showGameOver?.(summary);

      // Submit score & telemetry to Backend (Supabase / Vercel API / Local hybrid)
      if (window.GT6Backend) {
        try {
          const submitPromise = window.GT6Backend.submitScore?.(summary);
          if (submitPromise && typeof submitPromise.then === 'function') {
            submitPromise
              .then(() => window.GT6Backend.fetchLeaderboard?.(10))
              .then((entries) => {
                if (entries && window.GT6UI?.renderLeaderboard) {
                  window.GT6UI.renderLeaderboard(entries, window.GT6Backend.getStatus?.());
                }
              })
              .catch((err) => console.warn('[GT6Game] Leaderboard refresh warning:', err));
          }
          window.GT6Backend.logTelemetry?.('busted', summary);
        } catch (err) {
          console.warn('[GT6Game] Backend submitScore warning:', err);
        }
      }
    }
  }

  // Expose both the singleton instance on `window.GT6Game` and the class on `window.GT6GameEngine`
  const gameInstance = new GT6GameEngine();
  window.GT6GameEngine = GT6GameEngine;
  window.GT6Game = gameInstance;
})();
