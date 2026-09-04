-- T9: dev 전용 시드 — 작품 50건 + 시드 유저 4명 + 가짜 기록 ~200건
-- ⚠ dev 프로젝트(taste-map-dev)에만 적용한다. prod 금지 (실서비스 카탈로그는 T11~T13 온디맨드 적재가 담당).
-- 멱등: 여러 번 실행해도 중복 생성 없음 (작품=제목+연도 가드, 기록=[seed] 마커 삭제 후 재생성).

-- ── 1. 시드 유저 4명 (FK용 — 로그인 보장 안 함, 실제 가입 흐름은 T25) ──
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       e.email, extensions.crypt('seedpass123!', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
from (values ('seed1@taste.local'), ('seed2@taste.local'), ('seed3@taste.local'), ('seed4@taste.local')) as e(email)
where not exists (select 1 from auth.users u where u.email = e.email);

-- ── 2. 작품 50건 (§3.1 동일성 규칙 준수 — 시즌·DLC·리메이크·확장판·감독판 별개 / 현지화 동일) ──
insert into public.works (media_type, canonical_title, title_ko, release_year, external_ids)
select v.media_type, v.canonical_title, v.title_ko, v.release_year, v.external_ids::jsonb
from (values
  -- 게임 20 (스타듀 밸리는 0001 시드에 이미 존재 — 가드로 중복 방지됨)
  ('game', 'Stardew Valley', '스타듀 밸리', 2016, '{"steam_appid": 413150}'),
  ('game', 'Elden Ring', '엘든 링', 2022, '{"steam_appid": 1245620}'),
  ('game', 'Elden Ring: Shadow of the Erdtree', '엘든 링: 황금 나무의 그림자', 2024, '{}'),
  ('game', 'The Witcher 3: Wild Hunt', '더 위쳐 3: 와일드 헌트', 2015, '{"steam_appid": 292030}'),
  ('game', 'Cyberpunk 2077', '사이버펑크 2077', 2020, '{"steam_appid": 1091500}'),
  ('game', 'Hades', '하데스', 2020, '{"steam_appid": 1145360}'),
  ('game', 'Hollow Knight', '할로우 나이트', 2017, '{"steam_appid": 367520}'),
  ('game', 'Celeste', '셀레스트', 2018, '{"steam_appid": 504230}'),
  ('game', 'Portal 2', '포탈 2', 2011, '{"steam_appid": 620}'),
  ('game', 'Terraria', '테라리아', 2011, '{"steam_appid": 105600}'),
  ('game', 'Baldur''s Gate 3', '발더스 게이트 3', 2023, '{"steam_appid": 1086940}'),
  ('game', 'Persona 5', '페르소나 5', 2016, '{}'),
  ('game', 'Persona 5 Royal', '페르소나 5 더 로열', 2019, '{}'),
  ('game', 'The Last of Us', '더 라스트 오브 어스', 2013, '{}'),
  ('game', 'The Last of Us Part I', '더 라스트 오브 어스 파트 I', 2022, '{}'),
  ('game', 'Dave the Diver', '데이브 더 다이버', 2023, '{"steam_appid": 1868140}'),
  ('game', 'Vampire Survivors', '뱀파이어 서바이버즈', 2022, '{"steam_appid": 1794680}'),
  ('game', 'Slay the Spire', '슬레이 더 스파이어', 2019, '{"steam_appid": 646570}'),
  ('game', 'The Legend of Zelda: Breath of the Wild', '젤다의 전설: 야생의 숨결', 2017, '{}'),
  ('game', 'The Legend of Zelda: Tears of the Kingdom', '젤다의 전설: 왕국의 눈물', 2023, '{}'),
  -- 영화 20
  ('movie', 'Parasite', '기생충', 2019, '{}'),
  ('movie', 'Inception', '인셉션', 2010, '{}'),
  ('movie', 'Interstellar', '인터스텔라', 2014, '{}'),
  ('movie', 'The Dark Knight', '다크 나이트', 2008, '{}'),
  ('movie', 'Avengers: Endgame', '어벤져스: 엔드게임', 2019, '{}'),
  ('movie', 'La La Land', '라라랜드', 2016, '{}'),
  ('movie', 'Your Name.', '너의 이름은.', 2016, '{}'),
  ('movie', 'Suzume', '스즈메의 문단속', 2022, '{}'),
  ('movie', 'Extreme Job', '극한직업', 2019, '{}'),
  ('movie', 'The Outlaws', '범죄도시', 2017, '{}'),
  ('movie', 'Decision to Leave', '헤어질 결심', 2022, '{}'),
  ('movie', 'Dune', '듄', 2021, '{}'),
  ('movie', 'Dune: Part Two', '듄: 파트 2', 2024, '{}'),
  ('movie', 'Justice League', '저스티스 리그', 2017, '{}'),
  ('movie', 'Zack Snyder''s Justice League', '잭 스나이더의 저스티스 리그', 2021, '{}'),
  ('movie', 'Mad Max: Fury Road', '매드 맥스: 분노의 도로', 2015, '{}'),
  ('movie', 'Frozen', '겨울왕국', 2013, '{}'),
  ('movie', 'Spider-Man: Into the Spider-Verse', '스파이더맨: 뉴 유니버스', 2018, '{}'),
  ('movie', 'Oldboy', '올드보이', 2003, '{}'),
  ('movie', 'Train to Busan', '부산행', 2016, '{}'),
  -- 드라마·TV 10 (시즌 = 별개 작품)
  ('tv', 'Squid Game', '오징어 게임', 2021, '{}'),
  ('tv', 'Squid Game Season 2', '오징어 게임 시즌 2', 2024, '{}'),
  ('tv', 'The Glory', '더 글로리', 2022, '{}'),
  ('tv', 'Extraordinary Attorney Woo', '이상한 변호사 우영우', 2022, '{}'),
  ('tv', 'Chernobyl', '체르노빌', 2019, '{}'),
  ('tv', 'Game of Thrones Season 1', '왕좌의 게임 시즌 1', 2011, '{}'),
  ('tv', 'Breaking Bad Season 1', '브레이킹 배드 시즌 1', 2008, '{}'),
  ('tv', 'The Last of Us (TV)', '더 라스트 오브 어스 (드라마)', 2023, '{}'),
  ('tv', 'Money Heist Part 1', '종이의 집 파트 1', 2017, '{}'),
  ('tv', 'Mr. Sunshine', '미스터 션샤인', 2018, '{}')
) as v(media_type, canonical_title, title_ko, release_year, external_ids)
where not exists (
  select 1 from public.works w
  where w.canonical_title = v.canonical_title and w.release_year = v.release_year
);

-- ── 3. parent_work_id 그룹핑 연결 (UI 그룹핑 전용 — 동일성 판단 아님) ──
update public.works c set parent_work_id = p.id
from public.works p
where c.parent_work_id is null and (
  (c.canonical_title = 'Elden Ring: Shadow of the Erdtree' and p.canonical_title = 'Elden Ring') or
  (c.canonical_title = 'Squid Game Season 2' and p.canonical_title = 'Squid Game')
);

-- ── 4. 가짜 기록 ~200건 (유저 4명 × 최대 50작품, [seed] 마커로 멱등) ──
delete from public.records where note like '[seed]%';

insert into public.records (user_id, work_id, status, rating, replay_count, consumed_at, note, visibility, import_source)
select
  u.id,
  w.id,
  st.status,
  case when st.status in ('completed', 'dropped') and random() < 0.85
       then (floor(random() * 8) + 3) * 0.5  -- 1.5 ~ 5.0, 0.5 단위
       else null end,
  case when st.status = 'completed' and random() < 0.15 then (floor(random() * 3) + 1)::int else 0 end,
  case when st.status = 'backlog' then null
       else (current_date - (floor(random() * 240))::int) end,  -- 최근 8개월 분포
  '[seed] 시드 기록',
  case when random() < 0.15 then 'public' else 'private' end,
  'manual'
from auth.users u
cross join public.works w
cross join lateral (
  select case
    when r < 0.60 then 'completed'
    when r < 0.70 then 'in_progress'
    when r < 0.85 then 'dropped'
    else 'backlog' end as status
  from (select random() as r) t
) st
where u.email like 'seed%@taste.local'
  and random() < 0.98  -- 유저당 약 49건 → 전체 약 196건
on conflict (user_id, work_id) do nothing;

-- ── 5. 결과 요약 ──
select
  (select count(*) from public.works) as works_count,
  (select count(*) from public.records where note like '[seed]%') as seed_records_count,
  (select count(*) from auth.users where email like 'seed%@taste.local') as seed_users_count;
