-- =============================================================================
-- GT6 RAFA: FUGA DE VICE CITY (EDTECH PT-13 EDITION)
-- Supabase PostgreSQL Schema, RLS Policies, Seed Data & Realtime Publication
-- Idempotent script: safe to run multiple times in Supabase SQL Editor.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. TABLE: public.gt6_leaderboard
-- Stores top Vice City escape runs, bounty cash ($1,956,791+), and wanted stars
-- -----------------------------------------------------------------------------
create table if not exists public.gt6_leaderboard (
    id uuid primary key default gen_random_uuid(),
    player_name text not null default 'RAFA PT-13'
        check (char_length(trim(player_name)) between 1 and 40),
    bounty_cash bigint not null default 1956791
        check (bounty_cash >= 0),
    score integer not null default 0
        check (score >= 0),
    distance_m integer not null default 0
        check (distance_m >= 0),
    max_speed_kmh integer not null default 188
        check (max_speed_kmh between 0 and 500),
    wanted_stars smallint not null default 6
        check (wanted_stars between 1 and 6),
    roadblocks_broken integer not null default 0
        check (roadblocks_broken >= 0),
    vehicle_tag text not null default 'EDTECH PT-13 FAT CHOPPER'
        check (char_length(trim(vehicle_tag)) between 1 and 64),
    created_at timestamptz not null default now()
);

create index if not exists idx_gt6_leaderboard_ranking
    on public.gt6_leaderboard (bounty_cash desc, score desc, distance_m desc, created_at asc);

create index if not exists idx_gt6_leaderboard_created_at
    on public.gt6_leaderboard (created_at desc);

-- -----------------------------------------------------------------------------
-- 2. TABLE: public.gt6_telemetry
-- Stores gameplay telemetry events (run_start, blockade_jump, emp_blast, busted)
-- -----------------------------------------------------------------------------
create table if not exists public.gt6_telemetry (
    id uuid primary key default gen_random_uuid(),
    event_type text not null
        check (char_length(trim(event_type)) between 1 and 64),
    player_name text not null default 'RAFA PT-13'
        check (char_length(trim(player_name)) between 1 and 40),
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_gt6_telemetry_event_type
    on public.gt6_telemetry (event_type, created_at desc);

create index if not exists idx_gt6_telemetry_created_at
    on public.gt6_telemetry (created_at desc);

-- -----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) & POLICIES
-- Public read (SELECT) and validated insert (INSERT) for anon / authenticated
-- -----------------------------------------------------------------------------
alter table public.gt6_leaderboard enable row level security;
alter table public.gt6_telemetry enable row level security;

-- Leaderboard SELECT policy
drop policy if exists "gt6_leaderboard_public_read" on public.gt6_leaderboard;
create policy "gt6_leaderboard_public_read"
    on public.gt6_leaderboard
    for select
    to anon, authenticated
    using (true);

-- Leaderboard INSERT policy (validated)
drop policy if exists "gt6_leaderboard_validated_insert" on public.gt6_leaderboard;
create policy "gt6_leaderboard_validated_insert"
    on public.gt6_leaderboard
    for insert
    to anon, authenticated
    with check (
        char_length(trim(player_name)) between 1 and 40
        and bounty_cash >= 0
        and bounty_cash <= 999999999
        and score >= 0
        and distance_m >= 0
        and max_speed_kmh between 0 and 500
        and wanted_stars between 1 and 6
        and roadblocks_broken >= 0
    );

-- Telemetry SELECT policy
drop policy if exists "gt6_telemetry_public_read" on public.gt6_telemetry;
create policy "gt6_telemetry_public_read"
    on public.gt6_telemetry
    for select
    to anon, authenticated
    using (true);

-- Telemetry INSERT policy (validated + 4KB payload cap for Nano/Free tier)
drop policy if exists "gt6_telemetry_validated_insert" on public.gt6_telemetry;
create policy "gt6_telemetry_validated_insert"
    on public.gt6_telemetry
    for insert
    to anon, authenticated
    with check (
        char_length(trim(event_type)) between 1 and 64
        and char_length(trim(player_name)) between 1 and 40
        and jsonb_typeof(payload) = 'object'
        and octet_length(payload::text) <= 4096
    );

-- Automatic Telemetry Retention Function (keeps Nano instance lean and fast)
create or replace function public.gt6_prune_old_telemetry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if random() < 0.05 then
        delete from public.gt6_telemetry
        where id in (
            select id from public.gt6_telemetry
            order by created_at desc
            offset 500
        );
    end if;
    return new;
