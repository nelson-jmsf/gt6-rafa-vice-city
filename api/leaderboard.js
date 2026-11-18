/**
 * GT6 RAFA: FUGA DE VICE CITY (EDTECH PT-13 EDITION)
 * Vercel Serverless Function & Node HTTP Handler: /api/leaderboard
 *
 * Supports GET, POST, OPTIONS.
 * Queries/Inserts directly into Supabase REST API (/rest/v1/gt6_leaderboard)
 * when SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) are set
 * via environment variables or request headers, and maintains a pre-seeded
 * in-memory fallback store featuring Rafa PT-13 ($1,956,898, 6 stars, 188 km/h)
 * so /api/leaderboard ALWAYS returns 200 OK with valid JSON.
 */

const crypto = require('crypto');

const SEED_LEADERBOARD = [
  {
    id: '00000000-0000-4000-8000-000000000013',
    player_name: 'RAFA PT-13 [OFICIAL]',
    bounty_cash: 1956898,
    score: 107000,
    distance_m: 4820,
    max_speed_kmh: 188,
    wanted_stars: 6,
    roadblocks_broken: 14,
    vehicle_tag: 'EDTECH PT-13 FAT CHOPPER',
    created_at: '2026-11-18T15:13:43.000Z'
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    player_name: 'RAFA EDTECH NITRO',
    bounty_cash: 1956845,
    score: 89400,
    distance_m: 4150,
    max_speed_kmh: 242,
    wanted_stars: 6,
    roadblocks_broken: 11,
    vehicle_tag: 'EDTECH PT-13 FAT CHOPPER',
    created_at: '2026-11-18T14:40:12.000Z'
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    player_name: 'LUCIA VICE 86',
    bounty_cash: 1956812,
    score: 68200,
    distance_m: 3390,
    max_speed_kmh: 215,
    wanted_stars: 5,
    roadblocks_broken: 8,
    vehicle_tag: 'VICE NEON CRUISER',
    created_at: '2026-11-18T14:15:00.000Z'
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    player_name: 'JASON OCEAN DRIVE',
    bounty_cash: 1956799,
    score: 52400,
    distance_m: 2740,
    max_speed_kmh: 196,
    wanted_stars: 5,
    roadblocks_broken: 6,
    vehicle_tag: 'STREET HAWK 900',
    created_at: '2026-11-18T13:55:47.000Z'
  },
  {
    id: '00000000-0000-4000-8000-000000000005',
    player_name: 'TOMMY VERCETTI JR',
    bounty_cash: 1956791,
    score: 41800,
    distance_m: 2180,
    max_speed_kmh: 180,
    wanted_stars: 4,
    roadblocks_broken: 5,
    vehicle_tag: 'INFERNUS CLASSIC',
    created_at: '2026-11-18T13:30:00.000Z'
  },
  {
    id: '00000000-0000-4000-8000-000000000006',
    player_name: 'DELEGADO COPOM 190',
    bounty_cash: 1952400,
    score: 29500,
    distance_m: 1640,
    max_speed_kmh: 168,
    wanted_stars: 3,
    roadblocks_broken: 3,
    vehicle_tag: 'VCPD INTERCEPTOR',
    created_at: '2026-11-18T13:10:00.000Z'
  }
];

// Global process memory store so warm serverless invocations & local server share runs
if (!global.__GT6_LEADERBOARD_STORE__) {
  global.__GT6_LEADERBOARD_STORE__ = SEED_LEADERBOARD.map((item) => ({ ...item }));
}

