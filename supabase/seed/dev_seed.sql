-- T9: dev 전용 시드 — 작품 50건 + 시드 유저 4명 + 가짜 기록 ~200건
-- ⚠ dev 프로젝트(taste-map-dev)에만 적용한다. prod 금지 (실서비스 카탈로그는 T11~T13 온디맨드 적재가 담당).
-- 멱등: 여러 번 실행해도 중복 생성 없음 (작품=제목+연도 가드, 기록=[seed] 마커 삭제 후 재생성).

-- ── 1. 시드 유저 4명 (FK용 + T25부터 로그인 스모크에도 사용: seed1 / seedpass123!) ──
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       e.email, extensions.crypt('seedpass123!', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
-- e2e@taste.local: 스모크 테스트 전용 계정 (T45 업로드 검증 — 시드 기록 오염 방지용, 기록 없음)
from (values ('seed1@taste.local'), ('seed2@taste.local'), ('seed3@taste.local'), ('seed4@taste.local'), ('e2e@taste.local')) as e(email)
where not exists (select 1 from auth.users u where u.email = e.email);

-- ── 1b. 시드 유저 로그인 수리 (T25에서 발견) — SQL로 직접 넣은 유저는 GoTrue가
-- 빈 문자열('')을 기대하는 토큰 컬럼들이 NULL이고 auth.identities 행이 없어서
-- 로그인 시도 시 500 "Database error querying schema"가 난다. 멱등 수리.
update auth.users set
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token             = coalesce(recovery_token, ''),
  email_change               = coalesce(email_change, ''),
  email_change_token_new     = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change               = coalesce(phone_change, ''),
  phone_change_token         = coalesce(phone_change_token, ''),
  reauthentication_token     = coalesce(reauthentication_token, '')
where email like 'seed%@taste.local' or email = 'e2e@taste.local';

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where (u.email like 'seed%@taste.local' or u.email = 'e2e@taste.local')
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

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
  ('movie', 'Parasite', '기생충', 2019, '{"tmdb": 496243}'),
  ('movie', 'Inception', '인셉션', 2010, '{"tmdb": 27205}'),
  ('movie', 'Interstellar', '인터스텔라', 2014, '{"tmdb": 157336}'),
  ('movie', 'The Dark Knight', '다크 나이트', 2008, '{"tmdb": 155}'),
  ('movie', 'Avengers: Endgame', '어벤져스: 엔드게임', 2019, '{"tmdb": 299534}'),
  ('movie', 'La La Land', '라라랜드', 2016, '{"tmdb": 313369}'),
  ('movie', 'Your Name.', '너의 이름은.', 2016, '{"tmdb": 372058}'),
  ('movie', 'Suzume', '스즈메의 문단속', 2022, '{"tmdb": 916224}'),
  ('movie', 'Extreme Job', '극한직업', 2019, '{"tmdb": 567646}'),
  ('movie', 'The Outlaws', '범죄도시', 2017, '{"tmdb": 479718}'),
  ('movie', 'Decision to Leave', '헤어질 결심', 2022, '{"tmdb": 705996}'),
  ('movie', 'Dune', '듄', 2021, '{"tmdb": 438631}'),
  ('movie', 'Dune: Part Two', '듄: 파트 2', 2024, '{"tmdb": 693134}'),
  ('movie', 'Justice League', '저스티스 리그', 2017, '{"tmdb": 141052}'),
  ('movie', 'Zack Snyder''s Justice League', '잭 스나이더의 저스티스 리그', 2021, '{"tmdb": 791373}'),
  ('movie', 'Mad Max: Fury Road', '매드 맥스: 분노의 도로', 2015, '{"tmdb": 76341}'),
  ('movie', 'Frozen', '겨울왕국', 2013, '{"tmdb": 109445}'),
  ('movie', 'Spider-Man: Into the Spider-Verse', '스파이더맨: 뉴 유니버스', 2018, '{"tmdb": 324857}'),
  ('movie', 'Oldboy', '올드보이', 2003, '{"tmdb": 670}'),
  ('movie', 'Train to Busan', '부산행', 2016, '{"tmdb": 396535}'),
  -- 드라마·TV 10 (시즌 = 별개 작품)
  ('tv', 'Squid Game', '오징어 게임', 2021, '{"tmdb": 93405}'),
  ('tv', 'Squid Game Season 2', '오징어 게임 시즌 2', 2024, '{"tmdb_season_id": 287516}'),
  ('tv', 'The Glory', '더 글로리', 2022, '{"tmdb": 136283}'),
  ('tv', 'Extraordinary Attorney Woo', '이상한 변호사 우영우', 2022, '{"tmdb": 197067}'),
  ('tv', 'Chernobyl', '체르노빌', 2019, '{"tmdb": 87108}'),
  ('tv', 'Game of Thrones Season 1', '왕좌의 게임 시즌 1', 2011, '{"tmdb_season_id": 3624}'),
  ('tv', 'Breaking Bad Season 1', '브레이킹 배드 시즌 1', 2008, '{"tmdb_season_id": 3572}'),
  ('tv', 'The Last of Us (TV)', '더 라스트 오브 어스 (드라마)', 2023, '{"tmdb": 100088}'),
  ('tv', 'Money Heist Part 1', '종이의 집 파트 1', 2017, '{"tmdb_season_id": 87809}'),
  ('tv', 'Mr. Sunshine', '미스터 션샤인', 2018, '{"tmdb": 75820}')
) as v(media_type, canonical_title, title_ko, release_year, external_ids)
where not exists (
  select 1 from public.works w
  where w.canonical_title = v.canonical_title and w.release_year = v.release_year
);

