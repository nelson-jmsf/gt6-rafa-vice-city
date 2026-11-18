/**
 * GT6 RAFA: FUGA DE VICE CITY (EDTECH PT-13 EDITION)
 * Zero-Dependency Local Node.js Server & Vercel Serverless Emulator
 *
 * Features:
 * - Executes /api/leaderboard and /api/telemetry identically to Vercel Serverless
 * - Serves static files (.html, .css, .js, .json, .jpg, .mp4, etc.) with accurate MIME types
 * - Supports HTTP 206 Partial Content byte-range streaming for assets/rafa-chase.mp4
 * - Zero external npm dependencies required (`node server.js`)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT) || 3000;

// Load optional .env / .env.local without external dependencies
function loadDotEnv() {
  for (const envName of ['.env.local', '.env']) {
    const envPath = path.join(ROOT_DIR, envName);
    if (!fs.existsSync(envPath)) continue;
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx <= 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    } catch (_) {
      // Ignore env read errors
    }
  }
}

loadDotEnv();

const leaderboardHandler = require('./api/leaderboard');
const telemetryHandler = require('./api/telemetry');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.sql': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function decorateVercelReqRes(req, res, parsedUrl) {
  const query = {};
  for (const [k, v] of parsedUrl.searchParams.entries()) {
    query[k] = v;
  }
  req.query = query;

  res.status = function (code) {
    res.statusCode = code;
    return res;
  };

  res.json = function (payload) {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(payload));
    return res;
  };
}

function serveStaticFile(req, res, filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const totalSize = stat.size;
  const rangeHeader = req.headers.range;

  const baseHeaders = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control':
      ext === '.mp4' || ext === '.jpg' || ext === '.jpeg' || ext === '.png'
        ? 'public, max-age=3600'
        : 'no-cache'
  };

  // HTTP 206 byte-range streaming for video/audio (assets/rafa-chase.mp4)
  if (rangeHeader && totalSize > 0) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
    if (match) {
      let start = match[1] ? parseInt(match[1], 10) : 0;
      let end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

      if (!Number.isFinite(start) || start < 0) start = 0;
      if (!Number.isFinite(end) || end >= totalSize) end = totalSize - 1;

      if (start > end || start >= totalSize) {
        res.writeHead(416, {
          ...baseHeaders,
          'Content-Range': `bytes */${totalSize}`
        });
        return res.end();
      }

      const chunkSize = end - start + 1;
      res.writeHead(206, {
        ...baseHeaders,
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Content-Length': chunkSize
      });

      if (req.method === 'HEAD') {
        return res.end();
      }

      const stream = fs.createReadStream(filePath, { start, end });
      stream.on('error', () => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
      return stream.pipe(res);
    }
  }

  res.writeHead(200, {
    ...baseHeaders,
    'Content-Length': totalSize
  });

  if (req.method === 'HEAD') {
    return res.end();
  }

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
  stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    // 1. Serverless API Routes
    if (pathname === '/api/leaderboard' || pathname === '/api/leaderboard/') {
      decorateVercelReqRes(req, res, parsedUrl);
      return await leaderboardHandler(req, res);
    }

    if (pathname === '/api/telemetry' || pathname === '/api/telemetry/') {
      decorateVercelReqRes(req, res, parsedUrl);
      return await telemetryHandler(req, res);
    }

    if (pathname === '/api/health') {
      decorateVercelReqRes(req, res, parsedUrl);
      return res.status(200).json({
        ok: true,
        service: 'GT6 RAFA: FUGA DE VICE CITY (EDTECH PT-13 EDITION)',
        supabaseConfigured: Boolean(
          process.env.SUPABASE_URL &&
            (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
        ),
        timestamp: new Date().toISOString()
      });
    }

    // 2. Static File Serving
    let relativePath = pathname === '/' ? '/index.html' : pathname;
    const resolvedPath = path.normalize(path.join(ROOT_DIR, relativePath));

    // Prevent directory traversal outside ROOT_DIR
    if (!resolvedPath.startsWith(ROOT_DIR)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: 'Forbidden' }));
    }

    let targetPath = resolvedPath;
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
      targetPath = path.join(targetPath, 'index.html');
    }

    if (!fs.existsSync(targetPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(
        JSON.stringify({
          ok: false,
          error: 'Not Found',
          path: pathname
        })
      );
    }

    const stat = fs.statSync(targetPath);
    return serveStaticFile(req, res, targetPath, stat);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    res.end(
      JSON.stringify({
        ok: false,
        error: 'Internal Server Error',
        message: err && err.message ? err.message : String(err)
      })
    );
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log('==============================================================');
    console.log(' 🌴 GT6 RAFA: FUGA DE VICE CITY (EDTECH PT-13 EDITION) 🚔');
    console.log(` 🚀 Server running at:   http://localhost:${PORT}`);
    console.log(` 🏆 Leaderboard API:     http://localhost:${PORT}/api/leaderboard`);
    console.log(` 📡 Telemetry API:       http://localhost:${PORT}/api/telemetry`);
    console.log('==============================================================');
  });
}

module.exports = server;
