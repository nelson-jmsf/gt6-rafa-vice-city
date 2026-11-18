/**
 * GT6 RAFA: FUGA DE VICE CITY (EDTECH PT-13 EDITION)
 * Hybrid Cloud Backend Client (window.GT6Backend)
 *
 * Connects to:
 * 1. Supabase REST & Realtime (/rest/v1/gt6_leaderboard & /rest/v1/gt6_telemetry)
 *    when SUPABASE_URL & SUPABASE_ANON_KEY are configured via window.GT6_CONFIG,
 *    localStorage, or the in-game Supabase Config modal.
 * 2. Vercel Serverless / Node Local API (/api/leaderboard & /api/telemetry).
 * 3. Browser localStorage offline cache pre-seeded with Rafa PT-13's video run
 *    ($1,956,898, 6 Wanted Stars, 188 km/h, EDTECH PT-13 FAT CHOPPER).
 */
(function (window) {
  'use strict';

  const DEFAULT_SUPABASE_URL = 'https://zlucagunxgtzakncqtww.supabase.co';
  const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsdWNhZ3VueGd0emFrbmNxdHd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NDE2MTgsImV4cCI6MjEwMzUxNzYxOH0.qTAgtf5yQmELEXfI2kL6VJGGxoK42Ig1uzjOdT8oHfQ';
  const LEADERBOARD_SELECT = 'id,player_name,bounty_cash,score,distance_m,max_speed_kmh,wanted_stars,roadblocks_broken,vehicle_tag,created_at';

  const STORAGE_KEYS = {
    CONFIG: 'gt6_rafa_supabase_config_v1',
    LEADERBOARD: 'gt6_rafa_leaderboard_cache_v1',
    TELEMETRY: 'gt6_rafa_telemetry_cache_v1',
    PLAYER_NAME: 'gt6_rafa_player_name_v1'
  };

  const DEFAULT_SEED_LEADERBOARD = [
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

  function clampInt(val, min, max, fallback) {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function safeJsonParse(raw, fallback) {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function safeStorageGet(key, fallback = null) {
    try {
      const val = window.localStorage.getItem(key);
      return val !== null ? val : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function safeStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  function normalizeEntry(raw = {}, index = 0) {
    const playerName =
      String(raw.player_name || raw.playerName || raw.name || 'RAFA PT-13')
        .trim()
        .slice(0, 40) || 'RAFA PT-13';

    const score = clampInt(
      raw.score ?? raw.runScore ?? raw.points ?? 0,
      0,
      999999999,
      0
    );

    const rawCash =
      raw.bounty_cash ?? raw.bountyCash ?? raw.totalBountyCash ?? raw.cash;
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

    const vehicleTag =
      String(
        raw.vehicle_tag ||
          raw.vehicleTag ||
          raw.vehicle ||
          'EDTECH PT-13 FAT CHOPPER'
      )
        .trim()
        .slice(0, 64) || 'EDTECH PT-13 FAT CHOPPER';

    const id =
      raw.id ||
      `gt6-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const createdAt =
      raw.created_at || raw.createdAt || new Date().toISOString();

    return {
      id,
      rank: index + 1,
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

  function sortAndDedupeEntries(entries, limit = 10) {
    const map = new Map();
    for (const item of entries) {
      if (!item) continue;
      const norm = normalizeEntry(item);
      const dedupeKey =
        norm.id ||
        `${norm.player_name}:${norm.bounty_cash}:${norm.score}:${norm.distance_m}`;
      const existing = map.get(dedupeKey);
      if (!existing || norm.bounty_cash >= existing.bounty_cash) {
        map.set(dedupeKey, norm);
      }
    }

    const sorted = Array.from(map.values()).sort((a, b) => {
      if (b.bounty_cash !== a.bounty_cash) return b.bounty_cash - a.bounty_cash;
      if (b.score !== a.score) return b.score - a.score;
      return b.distance_m - a.distance_m;
    });

    return sorted.slice(0, limit).map((item, idx) => normalizeEntry(item, idx));
  }

  function decorateEntriesArray(arr, statusObj) {
    try {
      Object.defineProperties(arr, {
        entries: { value: arr, enumerable: false, configurable: true },
        leaderboard: { value: arr, enumerable: false, configurable: true },
        data: { value: arr, enumerable: false, configurable: true },
        status: { value: statusObj, enumerable: false, configurable: true },
        mode: { value: statusObj.mode, enumerable: false, configurable: true },
        ok: { value: true, enumerable: false, configurable: true }
      });
    } catch (_) {
      // Ignore if environment freezes Array prototype
    }
    return arr;
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
    if (typeof window.fetch !== 'function') {
      throw new Error('fetch unavailable');
    }
    const AbortCtrl = typeof AbortController === 'function' ? AbortController : null;
    const controller = AbortCtrl ? new AbortCtrl() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      return await window.fetch(
        url,
        controller ? { ...options, signal: controller.signal } : options
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function compactTelemetryPayload(data) {
    const obj = data && typeof data === 'object' && !Array.isArray(data) ? data : { value: data };
    try {
      const json = JSON.stringify(obj);
      if (json.length <= 3800) return obj;
      return {
        truncated: true,
        bounty_cash: obj.bounty_cash ?? obj.bountyCash,
        score: obj.score,
        distance_m: obj.distance_m ?? obj.distanceM,
        wanted_stars: obj.wanted_stars ?? obj.wantedStars,
        speed_kmh: obj.speed_kmh ?? obj.max_speed_kmh
      };
    } catch (_) {
      return {};
    }
  }

  const GT6Backend = {
    state: {
      initialized: false,
      mode: 'vercel-api', // 'supabase-cloud' | 'vercel-api' | 'hybrid-local'
      connected: true,
      projectUrl: null,
      anonKey: null,
      apiReachable: true,
      lastSyncAt: null
    },

    cachedLeaderboard: DEFAULT_SEED_LEADERBOARD.map((item, idx) =>
      normalizeEntry(item, idx)
    ),
    cachedTelemetry: [],
    _realtimeSocket: null,
    _realtimeDebounceTimer: null,
    _realtimeIdleTimer: null,
    _realtimeLazyTimer: null,
    _lifecycleBound: false,
    _inFlightLeaderboard: null,
    _inFlightLimit: 0,
    _lastFetchAt: 0,
    _lastFetchLimit: 0,
    _lastTelemetryAt: 0,
    _pendingEndRunTimer: null,
    _listeners: [],

    /**
     * Initializes GT6Backend: loads stored Supabase config + cached leaderboard,
     * syncs with /api/leaderboard (and Supabase REST if configured).
     */
    async init(options = {}) {
      this._loadStoredConfig(options);
      this._loadLocalCaches();
      this._bindLifecycleHooks();
      this.state.initialized = true;

      try {
        await this.fetchLeaderboard(options.limit || 10, { force: true });
      } catch (_) {
        // Keep seeded local cache
      }

      // Lazy Realtime: only connect after initial sync confirms supabase-cloud & menu is open
      if (this.state.mode === 'supabase-cloud') {
        this._scheduleLazyRealtime(800);
      }

      return {
        ok: true,
        status: this.getStatus(),
        entries: this.cachedLeaderboard
      };
    },

    /**
     * Returns current connection mode and project metadata.
     * Guaranteed shape: { mode: 'supabase-cloud' | 'vercel-api' | 'hybrid-local', connected: true, projectUrl }
     */
    getStatus() {
      const hasSupa = this._hasSupabaseCredentials();
      let mode = this.state.mode;
      if (!['supabase-cloud', 'vercel-api', 'hybrid-local'].includes(mode)) {
        mode = hasSupa
          ? 'supabase-cloud'
          : this.state.apiReachable
          ? 'vercel-api'
          : 'hybrid-local';
      }

      const labelMap = {
        'supabase-cloud': 'SUPABASE CLOUD REALTIME',
        'vercel-api': 'VERCEL EDGE API ONLINE',
        'hybrid-local': 'HYBRID LOCAL CACHE'
      };

      return {
        mode,
        connected: true,
        projectUrl: this.state.projectUrl || null,
        supabaseConfigured: hasSupa,
        apiReachable: this.state.apiReachable,
        realtimeConnected: Boolean(
          this._realtimeSocket && this._realtimeSocket.readyState === 1
        ),
        label: labelMap[mode] || 'VERCEL EDGE API ONLINE',
        lastSyncAt: this.state.lastSyncAt
      };
    },

    /**
     * Configures or clears Supabase project URL & anon key at runtime.
     */
    async configureSupabase(url, anonKey) {
      const cleanUrl = String(url || '')
        .trim()
        .replace(/\/+$/, '');
      const cleanKey = String(anonKey || '').trim();

      this._lastFetchAt = 0;

      if (!cleanUrl || !cleanKey) {
        this.state.projectUrl = null;
        this.state.anonKey = null;
        this.state.mode = this.state.apiReachable ? 'vercel-api' : 'hybrid-local';
        safeStorageSet(
          STORAGE_KEYS.CONFIG,
          JSON.stringify({ url: '', anonKey: '' })
        );
        this._closeRealtimeSubscription();
        const entries = await this.fetchLeaderboard(10, { force: true });
        return { ok: true, status: this.getStatus(), entries };
      }

      this.state.projectUrl = cleanUrl;
      this.state.anonKey = cleanKey;
      this.state.mode = 'supabase-cloud';

      safeStorageSet(
        STORAGE_KEYS.CONFIG,
        JSON.stringify({ url: cleanUrl, anonKey: cleanKey })
      );

      if (window.GT6_CONFIG && typeof window.GT6_CONFIG === 'object') {
        window.GT6_CONFIG.SUPABASE_URL = cleanUrl;
        window.GT6_CONFIG.SUPABASE_ANON_KEY = cleanKey;
      }

      const entries = await this.fetchLeaderboard(10, { force: true });
      if (this.state.mode === 'supabase-cloud') {
        this._scheduleLazyRealtime(400);
      }
      return {
        ok: true,
        status: this.getStatus(),
        entries
      };
    },

    /**
     * Fetches the top leaderboard runs without duplicate queries:
     * - Coalesces concurrent in-flight requests
     * - Serves 3-second TTL memory cache for rapid sequential calls
     * - Queries /api/leaderboard first (Edge-cached on Vercel) and falls back
     *   to direct Supabase REST only if /api/leaderboard is unavailable.
     */
    async fetchLeaderboard(limit = 10, options = {}) {
      const safeLimit = clampInt(limit, 1, 50, 10);
      const force = Boolean(options && options.force);
      const now = Date.now();

      if (
        !force &&
        this._lastFetchAt &&
        now - this._lastFetchAt < 3000 &&
        safeLimit <= this._lastFetchLimit &&
        this.cachedLeaderboard.length > 0
      ) {
        return decorateEntriesArray(
          this.cachedLeaderboard.slice(0, safeLimit),
          this.getStatus()
        );
      }

      if (
        !force &&
        this._inFlightLeaderboard &&
        safeLimit <= this._inFlightLimit
      ) {
        const shared = await this._inFlightLeaderboard;
        return decorateEntriesArray(shared.slice(0, safeLimit), this.getStatus());
      }

      const fetchTask = (async () => {
        let remoteRows = [];
        let resolvedMode = this.state.mode;
        let syncedWithSupabase = false;

        // 1. Primary path: Vercel Edge / Local Serverless API (/api/leaderboard)
        if (typeof window.fetch === 'function') {
          try {
            const headers = { Accept: 'application/json' };
            if (this._hasSupabaseCredentials()) {
              headers['x-supabase-url'] = this.state.projectUrl;
              headers['x-supabase-key'] = this.state.anonKey;
            }
            const apiRes = await fetchWithTimeout(
              `/api/leaderboard?limit=${safeLimit}`,
              {
                method: 'GET',
                headers
              },
              4000
            );
            if (apiRes.ok) {
              const payload = await apiRes.json();
              this.state.apiReachable = true;
              if (payload && payload.projectUrl && !this.state.projectUrl) {
                this.state.projectUrl = payload.projectUrl;
              }
              const apiEntries =
                (payload && (payload.entries || payload.leaderboard || payload.data)) ||
                [];
              if (Array.isArray(apiEntries) && apiEntries.length > 0) {
                remoteRows = apiEntries;
              }
              if (payload && payload.mode === 'supabase-cloud') {
                resolvedMode = 'supabase-cloud';
                syncedWithSupabase = true;
              } else {
                resolvedMode = 'vercel-api';
              }
            }
          } catch (_) {
            this.state.apiReachable = false;
          }
        }

        // 2. Fallback path: Direct Supabase REST only if /api/leaderboard did not already sync
        if (!syncedWithSupabase && this._hasSupabaseCredentials() && typeof window.fetch === 'function') {
          try {
            const endpoint = `${this.state.projectUrl}/rest/v1/gt6_leaderboard?select=${LEADERBOARD_SELECT}&order=bounty_cash.desc,score.desc,distance_m.desc&limit=${safeLimit}`;
            const res = await fetchWithTimeout(
              endpoint,
              {
                method: 'GET',
                headers: {
                  apikey: this.state.anonKey,
                  Authorization: `Bearer ${this.state.anonKey}`,
                  Accept: 'application/json'
                }
              },
              4000
            );
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data) && data.length > 0) {
                remoteRows = [...data, ...remoteRows];
                resolvedMode = 'supabase-cloud';
              }
            }
          } catch (_) {
            if (resolvedMode !== 'vercel-api') {
              resolvedMode = 'hybrid-local';
            }
          }
        }

        this.state.mode = resolvedMode;
        this.state.lastSyncAt = new Date().toISOString();
        this._lastFetchAt = Date.now();
        this._lastFetchLimit = safeLimit;

        const combined = sortAndDedupeEntries(
          [...remoteRows, ...this.cachedLeaderboard, ...DEFAULT_SEED_LEADERBOARD],
          safeLimit
        );

        this.cachedLeaderboard = combined;
        this._saveLeaderboardCache();
        this._emitUpdate();

        return decorateEntriesArray(combined, this.getStatus());
      })();

      this._inFlightLeaderboard = fetchTask;
      this._inFlightLimit = safeLimit;
      try {
        return await fetchTask;
      } finally {
        if (this._inFlightLeaderboard === fetchTask) {
          this._inFlightLeaderboard = null;
          this._inFlightLimit = 0;
        }
      }
    },

    /**
     * Submits a completed or busted Vice City run without duplicate inserts:
     * Submits via /api/leaderboard first, falling back to direct Supabase REST only if needed.
     */
    async submitScore(runData = {}) {
      const entry = normalizeEntry(runData, 0);

      if (entry.player_name) {
        safeStorageSet(STORAGE_KEYS.PLAYER_NAME, entry.player_name);
      }

      this.cachedLeaderboard = sortAndDedupeEntries(
        [entry, ...this.cachedLeaderboard],
        25
      );
      this._saveLeaderboardCache();
      this._lastFetchAt = Date.now();
      this._lastFetchLimit = Math.max(this._lastFetchLimit, 10);

      const dbPayload = {
        player_name: entry.player_name,
        bounty_cash: entry.bounty_cash,
        score: entry.score,
        distance_m: entry.distance_m,
        max_speed_kmh: entry.max_speed_kmh,
        wanted_stars: entry.wanted_stars,
        roadblocks_broken: entry.roadblocks_broken,
        vehicle_tag: entry.vehicle_tag
      };

      let insertedInSupabase = false;

      // 1. Primary path: Submit to /api/leaderboard serverless endpoint
      if (typeof window.fetch === 'function') {
        try {
          const headers = { 'Content-Type': 'application/json' };
          if (this._hasSupabaseCredentials()) {
            headers['x-supabase-url'] = this.state.projectUrl;
            headers['x-supabase-key'] = this.state.anonKey;
          }
          const apiRes = await fetchWithTimeout(
            '/api/leaderboard',
            {
              method: 'POST',
              headers,
              body: JSON.stringify(dbPayload)
            },
            4000
          );
          if (apiRes.ok) {
            const data = await apiRes.json();
            this.state.apiReachable = true;
            if (data && data.mode === 'supabase-cloud') {
              this.state.mode = 'supabase-cloud';
              insertedInSupabase = true;
            } else {
              this.state.mode = 'vercel-api';
            }
            if (data && Array.isArray(data.entries)) {
              this.cachedLeaderboard = sortAndDedupeEntries(
                [...data.entries, ...this.cachedLeaderboard],
                25
              );
              this._saveLeaderboardCache();
              this._lastFetchAt = Date.now();
              this._lastFetchLimit = Math.max(this._lastFetchLimit, 10);
            }
          }
        } catch (_) {
          this.state.apiReachable = false;
        }
      }

      // 2. Fallback path: Direct Supabase REST insert only if /api/leaderboard did not already insert
      if (!insertedInSupabase && this._hasSupabaseCredentials() && typeof window.fetch === 'function') {
        try {
          const endpoint = `${this.state.projectUrl}/rest/v1/gt6_leaderboard?select=${LEADERBOARD_SELECT}`;
          const supaRes = await fetchWithTimeout(
            endpoint,
            {
              method: 'POST',
              headers: {
                apikey: this.state.anonKey,
                Authorization: `Bearer ${this.state.anonKey}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation'
              },
              body: JSON.stringify(dbPayload)
            },
            4000
          );
          if (supaRes.ok) {
            this.state.mode = 'supabase-cloud';
          }
        } catch (_) {
          if (this.state.mode !== 'vercel-api') {
            this.state.mode = 'hybrid-local';
          }
        }
      }

      // 3. Defer run_submitted telemetry slightly so it cancels if 'busted' logs right beside it
      if (this._pendingEndRunTimer) {
        clearTimeout(this._pendingEndRunTimer);
      }
      this._pendingEndRunTimer = setTimeout(() => {
        this._pendingEndRunTimer = null;
        this.logTelemetry('run_submitted', {
          player_name: entry.player_name,
          bounty_cash: entry.bounty_cash,
          score: entry.score,
          distance_m: entry.distance_m,
          max_speed_kmh: entry.max_speed_kmh,
          wanted_stars: entry.wanted_stars,
          roadblocks_broken: entry.roadblocks_broken
        });
      }, 250);

      if (this.state.mode === 'supabase-cloud') {
        this._scheduleLazyRealtime(800);
      }

      this._emitUpdate();
      const topEntries = this.cachedLeaderboard.slice(0, 10);

      return {
        ok: true,
        status: this.getStatus(),
        entry,
        entries: topEntries,
        leaderboard: topEntries,
        data: topEntries
      };
    },

    /**
     * Logs a gameplay telemetry event with 2.5s rate-limit throttling, 4KB payload cap,
     * and single-path delivery so the Supabase Nano instance never hits write bottlenecks.
     */
    async logTelemetry(eventType, payload = {}) {
      let type = eventType;
      let data = payload;

      if (typeof eventType === 'object' && eventType !== null) {
        type = eventType.event_type || eventType.eventType || 'gameplay_event';
        data = eventType.payload || eventType;
      }

      const cleanType =
        String(type || 'gameplay_event')
          .trim()
          .slice(0, 64) || 'gameplay_event';

      // Close idle Realtime WebSocket during active racing; lazily reopen on game end
      if (cleanType === 'run_started' || cleanType === 'run_start') {
        this._closeRealtimeSubscription();
      } else if (cleanType === 'busted') {
        if (this._pendingEndRunTimer) {
          clearTimeout(this._pendingEndRunTimer);
          this._pendingEndRunTimer = null;
        }
        if (this.state.mode === 'supabase-cloud') {
          this._scheduleLazyRealtime(900);
        }
      }

      const nowMs = Date.now();
      const isCritical = cleanType === 'run_submitted' || cleanType === 'busted' || cleanType === 'run_start' || cleanType === 'run_started';
      if (!isCritical && this._lastTelemetryAt && nowMs - this._lastTelemetryAt < 2500) {
        return { ok: true, throttled: true };
      }
      this._lastTelemetryAt = nowMs;

      const playerName =
        String(
          (data && (data.player_name || data.playerName)) ||
            safeStorageGet(STORAGE_KEYS.PLAYER_NAME, 'RAFA PT-13') ||
            'RAFA PT-13'
        )
          .trim()
          .slice(0, 40) || 'RAFA PT-13';

      const eventRecord = {
        id: `tel-${nowMs}-${Math.random().toString(16).slice(2, 7)}`,
        event_type: cleanType,
        player_name: playerName,
        payload: compactTelemetryPayload(data),
        created_at: new Date().toISOString()
      };

      this.cachedTelemetry.unshift(eventRecord);
      if (this.cachedTelemetry.length > 50) {
        this.cachedTelemetry.length = 50;
      }
      safeStorageSet(
        STORAGE_KEYS.TELEMETRY,
        JSON.stringify(this.cachedTelemetry)
      );

      // Single-path delivery via /api/telemetry, with direct Supabase REST fallback on error
      if (typeof window.fetch === 'function') {
        const headers = { 'Content-Type': 'application/json' };
        if (this._hasSupabaseCredentials()) {
          headers['x-supabase-url'] = this.state.projectUrl;
          headers['x-supabase-key'] = this.state.anonKey;
        }
        fetchWithTimeout(
          '/api/telemetry',
          {
            method: 'POST',
            headers,
            body: JSON.stringify(eventRecord)
          },
          4000
        )
          .then((res) => {
            if (!res.ok && this._hasSupabaseCredentials()) {
              return fetchWithTimeout(
                `${this.state.projectUrl}/rest/v1/gt6_telemetry`,
                {
                  method: 'POST',
                  headers: {
                    apikey: this.state.anonKey,
                    Authorization: `Bearer ${this.state.anonKey}`,
                    'Content-Type': 'application/json',
                    Prefer: 'return=minimal'
                  },
                  body: JSON.stringify({
                    event_type: eventRecord.event_type,
                    player_name: eventRecord.player_name,
                    payload: eventRecord.payload
                  })
                },
                4000
              );
            }
          })
          .catch(() => {});
      }

      return { ok: true, event: eventRecord };
    },

    // Convenient aliases for compatibility across modules
    getLeaderboard(limit = 10) {
      return this.fetchLeaderboard(limit);
    },

    saveScore(runData) {
      return this.submitScore(runData);
    },

    trackEvent(eventType, payload) {
      return this.logTelemetry(eventType, payload);
    },

    connectRealtime() {
      this._initRealtimeSubscription();
    },

    disconnectRealtime() {
      this._closeRealtimeSubscription();
    },

    onUpdate(listener) {
      if (typeof listener === 'function') {
        this._listeners.push(listener);
      }
    },

    _emitUpdate() {
      const status = this.getStatus();
      const top = this.cachedLeaderboard.slice(0, 10);
      for (const fn of this._listeners) {
        try {
          fn(top, status);
        } catch (_) {}
      }
    },

    _hasSupabaseCredentials() {
      return Boolean(
        this.state.projectUrl &&
          this.state.anonKey &&
          /^https?:\/\//i.test(this.state.projectUrl)
      );
    },

    _loadStoredConfig(options = {}) {
      const winCfg = window.GT6_CONFIG || window.__GT6_SUPABASE__ || {};
      const storedCfg = safeJsonParse(safeStorageGet(STORAGE_KEYS.CONFIG), {});

      const url = String(
        options.supabaseUrl ||
          options.url ||
          winCfg.SUPABASE_URL ||
          winCfg.supabaseUrl ||
          storedCfg.url ||
          DEFAULT_SUPABASE_URL
      )
        .trim()
        .replace(/\/+$/, '');

      const anonKey = String(
        options.supabaseAnonKey ||
          options.anonKey ||
          winCfg.SUPABASE_ANON_KEY ||
          winCfg.supabaseAnonKey ||
          storedCfg.anonKey ||
          DEFAULT_SUPABASE_ANON_KEY
      ).trim();

      if (url && anonKey) {
        this.state.projectUrl = url;
        this.state.anonKey = anonKey;
        this.state.mode = 'supabase-cloud';
      } else {
        this.state.projectUrl = null;
        this.state.anonKey = null;
        this.state.mode = 'vercel-api';
      }
    },

    _loadLocalCaches() {
      const cachedLb = safeJsonParse(
        safeStorageGet(STORAGE_KEYS.LEADERBOARD),
        null
      );
      if (Array.isArray(cachedLb) && cachedLb.length > 0) {
        this.cachedLeaderboard = sortAndDedupeEntries(
          [...cachedLb, ...DEFAULT_SEED_LEADERBOARD],
          25
        );
      } else {
        this.cachedLeaderboard = sortAndDedupeEntries(
          DEFAULT_SEED_LEADERBOARD,
          25
        );
      }

      const cachedTel = safeJsonParse(
        safeStorageGet(STORAGE_KEYS.TELEMETRY),
        null
      );
      if (Array.isArray(cachedTel)) {
        this.cachedTelemetry = cachedTel.slice(0, 50);
      }
    },

    _saveLeaderboardCache() {
      safeStorageSet(
        STORAGE_KEYS.LEADERBOARD,
        JSON.stringify(this.cachedLeaderboard.slice(0, 25))
      );
    },

    _bindLifecycleHooks() {
      if (this._lifecycleBound) return;
      this._lifecycleBound = true;
      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            this._closeRealtimeSubscription();
          } else if (this._shouldKeepRealtimeOpen()) {
            this._scheduleLazyRealtime(1000);
          }
        });
      }
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('pagehide', () => this._closeRealtimeSubscription());
      }
    },

    _shouldKeepRealtimeOpen() {
      if (this.state.mode !== 'supabase-cloud' || !this._hasSupabaseCredentials()) {
        return false;
      }
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return false;
      }
      const gameMode = window.GT6Game && window.GT6Game.state && window.GT6Game.state.mode;
      if (gameMode === 'PLAYING') {
        return false;
      }
      return true;
    },

    _scheduleLazyRealtime(delayMs = 800) {
      clearTimeout(this._realtimeLazyTimer);
      this._realtimeLazyTimer = setTimeout(() => {
        if (this._shouldKeepRealtimeOpen()) {
          this._initRealtimeSubscription();
        }
      }, delayMs);
    },

    _initRealtimeSubscription() {
      this._closeRealtimeSubscription();
      if (!this._shouldKeepRealtimeOpen() || typeof window.WebSocket !== 'function') {
        return;
      }
      try {
        const wsBase = this.state.projectUrl.replace(/^http/i, 'ws');
        const wsUrl = `${wsBase}/realtime/v1/websocket?apikey=${encodeURIComponent(
          this.state.anonKey
        )}&vsn=1.0.0`;
        const ws = new window.WebSocket(wsUrl);
        this._realtimeSocket = ws;

        // Auto-close idle Realtime connection after 60s to preserve Nano tier slots
        clearTimeout(this._realtimeIdleTimer);
        this._realtimeIdleTimer = setTimeout(() => {
          this._closeRealtimeSubscription();
        }, 60000);

        ws.onopen = () => {
          if (this._realtimeSocket !== ws) return;
          const joinMsg = {
            topic: 'realtime:public:gt6_leaderboard',
            event: 'phx_join',
            payload: {
              config: {
                postgres_changes: [
                  {
                    event: '*',
                    schema: 'public',
                    table: 'gt6_leaderboard'
                  }
                ]
              }
            },
            ref: '1'
          };
          ws.send(JSON.stringify(joinMsg));
        };

        ws.onmessage = (evt) => {
          const msg = safeJsonParse(evt.data, null);
          if (
            msg &&
            (msg.event === 'postgres_changes' || msg.event === 'INSERT')
          ) {
            clearTimeout(this._realtimeDebounceTimer);
            this._realtimeDebounceTimer = setTimeout(() => {
              this.fetchLeaderboard(10, { force: true }).catch(() => {});
            }, 3000);
          }
        };

        ws.onerror = () => {
          this._closeRealtimeSubscription();
        };
      } catch (_) {
        this._closeRealtimeSubscription();
      }
    },

    _closeRealtimeSubscription() {
      clearTimeout(this._realtimeLazyTimer);
      clearTimeout(this._realtimeDebounceTimer);
      clearTimeout(this._realtimeIdleTimer);
      if (this._realtimeSocket) {
        try {
          this._realtimeSocket.close();
        } catch (_) {}
        this._realtimeSocket = null;
      }
    }
  };

  window.GT6Backend = GT6Backend;
})(typeof window !== 'undefined' ? window : globalThis);