-- ── 2-B. 이미 들어가 있는 시드 행에 external_ids 백필 (WEB-51) ──
-- 위 insert 는 '제목+연도' 가드 때문에 **기존 행을 건드리지 않는다.** 그래서 이미 시드가
-- 적용된 dev DB 는 external_ids 가 비어 있는 상태로 남는다. 그 상태에서 카탈로그 적재(T11·T12)가
-- 돌면 대조할 키가 없어 같은 작품을 새 행으로 또 만든다 — 이게 WEB-51 에서 보고된 중복의 원인이다.
-- **비어 있을 때만** 채운다. 운영자나 적재가 넣어 둔 값은 건드리지 않는다.
update public.works w
set external_ids = v.external_ids::jsonb
from (values
  ('movie', 'Parasite', 2019, '{"tmdb": 496243}'),
  ('movie', 'Inception', 2010, '{"tmdb": 27205}'),
  ('movie', 'Interstellar', 2014, '{"tmdb": 157336}'),
  ('movie', 'The Dark Knight', 2008, '{"tmdb": 155}'),
  ('movie', 'Avengers: Endgame', 2019, '{"tmdb": 299534}'),
  ('movie', 'La La Land', 2016, '{"tmdb": 313369}'),
  ('movie', 'Your Name.', 2016, '{"tmdb": 372058}'),
  ('movie', 'Suzume', 2022, '{"tmdb": 916224}'),
  ('movie', 'Extreme Job', 2019, '{"tmdb": 567646}'),
  ('movie', 'The Outlaws', 2017, '{"tmdb": 479718}'),
  ('movie', 'Decision to Leave', 2022, '{"tmdb": 705996}'),
  ('movie', 'Dune', 2021, '{"tmdb": 438631}'),
  ('movie', 'Dune: Part Two', 2024, '{"tmdb": 693134}'),
  ('movie', 'Justice League', 2017, '{"tmdb": 141052}'),
  ('movie', 'Zack Snyder''s Justice League', 2021, '{"tmdb": 791373}'),
  ('movie', 'Mad Max: Fury Road', 2015, '{"tmdb": 76341}'),
  ('movie', 'Frozen', 2013, '{"tmdb": 109445}'),
  ('movie', 'Spider-Man: Into the Spider-Verse', 2018, '{"tmdb": 324857}'),
  ('movie', 'Oldboy', 2003, '{"tmdb": 670}'),
  ('movie', 'Train to Busan', 2016, '{"tmdb": 396535}'),
  ('tv', 'Squid Game', 2021, '{"tmdb": 93405}'),
  ('tv', 'Squid Game Season 2', 2024, '{"tmdb_season_id": 287516}'),
  ('tv', 'The Glory', 2022, '{"tmdb": 136283}'),
  ('tv', 'Extraordinary Attorney Woo', 2022, '{"tmdb": 197067}'),
  ('tv', 'Chernobyl', 2019, '{"tmdb": 87108}'),
  ('tv', 'Game of Thrones Season 1', 2011, '{"tmdb_season_id": 3624}'),
  ('tv', 'Breaking Bad Season 1', 2008, '{"tmdb_season_id": 3572}'),
  ('tv', 'The Last of Us (TV)', 2023, '{"tmdb": 100088}'),
  ('tv', 'Money Heist Part 1', 2017, '{"tmdb_season_id": 87809}'),
  ('tv', 'Mr. Sunshine', 2018, '{"tmdb": 75820}')
) as v(media_type, canonical_title, release_year, external_ids)
where w.media_type = v.media_type
  and w.canonical_title = v.canonical_title
  and w.release_year = v.release_year
  and (w.external_ids is null or w.external_ids = '{}'::jsonb);

