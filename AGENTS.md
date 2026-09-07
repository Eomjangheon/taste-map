<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 취향 지도 (taste-map) — AI 작업 규칙

이 저장소의 코드는 AI 코딩 도구가 작성하고, 사람(엄장헌·권순원)은 지시·검수·결정만 한다.
**AI는 매 작업 세션에서 이 파일과 아래 기준 문서를 반드시 참조한다.**

## 기준 문서 (단일 진실 원천)

| 문서 | 경로 | 역할 |
|---|---|---|
| 제품 명세서 v0.5 | `docs/취향지도_명세서_v0.5.md` | 무엇을 만드는가. 이슈가 §번호로 참조 |
| 스키마·계약 문서 | `docs/contract.md` | DB 스키마와 도메인 간 인터페이스 전부 (T8에서 작성) |
| 협업 규칙 | `docs/collaboration.md` | 브랜치·PR 검수·머지 데이 |
| 작업 지시서 | Linear 프로젝트 "취향 지도 MVP" | 이슈 체크리스트가 곧 AI 지시서 |

## 금지 규칙 (절대 위반 금지)

1. **스키마·계약 문서 임의 변경 금지** — `docs/contract.md`와 DB 스키마 변경은 두 사람 합의 → 문서 갱신 → 마이그레이션 파일 순서로만. AI가 먼저 바꾸지 않는다.
2. **API 키·시크릿 하드코딩 금지** — 모든 키는 환경변수. `.env.local`은 커밋 금지.
3. **계약 문서에 없는 필드·엔드포인트 임의 추가 금지** — 필요하면 사람에게 제안하고 멈춘다.
4. **프로덕션 DB 직접 마이그레이션 금지** — 스키마 변경은 `supabase/migrations/` 의 번호 붙은 SQL 파일로만 작성하고, 프로덕션 적용은 사람이 승인 후 직접 실행한다.
5. **service_role 키는 서버 전용** — `NEXT_PUBLIC_` 접두사 환경변수나 클라이언트 코드에 절대 노출 금지.
6. **RLS(행 단위 권한) 비활성화 금지** — 모든 테이블은 RLS 활성 상태를 유지한다.

## 작업 방식

- **작업 단위 = Linear 이슈 1개.** 한 세션에 이슈 하나의 체크리스트만 수행하고, 완료 조건이 배포 URL에서 확인되기 전에 다음 이슈를 시작하지 않는다.
- **완료 조건은 '화면에서 확인 가능한 행동'** — 코드 품질은 완료 조건이 될 수 없다. 사람은 코드를 읽지 않는다.
- **이슈마다 스모크 테스트 1개** — 그 이슈의 완료 조건을 검증하는 최소 Playwright 테스트를 `tests/`에 함께 작성한다. 기존 스모크를 깨뜨리는 변경은 원인을 고치기 전에 머지하지 않는다.
- **도메인 경계 준수** — A(권순원)=작품·가져오기(`works` 쓰기 소유), B(엄장헌)=기록·수집(`records` 쓰기 소유, 단 가져오기의 records 삽입은 계약 규약대로 허용). 이슈 1건에 도메인 경계를 넘는 범위를 부여하지 않는다.
- **개방형 지시 금지** — "알아서 개선해줘" 류의 요청을 받으면 구체적 이슈로 좁혀달라고 요청한다.
- **한국어 입력 UI 규칙** — Enter 키 핸들러에는 반드시 `!e.nativeEvent.isComposing` 가드 (한글 IME 조합 확정과 겹침 방지, WEB-6 파일럿에서 확인된 규칙).
- **한국어 텍스트 정규화 규칙** — 정규식 `\w`/`\W`/`\b`는 한글에 오작동한다(`\W`는 한글을 전부 제거). 문자 필터링에는 반드시 유니코드 속성 클래스 `\p{L}`·`\p{N}`(+`u` 플래그)를 사용한다 (WEB-16 검수에서 발견된 실제 버그 — 한글 검색어가 빈 문자열이 되어 전체 목록이 매칭됨).

## 기술 스택 (결정 기록 U4·U5 — 변경은 사람 결정)

- TypeScript + **Next.js 16 App Router** (캐싱은 16 옵트인 기준으로만 작성 — 13/14 시절 암묵 캐싱 패턴 금지)
- **Supabase** (DB·인증·스토리지) — dev 프로젝트(개발·프리뷰·CI)와 prod 프로젝트(프로덕션) 분리. 프리뷰·로컬은 dev만 바라본다
- **Vercel Hobby** 배포 — main 푸시=프로덕션, PR=프리뷰
- PWA는 next-pwa가 아닌 **Serwist** 사용
- 외부 포스터(TMDB/IGDB)는 `next/image`로 감싸지 말고 일반 `<img>` 사용
- 분석: PostHog(행동 지표) + 자체 events 테이블(핵심 이벤트 이중 기록)