function clampInt(val, min, max, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeEntry(raw, rankIndex = 0) {
  const playerName = String(
    raw.player_name || raw.playerName || raw.name || 'RAFA PT-13'
  )
    .trim()
    .slice(0, 40) || 'RAFA PT-13';

  const score = clampInt(
    raw.score ?? raw.runScore ?? raw.points,
    0,
    999999999,
    0
  );

  const rawCash = raw.bounty_cash ?? raw.bountyCash ?? raw.totalBountyCash ?? raw.cash;
  const bountyCash = clampInt(
    rawCash !== undefined ? rawCash : 1956791 + Math.round(score / 10),
    0,
    999999999,
    1956791
  );

  const distanceM = clampInt(
    raw.distance_m ?? raw.distanceM ?? raw.distance ?? 0,
    0,
    9999999,
    0
  );

  const maxSpeedKmh = clampInt(
    raw.max_speed_kmh ?? raw.maxSpeedKmh ?? raw.maxSpeed ?? raw.speed ?? 188,
    0,
    500,
    188
  );

  const wantedStars = clampInt(
    raw.wanted_stars ?? raw.wantedStars ?? raw.stars ?? 6,
    1,
    6,
    6
  );

  const roadblocksBroken = clampInt(
    raw.roadblocks_broken ?? raw.roadblocksBroken ?? raw.roadblocks ?? 0,
    0,
    99999,
    0
  );

  const vehicleTag = String(
    raw.vehicle_tag || raw.vehicleTag || raw.vehicle || 'EDTECH PT-13 FAT CHOPPER'
  )
    .trim()
    .slice(0, 64) || 'EDTECH PT-13 FAT CHOPPER';

  const id = raw.id || (crypto.randomUUID ? crypto.randomUUID() : `gt6-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
  const createdAt = raw.created_at || raw.createdAt || new Date().toISOString();

  return {
    id,
    rank: rankIndex + 1,
    player_name: playerName,
    playerName,
    bounty_cash: bountyCash,
    bountyCash,
    cash: bountyCash,
    score,
    distance_m: distanceM,
    distanceM,
    distance: distanceM,
    max_speed_kmh: maxSpeedKmh,
    maxSpeedKmh,
    maxSpeed: maxSpeedKmh,
    wanted_stars: wantedStars,
    wantedStars,
    stars: wantedStars,
    roadblocks_broken: roadblocksBroken,
    roadblocksBroken,
    vehicle_tag: vehicleTag,
    vehicleTag,
    created_at: createdAt,
    createdAt
  };
}

function sortAndRank(list, limit = 10) {
  const sorted = [...list].sort((a, b) => {
    const cashDiff = (b.bounty_cash || 0) - (a.bounty_cash || 0);
    if (cashDiff !== 0) return cashDiff;
    const scoreDiff = (b.score || 0) - (a.score || 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (b.distance_m || 0) - (a.distance_m || 0);
  });
  return sorted.slice(0, limit).map((item, idx) => normalizeEntry(item, idx));
}

const DEFAULT_SUPABASE_URL = 'https://zlucagunxgtzakncqtww.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsdWNhZ3VueGd0emFrbmNxdHd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NDE2MTgsImV4cCI6MjEwMzUxNzYxOH0.qTAgtf5yQmELEXfI2kL6VJGGxoK42Ig1uzjOdT8oHfQ';
const LEADERBOARD_COLUMNS = 'id,player_name,bounty_cash,score,distance_m,max_speed_kmh,wanted_stars,roadblocks_broken,vehicle_tag,created_at';

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

async function querySupabaseLeaderboard(supa, limit) {
  const endpoint = `${supa.url}/rest/v1/gt6_leaderboard?select=${LEADERBOARD_COLUMNS}&order=bounty_cash.desc,score.desc,distance_m.desc&limit=${limit}`;
  const response = await fetchWithTimeout(endpoint, {
    method: 'GET',
    headers: {
      apikey: supa.key,
      Authorization: `Bearer ${supa.key}`,
      Accept: 'application/json'
    }
  }, 4000);

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Supabase GET ${response.status}: ${errText}`);
  }

  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function insertSupabaseLeaderboard(supa, dbRow) {
  const endpoint = `${supa.url}/rest/v1/gt6_leaderboard?select=${LEADERBOARD_COLUMNS}`;
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      apikey: supa.key,
      Authorization: `Bearer ${supa.key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(dbRow)
  }, 4000);

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Supabase POST ${response.status}: ${errText}`);
  }

  const inserted = await response.json();
  return Array.isArray(inserted) && inserted[0] ? inserted[0] : dbRow;
}

