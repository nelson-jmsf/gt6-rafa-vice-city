/**
 * GT6 RAFA: FUGA DE VICE CITY (EDTECH PT-13 EDITION)
 * GTA 6 HUD, Circular Radar Minimap, Speedometer, Heli-Cam PiP & Cutscene Controller
 * Attached to window.GT6UI
 */
(function (window) {
  'use strict';

  const CAMERA_MODES = ['chase', 'front_cinematic', 'low_action', 'helicam_top', 'cinematic_jump'];
  const GFX_PRESETS = ['HIGH', 'ULTRA', 'PERFORMANCE'];
  const GFX_META = {
    HIGH: {
      buttonHtml: '⚡ <span id="lbl-gfx-quality" class="sr-only">⚡ 60FPS HD</span>',
      label: '⚡ 60FPS HD',
      toastTitle: '⚡ 60FPS HD ATIVADO',
      toastSub: 'RENDERIZAÇÃO DIRETA • REFLEXOS NO ASFALTO • FLUIDEZ MÁXIMA'
    },
    ULTRA: {
      buttonHtml: '✨ <span id="lbl-gfx-quality" class="sr-only">✨ ULTRA BLOOM</span>',
      label: '✨ ULTRA BLOOM',
      toastTitle: '✨ ULTRA BLOOM ATIVADO',
      toastSub: 'HDR NEON BLOOM • CORES CINEMATOGRÁFICAS VICE CITY'
    },
    PERFORMANCE: {
      buttonHtml: '🚀 <span id="lbl-gfx-quality" class="sr-only">🚀 ULTRA LEVE</span>',
      label: '🚀 ULTRA LEVE',
      toastTitle: '🚀 ULTRA LEVE ATIVADO',
      toastSub: 'MODO DESEMPENHO MÁXIMO • ZERO SOMBRAS E ZERO BLUR'
    }
  };
  const STREET_NAMES = [
    'AV. OCEAN DRIVE',
    'BOULEVARD VICE BEACH',
    'PONTE STARFISH ISLAND',
    'VIA EXPRESSA EDTECH PT-13',
    'AVENIDA WASHINGTON',
    'DISTRITO NEON DOWNTOWN'
  ];

  const GT6UI = {
    _initialized: false,
    _cameraModeIdx: 0,
    _gfxQualityIdx: 0,
    _gfxQuality: 'HIGH',
    _lastCashValue: 1956791,
    _cashBumpTimeout: null,
    _cashDeltaTimeout: null,
    _toastTimeout: null,
    _radioTimeout: null,
    _helicamHighlightTimeout: null,
    _helicamVisible: false,
    _elements: {},
    _starNodes: [],
    _speedoCtx: null,
    _radarCtx: null,
    _speedoBackdropCanvas: null,
    _speedoBackdropW: 0,
    _speedoBackdropH: 0,
    _radarBgGrad: null,
    _radarBgW: 0,
    _radarBgH: 0,

    // Cached HUD values to eliminate DOM layout thrashing & 60fps Canvas2D redraws
    _lastCanvasDrawTime: -50,
    _lastCashStr: null,
    _lastSpeedStr: null,
    _lastDistStr: null,
    _lastStars: -1,
    _lastHealthPct: null,
    _lastArmorPct: null,
    _lastNitroPct: null,
    _lastHealthVal: -1,
    _lastArmorVal: -1,
    _lastNitroVal: -1,
    _lastPlayerName: null,
    _lastScoreVal: -1,
    _lastRoadblocks: -1,
    _lastComboStr: null,
    _lastComboHot: null,
    _lastAmmoMain: -1,
    _lastAmmoClip: -1,
    _lastGearStr: null,
    _lastHelicamLockStr: null,
    _lastLocationIdx: -1,
    _lastFxDamage: null,
    _lastFxJump: null,
    _lastFxNitro: null,
    _lastFxPursuit: null,

    /**
     * Initializes DOM bindings, canvas contexts, video players, and interactive buttons.
     */
    init() {
      if (this._initialized) {
        return this;
      }
      this._initialized = true;

      this._cacheElements();
      this._bindEvents();
      this._initHeliCamVideo();
      this.setGraphicsQuality('HIGH', true, true);

      // Render default initial state onto HUD, Speedometer (188 km/h showcase) & Radar
      this.drawSpeedometer(188, false, 100);
      this.drawRadar({
        x: -1.5,
        lanes: [-4.5, -1.5, 1.5, 4.5],
        distance: 0,
        wantedStars: 6,
        health: 100,
        armor: 100,
        heliActive: true,
        heliSearchlightX: 0,
        heliSearchlightZ: -12,
        obstacles: [
          { x: -4.5, z: -48, type: 'roadblock', active: true },
          { x: 1.5, z: -48, type: 'police_car', active: true },
          { x: 4.5, z: -48, type: 'roadblock', active: true }
        ],
        ramps: [
          { x: -1.5, z: -42, active: true }
        ],
        pickups: [
          { x: -1.5, z: -22, type: 'cash', active: true },
          { x: -1.5, z: -28, type: 'cash', active: true },
          { x: 1.5, z: -65, type: 'nitro', active: true }
        ],
        chasers: [
          { x: -2.2, z: 10 },
          { x: 1.8, z: 13 },
          { x: 0.0, z: 16 }
        ]
      });

      // Pre-fill saved player callsign or Supabase config if available
      try {
        const savedName = window.localStorage.getItem('gt6_rafa_player_name_v1');
        if (savedName && this._elements.playerNameInput) {
          this._elements.playerNameInput.value = savedName;
        }
        const savedCfg = window.localStorage.getItem('gt6_rafa_supabase_config_v1');
        if (savedCfg) {
          const parsed = JSON.parse(savedCfg);
          if (parsed && parsed.url && this._elements.inputSupabaseUrl) {
            this._elements.inputSupabaseUrl.value = parsed.url;
          }
          if (parsed && parsed.anonKey && this._elements.inputSupabaseKey) {
            this._elements.inputSupabaseKey.value = parsed.anonKey;
          }
        }
      } catch (_) {
        // Ignore storage read restrictions
      }

      return this;
    },

    _cacheElements() {
      const byId = (id) => document.getElementById(id);
      this._elements = {
        screenFx: byId('screen-fx-overlay'),
        playerName: byId('hud-player-name'),
        serverPill: byId('hud-server-pill'),
        serverDot: byId('hud-server-dot'),
        serverText: byId('hud-server-text'),
        distance: byId('hud-distance'),
        score: byId('hud-score'),
        roadblocks: byId('hud-roadblocks'),
        comboChip: byId('hud-combo-chip'),
        combo: byId('hud-combo'),

        // Top-Right GTA HUD
        wantedStarsRow: byId('hud-wanted-stars'),
        cashDisplay: byId('hud-cash'),
        cashDelta: byId('hud-cash-delta'),
        healthBar: byId('hud-health-bar'),
        healthVal: byId('hud-health-val'),
        armorBar: byId('hud-armor-bar'),
        armorVal: byId('hud-armor-val'),
        ammoMain: byId('hud-ammo-main'),
        ammoClip: byId('hud-ammo-clip'),
        weaponBox: byId('hud-weapon-box'),

        // COPOM Radio Banner
        radioBanner: byId('radio-banner'),
        radioSpeaker: byId('radio-speaker'),
        radioText: byId('radio-text'),
        btnReplayDispatch: byId('btn-replay-dispatch'),

        // Cinematic Toast
        toast: byId('cinematic-toast'),
        toastKicker: byId('toast-kicker'),
        toastTitle: byId('toast-title'),
        toastSubtitle: byId('toast-subtitle'),

        // Heli-Cam PiP
        helicamPip: byId('helicam-pip'),
        helicamVideo: byId('helicam-video'),
        helicamTargetTag: byId('helicam-target-tag'),
        helicamSpeedLock: byId('helicam-speed-lock'),
        btnHelicamSound: byId('btn-helicam-sound'),
        btnHelicamFullscreen: byId('btn-helicam-fullscreen'),

        // Radar & Speedometer
        radarOuterRing: byId('radar-outer-ring'),
        radarCanvas: byId('radar-canvas'),
        locationName: byId('hud-location-name'),
        speedoCanvas: byId('speedo-canvas'),
        gearTag: byId('hud-gear-tag'),
        speedVal: byId('hud-speed-val'),
        nitroBar: byId('hud-nitro-bar'),
        nitroVal: byId('hud-nitro-val'),

        // Toolbar Buttons
        btnOpenCutscene: byId('btn-open-cutscene'),
        btnToggleHelicam: byId('btn-toggle-helicam'),
        btnToggleCamera: byId('btn-toggle-camera'),
        btnGfxQuality: byId('btn-gfx-quality'),
        lblGfxQuality: byId('lbl-gfx-quality'),
        btnToggleMute: byId('btn-toggle-mute'),
        lblMuteState: byId('lbl-mute-state'),
        btnOpenConfig: byId('btn-open-config'),
        btnPauseGame: byId('btn-pause-game'),
        lblPauseState: byId('lbl-pause-state'),

        // On-Screen Action Controls
        btnCtrlLeft: byId('btn-ctrl-left'),
        btnCtrlRight: byId('btn-ctrl-right'),
        btnCtrlJump: byId('btn-ctrl-jump'),
        btnCtrlDrift: byId('btn-ctrl-drift'),
        btnCtrlNitro: byId('btn-ctrl-nitro'),
        btnCtrlEmp: byId('btn-ctrl-emp'),

        // Modals
        startMenuModal: byId('start-menu-modal'),
        playerNameInput: byId('player-name-input'),
        btnStartGame: byId('btn-start-game'),
        btnWatchTrailer: byId('btn-watch-trailer'),
        btnMenuSupabase: byId('btn-menu-supabase'),
        btnRefreshLeaderboard: byId('btn-refresh-leaderboard'),
        menuServerDot: byId('menu-server-dot'),
        menuServerStatusText: byId('menu-server-status-text'),
        menuLeaderboardList: byId('menu-leaderboard-list'),

        // Cutscene Modal
        cutsceneModal: byId('cutscene-modal'),
        cutsceneVideo: byId('cutscene-video'),
        btnCutscenePlay3D: byId('btn-cutscene-play-3d'),
        btnCloseCutscene: byId('btn-close-cutscene'),

        // Game Over Modal
        gameoverModal: byId('gameover-modal'),
        gameoverTitle: byId('gameover-title'),
        gameoverSubtitle: byId('gameover-subtitle'),
        goBountyCash: byId('go-bounty-cash'),
        goScore: byId('go-score'),
        goDistance: byId('go-distance'),
        goMaxSpeed: byId('go-max-speed'),
        goRoadblocks: byId('go-roadblocks'),
        goWantedStars: byId('go-wanted-stars'),
        gameoverLeaderboardList: byId('gameover-leaderboard-list'),
        btnRestartGame: byId('btn-restart-game'),
        btnGameoverVideo: byId('btn-gameover-video'),
        btnGameoverMenu: byId('btn-gameover-menu'),

        // Pause Modal (Minimalist Pause Menu)
        pauseModal: byId('pause-modal'),
        btnPauseResume: byId('btn-pause-resume'),
        btnPauseMute: byId('btn-pause-mute'),
        btnPauseRestart: byId('btn-pause-restart'),
        btnPauseMenu: byId('btn-pause-menu'),

        // Supabase Config Modal
        supabaseConfigModal: byId('supabase-config-modal'),
        inputSupabaseUrl: byId('input-supabase-url'),
        inputSupabaseKey: byId('input-supabase-key'),
        configStatusMsg: byId('config-status-msg'),
        btnCloseConfig: byId('btn-close-config'),
        btnSaveSupabase: byId('btn-save-supabase'),
        btnClearSupabase: byId('btn-clear-supabase')
      };

      this._starNodes = this._elements.wantedStarsRow
        ? Array.from(this._elements.wantedStarsRow.querySelectorAll('.wanted-star'))
        : [];
      this._speedoCtx = this._elements.speedoCanvas && typeof this._elements.speedoCanvas.getContext === 'function'
        ? this._elements.speedoCanvas.getContext('2d')
        : null;
      this._radarCtx = this._elements.radarCanvas && typeof this._elements.radarCanvas.getContext === 'function'
        ? this._elements.radarCanvas.getContext('2d')
        : null;
    },

    _bindEvents() {
      const el = this._elements;

      // Start Game from Main Menu
      if (el.btnStartGame) {
        el.btnStartGame.addEventListener('click', () => {
          this._startFromMenu();
        });
      }

      if (el.playerNameInput) {
        el.playerNameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this._startFromMenu();
          }
        });
      }

      // Open Cutscene / Trailer Modal
      const openCutsceneFn = () => this.openCutsceneModal();
      if (el.btnWatchTrailer) el.btnWatchTrailer.addEventListener('click', openCutsceneFn);
      if (el.btnOpenCutscene) el.btnOpenCutscene.addEventListener('click', openCutsceneFn);
      if (el.btnHelicamFullscreen) el.btnHelicamFullscreen.addEventListener('click', openCutsceneFn);
      if (el.btnGameoverVideo) el.btnGameoverVideo.addEventListener('click', openCutsceneFn);

      if (el.btnCloseCutscene) {
        el.btnCloseCutscene.addEventListener('click', () => this.closeCutsceneModal());
      }

      if (el.btnCutscenePlay3D) {
        el.btnCutscenePlay3D.addEventListener('click', () => {
          this.closeCutsceneModal();
          this._startFromMenu();
        });
      }

      // Heli-Cam PiP Controls (Hidden by default; user clicks to open/close)
      if (el.btnToggleHelicam) {
        el.btnToggleHelicam.addEventListener('click', () => {
          this._helicamVisible = !this._helicamVisible;
          if (this._helicamVisible) this._lastHelicamLockStr = null;
          el.helicamPip?.classList.toggle('hidden-pip', !this._helicamVisible);
          el.btnToggleHelicam.classList.toggle('active', this._helicamVisible);
          if (this._helicamVisible && el.helicamVideo) {
            el.helicamVideo.play().catch(() => {});
          } else if (!this._helicamVisible && el.helicamVideo) {
            el.helicamVideo.pause();
          }
        });
      }

      if (el.btnHelicamSound && el.helicamVideo) {
        el.btnHelicamSound.addEventListener('click', () => {
          el.helicamVideo.muted = !el.helicamVideo.muted;
          el.btnHelicamSound.textContent = el.helicamVideo.muted ? '🔇' : '🔊';
          if (!el.helicamVideo.muted) {
            el.helicamVideo.play().catch(() => {});
          }
        });
      }

      // Camera Mode Toggle
      if (el.btnToggleCamera) {
        el.btnToggleCamera.addEventListener('click', () => this.cycleCameraMode());
      }

      // 3D Graphics Quality Toggle
      if (el.btnGfxQuality) {
        el.btnGfxQuality.addEventListener('click', () => this.cycleGraphicsQuality());
      }

      // Audio Mute Toggle
      if (el.btnToggleMute) {
        el.btnToggleMute.addEventListener('click', () => this.toggleAudioMute());
      }

      // Pause Toggle & Pause Modal Actions
      if (el.btnPauseGame) {
        el.btnPauseGame.addEventListener('click', () => {
          if (!window.GT6Game) return;
          if (window.GT6Game.state?.mode === 'PAUSED') {
            window.GT6Game.resumeGame?.();
            this.hidePauseModal();
            if (el.lblPauseState) el.lblPauseState.textContent = 'PAUSA';
          } else if (window.GT6Game.state?.mode === 'PLAYING') {
            window.GT6Game.pauseGame?.();
            this.showPauseModal();
            if (el.lblPauseState) el.lblPauseState.textContent = 'RETOMAR';
          }
        });
      }

      if (el.btnPauseResume) {
        el.btnPauseResume.addEventListener('click', () => {
          this.hidePauseModal();
          window.GT6Game?.resumeGame?.();
        });
      }

      if (el.btnPauseMute) {
        el.btnPauseMute.addEventListener('click', () => {
          this.toggleAudioMute();
        });
      }

      if (el.btnPauseRestart) {
        el.btnPauseRestart.addEventListener('click', () => {
          this.hidePauseModal();
          this.hideGameOver();
          window.GT6Game?.restartGame?.();
        });
      }

      if (el.btnPauseMenu) {
        el.btnPauseMenu.addEventListener('click', () => {
          this.hidePauseModal();
          this.hideGameOver();
          window.GT6Game?.returnToMenu?.();
          if (el.startMenuModal) el.startMenuModal.classList.add('active');
          this.refreshLeaderboard();
        });
      }

      // Replay Police Dispatch
      if (el.btnReplayDispatch) {
        el.btnReplayDispatch.addEventListener('click', () => {
          const line = window.GT6Audio?.playPoliceDispatch?.();
          if (line) {
            this.showRadioMessage(line, 'COPOM');
          }
        });
      }

      // On-Screen Driving & Tactical Buttons
      const bindActionBtn = (btn, handler) => {
        if (!btn) return;
        const trigger = (e) => {
          e.preventDefault();
          handler();
        };
        btn.addEventListener('pointerdown', trigger);
      };

      bindActionBtn(el.btnCtrlLeft, () => window.GT6Game?.moveLeft?.());
      bindActionBtn(el.btnCtrlRight, () => window.GT6Game?.moveRight?.());
      bindActionBtn(el.btnCtrlJump, () => window.GT6Game?.jump?.());
      bindActionBtn(el.btnCtrlDrift, () => window.GT6Game?.drift?.(true));
      bindActionBtn(el.btnCtrlNitro, () => window.GT6Game?.triggerNitro?.());
      bindActionBtn(el.btnCtrlEmp, () => window.GT6Game?.fireWeapon?.());
      bindActionBtn(el.weaponBox, () => window.GT6Game?.fireWeapon?.());

      // Keyboard Shortcuts for Camera (C), 3D Graphics Quality (G) & Mute (M)
      window.addEventListener('keydown', (e) => {
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;

        if (e.code === 'KeyC') {
          this.cycleCameraMode();
        } else if (e.code === 'KeyG') {
          this.cycleGraphicsQuality();
        } else if (e.code === 'KeyM') {
          this.toggleAudioMute();
        }
      });

      // Game Over Modal Actions
      if (el.btnRestartGame) {
        el.btnRestartGame.addEventListener('click', () => {
          this.hideGameOver();
          window.GT6Game?.restartGame?.();
        });
      }

      if (el.btnGameoverMenu) {
        el.btnGameoverMenu.addEventListener('click', () => {
          this.hideGameOver();
          window.GT6Game?.returnToMenu?.();
          if (el.startMenuModal) el.startMenuModal.classList.add('active');
          this.refreshLeaderboard();
        });
      }

      // Leaderboard Refresh
      if (el.btnRefreshLeaderboard) {
        el.btnRefreshLeaderboard.addEventListener('click', () => this.refreshLeaderboard());
      }

      // Supabase Config Modal
      const openConfigFn = () => {
        if (el.supabaseConfigModal) el.supabaseConfigModal.classList.add('active');
      };
      if (el.btnOpenConfig) el.btnOpenConfig.addEventListener('click', openConfigFn);
      if (el.btnMenuSupabase) el.btnMenuSupabase.addEventListener('click', openConfigFn);
      if (el.serverPill) el.serverPill.addEventListener('click', openConfigFn);

      if (el.btnCloseConfig) {
        el.btnCloseConfig.addEventListener('click', () => {
          if (el.supabaseConfigModal) el.supabaseConfigModal.classList.remove('active');
        });
      }

      if (el.btnSaveSupabase) {
        el.btnSaveSupabase.addEventListener('click', async () => {
          const url = el.inputSupabaseUrl?.value?.trim() || '';
          const key = el.inputSupabaseKey?.value?.trim() || '';
          if (el.configStatusMsg) {
            el.configStatusMsg.textContent = 'Testando conexão com Supabase...';
          }
          if (window.GT6Backend && typeof window.GT6Backend.configureSupabase === 'function') {
            await window.GT6Backend.configureSupabase(url, key);
            const status = window.GT6Backend.getStatus?.() || {};
            const entries = await window.GT6Backend.fetchLeaderboard?.(10);
            this.renderLeaderboard(entries || [], status);
            if (el.configStatusMsg) {
              el.configStatusMsg.textContent = url
                ? `✔ Conectado ao Supabase Cloud (${status.mode || 'supabase-cloud'})!`
                : '✔ Modo Serverless / Híbrido ativo.';
            }
          }
        });
      }

      if (el.btnClearSupabase) {
        el.btnClearSupabase.addEventListener('click', async () => {
          if (el.inputSupabaseUrl) el.inputSupabaseUrl.value = '';
          if (el.inputSupabaseKey) el.inputSupabaseKey.value = '';
          if (window.GT6Backend && typeof window.GT6Backend.configureSupabase === 'function') {
            await window.GT6Backend.configureSupabase('', '');
            const status = window.GT6Backend.getStatus?.() || {};
            const entries = await window.GT6Backend.fetchLeaderboard?.(10);
            this.renderLeaderboard(entries || [], status);
          }
          if (el.configStatusMsg) {
            el.configStatusMsg.textContent = 'Configuração limpa. Usando API Serverless / Híbrido padrão.';
          }
        });
      }
    },

    _initHeliCamVideo() {
      const el = this._elements;
      if (el.helicamPip) {
        el.helicamPip.classList.toggle('hidden-pip', !this._helicamVisible);
      }
      if (el.btnToggleHelicam) {
        el.btnToggleHelicam.classList.toggle('active', this._helicamVisible);
      }
      const video = el.helicamVideo;
      if (!video) return;
      video.muted = true;
    },

    _startFromMenu() {
      const el = this._elements;
      const rawName = el.playerNameInput?.value?.trim() || 'RAFA PT-13';
      const playerName = rawName.toUpperCase();

      try {
        window.localStorage.setItem('gt6_rafa_player_name_v1', playerName);
      } catch (_) {}

      if (el.startMenuModal) {
        el.startMenuModal.classList.remove('active');
      }
      this.hideGameOver();

      if (this._helicamVisible && el.helicamVideo) {
        el.helicamVideo.play().catch(() => {});
      }

      if (window.GT6Game && typeof window.GT6Game.startGame === 'function') {
        window.GT6Game.startGame(playerName);
      }
    },

    cycleCameraMode() {
      this._cameraModeIdx = (this._cameraModeIdx + 1) % CAMERA_MODES.length;
      const mode = CAMERA_MODES[this._cameraModeIdx];
      window.GT6Renderer?.setCameraMode?.(mode);

      const labels = {
        chase: 'CÂMERA DE PERSEGUIÇÃO GTA',
        front_cinematic: 'CÂMERA FRONTAL CINEMATOGRÁFICA',
        low_action: 'CÂMERA BAIXA DE AÇÃO (ASFALTO)',
        helicam_top: 'VISÃO AÉREA DO HELICÓPTERO ÁGUIA 01',
        cinematic_jump: 'CÂMERA CINEMATOGRÁFICA DE RAMPA'
      };
      this.showCinematicToast('CÂMERA ALTERADA', labels[mode] || mode.toUpperCase());
    },

    cycleGraphicsQuality() {
      let nextPreset = null;
      if (window.GT6Renderer && typeof window.GT6Renderer.cycleQuality === 'function') {
        nextPreset = window.GT6Renderer.cycleQuality();
      }
      if (!nextPreset) {
        this._gfxQualityIdx = (this._gfxQualityIdx + 1) % GFX_PRESETS.length;
        nextPreset = GFX_PRESETS[this._gfxQualityIdx];
        window.GT6Renderer?.setQuality?.(nextPreset);
      }
      return this.setGraphicsQuality(nextPreset, false, true);
    },

    setGraphicsQuality(preset = 'HIGH', silent = false, skipRendererCall = false) {
      const raw = String(preset || 'HIGH').toUpperCase().trim();
      const normalized = (raw.includes('PERF') || raw.includes('LEVE') || raw === 'LOW' || raw === 'FAST' || raw === '3D 60FPS')
        ? 'PERFORMANCE'
        : ((raw.includes('ULTRA') || raw.includes('BLOOM')) ? 'ULTRA' : 'HIGH');

      this._gfxQuality = normalized;
      const idx = GFX_PRESETS.indexOf(normalized);
      if (idx !== -1) {
        this._gfxQualityIdx = idx;
      }

      if (!skipRendererCall) {
        window.GT6Renderer?.setQuality?.(normalized);
      }

      const meta = GFX_META[normalized] || GFX_META.HIGH;
      const btn = this._elements.btnGfxQuality || document.getElementById('btn-gfx-quality');
      if (btn) {
        btn.innerHTML = meta.buttonHtml;
        btn.dataset.quality = normalized;
        btn.title = `Qualidade Gráfica 3D [G]: ${meta.label}`;
        btn.setAttribute('aria-label', meta.label);
        btn.classList.toggle('active', normalized === 'ULTRA' || normalized === 'HIGH');
        this._elements.btnGfxQuality = btn;
        this._elements.lblGfxQuality = document.getElementById('lbl-gfx-quality');
      }

      if (!silent) {
        this.showCinematicToast(meta.toastTitle, meta.toastSub, 'ENGINE 3D // VICE CITY WebGL');
      }

      return normalized;
    },

    toggleAudioMute() {
      if (!window.GT6Audio) return;
      const muted = window.GT6Audio.toggleMute?.();
      if (this._elements.lblMuteState) {
        this._elements.lblMuteState.textContent = muted ? 'MUDO' : 'SOM ON';
      }
      if (this._elements.btnPauseMute) {
        this._elements.btnPauseMute.textContent = muted ? '🔇 MUDO' : '🔊 SOM';
      }
    },

    showPauseModal() {
      const el = this._elements;
      if (el.btnPauseMute && window.GT6Audio) {
        el.btnPauseMute.textContent = window.GT6Audio.isMuted ? '🔇 MUDO' : '🔊 SOM';
      }
      if (el.pauseModal) {
        el.pauseModal.classList.add('active');
      }
    },

    hidePauseModal() {
      if (this._elements.pauseModal) {
        this._elements.pauseModal.classList.remove('active');
      }
    },

    openCutsceneModal() {
      const el = this._elements;
      if (!el.cutsceneModal) return;

      if (window.GT6Game?.state?.mode === 'PLAYING') {
        window.GT6Game.pauseGame?.();
      }

      el.cutsceneModal.classList.add('active');
      if (el.cutsceneVideo) {
        el.cutsceneVideo.currentTime = 0;
        el.cutsceneVideo.muted = false;
        el.cutsceneVideo.play().catch(() => {
          el.cutsceneVideo.muted = true;
          el.cutsceneVideo.play().catch(() => {});
        });
      }
    },

    closeCutsceneModal() {
      const el = this._elements;
      if (!el.cutsceneModal) return;
      el.cutsceneModal.classList.remove('active');
      if (el.cutsceneVideo) {
        el.cutsceneVideo.pause();
      }
    },

    async refreshLeaderboard() {
      if (!window.GT6Backend) return;
      try {
        const entries = await window.GT6Backend.fetchLeaderboard?.(10);
        const status = window.GT6Backend.getStatus?.();
        this.renderLeaderboard(entries || [], status);
      } catch (err) {
        console.warn('[GT6UI] Erro ao atualizar leaderboard:', err);
      }
    },

    // =========================================================================
    // MAIN REALTIME HUD UPDATE
    // =========================================================================

    updateHUD(state) {
      if (!state) return;
      const el = this._elements;

      // 1. Player Name (only if optional legacy elements exist)
      if ((el.playerName || el.helicamTargetTag) && state.playerName && state.playerName !== this._lastPlayerName) {
        this._lastPlayerName = state.playerName;
        if (el.playerName) el.playerName.textContent = state.playerName;
        if (el.helicamTargetTag) el.helicamTargetTag.textContent = `ALVO: ${state.playerName}`;
      }

      // 2. GTA Cash Counter ($1956898 frameless green text matching the video)
      if (el.cashDisplay) {
        const cashVal = Math.floor(state.totalBountyCash ?? state.cash ?? 1956791);
        const cashStr = `$${cashVal}`;
        if (cashStr !== this._lastCashStr) {
          this._lastCashStr = cashStr;
          el.cashDisplay.textContent = cashStr;

          const diff = cashVal - this._lastCashValue;
          if (diff >= 100) {
            el.cashDisplay.classList.add('cash-bump');
            clearTimeout(this._cashBumpTimeout);
            this._cashBumpTimeout = setTimeout(() => {
              el.cashDisplay?.classList.remove('cash-bump');
            }, 180);

            if (diff >= 350 && el.cashDelta) {
              el.cashDelta.textContent = `+$${diff}`;
              el.cashDelta.classList.add('visible');
              clearTimeout(this._cashDeltaTimeout);
              this._cashDeltaTimeout = setTimeout(() => {
                el.cashDelta?.classList.remove('visible');
              }, 950);
            }
          }
          this._lastCashValue = cashVal;
        }
      }

      // 3. Optional Legacy Telemetry Strip (skipped completely when removed from DOM)
      let distMeters = 0;
      if (el.distance || el.locationName) {
        distMeters = Math.floor(state.distance ?? state.distanceM ?? 0);
        if (el.distance) {
          const distStr = `${distMeters} m`;
          if (distStr !== this._lastDistStr) {
            this._lastDistStr = distStr;
            el.distance.textContent = distStr;
          }
        }
      }

      if (el.score) {
        const scoreVal = Math.floor(state.score ?? state.runScore ?? 0);
        if (scoreVal !== this._lastScoreVal) {
          this._lastScoreVal = scoreVal;
          el.score.textContent = scoreVal.toLocaleString('pt-BR');
        }
      }

      if (el.roadblocks) {
        const rbVal = Math.floor(state.roadblocksBroken ?? 0);
        if (rbVal !== this._lastRoadblocks) {
          this._lastRoadblocks = rbVal;
          el.roadblocks.textContent = String(rbVal);
        }
      }

      if (el.combo || el.comboChip) {
        const comboVal = Number(state.combo || 1);
        if (el.combo) {
          const comboStr = `x${comboVal.toFixed(1)}`;
          if (comboStr !== this._lastComboStr) {
            this._lastComboStr = comboStr;
            el.combo.textContent = comboStr;
          }
        }
        const isComboHot = comboVal >= 2;
        if (el.comboChip && isComboHot !== this._lastComboHot) {
          this._lastComboHot = isComboHot;
          el.comboChip.classList.toggle('combo-hot', isComboHot);
        }
      }

      // 4. Wanted Stars (1..6)
      const stars = Math.max(1, Math.min(6, Math.round(state.wantedStars ?? state.stars ?? 1)));
      if (stars !== this._lastStars) {
        this._lastStars = stars;
        const starNodes = this._starNodes;
        for (let i = 0; i < starNodes.length; i++) {
          starNodes[i].classList.toggle('active', i < stars);
        }
        if (el.wantedStarsRow) {
          el.wantedStarsRow.classList.toggle('police-chase-alert', stars >= 4);
        }
        if (el.radarOuterRing) {
          el.radarOuterRing.classList.toggle('radar-pursuit-alert', stars >= 4);
        }
      }

      // 5. Health, Armor, Nitro & Weapon Ammo (558-30)
      const health = Math.max(0, Math.min(100, Math.round(state.health ?? 100)));
      const armor = Math.max(0, Math.min(100, Math.round(state.armor ?? 100)));
      const nitro = Math.max(0, Math.min(100, Math.round(state.nitro ?? 100)));

      if (el.healthBar) {
        const healthPct = `${health}%`;
        if (healthPct !== this._lastHealthPct) {
          this._lastHealthPct = healthPct;
          el.healthBar.style.width = healthPct;
        }
      }
      if (el.healthVal && health !== this._lastHealthVal) {
        this._lastHealthVal = health;
        el.healthVal.textContent = String(health);
      }

      if (el.armorBar) {
        const armorPct = `${armor}%`;
        if (armorPct !== this._lastArmorPct) {
          this._lastArmorPct = armorPct;
          el.armorBar.style.width = armorPct;
        }
      }
      if (el.armorVal && armor !== this._lastArmorVal) {
        this._lastArmorVal = armor;
        el.armorVal.textContent = String(armor);
      }

      if (el.nitroBar) {
        const nitroPct = `${nitro}%`;
        if (nitroPct !== this._lastNitroPct) {
          this._lastNitroPct = nitroPct;
          el.nitroBar.style.width = nitroPct;
        }
      }
      if (el.nitroVal && nitro !== this._lastNitroVal) {
        this._lastNitroVal = nitro;
        el.nitroVal.textContent = `${nitro}%`;
      }

      const ammoMain = state.ammo ?? 558;
      const ammoClip = state.ammoClip ?? 30;
      if (el.ammoMain && ammoMain !== this._lastAmmoMain) {
        this._lastAmmoMain = ammoMain;
        el.ammoMain.textContent = String(ammoMain);
      }
      if (el.ammoClip && ammoClip !== this._lastAmmoClip) {
        this._lastAmmoClip = ammoClip;
        el.ammoClip.textContent = String(ammoClip);
      }

      // 6. Speedometer Digital Readout & Gear
      const speedKmh = Math.round(state.speed ?? 188);
      if (el.speedVal) {
        const speedStr = String(speedKmh);
        if (speedStr !== this._lastSpeedStr) {
          this._lastSpeedStr = speedStr;
          el.speedVal.textContent = speedStr;
        }
      }
      if (el.gearTag) {
        const gearNum = Math.min(6, Math.max(1, Math.ceil(speedKmh / 42)));
        const gearStr = state.isBoosting
          ? 'OVERDRIVE // MAX'
          : `EDTECH // D${gearNum}`;
        if (gearStr !== this._lastGearStr) {
          this._lastGearStr = gearStr;
          el.gearTag.textContent = gearStr;
        }
      }

      // 7. Heli-Cam Telemetry Lock (only mutate if visible or value changed)
      if (el.helicamSpeedLock && this._helicamVisible) {
        const lockStr = `${speedKmh} KM/H • ${stars}★`;
        if (lockStr !== this._lastHelicamLockStr) {
          this._lastHelicamLockStr = lockStr;
          el.helicamSpeedLock.textContent = lockStr;
        }
      }

      // 8. Screen FX Vignette (only toggle classes when boolean states change)
      if (el.screenFx) {
        const fxDamage = (state.cameraShake || 0) > 0.65;
        const fxJump = Boolean(state.isCinematicJump);
        const fxNitro = Boolean(state.isBoosting || state.nitroActive);
        const fxPursuit = stars >= 5 && state.mode === 'PLAYING';

        if (fxDamage !== this._lastFxDamage) {
          this._lastFxDamage = fxDamage;
          el.screenFx.classList.toggle('damage-flash-fx', fxDamage);
        }
        if (fxJump !== this._lastFxJump) {
          this._lastFxJump = fxJump;
          el.screenFx.classList.toggle('cinematic-jump-fx', fxJump);
        }
        if (fxNitro !== this._lastFxNitro) {
          this._lastFxNitro = fxNitro;
          el.screenFx.classList.toggle('nitro-active-fx', fxNitro);
        }
        if (fxPursuit !== this._lastFxPursuit) {
          this._lastFxPursuit = fxPursuit;
          el.screenFx.classList.toggle('police-pursuit-fx', fxPursuit);
        }
      }

      // 9. GPS Radar Street (preserved for hidden DOM element)
      if (el.locationName) {
        const streetIdx = Math.floor(distMeters / 350) % STREET_NAMES.length;
        if (streetIdx !== this._lastLocationIdx) {
          this._lastLocationIdx = streetIdx;
          el.locationName.textContent = STREET_NAMES[streetIdx];
        }
      }

      // 10. Throttle Canvas2D Gauges (Speedometer + Circular GTA Radar) to ~20 Hz (50ms interval)
      const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
      if (now - this._lastCanvasDrawTime >= 50) {
        this._lastCanvasDrawTime = now;
        this.drawSpeedometer(speedKmh, Boolean(state.isBoosting), nitro);
        this.drawRadar(state);
      }
    },

    // =========================================================================
    // FRAMELESS CIRCULAR GTA SPEEDOMETER (0 .. 300 KM/H)
    // =========================================================================

    _paintSpeedoStaticBackdrop(ctx, w, h) {
      const cx = w / 2;
      const cy = h / 2;
      const outerRadius = Math.min(cx, cy) - 4;
      const radius = outerRadius - 8;
      const startAngle = (135 * Math.PI) / 180;
      const endAngle = (405 * Math.PI) / 180;
      const sweep = endAngle - startAngle;
      const redlineAngle = startAngle + sweep * (240 / 300);

      // 1. Dark Translucent Dial Face
      ctx.beginPath();
      ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10, 14, 22, 0.66)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.stroke();

      // 2. Blue Arc (0 .. 240 km/h) & Red Redline Arc (240 .. 300 km/h)
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, redlineAngle, false);
      ctx.strokeStyle = 'rgba(0, 184, 255, 0.25)';
      ctx.lineWidth = 5;
      ctx.lineCap = 'butt';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, radius, redlineAngle, endAngle, false);
      ctx.strokeStyle = 'rgba(255, 34, 56, 0.38)';
      ctx.lineWidth = 5;
      ctx.lineCap = 'butt';
      ctx.stroke();

      // 3. Tick Marks & Numbers
      ctx.font = '700 9px "Rajdhani", "Share Tech Mono", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let s = 0; s <= 300; s += 15) {
        const frac = s / 300;
        const ang = startAngle + sweep * frac;
        const isMajor = s % 30 === 0;
        const isRedline = s >= 240;
        const innerR = radius - (isMajor ? 12 : 7);
        const outerR = radius - 1;

        const x1 = cx + Math.cos(ang) * innerR;
        const y1 = cy + Math.sin(ang) * innerR;
        const x2 = cx + Math.cos(ang) * outerR;
        const y2 = cy + Math.sin(ang) * outerR;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = isRedline
          ? '#ff2a3c'
          : (isMajor ? '#40cfff' : 'rgba(130, 210, 255, 0.45)');
        ctx.lineWidth = isMajor ? 1.8 : 1;
        ctx.stroke();

        if (s % 60 === 0) {
          const tx = cx + Math.cos(ang) * (radius - 21);
          const ty = cy + Math.sin(ang) * (radius - 21);
          ctx.fillStyle = isRedline ? '#ff3b4e' : '#d8e8f8';
          ctx.fillText(String(s), tx, ty);
        }
      }

      // 4. Nitro track background
      const nitroStart = (55 * Math.PI) / 180;
      const nitroEnd = (125 * Math.PI) / 180;
      ctx.beginPath();
      ctx.arc(cx, cy, outerRadius - 3, nitroStart, nitroEnd, false);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.stroke();
    },

    drawSpeedometer(speedKmh = 188, isBoosting = false, nitroPct = 100) {
      const canvas = this._elements.speedoCanvas;
      if (!canvas) return;
      const ctx = this._speedoCtx || (typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null);
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const outerRadius = Math.min(cx, cy) - 4;
      const radius = outerRadius - 8;

      ctx.clearRect(0, 0, w, h);

      // Draw cached static dial + ticks + numbers (or fallback direct paint in headless mocks)
      let drewCached = false;
      if (typeof document !== 'undefined' && typeof ctx.drawImage === 'function') {
        if (!this._speedoBackdropCanvas || this._speedoBackdropW !== w || this._speedoBackdropH !== h) {
          const bg = document.createElement('canvas');
          bg.width = w;
          bg.height = h;
          const bctx = typeof bg.getContext === 'function' ? bg.getContext('2d') : null;
          if (bctx) {
            this._paintSpeedoStaticBackdrop(bctx, w, h);
            this._speedoBackdropCanvas = bg;
            this._speedoBackdropW = w;
            this._speedoBackdropH = h;
          }
        }
        if (this._speedoBackdropCanvas) {
          ctx.drawImage(this._speedoBackdropCanvas, 0, 0);
          drewCached = true;
        }
      }
      if (!drewCached) {
        this._paintSpeedoStaticBackdrop(ctx, w, h);
      }

      // Gauge angles: 135 deg to 405 deg -> 270 deg sweep
      const startAngle = (135 * Math.PI) / 180;
      const endAngle = (405 * Math.PI) / 180;
      const sweep = endAngle - startAngle;
      const clampedSpeed = Math.max(0, Math.min(300, speedKmh));
      const speedRatio = clampedSpeed / 300;
      const currentAngle = startAngle + sweep * speedRatio;
      const redlineAngle = startAngle + sweep * (240 / 300);

      // Active Blue / Red Progress Arc up to current speed
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, Math.min(currentAngle, redlineAngle), false);
      ctx.strokeStyle = '#18c4ff';
      ctx.lineWidth = 5;
      ctx.lineCap = 'butt';
      ctx.stroke();

      if (currentAngle > redlineAngle) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, redlineAngle, currentAngle, false);
        ctx.strokeStyle = '#ff2238';
        ctx.lineWidth = 5;
        ctx.lineCap = 'butt';
        ctx.stroke();
      }

      // Subtle Thin Nitro Arc Integrated into the Bottom Rim
      const nitroStart = (55 * Math.PI) / 180;
      const nitroEnd = (125 * Math.PI) / 180;
      const nitroSpan = nitroEnd - nitroStart;
      const nitroFillEnd = nitroStart + nitroSpan * (Math.max(0, Math.min(100, nitroPct)) / 100);

      ctx.beginPath();
      ctx.arc(cx, cy, outerRadius - 3, nitroStart, nitroFillEnd, false);
      ctx.strokeStyle = isBoosting ? '#ffd740' : '#00d8ff';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Crisp Red Speedometer Needle (lightweight soft halo instead of expensive shadowBlur)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(currentAngle);

      ctx.beginPath();
      ctx.moveTo(-11, -3.5);
      ctx.lineTo(radius - 7, 0);
      ctx.lineTo(-11, 3.5);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 34, 56, 0.28)';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-11, -2.2);
      ctx.lineTo(radius - 8, 0);
      ctx.lineTo(-11, 2.2);
      ctx.closePath();
      ctx.fillStyle = '#ff2238';
      ctx.fill();

      // Center Needle Hub
      ctx.beginPath();
      ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = '#181e2c';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.stroke();
      ctx.restore();
    },

    // =========================================================================
    // CLEAN CIRCULAR GTA RADAR MINIMAP CANVAS (WITH CURVING YELLOW ROUTE LINE)
    // =========================================================================

    drawRadar(state) {
      const canvas = this._elements.radarCanvas;
      if (!canvas) return;
      const ctx = this._radarCtx || (typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null);
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(cx, cy) - 3;
      const playerY = cy + 24;
      const nowMs = typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

      // Dynamic road curvature (-1.0 left to +1.0 right)
      const rawCurve = Number(state.roadCurve ?? state.roadCurvature ?? 0);
      const roadCurve = Math.max(-1.25, Math.min(1.25, rawCurve));
      const curveShiftAtY = (y) => {
        const ahead = (playerY - y) / playerY;
        if (ahead <= 0) {
          return roadCurve * ahead * 8;
        }
        return roadCurve * ahead * ahead * 36;
      };

      ctx.clearRect(0, 0, w, h);

      ctx.save();
      // Clip to circular radar interior
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 3, 0, Math.PI * 2);
      ctx.clip();

      // 1. Dark Grey-Navy GTA Street Map Background (cached gradient)
      if (!this._radarBgGrad || this._radarBgW !== w || this._radarBgH !== h) {
        const bgGrad = ctx.createRadialGradient(cx, cy, 8, cx, cy, radius);
        bgGrad.addColorStop(0, '#1c2432');
        bgGrad.addColorStop(1, '#111620');
        this._radarBgGrad = bgGrad;
        this._radarBgW = w;
        this._radarBgH = h;
      }
      ctx.fillStyle = this._radarBgGrad;
      ctx.fillRect(0, 0, w, h);

      // 2. City Blocks & Cross-Streets
      const dist = Number(state.distance || 0);
      const scrollOffset = (dist * 2.0) % 34;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 5;

      for (let y = -34 + scrollOffset; y < h + 34; y += 34) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // 3. Curving Highway Corridor
      const roadHalfWidth = 30;
      ctx.fillStyle = '#2a3344';
      ctx.beginPath();
      const steps = 16;
      for (let i = 0; i <= steps; i++) {
        const y = (i / steps) * h;
        const xLeft = cx - roadHalfWidth + curveShiftAtY(y);
        if (i === 0) ctx.moveTo(xLeft, y);
        else ctx.lineTo(xLeft, y);
      }
      for (let i = steps; i >= 0; i--) {
        const y = (i / steps) * h;
        const xRight = cx + roadHalfWidth + curveShiftAtY(y);
        ctx.lineTo(xRight, y);
      }
      ctx.closePath();
      ctx.fill();

      // Subtle Highway Edge Borders
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Helper to map 3D world coordinates (x, z) onto the curving radar
      const mapZ = (worldZ) => playerY + Number(worldZ || 0) * 1.05;
      const mapX = (worldX, radarY = playerY) =>
        cx + (Number(worldX || 0) / 6.0) * roadHalfWidth + curveShiftAtY(radarY);

      const playerRadarX = mapX(state.x ?? -1.5, playerY);

      // 4. Yellow/Orange GTA GPS Route Line Ahead (Curving with state.roadCurve!)
      ctx.save();
      ctx.strokeStyle = '#ffb300';
      ctx.lineWidth = 3.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i <= 14; i++) {
        const frac = i / 14;
        const y = playerY * (1 - frac);
        const rx = playerRadarX + curveShiftAtY(y);
        if (i === 0) ctx.moveTo(rx, y);
        else ctx.lineTo(rx, y);
      }
      ctx.stroke();
      ctx.restore();

      // 5. Oncoming Jump Ramps (Gold Chevrons)
      if (Array.isArray(state.ramps)) {
        for (let i = 0; i < state.ramps.length; i++) {
          const ramp = state.ramps[i];
          if (!ramp || !ramp.active) continue;
          const ry = mapZ(ramp.z);
          if (ry < -10 || ry > h + 10) continue;
          const rx = mapX(ramp.x, ry);

          ctx.fillStyle = '#ffd740';
          ctx.beginPath();
          ctx.moveTo(rx, ry - 5);
          ctx.lineTo(rx + 5, ry + 3.5);
          ctx.lineTo(rx - 5, ry + 3.5);
          ctx.closePath();
          ctx.fill();
        }
      }

      // 6. Pickups
      if (Array.isArray(state.pickups)) {
        for (let i = 0; i < state.pickups.length; i++) {
          const p = state.pickups[i];
          if (!p || !p.active) continue;
          const py = mapZ(p.z);
          if (py < -8 || py > h + 8) continue;
          const px = mapX(p.x, py);

          ctx.beginPath();
          ctx.arc(px, py, 2.6, 0, Math.PI * 2);
          ctx.fillStyle = p.type === 'cash' ? '#5cb85c' : '#29b6f6';
          ctx.fill();
        }
      }

      // 7. Oncoming Obstacles & Police Blockades
      const flashBlue = Math.floor(nowMs / 160) % 2 === 0;
      if (Array.isArray(state.obstacles)) {
        for (let i = 0; i < state.obstacles.length; i++) {
          const obs = state.obstacles[i];
          if (!obs || !obs.active) continue;
          const oy = mapZ(obs.z);
          if (oy < -12 || oy > h + 12) continue;
          const ox = mapX(obs.x, oy);

          const isPolice = obs.type === 'police_car' || obs.type === 'roadblock' || obs.type === 'swat_van';
          if (isPolice) {
            ctx.beginPath();
            ctx.arc(ox, oy, 4.2, 0, Math.PI * 2);
            ctx.fillStyle = flashBlue ? '#2979ff' : '#ff1744';
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
          } else {
            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(ox - 2.8, oy - 2.8, 5.6, 5.6);
          }
        }
      }

      // 8. Chasing Police Cruisers Behind Rafa (Flashing Red/Blue Blips)
      if (Array.isArray(state.chasers)) {
        const chaserStep = Math.floor(nowMs / 140);
        for (let i = 0; i < state.chasers.length; i++) {
          const c = state.chasers[i];
          if (!c) continue;
          const chY = mapZ(c.z ?? (10 + i * 3));
          const chX = mapX(c.x, chY);
          const blipBlue = (chaserStep + i) % 2 === 0;

          ctx.beginPath();
          ctx.arc(chX, Math.min(h - 10, chY), 4.4, 0, Math.PI * 2);
          ctx.fillStyle = blipBlue ? '#ff1744' : '#2979ff';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // 9. Rafa Center White Player Arrow
      ctx.save();
      ctx.translate(playerRadarX, playerY);
      ctx.rotate(Number(state.roll || 0) * -0.35);

      ctx.beginPath();
      ctx.moveTo(0, -7.5);
      ctx.lineTo(5.8, 5.8);
      ctx.lineTo(0, 2.8);
      ctx.lineTo(-5.8, 5.8);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
      ctx.restore();

      ctx.restore(); // End circular clip

      // 10. Bottom Curved Green (Health) & White (Armor) Rim Arcs (Matches Video Radar Bottom)
      const healthRatio = Math.max(0, Math.min(1, (state.health ?? 100) / 100));
      const armorRatio = Math.max(0, Math.min(1, (state.armor ?? 100) / 100));

      // Dark bottom track
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 1.5, Math.PI * 0.14, Math.PI * 0.86, false);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Left bottom arc: Green Health
      if (healthRatio > 0) {
        ctx.beginPath();
        ctx.arc(
          cx,
          cy,
          radius - 1.5,
          Math.PI * 0.51,
          Math.PI * (0.51 + 0.34 * healthRatio),
          false
        );
        ctx.strokeStyle = '#5cb85c';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'butt';
        ctx.stroke();
      }

      // Right bottom arc: White Armor
      if (armorRatio > 0) {
        ctx.beginPath();
        ctx.arc(
          cx,
          cy,
          radius - 1.5,
          Math.PI * 0.49,
          Math.PI * (0.49 - 0.34 * armorRatio),
          true
        );
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'butt';
        ctx.stroke();
      }
    },

    // =========================================================================
    // MINIMALIST GTA COPOM RADIO SUBTITLES (3.2s FADE), TOASTS & HELI-CAM
    // =========================================================================

    showRadioMessage(text, speaker = 'COPOM') {
      const el = this._elements;
      if (!text) return;

      const cleanSpeaker = String(speaker || 'COPOM').replace(/^📻\s*/, '').split('//')[0].trim() || 'COPOM';
      const cleanedText = String(text).replace(/^["']|["']$/g, '').trim();

      if (el.radioSpeaker) {
        el.radioSpeaker.textContent = cleanSpeaker;
      }

      if (el.radioText) {
        el.radioText.textContent = `${cleanSpeaker}: ${cleanedText}`;
      }

      if (el.radioBanner) {
        el.radioBanner.classList.add('radio-active');
        clearTimeout(this._radioTimeout);
        this._radioTimeout = setTimeout(() => {
          el.radioBanner?.classList.remove('radio-active');
        }, 3200);
      }
    },

    showCinematicToast(title, subtitle = '', kicker = 'EDTECH PT-13') {
      const el = this._elements;
      if (!el.toast || !title) return;

      if (el.toastKicker) el.toastKicker.textContent = kicker;
      if (el.toastTitle) el.toastTitle.textContent = title;
      if (el.toastSubtitle) el.toastSubtitle.textContent = subtitle || '';

      el.toast.classList.add('visible');
      clearTimeout(this._toastTimeout);
      this._toastTimeout = setTimeout(() => {
        el.toast?.classList.remove('visible');
      }, 2100);
    },

    /**
     * Highlights the Heli-Cam PiP feed ONLY if the user explicitly opened Heli-Cam,
     * so it NEVER pops up uninvited to block the right side of the 3D screen.
     */
    triggerHeliCamHighlight() {
      const el = this._elements;
      if (!el.helicamPip || !this._helicamVisible) return;

      el.helicamPip.classList.add('helicam-highlight');

      if (el.helicamVideo) {
        try {
          if (el.helicamVideo.paused) {
            el.helicamVideo.play().catch(() => {});
          }
          if (el.helicamVideo.readyState >= 2 && el.helicamVideo.duration > 8) {
            el.helicamVideo.currentTime = 6.8;
          }
        } catch (_) {}
      }

      clearTimeout(this._helicamHighlightTimeout);
      this._helicamHighlightTimeout = setTimeout(() => {
        el.helicamPip?.classList.remove('helicam-highlight');
      }, 3500);
    },

    // =========================================================================
    // LEADERBOARD & SUPABASE STATUS RENDERER
    // =========================================================================

    renderLeaderboard(entries = [], serverStatus = null) {
      const el = this._elements;

      // Update Server Connection Pills
      if (serverStatus) {
        const isCloud = serverStatus.mode === 'supabase-cloud';
        const label = isCloud
          ? 'Cloud Realtime'
          : (serverStatus.mode === 'vercel-api' ? 'Vercel API' : 'Online');

        if (el.serverText) el.serverText.textContent = label;
        if (el.serverDot) el.serverDot.classList.toggle('cloud', isCloud);
        if (el.menuServerDot) el.menuServerDot.classList.toggle('cloud', isCloud);
        if (el.menuServerStatusText) {
          el.menuServerStatusText.textContent = label;
        }
      }

      const safeEntries = Array.isArray(entries) && entries.length > 0
        ? entries
        : [
            {
              player_name: 'RAFA PT-13 [OFICIAL]',
              bounty_cash: 1956898,
              score: 107000,
              distance_m: 4820,
              max_speed_kmh: 188,
              wanted_stars: 6,
              roadblocks_broken: 14
            }
          ];

      const buildRowsHtml = (list) => list
        .map((row, idx) => {
          const rank = idx + 1;
          const name = this._escapeHtml(row.player_name || row.playerName || 'RAFA PT-13');
          const bounty = Number(row.bounty_cash ?? row.bountyCash ?? 1956791);
          const dist = Math.round(Number(row.distance_m ?? row.distanceM ?? 0));
          const speed = Math.round(Number(row.max_speed_kmh ?? row.maxSpeedKmh ?? 188));
          const stars = Math.min(6, Math.max(1, Number(row.wanted_stars ?? row.wantedStars ?? 6)));

          return `
            <div class="lb-row ${rank === 1 ? 'top-1' : ''}">
              <div class="lb-rank">#${rank}</div>
              <div class="lb-player-info">
                <div class="lb-player-name">${name}</div>
                <div class="lb-player-meta">${'★'.repeat(stars)} • ${dist}m • ${speed} km/h</div>
              </div>
              <div class="lb-bounty">$${bounty.toLocaleString('en-US')}</div>
            </div>
          `;
        })
        .join('');

      if (el.menuLeaderboardList) {
        el.menuLeaderboardList.innerHTML = buildRowsHtml(safeEntries.slice(0, 4));
      }
      if (el.gameoverLeaderboardList) {
        el.gameoverLeaderboardList.innerHTML = buildRowsHtml(safeEntries.slice(0, 5));
      }
    },

    // =========================================================================
    // WASTED / BUSTED (CERCO FECHADO) GAME OVER MODAL
    // =========================================================================

    showGameOver(summary = {}) {
      const el = this._elements;
      if (!el.gameoverModal) return;

      const bounty = Math.floor(
        summary.bounty_cash ?? summary.totalBountyCash ?? summary.cash ?? 1956791
      );
      const score = Math.floor(summary.score ?? summary.runScore ?? 0);
      const dist = Math.floor(summary.distance_m ?? summary.distance ?? 0);
      const maxSpeed = Math.round(summary.max_speed_kmh ?? summary.maxSpeed ?? 188);
      const roadblocks = Math.floor(summary.roadblocks_broken ?? summary.roadblocksBroken ?? 0);
      const stars = Math.max(1, Math.min(6, Math.round(summary.wanted_stars ?? summary.wantedStars ?? 1)));

      if (el.goBountyCash) el.goBountyCash.textContent = `$${bounty.toLocaleString('en-US')}`;
      if (el.goScore) el.goScore.textContent = score.toLocaleString('pt-BR');
      if (el.goDistance) el.goDistance.textContent = `${dist.toLocaleString('pt-BR')} m`;
      if (el.goMaxSpeed) el.goMaxSpeed.textContent = `${maxSpeed} km/h`;
      if (el.goRoadblocks) el.goRoadblocks.textContent = String(roadblocks);
      if (el.goWantedStars) el.goWantedStars.textContent = '★'.repeat(stars);

      el.gameoverModal.classList.add('active');
    },

    hideGameOver() {
      if (this._elements.gameoverModal) {
        this._elements.gameoverModal.classList.remove('active');
      }
    },

    _escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  };

  window.GT6UI = GT6UI;
})(window);