end;
$$;

drop trigger if exists trg_gt6_prune_telemetry on public.gt6_telemetry;
create trigger trg_gt6_prune_telemetry
    after insert on public.gt6_telemetry
    for each statement
    execute function public.gt6_prune_old_telemetry();

-- Grant table privileges to Supabase API roles
grant usage on schema public to anon, authenticated, service_role;
grant select, insert on public.gt6_leaderboard to anon, authenticated;
grant select, insert on public.gt6_telemetry to anon, authenticated;
grant all privileges on public.gt6_leaderboard to service_role;
grant all privileges on public.gt6_telemetry to service_role;

-- -----------------------------------------------------------------------------
-- 4. SEED DATA (Rafa PT-13 Official Video Run & Vice City Challengers)
-- -----------------------------------------------------------------------------
insert into public.gt6_leaderboard (
    id,
    player_name,
    bounty_cash,
    score,
    distance_m,
    max_speed_kmh,
    wanted_stars,
    roadblocks_broken,
    vehicle_tag,
    created_at
)
values
    (
        '00000000-0000-4000-8000-000000000013',
        'RAFA PT-13 [OFICIAL]',
        1956898,
        107000,
        4820,
        188,
        6,
        14,
        'EDTECH PT-13 FAT CHOPPER',
        now() - interval '2 hours'
    ),
    (
        '00000000-0000-4000-8000-000000000002',
        'RAFA EDTECH NITRO',
        1956845,
        89400,
        4150,
        242,
        6,
        11,
        'EDTECH PT-13 FAT CHOPPER',
        now() - interval '95 minutes'
    ),
    (
        '00000000-0000-4000-8000-000000000003',
        'LUCIA VICE 86',
        1956812,
        68200,
        3390,
        215,
        5,
        8,
        'VICE NEON CRUISER',
        now() - interval '70 minutes'
    ),
    (
        '00000000-0000-4000-8000-000000000004',
        'JASON OCEAN DRIVE',
        1956799,
        52400,
        2740,
        196,
        5,
        6,
        'STREET HAWK 900',
        now() - interval '45 minutes'
    ),
    (
        '00000000-0000-4000-8000-000000000005',
        'TOMMY VERCETTI JR',
        1956791,
        41800,
        2180,
        180,
        4,
        5,
        'INFERNUS CLASSIC',
        now() - interval '30 minutes'
    ),
    (
        '00000000-0000-4000-8000-000000000006',
        'DELEGADO COPOM 190',
        1952400,
        29500,
        1640,
        168,
        3,
        3,
        'VCPD INTERCEPTOR',
        now() - interval '15 minutes'
    )
on conflict (id) do update set
    bounty_cash = excluded.bounty_cash,
    score = excluded.score,
    distance_m = excluded.distance_m,
    max_speed_kmh = excluded.max_speed_kmh,
    wanted_stars = excluded.wanted_stars,
    roadblocks_broken = excluded.roadblocks_broken,
    vehicle_tag = excluded.vehicle_tag;

insert into public.gt6_telemetry (
    id,
    event_type,
    player_name,
    payload,
    created_at
)
values
    (
        '00000000-0000-4000-9000-000000000001',
        'blockade_jump',
        'RAFA PT-13 [OFICIAL]',
        '{"bounty_cash": 1956898, "speed_kmh": 188, "wanted_stars": 6, "radio": "Cuidado, ele está furando o bloqueio!", "location": "Vice City Ocean Ave Overpass"}'::jsonb,
        now() - interval '2 hours'
    ),
    (
        '00000000-0000-4000-9000-000000000002',
        'heli_pursuit_6stars',
        'RAFA PT-13 [OFICIAL]',
        '{"bounty_cash": 1956845, "speed_kmh": 188, "wanted_stars": 6, "ammo": "558-30", "radio": "Apoio aéreo a caminho, cerquem a área!"}'::jsonb,
        now() - interval '90 minutes'
    )
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 5. SUPABASE REALTIME PUBLICATION
-- Enables live broadcasts on public.gt6_leaderboard inserts/updates
-- -----------------------------------------------------------------------------
do $$
begin
    if exists (
        select 1 from pg_publication where pubname = 'supabase_realtime'
    ) and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'gt6_leaderboard'
    ) then
        alter publication supabase_realtime add table public.gt6_leaderboard;
    end if;
exception
    when others then
        raise notice 'Skipping supabase_realtime publication update: %', sqlerrm;
end $$;