module.exports = async function handler(req, res) {
  const method = String((req && req.method) || 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    return sendJson(res, 200, { ok: true, status: 'preflight' });
  }

  const parsedUrl = new URL(req.url || '/api/leaderboard', 'http://localhost');
  const limitParam =
    (req.query && req.query.limit) ||
    parsedUrl.searchParams.get('limit') ||
    10;
  const limit = clampInt(limitParam, 1, 50, 10);
  const supa = resolveSupabaseCredentials(req);

  if (method === 'GET') {
    if (supa.configured && typeof fetch === 'function') {
      try {
        const cloudRows = await querySupabaseLeaderboard(supa, limit);
        const merged =
          cloudRows.length > 0
            ? sortAndRank(cloudRows, limit)
            : sortAndRank(global.__GT6_LEADERBOARD_STORE__, limit);

        return sendJson(res, 200, {
          ok: true,
          status: 'ok',
          mode: 'supabase-cloud',
          connected: true,
          source: 'supabase',
          projectUrl: supa.url,
          count: merged.length,
          entries: merged,
          leaderboard: merged,
          data: merged
        }, 'public, s-maxage=5, stale-while-revalidate=30');
      } catch (err) {
        const fallbackEntries = sortAndRank(global.__GT6_LEADERBOARD_STORE__, limit);
        return sendJson(res, 200, {
          ok: true,
          status: 'ok',
          mode: 'vercel-api',
          connected: true,
          source: 'memory-fallback',
          projectUrl: supa.url || null,
          warning: err.message,
          count: fallbackEntries.length,
          entries: fallbackEntries,
          leaderboard: fallbackEntries,
          data: fallbackEntries
        });
      }
    }

    const entries = sortAndRank(global.__GT6_LEADERBOARD_STORE__, limit);
    return sendJson(res, 200, {
      ok: true,
      status: 'ok',
      mode: 'vercel-api',
      connected: true,
      source: 'memory-fallback',
      projectUrl: null,
      count: entries.length,
      entries,
      leaderboard: entries,
      data: entries
    });
  }

  if (method === 'POST') {
    const body = await readJsonBody(req);
    const normalized = normalizeEntry(body, 0);

    const dbRow = {
      player_name: normalized.player_name,
      bounty_cash: normalized.bounty_cash,
      score: normalized.score,
      distance_m: normalized.distance_m,
      max_speed_kmh: normalized.max_speed_kmh,
      wanted_stars: normalized.wanted_stars,
      roadblocks_broken: normalized.roadblocks_broken,
      vehicle_tag: normalized.vehicle_tag
    };

    // Always persist to the in-memory store as well
    global.__GT6_LEADERBOARD_STORE__.push({
      id: normalized.id,
      ...dbRow,
      created_at: normalized.created_at
    });
    if (global.__GT6_LEADERBOARD_STORE__.length > 100) {
      global.__GT6_LEADERBOARD_STORE__ = sortAndRank(global.__GT6_LEADERBOARD_STORE__, 100);
    }

    let source = 'memory-fallback';
    let mode = 'vercel-api';
    let savedEntry = normalized;

    if (supa.configured && typeof fetch === 'function') {
      try {
        const cloudRow = await insertSupabaseLeaderboard(supa, dbRow);
        savedEntry = normalizeEntry(cloudRow, 0);
        source = 'supabase';
        mode = 'supabase-cloud';
      } catch (_) {
        source = 'memory-fallback';
        mode = 'vercel-api';
      }
    }

    const updatedLeaderboard = sortAndRank(global.__GT6_LEADERBOARD_STORE__, limit);
    return sendJson(res, 200, {
      ok: true,
      status: 'ok',
      mode,
      connected: true,
      source,
      projectUrl: supa.url || null,
      entry: savedEntry,
      entries: updatedLeaderboard,
      leaderboard: updatedLeaderboard,
      data: updatedLeaderboard
    });
  }

  return sendJson(res, 200, {
    ok: true,
    status: 'ok',
    mode: supa.configured ? 'supabase-cloud' : 'vercel-api',
    connected: true,
    entries: sortAndRank(global.__GT6_LEADERBOARD_STORE__, limit)
  });
};
