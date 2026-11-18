/**
 * GT6 RAFA: FUGA DE VICE CITY (EDTECH PT-13 EDITION)
 * Realistic Organic 3D Character & Sculpted Automotive Modeling Suite (Three.js r128)
 * High-performance low-draw-call procedural meshes faithful to reference video & poster.
 * Attach: window.GT6Models
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 2D CANVAS HELPERS
  // ---------------------------------------------------------------------------

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

  function strokeRoundRect(ctx, x, y, w, h, r) {
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
    ctx.stroke();
  }

  // Draw the signature 8-tooth EDTECH mechanical gear + "EDTECH" typography
  function drawEdtechGearLogo(ctx, cx, cy, outerRadius, darkBgHex, allWhiteText) {
    ctx.save();
    ctx.translate(cx, cy);

    ctx.fillStyle = '#f8fafc';
    const toothW = outerRadius * 0.36;
    const toothH = outerRadius * 0.34;
    for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 4);
      fillRoundRect(ctx, -toothW / 2, -outerRadius * 1.22, toothW, toothH, 4);
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(0, 0, outerRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = darkBgHex || '#0b0c10';
    ctx.beginPath();
    ctx.arc(0, 0, outerRadius * 0.65, 0, Math.PI * 2);
    ctx.fill();

    const bannerW = outerRadius * 3.15;
    const bannerH = outerRadius * 0.72;
    ctx.fillStyle = darkBgHex || '#0b0c10';
    fillRoundRect(ctx, -bannerW / 2, -bannerH / 2, bannerW, bannerH, 6);

    const fontSize = Math.round(outerRadius * 0.62);
    ctx.font = `900 ${fontSize}px "Arial Black", Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (allWhiteText) {
      ctx.fillStyle = '#ffffff';
      ctx.fillText('EDTECH', 0, 2);
    } else {
      ctx.fillStyle = '#e11d2a';
      ctx.fillText('ED', -outerRadius * 0.76, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('TECH', outerRadius * 0.44, 2);
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // FAST SHARED PBR MATERIAL & GEOMETRY MERGE / ORGANIC SCULPTING HELPERS
  // ---------------------------------------------------------------------------

  /**
   * Create a fast MeshStandardMaterial tuned for crisp 60 FPS nocturnal lighting
   * (avoids expensive multi-lobe MeshPhysicalMaterial clearcoat shaders).
   */
  function createStdMat(THREE, params, envMap) {
    const clean = {
      color: params.color !== undefined ? params.color : 0xffffff,
      roughness: params.roughness !== undefined ? params.roughness : 0.4,
      metalness: params.metalness !== undefined ? params.metalness : 0.1
    };
    if (params.map) clean.map = params.map;
    if (params.bumpMap) {
      clean.bumpMap = params.bumpMap;
      clean.bumpScale = params.bumpScale !== undefined ? params.bumpScale : 0.02;
    }
    if (params.emissive !== undefined) clean.emissive = params.emissive;
    if (params.emissiveIntensity !== undefined) clean.emissiveIntensity = params.emissiveIntensity;
    if (params.transparent) clean.transparent = true;
    if (params.opacity !== undefined) clean.opacity = params.opacity;
    if (params.side !== undefined) clean.side = params.side;
    if (params.depthWrite !== undefined) clean.depthWrite = params.depthWrite;
    if (envMap) {
      clean.envMap = envMap;
      clean.envMapIntensity = params.envMapIntensity !== undefined ? params.envMapIntensity : 1.3;
    }
    return new THREE.MeshStandardMaterial(clean);
  }

  /**
   * Merge an array of BufferGeometries sharing one material into a single indexed BufferGeometry
   * to slash WebGL draw calls without sacrificing geometric detail.
   */
  function mergeGeometries(THREE, geometries) {
    const valid = [];
    let totalVerts = 0;
    let totalIndices = 0;

    for (let i = 0; i < geometries.length; i++) {
      const geo = geometries[i];
      if (!geo || !geo.attributes || !geo.attributes.position) continue;
      if (!geo.attributes.normal) geo.computeVertexNormals();
      const pos = geo.attributes.position;
      const idx = geo.index;
      totalVerts += pos.count;
      totalIndices += idx ? idx.count : pos.count;
      valid.push(geo);
    }

    if (valid.length === 0) return new THREE.BufferGeometry();
    if (valid.length === 1) return valid[0];

    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);
    const uvs = new Float32Array(totalVerts * 2);
    const IndexArr = totalVerts > 65535 ? Uint32Array : Uint16Array;
    const indices = new IndexArr(totalIndices);

    let vOffset = 0;
    let iOffset = 0;

    for (let g = 0; g < valid.length; g++) {
      const geo = valid[g];
      const posArr = geo.attributes.position.array;
      const normArr = geo.attributes.normal.array;
      const uvAttr = geo.attributes.uv;
      const count = geo.attributes.position.count;

      positions.set(posArr, vOffset * 3);
      normals.set(normArr, vOffset * 3);
      if (uvAttr) {
        uvs.set(uvAttr.array, vOffset * 2);
      }

      if (geo.index) {
        const srcIdx = geo.index.array;
        for (let k = 0; k < srcIdx.length; k++) {
          indices[iOffset + k] = srcIdx[k] + vOffset;
        }
        iOffset += srcIdx.length;
      } else {
        for (let k = 0; k < count; k++) {
          indices[iOffset + k] = vOffset + k;
        }
        iOffset += count;
      }

      vOffset += count;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    merged.setIndex(new THREE.BufferAttribute(indices, 1));
    merged.computeBoundingSphere();
    return merged;
  }

  /**
   * Transform and bake a BufferGeometry in place so it can be cleanly merged.
   */
  function bakeGeo(geo, tx, ty, tz, rx, ry, rz, sx, sy, sz) {
    if (sx !== undefined && (sx !== 1 || sy !== 1 || sz !== 1)) {
      geo.scale(sx, sy, sz);
    }
    if (rx) geo.rotateX(rx);
    if (ry) geo.rotateY(ry);
    if (rz) geo.rotateZ(rz);
    if (tx || ty || tz) geo.translate(tx || 0, ty || 0, tz || 0);
    return geo;
  }

  /**
   * Build a smooth anatomical lofted surface along a sequence of cross-section rings.
   * Each ring specifies { y, cx, cz, rx, rz, v, shapeFn(theta) }.
   * Winding is strictly verified outward using right-handed basis U=+X, V=-Z, T=+Y.
   */
  function createAnatomicalLoft(THREE, rings, radialSegments, capBottom, capTop) {
    const segs = radialSegments || 28;
    const stride = segs + 1;
    const ringCount = rings.length;
    const vertCount = ringCount * stride + (capBottom ? stride + 1 : 0) + (capTop ? stride + 1 : 0);

    const positions = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    const indices = [];

    let pIdx = 0;
    let uvIdx = 0;

    for (let r = 0; r < ringCount; r++) {
      const ring = rings[r];
      const vCoord = ring.v !== undefined ? ring.v : r / Math.max(1, ringCount - 1);
      const cx = ring.cx || 0;
      const cz = ring.cz || 0;

      for (let s = 0; s <= segs; s++) {
        const uCoord = s / segs;
        const theta = uCoord * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        let rx = ring.rx;
        let rz = ring.rz;
        let dy = 0;

        if (typeof ring.shapeFn === 'function') {
          const mod = ring.shapeFn(theta, cosT, sinT);
          if (mod) {
            if (mod.rx !== undefined) rx = mod.rx;
            if (mod.rz !== undefined) rz = mod.rz;
            if (mod.dr !== undefined) {
              rx += mod.dr;
              rz += mod.dr;
            }
            if (mod.dy !== undefined) dy = mod.dy;
          }
        }

        // Basis: U = +X, V = -Z (so theta=PI/2 points toward -Z front chest, theta=1.5*PI toward +Z back)
        positions[pIdx++] = cx + cosT * rx;
        positions[pIdx++] = ring.y + dy;
        positions[pIdx++] = cz - sinT * rz;

        uvs[uvIdx++] = uCoord;
        uvs[uvIdx++] = vCoord;
      }
    }

    for (let r = 0; r < ringCount - 1; r++) {
      for (let s = 0; s < segs; s++) {
        const a = r * stride + s;
        const b = r * stride + (s + 1);
        const c = (r + 1) * stride + (s + 1);
        const d = (r + 1) * stride + s;
        indices.push(a, b, d, b, c, d);
      }
    }

    // Optional bottom and top end caps
    let extraVertexStart = ringCount * stride;
    if (capBottom) {
      const first = rings[0];
      const centerIdx = extraVertexStart++;
      positions[centerIdx * 3] = first.cx || 0;
      positions[centerIdx * 3 + 1] = first.y;
      positions[centerIdx * 3 + 2] = first.cz || 0;
      uvs[centerIdx * 2] = 0.5;
      uvs[centerIdx * 2 + 1] = 0;

      for (let s = 0; s <= segs; s++) {
        const dst = extraVertexStart + s;
        const src = s;
        positions[dst * 3] = positions[src * 3];
        positions[dst * 3 + 1] = positions[src * 3 + 1];
        positions[dst * 3 + 2] = positions[src * 3 + 2];
        uvs[dst * 2] = 0.5;
        uvs[dst * 2 + 1] = 0;
      }
      for (let s = 0; s < segs; s++) {
        indices.push(centerIdx, extraVertexStart + s + 1, extraVertexStart + s);
      }
      extraVertexStart += stride;
    }

    if (capTop) {
      const last = rings[ringCount - 1];
      const topRowStart = (ringCount - 1) * stride;
      const centerIdx = extraVertexStart++;
      positions[centerIdx * 3] = last.cx || 0;
      positions[centerIdx * 3 + 1] = last.y;
      positions[centerIdx * 3 + 2] = last.cz || 0;
      uvs[centerIdx * 2] = 0.5;
      uvs[centerIdx * 2 + 1] = 1;

      for (let s = 0; s <= segs; s++) {
        const dst = extraVertexStart + s;
        const src = topRowStart + s;
        positions[dst * 3] = positions[src * 3];
        positions[dst * 3 + 1] = positions[src * 3 + 1];
        positions[dst * 3 + 2] = positions[src * 3 + 2];
        uvs[dst * 2] = 0.5;
        uvs[dst * 2 + 1] = 1;
      }
      for (let s = 0; s < segs; s++) {
        indices.push(centerIdx, extraVertexStart + s, extraVertexStart + s + 1);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Build a smooth curved anatomical limb (arm, forearm, thigh+calf) along a CatmullRomCurve3
   * with muscle-landmark radius tapering & elliptical cross-sections (zero stiff cylinders!).
   */
  function createLoftedSplineLimb(THREE, points, radiusFn, pathSegments, radialSegments, capEnds) {
    const curve = new THREE.CatmullRomCurve3(points);
    const segs = pathSegments || 20;
    const radSegs = radialSegments || 18;
    const frames = curve.computeFrenetFrames(segs, false);
    const stride = radSegs + 1;

    const ringVerts = (segs + 1) * stride;
    const capVerts = capEnds ? 2 * (stride + 1) : 0;
    const positions = new Float32Array((ringVerts + capVerts) * 3);
    const uvs = new Float32Array((ringVerts + capVerts) * 2);
    const indices = [];

    const p = new THREE.Vector3();
    const N = new THREE.Vector3();
    const B = new THREE.Vector3();
    const tmp = new THREE.Vector3();

    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      curve.getPointAt(t, p);
      N.copy(frames.normals[i]);
      B.copy(frames.binormals[i]);
      const rad = radiusFn(t);
      const rx = typeof rad === 'number' ? rad : rad.rx;
      const rb = typeof rad === 'number' ? rad : rad.rb;

      for (let j = 0; j <= radSegs; j++) {
        const u = j / radSegs;
        const theta = u * Math.PI * 2;
        const sinT = Math.sin(theta);
        const cosT = Math.cos(theta);

        tmp.copy(p).addScaledVector(N, -cosT * rx).addScaledVector(B, sinT * rb);
        const idx = i * stride + j;
        positions[idx * 3] = tmp.x;
        positions[idx * 3 + 1] = tmp.y;
        positions[idx * 3 + 2] = tmp.z;
        uvs[idx * 2] = u;
        uvs[idx * 2 + 1] = t;
      }
    }

    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < radSegs; j++) {
        const a = i * stride + j;
        const b = (i + 1) * stride + j;
        const c = (i + 1) * stride + (j + 1);
        const d = i * stride + (j + 1);
        indices.push(a, b, d, b, c, d);
      }
    }

    if (capEnds) {
      let capBase = ringVerts;
      // Start cap
      const p0 = curve.getPointAt(0);
      const c0 = capBase++;
      positions[c0 * 3] = p0.x;
      positions[c0 * 3 + 1] = p0.y;
      positions[c0 * 3 + 2] = p0.z;
      uvs[c0 * 2] = 0.5;
      uvs[c0 * 2 + 1] = 0;
      for (let j = 0; j <= radSegs; j++) {
        const dst = capBase + j;
        positions[dst * 3] = positions[j * 3];
        positions[dst * 3 + 1] = positions[j * 3 + 1];
        positions[dst * 3 + 2] = positions[j * 3 + 2];
        uvs[dst * 2] = 0.5;
        uvs[dst * 2 + 1] = 0;
      }
      for (let j = 0; j < radSegs; j++) {
        indices.push(c0, capBase + j + 1, capBase + j);
      }
      capBase += stride;

      // End cap
      const p1 = curve.getPointAt(1);
      const c1 = capBase++;
      const lastRow = segs * stride;
      positions[c1 * 3] = p1.x;
      positions[c1 * 3 + 1] = p1.y;
      positions[c1 * 3 + 2] = p1.z;
      uvs[c1 * 2] = 0.5;
      uvs[c1 * 2 + 1] = 1;
      for (let j = 0; j <= radSegs; j++) {
        const dst = capBase + j;
        const src = lastRow + j;
        positions[dst * 3] = positions[src * 3];
        positions[dst * 3 + 1] = positions[src * 3 + 1];
        positions[dst * 3 + 2] = positions[src * 3 + 2];
        uvs[dst * 2] = 0.5;
        uvs[dst * 2 + 1] = 1;
      }
      for (let j = 0; j < radSegs; j++) {
        indices.push(c1, capBase + j, capBase + j + 1);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Build an anatomically sculpted human head + neck geometry (NO boxy blocks or bowling ball!).
   * Deforms a clean high-segment sphere into jawline, cheekbones, brow ridge, eye sockets, nose, and chin.
   */
  function createAnatomicalHeadGeometry(THREE) {
    const headSphere = new THREE.SphereGeometry(0.185, 30, 24);
    const pos = headSphere.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);

      // Elongate vertically into realistic cranial proportions
      y *= 1.12;
      z *= 1.03;

      if (y > 0.01) {
        // Upper skull / cranium: slightly narrower at temples
        x *= 0.87 - 0.04 * Math.min(1, y / 0.2);
      } else {
        // Lower face: realistic jawline taper from cheekbones down to chin
        const jawT = Math.min(1, -y / 0.21);
        const taper = 0.87 - 0.36 * jawT * jawT;
        x *= taper;

        // Slight masculine chin projection forward (-Z) and tuck under jaw (+Z)
        if (z < 0 && y < -0.05) {
          const centerMask = Math.exp(-(x * x) / 0.0045);
          const chinBulge = Math.sin(Math.min(1, (-y - 0.05) / 0.14) * Math.PI);
          z -= centerMask * chinBulge * 0.022;
        }
        // Subtle under-jaw tuck toward neck
        if (z > -0.01 && y < -0.09) {
          y += 0.018 * Math.min(1, (z + 0.01) / 0.12);
        }
      }

      // Facial anatomical landmarks on anterior (-Z) hemisphere
      if (z < -0.05) {
        // Cheekbone prominence (y ~ -0.008, |x| ~ 0.072)
        const cheekMask =
          Math.exp(-Math.pow((Math.abs(x) - 0.072) / 0.036, 2)) *
          Math.exp(-Math.pow((y + 0.006) / 0.036, 2));
        z -= cheekMask * 0.014;

        // Subtle recessed eye sockets (y ~ +0.028, |x| ~ 0.056)
        const eyeMask =
          Math.exp(-Math.pow((Math.abs(x) - 0.056) / 0.028, 2)) *
          Math.exp(-Math.pow((y - 0.028) / 0.022, 2));
        z += eyeMask * 0.016;

        // Masculine brow ridge above eye sockets (y ~ +0.062)
        const browMask =
          Math.exp(-Math.pow(x / 0.09, 2)) *
          Math.exp(-Math.pow((y - 0.062) / 0.018, 2));
        z -= browMask * 0.015;

        // Sculpted nose bridge & tip (midline x ~ 0, y = -0.032 .. +0.048)
        const noseWidthMask = Math.exp(-(x * x) / 0.00055);
        if (y > -0.04 && y < 0.055) {
          const noseProfile = Math.sin(((y + 0.04) / 0.095) * Math.PI);
          const tipBoost = Math.exp(-Math.pow((y + 0.018) / 0.018, 2)) * 0.018;
          z -= noseWidthMask * (noseProfile * 0.022 + tipBoost);
        }

        // Subtle mouth/lip plane around y = -0.066
        const lipMask =
          Math.exp(-(x * x) / 0.0014) *
          Math.exp(-Math.pow((y + 0.066) / 0.014, 2));
        z -= lipMask * 0.01;
      }

      pos.setXYZ(i, x, y, z);
    }

    headSphere.computeVertexNormals();

    // Smooth anatomical neck seamlessly rising from inside jacket collar into skull base
    const neckGeo = createAnatomicalLoft(
      THREE,
      [
        { y: -0.27, cx: 0, cz: 0.012, rx: 0.094, rz: 0.092 },
        { y: -0.21, cx: 0, cz: 0.012, rx: 0.088, rz: 0.088 },
        { y: -0.15, cx: 0, cz: 0.010, rx: 0.086, rz: 0.088 },
        { y: -0.09, cx: 0, cz: 0.008, rx: 0.092, rz: 0.094 }
      ],
      22,
      true,
      false
    );

    // Sculpted human ears merged directly into skin geometry
    const leftEar = bakeGeo(
      new THREE.SphereGeometry(0.032, 12, 12),
      -0.162,
      0.008,
      0.006,
      0,
      0.16,
      0,
      0.42,
      1.12,
      0.72
    );
    const rightEar = bakeGeo(
      new THREE.SphereGeometry(0.032, 12, 12),
      0.162,
      0.008,
      0.006,
      0,
      -0.16,
      0,
      0.42,
      1.12,
      0.72
    );

    return mergeGeometries(THREE, [headSphere, neckGeo, leftEar, rightEar]);
  }

  /**
   * Build sculpted realistic hair cap + textured styled crown + smooth tapered rear nape fade
   * plus sculpted jaw-hugging beard, mustache, and eyebrows (ZERO blocky cones, ZERO pale nape gap!).
   */
  function createSculptedHairAndBeardGeometry(THREE) {
    // 1. Hair cap with textured top crop and smooth tapered fade down sides and nape
    const hairSphere = new THREE.SphereGeometry(0.191, 30, 24);
    const hPos = hairSphere.attributes.position;
    const keepIndices = [];

    for (let i = 0; i < hPos.count; i++) {
      let x = hPos.getX(i);
      let y = hPos.getY(i);
      let z = hPos.getZ(i);

      y *= 1.13;
      z *= 1.04;
      x *= 0.895;

      // Determine hairline boundary:
      // High forehead in front (z < -0.08), wraps down temples/sideburns, and drops to nape in back (z > 0.02)
      const isCrown = y > 0.095;
      if (isCrown) {
        // Textured modern short styled hair crop (organic peaks along crown, higher in front like poster)
        const frontLift = Math.max(0, -z) * 0.16;
        const crownTexture =
          0.008 * Math.sin(x * 68 + z * 34) +
          0.006 * Math.cos(x * 42 - z * 58) +
          0.012 * Math.max(0, (y - 0.14) / 0.08);
        y += frontLift + crownTexture;
      } else if (z > 0.01) {
        // Back occiput & tapered nape fade smoothly hugging cranium down to y = -0.135
        y -= 0.01;
      }

      hPos.setXYZ(i, x, y, z);
    }

    const hIdx = hairSphere.index.array;
    for (let t = 0; t < hIdx.length; t += 3) {
      const ia = hIdx[t];
      const ib = hIdx[t + 1];
      const ic = hIdx[t + 2];
      const cy = (hPos.getY(ia) + hPos.getY(ib) + hPos.getY(ic)) / 3;
      const cz = (hPos.getZ(ia) + hPos.getZ(ib) + hPos.getZ(ic)) / 3;
      const cx = (hPos.getX(ia) + hPos.getX(ib) + hPos.getX(ic)) / 3;

      // Clean anatomical hairline cutoff:
      // Front hairline above forehead (y > 0.085), temples/sideburns near ears (|x| > 0.12 && y > -0.02),
      // Back of head & nape fade smoothly down to y = -0.145 for z > 0.01
      const inBackHair = cz > 0.01 && cy > -0.145;
      const inTopHair = cy > 0.088 && cz > -0.175;
      const inSideFade = Math.abs(cx) > 0.115 && cz > -0.06 && cy > -0.03;

      if (inBackHair || inTopHair || inSideFade) {
        keepIndices.push(ia, ib, ic);
      }
    }

    const hairGeo = new THREE.BufferGeometry();
    hairGeo.setAttribute('position', hPos);
    hairGeo.setAttribute('uv', hairSphere.attributes.uv);
    hairGeo.setIndex(keepIndices);
    hairGeo.computeVertexNormals();

    // Smooth tapered rear nape transition hugging neck down into collar (zero gap from chase cam!)
    const napeGeo = createAnatomicalLoft(
      THREE,
      [
        { y: -0.22, cx: 0, cz: 0.022, rx: 0.086, rz: 0.082 },
        { y: -0.15, cx: 0, cz: 0.024, rx: 0.088, rz: 0.084 },
        { y: -0.09, cx: 0, cz: 0.026, rx: 0.090, rz: 0.086 }
      ],
      18,
      false,
      false
    );

    // 2. Sculpted jaw-hugging short dark beard & goatee (matches anatomical jaw mesh!)
    const beardSphere = new THREE.SphereGeometry(0.189, 28, 22);
    const bPos = beardSphere.attributes.position;
    for (let i = 0; i < bPos.count; i++) {
      let x = bPos.getX(i);
      let y = bPos.getY(i);
      let z = bPos.getZ(i);

      y *= 1.12;
      z *= 1.035;
      const jawT = Math.min(1, Math.max(0, -y / 0.21));
      x *= 0.88 - 0.35 * jawT * jawT;
      if (z < 0 && y < -0.05) {
        const centerMask = Math.exp(-(x * x) / 0.0045);
        const chinBulge = Math.sin(Math.min(1, (-y - 0.05) / 0.14) * Math.PI);
        z -= centerMask * chinBulge * 0.027;
      }
      bPos.setXYZ(i, x, y, z);
    }

    const bIdx = beardSphere.index.array;
    const beardKeep = [];
    for (let t = 0; t < bIdx.length; t += 3) {
      const ia = bIdx[t];
      const ib = bIdx[t + 1];
      const ic = bIdx[t + 2];
      const cy = (bPos.getY(ia) + bPos.getY(ib) + bPos.getY(ic)) / 3;
      const cz = (bPos.getZ(ia) + bPos.getZ(ib) + bPos.getZ(ic)) / 3;
      const cx = (bPos.getX(ia) + bPos.getX(ib) + bPos.getX(ic)) / 3;

      // Jawline & chin beard (front & lower jaw, clipped cleanly off cheeks and rear neck)
      const isChinGoatee = cz < -0.02 && cy < -0.068 && cy > -0.21;
      const isJawline = cz < 0.01 && cz > -0.14 && cy < -0.025 && cy > -0.175 && Math.abs(cx) > 0.055;
      // Leave small natural skin patch below lower lip corners
      const mouthGap = Math.abs(cx) < 0.048 && cy > -0.088 && cy < -0.048;

      if ((isChinGoatee || isJawline) && !mouthGap) {
        beardKeep.push(ia, ib, ic);
      }
    }

    const beardGeo = new THREE.BufferGeometry();
    beardGeo.setAttribute('position', bPos);
    beardGeo.setAttribute('uv', beardSphere.attributes.uv);
    beardGeo.setIndex(beardKeep);
    beardGeo.computeVertexNormals();

    // 3. Sculpted Mustache & Arched Eyebrows (curved spline tubes, zero boxes!)
    const mustacheGeo = createLoftedSplineLimb(
      THREE,
      [
        new THREE.Vector3(-0.058, -0.07, -0.158),
        new THREE.Vector3(-0.025, -0.052, -0.184),
        new THREE.Vector3(0, -0.049, -0.188),
        new THREE.Vector3(0.025, -0.052, -0.184),
        new THREE.Vector3(0.058, -0.07, -0.158)
      ],
      (t) => 0.011 + 0.005 * Math.sin(t * Math.PI),
      12,
      8,
      true
    );

    const browLeft = createLoftedSplineLimb(
      THREE,
      [
        new THREE.Vector3(-0.088, 0.055, -0.156),
        new THREE.Vector3(-0.056, 0.065, -0.176),
        new THREE.Vector3(-0.026, 0.058, -0.182)
      ],
      (t) => 0.007 + 0.003 * Math.sin(t * Math.PI),
      6,
      6,
      true
    );

    const browRight = createLoftedSplineLimb(
      THREE,
      [
        new THREE.Vector3(0.026, 0.058, -0.182),
        new THREE.Vector3(0.056, 0.065, -0.176),
        new THREE.Vector3(0.088, 0.055, -0.156)
      ],
      (t) => 0.007 + 0.003 * Math.sin(t * Math.PI),
      6,
      6,
      true
    );

    return mergeGeometries(THREE, [hairGeo, napeGeo, beardGeo, mustacheGeo, browLeft, browRight]);
  }

  /**
   * Build sculpted sleek black rectangular eyeglasses (NO BoxGeometry!).
   */
  function createGlassesGeometry(THREE) {
    const parts = [];

    [-0.062, 0.062].forEach((gx) => {
      const outer = new THREE.Shape();
      const w = 0.044;
      const h = 0.028;
      const r = 0.007;
      outer.moveTo(-w + r, -h);
      outer.lineTo(w - r, -h);
      outer.quadraticCurveTo(w, -h, w, -h + r);
      outer.lineTo(w, h - r);
      outer.quadraticCurveTo(w, h, w - r, h);
      outer.lineTo(-w + r, h);
      outer.quadraticCurveTo(-w, h, -w, h - r);
      outer.lineTo(-w, -h + r);
      outer.quadraticCurveTo(-w, -h, -w + r, -h);

      const hole = new THREE.Path();
      const iw = 0.036;
      const ih = 0.02;
      const ir = 0.005;
      hole.moveTo(-iw + ir, -ih);
      hole.lineTo(iw - ir, -ih);
      hole.quadraticCurveTo(iw, -ih, iw, -ih + ir);
      hole.lineTo(iw, ih - ir);
      hole.quadraticCurveTo(iw, ih, iw - ir, ih);
      hole.lineTo(-iw + ir, ih);
      hole.quadraticCurveTo(-iw, ih, -iw, ih - ir);
      hole.lineTo(-iw, -ih + ir);
      hole.quadraticCurveTo(-iw, -ih, -iw + ir, -ih);
      outer.holes.push(hole);

      const rimGeo = new THREE.ExtrudeGeometry(outer, {
        depth: 0.012,
        bevelEnabled: true,
        bevelThickness: 0.002,
        bevelSize: 0.002,
        bevelSegments: 1,
        curveSegments: 4
      });
      bakeGeo(rimGeo, gx, 0.028, -0.184);
      parts.push(rimGeo);
    });

    // Nose bridge & curved side temple arms
    parts.push(
      createLoftedSplineLimb(
        THREE,
        [
          new THREE.Vector3(-0.022, 0.038, -0.178),
          new THREE.Vector3(0, 0.042, -0.182),
          new THREE.Vector3(0.022, 0.038, -0.178)
        ],
        () => 0.0055,
        4,
        6,
        true
      )
    );

    [-1, 1].forEach((side) => {
      parts.push(
        createLoftedSplineLimb(
          THREE,
          [
            new THREE.Vector3(side * 0.104, 0.042, -0.176),
            new THREE.Vector3(side * 0.148, 0.04, -0.09),
            new THREE.Vector3(side * 0.156, 0.026, 0.01)
          ],
          () => 0.0055,
          6,
          6,
          true
        )
      );
    });

    return mergeGeometries(THREE, parts);
  }

  /**
   * Build sculpted beveled automotive body geometry using a 2D side silhouette ExtrudeGeometry,
   * oriented along -Z (front) to +Z (rear) with un-mirrored door UVs on both left & right sides!
   */
  function createExtrudedCarBody(THREE, isSwat) {
    const shape = new THREE.Shape();

    if (!isSwat) {
      // Sleek GTA 6 Fastback Interceptor / Sports Sedan Silhouette
      shape.moveTo(-2.22, 0.24);
      shape.lineTo(-2.25, 0.44);
      shape.lineTo(-2.20, 0.68);
      shape.quadraticCurveTo(-2.14, 0.77, -1.96, 0.80);
      shape.lineTo(-0.92, 0.90);
      shape.lineTo(-0.34, 1.38);
      shape.quadraticCurveTo(-0.14, 1.44, 0.18, 1.43);
      shape.quadraticCurveTo(0.46, 1.41, 0.68, 1.32);
      shape.lineTo(1.34, 0.96);
      shape.lineTo(2.08, 0.95);
      shape.lineTo(2.21, 1.00); // Subtle rear lip spoiler
      shape.lineTo(2.25, 0.86);
      shape.lineTo(2.24, 0.56);
      shape.lineTo(2.16, 0.25);

      // Rear wheel well arch centered at z = +1.38, y = 0.37, r = 0.47 (clears 0.37 tire after bevel)
      shape.lineTo(1.85, 0.25);
      shape.absarc(1.38, 0.37, 0.47, -0.26, Math.PI + 0.26, false);
      shape.lineTo(0.91, 0.23);

      // Rocker sill
      shape.lineTo(-0.91, 0.23);

      // Front wheel well arch centered at z = -1.38, y = 0.37, r = 0.47
      shape.absarc(-1.38, 0.37, 0.47, -0.26, Math.PI + 0.26, false);
      shape.lineTo(-1.85, 0.24);
      shape.closePath();
    } else {
      // Armored Tactical SWAT BearCat Silhouette
      shape.moveTo(-2.72, 0.36);
      shape.lineTo(-2.76, 0.84);
      shape.lineTo(-2.62, 1.18);
      shape.lineTo(-1.58, 1.28);
      shape.lineTo(-1.14, 2.02);
      shape.lineTo(-0.78, 2.12);
      shape.lineTo(2.42, 2.12);
      shape.lineTo(2.62, 1.92);
      shape.lineTo(2.66, 0.42);

      shape.lineTo(2.21, 0.40);
      shape.absarc(1.65, 0.46, 0.56, -0.14, Math.PI + 0.14, false);
      shape.lineTo(1.09, 0.36);
      shape.lineTo(-1.29, 0.36);
      shape.absarc(-1.85, 0.46, 0.56, -0.14, Math.PI + 0.14, false);
      shape.lineTo(-2.41, 0.36);
      shape.closePath();
    }

    const halfWidth = isSwat ? 1.06 : 0.90;
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: halfWidth * 2,
      bevelEnabled: true,
      bevelThickness: isSwat ? 0.08 : 0.09,
      bevelSize: isSwat ? 0.05 : 0.055,
      bevelSegments: 2,
      curveSegments: 8
    });

    geo.translate(0, 0, -halfWidth);
    geo.rotateY(-Math.PI / 2);

    // Remap side-face UVs (group 0) so decals & windows align cleanly and read un-mirrored on both sides
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const minZ = isSwat ? -2.82 : -2.31;
    const maxZ = isSwat ? 2.72 : 2.31;
    const spanZ = maxZ - minZ;
    const minY = isSwat ? 0.31 : 0.18;
    const maxY = isSwat ? 2.18 : 1.49;
    const spanY = maxY - minY;

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      // Right side (+X): rear=+Z is left of viewer, front=-Z is right
      // Left side (-X): front=-Z is left of viewer, rear=+Z is right
      const u = vx >= 0 ? (maxZ - vz) / spanZ : (vz - minZ) / spanZ;
      const v = (vy - minY) / spanY;
      uv.setXY(i, Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, v)));
    }
    uv.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Build sculpted Maverick Police Helicopter fuselage side extrusion.
   * Nose points toward +Z, tail boom extends toward -Z (matching renderer.js!).
   */
  function createHeliFuselageGeometry(THREE) {
    const shape = new THREE.Shape();
    // Side profile in (px -> z, py -> y)
    shape.moveTo(2.42, -0.18);
    shape.quadraticCurveTo(2.58, 0.06, 2.08, 0.36);
    shape.quadraticCurveTo(1.22, 0.72, 0.45, 0.88);
    shape.lineTo(-0.78, 0.86);
    shape.quadraticCurveTo(-1.18, 0.62, -1.55, 0.36);
    shape.lineTo(-4.72, 0.24);
    shape.lineTo(-5.12, 1.18); // Swept vertical tail fin
    shape.lineTo(-4.76, 1.24);
    shape.lineTo(-4.26, 0.38);
    shape.lineTo(-1.46, 0.04);
    shape.quadraticCurveTo(-0.98, -0.52, -0.35, -0.68);
    shape.lineTo(1.18, -0.68);
    shape.quadraticCurveTo(2.12, -0.60, 2.42, -0.18);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 1.12,
      bevelEnabled: true,
      bevelThickness: 0.24,
      bevelSize: 0.14,
      bevelSegments: 3,
      curveSegments: 10
    });
    geo.translate(0, 0, -0.56);
    geo.rotateY(-Math.PI / 2);

    // Taper tail boom width smoothly for z < -1.1 so fuselage looks sleek & aerodynamic
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (z < -1.0) {
        const t = Math.min(1, (-z - 1.0) / 3.8);
        x *= 1.0 - 0.82 * t;
      } else if (z > 1.35) {
        const t = Math.min(1, (z - 1.35) / 1.25);
        x *= 1.0 - 0.32 * t * t;
      }
      pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // ---------------------------------------------------------------------------
  // MAIN GT6MODELS MODULE
  // ---------------------------------------------------------------------------

  const GT6Models = {
    _textures: null,
    _sharedCache: new WeakMap(),

    /**
     * Get or create shared vehicle/wheel material cache per envMap to cut GPU shader compiles.
     */
    _getSharedMats(THREE, envMap) {
      const key = envMap || THREE;
      let cache = this._sharedCache.get(key);
      if (cache) return cache;

      const textures = this.getTextures();
      cache = {
        envMap,
        tire: createStdMat(
          THREE,
          {
            color: 0xffffff,
            map: textures.tireTread || null,
            roughness: 0.66,
            metalness: 0.08
          },
          envMap
        ),
        policeRim: createStdMat(
          THREE,
          {
            color: 0x1e232d,
            metalness: 0.84,
            roughness: 0.22
          },
          envMap
        ),
        trafficRim: createStdMat(
          THREE,
          {
            color: 0xcbd5e1,
            metalness: 0.88,
            roughness: 0.18
          },
          envMap
        ),
        chrome: createStdMat(
          THREE,
          {
            color: 0xe2e8f0,
            metalness: 0.94,
            roughness: 0.1,
            envMapIntensity: 1.65
          },
          envMap
        ),
        blackPaint: createStdMat(
          THREE,
          {
            color: 0x090b10,
            metalness: 0.68,
            roughness: 0.16,
            envMapIntensity: 1.5
          },
          envMap
        ),
        swatBlack: createStdMat(
          THREE,
          {
            color: 0x0c0e14,
            metalness: 0.58,
            roughness: 0.32,
            envMapIntensity: 1.25
          },
          envMap
        ),
        policeDoor: createStdMat(
          THREE,
          {
            color: 0xffffff,
            map: textures.policeDoor || null,
            metalness: 0.45,
            roughness: 0.18,
            envMapIntensity: 1.4
          },
          envMap
        ),
        swatDoor: createStdMat(
          THREE,
          {
            color: 0xffffff,
            map: textures.swatDoor || null,
            metalness: 0.45,
            roughness: 0.28,
            envMapIntensity: 1.2
          },
          envMap
        ),
        darkGlass: createStdMat(
          THREE,
          {
            color: 0x0a1220,
            metalness: 0.94,
            roughness: 0.06,
            envMapIntensity: 1.8
          },
          envMap
        ),
        steel: createStdMat(
          THREE,
          {
            color: 0x222834,
            metalness: 0.82,
            roughness: 0.24
          },
          envMap
        ),
        headlightEmissive: new THREE.MeshBasicMaterial({ color: 0xf8fafc }),
        amberEmissive: new THREE.MeshBasicMaterial({ color: 0xff9900 }),
        tailEmissive: new THREE.MeshBasicMaterial({ color: 0xff141e }),
        whiteGlowSprite: textures.softGlow
          ? new THREE.SpriteMaterial({
              map: textures.softGlow,
              color: 0xeef6ff,
              transparent: true,
              opacity: 0.55,
              blending: THREE.AdditiveBlending,
              depthWrite: false
            })
          : null,
        redGlowSprite: textures.softGlow
          ? new THREE.SpriteMaterial({
              map: textures.softGlow,
              color: 0xff1722,
              transparent: true,
              opacity: 0.32,
              blending: THREE.AdditiveBlending,
              depthWrite: false
            })
          : null,
        blueGlowSprite: textures.softGlow
          ? new THREE.SpriteMaterial({
              map: textures.softGlow,
              color: 0x0088ff,
              transparent: true,
              opacity: 0.32,
              blending: THREE.AdditiveBlending,
              depthWrite: false
            })
          : null
      };

      this._sharedCache.set(key, cache);
      return cache;
    },

    /**
     * Build and cache high-resolution procedural canvas textures for all 3D models.
     */
    getTextures() {
      if (this._textures) return this._textures;
      const THREE = typeof window !== 'undefined' ? window.THREE : null;
      if (!THREE || typeof document === 'undefined') {
        return {};
      }

      const textures = {};

      const finalizeTex = (canvas, repeatX = 1, repeatY = 1) => {
        const tex = new THREE.CanvasTexture(canvas);
        if (repeatX > 1 || repeatY > 1) {
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          tex.repeat.set(repeatX, repeatY);
        }
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        return tex;
      };

      // 0. Lightweight Radial Additive Glow Sprite Texture (128x128)
      const glowCanvas = document.createElement('canvas');
      glowCanvas.width = 128;
      glowCanvas.height = 128;
      const gctx = glowCanvas.getContext('2d');
      if (gctx) {
        const grad = gctx.createRadialGradient(64, 64, 2, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255,255,255,1.0)');
        grad.addColorStop(0.25, 'rgba(255,255,255,0.65)');
        grad.addColorStop(0.6, 'rgba(255,255,255,0.18)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        gctx.fillStyle = grad;
        gctx.fillRect(0, 0, 128, 128);
      }
      textures.softGlow = finalizeTex(glowCanvas);

      // 1. Realistic Black Rubber Fat-Tire Tread Map (256x256)
      const treadCanvas = document.createElement('canvas');
      treadCanvas.width = 256;
      treadCanvas.height = 256;
      const tctx = treadCanvas.getContext('2d');
      if (tctx) {
        tctx.fillStyle = '#141619';
        tctx.fillRect(0, 0, 256, 256);

        tctx.fillStyle = '#090a0c';
        tctx.fillRect(76, 0, 8, 256);
        tctx.fillRect(124, 0, 8, 256);
        tctx.fillRect(172, 0, 8, 256);

        for (let y = -16; y < 272; y += 16) {
          tctx.strokeStyle = '#1f2329';
          tctx.lineWidth = 7;
          tctx.lineCap = 'round';
          tctx.beginPath();
          tctx.moveTo(26, y + 10);
          tctx.lineTo(128, y);
          tctx.lineTo(230, y + 10);
          tctx.stroke();

          tctx.strokeStyle = '#08090b';
          tctx.lineWidth = 3;
          tctx.beginPath();
          tctx.moveTo(26, y + 15);
          tctx.lineTo(128, y + 5);
          tctx.lineTo(230, y + 15);
          tctx.stroke();
        }
      }
      textures.tireTread = finalizeTex(treadCanvas, 1, 3);
      textures.tireBump = textures.tireTread;

      // 2. Silver Cross-Drilled Metallic Brake Disc Texture (256x256)
      const discCanvas = document.createElement('canvas');
      discCanvas.width = 256;
      discCanvas.height = 256;
      const dctx = discCanvas.getContext('2d');
      if (dctx) {
        dctx.clearRect(0, 0, 256, 256);
        const cx = 128;
        const cy = 128;

        dctx.fillStyle = '#d8e0ea';
        dctx.beginPath();
        dctx.arc(cx, cy, 120, 0, Math.PI * 2);
        dctx.fill();

        for (let r = 68; r < 118; r += 4) {
          dctx.strokeStyle = r % 8 === 0 ? '#9aa6b5' : '#e2e8f0';
          dctx.lineWidth = 1.5;
          dctx.beginPath();
          dctx.arc(cx, cy, r, 0, Math.PI * 2);
          dctx.stroke();
        }

        dctx.fillStyle = '#15181f';
        dctx.beginPath();
        dctx.arc(cx, cy, 65, 0, Math.PI * 2);
        dctx.fill();

        dctx.fillStyle = '#090a0e';
        for (let i = 0; i < 18; i++) {
          const baseAngle = (i * Math.PI * 2) / 18;
          [78, 94, 108].forEach((radius, idx) => {
            const a = baseAngle + idx * 0.07;
            dctx.beginPath();
            dctx.arc(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, 3.5, 0, Math.PI * 2);
            dctx.fill();
          });
        }
      }
      textures.discBrake = finalizeTex(discCanvas);

      // 3. Front Red Fender with White Lightning Bolt Decal (256x256)
      const fenderCanvas = document.createElement('canvas');
      fenderCanvas.width = 256;
      fenderCanvas.height = 256;
      const fctx = fenderCanvas.getContext('2d');
      if (fctx) {
        fctx.fillStyle = '#c4121a';
        fctx.fillRect(0, 0, 256, 256);
        fctx.fillStyle = '#f8fafc';
        fctx.fillRect(15, 0, 5, 256);
        fctx.fillRect(236, 0, 5, 256);
        fctx.beginPath();
        fctx.moveTo(137, 19);
        fctx.lineTo(89, 120);
        fctx.lineTo(126, 120);
        fctx.lineTo(102, 236);
        fctx.lineTo(169, 112);
        fctx.lineTo(129, 112);
        fctx.closePath();
        fctx.fill();
      }
      textures.fenderLightning = finalizeTex(fenderCanvas);

      // 4. Rear Red Fender with White Side Trim (256x256)
      const rearFenderCanvas = document.createElement('canvas');
      rearFenderCanvas.width = 256;
      rearFenderCanvas.height = 256;
      const rfctx = rearFenderCanvas.getContext('2d');
      if (rfctx) {
        rfctx.fillStyle = '#c4121a';
        rfctx.fillRect(0, 0, 256, 256);
        rfctx.fillStyle = '#f8fafc';
        rfctx.fillRect(13, 18, 6, 220);
        rfctx.fillRect(237, 18, 6, 220);
      }
      textures.rearFenderStripe = finalizeTex(rearFenderCanvas);

      // 5. Glossy Black Under-Seat "EDTECH" Battery Box Texture (512x512)
      const batCanvas = document.createElement('canvas');
      batCanvas.width = 512;
      batCanvas.height = 512;
      const bctx = batCanvas.getContext('2d');
      if (bctx) {
        bctx.fillStyle = '#0b0d12';
        bctx.fillRect(0, 0, 512, 512);
        bctx.strokeStyle = '#1f2430';
        bctx.lineWidth = 10;
        strokeRoundRect(bctx, 18, 18, 476, 476, 28);
        bctx.fillStyle = '#c4121a';
        fillRoundRect(bctx, 24, 24, 464, 42, 12);
        drawEdtechGearLogo(bctx, 256, 268, 112, '#0b0d12', false);
      }
      textures.edtechBattery = finalizeTex(batCanvas);

      // 6. Digital Handlebar Speedometer LCD Screen (256x128)
      const dashCanvas = document.createElement('canvas');
      dashCanvas.width = 256;
      dashCanvas.height = 128;
      const dshCtx = dashCanvas.getContext('2d');
      if (dshCtx) {
        dshCtx.fillStyle = '#070a10';
        dshCtx.fillRect(0, 0, 256, 128);
        dshCtx.strokeStyle = '#262d3d';
        dshCtx.lineWidth = 5;
        strokeRoundRect(dshCtx, 4, 4, 248, 120, 12);
        dshCtx.fillStyle = '#e2e8f0';
        dshCtx.font = '900 38px "Arial Black", Impact, sans-serif';
        dshCtx.textAlign = 'center';
        dshCtx.textBaseline = 'middle';
        dshCtx.fillText('188', 128, 55);
        dshCtx.fillStyle = '#60a5fa';
        dshCtx.font = 'bold 14px Arial, sans-serif';
        dshCtx.fillText('KM/H • EDTECH PT-13', 128, 94);
      }
      textures.digitalDash = finalizeTex(dashCanvas);

      // 7. Rafa's Unified Anatomical Leather Jacket Atlas (1024x512: Left Half=FRONT, Right Half=BACK)
      // Plus backwards-compatible jacketFront & jacketBack textures (512x512 each)
      const paintLeatherBase = (ctx, w, h) => {
        ctx.fillStyle = '#12141a';
        ctx.fillRect(0, 0, w, h);

        // Subtle leather grain speckles & natural fold shading
        for (let i = 0; i < (w * h) / 140; i++) {
          const lx = (i * 73) % w;
          const ly = (i * 139) % h;
          ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.028)' : 'rgba(0,0,0,0.22)';
          ctx.fillRect(lx, ly, 2, 2);
        }

        // Subtle shoulder-to-waist vertical fold highlights
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(255,255,255,0.05)');
        grad.addColorStop(0.45, 'rgba(0,0,0,0.0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.28)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      };

      const drawJacketFrontRegion = (ctx, ox) => {
        // Subtle front leather folds & contoured chest panel seams
        ctx.strokeStyle = '#1f242f';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(ox + 95, 110);
        ctx.quadraticCurveTo(ox + 120, 290, ox + 135, 480);
        ctx.moveTo(ox + 417, 110);
        ctx.quadraticCurveTo(ox + 392, 290, ox + 377, 480);
        ctx.stroke();

        // Red contrast shoulder/chest piping (matching poster & 0:00-0:03)
        ctx.strokeStyle = '#b91c24';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(ox + 18, 108);
        ctx.quadraticCurveTo(ox + 256, 126, ox + 494, 108);
        ctx.stroke();

        // Folded leather collar lapels flanking the zipper
        ctx.fillStyle = '#181b23';
        ctx.beginPath();
        ctx.moveTo(ox + 216, 40);
        ctx.lineTo(ox + 252, 118);
        ctx.lineTo(ox + 252, 40);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(ox + 296, 40);
        ctx.lineTo(ox + 260, 118);
        ctx.lineTo(ox + 260, 40);
        ctx.closePath();
        ctx.fill();

        // Metallic center zipper track
        ctx.fillStyle = '#252a35';
        ctx.fillRect(ox + 249, 44, 14, 446);
        ctx.fillStyle = '#94a3b8';
        for (let zy = 52; zy < 484; zy += 10) {
          ctx.fillRect(ox + 252, zy, 8, 5);
        }

        // Chest pockets & red snap trim
        ctx.strokeStyle = '#1f232d';
        ctx.lineWidth = 3;
        strokeRoundRect(ctx, ox + 92, 232, 130, 116, 8);
        strokeRoundRect(ctx, ox + 290, 232, 130, 116, 8);
        ctx.strokeStyle = '#991b1b';
        strokeRoundRect(ctx, ox + 92, 228, 130, 32, 5);
        strokeRoundRect(ctx, ox + 290, 228, 130, 32, 5);

        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.arc(ox + 157, 246, 5.5, 0, Math.PI * 2);
        ctx.arc(ox + 355, 246, 5.5, 0, Math.PI * 2);
        ctx.fill();

        // RIGHT CHEST (viewer left): Red "PT 13" Patch
        ctx.fillStyle = '#c4121a';
        fillRoundRect(ctx, ox + 96, 144, 122, 52, 7);
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 2.5;
        strokeRoundRect(ctx, ox + 100, 148, 114, 44, 5);
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 32px "Arial Black", Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PT 13', ox + 157, 171);

        // LEFT CHEST (viewer right): White 8-Tooth Gear + "EDTECH" Logo
        drawEdtechGearLogo(ctx, ox + 355, 168, 36, '#12141a', false);

        // Waist belt & silver buckle
        ctx.fillStyle = '#090a0f';
        ctx.fillRect(ox + 16, 444, 480, 44);
        ctx.fillStyle = '#94a3b8';
        strokeRoundRect(ctx, ox + 236, 448, 40, 34, 4);
      };

      const drawJacketBackRegion = (ctx, ox) => {
        // Upper back shoulder yoke & natural fabric creases
        ctx.strokeStyle = '#212633';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(ox + 24, 78);
        ctx.quadraticCurveTo(ox + 256, 98, ox + 488, 78);
        ctx.stroke();

        // Subtle red stitching along yoke
        ctx.strokeStyle = '#8b151b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ox + 24, 83);
        ctx.quadraticCurveTo(ox + 256, 103, ox + 488, 83);
        ctx.stroke();

        // Side waist taper seams & subtle spine fold shading
        ctx.strokeStyle = '#1b1f29';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ox + 96, 86);
        ctx.quadraticCurveTo(ox + 124, 270, ox + 132, 444);
        ctx.moveTo(ox + 416, 86);
        ctx.quadraticCurveTo(ox + 388, 270, ox + 380, 444);
        ctx.stroke();

        // Subtle diagonal riding-crease shadows across lower back
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(ox + 165, 360);
        ctx.quadraticCurveTo(ox + 256, 376, ox + 347, 360);
        ctx.moveTo(ox + 150, 405);
        ctx.quadraticCurveTo(ox + 256, 422, ox + 362, 405);
        ctx.stroke();

        // Upper Back: Crisp White "PT 13" over "EDTECH" placed high between shoulder blades above backrest!
        ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
        ctx.shadowBlur = 7;
        ctx.shadowOffsetY = 2;

        ctx.fillStyle = '#f8fafc';
        ctx.font = '900 84px "Arial Black", Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PT 13', ox + 256, 134);

        ctx.font = '900 48px "Arial Black", Impact, sans-serif';
        ctx.fillStyle = '#f1f5f9';
        ctx.fillText('EDTECH', ox + 256, 202);
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        drawEdtechGearLogo(ctx, ox + 256, 282, 36, '#12141a', false);

        // Rear leather belt hem
        ctx.fillStyle = '#090a0f';
        ctx.fillRect(ox + 16, 444, 480, 44);
      };

      const atlasCanvas = document.createElement('canvas');
      atlasCanvas.width = 1024;
      atlasCanvas.height = 512;
      const actx = atlasCanvas.getContext('2d');
      if (actx) {
        paintLeatherBase(actx, 1024, 512);
        drawJacketFrontRegion(actx, 0);
        drawJacketBackRegion(actx, 512);
      }
      textures.jacketAtlas = finalizeTex(atlasCanvas);

      const jacketFrontCanvas = document.createElement('canvas');
      jacketFrontCanvas.width = 512;
      jacketFrontCanvas.height = 512;
      const jfctx = jacketFrontCanvas.getContext('2d');
      if (jfctx) {
        paintLeatherBase(jfctx, 512, 512);
        drawJacketFrontRegion(jfctx, 0);
      }
      textures.jacketFront = finalizeTex(jacketFrontCanvas);

      const jacketBackCanvas = document.createElement('canvas');
      jacketBackCanvas.width = 512;
      jacketBackCanvas.height = 512;
      const jbctx = jacketBackCanvas.getContext('2d');
      if (jbctx) {
        paintLeatherBase(jbctx, 512, 512);
        drawJacketBackRegion(jbctx, 0);
      }
      textures.jacketBack = finalizeTex(jacketBackCanvas);

      // 8. Round Multi-LED Halo Headlight Reflector Face (256x256)
      const hlCanvas = document.createElement('canvas');
      hlCanvas.width = 256;
      hlCanvas.height = 256;
      const hctx = hlCanvas.getContext('2d');
      if (hctx) {
        hctx.fillStyle = '#090b10';
        hctx.fillRect(0, 0, 256, 256);
        const cx = 128;
        const cy = 128;

        const bowlGrad = hctx.createRadialGradient(cx, cy, 10, cx, cy, 120);
        bowlGrad.addColorStop(0, '#1e2430');
        bowlGrad.addColorStop(0.75, '#0d1017');
        bowlGrad.addColorStop(1, '#050608');
        hctx.fillStyle = bowlGrad;
        hctx.beginPath();
        hctx.arc(cx, cy, 120, 0, Math.PI * 2);
        hctx.fill();

        hctx.strokeStyle = '#f8fafc';
        hctx.lineWidth = 13;
        hctx.beginPath();
        hctx.arc(cx, cy, 104, 0, Math.PI * 2);
        hctx.stroke();

        hctx.fillStyle = '#94a3b8';
        fillRoundRect(hctx, 44, 76, 168, 41, 20);
        fillRoundRect(hctx, 52, 139, 152, 39, 19);
        hctx.fillStyle = '#0f131a';
        fillRoundRect(hctx, 48, 79, 160, 35, 17);
        fillRoundRect(hctx, 56, 142, 144, 33, 16);

        [71, 109, 147, 185].forEach((lx) => {
          const g = hctx.createRadialGradient(lx, 96, 2, lx, 96, 15);
          g.addColorStop(0, '#ffffff');
          g.addColorStop(0.6, '#fffbeb');
          g.addColorStop(1, 'rgba(224, 242, 254, 0)');
          hctx.fillStyle = g;
          hctx.beginPath();
          hctx.arc(lx, 96, 15, 0, Math.PI * 2);
          hctx.fill();
        });
        [84, 128, 172].forEach((lx) => {
          const g = hctx.createRadialGradient(lx, 158, 2, lx, 158, 14);
          g.addColorStop(0, '#ffffff');
          g.addColorStop(0.6, '#e0f2fe');
          g.addColorStop(1, 'rgba(224, 242, 254, 0)');
          hctx.fillStyle = g;
          hctx.beginPath();
          hctx.arc(lx, 158, 14, 0, Math.PI * 2);
          hctx.fill();
        });
      }
      textures.headlightFace = finalizeTex(hlCanvas);

      // 9. Police Interceptor Side Livery Mapped to Extruded Fastback Profile (512x256)
      // v=0..1 maps y=0.18..1.49 (y=0.88..1.38 is side windows -> canvas y=22..118)
      // u=0..1 maps z=-2.31..+2.31 (symmetric white doors in center x=142..370!)
      const policeCanvas = document.createElement('canvas');
      policeCanvas.width = 512;
      policeCanvas.height = 256;
      const pctx = policeCanvas.getContext('2d');
      if (pctx) {
        // Glossy black base (front fender, hood, rear quarter, pillars, roof)
        pctx.fillStyle = '#090b10';
        pctx.fillRect(0, 0, 512, 256);

        // Crisp white front & rear doors across symmetric middle
        pctx.fillStyle = '#f8fafc';
        pctx.fillRect(142, 114, 228, 124);

        // Dark tinted side window band along upper greenhouse
        pctx.fillStyle = '#0c1524';
        fillRoundRect(pctx, 134, 26, 244, 82, 16);

        // Glossy black B-pillar & door divider seam
        pctx.fillStyle = '#090b10';
        pctx.fillRect(248, 20, 16, 94);
        pctx.strokeStyle = '#cbd5e1';
        pctx.lineWidth = 2.5;
        pctx.beginPath();
        pctx.moveTo(256, 116);
        pctx.lineTo(256, 236);
        pctx.stroke();

        // Subtle chrome door handles
        pctx.fillStyle = '#64748b';
        fillRoundRect(pctx, 218, 130, 22, 6, 3);
        fillRoundRect(pctx, 324, 130, 22, 6, 3);

        // Gold VCPD Police Shield Emblem on doors
        pctx.fillStyle = '#eab308';
        pctx.beginPath();
        pctx.arc(166, 146, 14, 0, Math.PI * 2);
        pctx.fill();

        // Bold Black "POLICE" lettering across white doors
        pctx.fillStyle = '#090b10';
        pctx.font = '900 54px "Arial Black", Impact, sans-serif';
        pctx.textAlign = 'center';
        pctx.textBaseline = 'middle';
        pctx.fillText('POLICE', 256, 168);

        pctx.fillStyle = '#1e293b';
        pctx.font = 'bold 14px Arial, sans-serif';
        pctx.fillText('VCPD INTERCEPTOR • 911', 256, 208);
      }
      textures.policeDoor = finalizeTex(policeCanvas);

      // 10. SWAT Tactical BearCat Side Livery (512x256)
      const swatCanvas = document.createElement('canvas');
      swatCanvas.width = 512;
      swatCanvas.height = 256;
      const sctx = swatCanvas.getContext('2d');
      if (sctx) {
        sctx.fillStyle = '#0c0e14';
        sctx.fillRect(0, 0, 512, 256);

        // Armored side viewports
        sctx.fillStyle = '#0b1422';
        fillRoundRect(sctx, 152, 28, 72, 66, 8);
        fillRoundRect(sctx, 260, 42, 46, 36, 5);
        fillRoundRect(sctx, 332, 42, 46, 36, 5);

        sctx.fillStyle = '#f1f5f9';
        sctx.font = '900 64px "Arial Black", Impact, sans-serif';
        sctx.textAlign = 'center';
        sctx.textBaseline = 'middle';
        sctx.fillText('POLICE', 256, 142);

        sctx.fillStyle = '#94a3b8';
        sctx.font = 'bold 20px Arial, sans-serif';
        sctx.fillText('S.W.A.T. TACTICAL UNIT', 256, 192);
      }
      textures.swatDoor = finalizeTex(swatCanvas);

      // 11. Helicopter Motion-Blur Rotor Disc (256x256)
      const rotorCanvas = document.createElement('canvas');
      rotorCanvas.width = 256;
      rotorCanvas.height = 256;
      const rctx = rotorCanvas.getContext('2d');
      if (rctx) {
        rctx.clearRect(0, 0, 256, 256);
        const cx = 128;
        const cy = 128;

        const discGrad = rctx.createRadialGradient(cx, cy, 9, cx, cy, 124);
        discGrad.addColorStop(0, 'rgba(148, 163, 184, 0.24)');
        discGrad.addColorStop(0.7, 'rgba(203, 213, 225, 0.14)');
        discGrad.addColorStop(0.95, 'rgba(241, 245, 249, 0.28)');
        discGrad.addColorStop(1, 'rgba(241, 245, 249, 0)');
        rctx.fillStyle = discGrad;
        rctx.beginPath();
        rctx.arc(cx, cy, 124, 0, Math.PI * 2);
        rctx.fill();

        rctx.strokeStyle = 'rgba(226, 232, 240, 0.30)';
        rctx.lineWidth = 3;
        rctx.beginPath();
        rctx.arc(cx, cy, 121, 0, Math.PI * 2);
        rctx.stroke();

        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          rctx.fillStyle = 'rgba(203, 213, 225, 0.18)';
          rctx.beginPath();
          rctx.moveTo(cx, cy);
          rctx.arc(cx, cy, 122, a - 0.2, a + 0.2);
          rctx.closePath();
          rctx.fill();
        }
      }
      textures.rotorBlur = finalizeTex(rotorCanvas);

      this._textures = textures;
      return textures;
    },

    /**
     * Build a Smooth Rounded LatheGeometry Fat-Tire Chopper Wheel (ONLY 3 draw calls per wheel!).
     */
    _buildFatChopperWheel(isFront, mats, textures) {
      const THREE = window.THREE;
      const wheelGroup = new THREE.Group();

      const width = isFront ? 0.44 : 0.52;
      const hw = width * 0.5;
      const outerR = 0.44;
      const rimR = 0.255;

      // 1. Sculpted Rounded Fat-Tire Profile via LatheGeometry (1 seamless organic mesh)
      // Profile revolves around +Y in LatheGeometry, then rotated Z=PI/2 to align axle with X
      const profile = [
        new THREE.Vector2(rimR, -hw * 0.86),
        new THREE.Vector2(rimR + 0.055, -hw * 0.99),
        new THREE.Vector2(outerR - 0.08, -hw * 1.04),
        new THREE.Vector2(outerR - 0.02, -hw * 0.82),
        new THREE.Vector2(outerR, -hw * 0.45),
        new THREE.Vector2(outerR + 0.004, 0),
        new THREE.Vector2(outerR, hw * 0.45),
        new THREE.Vector2(outerR - 0.02, hw * 0.82),
        new THREE.Vector2(outerR - 0.08, hw * 1.04),
        new THREE.Vector2(rimR + 0.055, hw * 0.99),
        new THREE.Vector2(rimR, hw * 0.86)
      ];
      const tireGeo = bakeGeo(new THREE.LatheGeometry(profile, 28), 0, 0, 0, 0, 0, Math.PI / 2);
      const tireMat = createStdMat(
        THREE,
        {
          color: 0xffffff,
          map: textures.tireTread || null,
          roughness: 0.65,
          metalness: 0.08
        },
        mats.envMap
      );
      const tireMesh = new THREE.Mesh(tireGeo, tireMat);
      wheelGroup.add(tireMesh);

      // 2. Merged Alloy Rim Barrel + 5 Sculpted Spokes + Center Hub (1 draw call!)
      const rimParts = [
        bakeGeo(new THREE.CylinderGeometry(rimR + 0.008, rimR + 0.008, width * 0.9, 24), 0, 0, 0, 0, 0, Math.PI / 2),
        bakeGeo(new THREE.CylinderGeometry(0.082, 0.082, width + 0.06, 16), 0, 0, 0, 0, 0, Math.PI / 2)
      ];
      for (let i = 0; i < 5; i++) {
        const angle = (i * Math.PI * 2) / 5;
        const spoke = bakeGeo(
          new THREE.CylinderGeometry(0.032, 0.044, rimR * 1.85, 8),
          0,
          0,
          0,
          angle,
          0,
          0,
          1.4,
          1.0,
          0.7
        );
        rimParts.push(spoke);
      }
      const rimMesh = new THREE.Mesh(mergeGeometries(THREE, rimParts), mats.darkAlloy);
      wheelGroup.add(rimMesh);

      // 3. Silver Cross-Drilled Brake Disc Rotor
      const rotorMat = createStdMat(
        THREE,
        {
          color: 0xffffff,
          map: textures.discBrake || null,
          transparent: true,
          roughness: 0.22,
          metalness: 0.88,
          side: THREE.DoubleSide
        },
        mats.envMap
      );
      const rotorSideX = isFront ? -(width * 0.53) : width * 0.53;
      const rotorGeo = bakeGeo(
        new THREE.CylinderGeometry(0.30, 0.30, 0.015, 24),
        rotorSideX,
        0,
        0,
        0,
        0,
        Math.PI / 2
      );
      wheelGroup.add(new THREE.Mesh(rotorGeo, rotorMat));

      return wheelGroup;
    },

    /**
     * Build a Low-Draw-Call Rounded Car Wheel (ONLY 2 draw calls per wheel: Tire + Merged Rim/Spokes!).
     */
    _buildCarWheel(radius, width, envMap, isPolice) {
      const THREE = window.THREE;
      const shared = this._getSharedMats(THREE, envMap);
      const wheel = new THREE.Group();

      const hw = width * 0.5;
      const rimR = radius * 0.64;

      // 1. Rounded LatheGeometry Car Tire
      const profile = [
        new THREE.Vector2(rimR, -hw * 0.88),
        new THREE.Vector2(radius * 0.82, -hw * 1.02),
        new THREE.Vector2(radius * 0.98, -hw * 0.84),
        new THREE.Vector2(radius, 0),
        new THREE.Vector2(radius * 0.98, hw * 0.84),
        new THREE.Vector2(radius * 0.82, hw * 1.02),
        new THREE.Vector2(rimR, hw * 0.88)
      ];
      const tireGeo = bakeGeo(new THREE.LatheGeometry(profile, 22), 0, 0, 0, 0, 0, Math.PI / 2);
      wheel.add(new THREE.Mesh(tireGeo, shared.tire));

      // 2. Merged Alloy Rim + 5 Spokes + Center Hubcap (1 draw call!)
      const rimParts = [
        bakeGeo(new THREE.CylinderGeometry(rimR + 0.006, rimR + 0.006, width * 0.96, 18), 0, 0, 0, 0, 0, Math.PI / 2),
        bakeGeo(new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, width + 0.03, 12), 0, 0, 0, 0, 0, Math.PI / 2)
      ];
      for (let s = 0; s < 5; s++) {
        const spoke = bakeGeo(
          new THREE.CylinderGeometry(0.022, 0.032, rimR * 1.88, 6),
          0,
          0,
          0,
          (s * Math.PI * 2) / 5,
          0,
          0,
          1.6,
          1.0,
          0.65
        );
        rimParts.push(spoke);
      }
      const rimMat = isPolice ? shared.policeRim : shared.trafficRim;
      wheel.add(new THREE.Mesh(mergeGeometries(THREE, rimParts), rimMat));

      return wheel;
    },

    /**
     * 1. Build Rafa & His Red Fat-Tire Electric Chopper (EDTECH / PT 13)
     * Ultra-lean draw-call budget (~30 meshes total) with realistic organic human anatomy.
     * @param {THREE.Texture} envMap
     * @returns {{ group: THREE.Group, refs: Object }}
     */
    buildRafaAndChopper(envMap) {
      const THREE = window.THREE;
      const textures = this.getTextures();
      const group = new THREE.Group();
      group.name = 'RafaAndChopperGroup';

      const mats = {
        envMap,
        candyRed: createStdMat(
          THREE,
          {
            color: 0xc4121a,
            emissive: 0x160103,
            metalness: 0.62,
            roughness: 0.17,
            envMapIntensity: 1.5
          },
          envMap
        ),
        fenderLightning: createStdMat(
          THREE,
          {
            color: 0xffffff,
            map: textures.fenderLightning || null,
            metalness: 0.58,
            roughness: 0.17,
            envMapIntensity: 1.5
          },
          envMap
        ),
        rearFenderMat: createStdMat(
          THREE,
          {
            color: 0xffffff,
            map: textures.rearFenderStripe || null,
            metalness: 0.58,
            roughness: 0.17,
            envMapIntensity: 1.5
          },
          envMap
        ),
        chrome: createStdMat(
          THREE,
          {
            color: 0xe2e8f0,
            metalness: 0.94,
            roughness: 0.1,
            envMapIntensity: 1.65
          },
          envMap
        ),
        blackSteel: createStdMat(
          THREE,
          {
            color: 0x12141a,
            metalness: 0.66,
            roughness: 0.25,
            envMapIntensity: 1.25
          },
          envMap
        ),
        darkAlloy: createStdMat(
          THREE,
          {
            color: 0x171a22,
            metalness: 0.76,
            roughness: 0.26,
            envMapIntensity: 1.25
          },
          envMap
        ),
        rubber: createStdMat(
          THREE,
          {
            color: 0x141619,
            metalness: 0.06,
            roughness: 0.7
          },
          envMap
        ),
        stitchedLeather: createStdMat(
          THREE,
          {
            color: 0x14161d,
            metalness: 0.1,
            roughness: 0.46
          },
          envMap
        ),
        edtechCore: createStdMat(
          THREE,
          {
            color: 0xffffff,
            map: textures.edtechBattery || null,
            metalness: 0.35,
            roughness: 0.22
          },
          envMap
        ),
        tailLightMat: new THREE.MeshStandardMaterial({
          color: 0xff141e,
          emissive: 0xff0d18,
          emissiveIntensity: 2.8,
          roughness: 0.12,
          metalness: 0.15
        })
      };

      // =========================================================================
      // A. WIDE FAT-TIRE WHEELS (6 meshes total)
      // =========================================================================
      const frontWheel = this._buildFatChopperWheel(true, mats, textures);
      frontWheel.position.set(0, 0.44, -1.1);
      group.add(frontWheel);

      const rearWheel = this._buildFatChopperWheel(false, mats, textures);
      rearWheel.position.set(0, 0.44, 1.0);
      group.add(rearWheel);

      // =========================================================================
      // B. MERGED GLOSSY RED CHOPPER FRAME & CHASSIS (1 draw call for red frame!)
      // =========================================================================
      const redFrameParts = [];
      [-0.24, 0.24].forEach((sideX) => {
        const cradleCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(sideX * 0.52, 1.04, -0.74),
          new THREE.Vector3(sideX * 0.82, 0.62, -0.64),
          new THREE.Vector3(sideX, 0.31, -0.46),
          new THREE.Vector3(sideX, 0.29, 0.44),
          new THREE.Vector3(sideX * 1.12, 0.44, 1.0)
        ]);
        redFrameParts.push(new THREE.TubeGeometry(cradleCurve, 26, 0.045, 12, false));

        const subCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(sideX * 0.82, 0.64, -0.62),
          new THREE.Vector3(sideX * 0.92, 0.42, -0.25),
          new THREE.Vector3(sideX * 0.96, 0.86, 0.16),
          new THREE.Vector3(sideX * 0.96, 0.92, 0.74)
        ]);
        redFrameParts.push(new THREE.TubeGeometry(subCurve, 20, 0.036, 12, false));
      });

      // Sculpted rounded front neck gusset & belly pan via beveled ExtrudeGeometry
      const neckShape = new THREE.Shape();
      neckShape.moveTo(-0.14, 0.45);
      neckShape.quadraticCurveTo(-0.18, 0.70, -0.13, 0.95);
      neckShape.lineTo(0.13, 0.95);
      neckShape.quadraticCurveTo(0.18, 0.70, 0.14, 0.45);
      neckShape.closePath();
      const neckFairingGeo = bakeGeo(
        new THREE.ExtrudeGeometry(neckShape, {
          depth: 0.12,
          bevelEnabled: true,
          bevelThickness: 0.035,
          bevelSize: 0.025,
          bevelSegments: 2
        }),
        0,
        0.02,
        -0.72,
        0.32,
        0,
        0
      );
      redFrameParts.push(neckFairingGeo);

      const panShape = new THREE.Shape();
      panShape.moveTo(-0.62, 0.22);
      panShape.lineTo(0.58, 0.22);
      panShape.quadraticCurveTo(0.66, 0.27, 0.56, 0.33);
      panShape.lineTo(-0.60, 0.33);
      panShape.quadraticCurveTo(-0.68, 0.27, -0.62, 0.22);
      const bellyPanGeo = bakeGeo(
        new THREE.ExtrudeGeometry(panShape, {
          depth: 0.48,
          bevelEnabled: true,
          bevelThickness: 0.03,
          bevelSize: 0.02,
          bevelSegments: 2
        }),
        0,
        0,
        -0.04,
        0,
        -Math.PI / 2,
        0
      );
      // Center extruded belly pan along X (depth 0.48 centered at -0.24)
      bellyPanGeo.translate(0.24, 0, 0);
      redFrameParts.push(bellyPanGeo);

      group.add(new THREE.Mesh(mergeGeometries(THREE, redFrameParts), mats.candyRed));

      // =========================================================================
      // C. MERGED BLACK STEEL CHASSIS HARDWARE, FLOORBOARD, SHOCKS & SISSY BAR
      // =========================================================================
      const blackParts = [];
      const chromeParts = [];

      // Floorboard deck + rear caliper + kickstand + plate bracket + taillight housing
      const deckShape = new THREE.Shape();
      deckShape.moveTo(-0.24, -0.58);
      deckShape.lineTo(0.24, -0.58);
      deckShape.quadraticCurveTo(0.28, 0, 0.24, 0.56);
      deckShape.lineTo(-0.24, 0.56);
      deckShape.quadraticCurveTo(-0.28, 0, -0.24, -0.58);
      const deckGeo = bakeGeo(
        new THREE.ExtrudeGeometry(deckShape, {
          depth: 0.045,
          bevelEnabled: true,
          bevelThickness: 0.012,
          bevelSize: 0.015,
          bevelSegments: 2
        }),
        0,
        0.38,
        -0.04,
        Math.PI / 2,
        0,
        0
      );
      blackParts.push(deckGeo);

      blackParts.push(bakeGeo(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 10), 0.28, 0.62, 0.82, Math.PI / 2, 0, 0));
      blackParts.push(
        bakeGeo(new THREE.CylinderGeometry(0.018, 0.015, 0.42, 10), -0.29, 0.26, 0.25, Math.PI / 2 - 0.18, 0, 0.25)
      );
      blackParts.push(
        bakeGeo(new THREE.CylinderGeometry(0.055, 0.055, 0.30, 12), 0, 0.83, 1.38, 0, 0, Math.PI / 2)
      );

      // Rear coil-over shocks & passenger sissy-bar struts
      [-0.27, 0.27].forEach((sx) => {
        chromeParts.push(bakeGeo(new THREE.CylinderGeometry(0.024, 0.024, 0.50, 12), sx, 0.67, 0.76, -0.34, 0, 0));
        const springPts = [];
        for (let i = 0; i <= 32; i++) {
          const t = i / 32;
          const a = t * Math.PI * 2 * 6;
          springPts.push(new THREE.Vector3(Math.cos(a) * 0.048, (t - 0.5) * 0.40, Math.sin(a) * 0.048));
        }
        const springGeo = bakeGeo(
          new THREE.TubeGeometry(new THREE.CatmullRomCurve3(springPts), 32, 0.014, 7, false),
          sx,
          0.67,
          0.76,
          -0.34,
          0,
          0
        );
        blackParts.push(springGeo);
      });

      [-0.14, 0.14].forEach((sx) => {
        blackParts.push(bakeGeo(new THREE.CylinderGeometry(0.022, 0.026, 0.42, 12), sx, 1.19, 0.75, -0.18, 0, 0));
      });

      // Floorboard traction rubber strips merged into black steel deck (saves 1 draw call)
      for (let g = -2; g <= 2; g++) {
        blackParts.push(bakeGeo(new THREE.CylinderGeometry(0.014, 0.014, 0.96, 8), g * 0.09, 0.39, -0.04, Math.PI / 2, 0, 0));
      }

      group.add(new THREE.Mesh(mergeGeometries(THREE, blackParts), mats.blackSteel));
      group.add(new THREE.Mesh(mergeGeometries(THREE, chromeParts), mats.chrome));

      // Rear Red Fender + Glowing Tail Light Bar + Contoured EDTECH Battery Box + Seat/Backrest
      const rearFender = new THREE.Mesh(
        new THREE.CylinderGeometry(0.515, 0.515, 0.55, 26, 1, false, 0, Math.PI * 1.08),
        mats.rearFenderMat
      );
      rearFender.rotation.z = Math.PI / 2;
      rearFender.rotation.x = -0.28;
      rearFender.position.set(0, 0.45, 1.0);
      group.add(rearFender);

      const tailLightBar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.27, 14),
        mats.tailLightMat
      );
      tailLightBar.rotation.z = Math.PI / 2;
      tailLightBar.position.set(0, 0.83, 1.43);
      group.add(tailLightBar);

      if (textures.softGlow) {
        const tailHalo = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: textures.softGlow,
            color: 0xff141e,
            transparent: true,
            opacity: 0.48,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          })
        );
        tailHalo.position.set(0, 0.83, 1.47);
        tailHalo.scale.set(0.7, 0.42, 1);
        group.add(tailHalo);
      }

      const batteryCore = new THREE.Mesh(
        new THREE.BoxGeometry(0.53, 0.50, 0.60),
        [mats.edtechCore, mats.edtechCore, mats.candyRed, mats.blackSteel, mats.edtechCore, mats.edtechCore]
      );
      batteryCore.position.set(0, 0.65, 0.36);
      group.add(batteryCore);

      // Merged Sculpted Saddle Seat + Sissy-Bar Backrest Cushion (1 draw call)
      const saddleGeo = createAnatomicalLoft(
        THREE,
        [
          { y: 0.90, cx: 0, cz: 0.38, rx: 0.23, rz: 0.34 },
          { y: 0.96, cx: 0, cz: 0.38, rx: 0.26, rz: 0.36 },
          { y: 1.01, cx: 0, cz: 0.40, rx: 0.22, rz: 0.31 }
        ],
        20,
        true,
        true
      );
      const backrestGeo = bakeGeo(
        new THREE.SphereGeometry(0.16, 18, 14),
        0,
        1.35,
        0.79,
        0,
        0,
        0,
        1.45,
        0.72,
        0.58
      );
      group.add(new THREE.Mesh(mergeGeometries(THREE, [saddleGeo, backrestGeo]), mats.stitchedLeather));

      // Hidden-by-default Nitro Flame Cones
      const nitroFlames = [];
      let nitroFlameLeft = null;
      let nitroFlameRight = null;
      [-0.2, 0.2].forEach((tx, idx) => {
        const outerGeo = new THREE.ConeGeometry(0.09, 0.75, 12);
        outerGeo.rotateX(Math.PI / 2);
        const outerFlame = new THREE.Mesh(
          outerGeo,
          new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.0, depthWrite: false })
        );
        outerFlame.position.set(tx, 0.54, 1.55);
        outerFlame.visible = false;
        group.add(outerFlame);
        nitroFlames.push(outerFlame);
        if (idx === 0) nitroFlameLeft = outerFlame;
        if (idx === 1) nitroFlameRight = outerFlame;
      });

      // =========================================================================
      // D. STEERING GROUP: MERGED FORKS, TALL HANDLEBARS, MIRRORS & LED HALO HEADLIGHT
      // =========================================================================
      const steeringGroup = new THREE.Group();
      steeringGroup.position.set(0, 0.96, -0.78);
      group.add(steeringGroup);

      const steerBlackParts = [
        bakeGeo(new THREE.CylinderGeometry(0.072, 0.072, 0.34, 18), 0, 0.1, -0.05, 0.28, 0, 0),
        bakeGeo(new THREE.CylinderGeometry(0.04, 0.04, 0.54, 12), 0, -0.03, -0.1, 0, 0, Math.PI / 2),
        bakeGeo(new THREE.CylinderGeometry(0.035, 0.035, 0.52, 12), 0, -0.24, -0.17, 0.28, 0, Math.PI / 2),
        bakeGeo(new THREE.CylinderGeometry(0.038, 0.038, 0.52, 12), 0, 0.28, -0.02, 0, 0, Math.PI / 2),
        bakeGeo(new THREE.CylinderGeometry(0.215, 0.16, 0.17, 24), 0, 0.22, -0.21, Math.PI / 2, 0, 0),
        bakeGeo(new THREE.CylinderGeometry(0.06, 0.052, 0.05, 16), 0, -0.06, -0.22, Math.PI / 2, 0, 0),
        bakeGeo(new THREE.BoxGeometry(0.28, 0.13, 0.04), 0, 0.56, 0.02, -0.52, 0, 0),
        bakeGeo(new THREE.BoxGeometry(0.08, 0.14, 0.16), -0.26, -0.48, -0.2)
      ];
      const steerChromeParts = [
        bakeGeo(new THREE.TorusGeometry(0.21, 0.02, 12, 28), 0, 0.22, -0.295),
        bakeGeo(new THREE.TorusGeometry(0.056, 0.008, 8, 16), 0, -0.06, -0.245)
      ];

      [-1, 1].forEach((side) => {
        const fx = side * 0.22;
        steerBlackParts.push(bakeGeo(new THREE.CylinderGeometry(0.046, 0.046, 0.38, 16), fx, 0.12, -0.06, 0.28, 0, 0));
        steerChromeParts.push(bakeGeo(new THREE.CylinderGeometry(0.038, 0.038, 0.36, 16), fx, -0.14, -0.14, 0.28, 0, 0));
        steerBlackParts.push(bakeGeo(new THREE.CylinderGeometry(0.052, 0.048, 0.48, 16), fx, -0.44, -0.23, 0.28, 0, 0));

        // Tall black handlebars + switchbox + lever + mirror housing & stem
        const barCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0.31, -0.01),
          new THREE.Vector3(side * 0.15, 0.33, 0.01),
          new THREE.Vector3(side * 0.26, 0.52, 0.08),
          new THREE.Vector3(side * 0.44, 0.54, 0.16)
        ]);
        steerBlackParts.push(new THREE.TubeGeometry(barCurve, 18, 0.024, 12, false));
        steerBlackParts.push(bakeGeo(new THREE.BoxGeometry(0.06, 0.066, 0.066), side * 0.33, 0.535, 0.12));
        steerBlackParts.push(bakeGeo(new THREE.BoxGeometry(0.16, 0.016, 0.024), side * 0.43, 0.535, 0.08, 0, -side * 0.32, 0));

        const stemCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.35, 0.56, 0.12),
          new THREE.Vector3(side * 0.48, 0.72, 0.11),
          new THREE.Vector3(side * 0.55, 0.84, 0.1)
        ]);
        steerBlackParts.push(new THREE.TubeGeometry(stemCurve, 12, 0.011, 8, false));
        steerBlackParts.push(bakeGeo(new THREE.CylinderGeometry(0.09, 0.085, 0.028, 20), side * 0.55, 0.84, 0.1, Math.PI / 2, 0, 0));
        steerChromeParts.push(bakeGeo(new THREE.CircleGeometry(0.08, 18), side * 0.55, 0.84, 0.116));

        // Handlebar grip merged cleanly into steering hardware
        steerBlackParts.push(
          bakeGeo(new THREE.CylinderGeometry(0.032, 0.032, 0.22, 14), side * 0.44, 0.54, 0.16, 0, -side * 0.2, Math.PI / 2)
        );
      });

      steeringGroup.add(new THREE.Mesh(mergeGeometries(THREE, steerBlackParts), mats.blackSteel));
      steeringGroup.add(new THREE.Mesh(mergeGeometries(THREE, steerChromeParts), mats.chrome));

      // Front Swept Red Fender + Digital Dash + Multi-LED Halo Face + Sprite Glow
      const frontFender = new THREE.Mesh(
        new THREE.CylinderGeometry(0.495, 0.495, 0.47, 26, 1, false, 0, Math.PI * 0.9),
        mats.fenderLightning
      );
      frontFender.rotation.z = Math.PI / 2;
      frontFender.rotation.x = 0.55;
      frontFender.position.set(0, -0.52, -0.32);
      steeringGroup.add(frontFender);

      const dashDisplay = new THREE.Mesh(
        new THREE.PlaneGeometry(0.25, 0.105),
        new THREE.MeshBasicMaterial({ map: textures.digitalDash || null, color: 0xffffff })
      );
      dashDisplay.position.set(0, 0.562, 0.042);
      dashDisplay.rotation.x = -0.52;
      steeringGroup.add(dashDisplay);

      const reflectorFace = new THREE.Mesh(
        new THREE.CircleGeometry(0.198, 26),
        new THREE.MeshBasicMaterial({ map: textures.headlightFace || null, color: 0xffffff })
      );
      reflectorFace.rotation.y = Math.PI;
      reflectorFace.position.set(0, 0.22, -0.30);
      steeringGroup.add(reflectorFace);

      // Merge 3D LED halo ring + LED projector beads + blinker strips into 1 emissive mesh
      const ledParts = [bakeGeo(new THREE.TorusGeometry(0.176, 0.015, 10, 28), 0, 0.22, -0.306)];
      [-0.085, -0.028, 0.028, 0.085].forEach((lx) => {
        ledParts.push(bakeGeo(new THREE.SphereGeometry(0.024, 8, 8), lx, 0.262, -0.305, 0, 0, 0, 1, 1, 0.45));
      });
      [-0.068, 0, 0.068].forEach((lx) => {
        ledParts.push(bakeGeo(new THREE.SphereGeometry(0.024, 8, 8), lx, 0.178, -0.305, 0, 0, 0, 1, 1, 0.45));
      });
      [-0.27, 0.27].forEach((bx) => {
        ledParts.push(bakeGeo(new THREE.BoxGeometry(0.11, 0.018, 0.014), bx, 0.05, -0.185));
      });
      steeringGroup.add(
        new THREE.Mesh(mergeGeometries(THREE, ledParts), new THREE.MeshBasicMaterial({ color: 0xf8fafc }))
      );

      if (textures.softGlow) {
        const hlHalo = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: textures.softGlow,
            color: 0xeef6ff,
            transparent: true,
            opacity: 0.65,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          })
        );
        hlHalo.position.set(0, 0.22, -0.34);
        hlHalo.scale.set(1.35, 1.35, 1);
        steeringGroup.add(hlHalo);
      }

      // Realistic Headlight SpotLight + Soft Volumetric Beam Cone
      const headlightSpot = new THREE.SpotLight(0xf5f9ff, 2.4, 65, Math.PI / 5.4, 0.52, 1.15);
      headlightSpot.position.set(0, 1.18, -1.05);
      headlightSpot.target.position.set(0, 0.1, -26);
      group.add(headlightSpot);
      group.add(headlightSpot.target);

      const coneGeo = new THREE.ConeGeometry(2.3, 13.5, 22, 1, true);
      coneGeo.rotateX(Math.PI / 2);
      const headlightCone = new THREE.Mesh(
        coneGeo,
        new THREE.MeshBasicMaterial({
          color: 0xeef6ff,
          transparent: true,
          opacity: 0.055,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      headlightCone.position.set(0, 0.72, -7.8);
      group.add(headlightCone);

      const underGlowLight = new THREE.PointLight(0xff1824, 0.45, 4.5, 2.0);
      underGlowLight.position.set(0, 0.35, 0.8);
      underGlowLight.visible = false; // Zero shader overhead; renderer activates only if needed
      group.add(underGlowLight);

      // =========================================================================
      // E. REALISTIC SCULPTED ANATOMICAL RAFA RIDER (ZERO BoxGeometry!)
      // =========================================================================
      const { riderGroup, riderTorso, riderHead } = this._buildRafaRider(mats, textures);
      group.add(riderGroup);

      const refs = {
        frontWheel,
        rearWheel,
        steeringGroup,
        headlightSpot,
        headlightCone,
        headlightBeam: headlightCone,
        tailLightMat: mats.tailLightMat,
        nitroFlames,
        nitroFlameLeft,
        nitroFlameRight,
        riderGroup,
        riderTorso,
        riderHead,
        underGlowLight
      };

      group.userData = Object.assign({}, group.userData, refs, { refs });
      return Object.assign({ group, refs }, refs);
    },

    /**
     * Build Anatomically Sculpted 3D Rafa Rider (ZERO BoxGeometry on the human body!)
     * Organic multi-slice V-taper torso, curved spline limbs, contoured boots, sculpted fingers,
     * anatomical head/neck/jawline, tapered fade haircut, sculpted beard, and rectangular glasses.
     */
    _buildRafaRider(mats, textures) {
      const THREE = window.THREE;
      const riderGroup = new THREE.Group();
      riderGroup.name = 'RafaRiderGroup';

      const leatherSleeveMat = createStdMat(
        THREE,
        { color: 0x12141a, roughness: 0.42, metalness: 0.1 },
        mats.envMap
      );
      const jacketAtlasMat = createStdMat(
        THREE,
        {
          color: 0xffffff,
          map: textures.jacketAtlas || null,
          roughness: 0.42,
          metalness: 0.1
        },
        mats.envMap
      );
      const cargoPantsMat = createStdMat(
        THREE,
        { color: 0x1a1d24, roughness: 0.76, metalness: 0.05 },
        mats.envMap
      );
      const bootMat = createStdMat(
        THREE,
        { color: 0x0f1116, roughness: 0.36, metalness: 0.18 },
        mats.envMap
      );
      const skinMat = createStdMat(
        THREE,
        { color: 0xdfa078, roughness: 0.56, metalness: 0.02 },
        mats.envMap
      );
      const beardHairMat = createStdMat(
        THREE,
        { color: 0x1b130e, roughness: 0.85, metalness: 0.04 },
        mats.envMap
      );

      // -----------------------------------------------------------------------
      // 1. LOWER BODY: Anatomical Pelvis + Lofted Thighs/Knees/Calves + Contoured Boots
      // -----------------------------------------------------------------------
      const pantsParts = [];
      const pelvisGeo = createAnatomicalLoft(
        THREE,
        [
          { y: 0.94, cx: 0, cz: 0.37, rx: 0.215, rz: 0.155 },
          { y: 1.03, cx: 0, cz: 0.36, rx: 0.23, rz: 0.165 },
          { y: 1.12, cx: 0, cz: 0.35, rx: 0.205, rz: 0.15 }
        ],
        22,
        true,
        true
      );
      pantsParts.push(pelvisGeo);

      const bootParts = [];

      [-1, 1].forEach((side) => {
        const legGeo = createLoftedSplineLimb(
          THREE,
          [
            new THREE.Vector3(side * 0.145, 1.03, 0.35), // Hip socket
            new THREE.Vector3(side * 0.21, 1.01, 0.12),  // Muscular quadricep swell
            new THREE.Vector3(side * 0.228, 0.90, -0.12), // Knee cap
            new THREE.Vector3(side * 0.228, 0.68, -0.17), // Calf swell
            new THREE.Vector3(side * 0.228, 0.48, -0.21)  // Tapered ankle entering boot
          ],
          (t) => {
            if (t < 0.35) return 0.124 - t * 0.045;
            if (t < 0.55) return 0.108 - (t - 0.35) * 0.07;
            if (t < 0.78) return 0.094 + Math.sin(((t - 0.55) / 0.23) * Math.PI) * 0.008;
            return 0.094 - (t - 0.78) * 0.095;
          },
          20,
          16,
          true
        );
        pantsParts.push(legGeo);

        // Sculpted outer thigh cargo pocket aligned cleanly along thigh slope
        const pocketShape = new THREE.Shape();
        pocketShape.moveTo(-0.065, -0.075);
        pocketShape.lineTo(0.065, -0.075);
        pocketShape.quadraticCurveTo(0.08, 0, 0.065, 0.075);
        pocketShape.lineTo(-0.065, 0.075);
        pocketShape.quadraticCurveTo(-0.08, 0, -0.065, -0.075);
        const pocketGeo = new THREE.ExtrudeGeometry(pocketShape, {
          depth: 0.025,
          bevelEnabled: true,
          bevelThickness: 0.008,
          bevelSize: 0.008,
          bevelSegments: 2
        });
        pocketGeo.translate(0, 0, -0.0125);
        pocketGeo.rotateY(side * (Math.PI / 2));
        pocketGeo.rotateX(-0.32);
        pocketGeo.translate(side * 0.305, 1.01, 0.12);
        pantsParts.push(pocketGeo);

        // Contoured Biker Boot (smooth extruded side profile + ankle collar, ZERO BoxGeometry!)
        const bx = side * 0.228;
        const bootSide = new THREE.Shape();
        bootSide.moveTo(-0.18, 0.00);
        bootSide.quadraticCurveTo(-0.20, 0.055, -0.12, 0.078);
        bootSide.quadraticCurveTo(-0.03, 0.098, 0.01, 0.16);
        bootSide.lineTo(0.095, 0.16);
        bootSide.quadraticCurveTo(0.115, 0.075, 0.105, 0.00);
        bootSide.closePath();
        const bootBodyGeo = bakeGeo(
          new THREE.ExtrudeGeometry(bootSide, {
            depth: 0.12,
            bevelEnabled: true,
            bevelThickness: 0.025,
            bevelSize: 0.018,
            bevelSegments: 2,
            curveSegments: 8
          }),
          bx,
          0.405,
          -0.23,
          0,
          -Math.PI / 2,
          0
        );
        bootBodyGeo.translate(0.06, 0, 0);
        bootParts.push(bootBodyGeo);

        const soleShape = new THREE.Shape();
        soleShape.moveTo(-0.19, 0.0);
        soleShape.lineTo(0.11, 0.0);
        soleShape.quadraticCurveTo(0.12, 0.02, 0.105, 0.032);
        soleShape.lineTo(-0.175, 0.032);
        soleShape.quadraticCurveTo(-0.20, 0.018, -0.19, 0.0);
        const soleGeo = bakeGeo(
          new THREE.ExtrudeGeometry(soleShape, {
            depth: 0.135,
            bevelEnabled: true,
            bevelThickness: 0.014,
            bevelSize: 0.01,
            bevelSegments: 1
          }),
          bx + 0.0675,
          0.388,
          -0.23,
          0,
          -Math.PI / 2,
          0
        );
        bootParts.push(soleGeo);
      });

      riderGroup.add(new THREE.Mesh(mergeGeometries(THREE, pantsParts), cargoPantsMat));
      riderGroup.add(new THREE.Mesh(mergeGeometries(THREE, bootParts), bootMat));

      // -----------------------------------------------------------------------
      // 2. SCULPTED ANATOMICAL TORSO & LEATHER BIKER JACKET (1 draw call!)
      // -----------------------------------------------------------------------
      const riderTorso = new THREE.Group();
      riderTorso.position.set(0, 1.36, 0.34);
      riderTorso.rotation.x = -0.14;
      riderGroup.add(riderTorso);

      // Sculpted pectoral / spine cross-section shaper
      const chestShape = (chestBulge, spineHollow) => (theta, cosT, sinT) => {
        // sinT > 0 is FRONT (-Z); sinT < 0 is BACK (+Z)
        let dr = 0;
        if (sinT > 0) {
          // Twin pectoral swell with subtle sternum valley at theta = PI/2
          const sternumValley = Math.exp(-Math.pow((theta - Math.PI / 2) / 0.22, 2));
          dr += sinT * chestBulge * (1 - 0.55 * sternumValley);
        } else {
          // Subtle spinal groove at center back (theta = 1.5*PI) flanked by scapula/lats
          const spineDip = Math.exp(-Math.pow((theta - Math.PI * 1.5) / 0.25, 2));
          dr += -sinT * (chestBulge * 0.55) - spineDip * spineHollow;
        }
        return { dr };
      };

      const torsoGeo = createAnatomicalLoft(
        THREE,
        [
          { y: -0.31, cx: 0, cz: 0.012, rx: 0.205, rz: 0.142, v: 0.04 },
          { y: -0.22, cx: 0, cz: 0.010, rx: 0.192, rz: 0.132, v: 0.18 },
          { y: -0.12, cx: 0, cz: 0.006, rx: 0.214, rz: 0.145, v: 0.34 },
          { y: -0.02, cx: 0, cz: 0.002, rx: 0.242, rz: 0.156, v: 0.50, shapeFn: chestShape(0.014, 0.01) },
          { y: 0.09, cx: 0, cz: -0.002, rx: 0.268, rz: 0.164, v: 0.68, shapeFn: chestShape(0.022, 0.014) },
          { y: 0.19, cx: 0, cz: -0.004, rx: 0.282, rz: 0.162, v: 0.84, shapeFn: chestShape(0.018, 0.012) },
          { y: 0.26, cx: 0, cz: -0.004, rx: 0.236, rz: 0.142, v: 0.92 },
          { y: 0.31, cx: 0, cz: 0.010, rx: 0.136, rz: 0.128, v: 0.96 },
          { y: 0.37, cx: 0, cz: 0.012, rx: 0.122, rz: 0.118, v: 1.00 }
        ],
        28,
        true,
        false
      );

      riderTorso.add(new THREE.Mesh(torsoGeo, jacketAtlasMat));

      // -----------------------------------------------------------------------
      // 3. ANATOMICAL ARMS, ROLLED SLEEVES, FOREARMS & FINGERLESS GLOVES ON GRIPS
      // -----------------------------------------------------------------------
      const sleeveParts = [];
      const forearmSkinParts = [];
      const gloveParts = [];

      // Compute exact handlebar grip positions in riderTorso local space
      riderTorso.updateMatrixWorld(true);
      const invTorso = new THREE.Matrix4().copy(riderTorso.matrixWorld).invert();

      [-1, 1].forEach((side) => {
        const gripWorld = new THREE.Vector3(side * 0.44, 1.50, -0.62);
        const gripLocal = gripWorld.clone().applyMatrix4(invTorso);

        const shoulderPt = new THREE.Vector3(side * 0.268, 0.21, -0.005);
        const elbowPt = new THREE.Vector3(side * 0.375, 0.04, -0.35);
        const cuffPt = new THREE.Vector3(side * 0.398, 0.08, -0.52);
        const wristPt = gripLocal.clone().add(new THREE.Vector3(0, -0.01, 0.11));

        // Rolled leather jacket upper sleeve (shoulder -> deltoid -> bicep -> elbow -> rolled cuff)
        const sleeveGeo = createLoftedSplineLimb(
          THREE,
          [
            shoulderPt,
            new THREE.Vector3(side * 0.315, 0.14, -0.14),
            elbowPt,
            cuffPt
          ],
          (t) => {
            if (t < 0.25) return 0.105 - t * 0.04;
            if (t > 0.85) return 0.082 + Math.sin(((t - 0.85) / 0.15) * Math.PI) * 0.012;
            return 0.095 - (t - 0.25) * 0.022;
          },
          18,
          16,
          true
        );
        sleeveParts.push(sleeveGeo);

        // Exposed muscular skin forearm from inside rolled cuff down to wrist
        const forearmGeo = createLoftedSplineLimb(
          THREE,
          [
            cuffPt.clone().add(new THREE.Vector3(0, -0.005, 0.03)),
            new THREE.Vector3(side * 0.415, 0.11, -0.68),
            wristPt
          ],
          (t) => {
            if (t < 0.3) return 0.072 + Math.sin((t / 0.3) * Math.PI * 0.5) * 0.008;
            return 0.08 - t * 0.026;
          },
          14,
          14,
          true
        );
        forearmSkinParts.push(forearmGeo);

        // Sculpted fingerless leather riding glove wrapping the hand & handlebar grip
        const gloveShape = new THREE.Shape();
        gloveShape.moveTo(-0.056, -0.028);
        gloveShape.quadraticCurveTo(0, -0.038, 0.056, -0.028);
        gloveShape.quadraticCurveTo(0.064, 0, 0.052, 0.026);
        gloveShape.quadraticCurveTo(0, 0.036, -0.052, 0.026);
        gloveShape.quadraticCurveTo(-0.064, 0, -0.056, -0.028);
        const gloveGeo = bakeGeo(
          new THREE.ExtrudeGeometry(gloveShape, {
            depth: 0.095,
            bevelEnabled: true,
            bevelThickness: 0.014,
            bevelSize: 0.012,
            bevelSegments: 2
          }),
          gripLocal.x,
          gripLocal.y + 0.014,
          gripLocal.z - 0.038,
          0.18,
          -side * 0.18,
          0
        );
        gloveParts.push(gloveGeo);

        // 4 sculpted knuckle guard bumps across glove back
        for (let k = -1.5; k <= 1.5; k += 1) {
          gloveParts.push(
            bakeGeo(
              new THREE.SphereGeometry(0.013, 8, 8),
              gripLocal.x + k * 0.024,
              gripLocal.y + 0.044,
              gripLocal.z - 0.005
            )
          );
        }

        // Wristwatch on Rafa's left wrist (side === -1, matching poster & video 0:00!)
        if (side === -1) {
          gloveParts.push(
            bakeGeo(
              new THREE.CylinderGeometry(0.06, 0.06, 0.032, 14),
              wristPt.x,
              wristPt.y,
              wristPt.z + 0.035,
              1.45,
              0,
              0
            )
          );
        }

        // Curved bare fingers & thumb curling naturally underneath the rubber handlebar grip
        for (let f = -1.5; f <= 1.5; f += 1) {
          const fx = gripLocal.x + f * 0.023;
          const fingerCurve = createLoftedSplineLimb(
            THREE,
            [
              new THREE.Vector3(fx, gripLocal.y + 0.01, gripLocal.z - 0.042),
              new THREE.Vector3(fx, gripLocal.y - 0.032, gripLocal.z - 0.038),
              new THREE.Vector3(fx, gripLocal.y - 0.036, gripLocal.z + 0.004)
            ],
            () => 0.011,
            6,
            8,
            true
          );
          forearmSkinParts.push(fingerCurve);
        }
        const thumbCurve = createLoftedSplineLimb(
          THREE,
          [
            new THREE.Vector3(gripLocal.x - side * 0.045, gripLocal.y + 0.015, gripLocal.z + 0.035),
            new THREE.Vector3(gripLocal.x - side * 0.042, gripLocal.y - 0.012, gripLocal.z + 0.015),
            new THREE.Vector3(gripLocal.x - side * 0.02, gripLocal.y - 0.028, gripLocal.z - 0.015)
          ],
          () => 0.013,
          6,
          8,
          true
        );
        forearmSkinParts.push(thumbCurve);
      });

      riderTorso.add(new THREE.Mesh(mergeGeometries(THREE, sleeveParts), leatherSleeveMat));
      riderTorso.add(new THREE.Mesh(mergeGeometries(THREE, forearmSkinParts), skinMat));
      riderTorso.add(new THREE.Mesh(mergeGeometries(THREE, gloveParts), bootMat));

      // -----------------------------------------------------------------------
      // 4. REALISTIC SCULPTED HUMAN HEAD, FADE HAIR, BEARD & RECTANGULAR GLASSES
      // -----------------------------------------------------------------------
      const riderHead = new THREE.Group();
      riderHead.position.set(0, 0.56, -0.022);
      riderHead.rotation.x = 0.14; // Keep gaze level ahead while torso leans forward
      riderTorso.add(riderHead);

      // Sculpted Anatomical Head + Smooth Neck + Ears (1 draw call!)
      riderHead.add(new THREE.Mesh(createAnatomicalHeadGeometry(THREE), skinMat));

      // Sculpted Hair Fade + Crown + Tapered Nape + Jaw Beard + Mustache + Eyebrows (1 draw call!)
      riderHead.add(new THREE.Mesh(createSculptedHairAndBeardGeometry(THREE), beardHairMat));

      // 3D Eyes seated inside sculpted eye sockets (2 draw calls)
      const scleraParts = [];
      const irisParts = [];
      [-0.056, 0.056].forEach((ex) => {
        scleraParts.push(bakeGeo(new THREE.SphereGeometry(0.02, 10, 10), ex, 0.028, -0.165, 0, 0, 0, 1.1, 0.85, 0.6));
        irisParts.push(bakeGeo(new THREE.CircleGeometry(0.01, 10), ex, 0.028, -0.178, 0, Math.PI, 0));
      });
      riderHead.add(new THREE.Mesh(mergeGeometries(THREE, scleraParts), new THREE.MeshBasicMaterial({ color: 0xf8fafc })));
      riderHead.add(new THREE.Mesh(mergeGeometries(THREE, irisParts), new THREE.MeshBasicMaterial({ color: 0x26180f })));

      // Sleek Black Rectangular Eyeglasses (1 draw call for frame + 1 draw call for lenses)
      const frameMat = createStdMat(
        THREE,
        { color: 0x08090d, roughness: 0.18, metalness: 0.42 },
        mats.envMap
      );
      riderHead.add(new THREE.Mesh(createGlassesGeometry(THREE), frameMat));

      const lensParts = [];
      [-0.062, 0.062].forEach((gx) => {
        lensParts.push(bakeGeo(new THREE.PlaneGeometry(0.072, 0.04), gx, 0.028, -0.184, 0, Math.PI, 0));
      });
      const lensMat = createStdMat(
        THREE,
        {
          color: 0xdbeafe,
          metalness: 0.88,
          roughness: 0.06,
          transparent: true,
          opacity: 0.26
        },
        mats.envMap
      );
      riderHead.add(new THREE.Mesh(mergeGeometries(THREE, lensParts), lensMat));

      return { riderGroup, riderTorso, riderHead };
    },

    /**
     * 2. Build Sculpted Black-and-White Police Cruiser ('police_car') or SWAT BearCat ('swat_van')
     * Uses beveled ExtrudeGeometry side-profile chassis with wheel arches & fastback slope (~16 meshes total).
     * @param {string} variant - 'police_car' | 'swat_van'
     * @param {THREE.Texture} envMap
     */
    buildPoliceCruiser(variant, envMap) {
      const THREE = window.THREE;
      const shared = this._getSharedMats(THREE, envMap);
      const isSwat = variant === 'swat_van';
      const group = new THREE.Group();
      group.name = isSwat ? 'SWATBearCatGroup' : 'ViceCityPoliceCruiserGroup';

      const redStrobeMat = new THREE.MeshBasicMaterial({ color: 0xff1722 });
      const blueStrobeMat = new THREE.MeshBasicMaterial({ color: 0x0077ff });

      // 1. Sculpted Extruded Car Chassis (Material 0 = Sides w/ POLICE doors, Material 1 = Hood/Roof/Trunk)
      const chassisGeo = createExtrudedCarBody(THREE, isSwat);
      const sideMat = isSwat ? shared.swatDoor : shared.policeDoor;
      const shellMat = isSwat ? shared.swatBlack : shared.blackPaint;
      group.add(new THREE.Mesh(chassisGeo, [sideMat, shellMat]));

      // 2. Sculpted Raked Front Windshield & Fastback Rear Window Insert (1 draw call)
      const glassParts = [];
      if (!isSwat) {
        glassParts.push(bakeGeo(new THREE.PlaneGeometry(1.62, 0.68), 0, 1.17, -0.66, -0.88, Math.PI, 0));
        glassParts.push(bakeGeo(new THREE.PlaneGeometry(1.58, 0.70), 0, 1.16, 1.03, -1.07, 0, 0));
      } else {
        glassParts.push(bakeGeo(new THREE.PlaneGeometry(1.88, 0.74), 0, 1.67, -1.40, -0.52, Math.PI, 0));
      }
      group.add(new THREE.Mesh(mergeGeometries(THREE, glassParts), shared.darkGlass));

      // 3. Merged Steel Push-Bar / Ram Bumper + Front Grille + Side Mirrors (1 draw call)
      const trimParts = [];
      if (!isSwat) {
        trimParts.push(bakeGeo(new THREE.BoxGeometry(1.04, 0.22, 0.06), 0, 0.58, -2.26));
        trimParts.push(bakeGeo(new THREE.BoxGeometry(1.54, 0.075, 0.12), 0, 0.62, -2.32));
        trimParts.push(bakeGeo(new THREE.BoxGeometry(1.54, 0.075, 0.12), 0, 0.38, -2.32));
        [-0.48, 0.48].forEach((bx) => {
          trimParts.push(bakeGeo(new THREE.BoxGeometry(0.085, 0.54, 0.16), bx, 0.50, -2.32));
        });
        [-1.01, 1.01].forEach((mx) => {
          trimParts.push(bakeGeo(new THREE.BoxGeometry(0.15, 0.09, 0.11), mx, 0.96, -0.68));
        });
      } else {
        trimParts.push(bakeGeo(new THREE.BoxGeometry(2.26, 0.68, 0.26), 0, 0.68, -2.86));
      }
      group.add(new THREE.Mesh(mergeGeometries(THREE, trimParts), shared.steel));

      // 4. 4 Sculpted Wheels (2 draw calls each = 8 meshes)
      const wheels = [];
      const wheelRadius = isSwat ? 0.46 : 0.37;
      const wheelWidth = isSwat ? 0.34 : 0.26;
      const wheelX = isSwat ? 1.10 : 0.94;
      const wheelZFront = isSwat ? -1.85 : -1.38;
      const wheelZRear = isSwat ? 1.65 : 1.38;

      [
        [-wheelX, wheelRadius, wheelZFront],
        [wheelX, wheelRadius, wheelZFront],
        [-wheelX, wheelRadius, wheelZRear],
        [wheelX, wheelRadius, wheelZRear]
      ].forEach(([wx, wy, wz]) => {
        const w = this._buildCarWheel(wheelRadius, wheelWidth, envMap, true);
        w.position.set(wx, wy, wz);
        group.add(w);
        wheels.push(w);
      });

      // 5. Merged Headlights, Amber Markers & Red LED Tail Light Bar (3 draw calls)
      const frontZ = isSwat ? -2.79 : -2.26;
      const rearZ = isSwat ? 2.69 : 2.26;
      const hlParts = [];
      const amberParts = [];
      [-0.70, 0.70].forEach((lx) => {
        hlParts.push(bakeGeo(new THREE.BoxGeometry(0.38, 0.14, 0.06), lx, 0.60, frontZ));
        amberParts.push(bakeGeo(new THREE.BoxGeometry(0.10, 0.13, 0.06), lx + (lx > 0 ? 0.22 : -0.22), 0.60, frontZ + 0.02));
      });
      group.add(new THREE.Mesh(mergeGeometries(THREE, hlParts), shared.headlightEmissive));
      group.add(new THREE.Mesh(mergeGeometries(THREE, amberParts), shared.amberEmissive));

      const brakeStrip = new THREE.Mesh(
        new THREE.BoxGeometry(isSwat ? 1.98 : 1.78, 0.13, 0.06),
        shared.tailEmissive
      );
      brakeStrip.position.set(0, 0.68, rearZ);
      group.add(brakeStrip);

      // 6. Low-Profile Roof LED Lightbar + Additive Strobe Halo Sprites (Zero PointLight shader overhead!)
      const lightbarY = isSwat ? 2.20 : 1.51;
      const lightbarZ = isSwat ? -0.45 : -0.02;

      const barMountGeo = mergeGeometries(THREE, [
        bakeGeo(new THREE.BoxGeometry(0.18, 0.09, 0.24), 0, lightbarY, lightbarZ),
        bakeGeo(new THREE.BoxGeometry(0.14, 0.06, 0.20), -0.52, lightbarY - 0.05, lightbarZ),
        bakeGeo(new THREE.BoxGeometry(0.14, 0.06, 0.20), 0.52, lightbarY - 0.05, lightbarZ)
      ]);
      group.add(new THREE.Mesh(barMountGeo, shared.steel));

      const redLightPod = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.085, 0.21), redStrobeMat);
      redLightPod.position.set(-0.40, lightbarY, lightbarZ);
      group.add(redLightPod);

      const blueLightPod = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.085, 0.21), blueStrobeMat);
      blueLightPod.position.set(0.40, lightbarY, lightbarZ);
      group.add(blueLightPod);

      if (shared.redGlowSprite && shared.blueGlowSprite) {
        const redGlow = new THREE.Sprite(shared.redGlowSprite);
        redGlow.position.set(-0.42, lightbarY + 0.03, lightbarZ);
        redGlow.scale.set(1.5, 0.9, 1);
        group.add(redGlow);

        const blueGlow = new THREE.Sprite(shared.blueGlowSprite);
        blueGlow.position.set(0.42, lightbarY + 0.03, lightbarZ);
        blueGlow.scale.set(1.5, 0.9, 1);
        group.add(blueGlow);
      }

      // Kept invisible so WebGL does not recompile 6+ extra dynamic PointLight shaders per cruiser
      const strobeLight = new THREE.PointLight(0xff1722, 0, 11, 2.0);
      strobeLight.position.set(0, lightbarY + 0.22, lightbarZ);
      strobeLight.visible = false;
      group.add(strobeLight);

      const refs = {
        redStrobeMat,
        blueStrobeMat,
        redBarMat: redStrobeMat,
        blueBarMat: blueStrobeMat,
        strobeLight,
        wheels,
        phaseOffset: Math.random() * 10
      };

      group.userData = Object.assign({}, group.userData, refs);
      return Object.assign({ group, refs }, refs);
    },

    /**
     * 3. Build Sculpted Night Traffic Fastback Sedan / Sports Coupe (~14 meshes total)
     * @param {number} colorHex
     * @param {THREE.Texture} envMap
     */
    buildTrafficCar(colorHex, envMap) {
      const THREE = window.THREE;
      const shared = this._getSharedMats(THREE, envMap);
      const group = new THREE.Group();
      group.name = 'ViceCityTrafficCarGroup';

      const primaryColor = colorHex !== undefined ? colorHex : 0x1e2430;
      const bodyPaint = createStdMat(
        THREE,
        {
          color: primaryColor,
          metalness: 0.72,
          roughness: 0.17,
          envMapIntensity: 1.45
        },
        envMap
      );

      // 1. Sculpted Extruded Fastback Sports Coupe Silhouette
      const chassisGeo = createExtrudedCarBody(THREE, false);
      group.add(new THREE.Mesh(chassisGeo, [bodyPaint, bodyPaint]));

      // 2. Merged Dark Tinted Cabin Windows (Windshield, Rear Glass, Tapered Side Greenhouse)
      const sideWinShape = new THREE.Shape();
      sideWinShape.moveTo(-0.78, 0.94);
      sideWinShape.lineTo(-0.30, 1.36);
      sideWinShape.lineTo(0.56, 1.34);
      sideWinShape.lineTo(1.14, 0.96);
      sideWinShape.closePath();
      const sideWinGeo = bakeGeo(
        new THREE.ExtrudeGeometry(sideWinShape, { depth: 2.0, bevelEnabled: false }),
        1.0,
        0,
        0,
        0,
        -Math.PI / 2,
        0
      );
      const glassParts = [
        bakeGeo(new THREE.PlaneGeometry(1.62, 0.68), 0, 1.17, -0.66, -0.88, Math.PI, 0),
        bakeGeo(new THREE.PlaneGeometry(1.58, 0.70), 0, 1.16, 1.03, -1.07, 0, 0),
        sideWinGeo
      ];
      group.add(new THREE.Mesh(mergeGeometries(THREE, glassParts), shared.darkGlass));

      // 3. 4 Sculpted Alloy Wheels (8 meshes total)
      const wheels = [];
      [
        [-0.93, 0.35, -1.38],
        [0.93, 0.35, -1.38],
        [-0.93, 0.35, 1.38],
        [0.93, 0.35, 1.38]
      ].forEach(([wx, wy, wz]) => {
        const w = this._buildCarWheel(0.35, 0.25, envMap, false);
        w.position.set(wx, wy, wz);
        group.add(w);
        wheels.push(w);
      });

      // 4. Merged White Headlights & Red LED Tail Lights
      const hlParts = [];
      [-0.68, 0.68].forEach((hx) => {
        hlParts.push(bakeGeo(new THREE.BoxGeometry(0.36, 0.12, 0.06), hx, 0.56, -2.26));
      });
      group.add(new THREE.Mesh(mergeGeometries(THREE, hlParts), shared.headlightEmissive));

      const tailLightMat = new THREE.MeshBasicMaterial({ color: 0xff141e });
      const tlParts = [];
      [-0.66, 0.66].forEach((tx) => {
        tlParts.push(bakeGeo(new THREE.BoxGeometry(0.44, 0.13, 0.06), tx, 0.66, 2.26));
      });
      group.add(new THREE.Mesh(mergeGeometries(THREE, tlParts), tailLightMat));

      const underglowMat = new THREE.MeshBasicMaterial({
        color: primaryColor,
        transparent: true,
        opacity: 0.0,
        depthWrite: false
      });

      const refs = {
        wheels,
        tailLightMat,
        underglowMat
      };
      group.userData = Object.assign({}, group.userData, refs);
      return Object.assign({ group, refs }, refs);
    },

    /**
     * 4. Build Sculpted Maverick Police Helicopter (~14 meshes total)
     * Aerodynamic beveled ExtrudeGeometry hull, cockpit canopy, white tail markings,
     * motion-blur rotors, gimbal searchlight & soft searchlight cone.
     * @param {THREE.Texture} envMap
     */
    buildPoliceHelicopter(envMap) {
      const THREE = window.THREE;
      const textures = this.getTextures();
      const group = new THREE.Group();
      group.name = 'ViceCityPoliceHelicopterGroup';

      const darkNavyMetal = createStdMat(
        THREE,
        {
          color: 0x0b0f19,
          metalness: 0.72,
          roughness: 0.24,
          envMapIntensity: 1.4
        },
        envMap
      );
      const whiteStripeMat = createStdMat(
        THREE,
        {
          color: 0xf8fafc,
          metalness: 0.3,
          roughness: 0.22
        },
        envMap
      );
      const canopyGlass = createStdMat(
        THREE,
        {
          color: 0x0f1c2e,
          metalness: 0.92,
          roughness: 0.06,
          transparent: true,
          opacity: 0.82,
          envMapIntensity: 1.75
        },
        envMap
      );

      // 1. Merged Aerodynamic Maverick Fuselage + Horizontal Stabilizer + Tubular Skids (1 draw call!)
      const hullParts = [
        createHeliFuselageGeometry(THREE),
        bakeGeo(new THREE.BoxGeometry(1.52, 0.06, 0.36), 0, 0.24, -4.15)
      ];
      [-0.74, 0.74].forEach((sx) => {
        hullParts.push(bakeGeo(new THREE.CylinderGeometry(0.044, 0.044, 3.4, 12), sx, -1.04, 0.2, Math.PI / 2, 0, 0));
        [-0.52, 0.82].forEach((sz) => {
          hullParts.push(
            bakeGeo(
              new THREE.CylinderGeometry(0.032, 0.032, 0.64, 10),
              sx * 0.9,
              -0.73,
              sz,
              0,
              0,
              sx > 0 ? -0.22 : 0.22
            )
          );
        });
      });
      group.add(new THREE.Mesh(mergeGeometries(THREE, hullParts), darkNavyMetal));

      // 2. Dark Tinted Wrap-Around Cockpit Bubble Canopy (+Z nose)
      const cockpitCanopy = new THREE.Mesh(new THREE.SphereGeometry(0.88, 22, 18), canopyGlass);
      cockpitCanopy.scale.set(0.88, 0.72, 1.32);
      cockpitCanopy.position.set(0, -0.02, 1.48);
      group.add(cockpitCanopy);

      // 3. Merged White Tail Boom Band & Vertical Fin Stripe (1 draw call)
      const whiteParts = [
        bakeGeo(new THREE.CylinderGeometry(0.22, 0.25, 0.56, 16), 0, 0.22, -3.1, Math.PI / 2, 0, 0),
        bakeGeo(new THREE.BoxGeometry(0.28, 0.22, 0.68), 0, 0.94, -4.82, -0.22, 0, 0)
      ];
      group.add(new THREE.Mesh(mergeGeometries(THREE, whiteParts), whiteStripeMat));

      // 4. Main Rotor Assembly + Motion-Blur Disc
      const mainRotor = new THREE.Group();
      mainRotor.position.set(0, 1.0, 0.05);
      group.add(mainRotor);

      const bladeMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.65, roughness: 0.3 });
      const bladesGeo = mergeGeometries(THREE, [
        bakeGeo(new THREE.CylinderGeometry(0.15, 0.19, 0.24, 14), 0, -0.04, 0),
        bakeGeo(new THREE.BoxGeometry(8.4, 0.03, 0.24)),
        bakeGeo(new THREE.BoxGeometry(0.24, 0.03, 8.4))
      ]);
      mainRotor.add(new THREE.Mesh(bladesGeo, bladeMat));

      const blurDiscMat = new THREE.MeshBasicMaterial({
        map: textures.rotorBlur || null,
        color: 0xe2e8f0,
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const mainBlurDisc = new THREE.Mesh(new THREE.CircleGeometry(4.2, 28), blurDiscMat);
      mainBlurDisc.rotation.x = -Math.PI / 2;
      mainRotor.add(mainBlurDisc);

      // 5. Tail Rotor Assembly + Motion-Blur Disc
      const tailRotor = new THREE.Group();
      tailRotor.position.set(0.24, 0.72, -4.86);
      group.add(tailRotor);

      const tailBladesGeo = mergeGeometries(THREE, [
        bakeGeo(new THREE.BoxGeometry(0.035, 1.45, 0.14)),
        bakeGeo(new THREE.BoxGeometry(0.035, 0.14, 1.45))
      ]);
      tailRotor.add(new THREE.Mesh(tailBladesGeo, bladeMat));

      const tailBlurDisc = new THREE.Mesh(new THREE.CircleGeometry(0.72, 18), blurDiscMat);
      tailBlurDisc.rotation.y = Math.PI / 2;
      tailRotor.add(tailBlurDisc);

      // 6. Red & Blue Belly Beacon Strobes
      const redStrobeMat = new THREE.MeshBasicMaterial({ color: 0xff1e27 });
      const blueStrobeMat = new THREE.MeshBasicMaterial({ color: 0x0088ff });

      const redLight = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), redStrobeMat);
      redLight.position.set(-0.38, -0.74, 0.45);
      group.add(redLight);

      const blueLight = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), blueStrobeMat);
      blueLight.position.set(0.38, -0.74, 0.45);
      group.add(blueLight);

      // 7. Under-Nose Gimbal Searchlight Housing + Soft Searchlight Cone
      const gimbal = new THREE.Group();
      gimbal.position.set(0, -0.64, 1.45);
      group.add(gimbal);

      const gimbalHousing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.2, 0.32, 16),
        darkNavyMetal
      );
      gimbalHousing.rotation.x = Math.PI / 2;
      gimbal.add(gimbalHousing);

      const gimbalLens = new THREE.Mesh(
        new THREE.CircleGeometry(0.15, 14),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      gimbalLens.position.set(0, 0, 0.17);
      gimbal.add(gimbalLens);

      const coneGeo = new THREE.ConeGeometry(4.2, 18.5, 22, 1, true);
      coneGeo.translate(0, -9.25, 0);
      const lightCone = new THREE.Mesh(
        coneGeo,
        new THREE.MeshBasicMaterial({
          color: 0xeef6ff,
          transparent: true,
          opacity: 0.14,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      lightCone.position.set(0, -0.64, 1.45);
      group.add(lightCone);

      const spotLight = new THREE.SpotLight(0xeef6ff, 2.6, 54, Math.PI / 6, 0.52, 1.0);
      spotLight.position.set(0, -0.64, 1.45);
      group.add(spotLight);

      const refs = {
        mainRotor,
        tailRotor,
        spotLight,
        lightCone,
        searchlightCone: lightCone,
        gimbal,
        redLight,
        blueLight,
        redStrobeMat,
        blueStrobeMat
      };

      group.userData = Object.assign({}, group.userData, refs);
      return Object.assign({ group, refs }, refs);
    }
  };

  if (typeof window !== 'undefined') {
    window.GT6Models = GT6Models;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = GT6Models;
  }
})();
