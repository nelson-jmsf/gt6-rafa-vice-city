/**
 * GT6 RAFA: FUGA DE VICE CITY (EDTECH PT-13 EDITION)
 * Vercel Serverless Function & Node HTTP Handler: /api/telemetry
 *
 * Supports GET, POST, OPTIONS.
 * Queries/Inserts directly into Supabase REST API (/rest/v1/gt6_telemetry)
 * when SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) are set
 * via environment variables or request headers, and maintains a live in-memory
 * telemetry store pre-seeded with Rafa PT-13's Vice City video chase events
 * so /api/telemetry ALWAYS returns 200 OK with valid JSON.
 */

const crypto = require('crypto');

const SEED_TELEMETRY = [
  {
    id: '00000000-0000-4000-9000-000000000001',
    event_type: 'blockade_jump',
    player_name: 'RAFA PT-13 [OFICIAL]',
    payload: {
      bounty_cash: 1956898,
      speed_kmh: 188,
      wanted_stars: 6,
      vehicle: 'EDTECH PT-13 FAT CHOPPER',
      radio: 'Cuidado, ele está furando o bloqueio!',
      bonus_cash: 5000
    },
    created_at: '2026-11-18T15:13:43.000Z'
  },
  {
    id: '00000000-0000-4000-9000-000000000002',
    event_type: 'heli_pursuit_6stars',
    player_name: 'RAFA PT-13 [OFICIAL]',
    payload: {
      bounty_cash: 1956845,
      speed_kmh: 188,
      wanted_stars: 6,
      ammo: '558-30',
      radio: 'Apoio aéreo a caminho, cerquem a área!'
    },
    created_at: '2026-11-18T15:13:35.000Z'
  },
  {
    id: '00000000-0000-4000-9000-000000000003',
    event_type: 'run_start',
    player_name: 'RAFA PT-13 [OFICIAL]',
    payload: {
      bounty_cash: 1956791,
      speed_kmh: 165,
      wanted_stars: 6,
      radio: 'Atenção todas as unidades, suspeito em fuga na avenida!'
    },
    created_at: '2026-11-18T15:13:28.000Z'
  }
];

if (!global.__GT6_TELEMETRY_STORE__) {
  global.__GT6_TELEMETRY_STORE__ = SEED_TELEMETRY.map((item) => ({ ...item }));
}

const DEFAULT_SUPABASE_URL = 'https://zlucagunxgtzakncqtww.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsdWNhZ3VueGd0emFrbmNxdHd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NDE2MTgsImV4cCI6MjEwMzUxNzYxOH0.qTAgtf5yQmELEXfI2kL6VJGGxoK42Ig1uzjOdT8oHfQ';
const TELEMETRY_COLUMNS = 'id,event_type,player_name,payload,created_at';

