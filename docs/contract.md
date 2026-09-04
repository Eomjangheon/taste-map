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

- **작품 조회·검색 API** (A 소유, T13에서 시그니처 고정 후 이 절에 기록): B는 이 API로만 작품을 조회한다. T13 완성 전까지 B는 시드 작품(T9)으로 개발.
- **`track(name, properties)` 유틸** (B 소유, T10): 모든 이벤트 기록은 이 함수 하나로. PostHog + events 테이블 이중 기록은 유틸 내부에서 처리 — 호출부는 신경 쓰지 않는다.

**표준 이벤트 이름** (T10에서 구현, 여기가 기준):
`app_opened` · `record_created` {media_type, import_source} · `import_started` {source} · `import_completed` {source, total, auto_matched} · `set_progress_changed` {set_id, progress} · `result_viewed` {month} · `share_image_created` {type}

## 5. 스키마 변경 절차

1. 변경이 필요한 사람이 **제안** (Linear 이슈 코멘트 또는 카톡)
2. **15분 합의** (비동기 가능)
3. 이 문서 갱신 → `supabase/migrations/000N_*.sql` 추가 (기존 파일 수정 금지)
4. dev 적용·확인 → **사람 승인 후 prod 적용**
- AI가 이 절차 없이 스키마·이 문서를 변경하는 것은 금지 (AGENTS.md 규칙 1·4)

## 6. 합의 확인

- [ ] A 권순원 — PR Approve로 갈음
- [ ] B 엄장헌 — PR 머지로 갈음
