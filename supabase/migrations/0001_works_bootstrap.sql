-- 0001: works 테이블 부트스트랩 (T7 walking skeleton)
-- 명세서 v0.5 §3.2 Work 엔티티 기준. records/sets/events는 T8(계약 문서)에서 0002로 추가한다.
-- 적용 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run.
--   dev 프로젝트에 먼저 적용·확인 후, 사람이 승인하고 prod에 적용한다 (AGENTS.md 금지 규칙 4).

create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  media_type text not null check (media_type in ('game', 'movie', 'tv', 'book', 'custom')),
  canonical_title text not null,
  title_ko text,
  release_year int,
  external_ids jsonb not null default '{}'::jsonb, -- { igdb, steam_appid, tmdb, isbn }
  parent_work_id uuid references public.works (id), -- 동일성 판단 사용 금지, UI 그룹핑 전용 (§3.2 설계 주석)
  source text not null default 'official' check (source in ('official', 'user_created')),
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.works enable row level security;

-- 작품 카탈로그는 공개 데이터: 읽기는 누구나. 쓰기 정책은 T8 계약 문서에서 정의한다.
create policy "works read" on public.works
  for select to anon, authenticated using (true);

-- T7 확인용 시드 1건 (§3.1 동일성 규칙 위반 없음 — 단일 원본 작품)
insert into public.works (media_type, canonical_title, title_ko, release_year, external_ids)
values ('game', 'Stardew Valley', '스타듀 밸리', 2016, '{"steam_appid": 413150}'::jsonb);
