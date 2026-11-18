/**
 * GT6 RAFA: FUGA DE VICE CITY (EDTECH PT-13 EDITION)
 * 60 FPS Curved Continuous Wet-Asphalt Highway, Photorealistic GTA 6 Night City & Draw-Call Optimized 3D Renderer
 * Attached to: window.GT6Renderer
 */
(function () {
  'use strict';

  const LANES = [-4.5, -1.5, 1.5, 4.5];
  const ROAD_WIDTH = 14.0;
  const RIBBON_WIDTH = 42.0;
  const RIBBON_LENGTH = 260.0;
  const RIBBON_Z_SHIFT = -95.0; // Spans z = -225 (far horizon) to z = +35 (behind camera)
  const RIBBON_TILE_METERS = 20.0; // 260 / 13 repeats = 20m per repeating road texture tile
  const SCENERY_Z_MIN = -225.0;
  const SCENERY_Z_MAX = 35.0;
  const SCENERY_SPAN = SCENERY_Z_MAX - SCENERY_Z_MIN; // 260m continuous recycle loop

  const QUALITY_PRESETS = ['HIGH', 'ULTRA', 'PERFORMANCE'];

  // Helper for rounded rectangles on 2D canvas
  function fillRoundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
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

  // Deterministic pseudo-random helper for architectural windows & puddles
  function seededRandom(seed) {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  // Normalize quality preset string cleanly across UI/PostFX conventions
  function normalizeQualityPreset(preset) {
    const raw = String(preset || 'HIGH').toUpperCase().trim();
    if (
      raw === 'PERFORMANCE' ||
      raw.includes('PERF') ||
      raw.includes('LEVE') ||
      raw === 'LOW' ||
      raw === 'FAST' ||
      raw === '3D 60FPS'
    ) {
      return 'PERFORMANCE';
    }
    if (
      raw === 'ULTRA' ||
      raw.includes('BLOOM') ||
      raw === '3D ULTRA' ||
      raw === '3D ULTRA HD'
    ) {
      return 'ULTRA';
    }
    return 'HIGH';
  }

  // Translate/rotate/scale a BufferGeometry in place before merging
  function bakeGeoTransform(geo, tx, ty, tz, rx, ry, rz, sx, sy, sz) {
    if (sx !== undefined || sy !== undefined || sz !== undefined) {
      geo.scale(sx !== undefined ? sx : 1, sy !== undefined ? sy : 1, sz !== undefined ? sz : 1);
    }
    if (rx) geo.rotateX(rx);
    if (ry) geo.rotateY(ry);
    if (rz) geo.rotateZ(rz);
    if (tx || ty || tz) geo.translate(tx || 0, ty || 0, tz || 0);
    return geo;
  }

  // Remap upward-facing roof UVs onto a dark concrete rooftop corner patch so roofs never show window textures
  function remapRoofUVs(geo, uMin, uMax, vMin, vMax) {
    const nonIdx = geo.index ? geo.toNonIndexed() : geo;
    if (!nonIdx.getAttribute('normal')) {
      nonIdx.computeVertexNormals();
    }
    const normAttr = nonIdx.getAttribute('normal');
    const uvAttr = nonIdx.getAttribute('uv');
    if (normAttr && uvAttr) {
      for (let i = 0; i < normAttr.count; i++) {
        if (normAttr.getY(i) > 0.72) {
          const u = uMin + (uvAttr.getX(i) % 1) * (uMax - uMin);
          const v = vMin + (uvAttr.getY(i) % 1) * (vMax - vMin);
          uvAttr.setXY(i, u, v);
        }
      }
      uvAttr.needsUpdate = true;
    }
    if (nonIdx !== geo) geo.dispose();
    return nonIdx;
  }

  // Merge an array of BufferGeometries into a single draw call (Three.js r128 compatible)
  function mergeGeometries(THREE, geometries) {
    const prepared = [];
    let totalVerts = 0;

    for (let i = 0; i < geometries.length; i++) {
      const src = geometries[i];
      if (!src) continue;
      const g = src.index ? src.toNonIndexed() : src;
      const pos = g.getAttribute('position');
      if (!pos || pos.count === 0) {
        if (g !== src) g.dispose();
        continue;
      }
      if (!g.getAttribute('normal')) {
        g.computeVertexNormals();
      }
      prepared.push(g);
      totalVerts += pos.count;
    }

    const merged = new THREE.BufferGeometry();
    if (totalVerts === 0) return merged;

    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);
    const uvs = new Float32Array(totalVerts * 2);

    let offset = 0;
    for (let i = 0; i < prepared.length; i++) {
      const g = prepared[i];
      const pos = g.getAttribute('position');
      const norm = g.getAttribute('normal');
      const uv = g.getAttribute('uv');
      const count = pos.count;

      positions.set(pos.array.subarray(0, count * 3), offset * 3);
      if (norm) {
        normals.set(norm.array.subarray(0, count * 3), offset * 3);
      }
      if (uv) {
        uvs.set(uv.array.subarray(0, count * 2), offset * 2);
      }
      offset += count;
    }

    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    for (let i = 0; i < geometries.length; i++) {
      if (geometries[i] && typeof geometries[i].dispose === 'function') {
        geometries[i].dispose();
      }
    }
    for (let i = 0; i < prepared.length; i++) {
      if (prepared[i] && typeof prepared[i].dispose === 'function') {
        prepared[i].dispose();
      }
    }

    if (typeof merged.computeBoundingSphere === 'function') {
      merged.computeBoundingSphere();
    }
    return merged;
  }

  const GT6Renderer = {
    initialized: false,
    _initialized: false,
    container: null,
    scene: null,
    camera: null,
    renderer: null,

    // Graphics Quality & Post-FX state (defaults to 'HIGH' -> 60FPS HD direct render)
    quality: 'HIGH',
    envMap: null,
    postProcessor: null,
    atmosphere: null,
    wetAsphaltTextures: null,

    // 3D Curved Highway state
    roadCurve: 0,
    targetRoadCurve: 0,

    // Single-Mesh Continuous Curved Highway Ribbon state
    roadRibbon: null,
    roadRibbonTex: null,
    roadRibbonRoughTex: null,
    _ribbonGeo: null,
    _ribbonPosAttr: null,
    _ribbonBaseX: null,
    _ribbonBaseZ: null,
    _ribbonVertCount: 0,

    // Camera state
    cameraMode: 'chase',
    _lastStateCameraMode: null,
    cameraShake: 0,
    cameraBank: 0,
    cinematicTimer: 0,
    currentLookAt: null,
    currentCamPos: null,

    // Strictly <= 3 Scene Lights (Hemisphere + Directional + 1 dynamic Police Siren PointLight)
    moonLight: null,
    hemiLight: null,
    policeSirenLight: null,
    pinkFillLight: null,
    cyanFillLight: null,
    underGlowLight: null,

    // Player & Chopper parts
    playerGroup: null,
    playerShadow: null,
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
    headlightGroundPool: null,
    tailLightMat: null,
    nitroFlames: [],
    nitroFlameLeft: null,
    nitroFlameRight: null,
    empShieldMesh: null,

    // Recycled World Scenery Pools (Zero slices, low draw calls)
    roadSegments: [],
    sceneryPool: [],
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

    // Zero-allocation Pooled Particle Systems (Sparks + Soft Smoke Sprites + Shockwaves)
    particles: [],
    sparkPool: [],
    sparkPoolCursor: 0,
    smokePool: [],
    smokePoolCursor: 0,
    particleGroup: null,
    shockwaves: [],

    // Cached procedural textures, geometries & materials
    textures: {},
    materials: {},
    geometries: {},

    // Internal clock & scrolling accumulators
    elapsedTime: 0,
    scrollOffset: 0,
    scrollMeters: 0,
    _lastStateDistance: null,

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
      return curve * ((dz * dz) * 0.0028);
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
      const slope = curve * (dz * 0.0056);
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
      this.scene.background = new THREE.Color(0x060911);
      this.scene.fog = new THREE.FogExp2(0x111824, 0.0052);

      // 2. Perspective Camera
      const width = (this.container && this.container.clientWidth) || window.innerWidth || 1280;
      const height = (this.container && this.container.clientHeight) || window.innerHeight || 720;
      this.camera = new THREE.PerspectiveCamera(58, width / Math.max(1, height), 0.1, 420);
      this.camera.position.copy(this.currentCamPos);
      this.camera.lookAt(this.currentLookAt);

      // 3. WebGLRenderer (ShadowMap disabled by default for 60 FPS; crisp contact shadows used instead)
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false
      });
      this.renderer.setSize(width, height);
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      this.renderer.setPixelRatio(Math.min(dpr, 1.25));
      if (this.renderer.shadowMap) {
        this.renderer.shadowMap.enabled = false;
      }
      if (THREE.ACESFilmicToneMapping !== undefined) {
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.18;
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

      // 5. Build Procedural Textures, Glow Sprites, Shadow Decals & Shared Materials
      this._buildProceduralTextures();
      this._loadPosterTexture();

      // 6. Setup Lean <= 3 Light Nocturnal Lighting (Hemisphere + Moonlight + Police Siren PointLight)
      this._setupLighting();

      // 7. Build Skybox, Nocturnal Atmosphere (GT6PostFX.createAtmosphere) & Merged Downtown Skyline
      this._buildSkyAndSkyline();

      // 8. Build Single Continuous Curved Wet-Asphalt Highway Ribbon + Compact Recycled Vice City Scenery
      this._buildInfiniteHighway();

      // 9. Build Rafa & The Red Fat-Tire Electric Chopper (via GT6Models.buildRafaAndChopper + fallback)
      this._buildRafaChopper();

      // 10. Build Chasing Police Cruisers & Overhead Police Helicopter (via GT6Models + fallback)
      this._buildAmbientChasers();
      this._buildPoliceHelicopter();

      // 11. Build Zero-Allocation Pooled Particle & FX System
      this._initParticlePools();

      // 12. Initialize Post-Processing Pipeline (lazy until ULTRA) & Apply Default 'HIGH' (60FPS HD) Preset
      this._initPostProcessing(width, height);
      this.setQuality(this.quality || 'HIGH');

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
     * Expose real-time draw calls, triangles & active quality preset for QA and telemetry
     * @returns {{ drawCalls: number, triangles: number, quality: string }}
     */
    getPerfStats() {
      const renderInfo =
        (this.renderer && this.renderer.info && this.renderer.info.render) || {};
      return {
        drawCalls: Number(renderInfo.calls) || 0,
        triangles: Number(renderInfo.triangles) || 0,
        quality: this.quality
      };
    },

    /**
     * Strip extra dynamic SpotLights/PointLights from external GT6Models groups so active scene lights stay <= 3,
     * and disable expensive shadow-map casting in favor of crisp ground contact decals.
     */
    _stripExtraLights(root) {
      if (!root || typeof root.traverse !== 'function') return;
      const toRemove = [];
      root.traverse((node) => {
        if (!node) return;
        if (node.isLight) {
          toRemove.push(node);
          if (node.target && node.target.parent) {
            toRemove.push(node.target);
          }
        } else if (node.isMesh) {
          node.castShadow = false;
          node.receiveShadow = false;
        }
      });
      for (let i = 0; i < toRemove.length; i++) {
        const obj = toRemove[i];
        obj.visible = false;
        if (obj.parent) obj.parent.remove(obj);
      }
    },

    /**
     * Create a soft dark ground contact shadow decal plane (0.0ms GPU cost vs shadowMap!)
     */
    _createContactShadowMesh(width, length, opacity = 0.62) {
      const THREE = window.THREE;
      if (!THREE || !this.textures.contactShadow) return null;
      const geo = new THREE.PlaneGeometry(width, length);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        map: this.textures.contactShadow,
        transparent: true,
        opacity,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 0.016;
      mesh.renderOrder = 1;
      return mesh;
    },

    /**
     * Create a lightweight additive glow SpriteMaterial (reuses GT6PostFX.createGlowSpriteMaterial when available)
     */
    _createGlowSpriteMaterial(colorHex, opacity = 0.85) {
      if (
        typeof window !== 'undefined' &&
        window.GT6PostFX &&
        typeof window.GT6PostFX.createGlowSpriteMaterial === 'function'
      ) {
        try {
          const mat = window.GT6PostFX.createGlowSpriteMaterial(colorHex, opacity);
          if (mat) return mat;
        } catch (_) {}
      }
      const THREE = window.THREE;
      return new THREE.SpriteMaterial({
        map: this.textures.glowHalo,
        color: colorHex !== undefined ? colorHex : 0xffffff,
        transparent: true,
        opacity: opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        fog: false
      });
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
              grad.addColorStop(0, '#05080d');
              grad.addColorStop(1, '#121a26');
            } else if (i === 3) {
              grad.addColorStop(0, '#10141c');
              grad.addColorStop(1, '#080a0e');
            } else {
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
     * Initialize Multi-Pass Post-Processing via window.GT6PostFX (only active in 'ULTRA' preset)
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
     * Set Graphics Quality Preset ('HIGH' | 'ULTRA' | 'PERFORMANCE')
     * Defaults to 'HIGH' (60FPS HD: direct screen render, pixelRatio <= 1.25, no shadowMap pass)
     * @param {string} preset
     * @returns {string} Active quality preset
     */
    setQuality(preset) {
      const normalized = normalizeQualityPreset(preset);
      this.quality = normalized;

      let presetCfg = null;
      if (
        typeof window !== 'undefined' &&
        window.GT6PostFX &&
        typeof window.GT6PostFX.getPresetConfig === 'function'
      ) {
        try {
          presetCfg = window.GT6PostFX.getPresetConfig(normalized);
        } catch (_) {}
      }

      if (this.renderer) {
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        const maxRatio =
          presetCfg && Number.isFinite(presetCfg.pixelRatioMax)
            ? presetCfg.pixelRatioMax
            : normalized === 'ULTRA'
            ? 1.5
            : normalized === 'HIGH'
            ? 1.25
            : 1.0;
        const targetRatio = Math.min(dpr, maxRatio);

        if (typeof this.renderer.setPixelRatio === 'function') {
          this.renderer.setPixelRatio(targetRatio);
        }
        if (this.renderer.shadowMap) {
          this.renderer.shadowMap.enabled = Boolean(presetCfg && presetCfg.shadows === true);
        }
        if (this.moonLight) {
          this.moonLight.castShadow = Boolean(presetCfg && presetCfg.shadows === true);
        }
      }

      // Adjust anisotropy on road ribbon smoothly
      const targetAniso =
        normalized === 'ULTRA' ? 8 : normalized === 'HIGH' ? 4 : 2;
      if (this.roadRibbonTex) {
        this.roadRibbonTex.anisotropy = targetAniso;
        this.roadRibbonTex.needsUpdate = true;
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
     * Generate High-Detail Procedural CanvasTextures:
     * - Radial Glow Halo, Ground Contact Shadow, Wet Asphalt Reflection Streak, Smoke Puff
     * - Unified 42m Highway + Curb + Sidewalk Wet-Asphalt Texture (1024x1024)
     * - Photorealistic 512x1024 Vice City Architectural Facades & Neon Signs
     * - Organic Feathered Palm Fronds (alpha cutout) & Ringed Palm Bark
     * - Downtown Skyline, Ramps, Police, Chopper & Poster Fallbacks
     */
    _buildProceduralTextures() {
      const THREE = window.THREE;

      // 0A. Radial Additive Glow Halo Texture (used when GT6PostFX glow helper is absent)
      const glowCanvas = document.createElement('canvas');
      glowCanvas.width = 128;
      glowCanvas.height = 128;
      const gctx = glowCanvas.getContext('2d');
      if (gctx) {
        const grad = gctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
        grad.addColorStop(0.18, 'rgba(255, 255, 255, 0.85)');
        grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.36)');
        grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.10)');
        grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
        gctx.fillStyle = grad;
        gctx.fillRect(0, 0, 128, 128);
      }
      this.textures.glowHalo = new THREE.CanvasTexture(glowCanvas);

      // 0B. Soft Ground Contact Shadow Texture (zero-GPU-cost vehicle & rider grounding!)
      const shadowCanvas = document.createElement('canvas');
      shadowCanvas.width = 128;
      shadowCanvas.height = 128;
      const shctx = shadowCanvas.getContext('2d');
      if (shctx) {
        const grad = shctx.createRadialGradient(64, 64, 8, 64, 64, 60);
        grad.addColorStop(0.0, 'rgba(2, 4, 8, 0.92)');
        grad.addColorStop(0.48, 'rgba(3, 5, 10, 0.72)');
        grad.addColorStop(0.78, 'rgba(4, 6, 12, 0.25)');
        grad.addColorStop(1.0, 'rgba(4, 6, 12, 0.0)');
        shctx.fillStyle = grad;
        shctx.fillRect(0, 0, 128, 128);
      }
      this.textures.contactShadow = new THREE.CanvasTexture(shadowCanvas);

      // 0C. Stretched Wet Asphalt Light Reflection Streak Texture (streetlamps & headlights on wet road)
      const streakCanvas = document.createElement('canvas');
      streakCanvas.width = 64;
      streakCanvas.height = 256;
      const stctx = streakCanvas.getContext('2d');
      if (stctx) {
        const vGrad = stctx.createLinearGradient(0, 0, 0, 256);
        vGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
        vGrad.addColorStop(0.22, 'rgba(255, 255, 255, 0.52)');
        vGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
        vGrad.addColorStop(0.78, 'rgba(255, 255, 255, 0.52)');
        vGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
        stctx.fillStyle = vGrad;
        stctx.fillRect(0, 0, 64, 256);

        stctx.globalCompositeOperation = 'destination-in';
        const hGrad = stctx.createLinearGradient(0, 0, 64, 0);
        hGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
        hGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.75)');
        hGrad.addColorStop(0.5, 'rgba(255, 255, 255, 1.0)');
        hGrad.addColorStop(0.65, 'rgba(255, 255, 255, 0.75)');
        hGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
        stctx.fillStyle = hGrad;
        stctx.fillRect(0, 0, 64, 256);
      }
      this.textures.wetStreak = new THREE.CanvasTexture(streakCanvas);

      // 0D. Soft Organic Tire Smoke Puff Texture
      const smokeCanvas = document.createElement('canvas');
      smokeCanvas.width = 128;
      smokeCanvas.height = 128;
      const smctx = smokeCanvas.getContext('2d');
      if (smctx) {
        const puffs = [
          [64, 64, 52, 0.48],
          [46, 56, 34, 0.34],
          [82, 58, 32, 0.32],
          [60, 78, 36, 0.3]
        ];
        puffs.forEach(([px, py, pr, alpha]) => {
          const sg = smctx.createRadialGradient(px, py, 2, px, py, pr);
          sg.addColorStop(0, `rgba(225, 232, 242, ${alpha})`);
          sg.addColorStop(0.55, `rgba(190, 200, 215, ${alpha * 0.55})`);
          sg.addColorStop(1, 'rgba(180, 190, 205, 0.0)');
          smctx.fillStyle = sg;
          smctx.beginPath();
          smctx.arc(px, py, pr, 0, Math.PI * 2);
          smctx.fill();
        });
      }
      this.textures.smokePuff = new THREE.CanvasTexture(smokeCanvas);

      // 1. EDTECH Battery Box & Jacket Logo Texture (for fallback chopper)
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

      // 2. Rafa's Biker Jacket Fallback Texture
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

      // 6. Photorealistic 512x1024 Vice City Nocturnal Skyscraper & Art Deco Hotel Facade Textures
      const buildingConfigs = [
        {
          style: 'art_deco_hotel',
          wall: '#26232e',
          pier: '#1b1822',
          spandrel: '#2f2b38',
          neon: '#ff4d88',
          secondaryNeon: '#66e0ff',
          sign: 'Vice City',
          script: true,
          seed: 11
        },
        {
          style: 'glass_tower',
          wall: '#121822',
          pier: '#1c2330',
          spandrel: '#171e2a',
          neon: '#66e0ff',
          secondaryNeon: '#ffe0a3',
          sign: 'HOTEL',
          script: false,
          seed: 23
        },
        {
          style: 'ocean_deco',
          wall: '#1e2430',
          pier: '#141923',
          spandrel: '#283040',
          neon: '#ff4d88',
          secondaryNeon: '#ff70a6',
          sign: 'OCEAN',
          script: false,
          seed: 37
        },
        {
          style: 'modern_curtain',
          wall: '#141a24',
          pier: '#222a38',
          spandrel: '#1a212e',
          neon: '#ffe0a3',
          secondaryNeon: '#66e0ff',
          sign: 'EDTECH',
          script: false,
          seed: 51
        },
        {
          style: 'art_deco_hotel',
          wall: '#222430',
          pier: '#161822',
          spandrel: '#2b2e3d',
          neon: '#ff4d88',
          secondaryNeon: '#66e0ff',
          sign: 'Vice City',
          script: true,
          seed: 67
        },
        {
          style: 'boutique_club',
          wall: '#1d1f29',
          pier: '#13151d',
          spandrel: '#272a38',
          neon: '#66e0ff',
          secondaryNeon: '#ff4d88',
          sign: 'HOTEL',
          script: false,
          seed: 83
        }
      ];

      this.textures.buildingPairs = buildingConfigs.map((cfg) =>
        this._createRealisticBuildingTextures(cfg)
      );
      this.textures.buildings = this.textures.buildingPairs.map((p) => p.map);

      // Dedicated vertical/facade Neon Sign textures ("Vice City" script, "HOTEL", "OCEAN")
      this.textures.viceCityScriptSign = this._createNeonSignPanelTexture(
        'Vice City',
        '#ff4d88',
        true
      );
      this.textures.hotelNeonSign = this._createNeonSignPanelTexture('HOTEL', '#66e0ff', false);
      this.textures.oceanNeonSign = this._createNeonSignPanelTexture('OCEAN', '#ff4d88', false);

      // 7. Organic Palm Bark & Feathered Tropical Palm Frond Textures
      this.textures.palmBark = this._createPalmBarkTexture();
      this.textures.palmFrond = this._createPalmFrondTexture();

      // 8. Distant Downtown Miami/Vice City Skyline Texture
      this.textures.skylineWindows = this._createSkylineFacadeTexture();

      // 9. Realistic Green/Slate Highway Overpass Directional Signs
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

      // 10. Overpass Concrete & Yellow Hazard Strip Ramp Texture
      this.textures.rampDeck = this._createRampChevronTexture();

      // 11. Police Door Decal Texture
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

      // 12. Fallback Poster Billboard Texture
      this.textures.posterFallback = this._createFallbackPosterTexture();
      this.posterTexture = this.textures.posterFallback;
    },

    /**
     * Create 1024x1024 Unified Highway + Concrete Curbs + Wet Sidewalks Texture & Roughness Map.
     * Exact UV-to-world-X alignment across RIBBON_WIDTH = 42m (-21m to +21m):
     *   - Road Asphalt: -7.0m .. +7.0m (u = 0.3333 .. 0.6667)
     *   - Concrete Curbs: ±7.0m .. ±7.45m
     *   - Wet Sidewalks: ±7.45m .. ±21.0m
     */
    _createHighwayRibbonTextures() {
      const THREE = window.THREE;
      const size = 1024;

      const mapCanvas = document.createElement('canvas');
      mapCanvas.width = size;
      mapCanvas.height = size;
      const mctx = mapCanvas.getContext('2d');

      const roughCanvas = document.createElement('canvas');
      roughCanvas.width = size;
      roughCanvas.height = size;
      const rctx = roughCanvas.getContext('2d');

      const xToPx = (worldX) => ((worldX + RIBBON_WIDTH * 0.5) / RIBBON_WIDTH) * size;

      if (mctx && rctx) {
        const roadLeftPx = xToPx(-7.0); // ~341.3
        const roadRightPx = xToPx(7.0); // ~682.7
        const curbLeftPx = xToPx(-7.45);
        const curbRightPx = xToPx(7.45);

        // 1. Base Sidewalk Concrete (damp slate concrete slabs)
        mctx.fillStyle = '#1f242f';
        mctx.fillRect(0, 0, size, size);
        rctx.fillStyle = 'rgb(165, 165, 165)';
        rctx.fillRect(0, 0, size, size);

        // Subtle warm/neon sidewalk spill along outer building frontage (|x| > 12m)
        const leftBounce = mctx.createLinearGradient(0, 0, curbLeftPx, 0);
        leftBounce.addColorStop(0.0, 'rgba(30, 22, 38, 0.55)');
        leftBounce.addColorStop(0.45, 'rgba(38, 32, 46, 0.25)');
        leftBounce.addColorStop(1.0, 'rgba(20, 24, 34, 0.0)');
        mctx.fillStyle = leftBounce;
        mctx.fillRect(0, 0, curbLeftPx, size);

        const rightBounce = mctx.createLinearGradient(curbRightPx, 0, size, 0);
        rightBounce.addColorStop(0.0, 'rgba(20, 24, 34, 0.0)');
        rightBounce.addColorStop(0.55, 'rgba(24, 36, 48, 0.25)');
        rightBounce.addColorStop(1.0, 'rgba(22, 30, 44, 0.55)');
        mctx.fillStyle = rightBounce;
        mctx.fillRect(curbRightPx, 0, size - curbRightPx, size);

        // Concrete sidewalk paving grid lines (2m x 2.5m slabs across 20m tile)
        mctx.strokeStyle = 'rgba(11, 14, 20, 0.55)';
        mctx.lineWidth = 2;
        for (let sy = 0; sy < size; sy += size / 8) {
          mctx.beginPath();
          mctx.moveTo(0, sy);
          mctx.lineTo(curbLeftPx, sy);
          mctx.moveTo(curbRightPx, sy);
          mctx.lineTo(size, sy);
          mctx.stroke();
        }
        for (let sx = -19; sx <= -9; sx += 2.2) {
          const pxL = xToPx(sx);
          const pxR = xToPx(-sx);
          mctx.beginPath();
          mctx.moveTo(pxL, 0);
          mctx.lineTo(pxL, size);
          mctx.moveTo(pxR, 0);
          mctx.lineTo(pxR, size);
          mctx.stroke();
        }

        // 2. Concrete Curbs (±7.0m .. ±7.45m)
        mctx.fillStyle = '#333946';
        mctx.fillRect(curbLeftPx, 0, roadLeftPx - curbLeftPx, size);
        mctx.fillRect(roadRightPx, 0, curbRightPx - roadRightPx, size);
        mctx.fillStyle = '#171a22';
        mctx.fillRect(roadLeftPx - 3, 0, 4, size);
        mctx.fillRect(roadRightPx - 1, 0, 4, size);

        // 3. Dark Wet Asphalt Road Surface (-7.0m .. +7.0m)
        mctx.fillStyle = '#0f1218';
        mctx.fillRect(roadLeftPx, 0, roadRightPx - roadLeftPx, size);

        // Base damp asphalt roughness (0.38 -> rgb(96, 96, 96))
        rctx.fillStyle = 'rgb(96, 96, 96)';
        rctx.fillRect(roadLeftPx, 0, roadRightPx - roadLeftPx, size);

        // Glossy tire wear tracks in the 4 highway lanes (-4.5, -1.5, +1.5, +4.5)
        LANES.forEach((laneX) => {
          const cx = xToPx(laneX);
          const wPx = 28;
          const trackGrad = mctx.createLinearGradient(cx - wPx, 0, cx + wPx, 0);
          trackGrad.addColorStop(0, 'rgba(8, 10, 14, 0.0)');
          trackGrad.addColorStop(0.32, 'rgba(6, 8, 12, 0.65)');
          trackGrad.addColorStop(0.5, 'rgba(22, 27, 36, 0.25)');
          trackGrad.addColorStop(0.68, 'rgba(6, 8, 12, 0.65)');
          trackGrad.addColorStop(1, 'rgba(8, 10, 14, 0.0)');
          mctx.fillStyle = trackGrad;
          mctx.fillRect(cx - wPx, 0, wPx * 2, size);

          // Wet specular sheen along tire tracks (low roughness ~0.12)
          const rGrad = rctx.createLinearGradient(cx - wPx, 0, cx + wPx, 0);
          rGrad.addColorStop(0, 'rgba(26, 26, 26, 0.0)');
          rGrad.addColorStop(0.35, 'rgba(26, 26, 26, 0.78)');
          rGrad.addColorStop(0.65, 'rgba(26, 26, 26, 0.78)');
          rGrad.addColorStop(1, 'rgba(26, 26, 26, 0.0)');
          rctx.fillStyle = rGrad;
          rctx.fillRect(cx - wPx, 0, wPx * 2, size);
        });

        // Rain puddles on the wet road & gutters (mirror roughness ~0.05)
        for (let i = 0; i < 28; i++) {
          const worldX = -6.2 + seededRandom(i * 4.3 + 1) * 12.4;
          const px = xToPx(worldX);
          const py = seededRandom(i * 9.1 + 3) * size;
          const rad = 16 + seededRandom(i * 13.7) * 32;

          const pGrad = rctx.createRadialGradient(px, py, rad * 0.1, px, py, rad);
          pGrad.addColorStop(0, 'rgba(12, 12, 12, 0.94)');
          pGrad.addColorStop(0.65, 'rgba(24, 24, 24, 0.75)');
          pGrad.addColorStop(1, 'rgba(96, 96, 96, 0.0)');
          rctx.fillStyle = pGrad;
          rctx.beginPath();
          rctx.arc(px, py, rad, 0, Math.PI * 2);
          rctx.fill();

          const dGrad = mctx.createRadialGradient(px, py, rad * 0.1, px, py, rad);
          dGrad.addColorStop(0, 'rgba(7, 10, 15, 0.55)');
          dGrad.addColorStop(1, 'rgba(15, 18, 24, 0.0)');
          mctx.fillStyle = dGrad;
          mctx.beginPath();
          mctx.arc(px, py, rad, 0, Math.PI * 2);
          mctx.fill();
        }

        // Fine asphalt aggregate speckles (road + sidewalk grain)
        for (let i = 0; i < 4200; i++) {
          const gx = roadLeftPx + seededRandom(i * 1.17) * (roadRightPx - roadLeftPx);
          const gy = seededRandom(i * 2.83) * size;
          const shade = 14 + (i % 18);
          mctx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 5})`;
          mctx.fillRect(gx, gy, 1.5, 2.5);
        }

        // Outer solid white road edge lines (x = ±6.70m)
        mctx.fillStyle = 'rgba(220, 228, 240, 0.78)';
        mctx.fillRect(xToPx(-6.75), 0, 3.2, size);
        mctx.fillRect(xToPx(6.62), 0, 3.2, size);

        // Center Double Yellow Highway Divider Lines (x = ±0.14m)
        mctx.fillStyle = '#dfa318';
        mctx.fillRect(xToPx(-0.19), 0, 3.0, size);
        mctx.fillRect(xToPx(0.07), 0, 3.0, size);

        // White Dashed Lane Dividers (x = -3.0m and +3.0m, 2 dashes per 20m tile)
        mctx.fillStyle = 'rgba(226, 234, 244, 0.84)';
        const dashCount = 2;
        const dashStride = size / dashCount;
        const dashH = dashStride * 0.36;
        const leftLaneDivPx = xToPx(-3.06);
        const rightLaneDivPx = xToPx(2.94);
        for (let d = 0; d < dashCount; d++) {
          const dy = d * dashStride + 64;
          mctx.fillRect(leftLaneDivPx, dy, 3.2, dashH);
          mctx.fillRect(rightLaneDivPx, dy, 3.2, dashH);
        }

        // Subtle asphalt micro-speckle wear across painted lines for realism
        mctx.fillStyle = 'rgba(15, 18, 24, 0.28)';
        for (let i = 0; i < 160; i++) {
          const sy = seededRandom(i * 5.9) * size;
          mctx.fillRect(xToPx(-0.22), sy, 14, 2);
          mctx.fillRect(leftLaneDivPx - 1, sy, 6, 2);
          mctx.fillRect(rightLaneDivPx - 1, sy, 6, 2);
        }
      }

      const mapTex = new THREE.CanvasTexture(mapCanvas);
      mapTex.wrapS = THREE.ClampToEdgeWrapping;
      mapTex.wrapT = THREE.RepeatWrapping;
      mapTex.repeat.set(1, RIBBON_LENGTH / RIBBON_TILE_METERS); // 13 repeats along 260m
      mapTex.anisotropy = 4;
      if (THREE.sRGBEncoding !== undefined) {
        mapTex.encoding = THREE.sRGBEncoding;
      }

      const roughTex = new THREE.CanvasTexture(roughCanvas);
      roughTex.wrapS = THREE.ClampToEdgeWrapping;
      roughTex.wrapT = THREE.RepeatWrapping;
      roughTex.repeat.set(1, RIBBON_LENGTH / RIBBON_TILE_METERS);
      roughTex.anisotropy = 4;

      return { map: mapTex, roughnessMap: roughTex };
    },

    /**
     * Create paired 512x1024 Diffuse (`map`) and Selective Emissive (`emissiveMap`) textures
     * for photorealistic nocturnal Vice City Art Deco hotels, glass skyscrapers & street-level lobbies.
     * Top strip (y = 0..46) is reserved for clean dark concrete roofs!
     */
    _createRealisticBuildingTextures(cfg) {
      const THREE = window.THREE;
      const w = 512;
      const h = 1024;

      const diffCanvas = document.createElement('canvas');
      diffCanvas.width = w;
      diffCanvas.height = h;
      const dctx = diffCanvas.getContext('2d');

      const emCanvas = document.createElement('canvas');
      emCanvas.width = w;
      emCanvas.height = h;
      const ectx = emCanvas.getContext('2d');

      if (dctx && ectx) {
        // Base facade wall & pure black emissive (concrete walls NEVER self-glow)
        dctx.fillStyle = cfg.wall || '#181c24';
        dctx.fillRect(0, 0, w, h);

        ectx.fillStyle = '#000000';
        ectx.fillRect(0, 0, w, h);

        // Subtle architectural gradient (slightly darker near base alley shadow, subtle sky bounce near top)
        const wallGrad = dctx.createLinearGradient(0, 50, 0, h);
        wallGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.04)');
        wallGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.0)');
        wallGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.36)');
        dctx.fillStyle = wallGrad;
        dctx.fillRect(0, 50, w, h - 50);

        // Reserved Rooftop Patch (y = 0..48, mapped onto roof faces where normal.y > 0.72)
        dctx.fillStyle = '#0e1118';
        dctx.fillRect(0, 0, w, 48);
        dctx.fillStyle = '#1b202c';
        dctx.fillRect(14, 10, w - 28, 28);

        // Vertical structural piers / stone columns & horizontal floor spandrels
        dctx.fillStyle = cfg.pier || '#12151c';
        for (let x = 0; x < w; x += 85) {
          dctx.fillRect(x, 48, 14, h - 48);
        }
        dctx.fillStyle = cfg.spandrel || '#202634';
        for (let y = 112; y < 780; y += 54) {
          dctx.fillRect(0, y, w, 10);
          // Subtle recessed shadow line below each concrete floor slab
          dctx.fillStyle = 'rgba(5, 7, 12, 0.55)';
          dctx.fillRect(0, y + 10, w, 3);
          dctx.fillStyle = cfg.spandrel || '#202634';
        }

        // Upper parapet cornice + subtle neon accent tube strip (matching Vice City Art Deco hotels)
        dctx.fillStyle = '#11141c';
        dctx.fillRect(0, 48, w, 64);
        dctx.fillStyle = '#2d3342';
        dctx.fillRect(0, 106, w, 5);

        const neonColor = cfg.neon || '#ff4d88';
        const secNeon = cfg.secondaryNeon || '#66e0ff';
        dctx.fillStyle = neonColor;
        dctx.fillRect(18, 98, w - 36, 4);
        ectx.fillStyle = neonColor;
        ectx.fillRect(18, 98, w - 36, 4);

        if (cfg.style === 'art_deco_hotel' || cfg.style === 'ocean_deco') {
          dctx.fillStyle = secNeon;
          dctx.fillRect(36, 114, w - 72, 3);
          ectx.fillStyle = secNeon;
          ectx.fillRect(36, 114, w - 72, 3);
        }

        // Upper facade hotel/tower neon emblem
        dctx.fillStyle = '#0c0f16';
        fillRoundRect(dctx, 116, 56, 280, 38, 6);
        const fontSpec = cfg.script
          ? 'italic bold 28px Georgia, "Times New Roman", serif'
          : '900 22px "Arial Black", Impact, sans-serif';
        dctx.font = fontSpec;
        dctx.textAlign = 'center';
        dctx.textBaseline = 'middle';
        dctx.fillStyle = neonColor;
        dctx.fillText(cfg.sign || 'Vice City', 256, 76);
        ectx.font = fontSpec;
        ectx.textAlign = 'center';
        ectx.textBaseline = 'middle';
        ectx.fillStyle = neonColor;
        ectx.fillText(cfg.sign || 'Vice City', 256, 76);

        // Multi-story architectural rooms (y = 126..760):
        // Realistic glass panes with curtains, blinds, ceiling warm lamps, furniture silhouettes & unlit dark glass
        const cols = 6;
        const rows = 12;
        const colStride = 85;
        const rowStride = 54;
        for (let r = 0; r < rows; r++) {
          const floorClusterLit = seededRandom(cfg.seed * 41 + r * 7) > 0.35;
          for (let c = 0; c < cols; c++) {
            const wx = 18 + c * colStride;
            const wy = 126 + r * rowStride;
            const ww = 62;
            const wh = 38;

            // Dark anodized window frame recess
            dctx.fillStyle = '#0a0d13';
            dctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);

            const rnd = seededRandom(cfg.seed * 131 + r * 19 + c * 37);
            const isLit = floorClusterLit ? rnd > 0.38 : rnd > 0.72;

            if (!isLit) {
              // Dark reflective nocturnal glass pane with subtle diagonal reflection sheen
              dctx.fillStyle = '#0e1521';
              dctx.fillRect(wx, wy, ww, wh);
              dctx.fillStyle = 'rgba(130, 175, 225, 0.08)';
              dctx.beginPath();
              dctx.moveTo(wx, wy);
              dctx.lineTo(wx + ww * 0.65, wy);
              dctx.lineTo(wx, wy + wh * 0.75);
              dctx.closePath();
              dctx.fill();
            } else {
              const toneRnd = seededRandom(cfg.seed * 211 + r * 29 + c * 17);
              let topCol = '#f7d8a8';
              let botCol = '#b8834a';
              let emTop = '#cfa062';
              let emBot = '#734d28';

              if (cfg.style === 'glass_tower' || cfg.style === 'modern_curtain') {
                if (toneRnd < 0.45) {
                  topCol = '#e6eff8';
                  botCol = '#9eb6cf';
                  emTop = '#99b4d4';
                  emBot = '#506a87';
                } else {
                  topCol = '#f2dec0';
                  botCol = '#b3956f';
                  emTop = '#bfa37a';
                  emBot = '#695439';
                }
              } else if (toneRnd > 0.76) {
                topCol = '#d8e6f5';
                botCol = '#89a3bf';
                emTop = '#84a2c4';
                emBot = '#475e78';
              }

              const roomGrad = dctx.createLinearGradient(0, wy, 0, wy + wh);
              roomGrad.addColorStop(0, topCol);
              roomGrad.addColorStop(1, botCol);
              dctx.fillStyle = roomGrad;
              dctx.fillRect(wx, wy, ww, wh);

              const emGrad = ectx.createLinearGradient(0, wy, 0, wy + wh);
              emGrad.addColorStop(0, emTop);
              emGrad.addColorStop(1, emBot);
              ectx.fillStyle = emGrad;
              ectx.fillRect(wx, wy, ww, wh);

              // Realistic interior details: curtains, blinds & silhouetted furniture so rooms have real depth!
              const detailRnd = seededRandom(cfg.seed * 313 + r * 43 + c * 23);
              if (detailRnd < 0.38) {
                // Parted curtains on left & right sides
                const curW = 10 + (detailRnd * 14);
                dctx.fillStyle = 'rgba(18, 22, 32, 0.78)';
                ectx.fillStyle = 'rgba(0, 0, 0, 0.78)';
                dctx.fillRect(wx, wy, curW, wh);
                dctx.fillRect(wx + ww - curW, wy, curW, wh);
                ectx.fillRect(wx, wy, curW, wh);
                ectx.fillRect(wx + ww - curW, wy, curW, wh);
              } else if (detailRnd < 0.72) {
                // Half-drawn Venetian horizontal blinds
                const blindH = wh * (0.35 + (detailRnd - 0.38));
                dctx.fillStyle = 'rgba(14, 18, 26, 0.65)';
                ectx.fillStyle = 'rgba(0, 0, 0, 0.65)';
                dctx.fillRect(wx, wy, ww, blindH);
                ectx.fillRect(wx, wy, ww, blindH);
              }

              // Subtle lower sill / interior desk silhouette
              dctx.fillStyle = 'rgba(12, 14, 20, 0.52)';
              ectx.fillStyle = 'rgba(0, 0, 0, 0.52)';
              dctx.fillRect(wx + 8, wy + wh - 8, ww - 16, 8);
              ectx.fillRect(wx + 8, wy + wh - 8, ww - 16, 8);

              // Crisp center window mullion bar
              dctx.fillStyle = '#12161f';
              ectx.fillStyle = '#000000';
              dctx.fillRect(wx + ww * 0.5 - 1.5, wy, 3, wh);
              ectx.fillRect(wx + ww * 0.5 - 1.5, wy, 3, wh);
            }
          }
        }

        // Ground-Floor Street-Level Lobbies, Shopfronts & Awnings (y = 776..1024)
        dctx.fillStyle = '#10131b';
        dctx.fillRect(0, 776, w, 248);

        // Awning / canopy band with warm downlight shadow
        dctx.fillStyle = '#1c212c';
        dctx.fillRect(8, 782, w - 16, 28);
        dctx.fillStyle = neonColor;
        dctx.fillRect(14, 804, w - 28, 3);
        ectx.fillStyle = neonColor;
        ectx.fillRect(14, 804, w - 28, 3);

        // Warm illuminated street-level hotel lobby / cafe / boutique glass bays
        for (let b = 0; b < 3; b++) {
          const bx = 24 + b * 162;
          const bw = 136;
          const by = 824;
          const bh = 186;

          dctx.fillStyle = '#0a0c12';
          dctx.fillRect(bx - 3, by - 3, bw + 6, bh + 6);

          const lobbyGrad = dctx.createLinearGradient(0, by, 0, by + bh);
          lobbyGrad.addColorStop(0, '#ffe4b8');
          lobbyGrad.addColorStop(0.55, '#c48f56');
          lobbyGrad.addColorStop(1, '#332418');
          dctx.fillStyle = lobbyGrad;
          dctx.fillRect(bx, by, bw, bh);

          const lobbyEmGrad = ectx.createLinearGradient(0, by, 0, by + bh);
          lobbyEmGrad.addColorStop(0, '#c49860');
          lobbyEmGrad.addColorStop(0.6, '#7a522b');
          lobbyEmGrad.addColorStop(1, '#1c120a');
          ectx.fillStyle = lobbyEmGrad;
          ectx.fillRect(bx, by, bw, bh);

          // Storefront mullions & interior doorway pillars
          dctx.fillStyle = '#12151e';
          ectx.fillStyle = '#000000';
          dctx.fillRect(bx + bw * 0.5 - 3, by, 6, bh);
          ectx.fillRect(bx + bw * 0.5 - 3, by, 6, bh);
          dctx.fillRect(bx, by + 44, bw, 4);
          ectx.fillRect(bx, by + 44, bw, 4);
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
        fillRoundRect(ctx, 4, 4, 248, 120, 12);

        ctx.strokeStyle = neonColor;
        ctx.lineWidth = 4;
        ctx.strokeRect(10, 10, 236, 108);

        ctx.shadowColor = neonColor;
        ctx.shadowBlur = 16;
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
      const tex = new THREE.CanvasTexture(canvas);
      if (THREE.sRGBEncoding !== undefined) {
        tex.encoding = THREE.sRGBEncoding;
      }
      return tex;
    },

    /**
     * Create organic ringed palm trunk bark CanvasTexture
     */
    _createPalmBarkTexture() {
      const THREE = window.THREE;
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#3b2e24';
        ctx.fillRect(0, 0, 128, 256);

        for (let y = 0; y < 256; y += 14) {
          ctx.fillStyle = '#251c16';
          ctx.fillRect(0, y, 128, 4);
          ctx.fillStyle = '#4d3d30';
          ctx.fillRect(0, y + 4, 128, 3);
        }
        for (let i = 0; i < 180; i++) {
          ctx.fillStyle = i % 2 === 0 ? 'rgba(20, 15, 11, 0.35)' : 'rgba(88, 72, 56, 0.25)';
          ctx.fillRect(seededRandom(i * 3.1) * 124, seededRandom(i * 7.7) * 250, 3, 7);
        }
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1, 2);
      return tex;
    },

    /**
     * Create feathered tropical palm frond CanvasTexture with crisp alpha cutout transparency!
     */
    _createPalmFrondTexture() {
      const THREE = window.THREE;
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 256, 128);

        // Central curved stem (rachis)
        ctx.strokeStyle = '#3b4a26';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(4, 64);
        ctx.quadraticCurveTo(130, 58, 248, 64);
        ctx.stroke();

        // 24 pairs of organic pointed tropical palm leaflets fanning cleanly along both sides
        const pairs = 24;
        for (let i = 1; i <= pairs; i++) {
          const t = i / (pairs + 1);
          const x = 8 + t * 236;
          const stemY = 64 - Math.sin(t * Math.PI) * 3;
          const envelope = Math.sin(Math.pow(t, 0.65) * Math.PI);
          const leafLen = 14 + envelope * 44;
          const sweep = 10 + t * 22;

          [-1, 1].forEach((side) => {
            const tipX = Math.min(254, x + sweep);
            const tipY = stemY + side * leafLen;
            const leafGrad = ctx.createLinearGradient(x, stemY, tipX, tipY);
            leafGrad.addColorStop(0.0, '#13311b');
            leafGrad.addColorStop(0.55, '#1d4728');
            leafGrad.addColorStop(1.0, '#2c6137');

            ctx.fillStyle = leafGrad;
            ctx.beginPath();
            ctx.moveTo(x - 2.5, stemY);
            ctx.quadraticCurveTo(
              x + sweep * 0.45,
              stemY + side * leafLen * 0.62,
              tipX,
              tipY
            );
            ctx.quadraticCurveTo(
              x + sweep * 0.25 + 4,
              stemY + side * leafLen * 0.45,
              x + 3.2,
              stemY
            );
            ctx.closePath();
            ctx.fill();
          });
        }
      }
      const tex = new THREE.CanvasTexture(canvas);
      if (THREE.sRGBEncoding !== undefined) {
        tex.encoding = THREE.sRGBEncoding;
      }
      return tex;
    },

    /**
     * Create distant Downtown Vice City high-rise window grid texture (1 draw call for entire skyline!)
     */
    _createSkylineFacadeTexture() {
      const THREE = window.THREE;
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0e141e';
        ctx.fillRect(0, 0, 256, 512);
        for (let y = 18; y < 500; y += 12) {
          for (let x = 8; x < 248; x += 14) {
            const r = seededRandom(x * 13 + y * 7);
            if (r > 0.56) {
              ctx.fillStyle = r > 0.85 ? '#dcebff' : r > 0.7 ? '#ffe2b0' : '#9fb8d4';
              ctx.fillRect(x, y, 7, 5);
            }
          }
        }
      }
      const tex = new THREE.CanvasTexture(canvas);
      if (THREE.sRGBEncoding !== undefined) {
        tex.encoding = THREE.sRGBEncoding;
      }
      return tex;
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
        ctx.fillStyle = '#1e222b';
        ctx.fillRect(0, 0, 256, 512);
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
     * Setup Ultra-Lean Nocturnal Lighting (Strictly <= 3 Lights for 3x faster PBR shaders!):
     * 1. HemisphereLight (sky / wet-asphalt bounce)
     * 2. DirectionalLight (cool pale moonlight, shadowMap disabled)
     * 3. PointLight (dynamic alternating Red/Blue police siren behind Rafa)
     */
    _setupLighting() {
      const THREE = window.THREE;

      this.hemiLight = new THREE.HemisphereLight(0x88a8cf, 0x161c26, 0.94);
      this.scene.add(this.hemiLight);

      this.moonLight = new THREE.DirectionalLight(0xd8e8fa, 1.25);
      this.moonLight.position.set(18, 46, 22);
      this.moonLight.castShadow = false;
      this.scene.add(this.moonLight);

      this.policeSirenLight = new THREE.PointLight(0xff1722, 2.2, 26, 1.4);
      this.policeSirenLight.position.set(0, 2.2, 4.5);
      this.scene.add(this.policeSirenLight);

      this.pinkFillLight = null;
      this.cyanFillLight = null;
      this.underGlowLight = null;
    },

    /**
     * Build GTA 6 Nocturnal Sky Dome (via GT6PostFX.createAtmosphere), Pale Moon & Merged Downtown Skyline (~4 Draw Calls!)
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

      // 2. Subtle Tiny Nocturnal Stars (1 draw call)
      const starCount = 180;
      const starGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        positions[i * 3] = (seededRandom(i * 3.7 + 1) - 0.5) * 340;
        positions[i * 3 + 1] = 36 + seededRandom(i * 7.1 + 2) * 105;
        positions[i * 3 + 2] = -165 - seededRandom(i * 11.3 + 3) * 130;
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const starMat = new THREE.PointsMaterial({
        color: 0xd8e4f2,
        size: 0.4,
        transparent: true,
        opacity: 0.45
      });
      this.starField = new THREE.Points(starGeo, starMat);
      this.skylineGroup.add(this.starField);

      // 3. Realistic Pale Nocturnal Moon + Soft Additive Halo Sprite
      const moonGeo = new THREE.SphereGeometry(7.0, 20, 16);
      const moonMat = new THREE.MeshBasicMaterial({ color: 0xf4f6fb, fog: false });
      const moon = new THREE.Mesh(moonGeo, moonMat);
      moon.position.set(-48, 72, -235);
      this.skylineGroup.add(moon);

      const moonHalo = new THREE.Sprite(this._createGlowSpriteMaterial(0x9bb8dc, 0.36));
      moonHalo.position.copy(moon.position);
      moonHalo.scale.set(34, 34, 1);
      this.skylineGroup.add(moonHalo);

      // 4. Merged Downtown Skyline Silhouettes (2 draw calls total instead of 41!)
      const towerGeos = [];
      const crownGeos = [];

      // Iconic central stepped cylindrical skyscraper
      towerGeos.push(bakeGeoTransform(new THREE.CylinderGeometry(8.8, 9.8, 68, 18), 18, 29, -222));
      towerGeos.push(bakeGeoTransform(new THREE.CylinderGeometry(6.4, 7.4, 28, 18), 18, 73, -222));
      towerGeos.push(bakeGeoTransform(new THREE.CylinderGeometry(0.18, 0.42, 16, 8), 18, 98, -222));
      crownGeos.push(bakeGeoTransform(new THREE.CylinderGeometry(4.6, 4.6, 4.5, 18), 18, 88.5, -222));

      // Surrounding downtown glass high-rises
      for (let i = -9; i <= 9; i++) {
        if (i === 1) continue;
        const h = 30 + Math.abs(Math.sin(i * 1.7)) * 52;
        const w = 9 + (Math.abs(i * 3) % 6);
        const zOff = -226 - (Math.abs(i) % 3) * 14;
        const xOff = i * 15.5;
        towerGeos.push(
          remapRoofUVs(
            bakeGeoTransform(new THREE.BoxGeometry(w, h, w), xOff, h * 0.5 - 4, zOff),
            0.0,
            0.05,
            0.0,
            0.05
          )
        );
        crownGeos.push(
          bakeGeoTransform(new THREE.BoxGeometry(w + 0.3, 0.65, w + 0.3), xOff, h - 4, zOff)
        );
      }

      const skylineMat = new THREE.MeshBasicMaterial({
        map: this.textures.skylineWindows,
        color: 0xcbd8eb
      });
      const skylineMesh = new THREE.Mesh(mergeGeometries(THREE, towerGeos), skylineMat);
      this.skylineGroup.add(skylineMesh);

      const crownMat = new THREE.MeshBasicMaterial({ color: 0xffe4b8 });
      const crownMesh = new THREE.Mesh(mergeGeometries(THREE, crownGeos), crownMat);
      this.skylineGroup.add(crownMesh);
    },

    /**
     * Build the Single Continuous Curved Wet-Asphalt Highway + Concrete Curbs + Sidewalks Ribbon (1 Draw Call!)
     * Plus compact recycled pools of Photorealistic Vice City Skyscrapers, Organic Palm Trees, Streetlamps & Overpasses.
     */
    _buildInfiniteHighway() {
      const THREE = window.THREE;

      // 1. Create Single Continuous Curved Highway + Curb + Sidewalk Ribbon (1 Draw Call!)
      const ribbonTex = this._createHighwayRibbonTextures();
      this.roadRibbonTex = ribbonTex.map;
      this.roadRibbonRoughTex = ribbonTex.roughnessMap;

      // Also honor GT6PostFX.createWetAsphaltTextures cache/anisotropy compatibility
      this.wetAsphaltTextures = ribbonTex;
      const asphaltMat = new THREE.MeshStandardMaterial({
        map: this.roadRibbonTex,
        roughnessMap: this.roadRibbonRoughTex,
        roughness: 0.72,
        metalness: 0.36,
        envMap: this.envMap,
        envMapIntensity: 1.6
      });
      this.materials.wetAsphalt = asphaltMat;
      this.materials.posterBillboard = new THREE.MeshBasicMaterial({
        map: this.posterTexture
      });

      const ribbonGeo = new THREE.PlaneGeometry(RIBBON_WIDTH, RIBBON_LENGTH, 8, 44);
      ribbonGeo.rotateX(-Math.PI / 2);
      ribbonGeo.translate(0, 0, RIBBON_Z_SHIFT); // Spans z = -225 to +35

      // Align the 9 X-columns to exact road edges (±7.0m), 3D concrete curb bevels (±7.45m), and sidewalks (±14m, ±21m)
      const colX = [-21.0, -14.0, -7.45, -7.0, 0.0, 7.0, 7.45, 14.0, 21.0];
      const colY = [0.16, 0.16, 0.16, 0.0, 0.0, 0.0, 0.16, 0.16, 0.16];
      const posAttr = ribbonGeo.getAttribute('position');
      const uvAttr = ribbonGeo.getAttribute('uv');
      const vertCount = posAttr.count; // 9 * 45 = 405 vertices

      this._ribbonBaseX = new Float32Array(vertCount);
      this._ribbonBaseZ = new Float32Array(vertCount);

      for (let i = 0; i < vertCount; i++) {
        const ix = i % 9;
        const bx = colX[ix];
        const by = colY[ix];
        const bz = posAttr.getZ(i);

        posAttr.setXYZ(i, bx, by, bz);
        uvAttr.setX(i, (bx + RIBBON_WIDTH * 0.5) / RIBBON_WIDTH);
        this._ribbonBaseX[i] = bx;
        this._ribbonBaseZ[i] = bz;
      }
      posAttr.needsUpdate = true;
      uvAttr.needsUpdate = true;
      ribbonGeo.computeVertexNormals();

      this._ribbonGeo = ribbonGeo;
      this._ribbonPosAttr = posAttr;
      this._ribbonVertCount = vertCount;

      this.roadRibbon = new THREE.Mesh(ribbonGeo, asphaltMat);
      this.roadRibbon.receiveShadow = false;
      this.roadRibbon.frustumCulled = false;
      this.scene.add(this.roadRibbon);

      // 2. Shared Geometries & Materials for Recycled Street Scenery
      this._initSharedSceneryAssets();

      // 3. Populate Compact Recycled Scenery Pool (zero segment slicing!)
      this.sceneryPool = [];
      this.roadSegments = [];
      this.scenerySegments = [];
      this.streetLights = [];

      // 3A. Photorealistic Vice City Skyscrapers & Art Deco Hotels (10 per side = 20 buildings total)
      const numBuildingsPerSide = 10;
      const buildingSpacing = SCENERY_SPAN / numBuildingsPerSide; // 26m
      for (let i = 0; i < numBuildingsPerSide; i++) {
        const zBase = SCENERY_Z_MAX - 10 - i * buildingSpacing;
        [-1, 1].forEach((side, sIdx) => {
          const building = this._createArtDecoHotel(i, sIdx, side);
          const xBase = side * (17.2 + ((i + sIdx) % 2) * 1.1);
          this._registerSceneryPoolItem(building, xBase, zBase, side < 0 ? 0 : Math.PI);
        });
      }

      // 3B. Organic Curved Feathered Palm Trees (10 per side = 20 palms total, 2 draw calls each!)
      const numPalmsPerSide = 10;
      const palmSpacing = SCENERY_SPAN / numPalmsPerSide; // 26m
      for (let i = 0; i < numPalmsPerSide; i++) {
        const zBase = SCENERY_Z_MAX - 18 - i * palmSpacing;
        [-1, 1].forEach((side) => {
          const palm = this._createPalmTree(i, side);
          palm.position.y = 0.16;
          const rotY = (i * 1.35 + (side > 0 ? 0.8 : 0)) % (Math.PI * 2);
          this._registerSceneryPoolItem(palm, side * 8.35, zBase, rotY);
        });
      }

      // 3C. Streetlamps with Additive Glow Sprites & Wet Asphalt Reflection Streaks (6 per side = 12 total)
      const numLampsPerSide = 6;
      const lampSpacing = SCENERY_SPAN / numLampsPerSide; // ~43.3m
      for (let i = 0; i < numLampsPerSide; i++) {
        const zBase = SCENERY_Z_MAX - 8 - i * lampSpacing;
        [-1, 1].forEach((side) => {
          const isWarm = (i + (side > 0 ? 1 : 0)) % 2 === 0;
          const lamp = this._createStreetLamp(side, isWarm);
          lamp.position.y = 0.16;
          this._registerSceneryPoolItem(lamp, side * 7.55, zBase, 0);
          this.streetLights.push(lamp);
        });
      }

      // 3D. Concrete Highway Overpass Bridges (2 recycled bridges, 130m apart)
      for (let i = 0; i < 2; i++) {
        const zBase = -35 - i * 130;
        const overpass = this._createHighwayBillboardGantry(i);
        this._registerSceneryPoolItem(overpass, 0, zBase, 0);
      }
    },

    /**
     * Pre-build shared geometries and materials for buildings, palms & streetlamps (reused across pool!)
     */
    _initSharedSceneryAssets() {
      const THREE = window.THREE;

      // Building Materials (1 shared MeshStandardMaterial per facade variation = 6 materials total)
      this.materials.buildingFacades = this.textures.buildingPairs.map(
        (texPair) =>
          new THREE.MeshStandardMaterial({
            map: texPair.map,
            emissive: 0xffffff,
            emissiveMap: texPair.emissiveMap,
            emissiveIntensity: 0.72,
            roughness: 0.48,
            metalness: 0.28,
            envMap: this.envMap,
            envMapIntensity: 0.9
          })
      );

      // Building Neon Sign Materials
      this.materials.signViceCity = new THREE.MeshBasicMaterial({
        map: this.textures.viceCityScriptSign,
        side: THREE.DoubleSide
      });
      this.materials.signHotel = new THREE.MeshBasicMaterial({
        map: this.textures.hotelNeonSign,
        side: THREE.DoubleSide
      });
      this.materials.signOcean = new THREE.MeshBasicMaterial({
        map: this.textures.oceanNeonSign,
        side: THREE.DoubleSide
      });
      this.geometries.signPlane = new THREE.PlaneGeometry(3.8, 1.9);

      // Palm Trunk & Crown Shared Materials + 3 Organic Curved Trunk Geometries + 2 Feathered Crown Geometries
      this.materials.palmBark = new THREE.MeshStandardMaterial({
        map: this.textures.palmBark,
        roughness: 0.88,
        metalness: 0.05
      });
      this.materials.palmFrond = new THREE.MeshStandardMaterial({
        map: this.textures.palmFrond,
        alphaTest: 0.35,
        side: THREE.DoubleSide,
        roughness: 0.54,
        metalness: 0.08,
        envMap: this.envMap,
        envMapIntensity: 0.45
      });

      this.geometries.palmTrunks = [];
      this.geometries.palmCrowns = [];
      this._palmTrunkTops = [];

      const trunkCurves = [0.75, 1.05, 0.55];
      const trunkHeights = [7.4, 8.2, 6.8];
      for (let v = 0; v < 3; v++) {
        const h = trunkHeights[v];
        const lean = trunkCurves[v];
        const tGeo = new THREE.CylinderGeometry(0.13, 0.31, h, 8, 12);
        tGeo.translate(0, h * 0.5, 0);
        const pAttr = tGeo.getAttribute('position');
        for (let i = 0; i < pAttr.count; i++) {
          const y = pAttr.getY(i);
          const t = Math.max(0, y / h);
          const bendX = Math.pow(t, 1.65) * lean;
          const bendZ = Math.sin(t * Math.PI) * 0.18 * (v === 1 ? -1 : 1);
          pAttr.setX(i, pAttr.getX(i) + bendX);
          pAttr.setZ(i, pAttr.getZ(i) + bendZ);
        }
        pAttr.needsUpdate = true;
        tGeo.computeVertexNormals();
        this.geometries.palmTrunks.push(tGeo);
        this._palmTrunkTops.push({ x: lean, y: h - 0.15, z: 0 });
      }

      // Build 2 organic arched feathered palm crown variations (each merges 10 curved V-folded fronds = 1 draw call!)
      for (let c = 0; c < 2; c++) {
        const frondGeos = [];
        const numFronds = 10;
        for (let f = 0; f < numFronds; f++) {
          const fGeo = new THREE.PlaneGeometry(3.2, 1.4, 4, 1);
          // Shift so base is at x = 0, tip at x = 3.2
          fGeo.translate(1.6, 0, 0);
          const fp = fGeo.getAttribute('position');
          const droopMul = f % 2 === 0 ? 1.15 : 0.85;
          for (let i = 0; i < fp.count; i++) {
            const x = fp.getX(i);
            const z = fp.getZ(i); // wait: PlaneGeometry starts in XY plane before rotation!
            const yLocal = fp.getY(i); // width across frond (-0.7..+0.7)
            const t = Math.max(0, x / 3.2);
            // Map XY plane into horizontal arched frond: X = length, Z = width, Y = arch + V-fold
            const archY = Math.sin(t * Math.PI * 0.65) * 0.42 - Math.pow(t, 1.85) * 1.25 * droopMul;
            const vFold = -Math.abs(yLocal) * 0.24;
            fp.setXYZ(i, x, archY + vFold, yLocal);
          }
          fp.needsUpdate = true;
          fGeo.computeVertexNormals();

          const yaw = (f * Math.PI * 2) / numFronds + (c === 1 ? 0.2 : 0);
          const pitch = f % 3 === 0 ? 0.34 : f % 2 === 0 ? 0.12 : -0.1;
          const scaleF = 0.88 + seededRandom(f * 17 + c * 31) * 0.24;
          bakeGeoTransform(fGeo, 0, 0, 0, 0, yaw, pitch, scaleF, 1, scaleF);
          frondGeos.push(fGeo);
        }
        this.geometries.palmCrowns.push(mergeGeometries(THREE, frondGeos));
      }

      // Streetlamp Shared Pole Geometry & Materials
      this.materials.lampSteel = new THREE.MeshStandardMaterial({
        color: 0x262b36,
        metalness: 0.78,
        roughness: 0.32,
        envMap: this.envMap
      });
      this.materials.lampBulbWarm = new THREE.MeshBasicMaterial({ color: 0xffe8c2 });
      this.materials.lampBulbCool = new THREE.MeshBasicMaterial({ color: 0xe2f0ff });
      this.materials.lampGlowWarm = this._createGlowSpriteMaterial(0xffd9a0, 0.62);
      this.materials.lampGlowCool = this._createGlowSpriteMaterial(0xd4ecff, 0.58);
      this.materials.lampStreakWarm = new THREE.MeshBasicMaterial({
        map: this.textures.wetStreak,
        color: 0xffd599,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      this.materials.lampStreakCool = new THREE.MeshBasicMaterial({
        map: this.textures.wetStreak,
        color: 0xcce6ff,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      this.geometries.lampStreak = new THREE.PlaneGeometry(1.4, 10.5);
      this.geometries.lampStreak.rotateX(-Math.PI / 2);

      // Pre-merge left and right streetlamp pole + curved arm geometries (1 draw call per lamp!)
      this.geometries.lampPoleLeft = mergeGeometries(THREE, [
        bakeGeoTransform(new THREE.CylinderGeometry(0.08, 0.14, 7.2, 8), 0, 3.6, 0),
        bakeGeoTransform(new THREE.BoxGeometry(2.35, 0.09, 0.1), 1.08, 7.08, 0, 0, 0, 0.08),
        bakeGeoTransform(new THREE.BoxGeometry(0.65, 0.12, 0.3), 2.05, 7.05, 0)
      ]);
      this.geometries.lampPoleRight = mergeGeometries(THREE, [
        bakeGeoTransform(new THREE.CylinderGeometry(0.08, 0.14, 7.2, 8), 0, 3.6, 0),
        bakeGeoTransform(new THREE.BoxGeometry(2.35, 0.09, 0.1), -1.08, 7.08, 0, 0, 0, -0.08),
        bakeGeoTransform(new THREE.BoxGeometry(0.65, 0.12, 0.3), -2.05, 7.05, 0)
      ]);
      this.geometries.lampBulb = new THREE.BoxGeometry(0.56, 0.08, 0.26);

      // Shared Overpass Materials
      this.materials.concreteBridge = new THREE.MeshStandardMaterial({
        color: 0x242934,
        roughness: 0.78,
        metalness: 0.16,
        envMap: this.envMap,
        envMapIntensity: 0.55
      });
      this.materials.darkSteel = new THREE.MeshStandardMaterial({
        color: 0x191d26,
        metalness: 0.76,
        roughness: 0.32,
        envMap: this.envMap
      });

      // Shared Spark & Smoke Materials
      this.geometries.spark = new THREE.BoxGeometry(0.05, 0.05, 0.28);
      this.materials.sparkAmber = new THREE.MeshBasicMaterial({
        color: 0xffaa22,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      this.materials.sparkGold = new THREE.MeshBasicMaterial({
        color: 0xffee77,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
    },

    _registerSceneryPoolItem(obj3d, baseX, trackZ, baseRotY = 0) {
      obj3d.position.x = baseX;
      obj3d.position.z = trackZ;
      obj3d.rotation.y = baseRotY;
      obj3d.userData.baseX = baseX;
      obj3d.userData.trackZ = trackZ;
      obj3d.userData.baseRotY = baseRotY;
      this.scene.add(obj3d);
      this.sceneryPool.push(obj3d);
      return obj3d;
    },

    /**
     * Build a Photorealistic Stepped Vice City Skyscraper or Art Deco Hotel in 1-2 Draw Calls!
     * (Merged podium + main shaft + setback penthouse with clean roof UVs + optional neon sign + glow sprite)
     */
    _createArtDecoHotel(idx, sIdx, side) {
      const THREE = window.THREE;
      const hotelGroup = new THREE.Group();

      const styleIdx = (idx * 2 + sIdx) % this.materials.buildingFacades.length;
      const facadeMat = this.materials.buildingFacades[styleIdx];

      const height = 22 + ((idx * 7 + sIdx * 5) % 24);
      const width = 11.2 + ((idx + sIdx) % 3) * 1.1;
      const depth = 17.5 + ((idx * 3 + sIdx) % 4) * 1.4;

      // Stepped architectural silhouette merged into 1 single BufferGeometry (1 Draw Call!)
      const podiumH = 4.6;
      const mainH = height - podiumH;
      const parts = [
        remapRoofUVs(
          bakeGeoTransform(new THREE.BoxGeometry(width + 0.8, podiumH, depth + 0.8), 0, podiumH * 0.5, 0),
          0.02,
          0.12,
          0.955,
          0.995
        ),
        remapRoofUVs(
          bakeGeoTransform(
            new THREE.BoxGeometry(width, mainH, depth),
            0,
            podiumH + mainH * 0.5,
            0
          ),
          0.02,
          0.12,
          0.955,
          0.995
        ),
        remapRoofUVs(
          bakeGeoTransform(
            new THREE.BoxGeometry(width * 0.68, 2.6, depth * 0.68),
            0,
            height + 1.3,
            0
          ),
          0.02,
          0.12,
          0.955,
          0.995
        )
      ];
      const mergedBuildingGeo = mergeGeometries(THREE, parts);
      const buildingMesh = new THREE.Mesh(mergedBuildingGeo, facadeMat);
      hotelGroup.add(buildingMesh);

      // Projecting Hero Neon Signboard + Additive Glow Sprite on select buildings ("Vice City", "HOTEL", "OCEAN")
      if ((idx + sIdx) % 2 === 0) {
        const signChoice = (idx + sIdx) % 3;
        const signMat =
          signChoice === 0
            ? this.materials.signViceCity
            : signChoice === 1
            ? this.materials.signHotel
            : this.materials.signOcean;
        const signGlowColor = signChoice === 1 ? 0x66e0ff : 0xff4d88;

        const signMesh = new THREE.Mesh(this.geometries.signPlane, signMat);
        // Street-facing side: for left buildings (baseRotY=0), +X faces road; for right (baseRotY=PI), +X in local space also faces road!
        const signX = width * 0.5 + 0.45;
        signMesh.rotation.y = Math.PI * 0.5;
        signMesh.position.set(signX, 8.6, 0);
        hotelGroup.add(signMesh);

        const glowSprite = new THREE.Sprite(this._createGlowSpriteMaterial(signGlowColor, 0.42));
        glowSprite.position.set(signX + 0.4, 8.6, 0);
        glowSprite.scale.set(6.5, 3.6, 1);
        hotelGroup.add(glowSprite);
      }

      return hotelGroup;
    },

    /**
     * Build an Organic Curved Feathered Palm Tree in exactly 2 Draw Calls (Trunk + Merged Arched Crown)!
     */
    _createPalmTree(idx, side) {
      const THREE = window.THREE;
      const group = new THREE.Group();

      const trunkIdx = (idx + (side > 0 ? 1 : 0)) % this.geometries.palmTrunks.length;
      const crownIdx = idx % this.geometries.palmCrowns.length;

      const trunk = new THREE.Mesh(this.geometries.palmTrunks[trunkIdx], this.materials.palmBark);
      group.add(trunk);

      const topPos = this._palmTrunkTops[trunkIdx];
      const crown = new THREE.Mesh(this.geometries.palmCrowns[crownIdx], this.materials.palmFrond);
      crown.position.set(topPos.x, topPos.y, topPos.z);
      group.add(crown);

      return group;
    },

    /**
     * Build a Lightweight Highway Streetlamp with Additive Halo Sprite & Wet-Asphalt Specular Reflection Streak
     */
    _createStreetLamp(side, isWarmWhite = true) {
      const THREE = window.THREE;
      const group = new THREE.Group();

      const poleGeo = side < 0 ? this.geometries.lampPoleLeft : this.geometries.lampPoleRight;
      const poleMesh = new THREE.Mesh(poleGeo, this.materials.lampSteel);
      group.add(poleMesh);

      const tipX = side < 0 ? 2.05 : -2.05;
      const glowSprite = new THREE.Sprite(
        isWarmWhite ? this.materials.lampGlowWarm : this.materials.lampGlowCool
      );
      glowSprite.position.set(tipX, 6.9, 0);
      glowSprite.scale.set(4.8, 4.8, 1);
      group.add(glowSprite);

      // Wet asphalt specular reflection streak lying flat on the road below the luminaire
      const streak = new THREE.Mesh(
        this.geometries.lampStreak,
        isWarmWhite ? this.materials.lampStreakWarm : this.materials.lampStreakCool
      );
      streak.position.set(tipX * 0.9, -0.145, 0);
      group.add(streak);

      return group;
    },

    /**
     * Build a Concrete Highway Overpass Bridge & Directional Sign Gantry (~6 Draw Calls Total)
     */
    _createHighwayBillboardGantry(segIndex) {
      const THREE = window.THREE;
      const group = new THREE.Group();

      // Merge all concrete piers, caps, bridge deck & parapet into 1 single draw call
      const concreteGeos = [];
      [-7.85, 7.85].forEach((x) => {
        concreteGeos.push(bakeGeoTransform(new THREE.BoxGeometry(0.95, 7.8, 2.4), x, 3.9, 0));
        concreteGeos.push(bakeGeoTransform(new THREE.BoxGeometry(1.35, 0.75, 2.8), x, 7.55, 0));
      });
      concreteGeos.push(bakeGeoTransform(new THREE.BoxGeometry(17.2, 1.15, 3.2), 0, 8.35, 0));
      concreteGeos.push(bakeGeoTransform(new THREE.BoxGeometry(17.3, 0.75, 3.35), 0, 9.25, 0));
      group.add(new THREE.Mesh(mergeGeometries(THREE, concreteGeos), this.materials.concreteBridge));

      // Merge all dark steel sign backing frames into 1 draw call
      const steelGeos = [
        bakeGeoTransform(new THREE.BoxGeometry(5.8, 2.85, 0.24), 0, 9.55, 1.72),
        bakeGeoTransform(new THREE.BoxGeometry(3.8, 1.45, 0.18), -5.15, 8.65, 1.72),
        bakeGeoTransform(new THREE.BoxGeometry(3.8, 1.45, 0.18), 5.15, 8.65, 1.72)
      ];
      group.add(new THREE.Mesh(mergeGeometries(THREE, steelGeos), this.materials.darkSteel));

      // Official Rafa Poster Billboard & Left/Right Directional Signs
      const posterPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(5.55, 2.65),
        this.materials.posterBillboard
      );
      posterPlane.position.set(0, 9.55, 1.86);
      group.add(posterPlane);

      const leftSignFace = new THREE.Mesh(
        new THREE.PlaneGeometry(3.65, 1.32),
        new THREE.MeshBasicMaterial({ map: this.textures.gantrySignLeft })
      );
      leftSignFace.position.set(-5.15, 8.65, 1.83);
      group.add(leftSignFace);

      const rightSignFace = new THREE.Mesh(
        new THREE.PlaneGeometry(3.65, 1.32),
        new THREE.MeshBasicMaterial({ map: this.textures.gantrySignRight })
      );
      rightSignFace.position.set(5.15, 8.65, 1.83);
      group.add(rightSignFace);

      // Subtle warm under-bridge glow sprites (matches 0:05-0:06 underpass lighting!)
      [-3.5, 3.5].forEach((lx) => {
        const underSprite = new THREE.Sprite(this._createGlowSpriteMaterial(0xffe0a8, 0.45));
        underSprite.position.set(lx, 7.6, 0.4);
        underSprite.scale.set(4.5, 2.4, 1);
        group.add(underSprite);
      });

      return group;
    },

    /**
     * Build Rafa & His Red Fat-Tire Electric Chopper (EDTECH / PT 13)
     * Uses window.GT6Models.buildRafaAndChopper(this.envMap) when available,
     * strips extra dynamic lights for <= 3 total scene lights, and attaches ground contact shadow + headlight pool.
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
        this._stripExtraLights(this.bikeGroup);
        this.playerGroup.add(this.bikeGroup);

        this.frontWheelGroup = refs.frontWheel || refs.frontWheelGroup || null;
        this.rearWheelGroup = refs.rearWheel || refs.rearWheelGroup || null;
        this.steeringGroup = refs.steeringGroup || refs.steering || null;
        this.headlightSpot = null;
        this.headlightBeam = refs.headlightCone || refs.headlightBeam || null;
        this.tailLightMat = refs.tailLightMat || null;
        this.riderGroup = refs.riderGroup || refs.rider || null;
        this.riderTorso = refs.riderTorso || null;
        this.riderHead = refs.riderHead || null;
        this.underGlowLight = null;

        if (Array.isArray(refs.nitroFlames) && refs.nitroFlames.length > 0) {
          this.nitroFlames = refs.nitroFlames;
          this.nitroFlameLeft = refs.nitroFlames[0] || null;
          this.nitroFlameRight = refs.nitroFlames[1] || refs.nitroFlames[0] || null;
        } else {
          this.nitroFlameLeft = refs.nitroFlameLeft || null;
          this.nitroFlameRight = refs.nitroFlameRight || null;
          this.nitroFlames = [this.nitroFlameLeft, this.nitroFlameRight].filter(Boolean);
        }

        for (let f = 0; f < this.nitroFlames.length; f++) {
          if (this.nitroFlames[f]) {
            this.nitroFlames[f].visible = false;
          }
        }
      } else {
        this._buildFallbackRafaChopper();
      }

      // Soft ground contact shadow decal under Rafa & the chopper (0.0ms GPU cost)
      this.playerShadow = this._createContactShadowMesh(1.5, 3.2, 0.7);
      if (this.playerShadow) {
        this.playerShadow.position.set(0, 0.018, 0.05);
        this.playerGroup.add(this.playerShadow);
      }

      // Soft additive LED headlight illumination streak projected onto the wet asphalt ahead of the chopper
      const poolGeo = new THREE.PlaneGeometry(3.6, 13.5);
      poolGeo.rotateX(-Math.PI / 2);
      const poolMat = new THREE.MeshBasicMaterial({
        map: this.textures.wetStreak,
        color: 0xe6f2ff,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      this.headlightGroundPool = new THREE.Mesh(poolGeo, poolMat);
      this.headlightGroundPool.position.set(0, 0.02, -7.8);
      this.playerGroup.add(this.headlightGroundPool);

      this.empShieldMesh = null;
    },

    _buildFallbackRafaChopper() {
      const THREE = window.THREE;
      this.bikeGroup = new THREE.Group();
      this.playerGroup.add(this.bikeGroup);

      const redPaintMat = new THREE.MeshStandardMaterial({
        color: 0xc4121a,
        emissive: 0x240204,
        roughness: 0.22,
        metalness: 0.58,
        envMap: this.envMap,
        envMapIntensity: 1.4
      });
      const fenderLightningMat = new THREE.MeshStandardMaterial({
        map: this.textures.fenderLightning,
        roughness: 0.22,
        metalness: 0.55,
        envMap: this.envMap
      });
      const chromeMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.1,
        metalness: 0.92,
        envMap: this.envMap,
        envMapIntensity: 1.6
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

      const frameGeos = [
        bakeGeoTransform(new THREE.BoxGeometry(0.58, 0.16, 1.35), 0, 0.28, -0.05),
        bakeGeoTransform(new THREE.BoxGeometry(0.46, 0.78, 0.22), 0, 0.68, -0.66, 0.36),
        bakeGeoTransform(new THREE.BoxGeometry(0.08, 0.11, 0.72), -0.28, 0.42, 0.68),
        bakeGeoTransform(new THREE.BoxGeometry(0.08, 0.11, 0.72), 0.28, 0.42, 0.68)
      ];
      this.bikeGroup.add(new THREE.Mesh(mergeGeometries(THREE, frameGeos), redPaintMat));

      const rearFender = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 0.52, 20, 1, false, 0, Math.PI),
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

      const batteryBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.55, 0.62),
        edtechBoxMat
      );
      batteryBox.position.set(0, 0.66, 0.36);
      this.bikeGroup.add(batteryBox);

      const mainSeat = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.16, 0.72),
        leatherMat
      );
      mainSeat.position.set(0, 0.98, 0.42);
      this.bikeGroup.add(mainSeat);

      const backrestPad = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.24, 0.14),
        leatherMat
      );
      backrestPad.position.set(0, 1.34, 0.78);
      this.bikeGroup.add(backrestPad);

      const flameGeo = new THREE.ConeGeometry(0.09, 0.7, 12);
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

      this.nitroFlameRight = new THREE.Mesh(flameGeo, flameMat);
      this.nitroFlameRight.position.set(0.22, 0.56, 1.48);
      this.nitroFlameRight.visible = false;
      this.bikeGroup.add(this.nitroFlameRight);
      this.nitroFlames = [this.nitroFlameLeft, this.nitroFlameRight];

      this.steeringGroup = new THREE.Group();
      this.steeringGroup.position.set(0, 0.96, -0.78);
      this.bikeGroup.add(this.steeringGroup);

      [-0.22, 0.22].forEach((fx) => {
        const forkTube = new THREE.Mesh(
          new THREE.CylinderGeometry(0.042, 0.038, 1.18, 12),
          chromeMat
        );
        forkTube.position.set(fx, -0.15, -0.14);
        forkTube.rotation.x = 0.28;
        this.steeringGroup.add(forkTube);
      });

      const frontFender = new THREE.Mesh(
        new THREE.CylinderGeometry(0.49, 0.49, 0.48, 20, 1, false, 0, Math.PI * 0.85),
        fenderLightningMat
      );
      frontFender.rotation.z = Math.PI / 2;
      frontFender.rotation.x = 0.55;
      frontFender.position.set(0, -0.52, -0.3);
      this.steeringGroup.add(frontFender);

      const headlightLens = new THREE.Mesh(
        new THREE.CircleGeometry(0.2, 18),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      headlightLens.rotation.y = Math.PI;
      headlightLens.position.set(0, 0.22, -0.3);
      this.steeringGroup.add(headlightLens);

      const hlGlow = new THREE.Sprite(this._createGlowSpriteMaterial(0xeef6ff, 0.72));
      hlGlow.position.set(0, 0.22, -0.34);
      hlGlow.scale.set(1.4, 1.4, 1);
      this.steeringGroup.add(hlGlow);

      const coneGeo = new THREE.ConeGeometry(2.3, 13, 18, 1, true);
      coneGeo.rotateX(Math.PI / 2);
      this.headlightBeam = new THREE.Mesh(
        coneGeo,
        new THREE.MeshBasicMaterial({
          color: 0xe6f4ff,
          transparent: true,
          opacity: 0.065,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      this.headlightBeam.position.set(0, 0.68, -7.8);
      this.bikeGroup.add(this.headlightBeam);

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
        new THREE.CylinderGeometry(0.44, 0.44, 0.44, 24),
        tireMat
      );
      tireMesh.rotation.z = Math.PI / 2;
      wheelGroup.add(tireMesh);

      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.26, 0.46, 18),
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
      const skinMat = new THREE.MeshStandardMaterial({
        color: 0xe09b74,
        roughness: 0.62,
        metalness: 0.04
      });
      const hairBeardMat = new THREE.MeshStandardMaterial({
        color: 0x231812,
        roughness: 0.85
      });

      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.21, 0.66, 12), jacketDecalMat);
      torso.scale.set(1.15, 1.0, 0.72);
      torso.position.set(0, 1.44, 0.36);
      torso.rotation.x = -0.14;
      rider.add(torso);
      this.riderTorso = torso;

      [-0.22, 0.22].forEach((sideX) => {
        const legGeo = mergeGeometries(THREE, [
          bakeGeoTransform(new THREE.CylinderGeometry(0.11, 0.085, 0.48, 10), sideX, 1.06, 0.14, 1.18, 0, -sideX * 0.25),
          bakeGeoTransform(new THREE.CylinderGeometry(0.085, 0.07, 0.48, 10), sideX * 1.15, 0.72, -0.12, -0.18),
          bakeGeoTransform(new THREE.CylinderGeometry(0.08, 0.095, 0.32, 10), sideX * 1.15, 0.46, -0.22, Math.PI * 0.5)
        ]);
        rider.add(new THREE.Mesh(legGeo, pantsMat));
      });

      [-1, 1].forEach((side) => {
        const upperArm = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.075, 0.42, 10),
          jacketDecalMat
        );
        upperArm.position.set(side * 0.34, 1.62, 0.12);
        upperArm.rotation.x = 1.05;
        upperArm.rotation.z = -side * 0.28;
        rider.add(upperArm);

        const forearm = new THREE.Mesh(
          new THREE.CylinderGeometry(0.072, 0.058, 0.38, 10),
          skinMat
        );
        forearm.position.set(side * 0.42, 1.56, -0.22);
        forearm.rotation.x = 1.42;
        forearm.rotation.z = side * 0.12;
        rider.add(forearm);
      });

      const headGroup = new THREE.Group();
      headGroup.position.set(0, 2.02, 0.29);
      rider.add(headGroup);

      const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.19, 18, 16), skinMat);
      headMesh.scale.set(0.95, 1.08, 0.98);
      headGroup.add(headMesh);

      const hairCap = new THREE.Mesh(
        new THREE.SphereGeometry(0.196, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
        hairBeardMat
      );
      hairCap.position.set(0, 0.02, 0.01);
      headGroup.add(hairCap);

      this.riderHead = headGroup;
      return rider;
    },

    /**
     * Build Trailing Police Cruisers (hidden when custom `state.chasers` are present)
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
     * Stripping extra dynamic lights and preserving volumetric searchlight cone + additive glow sprites.
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
        this._stripExtraLights(this.heliGroup);
        this.heliGroup.position.set(0, 14.5, -16);
        this.scene.add(this.heliGroup);

        this.heliMainRotor = refs.mainRotor || refs.heliMainRotor || null;
        this.heliTailRotor = refs.tailRotor || refs.heliTailRotor || null;
        this.heliSpotLight = null;
        this.heliLightCone =
          refs.searchlightCone || refs.lightCone || refs.heliLightCone || null;
        this.heliRedLight = refs.redStrobe || refs.redLight || refs.heliRedLight || null;
        this.heliBlueLight = refs.blueStrobe || refs.blueLight || refs.heliBlueLight || null;

        if (!this.heliLightCone) {
          const coneGeo = new THREE.ConeGeometry(4.2, 18.5, 20, 1, true);
          coneGeo.translate(0, -9.25, 0);
          const coneMat = new THREE.MeshBasicMaterial({
            color: 0xeef6ff,
            transparent: true,
            opacity: 0.13,
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

      // Nose searchlight lens halo sprite
      const gimbalGlow = new THREE.Sprite(this._createGlowSpriteMaterial(0xf0f7ff, 0.85));
      gimbalGlow.position.set(0, -0.64, 1.62);
      gimbalGlow.scale.set(2.2, 2.2, 1);
      this.heliGroup.add(gimbalGlow);

      // Soft Additive Ground Searchlight Pool on the wet asphalt
      const spotRingGeo = new THREE.PlaneGeometry(5.8, 5.8);
      spotRingGeo.rotateX(-Math.PI / 2);
      const spotRingMat = new THREE.MeshBasicMaterial({
        map: this.textures.glowHalo,
        color: 0xeef6ff,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      this.heliGroundRing = new THREE.Mesh(spotRingGeo, spotRingMat);
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

      const bodyGeos = [
        bakeGeoTransform(new THREE.BoxGeometry(1.7, 1.35, 3.6), 0, 0, 0),
        bakeGeoTransform(new THREE.BoxGeometry(0.38, 0.42, 3.8), 0, 0.22, -3.2)
      ];
      this.heliGroup.add(new THREE.Mesh(mergeGeometries(THREE, bodyGeos), darkMat));

      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.42, 2.4), whiteMat);
      stripe.position.set(0, 0, 0.2);
      this.heliGroup.add(stripe);

      const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.92, 18, 14), glassMat);
      cockpit.position.set(0, -0.05, 1.55);
      cockpit.scale.set(0.92, 0.78, 1.25);
      this.heliGroup.add(cockpit);

      this.heliMainRotor = new THREE.Group();
      this.heliMainRotor.position.set(0, 0.92, 0.1);
      const bladeMat = new THREE.MeshBasicMaterial({
        color: 0xcbd5e1,
        transparent: true,
        opacity: 0.65
      });
      const bladeGeo = mergeGeometries(THREE, [
        new THREE.BoxGeometry(7.8, 0.04, 0.28),
        new THREE.BoxGeometry(0.28, 0.04, 7.8)
      ]);
      this.heliMainRotor.add(new THREE.Mesh(bladeGeo, bladeMat));
      this.heliGroup.add(this.heliMainRotor);

      this.heliTailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.45, 0.18), bladeMat);
      this.heliTailRotor.position.set(0.24, 0.68, -4.9);
      this.heliGroup.add(this.heliTailRotor);

      this.heliRedLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xff1e27 })
      );
      this.heliRedLight.position.set(-0.55, -0.72, 0.8);
      this.heliGroup.add(this.heliRedLight);

      this.heliBlueLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0x0088ff })
      );
      this.heliBlueLight.position.set(0.55, -0.72, 0.8);
      this.heliGroup.add(this.heliBlueLight);

      const coneGeo = new THREE.ConeGeometry(4.2, 18.5, 20, 1, true);
      coneGeo.translate(0, -9.25, 0);
      this.heliLightCone = new THREE.Mesh(
        coneGeo,
        new THREE.MeshBasicMaterial({
          color: 0xeef6ff,
          transparent: true,
          opacity: 0.13,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      this.heliLightCone.position.set(0, -0.65, 1.4);
      this.heliGroup.add(this.heliLightCone);
      this.heliSpotLight = null;
    },

    /**
     * Create a High-Detail Police Cruiser or SWAT Van Mesh using window.GT6Models.buildPoliceCruiser
     * Strips extra PointLights and attaches ground contact shadow + lightweight siren glow sprites
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
              this._stripExtraLights(carGroup);

              let baseYaw = 0;
              if (isChasingPlayer && built.facingPositiveZ) {
                baseYaw = Math.PI;
                carGroup.rotation.y = baseYaw;
              }

              // Ground contact shadow decal (0.0ms GPU cost)
              const shadow = this._createContactShadowMesh(
                variant === 'swat_van' ? 3.2 : 2.7,
                variant === 'swat_van' ? 6.4 : 5.2,
                0.68
              );
              if (shadow) carGroup.add(shadow);

              // Collect or attach alternating red/blue strobe glow sprites on lightbar
              let redGlow = null;
              let blueGlow = null;
              carGroup.traverse((ch) => {
                if (ch.isSprite) {
                  if (ch.position.x < 0) redGlow = ch;
                  else if (ch.position.x > 0) blueGlow = ch;
                }
              });
              if (!redGlow || !blueGlow) {
                const barY = variant === 'swat_van' ? 2.24 : 1.54;
                const barZ = variant === 'swat_van' ? -0.45 : -0.02;
                redGlow = new THREE.Sprite(this._createGlowSpriteMaterial(0xff1e27, 0.85));
                redGlow.position.set(-0.42, barY, barZ);
                redGlow.scale.set(1.7, 1.0, 1);
                carGroup.add(redGlow);

                blueGlow = new THREE.Sprite(this._createGlowSpriteMaterial(0x0088ff, 0.85));
                blueGlow.position.set(0.42, barY, barZ);
                blueGlow.scale.set(1.7, 1.0, 1);
                carGroup.add(blueGlow);
              }

              carGroup.userData = Object.assign({}, carGroup.userData, {
                baseRotationY: baseYaw,
                redBarMat: refs.redStrobeMat || refs.redBarMat || null,
                blueBarMat: refs.blueStrobeMat || refs.blueBarMat || null,
                redGlowSprite: redGlow,
                blueGlowSprite: blueGlow,
                strobeLight: null,
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

      // Lean Fallback Police Cruiser (~6 draw calls + contact shadow)
      const car = new THREE.Group();
      const blackMat = new THREE.MeshStandardMaterial({
        color: 0x0b0d12,
        roughness: 0.2,
        metalness: 0.72,
        envMap: this.envMap
      });
      const sideDecalMat = new THREE.MeshStandardMaterial({
        map: this.textures.policeSide,
        roughness: 0.24,
        metalness: 0.52,
        envMap: this.envMap
      });

      const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.72, 4.35), sideDecalMat);
      chassis.position.y = 0.58;
      car.add(chassis);

      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.58, 2.15), blackMat);
      cabin.position.set(0, 1.2, -0.1);
      car.add(cabin);

      const redBarMat = new THREE.MeshBasicMaterial({ color: 0xff1722 });
      const blueBarMat = new THREE.MeshBasicMaterial({ color: 0x0088ff });
      const redBar = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.14, 0.26), redBarMat);
      redBar.position.set(-0.4, 1.54, -0.1);
      const blueBar = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.14, 0.26), blueBarMat);
      blueBar.position.set(0.4, 1.54, -0.1);
      car.add(redBar, blueBar);

      const redGlowSprite = new THREE.Sprite(this._createGlowSpriteMaterial(0xff1e27, 0.85));
      redGlowSprite.position.set(-0.4, 1.58, -0.1);
      redGlowSprite.scale.set(1.6, 1.0, 1);
      const blueGlowSprite = new THREE.Sprite(this._createGlowSpriteMaterial(0x0088ff, 0.85));
      blueGlowSprite.position.set(0.4, 1.58, -0.1);
      blueGlowSprite.scale.set(1.6, 1.0, 1);
      car.add(redGlowSprite, blueGlowSprite);

      const shadow = this._createContactShadowMesh(2.6, 5.1, 0.65);
      if (shadow) car.add(shadow);

      car.userData = {
        baseRotationY: 0,
        redBarMat,
        blueBarMat,
        redGlowSprite,
        blueGlowSprite,
        strobeLight: null,
        wheels: [],
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
        van.add(body);

        const redBarMat = new THREE.MeshBasicMaterial({ color: 0xff1722 });
        const blueBarMat = new THREE.MeshBasicMaterial({ color: 0x0088ff });
        const redBar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.28), redBarMat);
        redBar.position.set(-0.5, 2.55, 1.6);
        const blueBar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.28), blueBarMat);
        blueBar.position.set(0.5, 2.55, 1.6);
        van.add(redBar, blueBar);

        const shadow = this._createContactShadowMesh(3.0, 6.0, 0.68);
        if (shadow) van.add(shadow);

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
        const spikeGeos = [];
        for (let sx = -1.05; sx <= 1.05; sx += 0.3) {
          spikeGeos.push(bakeGeoTransform(new THREE.ConeGeometry(0.08, 0.38, 8), sx, 0.26, 0));
        }
        stripGroup.add(new THREE.Mesh(mergeGeometries(THREE, spikeGeos), spikeMat));
        stripGroup.userData = { baseRotationY: 0 };
        return stripGroup;
      }

      if (type === 'traffic_car') {
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
              this._stripExtraLights(carGroup);
              const shadow = this._createContactShadowMesh(2.5, 4.9, 0.62);
              if (shadow) carGroup.add(shadow);
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
          envMapIntensity: 1.4
        });
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.68, 4.1), paintMat);
        body.position.y = 0.55;
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

        const shadow = this._createContactShadowMesh(2.4, 4.7, 0.62);
        if (shadow) car.add(shadow);

        car.userData = { baseRotationY: 0 };
        return car;
      }

      return this._createPoliceCruiserMesh(false, 'police_car');
    },

    /**
     * Create Concrete Overpass Jump Ramp Mesh (2-3 Draw Calls)
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

      const deck = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.28, 5.8), deckMat);
      deck.position.set(0, 0.95, 0);
      deck.rotation.x = 0.32;
      rampGroup.add(deck);

      // Merge side rails & rear support pillars into 1 draw call
      const railGeos = [
        bakeGeoTransform(new THREE.BoxGeometry(0.18, 0.32, 5.85), -1.38, 1.12, 0, 0.32),
        bakeGeoTransform(new THREE.BoxGeometry(0.18, 0.32, 5.85), 1.38, 1.12, 0, 0.32),
        bakeGeoTransform(new THREE.BoxGeometry(0.28, 1.85, 0.38), -1.18, 0.92, -2.25),
        bakeGeoTransform(new THREE.BoxGeometry(0.28, 1.85, 0.38), 1.18, 0.92, -2.25)
      ];
      rampGroup.add(new THREE.Mesh(mergeGeometries(THREE, railGeos), concreteSideMat));

      [-1.18, 1.18].forEach((px) => {
        const beaconGlow = new THREE.Sprite(this._createGlowSpriteMaterial(0xf59e0b, 0.8));
        beaconGlow.position.set(px, 2.0, -2.55);
        beaconGlow.scale.set(1.25, 1.25, 1);
        rampGroup.add(beaconGlow);
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
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.95, 14), nitroMat);
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
          new THREE.SphereGeometry(0.34, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0xe0f2fe })
        );
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.06, 8, 18), empMat);
        group.add(core, ring);
      }

      const glowColor =
        type === 'cash' ? 0x4ade80 : type === 'nitro' ? 0x66e0ff : type === 'armor' ? 0xf87171 : 0x38bdf8;
      const halo = new THREE.Sprite(this._createGlowSpriteMaterial(glowColor, 0.5));
      halo.scale.set(1.65, 1.65, 1);
      group.add(halo);

      return group;
    },

    /**
     * Initialize Zero-Allocation Pooled Particle & FX Meshes (1 Batched LineSegments Draw Call for all 64 Sparks + 24 Smoke Sprites)
     */
    _initParticlePools() {
      const THREE = window.THREE;
      this.particleGroup = new THREE.Group();
      this.scene.add(this.particleGroup);

      this.particles = [];
      this.shockwaves = [];
      this.sparkPool = [];
      this.sparkPoolCursor = 0;
      this.smokePool = [];
      this.smokePoolCursor = 0;

      // Single batched LineSegments buffer for all 64 fast-moving sparks = 1 draw call total!
      const maxSparks = 64;
      this._sparkPositions = new Float32Array(maxSparks * 6);
      this._sparkColors = new Float32Array(maxSparks * 6);
      this._sparkGeo = new THREE.BufferGeometry();
      this._sparkPosAttr = new THREE.BufferAttribute(this._sparkPositions, 3);
      this._sparkColAttr = new THREE.BufferAttribute(this._sparkColors, 3);
      this._sparkGeo.setAttribute('position', this._sparkPosAttr);
      this._sparkGeo.setAttribute('color', this._sparkColAttr);

      const sparkLineMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      this._sparkLines = new THREE.LineSegments(this._sparkGeo, sparkLineMat);
      this._sparkLines.frustumCulled = false;
      this._sparkLines.visible = false;
      this.particleGroup.add(this._sparkLines);

      for (let i = 0; i < maxSparks; i++) {
        this.sparkPool.push({
          active: false,
          x: 0,
          y: 0,
          z: 0,
          vx: 0,
          vy: 0,
          vz: 0,
          r: 1,
          g: 0.68,
          b: 0.15,
          gravity: 16,
          life: 0,
          maxLife: 0.4
        });
      }

      // 24 pre-allocated soft tire smoke sprites
      for (let i = 0; i < 24; i++) {
        const mat = new THREE.SpriteMaterial({
          map: this.textures.smokePuff,
          color: i % 2 === 0 ? 0xd8dee9 : 0xb0bac8,
          transparent: true,
          opacity: 0.34,
          depthWrite: false
        });
        const sprite = new THREE.Sprite(mat);
        sprite.visible = false;
        this.particleGroup.add(sprite);
        this.smokePool.push({
          sprite,
          active: false,
          vx: 0,
          vy: 0,
          vz: 0,
          life: 0,
          maxLife: 0.5,
          baseScale: 0.55,
          scaleGrowth: 2.8,
          initialOpacity: 0.32
        });
      }
    },

    /**
     * Spawn Pooled Spark Streaks (Zero allocations & 1 single batched draw call!)
     */
    _spawnParticles(origin, count, colorHex, speedScale = 1.0, gravity = 14.0, lifeRange = 0.55) {
      if (!this.sparkPool || this.sparkPool.length === 0) return;
      const poolLen = this.sparkPool.length;
      const ox = (origin && origin.x) || 0;
      const oy = (origin && origin.y) || 0.14;
      const oz = (origin && origin.z) || 0;

      const r = ((colorHex >> 16) & 255) / 255;
      const g = ((colorHex >> 8) & 255) / 255;
      const b = (colorHex & 255) / 255;

      const actualCount = this.quality === 'PERFORMANCE' ? Math.max(1, Math.ceil(count * 0.5)) : count;
      for (let i = 0; i < actualCount; i++) {
        const p = this.sparkPool[this.sparkPoolCursor];
        this.sparkPoolCursor = (this.sparkPoolCursor + 1) % poolLen;

        p.active = true;
        p.x = ox + (Math.random() - 0.5) * 0.42;
        p.y = Math.max(0.05, oy + Math.random() * 0.2);
        p.z = oz + (Math.random() - 0.5) * 0.42;
        p.vx = (Math.random() - 0.5) * 6.8 * speedScale;
        p.vy = (1.2 + Math.random() * 4.4) * speedScale;
        p.vz = (2.8 + Math.random() * 8.0) * speedScale;
        p.r = r;
        p.g = g;
        p.b = b;
        p.gravity = gravity;
        p.maxLife = lifeRange * (0.65 + Math.random() * 0.5);
        p.life = p.maxLife;
      }
    },

    /**
     * Spawn Pooled Soft Translucent Grey-White Tire Drift Smoke Sprites
     */
    _spawnTireSmoke(origin, count = 2) {
      if (!this.smokePool || this.smokePool.length === 0) return;
      const poolLen = this.smokePool.length;
      const ox = (origin && origin.x) || 0;
      const oy = (origin && origin.y) || 0.16;
      const oz = (origin && origin.z) || 0;

      const actualCount = this.quality === 'PERFORMANCE' ? 1 : count;
      for (let i = 0; i < actualCount; i++) {
        const s = this.smokePool[this.smokePoolCursor];
        this.smokePoolCursor = (this.smokePoolCursor + 1) % poolLen;

        s.active = true;
        s.vx = (Math.random() - 0.5) * 2.1;
        s.vy = 0.6 + Math.random() * 1.0;
        s.vz = 3.2 + Math.random() * 4.2;
        s.maxLife = 0.42 + Math.random() * 0.22;
        s.life = s.maxLife;
        s.baseScale = 0.52;
        s.scaleGrowth = 2.6;
        s.initialOpacity = 0.34;

        s.sprite.visible = true;
        s.sprite.position.set(
          ox + (Math.random() - 0.5) * 0.34,
          Math.max(0.14, oy + Math.random() * 0.1),
          oz + (Math.random() - 0.5) * 0.34
        );
        s.sprite.scale.set(s.baseScale, s.baseScale, 1);
        s.sprite.material.opacity = s.initialOpacity;
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
          this._spawnParticles(pos, 10, 0xffaa22, 1.0, 18.0, 0.36);
          this._spawnParticles(pos, 5, 0xffee77, 1.1, 18.0, 0.3);
          this._spawnTireSmoke(pos, 2);
          break;

        case 'explosion':
        case 'crash':
        case 'roadblock':
          this._spawnParticles(pos, 20, 0xff6611, 1.5, 15.0, 0.65);
          this._spawnParticles(pos, 12, 0xffcc44, 1.3, 13.0, 0.55);
          this._spawnTireSmoke(pos, 3);
          this.cameraShake = Math.max(this.cameraShake, 0.48);
          break;

        case 'cash':
          this._spawnParticles(pos, 10, 0x4ade80, 1.1, 8.0, 0.55);
          this._spawnParticles(pos, 5, 0xfef08a, 1.0, 8.0, 0.45);
          break;

        case 'nitro':
          this._spawnParticles(pos, 12, 0xffaa22, 1.4, 5.0, 0.45);
          this._spawnParticles(pos, 8, 0x66e0ff, 1.3, 5.0, 0.4);
          this.cameraShake = Math.max(this.cameraShake, 0.18);
          break;

        case 'emp':
        case 'weapon': {
          this._spawnParticles(pos, 16, 0x66e0ff, 1.6, 4.0, 0.55);
          this.cameraShake = Math.max(this.cameraShake, 0.32);
          if (THREE && this.particleGroup) {
            const ringMesh = new THREE.Mesh(
              new THREE.RingGeometry(0.6, 1.15, 24),
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
          this._spawnParticles(pos, 14, 0xffaa22, 1.3, 14.0, 0.55);
          this._spawnParticles(pos, 8, 0xffee77, 1.25, 14.0, 0.5);
          this._spawnTireSmoke(pos, 3);
          break;

        default:
          this._spawnParticles(pos, 8, 0xffaa22, 1.0, 14.0, 0.4);
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

          // Animate police lightbars, additive strobe sprites & 3D wheels
          const ud = mesh.userData;
          if (ud) {
            const flash = Math.sin(time * 22 + (ud.phaseOffset || 0)) > 0;
            if (ud.redBarMat && ud.redBarMat.color) {
              ud.redBarMat.color.setHex(flash ? 0xff1722 : 0x380408);
            }
            if (ud.blueBarMat && ud.blueBarMat.color) {
              ud.blueBarMat.color.setHex(flash ? 0x051838 : 0x0088ff);
            }
            if (ud.redGlowSprite) {
              ud.redGlowSprite.material.opacity = flash ? 0.92 : 0.12;
              const rs = flash ? 1.85 : 0.85;
              ud.redGlowSprite.scale.set(rs, rs * 0.6, 1);
            }
            if (ud.blueGlowSprite) {
              ud.blueGlowSprite.material.opacity = flash ? 0.12 : 0.92;
              const bs = flash ? 0.85 : 1.85;
              ud.blueGlowSprite.scale.set(bs, bs * 0.6, 1);
            }
            if (Array.isArray(ud.wheels) && wheelSpinDelta !== 0) {
              for (let w = 0; w < ud.wheels.length; w++) {
                const wh = ud.wheels[w];
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
     * Execute Final Frame Render:
     * - 'HIGH' (default 60FPS HD) & 'PERFORMANCE': Direct single-pass WebGL render (zero 6-pass render target overhead!)
     * - 'ULTRA': Multi-pass GT6PostFX Bloom + Filmic Grading
     */
    _renderWithPostFX(fxState, safeDt) {
      const usePostFX =
        this.quality === 'ULTRA' &&
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
      const worldSpeed = Number.isFinite(s.worldSpeed) ? s.worldSpeed : (speedKmh / 3.6) * 1.18;
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

      // Compute continuous scroll meters synced to `state.distance` (or worldSpeed)
      const prevScrollMeters = this.scrollMeters;
      if (Number.isFinite(s.distance)) {
        // Match GT6Game's physical meters-to-worldSpeed ratio (0.44 * 3.6 = 1.584) so obstacles sit locked to asphalt
        this.scrollMeters = s.distance * 1.584;
        this._lastStateDistance = s.distance;
      } else if (mode !== 'PAUSED' && mode !== 'BUSTED') {
        this.scrollMeters += worldSpeed * safeDt;
      }
      const scrollDelta = this.scrollMeters - prevScrollMeters;
      this.scrollOffset = this.scrollMeters;

      // 1A. Bend the Single Continuous Highway Ribbon Vertices (45 rows x 9 cols = 405 verts in <0.03ms!)
      if (this._ribbonPosAttr && this._ribbonBaseX && this._ribbonBaseZ) {
        const arr = this._ribbonPosAttr.array;
        const bx = this._ribbonBaseX;
        const bz = this._ribbonBaseZ;
        const factor = (this.roadCurve || 0) * 0.0028; // roadCurve * (z / 100)^2 * 28
        for (let i = 0; i < this._ribbonVertCount; i++) {
          const z = bz[i];
          arr[i * 3] = bx[i] + factor * z * z;
        }
        this._ribbonPosAttr.needsUpdate = true;
      }

      // Scroll repeating highway + sidewalk texture seamlessly with distance
      if (this.roadRibbonTex) {
        const vOffset = (this.scrollMeters / RIBBON_TILE_METERS) % 1.0;
        this.roadRibbonTex.offset.y = vOffset;
        if (this.roadRibbonRoughTex) {
          this.roadRibbonRoughTex.offset.y = vOffset;
        }
      }

      // 1B. Recycle & Curve Buildings, Organic Palms, Streetlamps & Overpasses along the 260m Loop
      for (let i = 0; i < this.sceneryPool.length; i++) {
        const item = this.sceneryPool[i];
        let tz = item.userData.trackZ + scrollDelta;
        while (tz > SCENERY_Z_MAX) tz -= SCENERY_SPAN;
        while (tz < SCENERY_Z_MIN) tz += SCENERY_SPAN;
        item.userData.trackZ = tz;
        item.position.z = tz;
        item.position.x = item.userData.baseX + this.getCurveOffsetX(tz);
        item.rotation.y = item.userData.baseRotY + this.getCurveAngle(tz);
      }

      // Shift distant skyline subtly with the road curve
      if (this.skylineGroup) {
        this.skylineGroup.position.x = this.getCurveOffsetX(-135) * 0.42;
      }

      // 2. Update Rafa & Chopper Position, Roll, Pitch, Counter-Steering, Ground Shadow & Wheel Spin
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

        if (this.riderHead && this.bikeGroup) {
          this.riderHead.rotation.z = -this.bikeGroup.rotation.z * 0.32;
          this.riderHead.rotation.y = -this.bikeGroup.rotation.z * 0.22;
        }

        if (this.frontWheelGroup) this.frontWheelGroup.rotation.x -= wheelSpin;
        if (this.rearWheelGroup) this.rearWheelGroup.rotation.x -= wheelSpin;

        // Ground contact shadow stays glued to road surface (y = 0.018 relative to ground -> -playerY)
        if (this.playerShadow) {
          this.playerShadow.position.y = -playerY + 0.018;
          const shScale = Math.max(0.42, 1.0 - playerY * 0.14);
          this.playerShadow.scale.set(shScale, 1, shScale);
          this.playerShadow.material.opacity = Math.max(0.18, 0.7 - playerY * 0.16);
        }

        if (this.headlightGroundPool) {
          this.headlightGroundPool.position.y = -playerY + 0.02;
          this.headlightGroundPool.position.x = this.getCurveOffsetX(-7.8) * 0.5;
          this.headlightGroundPool.material.opacity = Math.max(0.08, 0.24 - playerY * 0.05);
        }

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

        // Emit Realistic Golden-Orange Friction Sparks & Soft Smoke Plumes when drifting or leaning hard
        const currentRollAbs = Math.abs(
          this.bikeGroup ? this.bikeGroup.rotation.z : s.roll || 0
        );
        if ((isDrifting || currentRollAbs > 0.18) && !isJumping && mode !== 'PAUSED') {
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
          if (isDrifting || currentRollAbs > 0.24 || Math.random() > 0.4) {
            this._spawnTireSmoke(smokeOrigin, isDrifting ? 2 : 1);
          }
        }
      }

      // 3. Alternating Red/Blue Police Siren PointLight illuminating Rafa from behind
      if (this.policeSirenLight && this.playerGroup) {
        const sirenFlash = Math.sin(this.elapsedTime * 22) > 0;
        this.policeSirenLight.color.setHex(sirenFlash ? 0xff1722 : 0x0088ff);
        this.policeSirenLight.intensity =
          (0.95 + Math.min(6, wantedStars) * 0.28) *
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

      // Update built-in ambient trailing police cruisers (when no custom `state.chasers`)
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
          const ud = cop.userData;
          if (ud) {
            if (ud.redBarMat && ud.redBarMat.color) {
              ud.redBarMat.color.setHex(flash ? 0xff1722 : 0x380408);
            }
            if (ud.blueBarMat && ud.blueBarMat.color) {
              ud.blueBarMat.color.setHex(flash ? 0x051838 : 0x0088ff);
            }
            if (ud.redGlowSprite) {
              ud.redGlowSprite.material.opacity = flash ? 0.92 : 0.12;
            }
            if (ud.blueGlowSprite) {
              ud.blueGlowSprite.material.opacity = flash ? 0.12 : 0.92;
            }
          }
        }
      }

      // 5. Update Overhead Police Helicopter & Sweeping Volumetric Searchlight
      if (this.heliGroup) {
        const showHeli =
          Boolean(s.heliActive) || wantedStars >= 4 || mode === 'MENU' || isCinematicJump;
        this.heliGroup.visible = showHeli;
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

          if (this.heliLightCone && typeof this.heliLightCone.lookAt === 'function') {
            this.heliLightCone.lookAt(sweepX, 0, sweepZ);
            this.heliLightCone.rotateX(Math.PI / 2);
          }

          if (this.heliGroundRing) {
            this.heliGroundRing.position.set(sweepX, 0.032, sweepZ);
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

      // 6. Update Zero-Allocation Batched Spark Streaks (1 Draw Call Total!), Smoke Sprites & Shockwaves
      if (this._sparkLines && this._sparkPositions && this._sparkColors) {
        const posArr = this._sparkPositions;
        const colArr = this._sparkColors;
        let anyActive = false;

        for (let i = 0; i < this.sparkPool.length; i++) {
          const p = this.sparkPool[i];
          const idx = i * 6;
          if (!p.active) {
            posArr[idx] = 0;
            posArr[idx + 1] = -999;
            posArr[idx + 2] = 0;
            posArr[idx + 3] = 0;
            posArr[idx + 4] = -999;
            posArr[idx + 5] = 0;
            continue;
          }

          p.life -= safeDt;
          if (p.life <= 0) {
            p.active = false;
            posArr[idx + 1] = -999;
            posArr[idx + 4] = -999;
            continue;
          }

          anyActive = true;
          p.vy -= p.gravity * safeDt;
          p.x += p.vx * safeDt;
          p.y = Math.max(0.04, p.y + p.vy * safeDt);
          p.z += (p.vz + worldSpeed * 0.32) * safeDt;

          const tailScale = 0.048;
          posArr[idx] = p.x;
          posArr[idx + 1] = p.y;
          posArr[idx + 2] = p.z;
          posArr[idx + 3] = p.x - p.vx * tailScale;
          posArr[idx + 4] = Math.max(0.02, p.y - p.vy * tailScale);
          posArr[idx + 5] = p.z - (p.vz + worldSpeed * 0.35) * tailScale;

          const fade = Math.max(0, p.life / p.maxLife);
          colArr[idx] = p.r * fade;
          colArr[idx + 1] = p.g * fade;
          colArr[idx + 2] = p.b * fade;
          colArr[idx + 3] = p.r * fade * 0.35;
          colArr[idx + 4] = p.g * fade * 0.35;
          colArr[idx + 5] = p.b * fade * 0.35;
        }

        this._sparkLines.visible = anyActive;
        if (anyActive) {
          this._sparkPosAttr.needsUpdate = true;
          this._sparkColAttr.needsUpdate = true;
        }
      }

      for (let i = 0; i < this.smokePool.length; i++) {
        const sm = this.smokePool[i];
        if (!sm.active) continue;
        sm.life -= safeDt;
        if (sm.life <= 0) {
          sm.active = false;
          sm.sprite.visible = false;
          continue;
        }
        sm.vy += 0.8 * safeDt;
        sm.sprite.position.x += sm.vx * safeDt;
        sm.sprite.position.y = Math.max(0.1, sm.sprite.position.y + sm.vy * safeDt);
        sm.sprite.position.z += (sm.vz + worldSpeed * 0.34) * safeDt;
        const lifeRatio = Math.max(0, sm.life / sm.maxLife);
        const sScale = sm.baseScale * (1.0 + (1.0 - lifeRatio) * sm.scaleGrowth);
        sm.sprite.scale.set(sScale, sScale, 1);
        sm.sprite.material.opacity = lifeRatio * sm.initialOpacity;
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
     * - `'chase'` (Default — matches 0:05-0:09 of the video): Tight 3rd-person motorcycle camera
     * - `'front_cinematic'` (Matches 0:00-0:04 of the video!): Hero front-three-quarter chase camera looking back at Rafa & pursuing cruisers
     * - `'low_action'`: Low asphalt-skimming action cam highlighting sparks & wet reflections
     * - `'helicam_top'` / `'heli'`: Elevated aerial pursuit angle
     * - `'cinematic_jump'`: Dramatic low-angle slow-mo overpass ramp jump camera (0:08-0:09)
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
        desiredPosX = px + 2.45 + this.getCurveOffsetX(pz + 3.9);
        desiredPosY = Math.max(1.05, 1.12 + py * 0.46);
        desiredPosZ = pz + 3.9;
        lookX = px + this.getCurveOffsetX(pz - 3.5) * 0.35;
        lookY = py + 1.22;
        lookZ = pz - 4.2;
        targetFov = 52;
        targetBank = -0.04;
      } else if (this.cameraMode === 'front_cinematic') {
        desiredPosX = px + 1.28 + this.getCurveOffsetX(pz - 3.6);
        desiredPosY = Math.max(0.95, 1.16 + py * 0.55);
        desiredPosZ = pz - 3.6;
        lookX = px * 0.92 + this.getCurveOffsetX(pz + 3.4) * 0.35;
        lookY = py + 1.24;
        lookZ = pz + 3.6;
        targetFov = 54 + (isNitro ? 4 : 0);
        targetBank = bikeRoll * 0.1;
      } else if (this.cameraMode === 'low_action') {
        desiredPosX = px - 1.12 + this.getCurveOffsetX(pz + 3.1) * 0.5 - bikeRoll * 0.4;
        desiredPosY = Math.max(0.66, 0.72 + py * 0.5);
        desiredPosZ = pz + 3.1;
        lookX = px * 0.8 + this.getCurveOffsetX(pz - 16.0) * 0.58;
        lookY = 0.95 + py * 0.6;
        lookZ = pz - 16.0;
        targetFov = 64 + (isNitro ? 6 : 0);
        targetBank = -bikeRoll * 0.18 - this.roadCurve * 0.05;
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
