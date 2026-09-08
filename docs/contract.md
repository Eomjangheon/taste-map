# 스키마·계약 문서 (T8)

**상태**: 초안 — PR 검수에서 두 사람이 합의하면 확정 / **기준**: 명세서 v0.5 §3
**이 문서가 두 트랙(A 작품·가져오기 / B 기록·수집)의 인터페이스 전부다.** 여기 없는 필드·엔드포인트를 AI가 임의로 추가하는 것은 금지(AGENTS.md).

## 1. 테이블과 소유권

| 테이블 | 마이그레이션 | 쓰기 소유 | 읽기 | 비고 |
|---|---|---|---|---|
| `works` | 0001 | **A** (카탈로그 적재·검색 T11~T14, 매칭 T43) | 모두 | 유저 등록(v1) 전까지 source='official'만 생성 |
| `records` | 0002 | **B** (CRUD T15·T16) + **A의 가져오기 삽입 허용**(T19·T20 — 아래 규약) | 본인 전체 / 타인은 public만 | RLS: 본인 소유 |
| `sets` | 0002 | 시드 전용 (T21 콘텐츠 → T22 등록) | 모두(is_public) | MVP는 공식 세트만 |
| `user_badges` | 0002 | **B** (T22 배지 부여) | 본인 | |
| `events` | 0002 | 모두 — 공용 `track()` 유틸(T10)로만 삽입 | 클라이언트 읽기 금지 | 지표는 SQL로 조회(T28) |

**A가 records를 삽입할 때의 규약 (가져오기)**: `import_source`를 반드시 'steam'/'csv'로 기록하고, `status='completed'`, `coordinates=[]`, 클라이언트/서버 생성 UUID 사용, `(user_id, work_id)` 유니크 충돌 시 upsert(기존 기록 유지·플레이 시간 등 메타만 갱신). 그 외 records 로직(수정·삭제·집계)은 건드리지 않는다.

## 2. 작품 동일성 규칙 7케이스 (§3.1 D5) — 테스트 케이스 겸 데이터 입력 가이드

| # | 케이스 | 처리 | 예시 |
|---|---|---|---|
| 1 | 시리즈의 시즌 | **별개 works** (parent_work_id로 그룹핑만) | 종이의 집 파트4 ≠ 파트5 |
| 2 | 리마스터판 | **별개 works** | 라오어 ≠ 라오어 리마스터드 |
| 3 | 감독판/확장판 | **별개 works** | 반지의 제왕 극장판 ≠ 확장판 |
| 4 | 더빙/자막/현지화 제목 | **동일 work** (title_ko로 병기) | Frozen = 겨울왕국 |
| 5 | 게임 DLC | **별개 works** (parent_work_id 그룹핑) | 엘든 링 ≠ 황금 나무의 그림자 |
| 6 | 게임 리마스터/리메이크 | **별개 works** | 데메크3 ≠ 데메크3 SE |
| 7 | 플랫폼 차이 (PC/PS/Switch) | **동일 work** | 스타듀 밸리는 1건 |

`parent_work_id`는 **동일성 판단에 사용 금지** — UI 그룹핑 전용(§3.2). 매칭 엔진(T43)은 이 7케이스를 테스트로 통과해야 한다.

## 3. 통합 지점 3곳 (병렬 개발의 접점 — T29에서 최종 검증)

1. **가져오기 → 기록 생성**: A(T19·T20)가 위 규약대로 records 삽입 → B의 화면·집계에 자동 반영되어야 함
2. **기록 상태 변경 → 세트 달성률**: B(T22)의 달성률은 조회 시 계산(별도 테이블 없음) — records와 sets.work_ids의 교집합/전체
3. **기록 집계 → 리절트**: B(T23)의 리절트는 records만 읽는다 (완주율 = completed/(completed+dropped), §6.5)

## 4. 도메인 간 API 계약

- **작품 조회·검색 API** (A 소유) — **T13에서 확정. 아래가 계약이다.** B는 works를 직접 읽지 말고 이 경로로만 조회한다. 변경은 §5 절차를 따른다.

```
GET /api/works?q=<검색어>&media=<all|game|movie|tv>&limit=<1..50>
```

