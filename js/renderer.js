/**
 * GT6 RAFA: FUGA DE VICE CITY (EDTECH PT-13 EDITION)
 * Core 3D Scene Orchestrator, Curved 3D Highway, Photorealistic GTA 6 Nocturnal Lighting & Post-FX
 * Attached to: window.GT6Renderer
 */
(function () {
  'use strict';

  const LANES = [-4.5, -1.5, 1.5, 4.5];
  const ROAD_WIDTH = 14.0;
  const SEGMENT_LENGTH = 40;
  const NUM_ROAD_SEGMENTS = 8;
  const ROAD_SUB_SLICES = 4;
  const QUALITY_PRESETS = ['ULTRA', 'HIGH', 'PERFORMANCE'];

  // Helper for rounded rectangles on 2D canvas
  function fillRoundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }

  // Deterministic pseudo-random helper for realistic building windows
  function seededRandom(seed) {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  const GT6Renderer = {
    initialized: false,
    _initialized: false,
    container: null,
    scene: null,
    camera: null,
    renderer: null,

    // Graphics Quality & Post-FX state
    quality: 'ULTRA',
    envMap: null,
    postProcessor: null,
    atmosphere: null,
    wetAsphaltTextures: null,

    // 3D Curved Highway state
    roadCurve: 0,
    targetRoadCurve: 0,

    // Camera state
    cameraMode: 'chase',
    _lastStateCameraMode: null,
    cameraShake: 0,
    cameraBank: 0,
    cinematicTimer: 0,
    currentLookAt: null,
    currentCamPos: null,

    // Dynamic Scene Lights
    moonLight: null,
    hemiLight: null,
    pinkFillLight: null,
    cyanFillLight: null,
    policeSirenLight: null,
    underGlowLight: null,

    // Player & Chopper parts
    playerGroup: null,
    bikeGroup: null,
    chopperRefs: null,
    riderGroup: null,
    riderTorso: null,
    riderHead: null,
    frontWheelGroup: null,
    rearWheelGroup: null,
    steeringGroup: null,
    headlightSpot: null,
    headlightBeam: null,
    tailLightMat: null,
    nitroFlames: [],
    nitroFlameLeft: null,
    nitroFlameRight: null,
    empShieldMesh: null,

    // Environment pools
    roadSegments: [],
    scenerySegments: [],
    skylineGroup: null,
    starField: null,
    neonSigns: [],
    streetLights: [],
    puddleMeshes: [],
    posterTexture: null,

    // Helicopter & default trailing police
    heliGroup: null,
    heliRefs: null,
    heliMainRotor: null,
    heliTailRotor: null,
    heliSpotLight: null,
    heliLightCone: null,
    heliRedLight: null,
    heliBlueLight: null,
    heliGroundRing: null,
    ambientChasers: [],

    // Dynamic state entity maps (id -> THREE.Object3D)
    obstacleMeshes: new Map(),
    rampMeshes: new Map(),
    pickupMeshes: new Map(),
    chaserMeshes: new Map(),

    // Particle systems (sparks, smoke plumes, shockwaves)
    particles: [],
    particleGroup: null,
    shockwaves: [],

    // Cached procedural textures & materials
    textures: {},
    materials: {},

    // Internal clock
    elapsedTime: 0,
    scrollOffset: 0,

    /**
     * Compute smooth quadratic lateral road curve offset at depth `z`.
     * Formula: `roadCurve * ((z / 100) ** 2) * 28`
     * @param {number} z
     * @param {number} [curveOverride]
     * @returns {number}
     */
    getCurveOffsetX(z, curveOverride) {
      const curve = Number.isFinite(curveOverride) ? curveOverride : this.roadCurve || 0;
      const dz = Number(z) || 0;
      return curve * Math.pow(dz / 100, 2) * 28;
    },

    /**
     * Compute smooth highway yaw tangent angle at depth `z`.
     * @param {number} z
     * @param {number} [curveOverride]
     * @returns {number}
     */
    getCurveAngle(z, curveOverride) {
      const curve = Number.isFinite(curveOverride) ? curveOverride : this.roadCurve || 0;
      const dz = Number(z) || 0;
      const slope = curve * ((2 * dz) / 10000) * 28;
      return Math.atan(slope);
    },

    /**
     * Initialize Three.js Scene, Camera, WebGLRenderer, GT6PostFX, GT6Models, World, Rafa Chopper & Police
     * @param {HTMLElement|string} containerEl
     */
    init(containerEl) {
      if (typeof window === 'undefined' || !window.THREE) {
        console.warn('[GT6Renderer] window.THREE not found yet.');
        return this;
      }

      if (typeof containerEl === 'string') {
        this.container =
          (typeof document !== 'undefined' &&
            (document.querySelector(containerEl) || document.getElementById(containerEl))) ||
          null;
      } else if (containerEl && typeof containerEl === 'object') {
        this.container = containerEl;
      }
      if (!this.container && typeof document !== 'undefined') {
        this.container =
          document.getElementById('game-canvas-container') ||
          document.getElementById('canvas-container') ||
          document.body;
      }

      if (this.initialized && this.renderer) {
        this.resize();
        return this;
      }

      const THREE = window.THREE;
      this.currentLookAt = new THREE.Vector3(0, 1.18, -18);
      this.currentCamPos = new THREE.Vector3(0, 2.0, 4.6);

      // 1. Scene & Photorealistic GTA 6 Nocturnal Sky / Volumetric Street Mist
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x05080d);
      this.scene.fog = new THREE.FogExp2(0x141b24, 0.0062);

      // 2. Perspective Camera
      const width = (this.container && this.container.clientWidth) || window.innerWidth || 1280;
      const height = (this.container && this.container.clientHeight) || window.innerHeight || 720;
      this.camera = new THREE.PerspectiveCamera(58, width / Math.max(1, height), 0.1, 420);
      this.camera.position.copy(this.currentCamPos);
      this.camera.lookAt(this.currentLookAt);

      // 3. WebGLRenderer with PCFSoftShadowMap & ACESFilmicToneMapping
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false
      });
      this.renderer.setSize(width, height);
      const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
      this.renderer.setPixelRatio(dpr);
      if (this.renderer.shadowMap) {
        this.renderer.shadowMap.enabled = true;
        if (THREE.PCFSoftShadowMap !== undefined) {
          this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }
      }
      if (THREE.ACESFilmicToneMapping !== undefined) {
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.12;
      }
      if (THREE.sRGBEncoding !== undefined) {
        this.renderer.outputEncoding = THREE.sRGBEncoding;
      }

      // Mount canvas cleanly
      if (
        this.renderer.domElement &&
        this.container &&
        typeof this.container.appendChild === 'function'
      ) {
        this.renderer.domElement.id = 'gt6-webgl-canvas';
        if (this.renderer.domElement.style) {
          this.renderer.domElement.style.display = 'block';
          this.renderer.domElement.style.width = '100%';
          this.renderer.domElement.style.height = '100%';
        }
        if (typeof this.container.querySelector === 'function') {
          const existingCanvas = this.container.querySelector('#gt6-webgl-canvas');
          if (existingCanvas && typeof existingCanvas.remove === 'function') {
            existingCanvas.remove();
          }
        }
        this.container.appendChild(this.renderer.domElement);
      }

      // 4. Environment Reflection Map via GT6PostFX.createEnvMap (with built-in fallback)
      this._initEnvironmentMap();

      // 5. Build Procedural Textures & Shared Materials
      this._buildProceduralTextures();
      this._loadPosterTexture();

      // 6. Setup Dynamic 3D Nocturnal Lighting (Moonlight + Shadows, Streetlamp Fill, Police Siren Light)
      this._setupLighting();

      // 7. Build Skybox, Nocturnal Atmosphere (GT6PostFX.createAtmosphere) & Downtown Vice City Skyline
      this._buildSkyAndSkyline();

      // 8. Build Infinite Scrolling 4-Lane Curved Wet Asphalt Highway, Realistic Vice City Buildings, Overpasses & Palms
      this._buildInfiniteHighway();

      // 9. Build Rafa & The Red Fat-Tire Electric Chopper (via GT6Models.buildRafaAndChopper + fallback)
      this._buildRafaChopper();

      // 10. Build Chasing Police Cruisers & Overhead Police Helicopter (via GT6Models + fallback)
      this._buildAmbientChasers();
      this._buildPoliceHelicopter();

      // 11. Build Particle & FX Containers
      this.particleGroup = new THREE.Group();
      this.scene.add(this.particleGroup);

      // 12. Initialize Multi-Pass Post-Processing Pipeline (GT6PostFX) & Apply Quality Preset
      this._initPostProcessing(width, height);
      this.setQuality(this.quality || 'ULTRA');

      // 13. Bind Resize Listener
      this._onWindowResize = () => this.resize();
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('resize', this._onWindowResize);
      }

      this.initialized = true;
      this._initialized = true;
      this.renderFrame(null, 0.016);
      return this;
    },

    /**
     * Create or retrieve Vice City Night Cubemap/PMREM reflection environment
     */
    _initEnvironmentMap() {
      this.envMap = null;
      if (typeof window !== 'undefined' && window.GT6PostFX) {
        try {
          if (typeof window.GT6PostFX.createEnvMap === 'function') {
            this.envMap = window.GT6PostFX.createEnvMap(this.renderer);
          }
        } catch (err) {
          console.warn('[GT6Renderer] GT6PostFX.createEnvMap fallback:', err);
        }
      }
      if (!this.envMap) {
        this.envMap = this._createFallbackEnvMap();
      }
      if (this.envMap && this.scene) {
        this.scene.environment = this.envMap;
      }
    },

    /**
     * Built-in 6-face Vice City Nocturnal CubeTexture fallback if GT6PostFX is still loading
     */
    _createFallbackEnvMap() {
      const THREE = window.THREE;
      if (!THREE || typeof document === 'undefined') return null;
      try {
        const faces = [];
        for (let i = 0; i < 6; i++) {
          const canvas = document.createElement('canvas');
          canvas.width = 128;
          canvas.height = 128;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const grad = ctx.createLinearGradient(0, 0, 0, 128);
            if (i === 2) {
              // Top (+Y): deep nocturnal sky zenith
              grad.addColorStop(0, '#05080d');
              grad.addColorStop(1, '#121a26');
            } else if (i === 3) {
              // Bottom (-Y): wet dark asphalt reflection
              grad.addColorStop(0, '#10141c');
              grad.addColorStop(1, '#080a0e');
            } else {
              // Horizon sides: realistic nocturnal skyline with warm streetlights & subtle neon
              grad.addColorStop(0, '#05080d');
              grad.addColorStop(0.46, '#121a26');
              grad.addColorStop(0.54, '#1b2432');
              grad.addColorStop(0.68, '#10141c');
              grad.addColorStop(1, '#090b10');
            }
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 128, 128);

            if (i !== 2 && i !== 3) {
              ctx.fillStyle = i % 2 === 0 ? '#ffd89c' : '#66e0ff';
              for (let b = 8; b < 120; b += 18) {
                ctx.fillRect(b, 54, 5, 22);
              }
              ctx.fillStyle = 'rgba(240, 246, 255, 0.7)';
              ctx.fillRect(16, 63, 96, 2);
            }
          }
          faces.push(canvas);
        }
        const cubeTex = new THREE.CubeTexture(faces);
        cubeTex.needsUpdate = true;
        return cubeTex;
      } catch (_) {
        return null;
      }
    },

    /**
     * Initialize Multi-Pass Post-Processing via window.GT6PostFX
     */
    _initPostProcessing(width, height) {
      this.postProcessor = null;
      if (typeof window === 'undefined' || !window.GT6PostFX) return;
      const PFX = window.GT6PostFX;

      try {
        if (typeof PFX.createPostProcessor === 'function') {
          this.postProcessor = PFX.createPostProcessor(this.renderer, this.scene, this.camera);
        } else if (typeof PFX.PostProcessor === 'function') {
          this.postProcessor = new PFX.PostProcessor(this.renderer, this.scene, this.camera);
        } else if (typeof PFX.init === 'function') {
          const res = PFX.init(this.renderer, this.scene, this.camera);
          this.postProcessor = res && typeof res.render === 'function' ? res : PFX;
        } else if (typeof PFX.render === 'function') {
          this.postProcessor = PFX;
        }

        if (this.postProcessor && typeof this.postProcessor.resize === 'function') {
          this.postProcessor.resize(width, height);
        } else if (typeof PFX.resize === 'function') {
          PFX.resize(width, height);
        }
      } catch (err) {
        console.warn('[GT6Renderer] Post-processor init fallback to direct WebGL render:', err);
        this.postProcessor = null;
      }
    },

    /**
     * Set Graphics Quality Preset ('ULTRA' | 'HIGH' | 'PERFORMANCE')
     * @param {string} preset
     * @returns {string} Active quality preset
     */
    setQuality(preset) {
      const raw = String(preset || 'ULTRA').toUpperCase().trim();
      let normalized = 'ULTRA';
      if (raw === 'HIGH' || raw === '3D HIGH') {
        normalized = 'HIGH';
      } else if (raw === 'PERFORMANCE' || raw === '60FPS' || raw === 'LOW' || raw === 'FAST') {
        normalized = 'PERFORMANCE';
      } else {
        normalized = 'ULTRA';
      }
      this.quality = normalized;

      if (this.renderer) {
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        const targetRatio =
          normalized === 'ULTRA'
            ? Math.min(dpr, 2.0)
            : normalized === 'HIGH'
            ? Math.min(dpr, 1.5)
            : 1.0;
        if (typeof this.renderer.setPixelRatio === 'function') {
          this.renderer.setPixelRatio(targetRatio);
        }
        if (this.renderer.shadowMap) {
          this.renderer.shadowMap.enabled = normalized !== 'PERFORMANCE';
          this.renderer.shadowMap.needsUpdate = true;
        }
        if (this.moonLight) {
          this.moonLight.castShadow = normalized !== 'PERFORMANCE';
        }
      }

      if (typeof window !== 'undefined' && window.GT6PostFX) {
        try {
          if (typeof window.GT6PostFX.setQuality === 'function') {
            window.GT6PostFX.setQuality(normalized, this.renderer);
          }
        } catch (_) {}
      }
      if (this.postProcessor && this.postProcessor !== window.GT6PostFX) {
        try {
          if (typeof this.postProcessor.setQuality === 'function') {
            this.postProcessor.setQuality(normalized);
          }
        } catch (_) {}
      }
      if (this.atmosphere) {
        try {
          if (typeof this.atmosphere.setQuality === 'function') {
            this.atmosphere.setQuality(normalized);
          }
        } catch (_) {}
      }

      this.resize();
      return this.quality;
    },

    cycleQuality() {
      const idx = QUALITY_PRESETS.indexOf(this.quality);
      const next = QUALITY_PRESETS[(idx + 1) % QUALITY_PRESETS.length];
      return this.setQuality(next);
    },

    getQuality() {
      return this.quality;
    },

    /**
     * Generate CanvasTextures for EDTECH, PT 13, Lightning Fender, Tire Tread,
     * Photorealistic Vice City Nocturnal Buildings, Neon Script Signs, Highway Signs & Concrete Overpass Ramps
     */
    _buildProceduralTextures() {
      const THREE = window.THREE;

      // 1. EDTECH Battery Box & Jacket Logo Texture
      const edtechCanvas = document.createElement('canvas');
      edtechCanvas.width = 512;
      edtechCanvas.height = 512;
      const ectx = edtechCanvas.getContext('2d');
      if (ectx) {
        ectx.fillStyle = '#0c0d12';
        ectx.fillRect(0, 0, 512, 512);

        ectx.strokeStyle = '#c4121a';
        ectx.lineWidth = 8;
        ectx.strokeRect(16, 16, 480, 480);

        const cx = 256;
        const cy = 265;
        ectx.save();
        ectx.translate(cx, cy);
        ectx.fillStyle = '#f2f5fa';
        for (let i = 0; i < 8; i++) {
          ectx.save();
          ectx.rotate((i * Math.PI) / 4);
          ectx.fillRect(-22, -138, 44, 42);
          ectx.restore();
        }
        ectx.beginPath();
        ectx.arc(0, 0, 108, 0, Math.PI * 2);
        ectx.fill();
        ectx.fillStyle = '#0c0d12';
        ectx.beginPath();
        ectx.arc(0, 0, 70, 0, Math.PI * 2);
        ectx.fill();
        ectx.restore();

        ectx.fillStyle = '#0c0d12';
        ectx.fillRect(46, cy - 42, 420, 84);
        ectx.font = '900 76px "Arial Black", Impact, sans-serif';
        ectx.textAlign = 'center';
        ectx.textBaseline = 'middle';
        ectx.fillStyle = '#e01b24';
        ectx.fillText('ED', cx - 88, cy + 2);
        ectx.fillStyle = '#ffffff';
        ectx.fillText('TECH', cx + 52, cy + 2);

        ectx.fillStyle = '#c4121a';
        ectx.fillRect(24, 24, 464, 58);
        ectx.fillStyle = '#ffffff';
        ectx.font = 'bold 28px Arial, sans-serif';
        ectx.fillText('LITHIUM FAT-CHOPPER 9000W', cx, 55);
      }
      this.textures.edtechBattery = new THREE.CanvasTexture(edtechCanvas);

      // 2. Rafa's Back & Chest Biker Jacket Texture ("PT 13" + "EDTECH")
      const jacketCanvas = document.createElement('canvas');
      jacketCanvas.width = 512;
      jacketCanvas.height = 512;
      const jctx = jacketCanvas.getContext('2d');
      if (jctx) {
        jctx.fillStyle = '#14151b';
        jctx.fillRect(0, 0, 512, 512);

        jctx.strokeStyle = '#b9151e';
        jctx.lineWidth = 5;
        jctx.strokeRect(22, 22, 468, 468);

        jctx.fillStyle = '#d1151f';
        fillRoundRect(jctx, 116, 46, 280, 96, 14);
        jctx.strokeStyle = '#ffffff';
        jctx.lineWidth = 4;
        jctx.strokeRect(122, 52, 268, 84);
        jctx.fillStyle = '#ffffff';
        jctx.font = '900 68px "Arial Black", Impact, sans-serif';
        jctx.textAlign = 'center';
        jctx.textBaseline = 'middle';
        jctx.fillText('PT 13', 256, 97);

        jctx.save();
        jctx.translate(256, 320);
        jctx.fillStyle = '#ffffff';
        for (let i = 0; i < 8; i++) {
          jctx.save();
          jctx.rotate((i * Math.PI) / 4);
          jctx.fillRect(-18, -115, 36, 34);
          jctx.restore();
        }
        jctx.beginPath();
        jctx.arc(0, 0, 90, 0, Math.PI * 2);
        jctx.fill();
        jctx.fillStyle = '#14151b';
        jctx.beginPath();
        jctx.arc(0, 0, 58, 0, Math.PI * 2);
        jctx.fill();
        jctx.fillRect(-180, -34, 360, 68);
        jctx.font = '900 62px "Arial Black", Impact, sans-serif';
        jctx.fillStyle = '#e01b24';
        jctx.fillText('ED', -72, 2);
        jctx.fillStyle = '#ffffff';
        jctx.fillText('TECH', 44, 2);
        jctx.restore();
      }
      this.textures.jacketBack = new THREE.CanvasTexture(jacketCanvas);

      // 3. Front Fender Red + White Lightning Decal Texture
      const fenderCanvas = document.createElement('canvas');
      fenderCanvas.width = 256;
      fenderCanvas.height = 256;
      const fctx = fenderCanvas.getContext('2d');
      if (fctx) {
        fctx.fillStyle = '#c4121a';
        fctx.fillRect(0, 0, 256, 256);
        fctx.fillStyle = '#ffffff';
        fctx.beginPath();
        fctx.moveTo(40, 220);
        fctx.lineTo(135, 110);
        fctx.lineTo(105, 110);
        fctx.lineTo(215, 25);
        fctx.lineTo(130, 140);
        fctx.lineTo(160, 140);
        fctx.closePath();
        fctx.fill();
      }
      this.textures.fenderLightning = new THREE.CanvasTexture(fenderCanvas);

      // 4. Fat Tire Tread Texture
      const tireCanvas = document.createElement('canvas');
      tireCanvas.width = 256;
      tireCanvas.height = 256;
      const tctx = tireCanvas.getContext('2d');
      if (tctx) {
        tctx.fillStyle = '#141619';
        tctx.fillRect(0, 0, 256, 256);
        tctx.strokeStyle = '#24272e';
        tctx.lineWidth = 8;
        for (let y = 0; y < 256; y += 32) {
          tctx.beginPath();
          tctx.moveTo(0, y);
          tctx.lineTo(128, y + 18);
          tctx.lineTo(256, y);
          tctx.stroke();
        }
      }
      this.textures.tireTread = new THREE.CanvasTexture(tireCanvas);
      this.textures.tireTread.wrapS = THREE.RepeatWrapping;
      this.textures.tireTread.wrapT = THREE.RepeatWrapping;
      this.textures.tireTread.repeat.set(1, 3);

      // 5. Perforated Disc Brake Rotor Texture
      const discCanvas = document.createElement('canvas');
      discCanvas.width = 256;
      discCanvas.height = 256;
      const dctx = discCanvas.getContext('2d');
      if (dctx) {
        dctx.clearRect(0, 0, 256, 256);
        dctx.translate(128, 128);
        dctx.fillStyle = '#c4cbd4';
        dctx.beginPath();
        dctx.arc(0, 0, 118, 0, Math.PI * 2);
        dctx.fill();
        dctx.globalCompositeOperation = 'destination-out';
        dctx.beginPath();
        dctx.arc(0, 0, 48, 0, Math.PI * 2);
        dctx.fill();
        for (let i = 0; i < 12; i++) {
          const angle = (i * Math.PI * 2) / 12;
          dctx.beginPath();
          dctx.arc(Math.cos(angle) * 85, Math.sin(angle) * 85, 8, 0, Math.PI * 2);
          dctx.fill();
          dctx.beginPath();
          dctx.arc(Math.cos(angle + 0.15) * 66, Math.sin(angle + 0.15) * 66, 7, 0, Math.PI * 2);
          dctx.fill();
        }
      }
      this.textures.discBrake = new THREE.CanvasTexture(discCanvas);

      // 6. Photorealistic Vice City Architectural Facade & Emissive Window Textures
      // Dark architectural concrete, stucco & glass (#181c24, #22252e, #1a1f28) with warm amber/soft-white interior rooms
      const buildingConfigs = [
        { wall: '#181c24', mullion: '#12151c', sign: 'Vice City', neon: '#ff4d88', script: true, seed: 11 },
        { wall: '#22252e', mullion: '#171a22', sign: 'HOTEL', neon: '#66e0ff', script: false, seed: 23 },
        { wall: '#1a1f28', mullion: '#13171e', sign: 'OCEAN', neon: '#ff4d88', script: false, seed: 37 },
        { wall: '#191d25', mullion: '#11141a', sign: 'EDTECH', neon: '#ffe0a3', script: false, seed: 51 },
        { wall: '#20242d', mullion: '#151820', sign: 'Vice City', neon: '#ff4d88', script: true, seed: 67 },
        { wall: '#171b23', mullion: '#101319', sign: 'HOTEL', neon: '#66e0ff', script: false, seed: 83 }
      ];

      this.textures.buildingPairs = buildingConfigs.map((cfg) =>
        this._createRealisticBuildingTextures(cfg)
      );
      this.textures.buildings = this.textures.buildingPairs.map((p) => p.map);

      // Dedicated vertical/facade Neon Sign panel textures matching the user's video ("Vice City" script, "HOTEL", "OCEAN")
      this.textures.viceCityScriptSign = this._createNeonSignPanelTexture(
        'Vice City',
        '#ff4d88',
        true
      );
      this.textures.hotelNeonSign = this._createNeonSignPanelTexture('HOTEL', '#66e0ff', false);
      this.textures.oceanNeonSign = this._createNeonSignPanelTexture('OCEAN', '#ff4d88', false);

      // 7. Realistic Green/Slate Highway Overpass Directional Signs
      this.textures.gantrySignLeft = this._createHighwaySignTexture(
        '⬆️ VICE CITY DOWNTOWN',
        'OCEAN DRIVE • BAYSHORE BLVD',
        '#d8e4f0',
        '#0f2922'
      );
      this.textures.gantrySignRight = this._createHighwaySignTexture(
        '⬆️ VIA EXPRESSA I-95',
        'EDTECH PT-13 • AEROPORTO',
        '#ffd166',
        '#162230'
      );

      // 8. Overpass Concrete & Yellow Hazard Strip Ramp Texture
      this.textures.rampDeck = this._createRampChevronTexture();

      // 9. Police Door Decal Texture
      const copCanvas = document.createElement('canvas');
      copCanvas.width = 512;
      copCanvas.height = 256;
      const cctx = copCanvas.getContext('2d');
      if (cctx) {
        cctx.fillStyle = '#0b0d12';
        cctx.fillRect(0, 0, 512, 256);
        cctx.fillStyle = '#f2f5f9';
        cctx.fillRect(110, 0, 292, 256);
        cctx.fillStyle = '#0b0d12';
        cctx.font = '900 66px "Arial Black", Impact, sans-serif';
        cctx.textAlign = 'center';
        cctx.fillText('POLICE', 256, 128);
        cctx.fillStyle = '#b9151e';
        cctx.font = 'bold 26px Arial, sans-serif';
        cctx.fillText('VICE CITY INTERCEPTOR', 256, 174);
      }
      this.textures.policeSide = new THREE.CanvasTexture(copCanvas);

      // 10. Fallback Poster Billboard Texture
      this.textures.posterFallback = this._createFallbackPosterTexture();
      this.posterTexture = this.textures.posterFallback;
    },

    /**
     * Create paired Diffuse (`map`) and Selective Emissive (`emissiveMap`) textures
     * for realistic GTA 6 nocturnal concrete, stucco, and glass skyscrapers.
     */
    _createRealisticBuildingTextures(cfg) {
      const THREE = window.THREE;
      const w = 256;
      const h = 512;

      const diffCanvas = document.createElement('canvas');
      diffCanvas.width = w;
      diffCanvas.height = h;
      const dctx = diffCanvas.getContext('2d');

      const emCanvas = document.createElement('canvas');
      emCanvas.width = w;
      emCanvas.height = h;
      const ectx = emCanvas.getContext('2d');

      if (dctx && ectx) {
        // Diffuse: dark architectural concrete / stucco wall
        dctx.fillStyle = cfg.wall || '#181c24';
        dctx.fillRect(0, 0, w, h);

        // Emissive: pure black background so concrete walls NEVER self-glow!
        ectx.fillStyle = '#000000';
        ectx.fillRect(0, 0, w, h);

        // Subtle architectural concrete floor slab bands & vertical mullions on diffuse
        dctx.fillStyle = cfg.mullion || '#12151c';
        for (let x = 0; x < w; x += 64) {
          dctx.fillRect(x, 0, 8, h);
        }
        for (let y = 76; y < h; y += 38) {
          dctx.fillRect(0, y, w, 6);
        }

        // Top architectural parapet & recessed mechanical floor
        dctx.fillStyle = '#11141b';
        dctx.fillRect(0, 0, w, 72);
        dctx.fillStyle = '#282e3b';
        dctx.fillRect(0, 70, w, 5);

        // Subtle neon sign header mounted on upper facade
        dctx.fillStyle = '#0d1016';
        dctx.fillRect(28, 16, 200, 44);
        dctx.strokeStyle = '#2b3240';
        dctx.lineWidth = 2;
        dctx.strokeRect(28, 16, 200, 44);

        const fontSpec = cfg.script
          ? 'italic bold 28px Georgia, "Times New Roman", serif'
          : '900 22px "Arial Black", Impact, sans-serif';

        dctx.fillStyle = cfg.neon || '#ff4d88';
        dctx.font = fontSpec;
        dctx.textAlign = 'center';
        dctx.textBaseline = 'middle';
        dctx.fillText(cfg.sign || 'Vice City', 128, 38);

        ectx.fillStyle = cfg.neon || '#ff4d88';
        ectx.font = fontSpec;
        ectx.textAlign = 'center';
        ectx.textBaseline = 'middle';
        ectx.fillText(cfg.sign || 'Vice City', 128, 38);

        // Realistic apartment / hotel / office windows (warm amber, soft white, cool glass, and dark unlit rooms)
        const cols = 4;
        const rows = 11;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const wx = 14 + c * 62;
            const wy = 84 + r * 38;
            const ww = 42;
            const wh = 24;

            // Dark recessed window glass frame on diffuse
            dctx.fillStyle = '#0c0f15';
            dctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);

            const rnd = seededRandom(cfg.seed * 100 + r * 17 + c * 31);
            const isLit = rnd > 0.46; // ~54% of windows lit, 46% dark nocturnal glass

            if (!isLit) {
              dctx.fillStyle = '#121822';
              dctx.fillRect(wx, wy, ww, wh);
            } else {
              const toneRnd = seededRandom(cfg.seed * 200 + r * 29 + c * 13);
              let winDiff = '#e6c28a';
              let winEm = '#b88e52';
              if (toneRnd < 0.48) {
                // Warm amber interior lamp light
                winDiff = '#f5cfa0';
                winEm = '#c99b62';
              } else if (toneRnd < 0.82) {
                // Soft warm-white hotel/office ceiling light
                winDiff = '#eee6d8';
                winEm = '#b5ab99';
              } else {
                // Cool daylight-white monitor/fluorescent interior
                winDiff = '#cce0f5';
                winEm = '#7fa0c4';
              }

              dctx.fillStyle = winDiff;
              dctx.fillRect(wx, wy, ww, wh);

              ectx.fillStyle = winEm;
              ectx.fillRect(wx, wy, ww, wh);

              // Realistic half-drawn Venetian blinds or window mullions
              dctx.fillStyle = 'rgba(16, 20, 28, 0.55)';
              ectx.fillStyle = 'rgba(0, 0, 0, 0.55)';
              if (rnd > 0.78) {
                dctx.fillRect(wx, wy, ww, wh * 0.42);
                ectx.fillRect(wx, wy, ww, wh * 0.42);
              }
              // Vertical window center mullion
              dctx.fillRect(wx + ww * 0.5 - 1, wy, 2, wh);
              ectx.fillRect(wx + ww * 0.5 - 1, wy, 2, wh);
            }
          }
        }
      }

      const mapTex = new THREE.CanvasTexture(diffCanvas);
      const emTex = new THREE.CanvasTexture(emCanvas);
      if (THREE.sRGBEncoding !== undefined) {
        mapTex.encoding = THREE.sRGBEncoding;
        emTex.encoding = THREE.sRGBEncoding;
      }
      return { map: mapTex, emissiveMap: emTex };
    },

    /**
     * Create realistic facade neon sign texture ("Vice City" script, "HOTEL", "OCEAN")
     */
    _createNeonSignPanelTexture(text, neonColor, isScript) {
      const THREE = window.THREE;
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0b0e14';
        ctx.fillRect(0, 0, 256, 128);

        ctx.strokeStyle = neonColor;
        ctx.lineWidth = 4;
        ctx.strokeRect(8, 8, 240, 112);

        ctx.shadowColor = neonColor;
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#ffffff';
        ctx.font = isScript
          ? 'italic bold 52px Georgia, "Times New Roman", serif'
          : '900 48px "Arial Black", Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 64);

        ctx.fillStyle = neonColor;
        ctx.fillText(text, 128, 64);
      }
      return new THREE.CanvasTexture(canvas);
    },

    _createHighwaySignTexture(title, subtitle, borderColor, bgColor) {
      const THREE = window.THREE;
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 192;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = bgColor || '#0f2922';
        ctx.fillRect(0, 0, 512, 192);

        ctx.strokeStyle = borderColor || '#d8e4f0';
        ctx.lineWidth = 8;
        ctx.strokeRect(10, 10, 492, 172);

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 32px "Arial Black", Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, 256, 72);

        ctx.fillStyle = borderColor || '#d8e4f0';
        ctx.font = 'bold 23px Arial, sans-serif';
        ctx.fillText(subtitle, 256, 132);
      }
      return new THREE.CanvasTexture(canvas);
    },

    _createRampChevronTexture() {
      const THREE = window.THREE;
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Realistic dark weathered concrete ramp deck with yellow/amber construction chevrons
        ctx.fillStyle = '#1e222b';
        ctx.fillRect(0, 0, 256, 512);

        // Reflective amber/yellow safety side borders
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(0, 0, 16, 512);
        ctx.fillRect(240, 0, 16, 512);

        for (let y = 36; y < 480; y += 72) {
          ctx.fillStyle = y % 144 === 36 ? '#fbbf24' : '#e2e8f0';
          ctx.beginPath();
          ctx.moveTo(128, y);
          ctx.lineTo(210, y + 40);
          ctx.lineTo(210, y + 60);
          ctx.lineTo(128, y + 20);
          ctx.lineTo(46, y + 60);
          ctx.lineTo(46, y + 40);
          ctx.closePath();
          ctx.fill();
        }
      }
      return new THREE.CanvasTexture(canvas);
    },

    _createFallbackPosterTexture() {
      const THREE = window.THREE;
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const grad = ctx.createLinearGradient(0, 0, 512, 256);
        grad.addColorStop(0, '#101520');
        grad.addColorStop(0.5, '#2b1628');
        grad.addColorStop(1, '#182232');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 256);

        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 6;
        ctx.strokeRect(10, 10, 492, 236);

        ctx.fillStyle = '#fbbf24';
        ctx.font = '900 30px "Arial Black", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('★ ★ ★ ★ ★ ★', 485, 50);

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.font = '900 54px "Arial Black", Impact, sans-serif';
        ctx.fillText('GT6 RAFA', 28, 110);
        ctx.fillStyle = '#ff4d88';
        ctx.font = '900 32px "Arial Black", Impact, sans-serif';
        ctx.fillText('EDTECH • PT 13 EDITION', 28, 162);
        ctx.fillStyle = '#66e0ff';
        ctx.font = 'bold 23px Arial, sans-serif';
        ctx.fillText('VICE CITY EXPRESSWAY • $1.956.898', 28, 212);
      }
      return new THREE.CanvasTexture(canvas);
    },

    _loadPosterTexture() {
      const THREE = window.THREE;
      if (!THREE || !THREE.TextureLoader) return;
      try {
        const loader = new THREE.TextureLoader();
        loader.load(
          './assets/rafa-poster.jpg',
          (tex) => {
            if (THREE.sRGBEncoding !== undefined) {
              tex.encoding = THREE.sRGBEncoding;
            }
            this.posterTexture = tex;
            if (this.materials.posterBillboard) {
              this.materials.posterBillboard.map = tex;
              this.materials.posterBillboard.needsUpdate = true;
            }
          },
          undefined,
          () => {
            // Keep procedural fallback poster on error
          }
        );
      } catch (_) {}
    },

    /**
     * Setup Photorealistic GTA 6 Nocturnal 3D Lighting:
     * - Cool pale moonlight DirectionalLight with PCFSoftShadowMap
     * - Nocturnal sky/wet-asphalt HemisphereLight
     * - Warm-white & cool-white streetlamp urban fill lights
     * - Alternating Red/Blue Police Siren PointLight illuminating Rafa from behind
     */
    _setupLighting() {
      const THREE = window.THREE;

      this.hemiLight = new THREE.HemisphereLight(0x7d97b8, 0x12161f, 0.78);
      this.scene.add(this.hemiLight);

      this.moonLight = new THREE.DirectionalLight(0xcfe0f5, 1.05);
      this.moonLight.position.set(18, 46, 22);
      this.moonLight.castShadow = true;
      if (this.moonLight.shadow) {
        this.moonLight.shadow.mapSize.width = 1024;
        this.moonLight.shadow.mapSize.height = 1024;
        if (this.moonLight.shadow.camera) {
          this.moonLight.shadow.camera.near = 5;
          this.moonLight.shadow.camera.far = 130;
          this.moonLight.shadow.camera.left = -22;
          this.moonLight.shadow.camera.right = 22;
          this.moonLight.shadow.camera.top = 25;
          this.moonLight.shadow.camera.bottom = -55;
        }
        this.moonLight.shadow.bias = -0.0005;
      }
      this.scene.add(this.moonLight);

      // Realistic streetlamp warm-white and cool-white avenue fill lights
      this.pinkFillLight = new THREE.PointLight(0xffe6bf, 1.2, 38);
      this.pinkFillLight.position.set(-9.5, 6.2, -5);
      this.scene.add(this.pinkFillLight);

      this.cyanFillLight = new THREE.PointLight(0xd9ecff, 1.15, 38);
      this.cyanFillLight.position.set(9.5, 6.2, -5);
      this.scene.add(this.cyanFillLight);

      // Alternating Red/Blue Police Siren PointLight illuminating Rafa's PT-13 jacket & chrome from behind
      this.policeSirenLight = new THREE.PointLight(0xff1722, 2.0, 24);
      this.policeSirenLight.position.set(0, 2.2, 4.5);
      this.scene.add(this.policeSirenLight);
    },

    /**
     * Build GTA 6 Nocturnal Sky Dome (via GT6PostFX.createAtmosphere), Realistic Pale Moon, and Downtown Skyline
     */
    _buildSkyAndSkyline() {
      const THREE = window.THREE;
      this.skylineGroup = new THREE.Group();
      this.scene.add(this.skylineGroup);

      // 1. Integrate GT6PostFX.createAtmosphere(this.scene) for GLSL Nocturnal Sky Dome & Mist
      this.atmosphere = null;
      if (typeof window !== 'undefined' && window.GT6PostFX) {
        try {
          if (typeof window.GT6PostFX.createAtmosphere === 'function') {
            this.atmosphere = window.GT6PostFX.createAtmosphere(this.scene, this.camera);
          }
        } catch (err) {
          console.warn('[GT6Renderer] GT6PostFX.createAtmosphere fallback:', err);
        }
      }

      // 2. Subtle Tiny Nocturnal Stars
      const starCount = 260;
      const starGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 340;
        positions[i * 3 + 1] = 34 + Math.random() * 110;
        positions[i * 3 + 2] = -155 - Math.random() * 140;
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const starMat = new THREE.PointsMaterial({
        color: 0xd8e4f2,
        size: 0.42,
        transparent: true,
        opacity: 0.48
      });
      this.starField = new THREE.Points(starGeo, starMat);
      this.skylineGroup.add(this.starField);

      // 3. Realistic Pale Nocturnal Moon + Soft Atmospheric Halo
      const moonGeo = new THREE.SphereGeometry(7.2, 24, 24);
      const moonMat = new THREE.MeshBasicMaterial({ color: 0xf4f6fb });
      const moon = new THREE.Mesh(moonGeo, moonMat);
      moon.position.set(-46, 72, -230);
      this.skylineGroup.add(moon);

      const haloGeo = new THREE.RingGeometry(7.3, 12.5, 32);
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0x8aa2c0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.14
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.copy(moon.position);
      this.skylineGroup.add(halo);

      // 4. Distant Downtown Skyscrapers Skyline
      const towerMat = new THREE.MeshStandardMaterial({
        color: 0x141922,
        roughness: 0.3,
        metalness: 0.72,
        envMap: this.envMap,
        envMapIntensity: 1.1
      });
      const warmCrownMat = new THREE.MeshBasicMaterial({ color: 0xffe4b5 });
      const iceCrownMat = new THREE.MeshBasicMaterial({ color: 0x66e0ff });
      const pinkCrownMat = new THREE.MeshBasicMaterial({ color: 0xff4d88 });

      // Central iconic cylindrical stepped skyscraper
      const mainTower = new THREE.Group();
      const baseTier = new THREE.Mesh(new THREE.CylinderGeometry(8.8, 9.8, 68, 24), towerMat);
      baseTier.position.y = 34;
      mainTower.add(baseTier);
      const midTier = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 7.4, 28, 24), towerMat);
      midTier.position.y = 78;
      mainTower.add(midTier);
      const topCrown = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 5.0, 24), warmCrownMat);
      topCrown.position.y = 93.5;
      mainTower.add(topCrown);
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.38, 15, 8), towerMat);
      spire.position.y = 103;
      mainTower.add(spire);
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff2222 })
      );
      beacon.position.y = 111;
      mainTower.add(beacon);
      mainTower.position.set(18, -5, -220);
      this.skylineGroup.add(mainTower);

      // Surrounding dark glass & concrete skyline towers
      for (let i = -9; i <= 9; i++) {
        if (i === 1) continue;
        const h = 28 + Math.abs(Math.sin(i * 1.7)) * 50;
        const w = 8 + (Math.abs(i * 3) % 6);
        const zOff = -225 - (Math.abs(i) % 3) * 14;
        const bMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), towerMat);
        bMesh.position.set(i * 15, h / 2 - 4, zOff);
        this.skylineGroup.add(bMesh);

        const trimMat = i % 3 === 0 ? warmCrownMat : i % 2 === 0 ? iceCrownMat : pinkCrownMat;
        const roofStrip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.25, 0.55, w + 0.25), trimMat);
        roofStrip.position.set(bMesh.position.x, h - 4, zOff);
        this.skylineGroup.add(roofStrip);
      }
    },

    /**
     * Build the Infinite Scrolling 4-Lane Curved Wet Asphalt Highway
     * Subdivided into `ROAD_SUB_SLICES` per segment so curves deform seamlessly with zero gaps!
     */
    _buildInfiniteHighway() {
      const THREE = window.THREE;

      this.wetAsphaltTextures = null;
      if (typeof window !== 'undefined' && window.GT6PostFX) {
        try {
          if (typeof window.GT6PostFX.createWetAsphaltTextures === 'function') {
            this.wetAsphaltTextures = window.GT6PostFX.createWetAsphaltTextures(this.renderer);
          }
        } catch (err) {
          console.warn('[GT6Renderer] GT6PostFX.createWetAsphaltTextures fallback:', err);
        }
      }

      const wetTex = this.wetAsphaltTextures || {};
      let asphaltMat;
      if (wetTex.material && wetTex.material.isMaterial) {
        asphaltMat = wetTex.material;
        if (this.envMap && !asphaltMat.envMap) {
          asphaltMat.envMap = this.envMap;
          asphaltMat.envMapIntensity = 1.65;
        }
      } else {
        const matConfig = {
          color: wetTex.map ? 0xffffff : 0x111318,
          roughness: wetTex.roughnessMap ? 0.78 : 0.24,
          metalness: 0.45,
          envMap: this.envMap,
          envMapIntensity: 1.65
        };
        if (wetTex.map) matConfig.map = wetTex.map;
        if (wetTex.roughnessMap) matConfig.roughnessMap = wetTex.roughnessMap;
        if (wetTex.bumpMap) {
          matConfig.bumpMap = wetTex.bumpMap;
          matConfig.bumpScale = 0.018;
        }
        if (wetTex.normalMap) {
          matConfig.normalMap = wetTex.normalMap;
        }
        asphaltMat = new THREE.MeshStandardMaterial(matConfig);
      }
      this.materials.wetAsphalt = asphaltMat;

      // Realistic dark specular water puddle material (reflects streetlamps, buildings & police strobes)
      const wetPuddleMat = new THREE.MeshStandardMaterial({
        color: 0x0b0e14,
        roughness: 0.03,
        metalness: 0.92,
        envMap: this.envMap,
        envMapIntensity: 2.35,
        transparent: true,
        opacity: 0.74
      });

      const sidewalkMat = new THREE.MeshStandardMaterial({
        color: 0x1a1e26,
        roughness: 0.68,
        metalness: 0.18,
        envMap: this.envMap,
        envMapIntensity: 0.65
      });
      const concreteCurbMat = new THREE.MeshStandardMaterial({
        color: 0x2a2f3b,
        roughness: 0.62,
        metalness: 0.2,
        envMap: this.envMap
      });
      const whiteLineMat = new THREE.MeshBasicMaterial({ color: 0xdce4f0 });
      const yellowLineMat = new THREE.MeshBasicMaterial({ color: 0xe0a816 });

      this.materials.posterBillboard = new THREE.MeshBasicMaterial({
        map: this.posterTexture
      });

      const sliceLen = SEGMENT_LENGTH / ROAD_SUB_SLICES; // 10m per sub-slice
      const sliceOverlap = 0.45; // overlap eliminates any micro-seam when curving

      this.roadSegments = [];
      for (let i = 0; i < NUM_ROAD_SEGMENTS; i++) {
        const segGroup = new THREE.Group();
        const zPos = 25 - i * SEGMENT_LENGTH;
        segGroup.position.z = zPos;
        segGroup.userData.subSlices = [];
        segGroup.userData.sceneryItems = [];

        // Build 4 subdivided 10m road slices per 40m segment so `roadCurve` bends the road smoothly
        for (let s = 0; s < ROAD_SUB_SLICES; s++) {
          const zLocal = -SEGMENT_LENGTH / 2 + (s + 0.5) * sliceLen;
          const sliceGroup = new THREE.Group();
          sliceGroup.position.z = zLocal;
          sliceGroup.userData.zLocal = zLocal;

          // 1. Wet dark asphalt road surface
          const roadMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(ROAD_WIDTH, sliceLen + sliceOverlap),
            asphaltMat
          );
          roadMesh.rotation.x = -Math.PI / 2;
          roadMesh.receiveShadow = true;
          sliceGroup.add(roadMesh);

          // 2. Center double yellow line (x = 0) & dashed lane dividers (x = -3, x = +3)
          const centerLineL = new THREE.Mesh(
            new THREE.PlaneGeometry(0.1, sliceLen + sliceOverlap),
            yellowLineMat
          );
          centerLineL.rotation.x = -Math.PI / 2;
          centerLineL.position.set(-0.12, 0.014, 0);
          sliceGroup.add(centerLineL);

          const centerLineR = new THREE.Mesh(
            new THREE.PlaneGeometry(0.1, sliceLen + sliceOverlap),
            yellowLineMat
          );
          centerLineR.rotation.x = -Math.PI / 2;
          centerLineR.position.set(0.12, 0.014, 0);
          sliceGroup.add(centerLineR);

          [-2.5, 2.5].forEach((dOffset) => {
            [-3.0, 3.0].forEach((dividerX) => {
              const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 2.3), whiteLineMat);
              dash.rotation.x = -Math.PI / 2;
              dash.position.set(dividerX, 0.014, dOffset);
              sliceGroup.add(dash);
            });
          });

          // 3. Realistic Specular Rain Puddles along the curbs & lanes
          if (s % 2 === 0) {
            const leftPuddle = new THREE.Mesh(
              new THREE.CircleGeometry(1.1 + (s % 3) * 0.3, 16),
              wetPuddleMat
            );
            leftPuddle.rotation.x = -Math.PI / 2;
            leftPuddle.scale.set(0.75, 2.2, 1);
            leftPuddle.position.set(-5.6, 0.012, 0);
            sliceGroup.add(leftPuddle);

            const rightPuddle = new THREE.Mesh(
              new THREE.CircleGeometry(1.1 + ((s + 1) % 3) * 0.3, 16),
              wetPuddleMat
            );
            rightPuddle.rotation.x = -Math.PI / 2;
            rightPuddle.scale.set(0.75, 2.2, 1);
            rightPuddle.position.set(5.6, 0.012, 0);
            sliceGroup.add(rightPuddle);
          }

          // 4. Realistic Concrete Curbs & Wet Concrete Sidewalks
          [-1, 1].forEach((side) => {
            const curb = new THREE.Mesh(
              new THREE.BoxGeometry(0.45, 0.24, sliceLen + sliceOverlap),
              concreteCurbMat
            );
            curb.position.set(side * (ROAD_WIDTH / 2 + 0.22), 0.12, 0);
            sliceGroup.add(curb);

            const walk = new THREE.Mesh(
              new THREE.BoxGeometry(18, 0.2, sliceLen + sliceOverlap),
              sidewalkMat
            );
            walk.position.set(side * (ROAD_WIDTH / 2 + 9.2), 0.1, 0);
            walk.receiveShadow = true;
            sliceGroup.add(walk);
          });

          segGroup.add(sliceGroup);
          segGroup.userData.subSlices.push(sliceGroup);
        }

        // 5. Realistic Vice City Buildings, Palm Trees, Streetlamps & Concrete Highway Overpasses
        this._populateSegmentScenery(segGroup, i);

        this.scene.add(segGroup);
        this.roadSegments.push(segGroup);
      }
    },

    _registerSceneryItem(segGroup, obj3d, baseX, zLocal, baseRotY = 0) {
      obj3d.position.x = baseX;
      obj3d.position.z = zLocal;
      obj3d.rotation.y = baseRotY;
      obj3d.userData.baseX = baseX;
      obj3d.userData.zLocal = zLocal;
      obj3d.userData.baseRotY = baseRotY;
      segGroup.add(obj3d);
      if (segGroup.userData && Array.isArray(segGroup.userData.sceneryItems)) {
        segGroup.userData.sceneryItems.push(obj3d);
      }
    },

    _populateSegmentScenery(segGroup, segIndex) {
      // 1. Dark Green Nocturnal Palm Trees illuminated by streetlamps
      const palmLocations = [-14, 0, 14];
      palmLocations.forEach((zLocal, idx) => {
        [-1, 1].forEach((side) => {
          const palm = this._createPalmTree();
          palm.position.y = 0.2;
          const rotY = (segIndex + idx) * 1.15 * side;
          this._registerSceneryItem(segGroup, palm, side * 8.45, zLocal, rotY);
        });
      });

      // 2. Realistic Warm-White / Cool-White Streetlamps at zLocal = -8 and +8
      [-8, 8].forEach((zLocal, lIdx) => {
        [-1, 1].forEach((side) => {
          const lamp = this._createStreetLamp(side, (segIndex + lIdx) % 2 === 0);
          lamp.position.y = 0.2;
          this._registerSceneryItem(segGroup, lamp, side * 7.55, zLocal, 0);
        });
      });

      // 3. Realistic Vice City Concrete, Stucco & Glass Skyscrapers with warm windows & neon signage
      [-1, 1].forEach((side, sIdx) => {
        const hotel1 = this._createArtDecoHotel(segIndex, sIdx, side, -9.5);
        this._registerSceneryItem(segGroup, hotel1, 0, -9.5, 0);

        const hotel2 = this._createArtDecoHotel(segIndex + 2, sIdx + 1, side, 9.5);
        this._registerSceneryItem(segGroup, hotel2, 0, 9.5, 0);
      });

      // 4. Concrete Highway Overpass Bridge / Directional Portal (matches 0:05-0:06 of the user's video)
      if (segIndex % 2 === 0) {
        const gantry = this._createHighwayBillboardGantry(segIndex);
        this._registerSceneryItem(segGroup, gantry, 0, 0, 0);
      }
    },

    /**
     * Build a Realistic Vice City Nocturnal Concrete, Stucco & Glass Building
     * with warm interior lighting, dark recessed architectural balconies, and video-faithful neon signs
     */
    _createArtDecoHotel(segIndex, sIdx, side) {
      const THREE = window.THREE;
      const hotelGroup = new THREE.Group();

      const pairIdx = (segIndex * 2 + sIdx) % this.textures.buildingPairs.length;
      const texPair = this.textures.buildingPairs[pairIdx];

      // Realistic nocturnal facade colours (#181c24, #22252e, #1a1f28)
      const wallTints = [0x181c24, 0x22252e, 0x1a1f28, 0x1d212a];
      const wallHex = wallTints[(segIndex + sIdx) % wallTints.length];

      // Subtle neon tube accents matching the video (soft magenta #ff4d88, ice-blue #66e0ff, warm amber #ffd28e)
      const neonPalette = [0xff4d88, 0x66e0ff, 0xffd28e];
      const primaryColor = neonPalette[(segIndex + sIdx) % neonPalette.length];

      const bMat = new THREE.MeshStandardMaterial({
        map: texPair.map,
        roughness: 0.62,
        metalness: 0.22,
        emissive: 0xffffff,
        emissiveMap: texPair.emissiveMap,
        emissiveIntensity: 0.58,
        envMap: this.envMap,
        envMapIntensity: 0.85
      });
      const accentNeonMat = new THREE.MeshBasicMaterial({ color: primaryColor });
      const darkConcreteMat = new THREE.MeshStandardMaterial({
        color: wallHex,
        roughness: 0.75,
        metalness: 0.15,
        envMap: this.envMap,
        envMapIntensity: 0.5
      });
      const balconyGlassMat = new THREE.MeshStandardMaterial({
        color: 0x121822,
        roughness: 0.15,
        metalness: 0.8,
        envMap: this.envMap
      });

      const height = 22 + ((segIndex * 7 + sIdx * 5) % 18);
      const width = 11.4;
      const depth = 16.4;
      const xCenter = side * 16.9;

      // Main building tower block (positioned at local z = 0 relative to hotelGroup)
      const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), bMat);
      building.position.set(xCenter, height / 2, 0);
      hotelGroup.add(building);

      // Rooftop mechanical penthouse & subtle cornice trim
      const tier1 = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.72, 2.2, depth * 0.72),
        darkConcreteMat
      );
      tier1.position.set(xCenter, height + 1.1, 0);
      hotelGroup.add(tier1);

      const tierNeonTrim = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.74, 0.16, depth * 0.74),
        accentNeonMat
      );
      tierNeonTrim.position.set(xCenter, height + 2.24, 0);
      hotelGroup.add(tierNeonTrim);

      // Dark architectural concrete pilasters / mullions along the street-facing facade
      const facadeX = xCenter - side * (width / 2 + 0.14);
      [-depth * 0.42, -depth * 0.14, depth * 0.14, depth * 0.42].forEach((fz) => {
        const pilaster = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, height, 0.42),
          darkConcreteMat
        );
        pilaster.position.set(facadeX, height / 2, fz);
        hotelGroup.add(pilaster);
      });

      // Recessed horizontal concrete balcony slabs on upper floors
      for (let by = 6.5; by < height - 3; by += 4.5) {
        const balconySlab = new THREE.Mesh(
          new THREE.BoxGeometry(0.65, 0.18, depth * 0.82),
          darkConcreteMat
        );
        balconySlab.position.set(facadeX - side * 0.25, by, 0);
        hotelGroup.add(balconySlab);

        const railing = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.55, depth * 0.8),
          balconyGlassMat
        );
        railing.position.set(facadeX - side * 0.52, by + 0.34, 0);
        hotelGroup.add(railing);
      }

      // Specific video-faithful Neon Sign Board mounted on the street facade ("Vice City" script, "HOTEL", "OCEAN")
      const signSelect = (segIndex + sIdx) % 3;
      const signTex =
        signSelect === 0
          ? this.textures.viceCityScriptSign
          : signSelect === 1
          ? this.textures.hotelNeonSign
          : this.textures.oceanNeonSign;
      const signPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(3.8, 1.9),
        new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide })
      );
      signPlane.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      signPlane.position.set(facadeX - side * 0.36, 8.8, 0);
      hotelGroup.add(signPlane);

      // Street-level warm architectural entrance canopy
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.22, 5.0), darkConcreteMat);
      canopy.position.set(facadeX - side * 0.7, 3.3, 0);
      hotelGroup.add(canopy);

      const canopyLightStrip = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.06, 4.6),
        new THREE.MeshBasicMaterial({ color: 0xffe4b5 })
      );
      canopyLightStrip.position.set(facadeX - side * 0.7, 3.17, 0);
      hotelGroup.add(canopyLightStrip);

      return hotelGroup;
    },

    /**
     * Build a Realistic Nocturnal Vice City Palm Tree illuminated by streetlamps
     */
    _createPalmTree() {
      const THREE = window.THREE;
      const group = new THREE.Group();
      const trunkMat = new THREE.MeshStandardMaterial({
        color: 0x3b312a,
        roughness: 0.9
      });
      const frondMat = new THREE.MeshStandardMaterial({
        color: 0x153b24,
        emissive: 0x041209,
        roughness: 0.52,
        metalness: 0.12,
        side: THREE.DoubleSide
      });

      let curX = 0;
      let curY = 0;
      for (let s = 0; s < 7; s++) {
        const rBottom = 0.27 - s * 0.023;
        const rTop = 0.24 - s * 0.023;
        const seg = new THREE.Mesh(
          new THREE.CylinderGeometry(rTop, rBottom, 1.05, 10),
          trunkMat
        );
        seg.position.set(curX, curY + 0.5, 0);
        seg.rotation.z = s * 0.04;
        group.add(seg);
        curY += 0.96;
        curX -= s * 0.04;
      }

      const crown = new THREE.Group();
      crown.position.set(curX, curY, 0);
      for (let f = 0; f < 9; f++) {
        const angle = (f * Math.PI * 2) / 9;
        const frondPivot = new THREE.Group();
        frondPivot.rotation.y = angle;

        const innerLeaf = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.46), frondMat);
        innerLeaf.position.set(0.68, -0.05, 0);
        innerLeaf.rotation.z = -0.18;
        frondPivot.add(innerLeaf);

        const outerLeaf = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.04, 0.34), frondMat);
        outerLeaf.position.set(1.95, -0.48, 0);
        outerLeaf.rotation.z = -0.52;
        frondPivot.add(outerLeaf);

        crown.add(frondPivot);
      }
      group.add(crown);
      return group;
    },

    /**
     * Build a Realistic Warm-White / Cool-White Highway Streetlamp
     */
    _createStreetLamp(side, isWarmWhite = true) {
      const THREE = window.THREE;
      const group = new THREE.Group();
      const poleMat = new THREE.MeshStandardMaterial({
        color: 0x2b303c,
        metalness: 0.82,
        roughness: 0.28,
        envMap: this.envMap
      });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.14, 7.2, 10), poleMat);
      pole.position.y = 3.6;
      group.add(pole);

      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.09, 0.1), poleMat);
      arm.position.set(-side * 1.05, 7.05, 0);
      group.add(arm);

      const bulbColor = isWarmWhite ? 0xffe8c2 : 0xe4f1ff;
      const bulb = new THREE.Mesh(
        new THREE.BoxGeometry(0.68, 0.12, 0.3),
        new THREE.MeshBasicMaterial({ color: bulbColor })
      );
      bulb.position.set(-side * 1.9, 6.96, 0);
      group.add(bulb);

      return group;
    },

    /**
     * Build a Realistic Reinforced Concrete Highway Overpass Bridge & Directional Sign Gantry
     * Matches 0:05–0:06 of the user's video!
     */
    _createHighwayBillboardGantry(segIndex) {
      const THREE = window.THREE;
      const group = new THREE.Group();
      const concreteBridgeMat = new THREE.MeshStandardMaterial({
        color: 0x262b36,
        roughness: 0.78,
        metalness: 0.16,
        envMap: this.envMap,
        envMapIntensity: 0.55
      });
      const darkSteelMat = new THREE.MeshStandardMaterial({
        color: 0x1c2029,
        metalness: 0.8,
        roughness: 0.3,
        envMap: this.envMap
      });

      // Left & Right heavy flared concrete bridge support piers
      [-7.85, 7.85].forEach((x) => {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(0.95, 7.8, 2.4), concreteBridgeMat);
        pier.position.set(x, 3.9, 0);
        group.add(pier);

        const pierCap = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.75, 2.8), concreteBridgeMat);
        pierCap.position.set(x, 7.55, 0);
        group.add(pierCap);
      });

      // Reinforced concrete highway overpass deck spanning the 4-lane avenue
      const bridgeDeck = new THREE.Mesh(
        new THREE.BoxGeometry(17.2, 1.15, 3.2),
        concreteBridgeMat
      );
      bridgeDeck.position.set(0, 8.35, 0);
      group.add(bridgeDeck);

      // Upper concrete parapet barrier wall
      const bridgeParapet = new THREE.Mesh(
        new THREE.BoxGeometry(17.3, 0.75, 3.35),
        concreteBridgeMat
      );
      bridgeParapet.position.set(0, 9.25, 0);
      group.add(bridgeParapet);

      // Recessed warm-white/amber sodium under-bridge ceiling downlights (illuminating the avenue under the overpass!)
      [-4.5, -1.5, 1.5, 4.5].forEach((lx) => {
        const underLight = new THREE.Mesh(
          new THREE.BoxGeometry(0.75, 0.08, 0.35),
          new THREE.MeshBasicMaterial({ color: 0xffe0a8 })
        );
        underLight.position.set(lx, 7.75, 0);
        group.add(underLight);
      });

      // Center 3D Billboard Poster featuring ./assets/rafa-poster.jpg mounted on the overpass face
      const boardBack = new THREE.Mesh(new THREE.BoxGeometry(5.8, 2.85, 0.24), darkSteelMat);
      boardBack.position.set(0, 9.55, 1.72);
      group.add(boardBack);

      const posterPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(5.55, 2.65),
        this.materials.posterBillboard
      );
      posterPlane.position.set(0, 9.55, 1.86);
      group.add(posterPlane);

      // Left & Right Highway Directional Signs mounted cleanly on the concrete overpass beam
      const leftSignBack = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.45, 0.18), darkSteelMat);
      leftSignBack.position.set(-5.15, 8.65, 1.72);
      group.add(leftSignBack);

      const leftSignFace = new THREE.Mesh(
        new THREE.PlaneGeometry(3.65, 1.32),
        new THREE.MeshBasicMaterial({ map: this.textures.gantrySignLeft })
      );
      leftSignFace.position.set(-5.15, 8.65, 1.83);
      group.add(leftSignFace);

      const rightSignBack = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.45, 0.18), darkSteelMat);
      rightSignBack.position.set(5.15, 8.65, 1.72);
      group.add(rightSignBack);

      const rightSignFace = new THREE.Mesh(
        new THREE.PlaneGeometry(3.65, 1.32),
        new THREE.MeshBasicMaterial({ map: this.textures.gantrySignRight })
      );
      rightSignFace.position.set(5.15, 8.65, 1.83);
      group.add(rightSignFace);

      // Subtle warm-white billboard top floodlight bar
      const floodBar = new THREE.Mesh(
        new THREE.BoxGeometry(5.8, 0.1, 0.26),
        new THREE.MeshBasicMaterial({
          color: segIndex % 4 === 0 ? 0xffe8c2 : 0xd8ecff
        })
      );
      floodBar.position.set(0, 11.02, 1.78);
      group.add(floodBar);

      return group;
    },

    /**
     * Build Rafa & His Red Fat-Tire Electric Chopper (EDTECH / PT 13)
     * Uses window.GT6Models.buildRafaAndChopper(this.envMap) when available.
     * Note: Wireframe sphere around the scooter has been completely removed for photorealism.
     */
    _buildRafaChopper() {
      const THREE = window.THREE;

      this.playerGroup = new THREE.Group();
      this.playerGroup.position.set(-1.5, 0, 0);
      this.scene.add(this.playerGroup);

      let builtFromModels = null;
      if (typeof window !== 'undefined' && window.GT6Models) {
        try {
          if (typeof window.GT6Models.buildRafaAndChopper === 'function') {
            builtFromModels = window.GT6Models.buildRafaAndChopper(this.envMap);
          }
        } catch (err) {
          console.warn('[GT6Renderer] GT6Models.buildRafaAndChopper fallback:', err);
        }
      }

      if (builtFromModels && (builtFromModels.group || builtFromModels.isObject3D)) {
        this.bikeGroup = builtFromModels.group || builtFromModels;
        const refs = builtFromModels.refs || builtFromModels.userData || {};
        this.chopperRefs = refs;
        this.playerGroup.add(this.bikeGroup);

        this.frontWheelGroup = refs.frontWheel || refs.frontWheelGroup || null;
        this.rearWheelGroup = refs.rearWheel || refs.rearWheelGroup || null;
        this.steeringGroup = refs.steeringGroup || refs.steering || null;
        this.headlightSpot = refs.headlightSpot || null;
        this.headlightBeam = refs.headlightCone || refs.headlightBeam || null;
        this.tailLightMat = refs.tailLightMat || null;
        this.riderGroup = refs.riderGroup || refs.rider || null;
        this.riderTorso = refs.riderTorso || null;
        this.riderHead = refs.riderHead || null;
        this.underGlowLight = refs.underGlowLight || null;

        if (Array.isArray(refs.nitroFlames) && refs.nitroFlames.length > 0) {
          this.nitroFlames = refs.nitroFlames;
          this.nitroFlameLeft = refs.nitroFlames[0] || null;
          this.nitroFlameRight = refs.nitroFlames[1] || refs.nitroFlames[0] || null;
        } else {
          this.nitroFlameLeft = refs.nitroFlameLeft || null;
          this.nitroFlameRight = refs.nitroFlameRight || null;
          this.nitroFlames = [this.nitroFlameLeft, this.nitroFlameRight].filter(Boolean);
        }

        // Hide nitro flames by default so rear looks like a real red fat-tire chopper unless boosting
        for (let f = 0; f < this.nitroFlames.length; f++) {
          if (this.nitroFlames[f]) {
            this.nitroFlames[f].visible = false;
          }
        }

        if (!this.headlightSpot) {
          this.headlightSpot = new THREE.SpotLight(0xf2f7ff, 2.6, 68, Math.PI / 5.4, 0.48, 1.1);
          this.headlightSpot.position.set(0, 1.2, -1.05);
          this.headlightSpot.target.position.set(0, 0.1, -26);
          this.bikeGroup.add(this.headlightSpot);
          this.bikeGroup.add(this.headlightSpot.target);
        }

        if (!this.underGlowLight) {
          this.underGlowLight = new THREE.PointLight(0xd9141d, 1.1, 5.5);
          this.underGlowLight.position.set(0, 0.22, 0.0);
          this.bikeGroup.add(this.underGlowLight);
        }
      } else {
        this._buildFallbackRafaChopper();
      }

      // No wireframe sphere shield on playerGroup
      this.empShieldMesh = null;
    },

    _buildFallbackRafaChopper() {
      const THREE = window.THREE;
      this.bikeGroup = new THREE.Group();
      this.playerGroup.add(this.bikeGroup);

      const redPaintMat = new THREE.MeshStandardMaterial({
        color: 0xc4121a,
        emissive: 0x240204,
        roughness: 0.2,
        metalness: 0.62,
        envMap: this.envMap,
        envMapIntensity: 1.5
      });
      const fenderLightningMat = new THREE.MeshStandardMaterial({
        map: this.textures.fenderLightning,
        roughness: 0.22,
        metalness: 0.55,
        envMap: this.envMap
      });
      const chromeMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.08,
        metalness: 0.95,
        envMap: this.envMap,
        envMapIntensity: 1.7
      });
      const darkMetalMat = new THREE.MeshStandardMaterial({
        color: 0x16181f,
        roughness: 0.42,
        metalness: 0.68,
        envMap: this.envMap
      });
      const leatherMat = new THREE.MeshStandardMaterial({
        color: 0x15161c,
        roughness: 0.58,
        metalness: 0.12
      });
      const edtechBoxMat = new THREE.MeshStandardMaterial({
        map: this.textures.edtechBattery,
        roughness: 0.28,
        metalness: 0.35,
        envMap: this.envMap
      });

      this.frontWheelGroup = this._createFatWheel(true, chromeMat, darkMetalMat);
      this.frontWheelGroup.position.set(0, 0.44, -1.08);
      this.bikeGroup.add(this.frontWheelGroup);

      this.rearWheelGroup = this._createFatWheel(false, chromeMat, darkMetalMat);
      this.rearWheelGroup.position.set(0, 0.44, 0.98);
      this.bikeGroup.add(this.rearWheelGroup);

      const lowerFairing = new THREE.Mesh(
        new THREE.BoxGeometry(0.58, 0.16, 1.35),
        redPaintMat
      );
      lowerFairing.position.set(0, 0.28, -0.05);
      lowerFairing.castShadow = true;
      this.bikeGroup.add(lowerFairing);

      const floorboard = new THREE.Mesh(
        new THREE.BoxGeometry(0.54, 0.06, 1.18),
        darkMetalMat
      );
      floorboard.position.set(0, 0.37, -0.05);
      this.bikeGroup.add(floorboard);

      const frontDowntube = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.78, 0.22),
        redPaintMat
      );
      frontDowntube.position.set(0, 0.68, -0.66);
      frontDowntube.rotation.x = 0.36;
      this.bikeGroup.add(frontDowntube);

      [-0.28, 0.28].forEach((sideX) => {
        const swingarm = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.11, 0.72),
          redPaintMat
        );
        swingarm.position.set(sideX, 0.42, 0.68);
        this.bikeGroup.add(swingarm);

        const shock = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.055, 0.52, 16),
          darkMetalMat
        );
        shock.position.set(sideX, 0.67, 0.74);
        shock.rotation.x = -0.32;
        this.bikeGroup.add(shock);
      });

      const rearFender = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 0.52, 28, 1, false, 0, Math.PI),
        redPaintMat
      );
      rearFender.rotation.z = Math.PI / 2;
      rearFender.rotation.x = -0.25;
      rearFender.position.set(0, 0.46, 0.98);
      this.bikeGroup.add(rearFender);

      this.tailLightMat = new THREE.MeshBasicMaterial({ color: 0xff1e27 });
      const tailLight = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.1, 0.08),
        this.tailLightMat
      );
      tailLight.position.set(0, 0.82, 1.38);
      this.bikeGroup.add(tailLight);

      const batteryBoxMaterials = [
        edtechBoxMat,
        edtechBoxMat,
        redPaintMat,
        darkMetalMat,
        edtechBoxMat,
        edtechBoxMat
      ];
      const batteryBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.55, 0.62),
        batteryBoxMaterials
      );
      batteryBox.position.set(0, 0.66, 0.36);
      batteryBox.castShadow = true;
      this.bikeGroup.add(batteryBox);

      const mainSeat = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.16, 0.72),
        leatherMat
      );
      mainSeat.position.set(0, 0.98, 0.42);
      this.bikeGroup.add(mainSeat);

      [-0.14, 0.14].forEach((bx) => {
        const bar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.025, 0.38, 12),
          darkMetalMat
        );
        bar.position.set(bx, 1.18, 0.75);
        bar.rotation.x = -0.15;
        this.bikeGroup.add(bar);
      });
      const backrestPad = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.24, 0.14),
        leatherMat
      );
      backrestPad.position.set(0, 1.34, 0.78);
      this.bikeGroup.add(backrestPad);

      const flameGeo = new THREE.ConeGeometry(0.09, 0.7, 16);
      flameGeo.rotateX(Math.PI / 2);
      const flameMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.0
      });
      this.nitroFlameLeft = new THREE.Mesh(flameGeo, flameMat);
      this.nitroFlameLeft.position.set(-0.22, 0.56, 1.48);
      this.nitroFlameLeft.visible = false;
      this.bikeGroup.add(this.nitroFlameLeft);

      this.nitroFlameRight = new THREE.Mesh(flameGeo, flameMat.clone());
      this.nitroFlameRight.position.set(0.22, 0.56, 1.48);
      this.nitroFlameRight.visible = false;
      this.bikeGroup.add(this.nitroFlameRight);
      this.nitroFlames = [this.nitroFlameLeft, this.nitroFlameRight];

      this.steeringGroup = new THREE.Group();
      this.steeringGroup.position.set(0, 0.96, -0.78);
      this.bikeGroup.add(this.steeringGroup);

      [-0.22, 0.22].forEach((fx) => {
        const forkTube = new THREE.Mesh(
          new THREE.CylinderGeometry(0.042, 0.038, 1.18, 20),
          chromeMat
        );
        forkTube.position.set(fx, -0.15, -0.14);
        forkTube.rotation.x = 0.28;
        this.steeringGroup.add(forkTube);
      });

      const lowerClamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.08, 0.2),
        darkMetalMat
      );
      lowerClamp.position.set(0, -0.05, -0.12);
      this.steeringGroup.add(lowerClamp);

      const upperClamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.54, 0.07, 0.18),
        darkMetalMat
      );
      upperClamp.position.set(0, 0.28, -0.03);
      this.steeringGroup.add(upperClamp);

      const frontFender = new THREE.Mesh(
        new THREE.CylinderGeometry(0.49, 0.49, 0.48, 28, 1, false, 0, Math.PI * 0.85),
        fenderLightningMat
      );
      frontFender.rotation.z = Math.PI / 2;
      frontFender.rotation.x = 0.55;
      frontFender.position.set(0, -0.52, -0.3);
      this.steeringGroup.add(frontFender);

      const headlightHousing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.18, 0.18, 24),
        darkMetalMat
      );
      headlightHousing.rotation.x = Math.PI / 2;
      headlightHousing.position.set(0, 0.22, -0.2);
      this.steeringGroup.add(headlightHousing);

      const headlightLens = new THREE.Mesh(
        new THREE.CircleGeometry(0.2, 24),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      headlightLens.rotation.y = Math.PI;
      headlightLens.position.set(0, 0.22, -0.3);
      this.steeringGroup.add(headlightLens);

      const barCenter = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.028, 0.45, 12),
        darkMetalMat
      );
      barCenter.rotation.z = Math.PI / 2;
      barCenter.position.set(0, 0.56, 0.08);
      this.steeringGroup.add(barCenter);

      const dashScreen = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.12, 0.04),
        new THREE.MeshBasicMaterial({ color: 0x66e0ff })
      );
      dashScreen.position.set(0, 0.62, 0.04);
      dashScreen.rotation.x = -0.5;
      this.steeringGroup.add(dashScreen);

      [-1, 1].forEach((side) => {
        const riser = new THREE.Mesh(
          new THREE.CylinderGeometry(0.026, 0.026, 0.34, 12),
          darkMetalMat
        );
        riser.position.set(side * 0.24, 0.43, 0.04);
        riser.rotation.z = -side * 0.28;
        this.steeringGroup.add(riser);

        const grip = new THREE.Mesh(
          new THREE.CylinderGeometry(0.032, 0.032, 0.34, 12),
          leatherMat
        );
        grip.rotation.z = Math.PI / 2;
        grip.rotation.y = -side * 0.22;
        grip.position.set(side * 0.46, 0.58, 0.14);
        this.steeringGroup.add(grip);

        const stalk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.012, 0.26, 10),
          chromeMat
        );
        stalk.position.set(side * 0.52, 0.72, 0.12);
        stalk.rotation.z = -side * 0.35;
        this.steeringGroup.add(stalk);

        const mirrorHead = new THREE.Mesh(
          new THREE.CylinderGeometry(0.085, 0.085, 0.03, 20),
          chromeMat
        );
        mirrorHead.rotation.x = Math.PI / 2;
        mirrorHead.position.set(side * 0.58, 0.84, 0.12);
        this.steeringGroup.add(mirrorHead);
      });

      this.headlightSpot = new THREE.SpotLight(0xf2f7ff, 2.6, 68, Math.PI / 5.4, 0.48, 1.1);
      this.headlightSpot.position.set(0, 1.2, -1.05);
      this.headlightSpot.target.position.set(0, 0.1, -26);
      this.bikeGroup.add(this.headlightSpot);
      this.bikeGroup.add(this.headlightSpot.target);

      const coneGeo = new THREE.ConeGeometry(2.4, 13, 24, 1, true);
      coneGeo.rotateX(Math.PI / 2);
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0xe6f4ff,
        transparent: true,
        opacity: 0.075,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      this.headlightBeam = new THREE.Mesh(coneGeo, coneMat);
      this.headlightBeam.position.set(0, 0.68, -7.8);
      this.bikeGroup.add(this.headlightBeam);

      this.underGlowLight = new THREE.PointLight(0xd9141d, 1.1, 5.5);
      this.underGlowLight.position.set(0, 0.22, 0.0);
      this.bikeGroup.add(this.underGlowLight);

      this.riderGroup = this._createRafaRiderMesh();
      this.bikeGroup.add(this.riderGroup);
    },

    _createFatWheel(isFront, chromeMat, darkMetalMat) {
      const THREE = window.THREE;
      const wheelGroup = new THREE.Group();

      const tireMat = new THREE.MeshStandardMaterial({
        map: this.textures.tireTread,
        roughness: 0.68,
        metalness: 0.14
      });
      const tireMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.44, 0.44, 0.44, 32),
        tireMat
      );
      tireMesh.rotation.z = Math.PI / 2;
      tireMesh.castShadow = true;
      wheelGroup.add(tireMesh);

      [-0.2, 0.2].forEach((sideX) => {
        const torus = new THREE.Mesh(
          new THREE.TorusGeometry(0.35, 0.09, 16, 32),
          tireMat
        );
        torus.rotation.y = Math.PI / 2;
        torus.position.x = sideX;
        wheelGroup.add(torus);
      });

      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.26, 0.46, 24),
        darkMetalMat
      );
      rim.rotation.z = Math.PI / 2;
      wheelGroup.add(rim);

      const discMat = new THREE.MeshStandardMaterial({
        map: this.textures.discBrake,
        transparent: true,
        roughness: 0.2,
        metalness: 0.88,
        side: THREE.DoubleSide
      });
      const disc = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), discMat);
      disc.rotation.y = Math.PI / 2;
      disc.position.x = isFront ? -0.25 : 0.25;
      wheelGroup.add(disc);

      return wheelGroup;
    },

    _createRafaRiderMesh() {
      const THREE = window.THREE;
      const rider = new THREE.Group();

      const jacketMat = new THREE.MeshStandardMaterial({
        color: 0x15171e,
        roughness: 0.42,
        metalness: 0.12,
        envMap: this.envMap
      });
      const jacketDecalMat = new THREE.MeshStandardMaterial({
        map: this.textures.jacketBack,
        roughness: 0.42,
        metalness: 0.12,
        envMap: this.envMap
      });
      const pantsMat = new THREE.MeshStandardMaterial({
        color: 0x22232a,
        roughness: 0.75,
        metalness: 0.08
      });
      const bootMat = new THREE.MeshStandardMaterial({
        color: 0x111216,
        roughness: 0.35,
        metalness: 0.35
      });
      const skinMat = new THREE.MeshStandardMaterial({
        color: 0xe09b74,
        roughness: 0.62,
        metalness: 0.04
      });
      const hairBeardMat = new THREE.MeshStandardMaterial({
        color: 0x231812,
        roughness: 0.85
      });

      const torsoMaterials = [
        jacketMat,
        jacketMat,
        jacketMat,
        jacketMat,
        jacketDecalMat,
        jacketDecalMat
      ];
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.68, 0.32), torsoMaterials);
      torso.position.set(0, 1.44, 0.36);
      torso.rotation.x = -0.14;
      torso.castShadow = true;
      rider.add(torso);
      this.riderTorso = torso;

      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.18, 0.12, 16),
        jacketMat
      );
      collar.position.set(0, 1.81, 0.31);
      rider.add(collar);

      [-0.22, 0.22].forEach((sideX) => {
        const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.48, 0.22), pantsMat);
        thigh.position.set(sideX, 1.06, 0.14);
        thigh.rotation.x = 1.18;
        thigh.rotation.z = -sideX * 0.25;
        rider.add(thigh);

        const shin = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.48, 0.2), pantsMat);
        shin.position.set(sideX * 1.15, 0.72, -0.12);
        shin.rotation.x = -0.18;
        rider.add(shin);

        const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.34), bootMat);
        boot.position.set(sideX * 1.15, 0.46, -0.22);
        rider.add(boot);
      });

      [-1, 1].forEach((side) => {
        const upperArm = new THREE.Mesh(
          new THREE.CylinderGeometry(0.095, 0.085, 0.42, 14),
          jacketMat
        );
        upperArm.position.set(side * 0.34, 1.62, 0.12);
        upperArm.rotation.x = 1.05;
        upperArm.rotation.z = -side * 0.28;
        rider.add(upperArm);

        const forearm = new THREE.Mesh(
          new THREE.CylinderGeometry(0.078, 0.068, 0.38, 14),
          skinMat
        );
        forearm.position.set(side * 0.42, 1.56, -0.22);
        forearm.rotation.x = 1.42;
        forearm.rotation.z = side * 0.12;
        rider.add(forearm);

        const glove = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.15), bootMat);
        glove.position.set(side * 0.45, 1.54, -0.58);
        rider.add(glove);
      });

      const headGroup = new THREE.Group();
      headGroup.position.set(0, 2.02, 0.29);
      rider.add(headGroup);

      const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.19, 24, 24), skinMat);
      headMesh.scale.set(0.95, 1.08, 0.98);
      headGroup.add(headMesh);

      const beard = new THREE.Mesh(
        new THREE.SphereGeometry(0.194, 20, 16, 0, Math.PI * 2, Math.PI * 0.48, Math.PI * 0.45),
        hairBeardMat
      );
      beard.position.set(0, -0.02, -0.02);
      headGroup.add(beard);

      const hairCap = new THREE.Mesh(
        new THREE.SphereGeometry(0.196, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.52),
        hairBeardMat
      );
      hairCap.position.set(0, 0.02, 0.01);
      headGroup.add(hairCap);

      for (let s = -2; s <= 2; s++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.11, 8), hairBeardMat);
        spike.position.set(s * 0.04, 0.21, -0.05);
        spike.rotation.x = -0.25;
        spike.rotation.z = -s * 0.12;
        headGroup.add(spike);
      }

      const glassesMat = new THREE.MeshBasicMaterial({ color: 0x0a0b0e });
      const lensMat = new THREE.MeshStandardMaterial({
        color: 0x88d4ff,
        roughness: 0.05,
        metalness: 0.95,
        envMap: this.envMap,
        transparent: true,
        opacity: 0.65
      });
      [-0.075, 0.075].forEach((gx) => {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.055, 0.02), glassesMat);
        frame.position.set(gx, 0.03, -0.185);
        headGroup.add(frame);

        const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.04), lensMat);
        lens.rotation.y = Math.PI;
        lens.position.set(gx, 0.03, -0.197);
        headGroup.add(lens);
      });
      [-0.175, 0.175].forEach((tx) => {
        const temple = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.02, 0.18), glassesMat);
        temple.position.set(tx, 0.035, -0.09);
        headGroup.add(temple);
      });

      this.riderHead = headGroup;
      return rider;
    },

    /**
     * Build Trailing Police Cruisers (4-6 Stars)
     */
    _buildAmbientChasers() {
      this.ambientChasers = [];
      for (let i = 0; i < 2; i++) {
        const copMesh = this._createPoliceCruiserMesh(true, 'police_car');
        copMesh.position.set(i === 0 ? -2.2 : 2.2, 0, 5.8 + i * 2.4);
        this.scene.add(copMesh);
        this.ambientChasers.push(copMesh);
      }
    },

    /**
     * Build Overhead Police Helicopter using window.GT6Models.buildPoliceHelicopter(this.envMap)
     * with built-in fallback and volumetric sweeping searchlight!
     */
    _buildPoliceHelicopter() {
      const THREE = window.THREE;

      let builtHeli = null;
      if (typeof window !== 'undefined' && window.GT6Models) {
        try {
          if (typeof window.GT6Models.buildPoliceHelicopter === 'function') {
            builtHeli = window.GT6Models.buildPoliceHelicopter(this.envMap);
          }
        } catch (err) {
          console.warn('[GT6Renderer] GT6Models.buildPoliceHelicopter fallback:', err);
        }
      }

      if (builtHeli && (builtHeli.group || builtHeli.isObject3D)) {
        this.heliGroup = builtHeli.group || builtHeli;
        const refs = builtHeli.refs || builtHeli.userData || builtHeli;
        this.heliRefs = refs;
        this.heliGroup.position.set(0, 14.5, -16);
        this.scene.add(this.heliGroup);

        this.heliMainRotor = refs.mainRotor || refs.heliMainRotor || null;
        this.heliTailRotor = refs.tailRotor || refs.heliTailRotor || null;
        this.heliSpotLight = refs.spotLight || refs.heliSpotLight || null;
        this.heliLightCone =
          refs.searchlightCone || refs.lightCone || refs.heliLightCone || null;
        this.heliRedLight = refs.redStrobe || refs.redLight || refs.heliRedLight || null;
        this.heliBlueLight = refs.blueStrobe || refs.blueLight || refs.heliBlueLight || null;

        if (!this.heliSpotLight) {
          this.heliSpotLight = new THREE.SpotLight(0xffffff, 2.8, 52, Math.PI / 6, 0.5, 1.0);
          this.heliSpotLight.position.set(0, -0.65, 1.4);
          this.heliGroup.add(this.heliSpotLight);
        }
        if (
          this.heliSpotLight &&
          this.heliSpotLight.target &&
          !this.heliSpotLight.target.parent
        ) {
          this.scene.add(this.heliSpotLight.target);
        }
        if (!this.heliLightCone) {
          const coneGeo = new THREE.ConeGeometry(4.2, 18.5, 24, 1, true);
          coneGeo.translate(0, -9.25, 0);
          const coneMat = new THREE.MeshBasicMaterial({
            color: 0xeef6ff,
            transparent: true,
            opacity: 0.12,
            side: THREE.DoubleSide,
            depthWrite: false
          });
          this.heliLightCone = new THREE.Mesh(coneGeo, coneMat);
          this.heliLightCone.position.set(0, -0.65, 1.4);
          this.heliGroup.add(this.heliLightCone);
        }
      } else {
        this._buildFallbackPoliceHelicopter();
      }

      // Subtle Ground Searchlight Pool on the road
      const spotRingGeo = new THREE.CircleGeometry(1.75, 24);
      const spotRingMat = new THREE.MeshBasicMaterial({
        color: 0xeef6ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.16,
        depthWrite: false
      });
      this.heliGroundRing = new THREE.Mesh(spotRingGeo, spotRingMat);
      this.heliGroundRing.rotation.x = -Math.PI / 2;
      this.heliGroundRing.position.set(0, 0.03, -8);
      this.scene.add(this.heliGroundRing);
    },

    _buildFallbackPoliceHelicopter() {
      const THREE = window.THREE;
      this.heliGroup = new THREE.Group();
      this.heliGroup.position.set(0, 14.5, -16);
      this.scene.add(this.heliGroup);

      const darkMat = new THREE.MeshStandardMaterial({
        color: 0x10131b,
        roughness: 0.3,
        metalness: 0.72,
        envMap: this.envMap
      });
      const whiteMat = new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        roughness: 0.25,
        metalness: 0.45,
        envMap: this.envMap
      });
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x243447,
        roughness: 0.08,
        metalness: 0.92,
        envMap: this.envMap,
        transparent: true,
        opacity: 0.78
      });

      const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.35, 3.6), darkMat);
      this.heliGroup.add(body);

      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.42, 2.4), whiteMat);
      stripe.position.set(0, 0, 0.2);
      this.heliGroup.add(stripe);

      const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.92, 24, 20), glassMat);
      cockpit.position.set(0, -0.05, 1.55);
      cockpit.scale.set(0.92, 0.78, 1.25);
      this.heliGroup.add(cockpit);

      const tailBoom = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 3.8), darkMat);
      tailBoom.position.set(0, 0.22, -3.2);
      this.heliGroup.add(tailBoom);

      const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.15, 0.75), whiteMat);
      tailFin.position.set(0, 0.65, -4.85);
      this.heliGroup.add(tailFin);

      [-0.75, 0.75].forEach((sx) => {
        const skid = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 3.4, 12),
          darkMat
        );
        skid.rotation.x = Math.PI / 2;
        skid.position.set(sx, -1.05, 0.2);
        this.heliGroup.add(skid);

        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.08), darkMat);
        strut.position.set(sx, -0.78, 0.8);
        this.heliGroup.add(strut);
      });

      this.heliMainRotor = new THREE.Group();
      this.heliMainRotor.position.set(0, 0.92, 0.1);
      const bladeMat = new THREE.MeshBasicMaterial({
        color: 0xcbd5e1,
        transparent: true,
        opacity: 0.65
      });
      const blade1 = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.04, 0.28), bladeMat);
      const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 7.8), bladeMat);
      this.heliMainRotor.add(blade1, blade2);
      this.heliGroup.add(this.heliMainRotor);

      this.heliTailRotor = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 1.45, 0.18),
        bladeMat
      );
      this.heliTailRotor.position.set(0.24, 0.68, -4.9);
      this.heliGroup.add(this.heliTailRotor);

      this.heliRedLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xff1e27 })
      );
      this.heliRedLight.position.set(-0.55, -0.72, 0.8);
      this.heliGroup.add(this.heliRedLight);

      this.heliBlueLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x0088ff })
      );
      this.heliBlueLight.position.set(0.55, -0.72, 0.8);
      this.heliGroup.add(this.heliBlueLight);

      const coneGeo = new THREE.ConeGeometry(4.2, 18.5, 24, 1, true);
      coneGeo.translate(0, -9.25, 0);
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0xeef6ff,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      this.heliLightCone = new THREE.Mesh(coneGeo, coneMat);
      this.heliLightCone.position.set(0, -0.65, 1.4);
      this.heliGroup.add(this.heliLightCone);

      this.heliSpotLight = new THREE.SpotLight(0xffffff, 2.8, 52, Math.PI / 6, 0.5, 1.0);
      this.heliSpotLight.position.set(0, -0.65, 1.4);
      this.heliGroup.add(this.heliSpotLight);
      this.scene.add(this.heliSpotLight.target);
    },

    /**
     * Create a High-Detail Police Cruiser or SWAT Van Mesh using window.GT6Models.buildPoliceCruiser
     */
    _createPoliceCruiserMesh(isChasingPlayer = false, variant = 'police_car') {
      const THREE = window.THREE;

      if (typeof window !== 'undefined' && window.GT6Models) {
        try {
          if (typeof window.GT6Models.buildPoliceCruiser === 'function') {
            const built = window.GT6Models.buildPoliceCruiser(variant, this.envMap);
            if (built && (built.group || built.isObject3D)) {
              const carGroup = built.group || built;
              const refs = built.refs || built.userData || built;
              let baseYaw = 0;
              if (isChasingPlayer && built.facingPositiveZ) {
                baseYaw = Math.PI;
                carGroup.rotation.y = baseYaw;
              }
              carGroup.userData = Object.assign({}, carGroup.userData, {
                baseRotationY: baseYaw,
                redBarMat: refs.redStrobeMat || refs.redBarMat || null,
                blueBarMat: refs.blueStrobeMat || refs.blueBarMat || null,
                strobeLight: refs.strobeLight || null,
                wheels: refs.wheels || [],
                phaseOffset: Math.random() * 10
              });
              return carGroup;
            }
          }
        } catch (err) {
          console.warn('[GT6Renderer] GT6Models.buildPoliceCruiser fallback:', err);
        }
      }

      const car = new THREE.Group();
      const blackMat = new THREE.MeshStandardMaterial({
        color: 0x0b0d12,
        roughness: 0.2,
        metalness: 0.72,
        envMap: this.envMap,
        envMapIntensity: 1.5
      });
      const whiteMat = new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        roughness: 0.22,
        metalness: 0.48,
        envMap: this.envMap,
        envMapIntensity: 1.4
      });
      const sideDecalMat = new THREE.MeshStandardMaterial({
        map: this.textures.policeSide,
        roughness: 0.24,
        metalness: 0.52,
        envMap: this.envMap
      });
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x161f2c,
        roughness: 0.08,
        metalness: 0.9,
        envMap: this.envMap
      });

      const bodyMaterials = [
        sideDecalMat,
        sideDecalMat,
        whiteMat,
        blackMat,
        blackMat,
        blackMat
      ];
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.72, 4.35), bodyMaterials);
      chassis.position.y = 0.58;
      chassis.castShadow = true;
      car.add(chassis);

      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.58, 2.15), blackMat);
      cabin.position.set(0, 1.2, -0.1);
      car.add(cabin);

      const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.5, 2.22), glassMat);
      windshield.position.set(0, 1.18, -0.1);
      car.add(windshield);

      const bullbar = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.55, 0.18), blackMat);
      bullbar.position.set(0, 0.55, isChasingPlayer ? -2.24 : 2.24);
      car.add(bullbar);

      const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 20);
      wheelGeo.rotateZ(Math.PI / 2);
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.75 });
      const wheels = [];
      [
        [-1.02, 0.36, -1.35],
        [1.02, 0.36, -1.35],
        [-1.02, 0.36, 1.35],
        [1.02, 0.36, 1.35]
      ].forEach(([wx, wy, wz]) => {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.position.set(wx, wy, wz);
        car.add(w);
        wheels.push(w);
      });

      const headZ = isChasingPlayer ? -2.19 : 2.19;
      const tailZ = -headZ;
      [-0.72, 0.72].forEach((lx) => {
        const hl = new THREE.Mesh(
          new THREE.BoxGeometry(0.38, 0.16, 0.06),
          new THREE.MeshBasicMaterial({ color: 0xeef8ff })
        );
        hl.position.set(lx, 0.62, headZ);
        car.add(hl);

        const tl = new THREE.Mesh(
          new THREE.BoxGeometry(0.38, 0.16, 0.06),
          new THREE.MeshBasicMaterial({ color: 0xff1e27 })
        );
        tl.position.set(lx, 0.64, tailZ);
        car.add(tl);
      });

      const redBarMat = new THREE.MeshBasicMaterial({ color: 0xff1722 });
      const blueBarMat = new THREE.MeshBasicMaterial({ color: 0x0088ff });
      const redBar = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.14, 0.26), redBarMat);
      redBar.position.set(-0.4, 1.54, -0.1);
      car.add(redBar);

      const blueBar = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.14, 0.26), blueBarMat);
      blueBar.position.set(0.4, 1.54, -0.1);
      car.add(blueBar);

      car.userData = {
        baseRotationY: 0,
        redBarMat,
        blueBarMat,
        wheels,
        phaseOffset: Math.random() * 10
      };

      return car;
    },

    /**
     * Create Dynamic Obstacle Mesh based on `entity.type`
     */
    _createObstacleMesh(entity) {
      const THREE = window.THREE;
      const type = (entity && entity.type) || 'police_car';

      if (type === 'roadblock') {
        const group = new THREE.Group();
        const car = this._createPoliceCruiserMesh(false, 'police_car');
        car.rotation.y = Math.PI * 0.42;
        group.add(car);

        const barrier = new THREE.Mesh(
          new THREE.BoxGeometry(2.65, 0.88, 0.55),
          new THREE.MeshStandardMaterial({
            color: 0xd8dee9,
            roughness: 0.68,
            metalness: 0.15,
            envMap: this.envMap
          })
        );
        barrier.position.set(0, 0.44, 1.45);
        group.add(barrier);

        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(2.68, 0.26, 0.58),
          new THREE.MeshBasicMaterial({ color: 0xf59e0b })
        );
        stripe.position.set(0, 0.64, 1.45);
        group.add(stripe);

        group.userData = Object.assign({}, car.userData, { baseRotationY: 0 });
        return group;
      }

      if (type === 'swat_van') {
        if (
          typeof window !== 'undefined' &&
          window.GT6Models &&
          typeof window.GT6Models.buildPoliceCruiser === 'function'
        ) {
          try {
            const swatBuilt = this._createPoliceCruiserMesh(false, 'swat_van');
            if (swatBuilt) return swatBuilt;
          } catch (_) {}
        }

        const van = new THREE.Group();
        const swatMat = new THREE.MeshStandardMaterial({
          color: 0x11151d,
          roughness: 0.28,
          metalness: 0.75,
          envMap: this.envMap
        });
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.35, 2.2, 5.2), swatMat);
        body.position.y = 1.35;
        body.castShadow = true;
        van.add(body);

        const redBarMat = new THREE.MeshBasicMaterial({ color: 0xff1722 });
        const blueBarMat = new THREE.MeshBasicMaterial({ color: 0x0088ff });
        const redBar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.28), redBarMat);
        redBar.position.set(-0.5, 2.55, 1.6);
        const blueBar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.28), blueBarMat);
        blueBar.position.set(0.5, 2.55, 1.6);
        van.add(redBar, blueBar);
        van.userData = { baseRotationY: 0, redBarMat, blueBarMat, phaseOffset: Math.random() * 10 };
        return van;
      }

      if (type === 'spike_strip') {
        const stripGroup = new THREE.Group();
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(2.5, 0.1, 0.48),
          new THREE.MeshStandardMaterial({
            color: 0xf59e0b,
            metalness: 0.55,
            roughness: 0.35,
            envMap: this.envMap
          })
        );
        base.position.y = 0.05;
        stripGroup.add(base);

        const spikeMat = new THREE.MeshStandardMaterial({
          color: 0xe2e8f0,
          metalness: 0.92,
          roughness: 0.12,
          envMap: this.envMap
        });
        for (let sx = -1.05; sx <= 1.05; sx += 0.3) {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.38, 12), spikeMat);
          spike.position.set(sx, 0.26, 0);
          stripGroup.add(spike);
        }
        stripGroup.userData = { baseRotationY: 0 };
        return stripGroup;
      }

      if (type === 'traffic_car') {
        // Realistic automotive clearcoat colors (silver, charcoal, deep red, midnight blue, pearl white)
        const colors = [0xd8dee9, 0x262b36, 0xb91c1c, 0x1e3a8a, 0xeab308, 0x0f172a];
        const color = colors[Math.abs(Number(entity && entity.id) || 0) % colors.length];

        if (
          typeof window !== 'undefined' &&
          window.GT6Models &&
          typeof window.GT6Models.buildTrafficCar === 'function'
        ) {
          try {
            const builtCar = window.GT6Models.buildTrafficCar(color, this.envMap);
            if (builtCar && (builtCar.group || builtCar.isObject3D)) {
              const carGroup = builtCar.group || builtCar;
              const refs = builtCar.refs || builtCar.userData || builtCar;
              carGroup.userData = Object.assign({}, carGroup.userData, {
                baseRotationY: 0,
                wheels: refs.wheels || []
              });
              return carGroup;
            }
          } catch (err) {
            console.warn('[GT6Renderer] GT6Models.buildTrafficCar fallback:', err);
          }
        }

        const car = new THREE.Group();
        const paintMat = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.18,
          metalness: 0.72,
          envMap: this.envMap,
          envMapIntensity: 1.5
        });
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.68, 4.1), paintMat);
        body.position.y = 0.55;
        body.castShadow = true;
        car.add(body);

        const top = new THREE.Mesh(
          new THREE.BoxGeometry(1.65, 0.5, 1.9),
          new THREE.MeshStandardMaterial({
            color: 0x161d28,
            roughness: 0.12,
            metalness: 0.88,
            envMap: this.envMap
          })
        );
        top.position.set(0, 1.1, -0.15);
        car.add(top);

        [-0.68, 0.68].forEach((lx) => {
          const tl = new THREE.Mesh(
            new THREE.BoxGeometry(0.36, 0.15, 0.06),
            new THREE.MeshBasicMaterial({ color: 0xff1e27 })
          );
          tl.position.set(lx, 0.62, 2.06);
          car.add(tl);
        });
        car.userData = { baseRotationY: 0 };
        return car;
      }

      return this._createPoliceCruiserMesh(false, 'police_car');
    },

    /**
     * Create Concrete Overpass Jump Ramp Mesh (Matches 0:08–0:09 of the user's video)
     */
    _createRampMesh() {
      const THREE = window.THREE;
      const rampGroup = new THREE.Group();

      const deckMat = new THREE.MeshStandardMaterial({
        map: this.textures.rampDeck,
        roughness: 0.55,
        metalness: 0.25,
        envMap: this.envMap
      });
      const concreteSideMat = new THREE.MeshStandardMaterial({
        color: 0x262b36,
        roughness: 0.75,
        metalness: 0.18,
        envMap: this.envMap
      });
      const amberBeaconMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });

      // Inclined concrete overpass launch deck sloping up toward -Z
      const deck = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.28, 5.8), deckMat);
      deck.position.set(0, 0.95, 0);
      deck.rotation.x = 0.32;
      rampGroup.add(deck);

      // Concrete parapet side rails along the ramp
      [-1.38, 1.38].forEach((rx) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.32, 5.85), concreteSideMat);
        rail.position.set(rx, 1.12, 0);
        rail.rotation.x = 0.32;
        rampGroup.add(rail);
      });

      // Rear concrete support pillars + amber hazard beacons
      [-1.18, 1.18].forEach((px) => {
        const pillar = new THREE.Mesh(
          new THREE.BoxGeometry(0.28, 1.85, 0.38),
          concreteSideMat
        );
        pillar.position.set(px, 0.92, -2.25);
        rampGroup.add(pillar);

        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), amberBeaconMat);
        beacon.position.set(px, 2.0, -2.55);
        rampGroup.add(beacon);
      });

      rampGroup.userData = { baseRotationY: 0 };
      return rampGroup;
    },

    /**
     * Create Floating Rotating Pickup Mesh ('cash' | 'nitro' | 'armor' | 'emp')
     */
    _createPickupMesh(entity) {
      const THREE = window.THREE;
      const type = (entity && entity.type) || 'cash';
      const group = new THREE.Group();

      if (type === 'cash') {
        const cashMat = new THREE.MeshStandardMaterial({
          color: 0x4ade80,
          emissive: 0x16a34a,
          emissiveIntensity: 0.65,
          roughness: 0.3,
          metalness: 0.25,
          envMap: this.envMap
        });
        const bundle = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.42, 0.5), cashMat);
        const band = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.45, 0.54),
          new THREE.MeshBasicMaterial({ color: 0xfef08a })
        );
        group.add(bundle, band);
      } else if (type === 'nitro') {
        const nitroMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 0.7,
          metalness: 0.7,
          roughness: 0.15,
          envMap: this.envMap
        });
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.95, 20), nitroMat);
        group.add(cyl);
      } else if (type === 'armor') {
        const armorMat = new THREE.MeshStandardMaterial({
          color: 0xd9141d,
          emissive: 0x7f1d1d,
          emissiveIntensity: 0.65,
          roughness: 0.25,
          metalness: 0.5,
          envMap: this.envMap
        });
        const vest = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), armorMat);
        group.add(vest);
      } else {
        const empMat = new THREE.MeshStandardMaterial({
          color: 0x66e0ff,
          emissive: 0x0284c7,
          emissiveIntensity: 0.6,
          metalness: 0.8,
          roughness: 0.2
        });
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(0.34, 16, 16),
          new THREE.MeshBasicMaterial({ color: 0xe0f2fe })
        );
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.06, 12, 24), empMat);
        group.add(core, ring);
      }

      const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.62, 24),
        new THREE.MeshBasicMaterial({
          color: type === 'cash' ? 0x4ade80 : type === 'nitro' ? 0x66e0ff : 0xf59e0b,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.5
        })
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = -0.55;
      group.add(halo);

      return group;
    },

    /**
     * Spawn 3D Particle Bursts for Golden-Orange Metallic Friction Sparks, Explosions, Cash & Nitro
     */
    _spawnParticles(origin, count, colorHex, speedScale = 1.0, gravity = 14.0, lifeRange = 0.55) {
      if (!this.particleGroup || !window.THREE) return;
      const THREE = window.THREE;

      const maxParticles = this.quality === 'PERFORMANCE' ? 140 : 280;
      if (this.particles.length > maxParticles) {
        const excess = this.particles.splice(0, count);
        excess.forEach((p) => this.particleGroup.remove(p.mesh));
      }

      // Crisp elongated spark streak geometry
      const geo = new THREE.BoxGeometry(0.055, 0.055, 0.26);
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 1.0
      });

      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(geo, mat.clone());
        mesh.position.set(
          (origin.x || 0) + (Math.random() - 0.5) * 0.45,
          Math.max(0.05, (origin.y || 0.14) + Math.random() * 0.22),
          (origin.z || 0) + (Math.random() - 0.5) * 0.45
        );
        const vx = (Math.random() - 0.5) * 6.8 * speedScale;
        const vy = (1.2 + Math.random() * 4.6) * speedScale;
        const vz = (2.8 + Math.random() * 8.2) * speedScale;
        const maxLife = lifeRange * (0.65 + Math.random() * 0.55);

        this.particleGroup.add(mesh);
        this.particles.push({
          mesh,
          vx,
          vy,
          vz,
          gravity,
          scaleGrowth: 0,
          initialOpacity: 1.0,
          life: maxLife,
          maxLife
        });
      }
    },

    /**
     * Spawn Soft Translucent Grey-White Tire Drift Smoke Plumes behind Rear Tire (0:03 of user's video)
     */
    _spawnTireSmoke(origin, count = 2) {
      if (!this.particleGroup || !window.THREE) return;
      const THREE = window.THREE;

      const maxParticles = this.quality === 'PERFORMANCE' ? 140 : 280;
      if (this.particles.length > maxParticles) {
        const excess = this.particles.splice(0, count);
        excess.forEach((p) => this.particleGroup.remove(p.mesh));
      }

      const smokeGeo = new THREE.DodecahedronGeometry(0.22, 0);
      for (let i = 0; i < count; i++) {
        const shade = i % 2 === 0 ? 0xd8dee9 : 0xb0bac8;
        const smokeMat = new THREE.MeshBasicMaterial({
          color: shade,
          transparent: true,
          opacity: 0.28,
          depthWrite: false
        });
        const mesh = new THREE.Mesh(smokeGeo, smokeMat);
        mesh.position.set(
          (origin.x || 0) + (Math.random() - 0.5) * 0.35,
          Math.max(0.12, (origin.y || 0.16) + Math.random() * 0.12),
          (origin.z || 0) + (Math.random() - 0.5) * 0.35
        );
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);

        const vx = (Math.random() - 0.5) * 2.2;
        const vy = 0.65 + Math.random() * 1.1;
        const vz = 3.5 + Math.random() * 4.5;
        const maxLife = 0.42 + Math.random() * 0.22;

        this.particleGroup.add(mesh);
        this.particles.push({
          mesh,
          vx,
          vy,
          vz,
          gravity: -0.8, // smoke gently rises and billows outward
          scaleGrowth: 3.4,
          initialOpacity: 0.28,
          life: maxLife,
          maxLife
        });
      }
    },

    /**
     * Trigger Visual Effects ('sparks' | 'explosion' | 'cash' | 'nitro' | 'emp' | 'jump_cinematic')
     */
    triggerEffect(type, worldPos) {
      if (!this.initialized) return;
      const THREE = window.THREE;
      const pos = worldPos || {
        x: this.playerGroup ? this.playerGroup.position.x : 0,
        y: this.playerGroup ? this.playerGroup.position.y + 0.3 : 0.3,
        z: this.playerGroup ? this.playerGroup.position.z : 0
      };

      switch (type) {
        case 'sparks':
          this._spawnParticles(pos, 12, 0xffaa22, 1.0, 18.0, 0.38);
          this._spawnParticles(pos, 6, 0xffee77, 1.1, 18.0, 0.32);
          this._spawnTireSmoke(pos, 2);
          break;

        case 'explosion':
        case 'crash':
        case 'roadblock':
          this._spawnParticles(pos, 24, 0xff6611, 1.55, 15.0, 0.7);
          this._spawnParticles(pos, 16, 0xffcc44, 1.35, 13.0, 0.6);
          this._spawnTireSmoke(pos, 4);
          this.cameraShake = Math.max(this.cameraShake, 0.48);
          break;

        case 'cash':
          this._spawnParticles(pos, 14, 0x4ade80, 1.1, 8.0, 0.6);
          this._spawnParticles(pos, 6, 0xfef08a, 1.0, 8.0, 0.5);
          break;

        case 'nitro':
          this._spawnParticles(pos, 16, 0xffaa22, 1.4, 5.0, 0.45);
          this._spawnParticles(pos, 10, 0x66e0ff, 1.3, 5.0, 0.4);
          this.cameraShake = Math.max(this.cameraShake, 0.18);
          break;

        case 'emp':
        case 'weapon': {
          this._spawnParticles(pos, 20, 0x66e0ff, 1.6, 4.0, 0.55);
          this.cameraShake = Math.max(this.cameraShake, 0.32);
          if (THREE && this.particleGroup) {
            const ringMesh = new THREE.Mesh(
              new THREE.RingGeometry(0.6, 1.15, 32),
              new THREE.MeshBasicMaterial({
                color: 0x66e0ff,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.75
              })
            );
            ringMesh.rotation.x = -Math.PI / 2;
            ringMesh.position.set(pos.x || 0, (pos.y || 0) + 0.3, pos.z || 0);
            this.particleGroup.add(ringMesh);
            this.shockwaves.push({ mesh: ringMesh, life: 0.5, maxLife: 0.5 });
          }
          break;
        }

        case 'jump_cinematic':
          this.cinematicTimer = 1.65;
          this._spawnParticles(pos, 16, 0xffaa22, 1.3, 14.0, 0.55);
          this._spawnParticles(pos, 10, 0xffee77, 1.25, 14.0, 0.5);
          this._spawnTireSmoke(pos, 3);
          break;

        default:
          this._spawnParticles(pos, 10, 0xffaa22, 1.0, 14.0, 0.4);
          break;
      }
    },

    /**
     * Set Camera Mode ('chase' | 'front_cinematic' | 'low_action' | 'helicam_top' | 'cinematic_jump' | 'first_person' | 'heli' | 'menu')
     */
    setCameraMode(mode) {
      this.cameraMode = mode || 'chase';
      return this.cameraMode;
    },

    /**
     * Responsive Window / Container Resize Handler
     */
    resize() {
      if (!this.renderer || !this.camera) return;
      const width = (this.container && this.container.clientWidth) || window.innerWidth || 1280;
      const height = (this.container && this.container.clientHeight) || window.innerHeight || 720;
      this.camera.aspect = width / Math.max(1, height);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);

      if (this.postProcessor && typeof this.postProcessor.resize === 'function') {
        try {
          this.postProcessor.resize(width, height);
        } catch (_) {}
      } else if (
        typeof window !== 'undefined' &&
        window.GT6PostFX &&
        typeof window.GT6PostFX.resize === 'function'
      ) {
        try {
          window.GT6PostFX.resize(width, height);
        } catch (_) {}
      }
    },

    /**
     * Sync a dynamic entity list (obstacles, ramps, pickups, chasers) with a Mesh Map,
     * applying 3D curved highway offset `getCurveOffsetX(z)` and yaw `getCurveAngle(z)`!
     */
    _syncEntityPool(list, meshMap, factoryFn, time, wheelSpinDelta = 0) {
      const seenKeys = new Set();
      if (Array.isArray(list)) {
        for (let i = 0; i < list.length; i++) {
          const item = list[i];
          if (!item || item.active === false) continue;
          const key = item.id !== undefined ? item.id : `${item.type || 'ent'}_${i}`;
          seenKeys.add(key);

          let mesh = meshMap.get(key);
          if (!mesh) {
            mesh = factoryFn.call(this, item);
            this.scene.add(mesh);
            meshMap.set(key, mesh);
          }

          const x = item.x !== undefined ? item.x : LANES[item.lane || 0] || 0;
          const y = item.y !== undefined ? item.y : 0;
          const z = item.z !== undefined ? item.z : -50;

          const curveX = this.getCurveOffsetX(z);
          const curveAngle = this.getCurveAngle(z);

          mesh.position.set(x + curveX, y, z);

          if (meshMap === this.pickupMeshes) {
            mesh.rotation.y = time * 3.0 + i;
            mesh.position.y = (item.y || 0.75) + Math.sin(time * 4.5 + i) * 0.14;
          } else {
            const baseYaw =
              meshMap === this.obstacleMeshes && Number.isFinite(item.rotationY)
                ? item.rotationY
                : (mesh.userData && mesh.userData.baseRotationY) || 0;
            mesh.rotation.y = baseYaw + curveAngle;
          }

          // Animate police lightbars, point strobes & 3D wheels
          if (mesh.userData) {
            const flash = Math.sin(time * 22 + (mesh.userData.phaseOffset || 0)) > 0;
            if (mesh.userData.redBarMat && mesh.userData.redBarMat.color) {
              mesh.userData.redBarMat.color.setHex(flash ? 0xff1722 : 0x380408);
            }
            if (mesh.userData.blueBarMat && mesh.userData.blueBarMat.color) {
              mesh.userData.blueBarMat.color.setHex(flash ? 0x051838 : 0x0088ff);
            }
            if (mesh.userData.strobeLight && mesh.userData.strobeLight.color) {
              mesh.userData.strobeLight.color.setHex(flash ? 0xff1722 : 0x0088ff);
            }
            if (Array.isArray(mesh.userData.wheels) && wheelSpinDelta !== 0) {
              for (let w = 0; w < mesh.userData.wheels.length; w++) {
                const wh = mesh.userData.wheels[w];
                if (wh && wh.rotation) wh.rotation.x -= wheelSpinDelta;
              }
            }
          }
        }
      }

      // Remove stale meshes
      meshMap.forEach((mesh, key) => {
        if (!seenKeys.has(key)) {
          this.scene.remove(mesh);
          meshMap.delete(key);
        }
      });
    },

    /**
     * Update GT6PostFX Atmosphere (GLSL Nocturnal Sky Dome, Mist Rain & Wind Streaks)
     */
    _updateAtmosphere(fxState, safeDt) {
      if (this.atmosphere) {
        try {
          if (typeof this.atmosphere.update === 'function') {
            this.atmosphere.update(safeDt, fxState, this.camera);
          }
        } catch (_) {
          try {
            this.atmosphere.update(fxState, safeDt);
          } catch (__) {}
        }
      } else if (
        typeof window !== 'undefined' &&
        window.GT6PostFX &&
        typeof window.GT6PostFX.updateAtmosphere === 'function'
      ) {
        try {
          window.GT6PostFX.updateAtmosphere(safeDt, fxState, this.camera);
        } catch (_) {}
      }
    },

    /**
     * Execute Final Frame Render (via GT6PostFX HDR Bloom + GTA 6 Filmic Grading on ULTRA/HIGH,
     * or direct WebGLRenderer on PERFORMANCE / fallback)
     */
    _renderWithPostFX(fxState, safeDt) {
      const usePostFX =
        (this.quality === 'ULTRA' || this.quality === 'HIGH') &&
        (this.postProcessor || (typeof window !== 'undefined' && window.GT6PostFX));

      if (usePostFX) {
        try {
          if (this.postProcessor && typeof this.postProcessor.render === 'function') {
            if (this.postProcessor.render.length >= 3) {
              this.postProcessor.render(this.scene, this.camera, fxState, safeDt);
            } else {
              this.postProcessor.render(fxState, safeDt, this.scene, this.camera);
            }
            return;
          }
          if (
            typeof window !== 'undefined' &&
            window.GT6PostFX &&
            typeof window.GT6PostFX.render === 'function'
          ) {
            window.GT6PostFX.render(this.renderer, this.scene, this.camera, fxState, safeDt);
            return;
          }
        } catch (err) {
          console.warn('[GT6Renderer] Post-FX render fallback to direct WebGL:', err);
        }
      }

      this.renderer.render(this.scene, this.camera);
    },

    /**
     * Main Per-Frame Render & World Update
     * @param {Object} state - Game state from window.GT6Game
     * @param {number} dt - Delta time in seconds
     */
    renderFrame(state, dt = 0.016) {
      if (!this.initialized || !this.renderer || !this.scene || !this.camera) return;

      const safeDt = Math.min(Math.max(Number(dt) || 0.016, 0.001), 0.1);
      this.elapsedTime += safeDt;
      if (this.cinematicTimer > 0) {
        this.cinematicTimer = Math.max(0, this.cinematicTimer - safeDt);
      }

      // Lazy-connect GT6PostFX if it loaded after init()
      if (!this.postProcessor && typeof window !== 'undefined' && window.GT6PostFX) {
        const w = (this.container && this.container.clientWidth) || window.innerWidth || 1280;
        const h = (this.container && this.container.clientHeight) || window.innerHeight || 720;
        this._initPostProcessing(w, h);
      }
      if (
        !this.atmosphere &&
        typeof window !== 'undefined' &&
        window.GT6PostFX &&
        typeof window.GT6PostFX.createAtmosphere === 'function'
      ) {
        try {
          this.atmosphere = window.GT6PostFX.createAtmosphere(this.scene, this.camera);
        } catch (_) {}
      }

      // Extract resilient state values
      const s = state || {};
      const mode = s.mode || 'MENU';
      const speedKmh = Number.isFinite(s.speed) ? s.speed : mode === 'MENU' ? 115 : 140;
      const speedRatio = Math.min(1, Math.max(0, speedKmh / 300));
      const worldSpeed = (speedKmh / 3.6) * 1.18;
      const playerX = Number.isFinite(s.x) ? s.x : LANES[s.laneIndex ?? 1] ?? -1.5;
      const playerY = Number.isFinite(s.y) ? Math.max(0, s.y) : 0;
      const playerZ = Number.isFinite(s.z) ? s.z : 0;
      const isDrifting = Boolean(s.isDrifting);
      const isJumping = Boolean(s.isJumping) || playerY > 0.15;
      const isCinematicJump =
        Boolean(s.isCinematicJump) || this.cinematicTimer > 0 || playerY > 1.35;
      const isNitro = Boolean(
        s.isNitro || s.nitroActive || s.isBoosting || (s.nitroBoostTimer && s.nitroBoostTimer > 0)
      );
      const wantedStars = Number.isFinite(s.wantedStars) ? s.wantedStars : 6;

      // Sync optional cameraMode from game state if changed externally
      if (s.cameraMode && s.cameraMode !== this._lastStateCameraMode) {
        this._lastStateCameraMode = s.cameraMode;
        this.cameraMode = s.cameraMode;
      }

      // Read `state.roadCurve` (or gentle demo curve in MENU mode so the highway visibly curves!)
      if (Number.isFinite(s.roadCurve)) {
        this.roadCurve = s.roadCurve;
      } else if (Number.isFinite(s.roadCurvature)) {
        this.roadCurve = s.roadCurvature;
      } else if (mode === 'MENU') {
        this.roadCurve = Math.sin(this.elapsedTime * 0.35) * 0.38;
      } else {
        this.roadCurve = 0;
      }

      // 1. Scroll & Deform Infinite 3D Curved Highway Segments seamlessly
      const totalHighwayLen = NUM_ROAD_SEGMENTS * SEGMENT_LENGTH;
      for (let i = 0; i < this.roadSegments.length; i++) {
        const seg = this.roadSegments[i];
        seg.position.z += worldSpeed * safeDt;
        if (seg.position.z > 45) {
          seg.position.z -= totalHighwayLen;
        }

        const segZ = seg.position.z;
        seg.position.x = this.getCurveOffsetX(segZ);
        seg.rotation.y = this.getCurveAngle(segZ);

        // Apply exact quadratic sagitta to each subdivided 10m road slice & scenery item
        if (seg.userData && Array.isArray(seg.userData.subSlices)) {
          const slices = seg.userData.subSlices;
          for (let j = 0; j < slices.length; j++) {
            const sl = slices[j];
            const u = sl.userData.zLocal || 0;
            sl.position.x = this.getCurveOffsetX(u);
            sl.rotation.y = this.getCurveAngle(u);
          }
        }
        if (seg.userData && Array.isArray(seg.userData.sceneryItems)) {
          const items = seg.userData.sceneryItems;
          for (let j = 0; j < items.length; j++) {
            const item = items[j];
            const u = item.userData.zLocal || 0;
            const baseX = item.userData.baseX || 0;
            const baseRotY = item.userData.baseRotY || 0;
            item.position.x = baseX + this.getCurveOffsetX(u);
            item.rotation.y = baseRotY + this.getCurveAngle(u);
          }
        }
      }

      // Shift distant skyline subtly with the road curve
      if (this.skylineGroup) {
        this.skylineGroup.position.x = this.getCurveOffsetX(-135) * 0.42;
      }

      // 2. Update Rafa & Chopper Position, Roll, Pitch, Counter-Steering & Wheel Spin
      const wheelSpin = worldSpeed * safeDt * 2.2;
      if (this.playerGroup) {
        const prevX = this.playerGroup.position.x;
        const playerCurveX = this.getCurveOffsetX(playerZ);
        const targetWorldX = playerX + playerCurveX;
        this.playerGroup.position.x += (targetWorldX - prevX) * Math.min(1, safeDt * 18);
        this.playerGroup.position.y = playerY;
        this.playerGroup.position.z = playerZ;

        const lateralVel = Number.isFinite(s.vx)
          ? s.vx
          : (targetWorldX - this.playerGroup.position.x) * 3.8;
        const targetRoll = Number.isFinite(s.roll)
          ? s.roll
          : Math.max(-0.46, Math.min(0.46, -lateralVel * 0.08 + (isDrifting ? 0.26 : 0)));
        const targetPitch = Number.isFinite(s.pitch)
          ? s.pitch
          : isJumping
          ? 0.22
          : isNitro
          ? 0.1
          : 0;
        const driftYaw = Number.isFinite(s.driftAngle)
          ? s.driftAngle
          : isDrifting
          ? (targetRoll >= 0 ? 0.16 : -0.16) + Math.sin(this.elapsedTime * 14) * 0.04
          : 0;

        if (this.bikeGroup) {
          this.bikeGroup.rotation.z +=
            (targetRoll - this.bikeGroup.rotation.z) * Math.min(1, safeDt * 12);
          this.bikeGroup.rotation.x +=
            (targetPitch - this.bikeGroup.rotation.x) * Math.min(1, safeDt * 10);
          this.bikeGroup.rotation.y +=
            (this.getCurveAngle(playerZ) + driftYaw - this.bikeGroup.rotation.y) *
            Math.min(1, safeDt * 10);
        }

        if (this.steeringGroup && this.bikeGroup) {
          const steerInput = Number.isFinite(s.steerAngle)
            ? s.steerAngle
            : -this.bikeGroup.rotation.z * 0.55;
          this.steeringGroup.rotation.y = steerInput;
        }

        // Natural rider head & torso counter-lean into corners (Rafa stays firmly stabilized on the saddle!)
        if (this.riderHead && this.bikeGroup) {
          this.riderHead.rotation.z = -this.bikeGroup.rotation.z * 0.32;
          this.riderHead.rotation.y = -this.bikeGroup.rotation.z * 0.22;
        }

        // Rotate fat tires
        if (this.frontWheelGroup) this.frontWheelGroup.rotation.x -= wheelSpin;
        if (this.rearWheelGroup) this.rearWheelGroup.rotation.x -= wheelSpin;

        // Nitro Thruster Flames (only visible when Nitro boost is active)
        const flameOpacity = isNitro ? 0.85 : 0.0;
        const flicker = 0.85 + Math.sin(this.elapsedTime * 48) * 0.25;
        if (Array.isArray(this.nitroFlames) && this.nitroFlames.length > 0) {
          for (let f = 0; f < this.nitroFlames.length; f++) {
            const fl = this.nitroFlames[f];
            if (!fl) continue;
            fl.visible = isNitro;
            if (fl.material) fl.material.opacity = flameOpacity;
            if (fl.scale) fl.scale.set(1, 1, flicker);
          }
        }

        // Subtle realistic tail/brake light & under-frame bounce light
        if (this.underGlowLight) {
          if (isNitro) {
            this.underGlowLight.color.setHex(0x66e0ff);
            this.underGlowLight.intensity = 2.0 + Math.sin(this.elapsedTime * 28) * 0.4;
          } else {
            this.underGlowLight.color.setHex(0xd9141d);
            this.underGlowLight.intensity = 1.05;
          }
        }

        // Emit Realistic Golden-Orange Friction Sparks (#ffaa22 / #ffee77) AND Translucent Grey-White Drift Smoke Plumes (0:03 of video!)
        const currentRollAbs = Math.abs(
          this.bikeGroup ? this.bikeGroup.rotation.z : s.roll || 0
        );
        if ((isDrifting || currentRollAbs > 0.18) && !isJumping) {
          const leanSign = (this.bikeGroup ? this.bikeGroup.rotation.z : s.roll || 0) >= 0 ? -1 : 1;
          const sparkOrigin = {
            x: this.playerGroup.position.x + leanSign * 0.22,
            y: 0.08,
            z: this.playerGroup.position.z + 0.92
          };
          const smokeOrigin = {
            x: this.playerGroup.position.x,
            y: 0.15,
            z: this.playerGroup.position.z + 1.05
          };

          this._spawnParticles(
            sparkOrigin,
            isDrifting ? 3 : 2,
            Math.random() > 0.35 ? 0xffaa22 : 0xffee77,
            0.85,
            18.0,
            0.32
          );
          if (isDrifting || currentRollAbs > 0.24 || Math.random() > 0.35) {
            this._spawnTireSmoke(smokeOrigin, isDrifting ? 2 : 1);
          }
        }
      }

      // 3. Alternating Red/Blue Police Siren PointLight illuminating Rafa from behind
      if (this.policeSirenLight && this.playerGroup) {
        const sirenFlash = Math.sin(this.elapsedTime * 22) > 0;
        this.policeSirenLight.color.setHex(sirenFlash ? 0xff1722 : 0x0088ff);
        this.policeSirenLight.intensity =
          (0.85 + Math.min(6, wantedStars) * 0.28) *
          (0.75 + 0.25 * Math.abs(Math.sin(this.elapsedTime * 22)));
        this.policeSirenLight.position.set(
          this.playerGroup.position.x + (sirenFlash ? -1.1 : 1.1),
          this.playerGroup.position.y + 2.2,
          this.playerGroup.position.z + 4.2
        );
      }

      // 4. Sync Dynamic Obstacles, Ramps, Pickups & Chasers along the curving 3D highway
      this._syncEntityPool(
        s.obstacles,
        this.obstacleMeshes,
        this._createObstacleMesh,
        this.elapsedTime,
        wheelSpin
      );
      this._syncEntityPool(
        s.ramps,
        this.rampMeshes,
        this._createRampMesh,
        this.elapsedTime,
        0
      );
      this._syncEntityPool(
        s.pickups,
        this.pickupMeshes,
        this._createPickupMesh,
        this.elapsedTime,
        0
      );
      this._syncEntityPool(
        s.chasers,
        this.chaserMeshes,
        () => this._createPoliceCruiserMesh(true, 'police_car'),
        this.elapsedTime,
        wheelSpin
      );

      // Update built-in ambient trailing police cruisers (following roadCurve behind Rafa)
      const hasCustomChasers = Array.isArray(s.chasers) && s.chasers.length > 0;
      for (let i = 0; i < this.ambientChasers.length; i++) {
        const cop = this.ambientChasers[i];
        cop.visible = !hasCustomChasers && wantedStars >= i + 1;
        if (cop.visible && this.playerGroup) {
          const copZ =
            5.6 +
            i * 2.2 -
            Math.min(2.0, wantedStars * 0.22) +
            Math.sin(this.elapsedTime * 3.1 + i) * 0.4;
          const copCurveX = this.getCurveOffsetX(copZ);
          const targetCopX =
            this.playerGroup.position.x +
            copCurveX +
            (i === 0 ? -1.6 : 1.6) +
            Math.sin(this.elapsedTime * 2.3 + i * 2) * 0.65;
          cop.position.x += (targetCopX - cop.position.x) * safeDt * 4.0;
          cop.position.z = copZ;
          const baseYaw = (cop.userData && cop.userData.baseRotationY) || 0;
          cop.rotation.y = baseYaw + this.getCurveAngle(copZ);

          const flash = Math.sin(this.elapsedTime * 24 + i * 2.0) > 0;
          if (cop.userData && cop.userData.redBarMat && cop.userData.redBarMat.color) {
            cop.userData.redBarMat.color.setHex(flash ? 0xff1722 : 0x380408);
          }
          if (cop.userData && cop.userData.blueBarMat && cop.userData.blueBarMat.color) {
            cop.userData.blueBarMat.color.setHex(flash ? 0x051838 : 0x0088ff);
          }
        }
      }

      // 5. Update Overhead Police Helicopter & Sweeping Volumetric Searchlight
      if (this.heliGroup) {
        const showHeli =
          Boolean(s.heliActive) || wantedStars >= 4 || mode === 'MENU' || isCinematicJump;
        this.heliGroup.visible = showHeli;
        if (this.heliSpotLight) this.heliSpotLight.visible = showHeli;
        if (this.heliGroundRing) this.heliGroundRing.visible = showHeli;

        if (showHeli && this.playerGroup) {
          if (this.heliMainRotor) this.heliMainRotor.rotation.y += safeDt * 28.0;
          if (this.heliTailRotor) this.heliTailRotor.rotation.x += safeDt * 32.0;

          const isFrontHeroCam =
            this.cameraMode === 'front_cinematic' || this.cameraMode === 'low_action';
          const heliTargetZ = isFrontHeroCam
            ? 14.5 + Math.cos(this.elapsedTime * 0.85) * 2.5
            : -15.5 + Math.cos(this.elapsedTime * 0.85) * 3.5;
          const heliCurveX = this.getCurveOffsetX(heliTargetZ);
          const heliTargetX =
            this.playerGroup.position.x * 0.65 +
            heliCurveX +
            Math.sin(this.elapsedTime * 1.15) * 4.0;
          const heliTargetY = 12.2 + Math.sin(this.elapsedTime * 2.1) * 0.7;

          this.heliGroup.position.x +=
            (heliTargetX - this.heliGroup.position.x) * safeDt * 3.5;
          this.heliGroup.position.y +=
            (heliTargetY - this.heliGroup.position.y) * safeDt * 3.5;
          this.heliGroup.position.z +=
            (heliTargetZ - this.heliGroup.position.z) * safeDt * 3.5;
          this.heliGroup.rotation.z = Math.sin(this.elapsedTime * 1.15) * -0.14;
          this.heliGroup.rotation.x = 0.14;
          this.heliGroup.rotation.y = this.getCurveAngle(this.heliGroup.position.z);

          const sweepZ = Number.isFinite(s.heliSearchlightZ)
            ? s.heliSearchlightZ
            : isFrontHeroCam
            ? 1.5 + Math.cos(this.elapsedTime * 1.9) * 2.5
            : -2.0 + Math.cos(this.elapsedTime * 1.9) * 3.5;
          const sweepX =
            (Number.isFinite(s.heliSearchlightX)
              ? s.heliSearchlightX
              : this.playerGroup.position.x + Math.sin(this.elapsedTime * 2.4) * 2.4) +
            this.getCurveOffsetX(sweepZ);

          if (this.heliSpotLight && this.heliSpotLight.target) {
            this.heliSpotLight.target.position.set(sweepX, 0, sweepZ);
          }
          if (this.heliLightCone && typeof this.heliLightCone.lookAt === 'function') {
            this.heliLightCone.lookAt(sweepX, 0, sweepZ);
            this.heliLightCone.rotateX(Math.PI / 2);
          }

          if (this.heliGroundRing) {
            this.heliGroundRing.position.set(sweepX, 0.035, sweepZ);
            this.heliGroundRing.rotation.z = this.elapsedTime * 2.5;
          }

          const hFlash = Math.sin(this.elapsedTime * 20) > 0;
          if (
            this.heliRedLight &&
            this.heliRedLight.material &&
            this.heliRedLight.material.color
          ) {
            this.heliRedLight.material.color.setHex(hFlash ? 0xff1e27 : 0x330408);
          }
          if (
            this.heliBlueLight &&
            this.heliBlueLight.material &&
            this.heliBlueLight.material.color
          ) {
            this.heliBlueLight.material.color.setHex(hFlash ? 0x041833 : 0x0088ff);
          }
        }
      }

      // 6. Update 3D Particles (Golden-Orange Sparks & Expanding Tire Smoke Plumes) & Shockwaves
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= safeDt;
        if (p.life <= 0) {
          this.particleGroup.remove(p.mesh);
          this.particles.splice(i, 1);
          continue;
        }
        p.vy -= p.gravity * safeDt;
        p.mesh.position.x += p.vx * safeDt;
        p.mesh.position.y = Math.max(0.04, p.mesh.position.y + p.vy * safeDt);
        p.mesh.position.z += (p.vz + worldSpeed * 0.32) * safeDt;

        const lifeRatio = Math.max(0, p.life / p.maxLife);
        const initOp = p.initialOpacity !== undefined ? p.initialOpacity : 1.0;
        p.mesh.material.opacity = lifeRatio * initOp;

        if (p.scaleGrowth && p.scaleGrowth > 0) {
          const sFactor = 1.0 + (1.0 - lifeRatio) * p.scaleGrowth;
          p.mesh.scale.set(sFactor, sFactor * 0.85, sFactor);
        }
      }

      for (let i = this.shockwaves.length - 1; i >= 0; i--) {
        const sw = this.shockwaves[i];
        sw.life -= safeDt;
        if (sw.life <= 0) {
          this.particleGroup.remove(sw.mesh);
          this.shockwaves.splice(i, 1);
          continue;
        }
        const progress = 1 - sw.life / sw.maxLife;
        const scale = 1 + progress * 15.0;
        sw.mesh.scale.set(scale, scale, 1);
        sw.mesh.material.opacity = (1 - progress) * 0.78;
      }

      // 7. Update Grounded GTA 6 Camera Angles
      if (Number.isFinite(s.cameraShake) && s.cameraShake > this.cameraShake) {
        this.cameraShake = s.cameraShake;
      }
      this._updateCamera(mode, speedKmh, isCinematicJump, isNitro, safeDt);

      // 8. Build Unified Post-FX & Atmosphere Frame State and Render
      const fxState = {
        mode,
        dt: safeDt,
        time: this.elapsedTime,
        elapsedTime: this.elapsedTime,
        speed: speedKmh,
        speedKmh,
        speedRatio,
        worldSpeed,
        roadCurve: this.roadCurve,
        isBoosting: isNitro,
        isNitro,
        nitroActive: isNitro,
        isDrifting,
        isJumping,
        isCinematicJump,
        wantedStars,
        stars: wantedStars,
        cameraShake: this.cameraShake,
        quality: this.quality,
        playerX: this.playerGroup ? this.playerGroup.position.x : playerX,
        playerY: this.playerGroup ? this.playerGroup.position.y : playerY,
        playerZ: this.playerGroup ? this.playerGroup.position.z : playerZ
      };

      this._updateAtmosphere(fxState, safeDt);
      this._renderWithPostFX(fxState, safeDt);
    },

    /**
     * Grounded GTA 6 Camera System:
     * - `'chase'` (Default — matches 0:05–0:09 of the video): Grounded, tight 3rd-person motorcycle camera
     *   (`y = 2.0 + playerY * 0.6`, `z = 4.6`, subtle lateral follow + banking tilt into curves, looking ahead down the curving avenue).
     * - `'front_cinematic'` / `'low_action'` (Matches 0:00–0:04 of the video!): Hero front-three-quarter chase camera
     *   positioned ahead and to the side of Rafa looking back at Rafa's face, glasses, PT-13/EDTECH jacket,
     *   round glowing LED headlight, and the chasing police cars + helicopter spotlight behind him!
     * - `'cinematic_jump'` (Matches 0:08–0:09 of the video): Dramatic low-angle side/rear slow-mo camera as Rafa
     *   jumps the concrete overpass ramp over the crashing police blockade!
     */
    _updateCamera(mode, speedKmh, isCinematicJump, isNitro, dt) {
      const px = this.playerGroup ? this.playerGroup.position.x : 0;
      const py = this.playerGroup ? this.playerGroup.position.y : 0;
      const pz = this.playerGroup ? this.playerGroup.position.z : 0;
      const bikeRoll = this.bikeGroup ? this.bikeGroup.rotation.z : 0;

      // Default: 'chase' (Grounded GTA 6 third-person motorcycle camera matching 0:05-0:09)
      let desiredPosX = px * 0.84 + this.getCurveOffsetX(pz + 4.6) * 0.45 - bikeRoll * 0.35;
      let desiredPosY = 2.0 + py * 0.6;
      let desiredPosZ = pz + 4.6;

      let lookX = px * 0.68 + this.getCurveOffsetX(pz - 18.0) * 0.62;
      let lookY = 1.18 + py * 0.65;
      let lookZ = pz - 18.0;
      let targetFov =
        58 + Math.min(18, Math.max(0, (speedKmh - 95) * 0.09)) + (isNitro ? 6 : 0);
      let targetBank = -bikeRoll * 0.14 - this.roadCurve * 0.04;

      if (
        isCinematicJump ||
        this.cameraMode === 'cinematic' ||
        this.cameraMode === 'cinematic_jump' ||
        this.cameraMode === 'jump'
      ) {
        // Dramatic low-angle side/rear slow-mo camera matching 0:08-0:09 overpass jump
        desiredPosX = px + 2.45 + this.getCurveOffsetX(pz + 3.9);
        desiredPosY = Math.max(1.05, 1.12 + py * 0.46);
        desiredPosZ = pz + 3.9;
        lookX = px + this.getCurveOffsetX(pz - 3.5) * 0.35;
        lookY = py + 1.22;
        lookZ = pz - 4.2;
        targetFov = 52;
        targetBank = -0.04;
      } else if (
        this.cameraMode === 'front_cinematic' ||
        this.cameraMode === 'low_action'
      ) {
        // Hero front-three-quarter chase camera matching 0:00-0:04 of the user's video!
        // Positioned ahead and to the side of Rafa looking back at Rafa's face, glasses,
        // PT-13/EDTECH chest jacket, round LED headlight, and the pursuing police cars + helicopter behind him!
        desiredPosX = px + 1.28 + this.getCurveOffsetX(pz - 3.6);
        desiredPosY = Math.max(0.95, 1.16 + py * 0.55);
        desiredPosZ = pz - 3.6;
        lookX = px * 0.92 + this.getCurveOffsetX(pz + 3.4) * 0.35;
        lookY = py + 1.24;
        lookZ = pz + 3.6;
        targetFov = 54 + (isNitro ? 4 : 0);
        targetBank = bikeRoll * 0.1;
      } else if (this.cameraMode === 'first_person' || this.cameraMode === 'hood') {
        desiredPosX = px;
        desiredPosY = py + 1.78;
        desiredPosZ = pz - 0.35;
        lookX = px + this.getCurveOffsetX(pz - 26.0) * 0.85;
        lookY = py + 1.45;
        lookZ = pz - 26.0;
        targetFov = 72;
        targetBank = -bikeRoll * 0.22;
      } else if (this.cameraMode === 'heli' || this.cameraMode === 'helicam_top') {
        desiredPosX = px + Math.sin(this.elapsedTime * 0.8) * 4.5;
        desiredPosY = 11.0;
        desiredPosZ = pz + 9.0;
        lookX = px + this.getCurveOffsetX(pz - 6.0) * 0.5;
        lookY = py + 1.0;
        lookZ = pz - 6.0;
        targetFov = 54;
        targetBank = 0;
      } else if (mode === 'MENU' && this.cameraMode === 'menu') {
        desiredPosX = px + Math.sin(this.elapsedTime * 0.55) * 3.4;
        desiredPosY = 2.15;
        desiredPosZ = pz + 4.8;
        lookX = px;
        lookY = 1.25;
        lookZ = pz - 4.0;
        targetBank = 0;
      }

      if (this.cameraShake > 0.001) {
        desiredPosX += (Math.random() - 0.5) * this.cameraShake * 0.7;
        desiredPosY += (Math.random() - 0.5) * this.cameraShake * 0.7;
        this.cameraShake = Math.max(0, this.cameraShake - dt * 1.9);
      }

      const lerpFactor = Math.min(1, dt * 9.5);
      this.currentCamPos.x += (desiredPosX - this.currentCamPos.x) * lerpFactor;
      this.currentCamPos.y += (desiredPosY - this.currentCamPos.y) * lerpFactor;
      this.currentCamPos.z += (desiredPosZ - this.currentCamPos.z) * lerpFactor;

      this.currentLookAt.x += (lookX - this.currentLookAt.x) * lerpFactor;
      this.currentLookAt.y += (lookY - this.currentLookAt.y) * lerpFactor;
      this.currentLookAt.z += (lookZ - this.currentLookAt.z) * lerpFactor;

      this.camera.position.copy(this.currentCamPos);
      this.camera.lookAt(this.currentLookAt);

      // Subtle physical camera banking tilt into motorcycle turns
      this.cameraBank += (targetBank - this.cameraBank) * Math.min(1, dt * 8.0);
      this.camera.rotation.z += this.cameraBank;

      if (Math.abs(this.camera.fov - targetFov) > 0.05) {
        this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 6.0);
        this.camera.updateProjectionMatrix();
      }
    },

    // Convenient aliases so any caller convention works seamlessly
    render(state, dt) {
      return this.renderFrame(state, dt);
    },
    update(state, dt) {
      return this.renderFrame(state, dt);
    }
  };

  if (typeof window !== 'undefined') {
    window.GT6Renderer = GT6Renderer;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = GT6Renderer;
  }
})();