-- ── 2-C. 이미 생긴 중복 행 병합 (WEB-51) ──
-- 2-B 로 시드에 외부 id 가 채워지면, 적재분과 시드가 **같은 외부 id 를 가진 두 행**이 된다.
-- 여기서 하나로 합친다. 남기는 쪽은 먼저 만들어진 행(= 시드) 이다 — 한국어 제목과 원제가
-- 제대로 들어 있는 쪽이라 화면 품질이 낫다. T11 에서 Stardew Valley·Elden Ring 을 정리한 것과 같은 방식이다.
--
-- ⚠ **dev 전용이다.** prod 에는 시드가 없고, 카탈로그 적재는 외부 id 로 대조하므로 이 중복이 생기지 않는다.
-- (SQL Editor 에서 여러 번 돌려도 되도록 매번 새로 만든다. `on commit drop` 은
--  트랜잭션 밖에서 돌리면 다음 문장 전에 사라져서 쓰지 않는다)
drop table if exists _work_merge;
create temporary table _work_merge as
with keyed as (
  select
    id, media_type, created_at,
    case
      when external_ids ? 'tmdb_season_id' then 'tmdb_season_id'
      when external_ids ? 'tmdb' then 'tmdb'
      when external_ids ? 'igdb' then 'igdb'
      when external_ids ? 'steam_appid' then 'steam_appid'
    end as ext_key,
    coalesce(
      external_ids ->> 'tmdb_season_id', external_ids ->> 'tmdb',
      external_ids ->> 'igdb', external_ids ->> 'steam_appid'
    ) as ext_value
  from public.works
  where external_ids <> '{}'::jsonb
),
ranked as (
  -- 같은 (매체, 외부 id) 묶음 안에서 가장 먼저 만들어진 행이 1번
  select *, row_number() over (
    partition by media_type, ext_key, ext_value order by created_at, id
  ) as rn
  from keyed
  where ext_value is not null
)
select
  loser.id as victim_id,
  (select k.id from ranked k
    where k.media_type = loser.media_type and k.ext_key = loser.ext_key
      and k.ext_value = loser.ext_value and k.rn = 1) as keeper_id
from ranked loser
where loser.rn > 1;

-- 자식(시즌·DLC)을 남는 행으로 재연결한다
update public.works c
set parent_work_id = m.keeper_id
from _work_merge m
where c.parent_work_id = m.victim_id;

-- 기록을 남는 행으로 옮긴다. 같은 유저가 양쪽에 기록을 갖고 있으면 옮길 수 없다(unique user_id+work_id)
update public.records r
set work_id = m.keeper_id
from _work_merge m
where r.work_id = m.victim_id
  and not exists (
    select 1 from public.records other
    where other.user_id = r.user_id and other.work_id = m.keeper_id
  );

-- 옮기지 못한 기록 = 남는 행에 이미 같은 작품 기록이 있는 경우. 중복이므로 지운다
-- (dev 시드 기록에만 해당한다. 이 파일은 prod 에 적용하지 않는다)
delete from public.records r using _work_merge m where r.work_id = m.victim_id;

delete from public.works w using _work_merge m where w.id = m.victim_id;

drop table _work_merge;

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
