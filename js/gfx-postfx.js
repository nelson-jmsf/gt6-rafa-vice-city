/**
 * GT6 RAFA: FUGA DE VICE CITY (EDTECH PT-13 EDITION)
 * 3D Post-Processing, GLSL Shaders, Procedural Vice City Nocturnal Cubemap & Wet-Asphalt Reflections
 * Attach: window.GT6PostFX
 */
(function () {
  'use strict';

  const QUALITY_PRESETS = {
    HIGH: {
      name: 'HIGH',
      label: '60FPS HD',
      usePostFX: false,
      bloomIterations: 0,
      bloomScale: 0.35,
      pixelRatioMax: 1.25,
      shadows: false,
      rainCount: 140,
      streakCount: 32,
      anisotropy: 4
    },
    ULTRA: {
      name: 'ULTRA',
      label: 'ULTRA BLOOM',
      usePostFX: true,
      bloomIterations: 1,
      bloomScale: 0.35,
      pixelRatioMax: 1.5,
      shadows: false,
      rainCount: 140,
      streakCount: 32,
      anisotropy: 8
    },
    PERFORMANCE: {
      name: 'PERFORMANCE',
      label: 'ULTRA LEVE',
      usePostFX: false,
      bloomIterations: 0,
      bloomScale: 0.25,
      pixelRatioMax: 1.0,
      shadows: false,
      rainCount: 90,
      streakCount: 20,
      anisotropy: 2
    }
  };

  const QUALITY_ORDER = ['HIGH', 'ULTRA', 'PERFORMANCE'];

  function normalizeQualityPreset(presetName) {
    const raw = String(presetName || 'HIGH').toUpperCase().trim();
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
    if (raw === 'ULTRA' || raw.includes('BLOOM') || raw === '3D ULTRA' || raw === '3D ULTRA HD') {
      return 'ULTRA';
    }
    return 'HIGH';
  }

  // ---------------------------------------------------------------------------
  // GLSL SHADERS (Three.js r128 WebGL 1 / 2 Compatible)
  // ---------------------------------------------------------------------------

  const FULLSCREEN_VERTEX_SHADER = [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = vec4(position.xy, 0.0, 1.0);',
    '}'
  ].join('\n');

  // Pass 2A: Tuned HDR Emissive Bright-Pass Threshold Shader
  // Selective glow on LED headlights, police red/blue lightbars, friction sparks & neon signage
  // without washing out the dark nocturnal sky or concrete/glass architecture.
  const BRIGHT_PASS_FRAGMENT_SHADER = [
    'precision highp float;',
    'uniform sampler2D tDiffuse;',
    'uniform float uThreshold;',
    'uniform float uSoftKnee;',
    'uniform float uBloomBoost;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  vec4 texel = texture2D(tDiffuse, vUv);',
    '  vec3 col = texel.rgb;',
    '  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));',
    '  float maxChannel = max(max(col.r, col.g), col.b);',
    '  float brightness = max(luma, maxChannel * 0.88);',
    '',
    '  // Selective boost only for bright saturated emitters (headlights, strobes, sparks, neon tubes)',
    '  float minChannel = min(min(col.r, col.g), col.b);',
    '  float saturation = maxChannel - minChannel;',
    '  brightness += saturation * smoothstep(0.45, 0.95, maxChannel) * 0.16;',
    '',
    '  float knee = uThreshold * uSoftKnee + 0.0001;',
    '  float soft = clamp(brightness - uThreshold + knee, 0.0, 2.0 * knee);',
    '  soft = (soft * soft) / (4.0 * knee);',
    '  float contribution = max(soft, brightness - uThreshold) / max(brightness, 0.0001);',
    '  vec3 bloomCol = col * clamp(contribution, 0.0, 1.0) * uBloomBoost;',
    '  gl_FragColor = vec4(bloomCol, 1.0);',
    '}'
  ].join('\n');

  // Pass 2B: Separable 9-Tap Kawase / Gaussian Blur Shader
  const BLUR_FRAGMENT_SHADER = [
    'precision highp float;',
    'uniform sampler2D tDiffuse;',
    'uniform vec2 uDirection;',
    'uniform vec2 uResolution;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  vec2 off1 = vec2(1.3846153846) * uDirection / max(uResolution, vec2(1.0));',
    '  vec2 off2 = vec2(3.2307692308) * uDirection / max(uResolution, vec2(1.0));',
    '  vec2 off3 = vec2(5.0769230769) * uDirection / max(uResolution, vec2(1.0));',
    '  vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.214607;',
    '  sum += texture2D(tDiffuse, vUv + off1).rgb * 0.27901;',
    '  sum += texture2D(tDiffuse, vUv - off1).rgb * 0.27901;',
    '  sum += texture2D(tDiffuse, vUv + off2).rgb * 0.094163;',
    '  sum += texture2D(tDiffuse, vUv - off2).rgb * 0.094163;',
    '  sum += texture2D(tDiffuse, vUv + off3).rgb * 0.019523;',
    '  sum += texture2D(tDiffuse, vUv - off3).rgb * 0.019523;',
    '  gl_FragColor = vec4(sum, 1.0);',
    '}'
  ].join('\n');

  // Pass 3: Final Composite + Refined Cinematic Bloom + Subtle Speed Lens Dispersion +
  // Photorealistic GTA 6 Nocturnal Filmic Grading + Police Strobe Rim Glow + Slow-Mo Letterbox
  const COMPOSITE_FRAGMENT_SHADER = [
    'precision highp float;',
    'uniform sampler2D tScene;',
    'uniform sampler2D tBloom;',
    'uniform float uBloomStrength;',
    'uniform float uSpeedRatio;',
    'uniform float uBoost;',
    'uniform float uWantedStars;',
    'uniform float uCinematicJump;',
    'uniform float uDamageFlash;',
    'uniform float uTime;',
    'varying vec2 vUv;',
    '',
    'vec3 acesFilm(vec3 x) {',
    '  float a = 2.51;',
    '  float b = 0.03;',
    '  float c = 2.43;',
    '  float d = 0.59;',
    '  float e = 0.14;',
    '  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);',
    '}',
    '',
    'void main() {',
    '  vec2 centered = vUv - 0.5;',
    '  float dist = length(centered);',
    '',
    '  // 1. Subtle Optical Chromatic Dispersion at extreme speed / nitro',
    '  float warpFactor = clamp(uSpeedRatio * 0.35 + uBoost * 0.85 + uCinematicJump * 0.35, 0.0, 1.5);',
    '  float caAmount = dist * dist * (0.0010 + 0.0055 * warpFactor);',
    '  vec2 caDir = normalize(centered + vec2(0.0001));',
    '  float r = texture2D(tScene, clamp(vUv + caDir * caAmount, 0.001, 0.999)).r;',
    '  float g = texture2D(tScene, vUv).g;',
    '  float b = texture2D(tScene, clamp(vUv - caDir * caAmount, 0.001, 0.999)).b;',
    '  vec3 sceneCol = vec3(r, g, b);',
    '',
    '  // 2. Add Clean Cinematic Bloom',
    '  vec3 bloomCol = texture2D(tBloom, vUv).rgb;',
    '  vec3 col = sceneCol + bloomCol * uBloomStrength;',
    '',
    '  // 3. GTA 6 Vice City Nocturnal Filmic Color Grading',
    '  // Deep slate-blue nocturnal shadows, clean natural midtones, crisp warm/cool highlights',
    '  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));',
    '  vec3 shadowTint = vec3(0.008, 0.014, 0.026);',
    '  vec3 midTint = vec3(1.01, 1.01, 1.03);',
    '  vec3 highTint = vec3(1.05, 1.04, 1.03);',
    '  col = mix(col + shadowTint * (1.0 - smoothstep(0.0, 0.28, luma)), col * midTint, smoothstep(0.06, 0.52, luma));',
    '  col = mix(col, col * highTint, smoothstep(0.48, 1.0, luma));',
    '',
    '  // Balanced filmic saturation',
    '  float gradedLuma = dot(col, vec3(0.2126, 0.7152, 0.0722));',
    '  col = mix(vec3(gradedLuma), col, 1.07 + uBoost * 0.08);',
    '',
    '  // 4. Subtle Nitro Boost Peripheral Rim Sheen',
    '  if (uBoost > 0.01) {',
    '    float edgeMask = smoothstep(0.38, 0.82, dist) * uBoost;',
    '    float pulse = 0.5 + 0.5 * sin(uTime * 16.0 - dist * 10.0);',
    '    vec3 nitroGlow = mix(vec3(0.25, 0.78, 1.0), vec3(1.0, 0.35, 0.55), pulse * 0.35);',
    '    col += nitroGlow * edgeMask * 0.14;',
    '  }',
    '',
    '  // 5. Realistic Police Strobe Screen Rim Reflection at 3-6 Wanted Stars',
    '  if (uWantedStars >= 3.0) {',
    '    float starIntensity = clamp((uWantedStars - 2.0) / 4.0, 0.0, 1.0);',
    '    float rimMask = smoothstep(0.42, 0.80, dist);',
    '    float sirenFreq = 7.5 + starIntensity * 4.5;',
    '    float strobeWave = sin(uTime * sirenFreq);',
    '    float leftSide = smoothstep(0.15, -0.45, centered.x);',
    '    float rightSide = smoothstep(-0.15, 0.45, centered.x);',
    '    vec3 redSiren = vec3(1.0, 0.08, 0.14) * max(0.0, strobeWave) * leftSide;',
    '    vec3 blueSiren = vec3(0.06, 0.48, 1.0) * max(0.0, -strobeWave) * rightSide;',
    '    col += (redSiren + blueSiren) * rimMask * (0.07 + 0.10 * starIntensity);',
    '  }',
    '',
    '  // 6. Cinematic Jump Slow-Mo Warm Contrast & Anamorphic Letterbox',
    '  if (uCinematicJump > 0.01) {',
    '    vec3 slowMoTint = vec3(1.06, 1.02, 0.98);',
    '    col = mix(col, col * slowMoTint, uCinematicJump * 0.45);',
    '  }',
    '',
    '  // 7. Damage Flash Red Impact Overlay',
    '  if (uDamageFlash > 0.01) {',
    '    float dmgRim = smoothstep(0.18, 0.74, dist);',
    '    col = mix(col, vec3(0.95, 0.06, 0.10), uDamageFlash * (0.28 + 0.38 * dmgRim));',
    '  }',
    '',
    '  // 8. ACES Filmic Curve & Soft Cinema Vignette',
    '  col = acesFilm(col * 1.04);',
    '  float vignette = 1.0 - smoothstep(0.46, 0.94, dist) * 0.26;',
    '  col *= vignette;',
    '',
    '  // Subtle cinematic letterbox bars during overpass ramp jump',
    '  if (uCinematicJump > 0.01) {',
    '    float barSize = 0.058 * clamp(uCinematicJump, 0.0, 1.0);',
    '    float topBar = smoothstep(1.0 - barSize - 0.012, 1.0 - barSize, vUv.y);',
    '    float botBar = 1.0 - smoothstep(barSize, barSize + 0.012, vUv.y);',
    '    float letterbox = clamp(topBar + botBar, 0.0, 1.0);',
    '    col = mix(col, vec3(0.01, 0.015, 0.022), letterbox * 0.92);',
    '  }',
    '',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  // Photorealistic GTA 6 Nocturnal Sky Dome Shader
  // Deep #05080d zenith -> #121a26 dark slate blue-grey horizon -> #141b24 volumetric street mist
  const SKYDOME_VERTEX_SHADER = [
    'varying vec3 vWorldPos;',
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  vec4 worldPosition = modelMatrix * vec4(position, 1.0);',
    '  vWorldPos = worldPosition.xyz;',
    '  gl_Position = projectionMatrix * viewMatrix * worldPosition;',
    '}'
  ].join('\n');

  const SKYDOME_FRAGMENT_SHADER = [
    'precision highp float;',
    'uniform float uTime;',
    'varying vec3 vWorldPos;',
    'varying vec2 vUv;',
    '',
    'float hash21(vec2 p) {',
    '  p = fract(p * vec2(234.34, 435.345));',
    '  p += dot(p, p + 34.23);',
    '  return fract(p.x * p.y);',
    '}',
    '',
    'void main() {',
    '  vec3 dir = normalize(vWorldPos);',
    '  float h = clamp(dir.y, -0.2, 1.0);',
    '  float horizon = clamp(1.0 - abs(dir.y) * 3.6, 0.0, 1.0);',
    '',
    '  // Deep nocturnal zenith (#05080d) -> dark slate mid-sky (#0b111a) -> slate blue-grey horizon (#121a26)',
    '  vec3 zenithCol = vec3(0.0196, 0.0314, 0.0510);',
    '  vec3 midSkyCol = vec3(0.0431, 0.0667, 0.1020);',
    '  vec3 horizonCol = vec3(0.0706, 0.1020, 0.1490);',
    '  vec3 mistCol = vec3(0.0784, 0.1059, 0.1412);',
    '',
    '  vec3 sky = mix(midSkyCol, zenithCol, smoothstep(0.06, 0.68, max(0.0, h)));',
    '  sky = mix(sky, horizonCol, pow(horizon, 1.8) * 0.85);',
    '',
    '  // Subtle street-level urban light bounce & nocturnal mist near horizon',
    '  float az = atan(dir.x, -dir.z);',
    '  float urbanBounce = 0.5 + 0.5 * sin(az * 2.0);',
    '  vec3 cityGlow = mix(vec3(0.11, 0.13, 0.18), vec3(0.14, 0.11, 0.15), urbanBounce * 0.35);',
    '  sky = mix(sky, mix(mistCol, cityGlow, 0.35), pow(horizon, 3.0) * 0.65);',
    '',
    '  // Subtle realistic tiny stars high above the horizon haze',
    '  if (dir.y > 0.14) {',
    '    vec2 starGrid = floor(dir.xz / (dir.y + 0.4) * 240.0);',
    '    float n = hash21(starGrid);',
    '    if (n > 0.993) {',
    '      float twinkle = 0.65 + 0.35 * sin(uTime * (1.8 + n * 4.0) + n * 62.8);',
    '      float starMask = smoothstep(0.14, 0.42, dir.y);',
    '      vec3 starCol = mix(vec3(0.82, 0.88, 0.96), vec3(0.96, 0.94, 0.90), fract(n * 17.3));',
    '      sky += starCol * twinkle * starMask * 0.42;',
    '    }',
    '  }',
    '',
    '  gl_FragColor = vec4(sky, 1.0);',
    '}'
  ].join('\n');

  // ---------------------------------------------------------------------------
  // 1. PROCEDURAL ENVIRONMENT CUBEMAP / PMREM REFLECTION GENERATOR
  // ---------------------------------------------------------------------------

  /**
   * Paint one face of the Realistic Vice City Nocturnal Cubemap onto a 2D Canvas.
   * Drives realistic metallic, chrome, clearcoat, and wet asphalt reflections.
   * @param {string} face - 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz'
   * @param {number} size
   * @returns {HTMLCanvasElement}
   */
  function paintViceCityCubeFace(face, size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    if (face === 'py') {
      // +Y: Dark nocturnal sky zenith with realistic overhead highway streetlamp reflection strips
      const grad = ctx.createRadialGradient(
        size * 0.5,
        size * 0.5,
        size * 0.05,
        size * 0.5,
        size * 0.5,
        size * 0.72
      );
      grad.addColorStop(0, '#05080d');
      grad.addColorStop(0.6, '#0c121c');
      grad.addColorStop(1.0, '#141d2b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      // Subtle overhead warm-white and cool-white streetlamp specular strips for chrome & clearcoat paint
      ctx.fillStyle = 'rgba(235, 244, 255, 0.48)';
      ctx.fillRect(size * 0.2, size * 0.1, size * 0.08, size * 0.8);
      ctx.fillStyle = 'rgba(255, 224, 180, 0.42)';
      ctx.fillRect(size * 0.72, size * 0.1, size * 0.08, size * 0.8);
      return canvas;
    }

    if (face === 'ny') {
      // -Y: Dark wet asphalt ground reflection
      const grad = ctx.createRadialGradient(
        size * 0.5,
        size * 0.5,
        size * 0.05,
        size * 0.5,
        size * 0.5,
        size * 0.7
      );
      grad.addColorStop(0, '#090b10');
      grad.addColorStop(0.65, '#10141d');
      grad.addColorStop(1.0, '#161c28');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      ctx.fillStyle = 'rgba(255, 220, 175, 0.22)';
      ctx.fillRect(0, size * 0.28, size, size * 0.08);
      ctx.fillStyle = 'rgba(180, 220, 255, 0.22)';
      ctx.fillRect(0, size * 0.64, size, size * 0.08);
      return canvas;
    }

    // Side faces ('px', 'nx', 'pz', 'nz'): Nocturnal skyline + warm building windows + streetlamp sheen
    const skyGrad = ctx.createLinearGradient(0, 0, 0, size);
    skyGrad.addColorStop(0.0, '#05080d');
    skyGrad.addColorStop(0.32, '#0c131d');
    skyGrad.addColorStop(0.5, '#141d29');
    skyGrad.addColorStop(0.54, '#1b2534');
    skyGrad.addColorStop(0.62, '#11161f');
    skyGrad.addColorStop(1.0, '#090b10');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, size, size);

    // Paint realistic nocturnal high-rise silhouettes with warm interior window lights & tasteful neon accents
    const seedOffset = face === 'px' ? 1 : face === 'nx' ? 2 : face === 'pz' ? 3 : 4;
    const numTowers = 8;
    const towerW = size / numTowers;
    for (let i = 0; i < numTowers; i++) {
      const hRatio = 0.16 + (((i * 37 + seedOffset * 19) % 10) / 10) * 0.24;
      const towerH = size * hRatio;
      const x = i * towerW + 2;
      const y = size * 0.54 - towerH;

      ctx.fillStyle = '#141821';
      ctx.fillRect(x, y, towerW - 4, towerH);

      // Subtle architectural neon or warm crown accent
      const accentType = (i + seedOffset) % 4;
      const accentColor =
        accentType === 0
          ? '#ff4d88'
          : accentType === 1
          ? '#66e0ff'
          : accentType === 2
          ? '#ffd28e'
          : '#e2ecf8';
      ctx.fillStyle = accentColor;
      ctx.fillRect(x + 2, y + 2, towerW - 8, 3);

      // Warm amber and soft white interior window strips
      for (let wy = y + 10; wy < size * 0.52; wy += 11) {
        ctx.fillStyle = (wy + i) % 3 === 0 ? '#ffe0a8' : '#dce8f8';
        ctx.fillRect(x + 6, wy, towerW - 14, 3);
      }

      // Specular reflection streaking down into the lower wet-asphalt half
      const reflGrad = ctx.createLinearGradient(0, size * 0.54, 0, size * 0.9);
      reflGrad.addColorStop(
        0,
        accentType === 0
          ? 'rgba(255, 77, 136, 0.35)'
          : accentType === 1
          ? 'rgba(102, 224, 255, 0.35)'
          : 'rgba(255, 224, 168, 0.35)'
      );
      reflGrad.addColorStop(1, 'rgba(9, 11, 16, 0.0)');
      ctx.fillStyle = reflGrad;
      ctx.fillRect(x + 4, size * 0.54, towerW - 10, size * 0.36);
    }

    // Crisp streetlamp horizon specular line for realistic chrome & glasses reflections
    ctx.fillStyle = 'rgba(240, 246, 255, 0.65)';
    ctx.fillRect(0, size * 0.53, size, 3);

    return canvas;
  }

  /**
   * Generates a procedural Vice City Nocturnal environment reflection map.
   * Compatible with `scene.environment = envMap` and `material.envMap = envMap`.
   * @param {THREE.WebGLRenderer} [renderer]
   * @returns {THREE.Texture}
   */
  function createEnvMap(renderer) {
    if (typeof window === 'undefined' || !window.THREE) return null;
    const THREE = window.THREE;

    if (GT6PostFX._cachedEnvMap) {
      return GT6PostFX._cachedEnvMap;
    }

    const size = 256;
    const faces = ['px', 'nx', 'py', 'ny', 'pz', 'nz'].map((face) =>
      paintViceCityCubeFace(face, size)
    );

    const cubeTexture = new THREE.CubeTexture(faces);
    cubeTexture.format = THREE.RGBAFormat;
    cubeTexture.mapping = THREE.CubeReflectionMapping;
    cubeTexture.generateMipmaps = true;
    cubeTexture.minFilter = THREE.LinearMipmapLinearFilter;
    cubeTexture.magFilter = THREE.LinearFilter;
    if (THREE.sRGBEncoding !== undefined) {
      cubeTexture.encoding = THREE.sRGBEncoding;
    }
    cubeTexture.needsUpdate = true;

    if (renderer && typeof THREE.PMREMGenerator === 'function') {
      try {
        const gl = typeof renderer.getContext === 'function' ? renderer.getContext() : null;
        if (gl && typeof gl.getParameter === 'function') {
          const pmremGenerator = new THREE.PMREMGenerator(renderer);
          if (typeof pmremGenerator.compileCubemapShader === 'function') {
            pmremGenerator.compileCubemapShader();
          }
          const pmremTarget = pmremGenerator.fromCubemap(cubeTexture);
          pmremGenerator.dispose();
          if (pmremTarget && pmremTarget.texture) {
            pmremTarget.texture.cubeTextureFallback = cubeTexture;
            GT6PostFX._cachedEnvMap = pmremTarget.texture;
            return pmremTarget.texture;
          }
        }
      } catch (_err) {
        // Fallback to standard CubeTexture below
      }
    }

    GT6PostFX._cachedEnvMap = cubeTexture;
    return cubeTexture;
  }

  // ---------------------------------------------------------------------------
  // 2. MULTI-PASS WEBGL POST-PROCESSING PIPELINE
  // ---------------------------------------------------------------------------

  class PostProcessor {
    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {THREE.Scene} [scene]
     * @param {THREE.Camera} [camera]
     */
    constructor(renderer, scene, camera) {
      this.renderer = renderer || null;
      this.scene = scene || null;
      this.camera = camera || null;
      this.quality = 'HIGH';
      this.enabled = false;
      this.targetsReady = false;
      this.width = 1280;
      this.height = 720;
      this.elapsedTime = 0;

      this.sceneTarget = null;
      this.bloomTargetA = null;
      this.bloomTargetB = null;

      this.orthoCamera = null;
      this.quadScene = null;
      this.quadMesh = null;

      this.brightPassMat = null;
      this.blurMat = null;
      this.compositeMat = null;

      // Apply default HIGH (60FPS HD) renderer caps; offscreen targets stay lazy until ULTRA is enabled
      if (this.renderer) {
        this.setQuality(this.quality);
      }
    }

    _initPipeline() {
      if (typeof window === 'undefined' || !window.THREE || !this.renderer) {
        this.targetsReady = false;
        return;
      }
      const THREE = window.THREE;

      try {
        const sizeVec = new THREE.Vector2(1280, 720);
        if (typeof this.renderer.getSize === 'function') {
          this.renderer.getSize(sizeVec);
        }
        const pixelRatio =
          typeof this.renderer.getPixelRatio === 'function' ? this.renderer.getPixelRatio() : 1;
        this.width = Math.max(64, Math.floor((sizeVec.x || 1280) * pixelRatio));
        this.height = Math.max(64, Math.floor((sizeVec.y || 720) * pixelRatio));

        const preset = QUALITY_PRESETS[this.quality] || QUALITY_PRESETS.HIGH;
        const bloomW = Math.max(32, Math.floor(this.width * preset.bloomScale));
        const bloomH = Math.max(32, Math.floor(this.height * preset.bloomScale));

        const rtParams = {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          depthBuffer: true,
          stencilBuffer: false
        };

        const bloomParams = {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          depthBuffer: false,
          stencilBuffer: false
        };

        this.sceneTarget = new THREE.WebGLRenderTarget(this.width, this.height, rtParams);
        this.bloomTargetA = new THREE.WebGLRenderTarget(bloomW, bloomH, bloomParams);
        this.bloomTargetB = new THREE.WebGLRenderTarget(bloomW, bloomH, bloomParams);

        this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.quadScene = new THREE.Scene();
        const quadGeo = new THREE.PlaneGeometry(2, 2);

        this.brightPassMat = new THREE.ShaderMaterial({
          uniforms: {
            tDiffuse: { value: null },
            uThreshold: { value: 0.68 },
            uSoftKnee: { value: 0.42 },
            uBloomBoost: { value: 1.15 }
          },
          vertexShader: FULLSCREEN_VERTEX_SHADER,
          fragmentShader: BRIGHT_PASS_FRAGMENT_SHADER,
          depthWrite: false,
          depthTest: false
        });

        this.blurMat = new THREE.ShaderMaterial({
          uniforms: {
            tDiffuse: { value: null },
            uDirection: { value: new THREE.Vector2(1.0, 0.0) },
            uResolution: { value: new THREE.Vector2(bloomW, bloomH) }
          },
          vertexShader: FULLSCREEN_VERTEX_SHADER,
          fragmentShader: BLUR_FRAGMENT_SHADER,
          depthWrite: false,
          depthTest: false
        });

        this.compositeMat = new THREE.ShaderMaterial({
          uniforms: {
            tScene: { value: this.sceneTarget.texture },
            tBloom: { value: this.bloomTargetA.texture },
            uBloomStrength: { value: 0.65 },
            uSpeedRatio: { value: 0.4 },
            uBoost: { value: 0.0 },
            uWantedStars: { value: 6.0 },
            uCinematicJump: { value: 0.0 },
            uDamageFlash: { value: 0.0 },
            uTime: { value: 0.0 }
          },
          vertexShader: FULLSCREEN_VERTEX_SHADER,
          fragmentShader: COMPOSITE_FRAGMENT_SHADER,
          depthWrite: false,
          depthTest: false
        });

        this.quadMesh = new THREE.Mesh(quadGeo, this.compositeMat);
        this.quadMesh.frustumCulled = false;
        this.quadScene.add(this.quadMesh);

        this.targetsReady = true;
      } catch (err) {
        console.warn('[GT6PostFX] WebGLRenderTarget pipeline fallback to direct render:', err);
        this.targetsReady = false;
      }
    }

    /**
     * Resize offscreen render targets cleanly when viewport changes.
     * @param {number} width
     * @param {number} height
     */
    resize(width, height) {
      if (!width || !height) return;
      if (!this.targetsReady) {
        if (this.enabled && this.renderer) this._initPipeline();
        if (!this.targetsReady) return;
      }

      try {
        const pixelRatio =
          this.renderer && typeof this.renderer.getPixelRatio === 'function'
            ? this.renderer.getPixelRatio()
            : 1;
        this.width = Math.max(64, Math.floor(width * pixelRatio));
        this.height = Math.max(64, Math.floor(height * pixelRatio));

        const preset = QUALITY_PRESETS[this.quality] || QUALITY_PRESETS.HIGH;
        const bloomW = Math.max(32, Math.floor(this.width * preset.bloomScale));
        const bloomH = Math.max(32, Math.floor(this.height * preset.bloomScale));

        if (this.sceneTarget) this.sceneTarget.setSize(this.width, this.height);
        if (this.bloomTargetA) this.bloomTargetA.setSize(bloomW, bloomH);
        if (this.bloomTargetB) this.bloomTargetB.setSize(bloomW, bloomH);
        if (this.blurMat && this.blurMat.uniforms.uResolution) {
          this.blurMat.uniforms.uResolution.value.set(bloomW, bloomH);
        }
      } catch (_err) {
        // Ignore resize error in headless contexts
      }
    }

    /**
     * Set active quality preset ('HIGH' | 'ULTRA' | 'PERFORMANCE').
     * @param {string} presetName
     */
    setQuality(presetName) {
      const preset = normalizeQualityPreset(presetName);
      this.quality = preset;
      const cfg = QUALITY_PRESETS[preset];
      this.enabled = Boolean(cfg.usePostFX);

      if (this.renderer && typeof this.renderer.setPixelRatio === 'function') {
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        this.renderer.setPixelRatio(Math.min(dpr, cfg.pixelRatioMax));
      }
      if (this.renderer && this.renderer.shadowMap) {
        this.renderer.shadowMap.enabled = Boolean(cfg.shadows);
      }

      if (this.enabled && !this.targetsReady && this.renderer) {
        this._initPipeline();
      }

      if (this.targetsReady && this.renderer && typeof this.renderer.getSize === 'function' && window.THREE) {
        const THREE = window.THREE;
        const sizeVec = new THREE.Vector2(this.width, this.height);
        this.renderer.getSize(sizeVec);
        this.resize(sizeVec.x || 1280, sizeVec.y || 720);
      }

      return preset;
    }

    /**
     * Render the 3D scene through the multi-pass HDR Bloom & Vice City Filmic pipeline.
     * Supports flexible argument signatures:
     *   - render(scene, camera, state, dt)
     *   - render(renderer, scene, camera, state, dt)
     *   - render(state, dt)
     */
    render(arg1, arg2, arg3, arg4, arg5) {
      let renderer = this.renderer;
      let scene = this.scene;
      let camera = this.camera;
      let state = null;
      let dt = 0.016;

      if (arg1 && typeof arg1.render === 'function') {
        renderer = arg1;
        scene = arg2 || this.scene;
        camera = arg3 || this.camera;
        state = arg4 || null;
        dt = typeof arg5 === 'number' ? arg5 : 0.016;
      } else if (arg1 && (arg1.isScene || arg1.type === 'Scene' || Array.isArray(arg1.children))) {
        scene = arg1;
        camera = arg2 || this.camera;
        state = arg3 || null;
        dt = typeof arg4 === 'number' ? arg4 : 0.016;
      } else {
        state = arg1 || null;
        dt = typeof arg2 === 'number' ? arg2 : 0.016;
      }

      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;

      if (!renderer || !scene || !camera) return;

      if (!this.targetsReady && this.enabled) {
        this._initPipeline();
      }

      const safeDt = Math.min(Math.max(Number(dt) || 0.016, 0.001), 0.1);
      this.elapsedTime += safeDt;

      const preset = QUALITY_PRESETS[this.quality] || QUALITY_PRESETS.HIGH;
      const canUseTargets =
        this.enabled &&
        preset.usePostFX &&
        this.targetsReady &&
        typeof renderer.setRenderTarget === 'function' &&
        this.sceneTarget &&
        this.bloomTargetA &&
        this.bloomTargetB;

      if (!canUseTargets) {
        renderer.render(scene, camera);
        return;
      }

      // Extract dynamic game telemetry for shader uniforms
      let speedRatio = 0.42;
      let isBoosting = false;
      let wantedStars = 6;
      let isCinematicJump = false;
      let damageFlash = 0;

      if (state && typeof state === 'object') {
        if (typeof state.speedRatio === 'number') {
          speedRatio = state.speedRatio;
        } else if (typeof state.speed === 'number') {
          const maxSpd = state.maxSpeed || 320;
          speedRatio = state.speed / maxSpd;
        }
        isBoosting = Boolean(
          state.isBoosting || state.nitroActive || state.boosting || state.nitroBoostTimer > 0
        );
        if (typeof state.wantedStars === 'number') {
          wantedStars = state.wantedStars;
        } else if (typeof state.wantedLevel === 'number') {
          wantedStars = state.wantedLevel;
        }
        isCinematicJump = Boolean(
          state.isCinematicJump ||
            state.cinematicJump ||
            state.slowMoActive ||
            (state.isAirborne && (state.playerY || 0) > 1.35)
        );
        if (typeof state.damageFlash === 'number') {
          damageFlash = state.damageFlash;
        } else if (typeof state.hitFlashTimer === 'number') {
          damageFlash = Math.min(1, state.hitFlashTimer * 2.5);
        }
      }

      try {
        const prevTarget =
          typeof renderer.getRenderTarget === 'function' ? renderer.getRenderTarget() : null;

        // PASS 1: Render 3D scene to offscreen target
        renderer.setRenderTarget(this.sceneTarget);
        renderer.clear();
        renderer.render(scene, camera);

        // PASS 2A: Bright-pass threshold extraction into bloomTargetA
        this.quadMesh.material = this.brightPassMat;
        this.brightPassMat.uniforms.tDiffuse.value = this.sceneTarget.texture;
        this.brightPassMat.uniforms.uBloomBoost.value = isBoosting ? 1.35 : 1.15;
        renderer.setRenderTarget(this.bloomTargetA);
        renderer.clear();
        renderer.render(this.quadScene, this.orthoCamera);

        // PASS 2B: Separable Kawase / Gaussian Horizontal & Vertical Blur passes
        this.quadMesh.material = this.blurMat;
        const iterations = preset.bloomIterations || 1;
        for (let i = 0; i < iterations; i++) {
          const radius = 1.0 + i * 1.1;
          // Horizontal blur: bloomTargetA -> bloomTargetB
          this.blurMat.uniforms.tDiffuse.value = this.bloomTargetA.texture;
          this.blurMat.uniforms.uDirection.value.set(radius, 0.0);
          renderer.setRenderTarget(this.bloomTargetB);
          renderer.clear();
          renderer.render(this.quadScene, this.orthoCamera);

          // Vertical blur: bloomTargetB -> bloomTargetA
          this.blurMat.uniforms.tDiffuse.value = this.bloomTargetB.texture;
          this.blurMat.uniforms.uDirection.value.set(0.0, radius);
          renderer.setRenderTarget(this.bloomTargetA);
          renderer.clear();
          renderer.render(this.quadScene, this.orthoCamera);
        }

        // PASS 3: Final Composite + GTA 6 Nocturnal Filmic Grading -> Screen
        this.quadMesh.material = this.compositeMat;
        const u = this.compositeMat.uniforms;
        u.tScene.value = this.sceneTarget.texture;
        u.tBloom.value = this.bloomTargetA.texture;
        u.uBloomStrength.value = isBoosting ? 0.85 : 0.65;
        u.uSpeedRatio.value = Math.max(0, Math.min(1.5, speedRatio));
        u.uBoost.value = isBoosting ? 1.0 : 0.0;
        u.uWantedStars.value = wantedStars;
        u.uCinematicJump.value = isCinematicJump ? 1.0 : 0.0;
        u.uDamageFlash.value = Math.max(0, Math.min(1.0, damageFlash));
        u.uTime.value = this.elapsedTime;

        renderer.setRenderTarget(prevTarget || null);
        renderer.render(this.quadScene, this.orthoCamera);
      } catch (_err) {
        // Automatic fallback to direct render if any WebGL target call fails
        this.targetsReady = false;
        try {
          if (typeof renderer.setRenderTarget === 'function') {
            renderer.setRenderTarget(null);
          }
          renderer.render(scene, camera);
        } catch (_innerErr) {
          // Ignore in mocked headless test
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3. HIGH-RESOLUTION WET ASPHALT PBR TEXTURES & MATERIAL
  // ---------------------------------------------------------------------------

  function pseudoRand(seed) {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  /**
   * Generates procedural wet-asphalt textures (`map`, `roughnessMap`, plus a pre-configured `material`)
   * with realistic micro-grain, crisp double-yellow & dashed white highway markings, and rain sheen puddles
   * without heavy `bumpMap`/`normalMap` fragment shader overhead.
   * @param {THREE.WebGLRenderer} [renderer]
   * @returns {{ map: THREE.CanvasTexture, roughnessMap: THREE.CanvasTexture, bumpMap: null, normalMap: null, material: THREE.MeshStandardMaterial }}
   */
  function createWetAsphaltTextures(renderer) {
    if (typeof window === 'undefined' || !window.THREE) return {};
    const THREE = window.THREE;

    if (GT6PostFX._cachedAsphalt) {
      return GT6PostFX._cachedAsphalt;
    }

    const size = 1024;

    // 1. Albedo / Diffuse Map (Dark wet asphalt aggregate #101319, micro-grain, tire tracks, lane markings)
    const mapCanvas = document.createElement('canvas');
    mapCanvas.width = size;
    mapCanvas.height = size;
    const mctx = mapCanvas.getContext('2d');

    // 2. Roughness Map (Dark = glossy wet rain sheen puddles ~0.08; Mid = damp asphalt ~0.46)
    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = size;
    roughCanvas.height = size;
    const rctx = roughCanvas.getContext('2d');

    if (mctx && rctx) {
      // Base dark wet asphalt tone (#101319)
      mctx.fillStyle = '#101319';
      mctx.fillRect(0, 0, size, size);

      // Base damp asphalt roughness (0.46 -> rgb(118,118,118))
      rctx.fillStyle = 'rgb(118, 118, 118)';
      rctx.fillRect(0, 0, size, size);

      // Glossy wheel wear tracks along the 4 lanes
      const laneCenters = [0.14, 0.38, 0.62, 0.86];
      for (let l = 0; l < laneCenters.length; l++) {
        const cx = laneCenters[l] * size;
        const trackGrad = mctx.createLinearGradient(cx - 85, 0, cx + 85, 0);
        trackGrad.addColorStop(0, 'rgba(12, 14, 18, 0.0)');
        trackGrad.addColorStop(0.3, 'rgba(8, 10, 14, 0.48)');
        trackGrad.addColorStop(0.5, 'rgba(20, 24, 32, 0.22)');
        trackGrad.addColorStop(0.7, 'rgba(8, 10, 14, 0.48)');
        trackGrad.addColorStop(1, 'rgba(12, 14, 18, 0.0)');
        mctx.fillStyle = trackGrad;
        mctx.fillRect(cx - 85, 0, 170, size);

        const roughTrack = rctx.createLinearGradient(cx - 80, 0, cx + 80, 0);
        roughTrack.addColorStop(0, 'rgba(36, 36, 36, 0.0)');
        roughTrack.addColorStop(0.35, 'rgba(36, 36, 36, 0.64)');
        roughTrack.addColorStop(0.65, 'rgba(36, 36, 36, 0.64)');
        roughTrack.addColorStop(1, 'rgba(36, 36, 36, 0.0)');
        rctx.fillStyle = roughTrack;
        rctx.fillRect(cx - 80, 0, 160, size);
      }

      // Subtle nocturnal rain sheen puddles for mirror-like streetlamp & police strobe reflections
      for (let i = 0; i < 28; i++) {
        const px = pseudoRand(i * 3.1 + 1) * size;
        const py = pseudoRand(i * 7.3 + 2) * size;
        const rx = 42 + pseudoRand(i * 11.7) * 105;
        const ry = 65 + pseudoRand(i * 17.9) * 175;
        const rad = Math.max(rx, ry);

        const pGrad = rctx.createRadialGradient(px, py, rx * 0.1, px, py, rad);
        pGrad.addColorStop(0, 'rgba(18, 18, 18, 0.90)');
        pGrad.addColorStop(0.65, 'rgba(28, 28, 28, 0.72)');
        pGrad.addColorStop(1, 'rgba(118, 118, 118, 0.0)');
        rctx.fillStyle = pGrad;
        rctx.beginPath();
        rctx.arc(px, py, rad, 0, Math.PI * 2);
        rctx.fill();

        const mGrad = mctx.createRadialGradient(px, py, rx * 0.1, px, py, rad);
        mGrad.addColorStop(0, 'rgba(9, 12, 17, 0.62)');
        mGrad.addColorStop(1, 'rgba(16, 19, 25, 0.0)');
        mctx.fillStyle = mGrad;
        mctx.beginPath();
        mctx.arc(px, py, rad, 0, Math.PI * 2);
        mctx.fill();
      }

      // Subtle realistic asphalt micro-grain baked directly into diffuse & roughness (zero bumpMap shader cost)
      const grainPalette = ['#13171f', '#171b25', '#1b202b', '#0d1016'];
      for (let i = 0; i < 3600; i++) {
        const gx = pseudoRand(i * 1.13) * size;
        const gy = pseudoRand(i * 2.71) * size;
        const gw = 1 + (i & 1);
        mctx.fillStyle = grainPalette[i & 3];
        mctx.fillRect(gx, gy, gw, gw);
        if ((i & 3) === 0) {
          rctx.fillStyle = 'rgba(145, 145, 145, 0.25)';
          rctx.fillRect(gx, gy, gw, gw);
        }
      }

      // Realistic Concrete Gutter / Curb Shoulder Borders at outer edges
      mctx.fillStyle = '#242934';
      mctx.fillRect(0, 0, 26, size);
      mctx.fillRect(size - 26, 0, 26, size);

      // Outer solid white highway edge lines
      mctx.fillStyle = 'rgba(232, 238, 246, 0.88)';
      mctx.fillRect(36, 0, 9, size);
      mctx.fillRect(size - 45, 0, 9, size);

      // Center Double Yellow Highway Divider Stripes with crisp asphalt separation
      mctx.fillStyle = '#0c0f14';
      mctx.fillRect(size * 0.5 - 18, 0, 36, size);
      mctx.fillStyle = '#e6af1c';
      mctx.fillRect(size * 0.5 - 14, 0, 9, size);
      mctx.fillRect(size * 0.5 + 5, 0, 9, size);

      // Crisp Dashed White Lane Dividers (at 25% and 75% across the 4-lane highway)
      mctx.fillStyle = 'rgba(236, 242, 250, 0.90)';
      const dashCount = 8;
      const dashStride = size / dashCount;
      for (let d = 0; d < dashCount; d++) {
        const dy = d * dashStride + 18;
        const dh = dashStride * 0.52;
        mctx.fillRect(size * 0.25 - 5, dy, 10, dh);
        mctx.fillRect(size * 0.75 - 5, dy, 10, dh);
      }
    }

    const preset = QUALITY_PRESETS[GT6PostFX.quality] || QUALITY_PRESETS.HIGH;
    const hwAnisotropy =
      renderer &&
      renderer.capabilities &&
      typeof renderer.capabilities.getMaxAnisotropy === 'function'
        ? renderer.capabilities.getMaxAnisotropy()
        : 8;
    const targetAnisotropy = Math.min(preset.anisotropy || 4, hwAnisotropy);

    function configureRepeatingTexture(canvas, isSRGB) {
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1, 4);
      tex.anisotropy = targetAnisotropy;
      if (isSRGB && THREE.sRGBEncoding !== undefined) {
        tex.encoding = THREE.sRGBEncoding;
      }
      tex.needsUpdate = true;
      return tex;
    }

    const map = configureRepeatingTexture(mapCanvas, true);
    const roughnessMap = configureRepeatingTexture(roughCanvas, false);

    // Lightweight PBR material without bumpMap/normalMap screen-space derivative overhead
    const material = new THREE.MeshStandardMaterial({
      map: map,
      roughnessMap: roughnessMap,
      roughness: 0.36,
      metalness: 0.24,
      envMapIntensity: 1.45
    });

    const result = {
      map: map,
      roughnessMap: roughnessMap,
      bumpMap: null,
      normalMap: null,
      material: material
    };

    GT6PostFX._cachedAsphalt = result;
    return result;
  }

  // ---------------------------------------------------------------------------
  // 3B. ZERO-PASS ADDITIVE GLOW SPRITE HELPERS (HEADLIGHTS, SIRENS, NEON, SPARKS)
  // ---------------------------------------------------------------------------

  /**
   * Creates and caches a smooth radial glow CanvasTexture for lightweight additive bloom sprites.
   * @returns {THREE.CanvasTexture|null}
   */
  function createGlowTexture() {
    if (typeof window === 'undefined' || !window.THREE) return null;
    const THREE = window.THREE;

    if (GT6PostFX._cachedGlowTexture) {
      return GT6PostFX._cachedGlowTexture;
    }

    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      const half = size * 0.5;
      const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
      grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
      grad.addColorStop(0.16, 'rgba(255, 255, 255, 0.86)');
      grad.addColorStop(0.36, 'rgba(255, 255, 255, 0.42)');
      grad.addColorStop(0.65, 'rgba(255, 255, 255, 0.12)');
      grad.addColorStop(0.86, 'rgba(255, 255, 255, 0.025)');
      grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;

    GT6PostFX._cachedGlowTexture = tex;
    return tex;
  }

  /**
   * Creates a lightweight additive THREE.SpriteMaterial for bloom halos with zero fullscreen blur passes.
   * @param {number|string} [colorHex=0xffffff]
   * @param {number} [opacity=0.85]
   * @returns {THREE.SpriteMaterial|null}
   */
  function createGlowSpriteMaterial(colorHex = 0xffffff, opacity = 0.85) {
    if (typeof window === 'undefined' || !window.THREE) return null;
    const THREE = window.THREE;
    const tex = createGlowTexture();

    return new THREE.SpriteMaterial({
      map: tex,
      color: colorHex !== undefined ? colorHex : 0xffffff,
      transparent: true,
      opacity: typeof opacity === 'number' ? opacity : 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false
    });
  }

  // ---------------------------------------------------------------------------
  // 4. 3D NOCTURNAL SKY DOME, SUBTLE NIGHT MIST RAIN & HIGH-SPEED AIR STREAKS
  // ---------------------------------------------------------------------------

  /**
   * Builds and attaches the GLSL GTA 6 Nocturnal Sky Dome, subtle night mist rain,
   * and high-speed wind streaks to `scene`.
   * @param {THREE.Scene} [scene]
   * @returns {{ group: THREE.Group, skyDome: THREE.Mesh, rain: THREE.LineSegments, speedStreaks: THREE.LineSegments, update: Function }}
   */
  function createAtmosphere(scene) {
    if (typeof window === 'undefined' || !window.THREE) {
      return {
        group: null,
        skyDome: null,
        rain: null,
        speedStreaks: null,
        update: function () {}
      };
    }
    const THREE = window.THREE;

    const group = new THREE.Group();
    group.name = 'GT6AtmosphereGroup';

    // 1. Custom GLSL GTA 6 Nocturnal Sky Dome
    const skyGeo = new THREE.SphereGeometry(340, 32, 20);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0.0 }
      },
      vertexShader: SKYDOME_VERTEX_SHADER,
      fragmentShader: SKYDOME_FRAGMENT_SHADER,
      side: THREE.BackSide,
      depthWrite: false
    });
    const skyDome = new THREE.Mesh(skyGeo, skyMat);
    skyDome.name = 'ViceCitySkyDome';
    skyDome.renderOrder = -10;
    group.add(skyDome);

    // 2. Subtle Nocturnal Mist / Fine Drizzle Streaks (140 max particles)
    const rainCount = 140;
    const rainPositions = new Float32Array(rainCount * 6);
    const rainColors = new Float32Array(rainCount * 6);
    const rainSeeds = new Float32Array(rainCount * 3);

    for (let i = 0; i < rainCount; i++) {
      const x = (Math.random() - 0.5) * 38;
      const y = Math.random() * 24 + 0.2;
      const z = -Math.random() * 115 + 12;

      rainSeeds[i * 3] = x;
      rainSeeds[i * 3 + 1] = y;
      rainSeeds[i * 3 + 2] = z;

      const idx = i * 6;
      rainPositions[idx] = x;
      rainPositions[idx + 1] = y;
      rainPositions[idx + 2] = z;
      rainPositions[idx + 3] = x;
      rainPositions[idx + 4] = y - 0.75;
      rainPositions[idx + 5] = z + 0.55;

      // Subtle silver-grey wet night rain reflections
      rainColors[idx] = 0.17;
      rainColors[idx + 1] = 0.1875;
      rainColors[idx + 2] = 0.2125;
      rainColors[idx + 3] = 0.68;
      rainColors[idx + 4] = 0.75;
      rainColors[idx + 5] = 0.85;
    }

    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    rainGeo.setAttribute('color', new THREE.BufferAttribute(rainColors, 3));

    const rainMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    const rain = new THREE.LineSegments(rainGeo, rainMat);
    rain.name = 'ViceCityRain';
    rain.frustumCulled = false;
    group.add(rain);

    // 3. Subtle High-Speed Wind / Streetlamp Specular Streaks at high km/h & Nitro (32 max particles)
    const streakCount = 32;
    const streakPositions = new Float32Array(streakCount * 6);
    const streakColors = new Float32Array(streakCount * 6);
    const streakSeeds = new Float32Array(streakCount * 4);

    for (let i = 0; i < streakCount; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const x = side * (6.8 + Math.random() * 10.0);
      const y = 0.8 + Math.random() * 8.5;
      const z = -Math.random() * 130 + 10;
      const len = 3.0 + Math.random() * 4.5;

      streakSeeds[i * 4] = x;
      streakSeeds[i * 4 + 1] = y;
      streakSeeds[i * 4 + 2] = z;
      streakSeeds[i * 4 + 3] = len;

      const idx = i * 6;
      streakPositions[idx] = x;
      streakPositions[idx + 1] = y;
      streakPositions[idx + 2] = z;
      streakPositions[idx + 3] = x;
      streakPositions[idx + 4] = y;
      streakPositions[idx + 5] = z + len;

      // Soft warm-white / ice-blue wind streaks
      const isWarm = i % 3 === 0;
      const cr = isWarm ? 1.0 : 0.82;
      const cg = isWarm ? 0.88 : 0.90;
      const cb = isWarm ? 0.72 : 1.0;

      streakColors[idx] = cr * 0.08;
      streakColors[idx + 1] = cg * 0.08;
      streakColors[idx + 2] = cb * 0.08;
      streakColors[idx + 3] = cr;
      streakColors[idx + 4] = cg;
      streakColors[idx + 5] = cb;
    }

    const streakGeo = new THREE.BufferGeometry();
    streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPositions, 3));
    streakGeo.setAttribute('color', new THREE.BufferAttribute(streakColors, 3));

    const streakMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    const speedStreaks = new THREE.LineSegments(streakGeo, streakMat);
    speedStreaks.name = 'ViceCitySpeedStreaks';
    speedStreaks.frustumCulled = false;
    group.add(speedStreaks);

    if (scene && typeof scene.add === 'function') {
      scene.add(group);
    }

    let elapsed = 0;
    let activeRain = rainCount;
    let activeStreaks = streakCount;

    function applyQuality(presetName) {
      const key = normalizeQualityPreset(presetName || GT6PostFX.quality);
      const preset = QUALITY_PRESETS[key] || QUALITY_PRESETS.HIGH;
      activeRain = Math.min(rainCount, preset.rainCount || rainCount);
      activeStreaks = Math.min(streakCount, preset.streakCount || streakCount);
      rain.visible = activeRain > 0;
      if (typeof rainGeo.setDrawRange === 'function') {
        rainGeo.setDrawRange(0, activeRain * 2);
      }
      if (typeof streakGeo.setDrawRange === 'function') {
        streakGeo.setDrawRange(0, activeStreaks * 2);
      }
    }

    applyQuality(GT6PostFX.quality);

    function update(arg1, arg2, camera) {
      let state = null;
      let dt = 0.016;
      let speedRatio = 0.45;
      let isBoosting = false;
      let roadCurve = 0;

      if (typeof arg1 === 'number' && (typeof arg2 === 'object' || arg2 === undefined)) {
        if (typeof arg2 === 'number') {
          speedRatio = arg1;
          dt = arg2;
        } else {
          dt = arg1;
          state = arg2 || null;
        }
      } else {
        state = arg1 || null;
        dt = typeof arg2 === 'number' ? arg2 : 0.016;
      }

      const safeDt = Math.min(Math.max(Number(dt) || 0.016, 0.001), 0.05);
      elapsed += safeDt;

      if (skyMat.uniforms && skyMat.uniforms.uTime) {
        skyMat.uniforms.uTime.value = elapsed;
      }

      if (camera && camera.position) {
        skyDome.position.x = camera.position.x;
        skyDome.position.z = camera.position.z;
      }

      if (state && typeof state === 'object') {
        if (typeof state.speedRatio === 'number') {
          speedRatio = state.speedRatio;
        } else if (typeof state.speed === 'number') {
          speedRatio = state.speed / (state.maxSpeed || 320);
        }
        isBoosting = Boolean(state.isBoosting || state.nitroActive || state.boosting);
        if (typeof state.roadCurve === 'number') {
          roadCurve = state.roadCurve;
        }
      }

      const forwardSpeed = 28 + speedRatio * 75 + (isBoosting ? 55 : 0);

      // Update 3D Mist Rain (typed-array loop, zero allocations)
      if (rain.visible && activeRain > 0) {
        const posAttr = rainGeo.getAttribute('position');
        const arr = posAttr.array;
        const dropVelY = 22.0;
        const dropVelZ = forwardSpeed * 0.82;
        const streakLenY = 0.7 + speedRatio * 0.4;
        const streakLenZ = 0.4 + speedRatio * 1.2 + (isBoosting ? 0.9 : 0);

        for (let i = 0; i < activeRain; i++) {
          const seedBase = i * 3;
          const baseX = rainSeeds[seedBase];
          let y = rainSeeds[seedBase + 1] - dropVelY * safeDt;
          let z = rainSeeds[seedBase + 2] + dropVelZ * safeDt;

          if (y < 0.05) {
            y += 24.0;
          }
          if (z > 14.0) {
            z -= 125.0;
          }

          rainSeeds[seedBase + 1] = y;
          rainSeeds[seedBase + 2] = z;

          const zn = z * 0.01;
          const x = baseX + roadCurve * (zn * zn) * 28;

          const idx = i * 6;
          arr[idx] = x;
          arr[idx + 1] = y;
          arr[idx + 2] = z;
          arr[idx + 3] = x - 0.05;
          arr[idx + 4] = y - streakLenY;
          arr[idx + 5] = z + streakLenZ;
        }
        posAttr.needsUpdate = true;
      }

      // Update 3D High-Speed Streaks (typed-array loop, zero allocations)
      const showStreaks = (speedRatio > 0.55 || isBoosting) && activeStreaks > 0;
      speedStreaks.visible = showStreaks;
      if (showStreaks) {
        streakMat.opacity = Math.min(
          0.36,
          Math.max(0.08, (speedRatio - 0.5) * 0.45 + (isBoosting ? 0.22 : 0))
        );
        const sAttr = streakGeo.getAttribute('position');
        const sArr = sAttr.array;
        const streakSpeed = forwardSpeed * 1.4;
        const lengthMul = 0.75 + speedRatio * 1.3 + (isBoosting ? 1.2 : 0);

        for (let i = 0; i < activeStreaks; i++) {
          const seedBase = i * 4;
          const baseX = streakSeeds[seedBase];
          const y = streakSeeds[seedBase + 1];
          let z = streakSeeds[seedBase + 2] + streakSpeed * safeDt;
          const baseLen = streakSeeds[seedBase + 3] * lengthMul;

          if (z > 16.0) {
            z -= 140.0;
          }
          streakSeeds[seedBase + 2] = z;

          const zn1 = z * 0.01;
          const zn2 = (z + baseLen) * 0.01;
          const curveX1 = roadCurve * (zn1 * zn1) * 28;
          const curveX2 = roadCurve * (zn2 * zn2) * 28;

          const idx = i * 6;
          sArr[idx] = baseX + curveX1;
          sArr[idx + 1] = y;
          sArr[idx + 2] = z;
          sArr[idx + 3] = baseX + curveX2;
          sArr[idx + 4] = y;
          sArr[idx + 5] = z + baseLen;
        }
        sAttr.needsUpdate = true;
      }
    }

    const atmosphereObj = {
      group: group,
      skyDome: skyDome,
      rain: rain,
      speedStreaks: speedStreaks,
      update: update,
      setQuality: applyQuality
    };

    GT6PostFX._activeAtmosphere = atmosphereObj;
    return atmosphereObj;
  }

  // ---------------------------------------------------------------------------
  // 5. PUBLIC API: window.GT6PostFX
  // ---------------------------------------------------------------------------

  const GT6PostFX = {
    quality: 'HIGH',
    QUALITY_PRESETS: QUALITY_PRESETS,
    PostProcessor: PostProcessor,

    _cachedEnvMap: null,
    _cachedAsphalt: null,
    _cachedGlowTexture: null,
    _activeProcessor: null,
    _activeAtmosphere: null,

    init(renderer, scene, camera) {
      if (!this._activeProcessor || (renderer && this._activeProcessor.renderer !== renderer)) {
        this._activeProcessor = new PostProcessor(renderer, scene, camera);
        this._activeProcessor.setQuality(this.quality);
      } else {
        if (scene) this._activeProcessor.scene = scene;
        if (camera) this._activeProcessor.camera = camera;
      }
      return this._activeProcessor;
    },

    createPostProcessor(renderer, scene, camera) {
      return this.init(renderer, scene, camera);
    },

    createEnvMap: createEnvMap,

    createGlowTexture: createGlowTexture,

    createGlowSpriteMaterial: createGlowSpriteMaterial,

    render(arg1, arg2, arg3, arg4, arg5) {
      if (!this._activeProcessor) {
        if (arg1 && typeof arg1.render === 'function') {
          this.init(arg1, arg2, arg3);
        } else {
          return;
        }
      }
      this._activeProcessor.render(arg1, arg2, arg3, arg4, arg5);
    },

    resize(width, height) {
      if (this._activeProcessor) {
        this._activeProcessor.resize(width, height);
      }
    },

    createWetAsphaltTextures: createWetAsphaltTextures,

    createAtmosphere: createAtmosphere,

    updateAtmosphere(stateOrDt, dtOrState, camera) {
      if (this._activeAtmosphere && typeof this._activeAtmosphere.update === 'function') {
        this._activeAtmosphere.update(stateOrDt, dtOrState, camera);
      }
    },

    setQuality(preset, renderer) {
      const valid = normalizeQualityPreset(preset);
      this.quality = valid;
      const cfg = QUALITY_PRESETS[valid];

      if (this._activeProcessor) {
        this._activeProcessor.setQuality(valid);
      } else if (renderer) {
        if (typeof renderer.setPixelRatio === 'function') {
          const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
          renderer.setPixelRatio(Math.min(dpr, cfg.pixelRatioMax));
        }
        if (renderer.shadowMap) {
          renderer.shadowMap.enabled = Boolean(cfg.shadows);
        }
      }

      if (this._cachedAsphalt) {
        const targetAniso = cfg.anisotropy || 4;
        if (this._cachedAsphalt.map) {
          this._cachedAsphalt.map.anisotropy = targetAniso;
          this._cachedAsphalt.map.needsUpdate = true;
        }
        if (this._cachedAsphalt.roughnessMap) {
          this._cachedAsphalt.roughnessMap.anisotropy = targetAniso;
          this._cachedAsphalt.roughnessMap.needsUpdate = true;
        }
      }

      if (this._activeAtmosphere) {
        if (typeof this._activeAtmosphere.setQuality === 'function') {
          this._activeAtmosphere.setQuality(valid);
        } else if (this._activeAtmosphere.rain) {
          this._activeAtmosphere.rain.visible = cfg.rainCount > 0;
        }
      }

      return valid;
    },

    getQuality() {
      return this.quality;
    },

    cycleQuality() {
      const idx = QUALITY_ORDER.indexOf(this.quality);
      const next = QUALITY_ORDER[(idx + 1) % QUALITY_ORDER.length];
      return this.setQuality(next);
    },

    getPresetConfig(preset) {
      const key = normalizeQualityPreset(preset || this.quality);
      return QUALITY_PRESETS[key] || QUALITY_PRESETS.HIGH;
    }
  };

  if (typeof window !== 'undefined') {
    window.GT6PostFX = GT6PostFX;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = GT6PostFX;
  }
})();