```jsonc
{
  "query": "오징어 게임",
  "media": "all",
  "origin": "catalog",          // catalog = 자체 DB에서 찾음 / external = 외부에서 새로 가져옴 / none = 없음
  "results": [{
    "id": "uuid",               // works.id — 기록의 work_id 로 그대로 쓴다
    "mediaType": "tv",          // game | movie | tv
    "title": "오징어 게임",       // 표시용. title_ko 가 있으면 그것, 없으면 canonical_title
    "canonicalTitle": "Squid Game",
    "titleKo": "오징어 게임",     // 없으면 null
    "releaseYear": 2021,        // 없으면 null
    "coverUrl": "https://...",  // 없으면 null (works에 포스터 컬럼이 없어 조회 시점에 유도한다)
    "parentWorkId": "uuid",     // 시즌·DLC의 상위 작품. 없으면 null. **동일성 판단에 쓰지 않는다**
    "externalIds": { "tmdb": 93405 },
    "source": "official"
  }]
}
```

```
GET /api/works/{id}
```

```jsonc
{ "work": { /* 위 결과 필드 전부 */,
  "parent": { /* 상위 작품 1건 또는 null */ },
  "children": [ /* 하위 작품(시즌·DLC) 목록 */ ] } }
```

**규약**
- 검색은 **자체 DB 우선 → 비어 있을 때만 외부 API 조회·적재**(온디맨드). 그래서 첫 검색은 느릴 수 있다.
- 오류는 `{ "error": "...", "missingEnv"?: [...] }` 형태다. `400` 잘못된 파라미터 · `404` 없는 작품 · `503` 환경변수 누락 · `502` 외부 API 실패.
- `q` 는 2글자 이상을 권장한다(화면은 2글자 미만이면 호출하지 않는다).
- **제목 정규화는 `lib/catalog/normalize.ts` 의 `normalizeTitle()` 하나로 통일한다.** 매칭 엔진(T18·T43)도 같은 함수를 쓴다. 한글에 오작동하는 `\w`/`\W`/`` 를 쓰지 않는다(§AGENTS.md).
- **`track(name, properties)` 유틸** (B 소유, T10): 모든 이벤트 기록은 이 함수 하나로. PostHog + events 테이블 이중 기록은 유틸 내부에서 처리 — 호출부는 신경 쓰지 않는다.

**표준 이벤트 이름** (T10에서 구현, 여기가 기준):
`app_opened` · `record_created` {media_type, import_source} · `import_started` {source} · `import_completed` {source, total, auto_matched} · `set_progress_changed` {set_id, progress} · `result_viewed` {month} · `share_image_created` {type}

## 4-1. 매체별 카탈로그 소스 — MVP 범위 결정

| 매체 | MVP 소스 | 보조 | 결정 |
|---|---|---|---|
| 게임 | IGDB (+ Steam appid 역매핑) | — | T11 구현 |
| 영화 | TMDB | ~~KMDb~~ | **KMDb는 MVP에서 제외**, 백로그 T50으로 미룬다 (T12에서 결정·기록) |
| 드라마·TV | TMDB | — | T12 구현 |

**KMDb 제외 사유**: 명세서 §3.3은 영화 보조 소스로 KMDb(한국 영화 메타데이터)를 지정했으나, TMDB의 `language=ko-KR`
응답만으로 한국어 제목이 충분히 확보되는지 먼저 확인한다. 한국 영화 제목·메타데이터 결손이 **실사용에서 확인되면**
그때 보조 연동한다. 추적 유실 방지를 위해 백로그 이슈 T50으로 명시해 둔다.

**TMDB 라이선스 의무**: 비상업적 무료 사용의 조건은 **TMDB 출처 표기**다. TMDB 데이터가 표시되는 모든 화면에
출처를 노출한다. 수익화·광고·과금을 시작하는 시점에 상업용 라이선스를 재검토한다.

**TV 시즌 표현 (§3.1 D5)**: 시즌은 별개 works 행이다. `external_ids.tmdb_season_id`(TMDB 시즌 id)로 식별하고,
시리즈는 `parent_work_id`로만 연결한다. 시즌 행에는 시리즈의 `tmdb` id를 넣지 않는다 — 같은 값이 되어 중복 대조가
서로를 물어버린다. 영화와 드라마의 `tmdb` id는 네임스페이스가 다르므로 **대조는 반드시 media_type과 함께** 한다.

## 5. 스키마 변경 절차

1. 변경이 필요한 사람이 **제안** (Linear 이슈 코멘트 또는 카톡)
2. **15분 합의** (비동기 가능)
3. 이 문서 갱신 → `supabase/migrations/000N_*.sql` 추가 (기존 파일 수정 금지)
4. dev 적용·확인 → **사람 승인 후 prod 적용**
- AI가 이 절차 없이 스키마·이 문서를 변경하는 것은 금지 (AGENTS.md 규칙 1·4)

## 6. 합의 확인

- [ ] A 권순원 — PR Approve로 갈음
- [ ] B 엄장헌 — PR 머지로 갈음
