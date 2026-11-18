/**
 * GT6 RAFA: FUGA DE VICE CITY (EDTECH PT-13 EDITION)
 * Realistic 3D Character & Vehicle Modeling Suite (Three.js r128)
 * Faithful to reference video (WhatsApp Video 2026-11-18 at 15.13.43.mp4) & poster (assets/rafa-poster.jpg)
 * Attach: window.GT6Models
 */
(function () {
  'use strict';

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

  // Create PBR Material utilizing MeshPhysicalMaterial when available (for clearcoat) or MeshStandardMaterial
  function createPBRMaterial(THREE, params, envMap) {
    const isPhysical =
      typeof THREE.MeshPhysicalMaterial === 'function' &&
      (params.clearcoat !== undefined || params.transmission !== undefined);
    const MatClass = isPhysical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    const cleanParams = Object.assign({}, params);
    if (!isPhysical) {
      delete cleanParams.clearcoat;
      delete cleanParams.clearcoatRoughness;
      delete cleanParams.reflectivity;
      delete cleanParams.transmission;
    }
    if (envMap && cleanParams.envMap === undefined) {
      cleanParams.envMap = envMap;
    }
    if (cleanParams.envMapIntensity === undefined) {
      cleanParams.envMapIntensity = 1.25;
    }
    return new MatClass(cleanParams);
  }

  // Draw the signature 8-tooth EDTECH mechanical gear + "EDTECH" typography
  function drawEdtechGearLogo(ctx, cx, cy, outerRadius, darkBgHex, allWhiteText) {
    ctx.save();
    ctx.translate(cx, cy);

    // 8 mechanical gear teeth
    ctx.fillStyle = '#f8fafc';
    const toothW = outerRadius * 0.36;
    const toothH = outerRadius * 0.34;
    for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 4);
      fillRoundRect(ctx, -toothW / 2, -outerRadius * 1.22, toothW, toothH, 4);
      ctx.restore();
    }

    // Gear outer ring
    ctx.beginPath();
    ctx.arc(0, 0, outerRadius, 0, Math.PI * 2);
    ctx.fill();

    // Inner gear hole
    ctx.fillStyle = darkBgHex || '#0b0c10';
    ctx.beginPath();
    ctx.arc(0, 0, outerRadius * 0.65, 0, Math.PI * 2);
    ctx.fill();

    // Horizontal banner across gear center for "EDTECH"
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

  const GT6Models = {
    _textures: null,

    /**
     * Build and cache high-resolution procedural canvas textures for all 3D models
     */
    getTextures() {
      if (this._textures) return this._textures;
      const THREE = typeof window !== 'undefined' ? window.THREE : null;
      if (!THREE || typeof document === 'undefined') {
        return {};
      }

      const textures = {};

      // Helper to configure anisotropy & wrapping
      const finalizeTex = (canvas, repeatX = 1, repeatY = 1) => {
        const tex = new THREE.CanvasTexture(canvas);
        if (repeatX > 1 || repeatY > 1) {
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          tex.repeat.set(repeatX, repeatY);
        }
        tex.anisotropy = 8;
        tex.needsUpdate = true;
        return tex;
      };

      // 1. Realistic Black Rubber Fat-Tire Tread Diffuse & Bump Map (512x512)
      const treadCanvas = document.createElement('canvas');
      treadCanvas.width = 512;
      treadCanvas.height = 512;
      const tctx = treadCanvas.getContext('2d');
      if (tctx) {
        tctx.fillStyle = '#141619';
        tctx.fillRect(0, 0, 512, 512);

        // Circumferential drainage channels
        tctx.fillStyle = '#090a0c';
        tctx.fillRect(150, 0, 14, 512);
        tctx.fillRect(249, 0, 14, 512);
        tctx.fillRect(348, 0, 14, 512);

        // Realistic V-pattern fat-tire street tread blocks
        for (let y = -32; y < 544; y += 28) {
          tctx.strokeStyle = '#1f2329';
          tctx.lineWidth = 13;
          tctx.lineCap = 'round';
          tctx.beginPath();
          tctx.moveTo(24, y + 20);
          tctx.lineTo(256, y);
          tctx.lineTo(488, y + 20);
          tctx.stroke();

          // Sipe groove shadow
          tctx.strokeStyle = '#08090b';
          tctx.lineWidth = 6;
          tctx.beginPath();
          tctx.moveTo(24, y + 29);
          tctx.lineTo(256, y + 9);
          tctx.lineTo(488, y + 29);
          tctx.stroke();
        }
      }
      textures.tireTread = finalizeTex(treadCanvas, 1, 3);
      textures.tireBump = textures.tireTread;

      // 2. Silver Cross-Drilled Metallic Brake Disc Texture (512x512)
      const discCanvas = document.createElement('canvas');
      discCanvas.width = 512;
      discCanvas.height = 512;
      const dctx = discCanvas.getContext('2d');
      if (dctx) {
        dctx.clearRect(0, 0, 512, 512);
        const cx = 256;
        const cy = 256;

        // Outer stainless steel rotor ring
        dctx.fillStyle = '#d8e0ea';
        dctx.beginPath();
        dctx.arc(cx, cy, 240, 0, Math.PI * 2);
        dctx.fill();

        // Brushed concentric rotor wear tracks
        for (let r = 136; r < 236; r += 5) {
          dctx.strokeStyle = r % 10 === 0 ? '#9aa6b5' : '#e2e8f0';
          dctx.lineWidth = 2;
          dctx.beginPath();
          dctx.arc(cx, cy, r, 0, Math.PI * 2);
          dctx.stroke();
        }

        // Inner dark carrier hub
        dctx.fillStyle = '#15181f';
        dctx.beginPath();
        dctx.arc(cx, cy, 130, 0, Math.PI * 2);
        dctx.fill();

        // Silver carrier ring accent
        dctx.strokeStyle = '#94a3b8';
        dctx.lineWidth = 6;
        dctx.beginPath();
        dctx.arc(cx, cy, 124, 0, Math.PI * 2);
        dctx.stroke();

        // Cross-drilled ventilation holes
        dctx.fillStyle = '#090a0e';
        for (let i = 0; i < 24; i++) {
          const baseAngle = (i * Math.PI * 2) / 24;
          [154, 186, 216].forEach((radius, idx) => {
            const a = baseAngle + idx * 0.06;
            dctx.beginPath();
            dctx.arc(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, 7, 0, Math.PI * 2);
            dctx.fill();
          });
        }

        // Silver mounting bobbins
        dctx.fillStyle = '#e2e8f0';
        for (let i = 0; i < 10; i++) {
          const a = (i * Math.PI * 2) / 10;
          dctx.beginPath();
          dctx.arc(cx + Math.cos(a) * 128, cy + Math.sin(a) * 128, 7.5, 0, Math.PI * 2);
          dctx.fill();
        }
      }
      textures.discBrake = finalizeTex(discCanvas);

      // 3. Front Swept Automotive Red Fender with White Lightning Bolt Decal (512x512)
      const fenderCanvas = document.createElement('canvas');
      fenderCanvas.width = 512;
      fenderCanvas.height = 512;
      const fctx = fenderCanvas.getContext('2d');
      if (fctx) {
        fctx.fillStyle = '#c4121a';
        fctx.fillRect(0, 0, 512, 512);

        // Crisp white side pinstripes & lightning bolt decal matching poster & video (0:00-0:03)
        fctx.fillStyle = '#f8fafc';
        fctx.fillRect(30, 0, 10, 512);
        fctx.fillRect(472, 0, 10, 512);

        fctx.beginPath();
        fctx.moveTo(274, 38);
        fctx.lineTo(178, 240);
        fctx.lineTo(252, 240);
        fctx.lineTo(204, 472);
        fctx.lineTo(338, 224);
        fctx.lineTo(258, 224);
        fctx.closePath();
        fctx.fill();
      }
      textures.fenderLightning = finalizeTex(fenderCanvas);

      // 4. Rear Automotive Red Fender with White Side Trim Stripe (512x512)
      const rearFenderCanvas = document.createElement('canvas');
      rearFenderCanvas.width = 512;
      rearFenderCanvas.height = 512;
      const rfctx = rearFenderCanvas.getContext('2d');
      if (rfctx) {
        rfctx.fillStyle = '#c4121a';
        rfctx.fillRect(0, 0, 512, 512);

        // Clean white curved side trim stripes along fender edges (matching poster & 0:03-0:05)
        rfctx.fillStyle = '#f8fafc';
        rfctx.fillRect(26, 36, 12, 440);
        rfctx.fillRect(474, 36, 12, 440);
      }
      textures.rearFenderStripe = finalizeTex(rearFenderCanvas);

      // 5. Glossy Black Under-Seat "EDTECH" Battery Box Texture (512x512 - NO sci-fi cyan bars)
      const batCanvas = document.createElement('canvas');
      batCanvas.width = 512;
      batCanvas.height = 512;
      const bctx = batCanvas.getContext('2d');
      if (bctx) {
        bctx.fillStyle = '#0b0d12';
        bctx.fillRect(0, 0, 512, 512);

        // Subtle dark metallic panel bevel border
        bctx.strokeStyle = '#1f2430';
        bctx.lineWidth = 10;
        strokeRoundRect(bctx, 18, 18, 476, 476, 28);

        // Top glossy automotive red trim edge under the seat
        bctx.fillStyle = '#c4121a';
        fillRoundRect(bctx, 24, 24, 464, 42, 12);

        // Center White 8-Tooth Gear + Red/White "EDTECH" Logo (matching poster & video 0:00-0:04)
        drawEdtechGearLogo(bctx, 256, 268, 112, '#0b0d12', false);
      }
      textures.edtechBattery = finalizeTex(batCanvas);

      // 6. Sleek Handlebar Digital Speedometer LCD Screen (512x256)
      const dashCanvas = document.createElement('canvas');
      dashCanvas.width = 512;
      dashCanvas.height = 256;
      const dshCtx = dashCanvas.getContext('2d');
      if (dshCtx) {
        dshCtx.fillStyle = '#070a10';
        dshCtx.fillRect(0, 0, 512, 256);

        dshCtx.strokeStyle = '#262d3d';
        dshCtx.lineWidth = 10;
        strokeRoundRect(dshCtx, 8, 8, 496, 240, 22);

        dshCtx.fillStyle = '#e2e8f0';
        dshCtx.font = '900 72px "Arial Black", Impact, sans-serif';
        dshCtx.textAlign = 'center';
        dshCtx.textBaseline = 'middle';
        dshCtx.fillText('188', 256, 110);

        dshCtx.fillStyle = '#60a5fa';
        dshCtx.font = 'bold 26px Arial, sans-serif';
        dshCtx.fillText('KM/H • EDTECH PT-13', 256, 188);
      }
      textures.digitalDash = finalizeTex(dashCanvas);

      // 7. Rafa's Black Matte-Leather Jacket BACK Texture ("PT 13 / EDTECH" in crisp white - 0:05-0:07 in video!)
      const jacketBackCanvas = document.createElement('canvas');
      jacketBackCanvas.width = 512;
      jacketBackCanvas.height = 512;
      const jbctx = jacketBackCanvas.getContext('2d');
      if (jbctx) {
        // Rich dark matte-leather base
        jbctx.fillStyle = '#111318';
        jbctx.fillRect(0, 0, 512, 512);

        // Subtle leather panel seams & shoulder yoke stitching
        jbctx.strokeStyle = '#1e222b';
        jbctx.lineWidth = 5;
        strokeRoundRect(jbctx, 16, 16, 480, 480, 20);
        jbctx.beginPath();
        jbctx.moveTo(16, 118);
        jbctx.quadraticCurveTo(256, 138, 496, 118);
        jbctx.stroke();

        // Vertical side panel seams
        jbctx.beginPath();
        jbctx.moveTo(86, 122);
        jbctx.lineTo(108, 496);
        jbctx.moveTo(426, 122);
        jbctx.lineTo(404, 496);
        jbctx.stroke();

        // Subtle dark embossed shadow for legibility
        jbctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
        jbctx.shadowBlur = 8;
        jbctx.shadowOffsetY = 3;

        // Upper Back: Large Crisp White "PT 13" (matches 0:05-0:07 in video!)
        jbctx.fillStyle = '#f8fafc';
        jbctx.font = '900 104px "Arial Black", Impact, sans-serif';
        jbctx.textAlign = 'center';
        jbctx.textBaseline = 'middle';
        jbctx.fillText('PT 13', 256, 195);

        // Right below "PT 13": Crisp White "EDTECH" + subtle gear crest (matches 0:05-0:07 in video!)
        jbctx.font = '900 62px "Arial Black", Impact, sans-serif';
        jbctx.fillStyle = '#f1f5f9';
        jbctx.fillText('EDTECH', 256, 286);
        jbctx.shadowBlur = 0;
        jbctx.shadowOffsetY = 0;

        // Subtle lower-back EDTECH mechanical gear emblem
        drawEdtechGearLogo(jbctx, 256, 396, 56, '#111318', false);
      }
      textures.jacketBack = finalizeTex(jacketBackCanvas);

      // 8. Rafa's Black Matte-Leather Jacket FRONT Chest Texture (Red "PT 13" right chest patch + "EDTECH" left chest gear logo - 0:00-0:03 & poster!)
      const jacketFrontCanvas = document.createElement('canvas');
      jacketFrontCanvas.width = 512;
      jacketFrontCanvas.height = 512;
      const jfctx = jacketFrontCanvas.getContext('2d');
      if (jfctx) {
        jfctx.fillStyle = '#111318';
        jfctx.fillRect(0, 0, 512, 512);

        // Subtle red leather piping along shoulder yoke & chest seams (matching poster & 0:00-0:03)
        jfctx.strokeStyle = '#b91c24';
        jfctx.lineWidth = 5;
        jfctx.beginPath();
        jfctx.moveTo(16, 108);
        jfctx.lineTo(496, 108);
        jfctx.stroke();

        // Center metallic zipper track
        jfctx.fillStyle = '#262b36';
        jfctx.fillRect(248, 0, 16, 512);
        jfctx.fillStyle = '#94a3b8';
        for (let zy = 8; zy < 504; zy += 10) {
          jfctx.fillRect(251, zy, 10, 5);
        }

        // Chest pocket flaps & seams below the logos
        jfctx.strokeStyle = '#1f232d';
        jfctx.lineWidth = 4;
        strokeRoundRect(jfctx, 44, 240, 174, 150, 10);
        strokeRoundRect(jfctx, 294, 240, 174, 150, 10);
        jfctx.strokeStyle = '#991b1b';
        jfctx.lineWidth = 3;
        strokeRoundRect(jfctx, 44, 236, 174, 38, 6);
        strokeRoundRect(jfctx, 294, 236, 174, 38, 6);

        // Silver snap buttons on chest pockets
        jfctx.fillStyle = '#cbd5e1';
        jfctx.beginPath();
        jfctx.arc(131, 258, 7, 0, Math.PI * 2);
        jfctx.arc(381, 258, 7, 0, Math.PI * 2);
        jfctx.fill();

        // RIGHT CHEST (viewer left, x = 44..220): Red "PT 13" Patch (matching 0:00-0:03 & poster!)
        jfctx.fillStyle = '#c4121a';
        fillRoundRect(jfctx, 46, 146, 170, 68, 8);
        jfctx.strokeStyle = '#f8fafc';
        jfctx.lineWidth = 3;
        strokeRoundRect(jfctx, 51, 151, 160, 58, 6);
        jfctx.fillStyle = '#ffffff';
        jfctx.font = '900 44px "Arial Black", Impact, sans-serif';
        jfctx.textAlign = 'center';
        jfctx.textBaseline = 'middle';
        jfctx.fillText('PT 13', 131, 182);

        // LEFT CHEST (viewer right, x = 292..468): White 8-Tooth Gear + "EDTECH" Logo (matching 0:00-0:03 & poster!)
        drawEdtechGearLogo(jfctx, 381, 176, 48, '#111318', false);
      }
      textures.jacketFront = finalizeTex(jacketFrontCanvas);

      // 9. Round Multi-LED Halo Headlight Internal Reflector Face Texture (512x512 - matches 0:00-0:04 & poster)
      const hlCanvas = document.createElement('canvas');
      hlCanvas.width = 512;
      hlCanvas.height = 512;
      const hctx = hlCanvas.getContext('2d');
      if (hctx) {
        hctx.fillStyle = '#090b10';
        hctx.fillRect(0, 0, 512, 512);
        const cx = 256;
        const cy = 256;

        // Dark metallic reflector bowl
        const bowlGrad = hctx.createRadialGradient(cx, cy, 20, cx, cy, 240);
        bowlGrad.addColorStop(0, '#1e2430');
        bowlGrad.addColorStop(0.75, '#0d1017');
        bowlGrad.addColorStop(1, '#050608');
        hctx.fillStyle = bowlGrad;
        hctx.beginPath();
        hctx.arc(cx, cy, 240, 0, Math.PI * 2);
        hctx.fill();

        // Outer glowing Angel-Eye Halo Ring (warm/cool white LED tube)
        hctx.strokeStyle = '#f8fafc';
        hctx.lineWidth = 26;
        hctx.shadowColor = '#e0f2fe';
        hctx.shadowBlur = 18;
        hctx.beginPath();
        hctx.arc(cx, cy, 208, 0, Math.PI * 2);
        hctx.stroke();
        hctx.shadowBlur = 0;

        // Horizontal chrome divider bars for the dual-row multi-LED projector array
        hctx.fillStyle = '#94a3b8';
        fillRoundRect(hctx, 88, 152, 336, 82, 40);
        fillRoundRect(hctx, 104, 278, 304, 78, 38);

        hctx.fillStyle = '#0f131a';
        fillRoundRect(hctx, 96, 158, 320, 70, 34);
        fillRoundRect(hctx, 112, 284, 288, 66, 32);

        // Top row of 4 bright LED projector emitters & bottom row of 3 bright LED emitters
        const topXs = [142, 218, 294, 370];
        topXs.forEach((lx) => {
          const g = hctx.createRadialGradient(lx, 193, 4, lx, 193, 30);
          g.addColorStop(0, '#ffffff');
          g.addColorStop(0.55, '#fffbeb');
          g.addColorStop(1, 'rgba(224, 242, 254, 0)');
          hctx.fillStyle = g;
          hctx.beginPath();
          hctx.arc(lx, 193, 30, 0, Math.PI * 2);
          hctx.fill();
        });

        const botXs = [168, 256, 344];
        botXs.forEach((lx) => {
          const g = hctx.createRadialGradient(lx, 317, 4, lx, 317, 28);
          g.addColorStop(0, '#ffffff');
          g.addColorStop(0.55, '#e0f2fe');
          g.addColorStop(1, 'rgba(224, 242, 254, 0)');
          hctx.fillStyle = g;
          hctx.beginPath();
          hctx.arc(lx, 317, 28, 0, Math.PI * 2);
          hctx.fill();
        });
      }
      textures.headlightFace = finalizeTex(hlCanvas);

      // 10. Realistic Black-and-White Police Sedan Side Livery ("POLICE" - matches 0:02-0:09 in video!)
      const policeCanvas = document.createElement('canvas');
      policeCanvas.width = 512;
      policeCanvas.height = 256;
      const pctx = policeCanvas.getContext('2d');
      if (pctx) {
        // Deep glossy black front fender & rear quarter panel
        pctx.fillStyle = '#090b10';
        pctx.fillRect(0, 0, 512, 256);

        // Crisp white front & rear doors in center section
        pctx.fillStyle = '#f8fafc';
        pctx.fillRect(104, 0, 304, 232);

        // Lower black rocker sill
        pctx.fillStyle = '#090b10';
        pctx.fillRect(0, 224, 512, 32);

        // Subtle door seam line & door handles
        pctx.strokeStyle = '#cbd5e1';
        pctx.lineWidth = 3;
        pctx.beginPath();
        pctx.moveTo(256, 8);
        pctx.lineTo(256, 224);
        pctx.stroke();

        // Silver/Gold Police Shield Badge on front fender/door
        pctx.fillStyle = '#eab308';
        pctx.beginPath();
        pctx.arc(62, 96, 26, 0, Math.PI * 2);
        pctx.fill();
        pctx.strokeStyle = '#fef08a';
        pctx.lineWidth = 3;
        pctx.stroke();

        // Bold Black "POLICE" block lettering across the white doors (matching 0:03-0:09 in video!)
        pctx.fillStyle = '#090b10';
        pctx.font = '900 76px "Arial Black", Impact, sans-serif';
        pctx.textAlign = 'center';
        pctx.textBaseline = 'middle';
        pctx.fillText('POLICE', 256, 108);

        // Crisp dark sub-label
        pctx.fillStyle = '#1e293b';
        pctx.font = 'bold 20px Arial, sans-serif';
        pctx.fillText('INTERCEPTOR • 911', 256, 168);
      }
      textures.policeDoor = finalizeTex(policeCanvas);

      // 11. SWAT Tactical BearCat Side Decal (512x256)
      const swatCanvas = document.createElement('canvas');
      swatCanvas.width = 512;
      swatCanvas.height = 256;
      const sctx = swatCanvas.getContext('2d');
      if (sctx) {
        sctx.fillStyle = '#090b10';
        sctx.fillRect(0, 0, 512, 256);

        sctx.fillStyle = '#f1f5f9';
        sctx.font = '900 78px "Arial Black", Impact, sans-serif';
        sctx.textAlign = 'center';
        sctx.textBaseline = 'middle';
        sctx.fillText('POLICE', 256, 98);

        sctx.fillStyle = '#94a3b8';
        sctx.font = 'bold 24px Arial, sans-serif';
        sctx.fillText('S.W.A.T. TACTICAL UNIT', 256, 158);
      }
      textures.swatDoor = finalizeTex(swatCanvas);

      // 12. Helicopter Translucent Motion-Blur Rotor Disc Texture (512x512)
      const rotorCanvas = document.createElement('canvas');
      rotorCanvas.width = 512;
      rotorCanvas.height = 512;
      const rctx = rotorCanvas.getContext('2d');
      if (rctx) {
        rctx.clearRect(0, 0, 512, 512);
        const cx = 256;
        const cy = 256;

        // Soft motion-blur disc wash
        const discGrad = rctx.createRadialGradient(cx, cy, 18, cx, cy, 248);
        discGrad.addColorStop(0, 'rgba(148, 163, 184, 0.25)');
        discGrad.addColorStop(0.7, 'rgba(203, 213, 225, 0.14)');
        discGrad.addColorStop(0.95, 'rgba(241, 245, 249, 0.28)');
        discGrad.addColorStop(1, 'rgba(241, 245, 249, 0)');
        rctx.fillStyle = discGrad;
        rctx.beginPath();
        rctx.arc(cx, cy, 248, 0, Math.PI * 2);
        rctx.fill();

        // Outer rotor tip ring
        rctx.strokeStyle = 'rgba(226, 232, 240, 0.32)';
        rctx.lineWidth = 6;
        rctx.beginPath();
        rctx.arc(cx, cy, 242, 0, Math.PI * 2);
        rctx.stroke();

        // 4 Swept blade blur wedges
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          rctx.fillStyle = 'rgba(203, 213, 225, 0.18)';
          rctx.beginPath();
          rctx.moveTo(cx, cy);
          rctx.arc(cx, cy, 244, a - 0.2, a + 0.2);
          rctx.closePath();
          rctx.fill();
        }
      }
      textures.rotorBlur = finalizeTex(rotorCanvas);

      this._textures = textures;
      return textures;
    },

    /**
     * Build a High-Polygon Realistic Fat-Tire Chopper Wheel Assembly
     * Wide black rubber fat tire (#141619, roughness 0.65), rounded sidewalls,
     * satin-black deep-dish alloy rim, and silver cross-drilled disc brake rotor
     */
    _buildFatChopperWheel(isFront, mats, textures) {
      const THREE = window.THREE;
      const wheelGroup = new THREE.Group();

      const tireMat = createPBRMaterial(
        THREE,
        {
          color: 0xffffff,
          map: textures.tireTread || null,
          bumpMap: textures.tireBump || null,
          bumpScale: 0.03,
          roughness: 0.65,
          metalness: 0.08
        },
        mats.envMap
      );

      const sidewallMat = createPBRMaterial(
        THREE,
        {
          color: 0x141619,
          roughness: 0.65,
          metalness: 0.08
        },
        mats.envMap
      );

      // 1. Extra-Wide Fat Tire Center Tread Cylinder (36 radial segments)
      const width = isFront ? 0.44 : 0.52;
      const radius = 0.44;
      const treadCyl = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, width, 36, 1, false),
        tireMat
      );
      treadCyl.rotation.z = Math.PI / 2;
      treadCyl.castShadow = true;
      treadCyl.receiveShadow = true;
      wheelGroup.add(treadCyl);

      // 2. Dual Rounded Tire Sidewall Toruses (36 tubular segments)
      const sideOffset = width * 0.45;
      [-sideOffset, sideOffset].forEach((sx) => {
        const sidewall = new THREE.Mesh(
          new THREE.TorusGeometry(radius - 0.085, 0.092, 18, 36),
          sidewallMat
        );
        sidewall.rotation.y = Math.PI / 2;
        sidewall.position.x = sx;
        wheelGroup.add(sidewall);

        // Satin-black deep-dish alloy rim lip with subtle machined edge
        const rimLip = new THREE.Mesh(
          new THREE.TorusGeometry(0.268, 0.018, 14, 32),
          mats.darkAlloy
        );
        rimLip.rotation.y = Math.PI / 2;
        rimLip.position.x = sx * 1.02;
        wheelGroup.add(rimLip);
      });

      // 3. Deep-Dish Satin Black Alloy Wheel Barrel (32 segments)
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.265, 0.265, width + 0.02, 32),
        mats.darkAlloy
      );
      barrel.rotation.z = Math.PI / 2;
      wheelGroup.add(barrel);

      // 4. Five-Spoke Heavy Alloy Wheel Hub + Center Axle Cap
      for (let i = 0; i < 5; i++) {
        const angle = (i * Math.PI * 2) / 5;
        const spoke = new THREE.Mesh(
          new THREE.BoxGeometry(width * 0.86, 0.055, 0.25),
          mats.darkAlloy
        );
        spoke.rotation.x = angle;
        wheelGroup.add(spoke);
      }

      const centerHub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, width + 0.07, 24),
        mats.chrome
      );
      centerHub.rotation.z = Math.PI / 2;
      wheelGroup.add(centerHub);

      // 5. Silver Cross-Drilled Metallic Brake Disc Rotor
      const rotorMat = createPBRMaterial(
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
      const rotorSideX = isFront ? -(width * 0.54) : width * 0.54;
      const rotorMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.31, 0.31, 0.016, 32),
        rotorMat
      );
      rotorMesh.rotation.z = Math.PI / 2;
      rotorMesh.position.x = rotorSideX;
      wheelGroup.add(rotorMesh);

      return wheelGroup;
    },

    /**
     * 1. Build Rafa & His Red Fat-Tire Electric Chopper (EDTECH / PT 13)
     * Faithful to the reference video (0:00-0:09) and poster (assets/rafa-poster.jpg).
     * @param {THREE.Texture} envMap
     * @returns {{ group: THREE.Group, refs: Object }}
     */
    buildRafaAndChopper(envMap) {
      const THREE = window.THREE;
      const textures = this.getTextures();
      const group = new THREE.Group();
      group.name = 'RafaAndChopperGroup';

      // Shared Physically-Based Materials
      const mats = {
        envMap,
        // Deep glossy automotive red (#c4121a) for tubular frame & fenders
        candyRed: createPBRMaterial(
          THREE,
          {
            color: 0xc4121a,
            emissive: 0x1a0103,
            metalness: 0.55,
            roughness: 0.16,
            clearcoat: 1.0,
            clearcoatRoughness: 0.06,
            envMapIntensity: 1.45
          },
          envMap
        ),
        fenderLightning: createPBRMaterial(
          THREE,
          {
            color: 0xffffff,
            map: textures.fenderLightning || null,
            metalness: 0.55,
            roughness: 0.16,
            clearcoat: 1.0,
            clearcoatRoughness: 0.06,
            envMapIntensity: 1.45
          },
          envMap
        ),
        rearFenderMat: createPBRMaterial(
          THREE,
          {
            color: 0xffffff,
            map: textures.rearFenderStripe || null,
            metalness: 0.55,
            roughness: 0.16,
            clearcoat: 1.0,
            clearcoatRoughness: 0.06,
            envMapIntensity: 1.45
          },
          envMap
        ),
        chrome: createPBRMaterial(
          THREE,
          {
            color: 0xe2e8f0,
            metalness: 0.94,
            roughness: 0.09,
            clearcoat: 1.0,
            clearcoatRoughness: 0.05,
            envMapIntensity: 1.65
          },
          envMap
        ),
        // Satin/gloss black steel for handlebars, lower forks, mirrors, sissy bar & frame hardware
        blackSteel: createPBRMaterial(
          THREE,
          {
            color: 0x12141a,
            metalness: 0.68,
            roughness: 0.24,
            clearcoat: 0.65,
            clearcoatRoughness: 0.18,
            envMapIntensity: 1.25
          },
          envMap
        ),
        darkAlloy: createPBRMaterial(
          THREE,
          {
            color: 0x151820,
            metalness: 0.72,
            roughness: 0.28,
            envMapIntensity: 1.2
          },
          envMap
        ),
        rubber: createPBRMaterial(
          THREE,
          {
            color: 0x141619,
            metalness: 0.08,
            roughness: 0.65
          },
          envMap
        ),
        stitchedLeather: createPBRMaterial(
          THREE,
          {
            color: 0x14161d,
            metalness: 0.12,
            roughness: 0.46,
            clearcoat: 0.2,
            clearcoatRoughness: 0.45
          },
          envMap
        ),
        edtechCore: createPBRMaterial(
          THREE,
          {
            color: 0xffffff,
            map: textures.edtechBattery || null,
            metalness: 0.4,
            roughness: 0.18,
            clearcoat: 0.92,
            clearcoatRoughness: 0.1
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
      // A. WIDE BLACK RUBBER FAT TIRES & SILVER DRILLED DISC BRAKES
      // =========================================================================
      const frontWheel = this._buildFatChopperWheel(true, mats, textures);
      frontWheel.position.set(0, 0.44, -1.1);
      group.add(frontWheel);

      const rearWheel = this._buildFatChopperWheel(false, mats, textures);
      rearWheel.position.set(0, 0.44, 1.0);
      group.add(rearWheel);

      // Rear Brake Caliper on Swingarm
      const rearCaliper = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.13, 0.17),
        mats.blackSteel
      );
      rearCaliper.position.set(0.28, 0.62, 0.82);
      group.add(rearCaliper);

      // =========================================================================
      // B. DEEP GLOSSY RED (#c4121a) TUBULAR FRAME, FLOORBOARD & REAR FENDER
      // =========================================================================
      // Sculpted double-cradle tubular rails from steering head down under floorboard to rear axle dropout
      [-0.24, 0.24].forEach((sideX) => {
        const cradleCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(sideX * 0.52, 1.04, -0.74), // Steering head tube
          new THREE.Vector3(sideX * 0.82, 0.62, -0.64), // Swept front downtube
          new THREE.Vector3(sideX, 0.31, -0.46),        // Front floorboard curve
          new THREE.Vector3(sideX, 0.29, 0.44),         // Rear floorboard curve
          new THREE.Vector3(sideX * 1.12, 0.44, 1.0)    // Rear swingarm axle dropout
        ]);
        const cradleTube = new THREE.Mesh(
          new THREE.TubeGeometry(cradleCurve, 32, 0.045, 16, false),
          mats.candyRed
        );
        cradleTube.castShadow = true;
        group.add(cradleTube);

        // Upper subframe tube cradling battery box & seat
        const subCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(sideX * 0.82, 0.64, -0.62),
          new THREE.Vector3(sideX * 0.92, 0.42, -0.25),
          new THREE.Vector3(sideX * 0.96, 0.86, 0.16),
          new THREE.Vector3(sideX * 0.96, 0.92, 0.74)
        ]);
        const subTube = new THREE.Mesh(
          new THREE.TubeGeometry(subCurve, 24, 0.036, 16, false),
          mats.candyRed
        );
        group.add(subTube);
      });

      // Front red aerodynamic neck gusset / fairing shield (matching poster & 0:00-0:03)
      const frontNeckFairing = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.48, 0.18),
        mats.candyRed
      );
      frontNeckFairing.position.set(0, 0.72, -0.66);
      frontNeckFairing.rotation.x = 0.32;
      frontNeckFairing.castShadow = true;
      group.add(frontNeckFairing);

      // Lower deep glossy red belly pan
      const bellyPan = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.12, 1.28),
        mats.candyRed
      );
      bellyPan.position.set(0, 0.27, -0.04);
      bellyPan.castShadow = true;
      group.add(bellyPan);

      // Wide Matte-Black Foot-Platform Floorboard with Longitudinal Grip Strips
      const floorboardBase = new THREE.Mesh(
        new THREE.BoxGeometry(0.54, 0.055, 1.16),
        mats.blackSteel
      );
      floorboardBase.position.set(0, 0.355, -0.04);
      floorboardBase.receiveShadow = true;
      group.add(floorboardBase);

      for (let g = -2; g <= 2; g++) {
        const gripStrip = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 0.016, 0.98),
          mats.rubber
        );
        gripStrip.position.set(g * 0.095, 0.388, -0.04);
        group.add(gripStrip);
      }

      // Black Side Kickstand on Left Frame Rail (folded back for riding, matching poster mount)
      const kickstand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.015, 0.42, 12),
        mats.blackSteel
      );
      kickstand.rotation.x = Math.PI / 2 - 0.18;
      kickstand.rotation.z = 0.25;
      kickstand.position.set(-0.29, 0.26, 0.25);
      group.add(kickstand);

      // Rear Black Coil-Over Suspension Shocks (damper + black helical spring coil)
      [-0.27, 0.27].forEach((sx) => {
        const shockGroup = new THREE.Group();
        shockGroup.position.set(sx, 0.67, 0.76);
        shockGroup.rotation.x = -0.34;

        const damperShaft = new THREE.Mesh(
          new THREE.CylinderGeometry(0.024, 0.024, 0.52, 16),
          mats.chrome
        );
        shockGroup.add(damperShaft);

        const springPoints = [];
        const turns = 7;
        for (let i = 0; i <= 48; i++) {
          const t = i / 48;
          const a = t * Math.PI * 2 * turns;
          springPoints.push(
            new THREE.Vector3(Math.cos(a) * 0.052, (t - 0.5) * 0.42, Math.sin(a) * 0.052)
          );
        }
        const springCurve = new THREE.CatmullRomCurve3(springPoints);
        const springMesh = new THREE.Mesh(
          new THREE.TubeGeometry(springCurve, 48, 0.015, 10, false),
          mats.blackSteel
        );
        shockGroup.add(springMesh);
        group.add(shockGroup);
      });

      // Rear Deep Glossy Red Hugger Fender with White Trim Stripe (32 radial segments)
      const rearFender = new THREE.Mesh(
        new THREE.CylinderGeometry(0.515, 0.515, 0.55, 32, 1, false, 0, Math.PI * 1.08),
        mats.rearFenderMat
      );
      rearFender.rotation.z = Math.PI / 2;
      rearFender.rotation.x = -0.28;
      rearFender.position.set(0, 0.45, 1.0);
      rearFender.castShadow = true;
      group.add(rearFender);

      // Bright Red LED Tail / Brake Light Assembly on Rear Fender (matches 0:05-0:07 in video!)
      const tailLightHousing = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.11, 0.1),
        mats.blackSteel
      );
      tailLightHousing.position.set(0, 0.83, 1.38);
      group.add(tailLightHousing);

      const tailLightBar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.042, 0.042, 0.27, 20),
        mats.tailLightMat
      );
      tailLightBar.rotation.z = Math.PI / 2;
      tailLightBar.position.set(0, 0.83, 1.43);
      group.add(tailLightBar);

      // Rear license plate holder below tail light
      const plateBracket = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.12, 0.02),
        mats.blackSteel
      );
      plateBracket.position.set(0, 0.72, 1.43);
      plateBracket.rotation.x = 0.22;
      group.add(plateBracket);

      // =========================================================================
      // C. GLOSSY BLACK "EDTECH" UNDER-SEAT BATTERY BOX, SEAT & BACKREST
      // =========================================================================
      const batteryMaterials = [
        mats.edtechCore, // right side (+X)
        mats.edtechCore, // left side (-X)
        mats.candyRed,   // glossy red top battery cover under seat
        mats.blackSteel, // bottom
        mats.edtechCore, // rear (+Z)
        mats.edtechCore  // front (-Z)
      ];
      const batteryCore = new THREE.Mesh(
        new THREE.BoxGeometry(0.54, 0.52, 0.62),
        batteryMaterials
      );
      batteryCore.position.set(0, 0.65, 0.36);
      batteryCore.castShadow = true;
      group.add(batteryCore);

      // Contoured Padded Black Leather Stitched Saddle Seat
      const seatBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.31, 0.74, 24),
        mats.stitchedLeather
      );
      seatBase.rotation.x = Math.PI / 2;
      seatBase.scale.set(1.02, 0.36, 1.0);
      seatBase.position.set(0, 0.98, 0.38);
      group.add(seatBase);

      // Black Steel Passenger Sissy-Bar Upright Struts + Wide Padded Backrest Cushion (0:03-0:07 & poster)
      [-0.14, 0.14].forEach((sx) => {
        const sissyBar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.022, 0.026, 0.42, 16),
          mats.blackSteel
        );
        sissyBar.position.set(sx, 1.19, 0.75);
        sissyBar.rotation.x = -0.18;
        group.add(sissyBar);
      });
      const backrestCushion = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.14, 0.46, 24),
        mats.stitchedLeather
      );
      backrestCushion.rotation.z = Math.PI / 2;
      backrestCushion.scale.set(1.0, 0.68, 1.0);
      backrestCushion.position.set(0, 1.35, 0.79);
      group.add(backrestCushion);

      // Hidden-by-default Nitro Boost Flame Cones (visible = false unless isBoosting / isNitro is active!)
      const nitroFlames = [];
      let nitroFlameLeft = null;
      let nitroFlameRight = null;

      [-0.2, 0.2].forEach((tx, idx) => {
        const outerFlameGeo = new THREE.ConeGeometry(0.09, 0.75, 16);
        outerFlameGeo.rotateX(Math.PI / 2);
        const outerFlameMat = new THREE.MeshBasicMaterial({
          color: 0xff6600,
          transparent: true,
          opacity: 0.0,
          depthWrite: false
        });
        const outerFlame = new THREE.Mesh(outerFlameGeo, outerFlameMat);
        outerFlame.position.set(tx, 0.54, 1.55);
        outerFlame.visible = false;

        const innerFlameGeo = new THREE.ConeGeometry(0.045, 0.5, 12);
        innerFlameGeo.rotateX(Math.PI / 2);
        const innerFlameMat = new THREE.MeshBasicMaterial({
          color: 0xfffbeb,
          transparent: true,
          opacity: 0.85,
          depthWrite: false
        });
        const innerFlame = new THREE.Mesh(innerFlameGeo, innerFlameMat);
        innerFlame.position.set(0, 0, -0.1);
        outerFlame.add(innerFlame);

        group.add(outerFlame);
        nitroFlames.push(outerFlame);
        if (idx === 0) nitroFlameLeft = outerFlame;
        if (idx === 1) nitroFlameRight = outerFlame;
      });

      // =========================================================================
      // D. FORKS, TALL BLACK HANDLEBARS, ROUND MIRRORS & MULTI-LED HALO HEADLIGHT
      // =========================================================================
      const steeringGroup = new THREE.Group();
      steeringGroup.position.set(0, 0.96, -0.78);
      group.add(steeringGroup);

      // Steering neck head tube
      const neckTube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.072, 0.072, 0.34, 24),
        mats.blackSteel
      );
      neckTube.rotation.x = 0.28;
      neckTube.position.set(0, 0.1, -0.05);
      steeringGroup.add(neckTube);

      // Dual Telescopic Front Forks (Black Upper & Lower Sliders + Polished Silver Inner Stanchion Tubes)
      [-0.22, 0.22].forEach((fx) => {
        // Upper black fork shroud between triple clamps
        const upperShroud = new THREE.Mesh(
          new THREE.CylinderGeometry(0.046, 0.046, 0.38, 28),
          mats.blackSteel
        );
        upperShroud.position.set(fx, 0.12, -0.06);
        upperShroud.rotation.x = 0.28;
        steeringGroup.add(upperShroud);

        // Exposed polished silver/chrome inner stanchion tube
        const chromeStanchion = new THREE.Mesh(
          new THREE.CylinderGeometry(0.038, 0.038, 0.36, 28),
          mats.chrome
        );
        chromeStanchion.position.set(fx, -0.14, -0.14);
        chromeStanchion.rotation.x = 0.28;
        steeringGroup.add(chromeStanchion);

        // Lower black fork slider leg down to front axle
        const lowerSlider = new THREE.Mesh(
          new THREE.CylinderGeometry(0.052, 0.048, 0.48, 28),
          mats.blackSteel
        );
        lowerSlider.position.set(fx, -0.44, -0.23);
        lowerSlider.rotation.x = 0.28;
        steeringGroup.add(lowerSlider);
      });

      // Front Brake Caliper on Left Fork Slider
      const frontCaliper = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.14, 0.16),
        mats.blackSteel
      );
      frontCaliper.position.set(-0.26, -0.48, -0.2);
      steeringGroup.add(frontCaliper);

      // Black Billet Triple-Tree Clamps + Fork Arch Brace over Front Fender
      const lowerTripleClamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.075, 0.22),
        mats.blackSteel
      );
      lowerTripleClamp.position.set(0, -0.03, -0.1);
      steeringGroup.add(lowerTripleClamp);

      const fenderArchBrace = new THREE.Mesh(
        new THREE.BoxGeometry(0.54, 0.065, 0.2),
        mats.blackSteel
      );
      fenderArchBrace.position.set(0, -0.24, -0.17);
      fenderArchBrace.rotation.x = 0.28;
      steeringGroup.add(fenderArchBrace);

      const upperTripleClamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.54, 0.07, 0.2),
        mats.blackSteel
      );
      upperTripleClamp.position.set(0, 0.28, -0.02);
      steeringGroup.add(upperTripleClamp);

      // Front Swept Deep Glossy Red Fender with White Lightning Bolt Decal (32 radial segments)
      const frontFender = new THREE.Mesh(
        new THREE.CylinderGeometry(0.495, 0.495, 0.47, 32, 1, false, 0, Math.PI * 0.9),
        mats.fenderLightning
      );
      frontFender.rotation.z = Math.PI / 2;
      frontFender.rotation.x = 0.55;
      frontFender.position.set(0, -0.52, -0.32);
      frontFender.castShadow = true;
      steeringGroup.add(frontFender);

      // SIGNATURE ROUND MULTI-LED HALO HEADLIGHT (matches 0:00-0:04 & 0:08-0:09 in video & poster!)
      const headlightPod = new THREE.Group();
      headlightPod.position.set(0, 0.22, -0.21);
      steeringGroup.add(headlightPod);

      // Glossy black headlight bucket
      const bucket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.215, 0.165, 0.17, 32),
        mats.blackSteel
      );
      bucket.rotation.x = Math.PI / 2;
      headlightPod.add(bucket);

      // Silver/chrome outer headlight bezel ring
      const chromeBezel = new THREE.Mesh(
        new THREE.TorusGeometry(0.21, 0.02, 16, 36),
        mats.chrome
      );
      chromeBezel.position.set(0, 0, -0.085);
      headlightPod.add(chromeBezel);

      // Textured Multi-LED reflector face inside the lens
      const reflectorFace = new THREE.Mesh(
        new THREE.CircleGeometry(0.198, 32),
        new THREE.MeshBasicMaterial({
          map: textures.headlightFace || null,
          color: 0xffffff
        })
      );
      reflectorFace.rotation.y = Math.PI;
      reflectorFace.position.set(0, 0, -0.09);
      headlightPod.add(reflectorFace);

      // 3D Glowing Outer Angel-Eye Halo Ring
      const angelEyeRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.176, 0.015, 16, 36),
        new THREE.MeshBasicMaterial({ color: 0xf8fafc })
      );
      angelEyeRing.position.set(0, 0, -0.096);
      headlightPod.add(angelEyeRing);

      // 3D Dual-Row Warm-White / Cool-White Multi-LED Emitters inside Halo
      const warmLedMat = new THREE.MeshBasicMaterial({ color: 0xfffef5 });
      const coolLedMat = new THREE.MeshBasicMaterial({ color: 0xeef6ff });
      [-0.085, -0.028, 0.028, 0.085].forEach((lx) => {
        const topEmitter = new THREE.Mesh(
          new THREE.SphereGeometry(0.024, 12, 12),
          warmLedMat
        );
        topEmitter.scale.set(1, 1, 0.45);
        topEmitter.position.set(lx, 0.042, -0.095);
        headlightPod.add(topEmitter);
      });
      [-0.068, 0, 0.068].forEach((lx) => {
        const botEmitter = new THREE.Mesh(
          new THREE.SphereGeometry(0.024, 12, 12),
          coolLedMat
        );
        botEmitter.scale.set(1, 1, 0.45);
        botEmitter.position.set(lx, -0.042, -0.095);
        headlightPod.add(botEmitter);
      });

      // Small round secondary auxiliary lamp / horn bezel below main headlight (matching poster & 0:00-0:03)
      const hornBezel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.062, 0.055, 0.05, 20),
        mats.blackSteel
      );
      hornBezel.rotation.x = Math.PI / 2;
      hornBezel.position.set(0, -0.06, -0.22);
      steeringGroup.add(hornBezel);

      const hornRim = new THREE.Mesh(
        new THREE.TorusGeometry(0.058, 0.008, 10, 20),
        mats.chrome
      );
      hornRim.position.set(0, -0.06, -0.245);
      steeringGroup.add(hornRim);

      // Thin Horizontal LED Turn Signal Strips on left & right of forks (matching poster & 0:00-0:03)
      [-0.27, 0.27].forEach((bx) => {
        const blinkerBody = new THREE.Mesh(
          new THREE.BoxGeometry(0.13, 0.028, 0.032),
          mats.blackSteel
        );
        blinkerBody.position.set(bx, 0.05, -0.17);
        steeringGroup.add(blinkerBody);

        const blinkerStrip = new THREE.Mesh(
          new THREE.BoxGeometry(0.11, 0.016, 0.01),
          new THREE.MeshBasicMaterial({ color: 0xfff3c4 })
        );
        blinkerStrip.position.set(bx, 0.05, -0.188);
        steeringGroup.add(blinkerStrip);
      });

      // Sleek Rectangular Digital Dashboard Screen above handlebar clamp
      const dashHousing = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.13, 0.04),
        mats.blackSteel
      );
      dashHousing.position.set(0, 0.56, 0.02);
      dashHousing.rotation.x = -0.52;
      steeringGroup.add(dashHousing);

      const dashDisplay = new THREE.Mesh(
        new THREE.PlaneGeometry(0.25, 0.105),
        new THREE.MeshBasicMaterial({
          map: textures.digitalDash || null,
          color: 0xffffff
        })
      );
      dashDisplay.position.set(0, 0.562, 0.042);
      dashDisplay.rotation.x = -0.52;
      steeringGroup.add(dashDisplay);

      // TALL BLACK HANDLEBARS WITH KNURLED GRIPS, LEVERS & ROUND MIRRORS (matching 0:00-0:09 & poster!)
      [-1, 1].forEach((side) => {
        const barCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0.31, -0.01),
          new THREE.Vector3(side * 0.15, 0.33, 0.01),
          new THREE.Vector3(side * 0.26, 0.52, 0.08),
          new THREE.Vector3(side * 0.44, 0.54, 0.16)
        ]);
        const barTube = new THREE.Mesh(
          new THREE.TubeGeometry(barCurve, 24, 0.024, 16, false),
          mats.blackSteel
        );
        steeringGroup.add(barTube);

        // Knurled Black Rubber Handlebar Grip (exact target for Rafa's gloved hands!)
        const grip = new THREE.Mesh(
          new THREE.CylinderGeometry(0.032, 0.032, 0.22, 20),
          mats.rubber
        );
        grip.rotation.z = Math.PI / 2;
        grip.rotation.y = -side * 0.2;
        grip.position.set(side * 0.44, 0.54, 0.16);
        steeringGroup.add(grip);

        // Switchgear control housing block on handlebar
        const switchBox = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.068, 0.068),
          mats.blackSteel
        );
        switchBox.position.set(side * 0.33, 0.535, 0.12);
        steeringGroup.add(switchBox);

        // Black Brake / Clutch Lever
        const lever = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.016, 0.024),
          mats.blackSteel
        );
        lever.position.set(side * 0.43, 0.535, 0.08);
        lever.rotation.y = -side * 0.32;
        steeringGroup.add(lever);

        // Curved Black Mirror Stem & Round Mirror Housing with Reflective Glass Face
        const stemCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.35, 0.56, 0.12),
          new THREE.Vector3(side * 0.48, 0.72, 0.11),
          new THREE.Vector3(side * 0.55, 0.84, 0.1)
        ]);
        const mirrorStem = new THREE.Mesh(
          new THREE.TubeGeometry(stemCurve, 16, 0.011, 12, false),
          mats.blackSteel
        );
        steeringGroup.add(mirrorStem);

        const mirrorHousing = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.085, 0.028, 28),
          mats.blackSteel
        );
        mirrorHousing.rotation.x = Math.PI / 2;
        mirrorHousing.position.set(side * 0.55, 0.84, 0.1);
        steeringGroup.add(mirrorHousing);

        const mirrorGlass = new THREE.Mesh(
          new THREE.CircleGeometry(0.08, 24),
          mats.chrome
        );
        mirrorGlass.position.set(side * 0.55, 0.84, 0.116);
        steeringGroup.add(mirrorGlass);
      });

      // Realistic Headlight SpotLight + Subtle Soft Headlight Beam Cone
      const headlightSpot = new THREE.SpotLight(0xf5f9ff, 2.6, 68, Math.PI / 5.4, 0.52, 1.15);
      headlightSpot.position.set(0, 1.18, -1.05);
      headlightSpot.target.position.set(0, 0.1, -26);
      group.add(headlightSpot);
      group.add(headlightSpot.target);

      const coneGeo = new THREE.ConeGeometry(2.3, 13.5, 28, 1, true);
      coneGeo.rotateX(Math.PI / 2);
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0xeef6ff,
        transparent: true,
        opacity: 0.055,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const headlightCone = new THREE.Mesh(coneGeo, coneMat);
      headlightCone.position.set(0, 0.72, -7.8);
      group.add(headlightCone);

      // Subtle tail/frame bounce PointLight (kept in refs for renderer compatibility)
      const underGlowLight = new THREE.PointLight(0xff1824, 0.45, 4.5, 2.0);
      underGlowLight.position.set(0, 0.35, 0.8);
      group.add(underGlowLight);

      // =========================================================================
      // E. REALISTIC 3D RAFA RIDER (PT 13 & EDTECH Leather Jacket, Glasses, Beard)
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
     * Build Anatomically Proportioned Realistic 3D Rafa Rider
     * Dark matte-leather biker jacket (roughness: 0.42, metalness: 0.1) with crisp
     * "PT 13 / EDTECH" logos on back (0:05-0:07) and front chest (0:00-0:03),
     * natural skin tone, well-defined dark beard & mustache, black rectangular glasses,
     * hands firmly gripping the handlebars, and boots planted on the floorboards.
     */
    _buildRafaRider(mats, textures) {
      const THREE = window.THREE;
      const riderGroup = new THREE.Group();
      riderGroup.name = 'RafaRiderGroup';

      // Realistic dark matte-leather biker jacket (roughness: 0.42, metalness: 0.1)
      const leatherJacketMat = createPBRMaterial(
        THREE,
        {
          color: 0x12141a,
          roughness: 0.42,
          metalness: 0.1,
          clearcoat: 0.18,
          clearcoatRoughness: 0.45
        },
        mats.envMap
      );
      const jacketBackMat = createPBRMaterial(
        THREE,
        {
          color: 0xffffff,
          map: textures.jacketBack || null,
          roughness: 0.42,
          metalness: 0.1,
          clearcoat: 0.15,
          clearcoatRoughness: 0.45
        },
        mats.envMap
      );
      const jacketFrontMat = createPBRMaterial(
        THREE,
        {
          color: 0xffffff,
          map: textures.jacketFront || null,
          roughness: 0.42,
          metalness: 0.1,
          clearcoat: 0.15,
          clearcoatRoughness: 0.45
        },
        mats.envMap
      );
      const cargoPantsMat = createPBRMaterial(
        THREE,
        {
          color: 0x1b1d24,
          roughness: 0.76,
          metalness: 0.06
        },
        mats.envMap
      );
      const bootMat = createPBRMaterial(
        THREE,
        {
          color: 0x0f1116,
          roughness: 0.35,
          metalness: 0.22,
          clearcoat: 0.3
        },
        mats.envMap
      );
      const skinMat = createPBRMaterial(
        THREE,
        {
          color: 0xdfa078,
          roughness: 0.54,
          metalness: 0.04
        },
        mats.envMap
      );
      const beardHairMat = createPBRMaterial(
        THREE,
        {
          color: 0x1b130e,
          roughness: 0.84,
          metalness: 0.05
        },
        mats.envMap
      );

      // 1. LOWER BODY: Dark Cargo Pants, Articulated Knees, Side Cargo Pockets & Boots on Floorboards
      const pelvis = new THREE.Mesh(
        new THREE.CylinderGeometry(0.235, 0.22, 0.22, 24),
        cargoPantsMat
      );
      pelvis.scale.set(1.15, 1, 0.82);
      pelvis.position.set(0, 1.07, 0.36);
      riderGroup.add(pelvis);

      [-1, 1].forEach((side) => {
        const sideX = side * 0.2;

        // Sculpted Thigh angled from saddle toward knee
        const thigh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.115, 0.098, 0.5, 24),
          cargoPantsMat
        );
        thigh.position.set(sideX, 1.03, 0.13);
        thigh.rotation.x = 1.22;
        thigh.rotation.z = -side * 0.1;
        thigh.castShadow = true;
        riderGroup.add(thigh);

        // Outer Thigh Cargo Pocket
        const pocket = new THREE.Mesh(
          new THREE.BoxGeometry(0.042, 0.16, 0.14),
          cargoPantsMat
        );
        pocket.position.set(sideX + side * 0.1, 1.04, 0.13);
        pocket.rotation.x = 1.22;
        riderGroup.add(pocket);

        // Articulated Knee Sphere
        const knee = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 20, 20),
          cargoPantsMat
        );
        knee.position.set(sideX * 1.12, 0.92, -0.11);
        riderGroup.add(knee);

        // Lower Leg / Shin descending straight to floorboard
        const shin = new THREE.Mesh(
          new THREE.CylinderGeometry(0.095, 0.082, 0.46, 24),
          cargoPantsMat
        );
        shin.position.set(sideX * 1.12, 0.69, -0.16);
        shin.rotation.x = -0.14;
        shin.castShadow = true;
        riderGroup.add(shin);

        // Laced Black Leather Tactical Biker Boot planted firmly on the floorboard (y=0.39)
        const bootGroup = new THREE.Group();
        bootGroup.position.set(sideX * 1.12, 0.435, -0.24);
        riderGroup.add(bootGroup);

        const ankleShaft = new THREE.Mesh(
          new THREE.CylinderGeometry(0.084, 0.088, 0.17, 20),
          bootMat
        );
        ankleShaft.position.set(0, 0.07, 0.05);
        bootGroup.add(ankleShaft);

        const bootFoot = new THREE.Mesh(
          new THREE.BoxGeometry(0.175, 0.1, 0.33),
          bootMat
        );
        bootFoot.position.set(0, 0.01, -0.02);
        bootGroup.add(bootFoot);

        const toeCap = new THREE.Mesh(
          new THREE.SphereGeometry(0.088, 20, 16),
          bootMat
        );
        toeCap.scale.set(1.0, 0.68, 1.15);
        toeCap.position.set(0, 0.0, -0.155);
        bootGroup.add(toeCap);

        // Heavy Lug Sole resting on floorboard
        const lugSole = new THREE.Mesh(
          new THREE.BoxGeometry(0.19, 0.034, 0.35),
          mats.rubber
        );
        lugSole.position.set(0, -0.042, -0.02);
        bootGroup.add(lugSole);

        for (let l = 0; l < 3; l++) {
          const lace = new THREE.Mesh(
            new THREE.BoxGeometry(0.11, 0.012, 0.018),
            mats.darkAlloy
          );
          lace.position.set(0, 0.048 + l * 0.032, -0.04 + l * 0.02);
          bootGroup.add(lace);
        }
      });

      // 2. TORSO: Dark Matte-Leather Biker Jacket with Back ("PT 13 / EDTECH") & Front Chest Logos
      const riderTorso = new THREE.Group();
      riderTorso.position.set(0, 1.42, 0.34);
      riderTorso.rotation.x = -0.12;
      riderGroup.add(riderTorso);

      // Core Jacket Torso with distinct Back (+Z) and Front Chest (-Z) textures
      const torsoMats = [
        leatherJacketMat, // right (+X)
        leatherJacketMat, // left (-X)
        leatherJacketMat, // top (+Y)
        leatherJacketMat, // bottom (-Y)
        jacketBackMat,    // back (+Z facing chase camera: white "PT 13 / EDTECH")
        jacketFrontMat    // front chest (-Z: red "PT 13" right chest patch + "EDTECH" left chest gear)
      ];
      const jacketBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.54, 0.66, 0.31),
        torsoMats
      );
      jacketBody.castShadow = true;
      riderTorso.add(jacketBody);

      // Sculpted rounded shoulders & subtle red piping seam
      [-1, 1].forEach((side) => {
        const shoulderCap = new THREE.Mesh(
          new THREE.SphereGeometry(0.132, 24, 20),
          leatherJacketMat
        );
        shoulderCap.position.set(side * 0.275, 0.24, 0);
        riderTorso.add(shoulderCap);
      });

      // Stand-up biker jacket collar with throat snap strap
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.155, 0.18, 0.12, 24),
        leatherJacketMat
      );
      collar.position.set(0, 0.36, -0.015);
      riderTorso.add(collar);

      // 3. ARMS, ROLLED SLEEVES, FOREARMS & FINGERLESS BIKER GLOVES FIRMLY ON HANDLEBARS
      [-1, 1].forEach((side) => {
        // Upper leather sleeve from shoulder (0.28, 0.24, 0) to elbow (0.39, 0.17, -0.45)
        const upperArm = new THREE.Mesh(
          new THREE.CylinderGeometry(0.098, 0.086, 0.46, 24),
          leatherJacketMat
        );
        upperArm.position.set(side * 0.335, 0.2, -0.22);
        upperArm.rotation.x = 1.38;
        upperArm.rotation.z = -side * 0.24;
        upperArm.castShadow = true;
        riderTorso.add(upperArm);

        // Rolled leather cuff at elbow
        const cuff = new THREE.Mesh(
          new THREE.TorusGeometry(0.086, 0.018, 12, 24),
          leatherJacketMat
        );
        cuff.position.set(side * 0.39, 0.17, -0.44);
        cuff.rotation.x = 1.45;
        riderTorso.add(cuff);

        // Muscular exposed forearm reaching from elbow (0.39, 0.17, -0.45) to handlebar grip (0.44, 0.19, -0.94)
        const forearm = new THREE.Mesh(
          new THREE.CylinderGeometry(0.078, 0.064, 0.48, 24),
          skinMat
        );
        forearm.position.set(side * 0.415, 0.18, -0.68);
        forearm.rotation.x = 1.6;
        forearm.rotation.z = -side * 0.1;
        riderTorso.add(forearm);

        // Black wristwatch on left wrist (matching poster & 0:00-0:02)
        if (side === 1) {
          const watchBand = new THREE.Mesh(
            new THREE.CylinderGeometry(0.068, 0.068, 0.035, 18),
            bootMat
          );
          watchBand.rotation.x = 1.6;
          watchBand.position.set(side * 0.432, 0.185, -0.85);
          riderTorso.add(watchBand);
        }

        // Fingerless Black Leather Riding Glove locked directly onto the handlebar grip!
        // In world/bikeGroup space: (side * 0.44, 1.50, -0.62) === grip position!
        const gloveGroup = new THREE.Group();
        gloveGroup.position.set(side * 0.44, 0.19, -0.94);
        riderTorso.add(gloveGroup);

        const glovePalm = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.088, 0.125),
          bootMat
        );
        gloveGroup.add(glovePalm);

        // 4 Carbon/dark-metal knuckle guard studs
        for (let k = -1.5; k <= 1.5; k += 1) {
          const knuckle = new THREE.Mesh(
            new THREE.SphereGeometry(0.015, 10, 10),
            mats.darkAlloy
          );
          knuckle.position.set(k * 0.025, 0.048, -0.015);
          gloveGroup.add(knuckle);
        }

        // Exposed fingertips wrapping around the handlebar grip
        const fingers = new THREE.Mesh(
          new THREE.CylinderGeometry(0.034, 0.034, 0.105, 14),
          skinMat
        );
        fingers.rotation.z = Math.PI / 2;
        fingers.position.set(0, -0.012, -0.068);
        gloveGroup.add(fingers);
      });

      // 4. REALISTIC 3D HEAD: Natural Skin Tone, Eyes, Full Dark Beard & Mustache, Black Rectangular Glasses & Spiked Hair
      const riderHead = new THREE.Group();
      riderHead.position.set(0, 0.56, -0.03);
      riderHead.rotation.x = 0.1; // Keep head level while torso leans slightly forward
      riderTorso.add(riderHead);

      // Sculpted Neck
      const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.086, 0.1, 0.16, 24),
        skinMat
      );
      neck.position.set(0, -0.14, 0.02);
      riderHead.add(neck);

      // Cranium & Jawline (32 segments)
      const cranium = new THREE.Mesh(
        new THREE.SphereGeometry(0.19, 32, 28),
        skinMat
      );
      cranium.scale.set(0.94, 1.08, 0.98);
      cranium.castShadow = true;
      riderHead.add(cranium);

      // Brow ridge & nose bridge
      const nose = new THREE.Mesh(
        new THREE.ConeGeometry(0.03, 0.082, 16),
        skinMat
      );
      nose.rotation.x = -Math.PI / 2 + 0.25;
      nose.position.set(0, 0.006, -0.192);
      riderHead.add(nose);

      // 3D Eyes & Dark Eyebrows behind the glasses (visible in front/three-quarter shots!)
      const scleraMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
      const irisMat = new THREE.MeshBasicMaterial({ color: 0x291a10 });
      [-0.068, 0.068].forEach((ex, idx) => {
        const side = idx === 0 ? -1 : 1;
        const eyeball = new THREE.Mesh(
          new THREE.SphereGeometry(0.024, 14, 14),
          scleraMat
        );
        eyeball.scale.set(1.1, 0.85, 0.6);
        eyeball.position.set(ex, 0.034, -0.172);
        riderHead.add(eyeball);

        const iris = new THREE.Mesh(
          new THREE.CircleGeometry(0.012, 12),
          irisMat
        );
        iris.rotation.y = Math.PI;
        iris.position.set(ex, 0.034, -0.187);
        riderHead.add(iris);

        const brow = new THREE.Mesh(
          new THREE.BoxGeometry(0.062, 0.015, 0.02),
          beardHairMat
        );
        brow.position.set(ex, 0.066, -0.175);
        brow.rotation.z = side * 0.08;
        riderHead.add(brow);
      });

      // 3D Ears
      [-0.18, 0.18].forEach((ex) => {
        const ear = new THREE.Mesh(
          new THREE.SphereGeometry(0.036, 16, 16),
          skinMat
        );
        ear.scale.set(0.46, 1.15, 0.72);
        ear.position.set(ex, 0.01, -0.01);
        riderHead.add(ear);
      });

      // Well-Defined Dark-Brown/Black Full Short Boxed Beard, Mustache & Soul Patch
      // Shifted slightly forward so beard hugs jaw/chin and does not create an artifact on the cranium back
      const beardShell = new THREE.Mesh(
        new THREE.SphereGeometry(0.194, 28, 22, 0, Math.PI * 2, Math.PI * 0.51, Math.PI * 0.44),
        beardHairMat
      );
      beardShell.scale.set(0.95, 1.05, 1.01);
      beardShell.position.set(0, -0.016, -0.024);
      riderHead.add(beardShell);

      // Tapered back-of-head hairline mesh & nape coverage (eliminates pale cranium stripe in 3rd-person chase camera)
      const backHair = new THREE.Mesh(
        new THREE.SphereGeometry(0.198, 28, 22, 0, Math.PI, Math.PI * 0.32, Math.PI * 0.48),
        beardHairMat
      );
      backHair.scale.set(0.97, 1.07, 1.03);
      backHair.position.set(0, 0.012, 0.016);
      riderHead.add(backHair);

      // Sculpted tapered nape patch filling the transition from cranium into jacket collar (z > 0.02)
      const napeHair = new THREE.Mesh(
        new THREE.CylinderGeometry(0.096, 0.104, 0.10, 20, 1, false, -Math.PI * 0.5, Math.PI),
        beardHairMat
      );
      napeHair.scale.set(0.96, 1.0, 0.85);
      napeHair.position.set(0, -0.125, 0.038);
      riderHead.add(napeHair);

      // Chin beard fullness
      const chinBeard = new THREE.Mesh(
        new THREE.SphereGeometry(0.108, 20, 18),
        beardHairMat
      );
      chinBeard.scale.set(1.12, 0.88, 1.12);
      chinBeard.position.set(0, -0.132, -0.102);
      riderHead.add(chinBeard);

      // Contoured 3D Mustache & Lower Lip
      [-1, 1].forEach((side) => {
        const stache = new THREE.Mesh(
          new THREE.CylinderGeometry(0.017, 0.023, 0.082, 14),
          beardHairMat
        );
        stache.rotation.z = Math.PI / 2 + side * 0.26;
        stache.position.set(side * 0.035, -0.046, -0.184);
        riderHead.add(stache);
      });

      // Natural Short Textured Dark Spiked Hair (Tapered sides + sculpted top spikes)
      const hairCap = new THREE.Mesh(
        new THREE.SphereGeometry(0.196, 28, 22, 0, Math.PI * 2, 0, Math.PI * 0.52),
        beardHairMat
      );
      hairCap.scale.set(0.96, 1.07, 1.0);
      hairCap.position.set(0, 0.022, 0.012);
      riderHead.add(hairCap);

      for (let row = 0; row < 3; row++) {
        for (let s = -2; s <= 2; s++) {
          const spike = new THREE.Mesh(
            new THREE.ConeGeometry(0.038, 0.095, 12),
            beardHairMat
          );
          spike.position.set(
            s * 0.038,
            0.2 - row * 0.015,
            -0.082 + row * 0.06
          );
          spike.rotation.x = -0.3 + row * 0.2;
          spike.rotation.z = -s * 0.14;
          riderHead.add(spike);
        }
      }

      // 3D Black Rectangular Eyeglasses (hollow frame rims + subtle clear anti-reflective lenses)
      const frameMat = createPBRMaterial(
        THREE,
        {
          color: 0x08090d,
          roughness: 0.18,
          metalness: 0.35,
          clearcoat: 0.9
        },
        mats.envMap
      );
      const lensMat = createPBRMaterial(
        THREE,
        {
          color: 0xdbeafe,
          metalness: 0.85,
          roughness: 0.05,
          clearcoat: 1.0,
          transparent: true,
          opacity: 0.28
        },
        mats.envMap
      );

      [-0.072, 0.072].forEach((gx) => {
        // Top, bottom, left, right frame bars so the rectangular glasses frame is genuinely hollow around the eyes
        const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.011, 0.018), frameMat);
        topBar.position.set(gx, 0.056, -0.188);
        const botBar = new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.009, 0.016), frameMat);
        botBar.position.set(gx, 0.008, -0.188);
        const leftBar = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.054, 0.016), frameMat);
        leftBar.position.set(gx - 0.038, 0.032, -0.188);
        const rightBar = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.054, 0.016), frameMat);
        rightBar.position.set(gx + 0.038, 0.032, -0.188);
        riderHead.add(topBar, botBar, leftBar, rightBar);

        const glassLens = new THREE.Mesh(
          new THREE.PlaneGeometry(0.068, 0.04),
          lensMat
        );
        glassLens.rotation.y = Math.PI;
        glassLens.position.set(gx, 0.032, -0.195);
        riderHead.add(glassLens);
      });

      // Glasses center bridge & side temple arms
      const noseBridge = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.011, 0.016),
        frameMat
      );
      noseBridge.position.set(0, 0.046, -0.188);
      riderHead.add(noseBridge);

      [-0.174, 0.174].forEach((tx) => {
        const templeArm = new THREE.Mesh(
          new THREE.BoxGeometry(0.014, 0.016, 0.185),
          frameMat
        );
        templeArm.position.set(tx, 0.04, -0.095);
        riderHead.add(templeArm);
      });

      return { riderGroup, riderTorso, riderHead };
    },

    /**
     * Build a High-Detail 32-Segment Car Wheel with Alloy Rim & Brake Rotor
     */
    _buildCarWheel(radius, width, envMap, isPolice) {
      const THREE = window.THREE;
      const textures = this.getTextures();
      const wheel = new THREE.Group();

      const tireMat = createPBRMaterial(
        THREE,
        {
          color: 0x141619,
          map: textures.tireTread || null,
          roughness: 0.65,
          metalness: 0.08
        },
        envMap
      );
      const rimMat = createPBRMaterial(
        THREE,
        {
          color: isPolice ? 0x1e232d : 0xcbd5e1,
          metalness: 0.85,
          roughness: 0.2,
          clearcoat: 0.8
        },
        envMap
      );
      const capMat = createPBRMaterial(
        THREE,
        {
          color: 0xe2e8f0,
          metalness: 0.92,
          roughness: 0.1
        },
        envMap
      );

      const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, width, 32),
        tireMat
      );
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      wheel.add(tire);

      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.64, radius * 0.64, width + 0.015, 24),
        rimMat
      );
      rim.rotation.z = Math.PI / 2;
      wheel.add(rim);

      for (let s = 0; s < 5; s++) {
        const spoke = new THREE.Mesh(
          new THREE.BoxGeometry(width + 0.022, 0.042, radius * 1.2),
          rimMat
        );
        spoke.rotation.x = (s * Math.PI * 2) / 5;
        wheel.add(spoke);
      }

      // Chrome Police Interceptor center hubcap
      const centerCap = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, width + 0.03, 18),
        capMat
      );
      centerCap.rotation.z = Math.PI / 2;
      wheel.add(centerCap);

      return wheel;
    },

    /**
     * 2. Build Realistic Black-and-White Police Cruiser ('police_car') or SWAT BearCat ('swat_van')
     * Matches the black-and-white "POLICE" sedans in the video (0:02-0:09):
     * Deep glossy black front/rear/roof with crisp white doors reading "POLICE",
     * realistic metallic front grille & push-bar, bright white headlights, red tail lights,
     * and realistic low-profile roof LED lightbar flashing intense red and blue.
     * @param {string} variant - 'police_car' | 'swat_van'
     * @param {THREE.Texture} envMap
     * @returns {{ group: THREE.Group, redStrobeMat: THREE.Material, blueStrobeMat: THREE.Material, strobeLight: THREE.PointLight, wheels: THREE.Object3D[] }}
     */
    buildPoliceCruiser(variant, envMap) {
      const THREE = window.THREE;
      const textures = this.getTextures();
      const isSwat = variant === 'swat_van';
      const group = new THREE.Group();
      group.name = isSwat ? 'SWATBearCatGroup' : 'ViceCityPoliceCruiserGroup';

      // Deep glossy black paint for front, rear, and roof
      const blackPaint = createPBRMaterial(
        THREE,
        {
          color: 0x090b10,
          metalness: 0.65,
          roughness: isSwat ? 0.3 : 0.14,
          clearcoat: isSwat ? 0.5 : 1.0,
          clearcoatRoughness: 0.06,
          envMapIntensity: 1.5
        },
        envMap
      );
      const doorDecalMat = createPBRMaterial(
        THREE,
        {
          color: 0xffffff,
          map: (isSwat ? textures.swatDoor : textures.policeDoor) || null,
          metalness: 0.45,
          roughness: 0.16,
          clearcoat: 1.0,
          clearcoatRoughness: 0.06,
          envMapIntensity: 1.4
        },
        envMap
      );
      const darkGlassMat = createPBRMaterial(
        THREE,
        {
          color: 0x0a101d,
          metalness: 0.95,
          roughness: 0.05,
          clearcoat: 1.0,
          envMapIntensity: 1.85
        },
        envMap
      );
      const steelMat = createPBRMaterial(
        THREE,
        {
          color: 0x222834,
          metalness: 0.85,
          roughness: 0.22
        },
        envMap
      );
      const chromeMat = createPBRMaterial(
        THREE,
        {
          color: 0xdbe4f0,
          metalness: 0.94,
          roughness: 0.1
        },
        envMap
      );

      // Intense Flashing Red & Blue LED Lightbar Materials
      const redStrobeMat = new THREE.MeshBasicMaterial({ color: 0xff1722 });
      const blueStrobeMat = new THREE.MeshBasicMaterial({ color: 0x0077ff });

      if (!isSwat) {
        // =====================================================================
        // REALISTIC BLACK & WHITE POLICE INTERCEPTOR SEDAN (0:02-0:09 in video)
        // =====================================================================
        const lowerBodyMats = [
          doorDecalMat, // right side (+X): black fenders + crisp white "POLICE" doors
          doorDecalMat, // left side (-X): black fenders + crisp white "POLICE" doors
          blackPaint,   // top deck
          blackPaint,   // underbody
          blackPaint,   // rear (+Z)
          blackPaint    // front (-Z)
        ];
        const lowerChassis = new THREE.Mesh(
          new THREE.BoxGeometry(2.04, 0.66, 4.48),
          lowerBodyMats
        );
        lowerChassis.position.y = 0.56;
        lowerChassis.castShadow = true;
        lowerChassis.receiveShadow = true;
        group.add(lowerChassis);

        // Sculpted Glossy Black Front Hood & Rear Trunk Deck
        const hood = new THREE.Mesh(
          new THREE.BoxGeometry(1.92, 0.14, 1.38),
          blackPaint
        );
        hood.position.set(0, 0.92, -1.46);
        hood.rotation.x = 0.07;
        group.add(hood);

        const trunk = new THREE.Mesh(
          new THREE.BoxGeometry(1.9, 0.14, 1.06),
          blackPaint
        );
        trunk.position.set(0, 0.93, 1.64);
        trunk.rotation.x = -0.05;
        group.add(trunk);

        // Dark Tinted Cabin Greenhouse + Deep Glossy Black Roof & Pillars
        const cabinGlass = new THREE.Mesh(
          new THREE.CylinderGeometry(1.12, 1.5, 0.54, 4),
          darkGlassMat
        );
        cabinGlass.rotation.y = Math.PI / 4;
        cabinGlass.scale.set(0.84, 1.0, 1.06);
        cabinGlass.position.set(0, 1.16, -0.04);
        group.add(cabinGlass);

        const blackRoof = new THREE.Mesh(
          new THREE.BoxGeometry(1.54, 0.07, 1.72),
          blackPaint
        );
        blackRoof.position.set(0, 1.44, -0.04);
        group.add(blackRoof);

        // Glossy Black B-Pillars & Side Mirrors
        [-0.78, 0.78].forEach((px) => {
          const bPillar = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.52, 0.14),
            blackPaint
          );
          bPillar.position.set(px, 1.16, -0.04);
          group.add(bPillar);
        });

        [-1.04, 1.04].forEach((mx) => {
          const sideMirror = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, 0.1, 0.12),
            blackPaint
          );
          sideMirror.position.set(mx, 0.98, -0.68);
          group.add(sideMirror);
        });

        // Metallic Front Grille & Chrome Trim
        const frontGrille = new THREE.Mesh(
          new THREE.BoxGeometry(1.06, 0.24, 0.05),
          steelMat
        );
        frontGrille.position.set(0, 0.62, -2.23);
        group.add(frontGrille);

        const grilleSurround = new THREE.Mesh(
          new THREE.BoxGeometry(1.1, 0.28, 0.03),
          chromeMat
        );
        grilleSurround.position.set(0, 0.62, -2.22);
        group.add(grilleSurround);

        // Heavy-Duty Metallic Police Push-Bar / PIT Maneuver Ram Bumper
        const bullbarGroup = new THREE.Group();
        bullbarGroup.position.set(0, 0.54, -2.3);
        group.add(bullbarGroup);

        const crossBeam1 = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.08, 0.12), steelMat);
        crossBeam1.position.y = 0.12;
        const crossBeam2 = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.08, 0.12), steelMat);
        crossBeam2.position.y = -0.12;
        bullbarGroup.add(crossBeam1, crossBeam2);

        [-0.48, 0.48].forEach((bx) => {
          const upright = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.56, 0.16), steelMat);
          upright.position.x = bx;
          bullbarGroup.add(upright);
        });
      } else {
        // =====================================================================
        // ARMORED BLACK SWAT TACTICAL BEARCAT
        // =====================================================================
        const swatBodyMats = [
          doorDecalMat,
          doorDecalMat,
          blackPaint,
          blackPaint,
          blackPaint,
          blackPaint
        ];
        const armoredHull = new THREE.Mesh(
          new THREE.BoxGeometry(2.38, 1.75, 5.25),
          swatBodyMats
        );
        armoredHull.position.set(0, 1.28, 0.15);
        armoredHull.castShadow = true;
        armoredHull.receiveShadow = true;
        group.add(armoredHull);

        const engineHood = new THREE.Mesh(
          new THREE.BoxGeometry(2.26, 1.05, 1.45),
          blackPaint
        );
        engineHood.position.set(0, 0.92, -2.15);
        group.add(engineHood);

        const batteringRam = new THREE.Mesh(
          new THREE.BoxGeometry(2.35, 0.75, 0.28),
          steelMat
        );
        batteringRam.position.set(0, 0.68, -2.92);
        group.add(batteringRam);

        const viewport = new THREE.Mesh(
          new THREE.BoxGeometry(2.05, 0.48, 0.12),
          darkGlassMat
        );
        viewport.position.set(0, 1.65, -2.44);
        group.add(viewport);
      }

      // 4 Spinning 3D Police Interceptor Wheels
      const wheels = [];
      const wheelRadius = isSwat ? 0.46 : 0.37;
      const wheelWidth = isSwat ? 0.36 : 0.28;
      const wheelX = isSwat ? 1.18 : 1.01;
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

      // Bright White Headlights + Amber Corner Markers + Red LED Tail Lights
      const frontZ = isSwat ? -2.88 : -2.23;
      const rearZ = isSwat ? 2.78 : 2.24;
      const headMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
      const amberMat = new THREE.MeshBasicMaterial({ color: 0xff9900 });
      const tailMat = new THREE.MeshBasicMaterial({ color: 0xff141e });

      [-0.72, 0.72].forEach((lx) => {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.06), headMat);
        hl.position.set(lx, 0.65, frontZ);
        group.add(hl);

        const cornerAmber = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.14, 0.06),
          amberMat
        );
        cornerAmber.position.set(lx + (lx > 0 ? 0.22 : -0.22), 0.65, frontZ + 0.01);
        group.add(cornerAmber);
      });

      const brakeStrip = new THREE.Mesh(
        new THREE.BoxGeometry(isSwat ? 2.1 : 1.84, 0.15, 0.06),
        tailMat
      );
      brakeStrip.position.set(0, 0.7, rearZ);
      group.add(brakeStrip);

      // Realistic Low-Profile Roof LED Lightbar Assembly (Intense Red Left + Blue Right)
      const lightbarY = isSwat ? 2.24 : 1.52;
      const lightbarZ = isSwat ? -1.65 : -0.06;

      // Low-profile mounting feet
      [-0.52, 0.52].forEach((fx) => {
        const mountFoot = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.06, 0.22),
          blackPaint
        );
        mountFoot.position.set(fx, lightbarY - 0.05, lightbarZ);
        group.add(mountFoot);
      });

      const centerPod = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.095, 0.24),
        steelMat
      );
      centerPod.position.set(0, lightbarY, lightbarZ);
      group.add(centerPod);

      const redLightPod = new THREE.Mesh(
        new THREE.BoxGeometry(0.66, 0.09, 0.22),
        redStrobeMat
      );
      redLightPod.position.set(-0.41, lightbarY, lightbarZ);
      group.add(redLightPod);

      const blueLightPod = new THREE.Mesh(
        new THREE.BoxGeometry(0.66, 0.09, 0.22),
        blueStrobeMat
      );
      blueLightPod.position.set(0.41, lightbarY, lightbarZ);
      group.add(blueLightPod);

      // Dynamic Strobe PointLight
      const strobeLight = new THREE.PointLight(0xff1722, 1.5, 11, 2.0);
      strobeLight.position.set(0, lightbarY + 0.22, lightbarZ);
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
     * 3. Build Realistic Night Traffic Sedan / Sports Coupe
     * @param {number} colorHex
     * @param {THREE.Texture} envMap
     * @returns {{ group: THREE.Group, wheels: THREE.Object3D[], tailLightMat: THREE.Material, underglowMat: THREE.Material }}
     */
    buildTrafficCar(colorHex, envMap) {
      const THREE = window.THREE;
      const group = new THREE.Group();
      group.name = 'ViceCityTrafficCarGroup';

      const primaryColor = colorHex !== undefined ? colorHex : 0x1e2430;
      const bodyPaint = createPBRMaterial(
        THREE,
        {
          color: primaryColor,
          metalness: 0.72,
          roughness: 0.16,
          clearcoat: 1.0,
          clearcoatRoughness: 0.06,
          envMapIntensity: 1.45
        },
        envMap
      );
      const darkTrimMat = createPBRMaterial(
        THREE,
        {
          color: 0x0f1218,
          metalness: 0.5,
          roughness: 0.35
        },
        envMap
      );
      const glassMat = createPBRMaterial(
        THREE,
        {
          color: 0x090f1c,
          metalness: 0.95,
          roughness: 0.05,
          clearcoat: 1.0,
          envMapIntensity: 1.85
        },
        envMap
      );

      // Sleek realistic coupe/sedan lower body
      const mainChassis = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.56, 4.32),
        bodyPaint
      );
      mainChassis.position.y = 0.5;
      mainChassis.castShadow = true;
      mainChassis.receiveShadow = true;
      group.add(mainChassis);

      const frontHood = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 0.15, 1.32),
        bodyPaint
      );
      frontHood.position.set(0, 0.78, -1.36);
      frontHood.rotation.x = 0.1;
      group.add(frontHood);

      // Cabin greenhouse
      const canopy = new THREE.Mesh(
        new THREE.CylinderGeometry(1.08, 1.46, 0.5, 4),
        glassMat
      );
      canopy.rotation.y = Math.PI / 4;
      canopy.scale.set(0.84, 1.0, 1.06);
      canopy.position.set(0, 1.02, 0.02);
      group.add(canopy);

      const roofPanel = new THREE.Mesh(
        new THREE.BoxGeometry(1.48, 0.06, 1.62),
        bodyPaint
      );
      roofPanel.position.set(0, 1.27, 0.02);
      group.add(roofPanel);

      const rearLip = new THREE.Mesh(
        new THREE.BoxGeometry(1.86, 0.06, 0.18),
        darkTrimMat
      );
      rearLip.position.set(0, 0.84, 2.06);
      group.add(rearLip);

      // 4 Spinning Alloy Wheels
      const wheels = [];
      [
        [-0.98, 0.35, -1.34],
        [0.98, 0.35, -1.34],
        [-0.98, 0.35, 1.34],
        [0.98, 0.35, 1.34]
      ].forEach(([wx, wy, wz]) => {
        const w = this._buildCarWheel(0.35, 0.26, envMap, false);
        w.position.set(wx, wy, wz);
        group.add(w);
        wheels.push(w);
      });

      // Realistic White Headlights & Red LED Tail Lights (no cartoon neon underglow plane)
      const headMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
      [-0.7, 0.7].forEach((hx) => {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.06), headMat);
        hl.position.set(hx, 0.56, -2.16);
        group.add(hl);
      });

      const tailLightMat = new THREE.MeshBasicMaterial({ color: 0xff141e });
      [-0.68, 0.68].forEach((tx) => {
        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.06), tailLightMat);
        tl.position.set(tx, 0.64, 2.16);
        group.add(tl);
      });

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
     * 4. Build Realistic Police Helicopter
     * Matches the dark police helicopter in the video (0:02-0:09):
     * Dark navy/black fuselage with white tail stripe, realistic spinning rotor blur disc,
     * subtle red/blue belly beacon, and a realistic white searchlight cone (#eef6ff, soft opacity 0.14)
     * pointing down at the road.
     * @param {THREE.Texture} envMap
     * @returns {{ group: THREE.Group, refs: Object, mainRotor: THREE.Group, tailRotor: THREE.Group, spotLight: THREE.SpotLight, lightCone: THREE.Mesh }}
     */
    buildPoliceHelicopter(envMap) {
      const THREE = window.THREE;
      const textures = this.getTextures();
      const group = new THREE.Group();
      group.name = 'ViceCityPoliceHelicopterGroup';

      // Dark navy/black fuselage material matching 0:02-0:09 in the video
      const darkNavyMetal = createPBRMaterial(
        THREE,
        {
          color: 0x0b0f19,
          metalness: 0.72,
          roughness: 0.24,
          clearcoat: 0.85,
          clearcoatRoughness: 0.12
        },
        envMap
      );
      const whiteStripeMat = createPBRMaterial(
        THREE,
        {
          color: 0xf8fafc,
          metalness: 0.35,
          roughness: 0.2,
          clearcoat: 0.9
        },
        envMap
      );
      const canopyGlass = createPBRMaterial(
        THREE,
        {
          color: 0x0f1c2e,
          metalness: 0.92,
          roughness: 0.06,
          clearcoat: 1.0,
          transparent: true,
          opacity: 0.82
        },
        envMap
      );

      // 1. Sleek Dark Navy/Black Fuselage & Top Turbine Cowling
      const fuselage = new THREE.Mesh(
        new THREE.SphereGeometry(1.16, 32, 24),
        darkNavyMetal
      );
      fuselage.scale.set(0.8, 0.68, 1.78);
      fuselage.castShadow = true;
      group.add(fuselage);

      // Top Turbine Engine Intake Cowling
      const turbineCowling = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.54, 1.85, 24),
        darkNavyMetal
      );
      turbineCowling.rotation.x = Math.PI / 2;
      turbineCowling.position.set(0, 0.64, -0.15);
      group.add(turbineCowling);

      // 2. Dark Tinted Cockpit Bubble Canopy (nose points toward +Z facing Rafa)
      const cockpitCanopy = new THREE.Mesh(
        new THREE.SphereGeometry(0.94, 32, 24),
        canopyGlass
      );
      cockpitCanopy.scale.set(0.9, 0.75, 1.32);
      cockpitCanopy.position.set(0, -0.05, 1.46);
      group.add(cockpitCanopy);

      // 3. Tapered Dark Navy/Black Tail Boom with Crisp WHITE Tail Stripe (matches 0:02-0:09 in video!)
      const tailBoom = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.35, 4.15, 24),
        darkNavyMetal
      );
      tailBoom.rotation.x = Math.PI / 2;
      tailBoom.position.set(0, 0.22, -3.15);
      group.add(tailBoom);

      // Crisp White Tail Stripe Band around the Tail Boom
      const whiteTailStripe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.28, 0.62, 24),
        whiteStripeMat
      );
      whiteTailStripe.rotation.x = Math.PI / 2;
      whiteTailStripe.position.set(0, 0.22, -3.1);
      group.add(whiteTailStripe);

      // Horizontal Stabilizer Fins on Tail Boom
      const hStab = new THREE.Mesh(
        new THREE.BoxGeometry(1.55, 0.06, 0.38),
        darkNavyMetal
      );
      hStab.position.set(0, 0.24, -4.15);
      group.add(hStab);

      // Swept Vertical Tail Fin with White Upper Stripe
      const vFin = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 1.25, 0.78),
        darkNavyMetal
      );
      vFin.position.set(0, 0.66, -4.85);
      vFin.rotation.x = -0.22;
      group.add(vFin);

      const vFinStripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.24, 0.76),
        whiteStripeMat
      );
      vFinStripe.position.set(0, 0.92, -4.88);
      vFinStripe.rotation.x = -0.22;
      group.add(vFinStripe);

      // 4. Tubular Landing Skids & Struts
      [-0.76, 0.76].forEach((sx) => {
        const skid = new THREE.Mesh(
          new THREE.CylinderGeometry(0.044, 0.044, 3.45, 20),
          darkNavyMetal
        );
        skid.rotation.x = Math.PI / 2;
        skid.position.set(sx, -1.04, 0.2);
        group.add(skid);

        [-0.55, 0.85].forEach((sz) => {
          const strut = new THREE.Mesh(
            new THREE.CylinderGeometry(0.032, 0.032, 0.66, 16),
            darkNavyMetal
          );
          strut.position.set(sx * 0.9, -0.73, sz);
          strut.rotation.z = sx > 0 ? -0.22 : 0.22;
          group.add(strut);
        });
      });

      // 5. Main Rotor Assembly + Realistic Spinning Motion-Blur Rotor Disc
      const mainRotor = new THREE.Group();
      mainRotor.position.set(0, 0.96, 0.05);
      group.add(mainRotor);

      const rotorHub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.2, 0.24, 24),
        darkNavyMetal
      );
      mainRotor.add(rotorHub);

      const bladeMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.65,
        roughness: 0.3
      });
      const blade1 = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.03, 0.24), bladeMat);
      const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 8.4), bladeMat);
      mainRotor.add(blade1, blade2);

      const blurDiscMat = new THREE.MeshBasicMaterial({
        map: textures.rotorBlur || null,
        color: 0xe2e8f0,
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const mainBlurDisc = new THREE.Mesh(
        new THREE.CircleGeometry(4.2, 36),
        blurDiscMat
      );
      mainBlurDisc.rotation.x = -Math.PI / 2;
      mainRotor.add(mainBlurDisc);

      // 6. Tail Rotor Assembly + Motion-Blur Disc
      const tailRotor = new THREE.Group();
      tailRotor.position.set(0.2, 0.66, -4.92);
      group.add(tailRotor);

      const tBlade1 = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.45, 0.14), bladeMat);
      const tBlade2 = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.14, 1.45), bladeMat);
      tailRotor.add(tBlade1, tBlade2);

      const tailBlurDisc = new THREE.Mesh(
        new THREE.CircleGeometry(0.72, 24),
        blurDiscMat
      );
      tailBlurDisc.rotation.y = Math.PI / 2;
      tailRotor.add(tailBlurDisc);

      // 7. Subtle Red & Blue Belly Beacon Strobes
      const redStrobeMat = new THREE.MeshBasicMaterial({ color: 0xff1e27 });
      const blueStrobeMat = new THREE.MeshBasicMaterial({ color: 0x0088ff });

      const redLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 14, 14),
        redStrobeMat
      );
      redLight.position.set(-0.38, -0.74, 0.45);
      group.add(redLight);

      const blueLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 14, 14),
        blueStrobeMat
      );
      blueLight.position.set(0.38, -0.74, 0.45);
      group.add(blueLight);

      // 8. Under-Nose Gimbal Searchlight Housing + Realistic White Searchlight Cone (#eef6ff, opacity 0.14)
      const gimbal = new THREE.Group();
      gimbal.position.set(0, -0.64, 1.45);
      group.add(gimbal);

      const gimbalHousing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.2, 0.32, 24),
        darkNavyMetal
      );
      gimbalHousing.rotation.x = Math.PI / 2;
      gimbal.add(gimbalHousing);

      const gimbalLens = new THREE.Mesh(
        new THREE.CircleGeometry(0.15, 20),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      gimbalLens.position.set(0, 0, 0.17);
      gimbal.add(gimbalLens);

      const coneGeo = new THREE.ConeGeometry(4.2, 18.5, 28, 1, true);
      coneGeo.translate(0, -9.25, 0);
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0xeef6ff,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const lightCone = new THREE.Mesh(coneGeo, coneMat);
      lightCone.position.set(0, -0.64, 1.45);
      group.add(lightCone);

      const spotLight = new THREE.SpotLight(0xeef6ff, 2.9, 54, Math.PI / 6, 0.52, 1.0);
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