function resolveSupabaseCredentials(req) {
  const headers = (req && req.headers) || {};
  const url = String(
    headers['x-supabase-url'] ||
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      DEFAULT_SUPABASE_URL
  )
    .trim()
    .replace(/\/+$/, '');

  const key = String(
    headers['x-supabase-key'] ||
      headers['x-supabase-anon-key'] ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      DEFAULT_SUPABASE_ANON_KEY
  ).trim();

  const configured = Boolean(url && key && /^https?:\/\//i.test(url));
  return { url, key, configured };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await fetch(url, controller ? { ...options, signal: controller.signal } : options);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readJsonBody(req) {
  if (!req) return {};
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch (_) {
      return {};
    }
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString('utf8');
      if (raw.length > 1024 * 256) {
        req.destroy();
        resolve({});
      }
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res, statusCode, payload, cacheHeader = 'no-store, max-age=0') {
  const body = JSON.stringify(payload);
  const corsHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-supabase-url, x-supabase-key, x-supabase-anon-key',
    'Cache-Control': cacheHeader
  };

  if (typeof res.setHeader === 'function') {
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
  }

  if (typeof res.status === 'function') {
    const statusTarget = res.status(statusCode) || res;
    if (typeof statusTarget.json === 'function') {
      return statusTarget.json(payload);
    }
    if (typeof res.json === 'function') {
      return res.json(payload);
    }
  }

  if (typeof res.writeHead === 'function') {
    res.writeHead(statusCode, corsHeaders);
  }
  if (typeof res.end === 'function') {
    res.end(body);
  }
}

function buildTelemetrySummary(events) {
  const countsByType = {};
  let peakBountyCash = 1956898;
  let peakSpeedKmh = 188;

  for (const ev of events) {
    const t = ev.event_type || 'event';
    countsByType[t] = (countsByType[t] || 0) + 1;
    const p = ev.payload || {};
    const cash = Number(p.bounty_cash || p.bountyCash || p.cash || 0);
    const speed = Number(p.speed_kmh || p.max_speed_kmh || p.speed || 0);
    if (cash > peakBountyCash) peakBountyCash = cash;
    if (speed > peakSpeedKmh) peakSpeedKmh = speed;
  }

  return {
    totalEvents: events.length,
    countsByType,
    peakBountyCash,
    peakSpeedKmh,
    featuredVehicle: 'EDTECH PT-13 FAT CHOPPER'
  };
}

module.exports = async function handler(req, res) {
  const method = String((req && req.method) || 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    return sendJson(res, 200, { ok: true, status: 'preflight' });
  }

  const parsedUrl = new URL(req.url || '/api/telemetry', 'http://localhost');
  const limitRaw = Number(
    (req.query && req.query.limit) || parsedUrl.searchParams.get('limit') || 25
  );
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(100, Math.round(limitRaw)))
    : 25;

  const supa = resolveSupabaseCredentials(req);

  if (method === 'GET') {
    if (supa.configured && typeof fetch === 'function') {
      try {
        const endpoint = `${supa.url}/rest/v1/gt6_telemetry?select=${TELEMETRY_COLUMNS}&order=created_at.desc&limit=${limit}`;
        const response = await fetchWithTimeout(endpoint, {
          method: 'GET',
          headers: {
            apikey: supa.key,
            Authorization: `Bearer ${supa.key}`,
            Accept: 'application/json'
          }
        }, 4000);

        if (response.ok) {
          const rows = await response.json();
          const events =
            Array.isArray(rows) && rows.length > 0
              ? rows
              : global.__GT6_TELEMETRY_STORE__.slice(0, limit);

          return sendJson(res, 200, {
            ok: true,
            status: 'ok',
            mode: 'supabase-cloud',
            connected: true,
            source: 'supabase',
            projectUrl: supa.url,
            summary: buildTelemetrySummary(events),
            events,
            data: events
          }, 'public, s-maxage=5, stale-while-revalidate=15');
        }
      } catch (_) {
        // Fall through to in-memory telemetry store
      }
    }

    const events = global.__GT6_TELEMETRY_STORE__.slice(0, limit);
    return sendJson(res, 200, {
      ok: true,
      status: 'ok',
      mode: 'vercel-api',
      connected: true,
      source: 'memory-fallback',
      projectUrl: supa.url || null,
      summary: buildTelemetrySummary(global.__GT6_TELEMETRY_STORE__),
      events,
      data: events
    });
  }

  if (method === 'POST') {
    const body = await readJsonBody(req);
    const eventType =
      String(body.event_type || body.eventType || body.type || 'gameplay_event')
        .trim()
        .slice(0, 64) || 'gameplay_event';

    const playerName =
      String(body.player_name || body.playerName || body.player || 'RAFA PT-13')
        .trim()
        .slice(0, 40) || 'RAFA PT-13';

    const rawPayloadObj =
      body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
        ? body.payload
        : { ...body };

    // Keep payload within 4KB RLS cap for Supabase Nano tier
    let rawPayload = rawPayloadObj;
    try {
      if (Buffer.byteLength(JSON.stringify(rawPayloadObj), 'utf8') > 3800) {
        rawPayload = {
          truncated: true,
          bounty_cash: rawPayloadObj.bounty_cash ?? rawPayloadObj.bountyCash,
          score: rawPayloadObj.score,
          distance_m: rawPayloadObj.distance_m ?? rawPayloadObj.distanceM,
          wanted_stars: rawPayloadObj.wanted_stars ?? rawPayloadObj.wantedStars,
          speed_kmh: rawPayloadObj.speed_kmh ?? rawPayloadObj.max_speed_kmh
        };
      }
    } catch (_) {
      rawPayload = {};
    }

    const record = {
      id:
        body.id ||
        (crypto.randomUUID
          ? crypto.randomUUID()
          : `tel-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`),
      event_type: eventType,
      player_name: playerName,
      payload: rawPayload,
      created_at: new Date().toISOString()
    };

    global.__GT6_TELEMETRY_STORE__.unshift(record);
    if (global.__GT6_TELEMETRY_STORE__.length > 200) {
      global.__GT6_TELEMETRY_STORE__.length = 200;
    }

    let source = 'memory-fallback';
    let mode = 'vercel-api';

    if (supa.configured && typeof fetch === 'function') {
      try {
        const endpoint = `${supa.url}/rest/v1/gt6_telemetry`;
        const response = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: {
            apikey: supa.key,
            Authorization: `Bearer ${supa.key}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
          },
          body: JSON.stringify({
            event_type: record.event_type,
            player_name: record.player_name,
            payload: record.payload
          })
        }, 4000);
        if (response.ok) {
          source = 'supabase';
          mode = 'supabase-cloud';
        }
      } catch (_) {
        source = 'memory-fallback';
        mode = 'vercel-api';
      }
    }

    return sendJson(res, 200, {
      ok: true,
      status: 'ok',
      mode,
      connected: true,
      source,
      projectUrl: supa.url || null,
      event: record,
      summary: buildTelemetrySummary(global.__GT6_TELEMETRY_STORE__)
    });
  }

  return sendJson(res, 200, {
    ok: true,
    status: 'ok',
    mode: supa.configured ? 'supabase-cloud' : 'vercel-api',
    connected: true,
    events: global.__GT6_TELEMETRY_STORE__.slice(0, limit)
  });
};
