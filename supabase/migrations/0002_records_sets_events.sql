-- 0002: records / sets / user_badges / events (T8 — 계약 문서와 한 몸)
-- 명세서 v0.5 §3.2 Record + §4.2 Set + 측정 지표(§8) 기준.
-- 적용: dev에 먼저 적용·확인 → 사람이 승인 후 prod 적용 (AGENTS.md 금지 규칙 4).

-- ── records (§3.2) — 소유: B(기록·수집). A의 가져오기도 계약 규약대로 삽입 가능 ──
create table if not exists public.records (
  -- 클라이언트 생성 UUID를 그대로 받는다 (로컬 저장→가입 동기화 T45의 충돌 원천 차단, T8 결정)
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade, -- 계정 삭제 = 기록 완전 삭제 (§6.4)
  work_id uuid not null references public.works (id),
  status text not null check (status in ('completed', 'in_progress', 'dropped', 'backlog')),
  coordinates jsonb not null default '[]'::jsonb, -- v2까지 빈 배열 유지 (§3.2·§4.8 — 지도 다중화 대비 배열형)
  dropped_at text,   -- 이탈 지점. 전용 입력 UI는 v1(§4.4) — 필드만 예비
  progress text,     -- 진행 지점. 전용 입력 UI는 v1 — 필드만 예비
  rating numeric(2, 1) check (rating >= 0.5 and rating <= 5.0), -- 별점 (§8 MVP 명시 — §3.2 누락분 보강, 0.5 단위)
  replay_count int not null default 0,
  consumed_at date,
  note text,
  visibility text not null default 'private' check (visibility in ('private', 'public')), -- 비공개 기본 (§6.4)
  import_source text not null default 'manual' check (import_source in ('manual', 'steam', 'csv', 'screenshot', 'text')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, work_id) -- 같은 작품 기록 1개. 재감상은 replay_count로 (§6.2)
);

alter table public.records enable row level security;

create policy "records owner all" on public.records
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "records public read" on public.records
  for select to anon, authenticated using (visibility = 'public');

create index if not exists records_user_idx on public.records (user_id, consumed_at desc);
create index if not exists records_work_idx on public.records (work_id);

-- ── sets (§4.2) — MVP는 공식 세트만 (creator_id = null) ──
create table if not exists public.sets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  creator_id uuid references auth.users (id), -- null = 공식. 유저 세트는 v1(T33)
  work_ids uuid[] not null default '{}',
  badge_asset text, -- 배지 이미지 경로
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.sets enable row level security;

create policy "sets read" on public.sets
  for select to anon, authenticated using (is_public = true);
-- 쓰기 정책 없음: MVP의 세트는 시드(T21·T22)로만 등록. 유저 세트는 v1에서 정책 추가.

-- ── user_badges — 세트 완성 배지 획득 기록 (T22) ──
create table if not exists public.user_badges (
  user_id uuid not null references auth.users (id) on delete cascade,
  set_id uuid not null references public.sets (id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, set_id)
);

alter table public.user_badges enable row level security;

create policy "badges owner all" on public.user_badges
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── events — 측정 지표 5종·가설 판별용 보조 테이블 (T10, PostHog 이중 기록의 '보험') ──
create table if not exists public.events (
  id bigint generated always as identity primary key,
  name text not null,
  properties jsonb not null default '{}'::jsonb,
  anon_id text not null, -- 계정 없이 시작한 게스트 추적 (§6.1) — 가입 시 user_id와 연결
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;

create policy "events insert" on public.events
  for insert to anon, authenticated with check (true);
-- select 정책 없음: 지표 조회는 SQL Editor/대시보드(T28)에서 사람이 수행. 클라이언트는 쓰기만.

create index if not exists events_name_idx on public.events (name, created_at desc);
