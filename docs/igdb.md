# IGDB 연동 메모 (T11)

키 발급 현황과 규약은 팀 문서 `Project_Web/docs/external-apis.md` 가 기준이다. 여기에는 **구현에 필요한 API 사실**만 적는다.
근거는 T3 검증 리포트(`steam-verify/report/WEB-3-comment.md`, 2026-09-03 실측).

## 환경변수

이름 규약은 **WEB-11 코멘트(엄장헌, 2026-09-07)** 가 기준이다.

| 변수 | 용도 | 어디서 받는가 |
|---|---|---|
| `TWITCH_CLIENT_ID` | Twitch 앱 Client ID | dev.twitch.tv/console/apps |
| `TWITCH_CLIENT_SECRET` | Twitch 앱 Secret | 위와 같음 |
| `SUPABASE_SECRET_KEY` | works 적재용 (RLS 우회) | dev 프로젝트 → Settings → API Keys → Secret keys (`sb_secret_...`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | dev 프로젝트 → Settings → API |

**셋 다 서버 전용이다.**

- `NEXT_PUBLIC_` 접두사를 절대 붙이지 않는다 — 붙는 순간 브라우저 번들에 들어간다 (AGENTS.md 금지 규칙 5).
- 클라이언트 컴포넌트에서 `lib/supabase-admin.ts` 를 import 하지 않는다. 서버 라우트에서만 쓴다.
- `.env.local` 에만 두고 커밋하지 않는다. **키 값은 AI 채팅에도 붙여넣지 않는다** — 대시보드에서 복사해 `.env.local` 에 직접 저장한다.
- 개발 중에는 **dev 프로젝트 키만** 쓴다. prod secret 은 배포 시점에만 다룬다.

### Vercel 등록 (배포 시)

- dev secret → **Preview · Development** 환경에 등록
- (추후) prod secret → **Production** 환경에 등록
- 셋 다 **Sensitive 타입**으로 등록한다

## 인증

- `https://id.twitch.tv/oauth2/token` 에 `client_credentials` 로 토큰을 받는다.
- **토큰을 캐싱하지 않고 매 요청 발급하면 즉시 차단된다.** `lib/igdb/client.ts` 가 모듈 스코프에 캐싱하고,
  만료 60초 전에 갱신하며, 동시 요청이 중복 발급하지 않도록 진행 중 Promise 를 공유한다.
- 401 을 받으면 캐시를 버리고 한 번만 재시도한다.

## 레이트리밋

4 req/s. 호출을 직렬화하고 최소 300ms 간격을 둔다(T3 스크립트와 동일). `external_games` 조회는 uid 200개씩 묶는다.

## 스키마 주의 — 조용한 실패

- `external_games.category` 는 **제거됐다.** 이 필드를 쓴 쿼리는 에러 대신 **빈 배열**을 준다.
  T3 1차 측정이 0% 로 나온 원인이 이것이다. 현재 필드는 `external_game_source` 이고 **Steam = 1**.
- **uid 는 소스 간 공유된다.** 소스 필터 없이 uid 만으로 조회하면 다른 스토어의 엉뚱한 게임이 조용히 붙는다.
- 그래서 검색 쿼리는 필드 조합을 풍부한 것부터 순서대로 시도하고(`igdbQueryWithFallback`),
  빈 결과를 성공으로 취급하지 않는다.

## 커버 이미지 URL 규칙

```
https://images.igdb.com/igdb/image/upload/{size}/{image_id}.jpg
```

`size` 는 `t_cover_small`(90×128) · `t_cover_big`(264×374) 등. `image_id` 는 `cover.image_id` 로 받는다.

**저장하지 않는다.** works 스키마에 커버 컬럼이 없고, 계약에 없는 필드를 임의로 추가하지 않는다(AGENTS.md 금지 규칙 3).
조회 시점에 조립해서 내려보내며, 외부 포스터이므로 `next/image` 로 감싸지 않고 `<img>` 로 렌더한다.

> 카탈로그에 커버를 **영속화할지**는 작품 상세 화면을 만드는 T13 에서 사람이 결정할 사항으로 남긴다.

## 동일성 규칙 적용 (§3.1)

- IGDB game 1건 = works 1행. DLC·확장팩·리마스터·시즌은 **별개 Work** 로 그대로 적재한다.
- `parent_game` 이 있으면 상위 작품도 적재하고 `parent_work_id` 로 연결한다. **UI 그룹핑 전용이며 동일성 판단에 쓰지 않는다**(§3.2).
- `parent_game` 은 병합 키가 될 수 없다 — 에디션/리메이크/번들 오매칭/자기 자신이 부모 등 의미가 섞여 있다(T3 §5).
  그래서 여기서는 **아무것도 병합하지 않고** 그룹핑만 한다.
- `game_type` 은 과거 `category` 숫자에서 `game_types` 참조로 옮겨가는 중이라 숫자와 객체 두 형태를 모두 처리한다.

## 중복 방지와 남은 제안

`external_ids->>'igdb'` 로 기존 행을 조회한 뒤 없는 것만 insert 한다.
**동시 요청 경합은 막지 못한다.** 근본 해결은 `works.external_ids->>'igdb'` 유니크 인덱스이며,
스키마 변경이므로 `docs/contract.md` §5 절차(제안 → 15분 합의 → 문서 갱신 → 마이그레이션 → 사람이 적용)를 거쳐야 한다.
**T12(TMDB)도 같은 인덱스가 필요하므로 함께 합의하는 것을 제안한다.**
