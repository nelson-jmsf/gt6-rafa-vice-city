/**
 * GT6 RAFA: FUGA DE VICE CITY (EDTECH PT-13 EDITION)
 * Procedural Web Audio API Sound Engine & COPOM Police Radio Dispatch System
 * Attaches `window.GT6Audio`
 */
(function () {
  'use strict';

  const DISPATCH_LINES = [
    {
      id: 'dispatch_1',
      key: 'avenida',
      aliases: ['start', 'fuga', 'avenida', 'spawn', '1', 0],
      speaker: 'COPOM CENTRAL',
      text: 'Atenção todas as unidades, suspeito em fuga na avenida!',
      startTime: 0.1,
      endTime: 3.2
    },
    {
      id: 'dispatch_2',
      key: 'reforcos',
      aliases: ['speed', 'alta_velocidade', 'reforcos', 'stars', '2stars', '3stars', '2', 1],
      speaker: 'COPOM CENTRAL',
      text: 'Ele está em alta velocidade, enviem reforços!',
      startTime: 3.2,
      endTime: 6.1
    },
    {
      id: 'dispatch_3',
      key: 'bloqueio',
      aliases: ['roadblock', 'jump', 'ramp', 'bloqueio', 'furando', 'blockade', '4stars', '3', 2],
      speaker: 'VIATURA VCPD-13',
      text: 'Cuidado, ele está furando o bloqueio!',
      startTime: 6.1,
      endTime: 9.1
    },
    {
      id: 'dispatch_4',
      key: 'aereo',
      aliases: ['heli', 'helicopter', 'aereo', 'apoio_aereo', '5stars', 'air', '4', 3],
      speaker: 'ÁGUIA VCPD AIR-1',
      text: 'Apoio aéreo a caminho, cerquem a área!',
      startTime: 9.1,
      endTime: 12.1
    },
    {
      id: 'dispatch_5',
      key: 'escapar',
      aliases: ['surround', 'cerco', '6stars', 'escapar', 'fechem', 'max_heat', 'max_wanted', 'roadblock_warn', '5', 4],
      speaker: 'COMANDO TÁTICO 6★',
      text: 'Não deixem ele escapar, fechem a via!',
      startTime: 12.1,
      endTime: 14.9
    }
  ];

  const GT6Audio = {
    ctx: null,
    masterGain: null,
    compressor: null,
    noiseBuffer: null,
    isInitialized: false,
    isMuted: false,
    engineRunning: false,
    wantedStars: 0,
    dispatchCursor: 0,
    lastDispatchTime: 0,
    lastDispatch: DISPATCH_LINES[0].text,

    // Procedural Engine Nodes
    engineNodes: null,
    // Background Siren & Helicopter Nodes
    pursuitNodes: null,
    sirenTimer: null,
    sirenPhase: 0,

    // Authentic Video/Audio Dispatch Element
    dispatchMediaEl: null,
    dispatchStopTimer: null,

    /**
     * Safely initializes AudioContext and prepares hidden dispatch media element.
     */
    init() {
      this._ensureDispatchMediaElement();
      this._bindUnlockListeners();

      if (this.isInitialized && this.ctx) {
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        return this;
      }

      try {
        if (typeof window === 'undefined') {
          return this;
        }
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) {
          return this;
        }

        this.ctx = new AudioCtx();
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-18, this.ctx.currentTime);
        this.compressor.knee.setValueAtTime(20, this.ctx.currentTime);
        this.compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
        this.compressor.attack.setValueAtTime(0.005, this.ctx.currentTime);
        this.compressor.release.setValueAtTime(0.18, this.ctx.currentTime);

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.82, this.ctx.currentTime);

        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        this.noiseBuffer = this._createNoiseBuffer(2.0);
        this.isInitialized = true;
      } catch (err) {
        console.warn('[GT6Audio] Web Audio init deferred until user gesture:', err);
      }

      return this;
    },

    _bindUnlockListeners() {
      if (this._unlockBound) return;
      this._unlockBound = true;

      const unlock = () => {
        if (!this.isInitialized) {
          this.init();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
      };

      if (typeof window !== 'undefined') {
        ['pointerdown', 'keydown', 'touchstart', 'click'].forEach((evt) => {
          window.addEventListener(evt, unlock, { passive: true });
        });
      }
    },

    _ensureContext() {
      if (!this.isInitialized || !this.ctx) {
        this.init();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return Boolean(this.ctx);
    },

    _createNoiseBuffer(durationSeconds = 2.0) {
      if (!this.ctx) return null;
      const sampleRate = this.ctx.sampleRate;
      const length = Math.floor(sampleRate * durationSeconds);
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      return buffer;
    },

    _ensureDispatchMediaElement() {
      if (typeof document === 'undefined' || this.dispatchMediaEl) return;
      try {
        const video = document.createElement('video');
        video.id = 'gt6-hidden-dispatch-media';
        video.src = './assets/rafa-chase.mp4';
        video.preload = 'auto';
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        video.style.position = 'fixed';
        video.style.width = '1px';
        video.style.height = '1px';
        video.style.opacity = '0';
        video.style.pointerEvents = 'none';
        video.style.left = '-9999px';
        video.volume = 0.9;

        const attach = () => {
          if (document.body && !document.getElementById('gt6-hidden-dispatch-media')) {
            document.body.appendChild(video);
          }
        };
        if (document.body) {
          attach();
        } else {
          window.addEventListener('DOMContentLoaded', attach, { once: true });
        }
        this.dispatchMediaEl = video;
      } catch (e) {
        // Ignore DOM creation issues in headless/node tests
      }
    },

    /**
     * Starts procedural fat-tire electric chopper motor hum + EDTECH inverter whine
     * + drift tire-screech channel + airborne wind whoosh channel.
     */
    startEngine() {
      if (!this._ensureContext()) return;
      if (this.engineRunning && this.engineNodes) return;

      const now = this.ctx.currentTime;

      // 1. Sub-bass electric chopper hub torque hum
      const motorOsc = this.ctx.createOscillator();
      motorOsc.type = 'sawtooth';
      motorOsc.frequency.setValueAtTime(58, now);

      const motorFilter = this.ctx.createBiquadFilter();
      motorFilter.type = 'lowpass';
      motorFilter.frequency.setValueAtTime(160, now);
      motorFilter.Q.setValueAtTime(3.2, now);

      const motorGain = this.ctx.createGain();
      motorGain.gain.setValueAtTime(0.001, now);
      motorGain.gain.exponentialRampToValueAtTime(0.16, now + 0.25);

      motorOsc.connect(motorFilter);
      motorFilter.connect(motorGain);
      motorGain.connect(this.compressor);

      // 2. High-voltage EDTECH PWM inverter whine
      const whineOsc = this.ctx.createOscillator();
      whineOsc.type = 'triangle';
      whineOsc.frequency.setValueAtTime(290, now);

      const whineFilter = this.ctx.createBiquadFilter();
      whineFilter.type = 'bandpass';
      whineFilter.frequency.setValueAtTime(520, now);
      whineFilter.Q.setValueAtTime(2.5, now);

      const whineGain = this.ctx.createGain();
      whineGain.gain.setValueAtTime(0.001, now);
      whineGain.gain.exponentialRampToValueAtTime(0.055, now + 0.25);

      whineOsc.connect(whineFilter);
      whineFilter.connect(whineGain);
      whineGain.connect(this.compressor);

      // 3. Drift tire-screech & electric spark crackle noise channel
      const driftNoise = this.ctx.createBufferSource();
      driftNoise.buffer = this.noiseBuffer;
      driftNoise.loop = true;

      const driftFilter = this.ctx.createBiquadFilter();
      driftFilter.type = 'bandpass';
      driftFilter.frequency.setValueAtTime(1650, now);
      driftFilter.Q.setValueAtTime(4.5, now);

      const driftGain = this.ctx.createGain();
      driftGain.gain.setValueAtTime(0.0001, now);

      driftNoise.connect(driftFilter);
      driftFilter.connect(driftGain);
      driftGain.connect(this.compressor);

      // 4. Airborne ramp jump wind-whoosh noise channel
      const windNoise = this.ctx.createBufferSource();
      windNoise.buffer = this.noiseBuffer;
      windNoise.loop = true;

      const windFilter = this.ctx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.setValueAtTime(480, now);
      windFilter.Q.setValueAtTime(1.8, now);

      const windGain = this.ctx.createGain();
      windGain.gain.setValueAtTime(0.0001, now);

      windNoise.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(this.compressor);

      motorOsc.start(now);
      whineOsc.start(now);
      driftNoise.start(now);
      windNoise.start(now);

      this.engineNodes = {
        motorOsc,
        motorFilter,
        motorGain,
        whineOsc,
        whineFilter,
        whineGain,
        driftNoise,
        driftFilter,
        driftGain,
        windNoise,
        windFilter,
        windGain
      };
      this.engineRunning = true;
    },

    /**
     * Stops procedural motor hum, drift screech, and wind channels cleanly.
     */
    stopEngine() {
      if (!this.engineNodes || !this.ctx) {
        this.engineRunning = false;
        return;
      }

      const now = this.ctx.currentTime;
      const nodes = this.engineNodes;
      this.engineNodes = null;
      this.engineRunning = false;

      try {
        nodes.motorGain.gain.setTargetAtTime(0.0001, now, 0.06);
        nodes.whineGain.gain.setTargetAtTime(0.0001, now, 0.06);
        nodes.driftGain.gain.setTargetAtTime(0.0001, now, 0.04);
        nodes.windGain.gain.setTargetAtTime(0.0001, now, 0.04);

        setTimeout(() => {
          try { nodes.motorOsc.stop(); } catch (e) {}
          try { nodes.whineOsc.stop(); } catch (e) {}
          try { nodes.driftNoise.stop(); } catch (e) {}
          try { nodes.windNoise.stop(); } catch (e) {}
        }, 250);
      } catch (e) {}
    },

    /**
     * Modulates motor pitch, adds drift tire-screech/spark crackle noise when drifting,
     * and wind whoosh when airborne.
     * @param {number} speedRatio - Normalized speed (0..1.5) or raw km/h (e.g. 95..300)
     * @param {boolean} isDrifting - True when drifting/sliding across lanes
     * @param {boolean} isAirborne - True when jumping off ramps
     */
    updateEngine(speedRatio = 0.5, isDrifting = false, isAirborne = false) {
      if (!this.engineRunning || !this.engineNodes || !this.ctx) return;

      const now = this.ctx.currentTime;
      // Support both 0..1.5 ratios and raw km/h speeds (e.g., 95..300)
      const norm = speedRatio > 3.0
        ? Math.max(0.1, Math.min(speedRatio / 220, 1.45))
        : Math.max(0.05, Math.min(Number(speedRatio) || 0.4, 1.5));

      const airBoost = isAirborne ? 1.18 : 1.0;
      const targetMotorFreq = (52 + norm * 88) * airBoost;
      const targetFilterFreq = 140 + norm * 320;
      const targetWhineFreq = (260 + norm * 640) * airBoost;

      this.engineNodes.motorOsc.frequency.setTargetAtTime(targetMotorFreq, now, 0.05);
      this.engineNodes.motorFilter.frequency.setTargetAtTime(targetFilterFreq, now, 0.05);
      this.engineNodes.motorGain.gain.setTargetAtTime(0.12 + Math.min(norm, 1.2) * 0.08, now, 0.06);

      this.engineNodes.whineOsc.frequency.setTargetAtTime(targetWhineFreq, now, 0.05);
      this.engineNodes.whineFilter.frequency.setTargetAtTime(targetWhineFreq * 1.35, now, 0.05);
      this.engineNodes.whineGain.gain.setTargetAtTime(0.035 + Math.min(norm, 1.3) * 0.045, now, 0.06);

      // Drift tire screech + electric spark crackle modulation
      const targetDriftGain = isDrifting ? 0.11 : 0.0001;
      const jitterFreq = 1450 + Math.sin(now * 42) * 380;
      this.engineNodes.driftFilter.frequency.setTargetAtTime(jitterFreq, now, 0.03);
      this.engineNodes.driftGain.gain.setTargetAtTime(targetDriftGain, now, 0.04);

      // Airborne ramp jump wind-whoosh
      const targetWindGain = isAirborne ? 0.16 : Math.max(0.005, norm * 0.03);
      const targetWindCutoff = isAirborne ? 980 : 320 + norm * 250;
      this.engineNodes.windFilter.frequency.setTargetAtTime(targetWindCutoff, now, 0.06);
      this.engineNodes.windGain.gain.setTargetAtTime(targetWindGain, now, 0.05);
    },

    /**
     * Dynamically runs background police siren wail/yelp oscillators (more intense at 3-6 stars)
     * and VCPD helicopter rotor thump at 5-6 stars.
     * @param {number} stars - Wanted level (0..6)
     */
    setWantedLevel(stars = 0) {
      const clamped = Math.max(0, Math.min(6, Math.round(Number(stars) || 0)));
      this.wantedStars = clamped;

      if (clamped === 0) {
        this._stopPursuitLoops();
        return;
      }

      if (!this._ensureContext()) return;
      this._ensurePursuitLoops();

      const now = this.ctx.currentTime;
      const p = this.pursuitNodes;
      if (!p) return;

      // Primary wail siren volume scales from 1 to 6 stars
      const wailLevel = clamped >= 3 ? 0.045 + (clamped - 2) * 0.012 : 0.022 + clamped * 0.008;
      p.siren1Gain.gain.setTargetAtTime(wailLevel, now, 0.12);

      // Secondary yelp siren activates at 3-6 stars
      const yelpLevel = clamped >= 3 ? 0.032 + (clamped - 3) * 0.012 : 0.0001;
      p.siren2Gain.gain.setTargetAtTime(yelpLevel, now, 0.12);

      // Helicopter rotor blade thump activates at 5-6 stars
      const heliLevel = clamped >= 5 ? (clamped === 6 ? 0.18 : 0.12) : 0.0001;
      p.heliMasterGain.gain.setTargetAtTime(heliLevel, now, 0.2);
      p.heliLfo.frequency.setTargetAtTime(clamped === 6 ? 8.2 : 7.0, now, 0.1);
    },

    _ensurePursuitLoops() {
      if (this.pursuitNodes || !this.ctx) return;
      const now = this.ctx.currentTime;

      // Siren 1: Classic VCPD Wail
      const siren1Osc = this.ctx.createOscillator();
      siren1Osc.type = 'triangle';
      siren1Osc.frequency.setValueAtTime(640, now);

      const siren1Filter = this.ctx.createBiquadFilter();
      siren1Filter.type = 'bandpass';
      siren1Filter.frequency.setValueAtTime(1100, now);
      siren1Filter.Q.setValueAtTime(1.4, now);

      const siren1Gain = this.ctx.createGain();
      siren1Gain.gain.setValueAtTime(0.0001, now);

      siren1Osc.connect(siren1Filter);
      siren1Filter.connect(siren1Gain);
      siren1Gain.connect(this.compressor);

      // Siren 2: High-heat Rapid Yelp (3-6 stars)
      const siren2Osc = this.ctx.createOscillator();
      siren2Osc.type = 'sawtooth';
      siren2Osc.frequency.setValueAtTime(920, now);

      const siren2Filter = this.ctx.createBiquadFilter();
      siren2Filter.type = 'bandpass';
      siren2Filter.frequency.setValueAtTime(1350, now);
      siren2Filter.Q.setValueAtTime(2.0, now);

      const siren2Gain = this.ctx.createGain();
      siren2Gain.gain.setValueAtTime(0.0001, now);

      siren2Osc.connect(siren2Filter);
      siren2Filter.connect(siren2Gain);
      siren2Gain.connect(this.compressor);

      // Helicopter Rotor Blade Thump (5-6 stars)
      const heliNoise = this.ctx.createBufferSource();
      heliNoise.buffer = this.noiseBuffer;
      heliNoise.loop = true;

      const heliFilter = this.ctx.createBiquadFilter();
      heliFilter.type = 'lowpass';
      heliFilter.frequency.setValueAtTime(175, now);
      heliFilter.Q.setValueAtTime(2.8, now);

      const heliRotorGain = this.ctx.createGain();
      heliRotorGain.gain.setValueAtTime(0.5, now);

      const heliLfo = this.ctx.createOscillator();
      heliLfo.type = 'sine';
      heliLfo.frequency.setValueAtTime(7.4, now);

      const heliLfoDepth = this.ctx.createGain();
      heliLfoDepth.gain.setValueAtTime(0.48, now);

      heliLfo.connect(heliLfoDepth);
      heliLfoDepth.connect(heliRotorGain.gain);

      const heliMasterGain = this.ctx.createGain();
      heliMasterGain.gain.setValueAtTime(0.0001, now);

      heliNoise.connect(heliFilter);
      heliFilter.connect(heliRotorGain);
      heliRotorGain.connect(heliMasterGain);
      heliMasterGain.connect(this.compressor);

      siren1Osc.start(now);
      siren2Osc.start(now);
      heliNoise.start(now);
      heliLfo.start(now);

      this.pursuitNodes = {
        siren1Osc,
        siren1Gain,
        siren2Osc,
        siren2Gain,
        heliNoise,
        heliLfo,
        heliMasterGain
      };

      // Modulate wail and yelp frequencies continuously
      if (this.sirenTimer) clearInterval(this.sirenTimer);
      this.sirenTimer = setInterval(() => {
        if (!this.pursuitNodes || !this.ctx || this.wantedStars <= 0) return;
        const t = this.ctx.currentTime;
        this.sirenPhase += 0.14;

        // Wail oscillation (580 Hz - 1180 Hz)
        const wailFreq = 860 + Math.sin(this.sirenPhase) * 310;
        this.pursuitNodes.siren1Osc.frequency.setTargetAtTime(wailFreq, t, 0.08);

        // Rapid yelp oscillation (780 Hz - 1540 Hz)
        const yelpFreq = 1140 + Math.sin(this.sirenPhase * 4.2) * 390;
        this.pursuitNodes.siren2Osc.frequency.setTargetAtTime(yelpFreq, t, 0.04);
      }, 90);
    },

    _stopPursuitLoops() {
      if (this.sirenTimer) {
        clearInterval(this.sirenTimer);
        this.sirenTimer = null;
      }
      if (!this.pursuitNodes || !this.ctx) return;

      const now = this.ctx.currentTime;
      const p = this.pursuitNodes;
      this.pursuitNodes = null;

      try {
        p.siren1Gain.gain.setTargetAtTime(0.0001, now, 0.08);
        p.siren2Gain.gain.setTargetAtTime(0.0001, now, 0.08);
        p.heliMasterGain.gain.setTargetAtTime(0.0001, now, 0.1);

        setTimeout(() => {
          try { p.siren1Osc.stop(); } catch (e) {}
          try { p.siren2Osc.stop(); } catch (e) {}
          try { p.heliNoise.stop(); } catch (e) {}
          try { p.heliLfo.stop(); } catch (e) {}
        }, 250);
      } catch (e) {}
    },

    /**
     * Plays procedural GTA 6 arcade sound effects.
     * Supports: 'cash', 'star', 'crash', 'jump', 'siren', 'nitro', 'emp', 'busted', 'roadblock'
     */
    playSfx(type = 'cash') {
      if (this.isMuted || !this._ensureContext()) return;
      const now = this.ctx.currentTime;
      const kind = String(type || '').toLowerCase();

      switch (kind) {
        case 'cash':
        case 'money':
        case 'coin':
        case 'pickup': {
          // Crisp GTA Vice City cash pickup double chime
          const osc1 = this.ctx.createOscillator();
          const osc2 = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc1.type = 'sine';
          osc2.type = 'triangle';

          osc1.frequency.setValueAtTime(1046.5, now); // C6
          osc1.frequency.setValueAtTime(1318.5, now + 0.065); // E6
          osc1.frequency.setValueAtTime(1567.98, now + 0.13); // G6

          osc2.frequency.setValueAtTime(2093.0, now);
          osc2.frequency.setValueAtTime(2637.0, now + 0.065);
          osc2.frequency.setValueAtTime(3135.96, now + 0.13);

          gain.gain.setValueAtTime(0.22, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(this.compressor);

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 0.35);
          osc2.stop(now + 0.35);
          break;
        }

        case 'star':
        case 'wanted':
        case 'wanted_up': {
          // GTA Wanted Star escalation alert sting
          const notes = [587.33, 783.99, 987.77, 1174.66]; // D5, G5, B5, D6
          notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            const t0 = now + idx * 0.065;
            osc.frequency.setValueAtTime(freq, t0);

            gain.gain.setValueAtTime(0.18, t0);
            gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);

            osc.connect(gain);
            gain.connect(this.compressor);
            osc.start(t0);
            osc.stop(t0 + 0.24);
          });
          break;
        }

        case 'crash':
        case 'hit':
        case 'collision':
        case 'damage': {
          // Heavy metallic crunch + low impact thud
          const noise = this.ctx.createBufferSource();
          noise.buffer = this.noiseBuffer;

          const filter = this.ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(820, now);
          filter.frequency.exponentialRampToValueAtTime(180, now + 0.38);
          filter.Q.setValueAtTime(1.5, now);

          const noiseGain = this.ctx.createGain();
          noiseGain.gain.setValueAtTime(0.45, now);
          noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

          const thudOsc = this.ctx.createOscillator();
          const thudGain = this.ctx.createGain();
          thudOsc.type = 'sine';
          thudOsc.frequency.setValueAtTime(135, now);
          thudOsc.frequency.exponentialRampToValueAtTime(34, now + 0.32);

          thudGain.gain.setValueAtTime(0.48, now);
          thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

          noise.connect(filter);
          filter.connect(noiseGain);
          noiseGain.connect(this.compressor);

          thudOsc.connect(thudGain);
          thudGain.connect(this.compressor);

          noise.start(now);
          noise.stop(now + 0.42);
          thudOsc.start(now);
          thudOsc.stop(now + 0.35);
          break;
        }

        case 'jump':
        case 'ramp':
        case 'wheelie': {
          // Dramatic overpass ramp launch whoosh + synth riser
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(180, now);
          osc.frequency.exponentialRampToValueAtTime(760, now + 0.38);

          gain.gain.setValueAtTime(0.24, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

          osc.connect(gain);
          gain.connect(this.compressor);
          osc.start(now);
          osc.stop(now + 0.44);
          break;
        }

        case 'siren':
        case 'police':
        case 'chirp': {
          // Sharp VCPD cruiser double yelp chirp
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(680, now);
          osc.frequency.linearRampToValueAtTime(1420, now + 0.14);
          osc.frequency.setValueAtTime(720, now + 0.16);
          osc.frequency.linearRampToValueAtTime(1520, now + 0.32);

          gain.gain.setValueAtTime(0.22, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

          osc.connect(gain);
          gain.connect(this.compressor);
          osc.start(now);
          osc.stop(now + 0.38);
          break;
        }

        case 'nitro':
        case 'boost':
        case 'armor': {
          // High-voltage EDTECH lithium nitro turbine surge
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(220, now);
          osc.frequency.exponentialRampToValueAtTime(1280, now + 0.55);

          const filter = this.ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(1800, now);

          gain.gain.setValueAtTime(0.26, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(this.compressor);
          osc.start(now);
          osc.stop(now + 0.62);
          break;
        }

        case 'emp':
        case 'weapon':
        case 'shoot':
        case 'fire': {
          // Tactical 558-30 EMP shockwave pulse + rapid 3-round burst
          for (let i = 0; i < 3; i++) {
            const t0 = now + i * 0.055;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(980, t0);
            osc.frequency.exponentialRampToValueAtTime(65, t0 + 0.14);

            gain.gain.setValueAtTime(0.28, t0);
            gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);

            osc.connect(gain);
            gain.connect(this.compressor);
            osc.start(t0);
            osc.stop(t0 + 0.16);
          }
          break;
        }

        case 'roadblock':
        case 'blockade':
        case 'smash': {
          // "FURANDO O BLOQUEIO!" — barricade smash + dramatic action chord
          this.playSfx('crash');
          const chord = [440, 554.37, 659.25, 880]; // A major heroic stinger
          chord.forEach((freq) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + 0.05);
            gain.gain.setValueAtTime(0.14, now + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

            osc.connect(gain);
            gain.connect(this.compressor);
            osc.start(now + 0.05);
            osc.stop(now + 0.68);
          });
          break;
        }

        case 'busted':
        case 'wasted':
        case 'gameover': {
          // Classic GTA BUSTED descending dramatic minor brass sting
          const freqs = [293.66, 220.0, 146.83];
          freqs.forEach((f, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(f, now);
            osc.frequency.linearRampToValueAtTime(f * 0.86, now + 1.1);

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(520, now);
            filter.frequency.exponentialRampToValueAtTime(140, now + 1.1);

            gain.gain.setValueAtTime(0.2 - idx * 0.03, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.15);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.compressor);
            osc.start(now);
            osc.stop(now + 1.2);
          });
          break;
        }

        default: {
          // Subtle UI / radar beep
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, now);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
          osc.connect(gain);
          gain.connect(this.compressor);
          osc.start(now);
          osc.stop(now + 0.1);
          break;
        }
      }
    },

    /**
     * Plays walkie-talkie PTT squelch burst before/after COPOM radio transmission.
     */
    _playRadioSquelch(duration = 0.09) {
      if (this.isMuted || !this._ensureContext()) return;
      const now = this.ctx.currentTime;

      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1950, now);
      filter.Q.setValueAtTime(3.5, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      const beep = this.ctx.createOscillator();
      const beepGain = this.ctx.createGain();
      beep.type = 'sine';
      beep.frequency.setValueAtTime(1580, now);
      beepGain.gain.setValueAtTime(0.1, now);
      beepGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.7);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.compressor);

      beep.connect(beepGain);
      beepGain.connect(this.compressor);

      noise.start(now);
      noise.stop(now + duration);
      beep.start(now);
      beep.stop(now + duration * 0.75);
    },

    /**
     * Resolves a phrase key, index, or custom Portuguese phrase into a dispatch descriptor.
     */
    _resolveDispatch(phraseOrKey) {
      if (phraseOrKey === undefined || phraseOrKey === null || phraseOrKey === '') {
        const line = DISPATCH_LINES[this.dispatchCursor % DISPATCH_LINES.length];
        this.dispatchCursor = (this.dispatchCursor + 1) % DISPATCH_LINES.length;
        return line;
      }

      if (typeof phraseOrKey === 'number') {
        return DISPATCH_LINES[Math.abs(phraseOrKey) % DISPATCH_LINES.length];
      }

      const raw = String(phraseOrKey).trim();
      const norm = raw.toLowerCase();

      // Match by key, id, alias, or substring
      for (const item of DISPATCH_LINES) {
        if (
          item.key === norm ||
          item.id === norm ||
          item.text.toLowerCase() === norm ||
          item.aliases.some((a) => String(a).toLowerCase() === norm) ||
          item.text.toLowerCase().includes(norm)
        ) {
          return item;
        }
      }

      // Keyword heuristics for game triggers
      if (norm.includes('bloqueio') || norm.includes('roadblock') || norm.includes('ramp') || norm.includes('jump')) {
        return DISPATCH_LINES[2];
      }
      if (norm.includes('heli') || norm.includes('aereo') || norm.includes('aéreo') || norm.includes('air') || norm.includes('5')) {
        return DISPATCH_LINES[3];
      }
      if (norm.includes('escapar') || norm.includes('fechem') || norm.includes('cerco') || norm.includes('6')) {
        return DISPATCH_LINES[4];
      }
      if (norm.includes('velocidade') || norm.includes('reforco') || norm.includes('reforço') || norm.includes('speed')) {
        return DISPATCH_LINES[1];
      }
      if (norm.includes('avenida') || norm.includes('fuga') || norm.includes('start')) {
        return DISPATCH_LINES[0];
      }

      // Custom phrase passed directly
      return {
        id: 'custom_dispatch',
        key: 'custom',
        speaker: 'COPOM CENTRAL',
        text: raw,
        startTime: null,
        endTime: null
      };
    },

    /**
     * Plays authentic COPOM police dispatch audio from `assets/rafa-chase.mp4` time-sliced segment
     * (with Web Speech API pt-BR walkie-talkie fallback) AND returns the subtitle text for `GT6UI`.
     * @param {string|number} [phraseOrKey] - Key ('avenida', 'reforcos', 'bloqueio', 'aereo', 'escapar', 'roadblock', 'heli', etc.) or full phrase
     * @returns {string} The Portuguese subtitle text for the police scanner ticker
     */
    playPoliceDispatch(phraseOrKey) {
      const clip = this._resolveDispatch(phraseOrKey);
      this.lastDispatch = clip.text;

      if (!this.isMuted) {
        this._playRadioSquelch(0.09);
        this._playAuthenticOrSpeechClip(clip);
      }

      return clip.text;
    },

    _playAuthenticOrSpeechClip(clip) {
      this._ensureDispatchMediaElement();

      // 1. Try playing the exact time-sliced segment from assets/rafa-chase.mp4
      if (this.dispatchMediaEl && typeof clip.startTime === 'number' && typeof clip.endTime === 'number') {
        try {
          if (this.dispatchStopTimer) {
            clearTimeout(this.dispatchStopTimer);
            this.dispatchStopTimer = null;
          }

          const media = this.dispatchMediaEl;
          media.muted = this.isMuted;
          media.volume = 0.92;
          if (media.readyState >= 1) {
            media.currentTime = clip.startTime;
          }

          const durationMs = Math.max(1200, (clip.endTime - clip.startTime) * 1000);
          const playPromise = media.play();

          if (playPromise && typeof playPromise.then === 'function') {
            playPromise
              .then(() => {
                this.dispatchStopTimer = setTimeout(() => {
                  try { media.pause(); } catch (e) {}
                  this._playRadioSquelch(0.06);
                }, durationMs);
              })
              .catch(() => {
                this._speakFallbackPtBr(clip.text);
              });
          }
          return;
        } catch (err) {
          this._speakFallbackPtBr(clip.text);
          return;
        }
      }

      // 2. Fallback to Web Speech API (pt-BR) with radio squelch
      this._speakFallbackPtBr(clip.text);
    },

    _speakFallbackPtBr(text) {
      if (this.isMuted || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'pt-BR';
        utter.rate = 1.14;
        utter.pitch = 0.94;
        utter.volume = 0.9;
        utter.onend = () => {
          this._playRadioSquelch(0.06);
        };
        window.speechSynthesis.speak(utter);
      } catch (e) {}
    },

    /**
     * Returns all 5 official COPOM police dispatch transcript entries.
     */
    getDispatchLines() {
      return DISPATCH_LINES.map((d) => ({ ...d }));
    },

    /**
     * Toggles master audio mute state and returns the new `isMuted` boolean.
     */
    toggleMute() {
      this.isMuted = !this.isMuted;

      if (this.ctx && this.masterGain) {
        this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.82, this.ctx.currentTime, 0.04);
      }

      if (this.dispatchMediaEl) {
        this.dispatchMediaEl.muted = this.isMuted;
        if (this.isMuted) {
          try { this.dispatchMediaEl.pause(); } catch (e) {}
        }
      }

      if (this.isMuted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
      }

      return this.isMuted;
    }
  };

  if (typeof window !== 'undefined') {
    window.GT6Audio = GT6Audio;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = GT6Audio;
  }
})();
