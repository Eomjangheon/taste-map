// 검수용 데모 기록 생성기 (T17) — /library?demo=1 에서만 사용
// 시드 기록 200건(T9)은 dev DB의 시드 유저 소유(RLS 비공개)라 게스트 화면에서 읽을 수 없다.
// 대신 공개 카탈로그(works)를 재료로 같은 규모(200건)의 기록을 메모리에만 생성해
// 배포 URL에서 필터 완료 조건을 검수한다. 저장소(IndexedDB)는 건드리지 않는다.

import type { RecordStatus, TasteRecord } from "./store";

/** 시드 고정 PRNG(mulberry32) — 같은 카탈로그면 항상 같은 200건 = 검수·테스트 재현 가능 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STATUS_POOL: RecordStatus[] = [
  // 가중치: 봤어요 절반, 나머지 고르게 — 시드(T9) 분포와 비슷하게
  "completed",
  "completed",
  "completed",
  "completed",
  "completed",
  "in_progress",
  "in_progress",
  "dropped",
  "dropped",
  "backlog",
  "backlog",
];

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function buildDemoRecords(
  works: { id: string }[],
  count = 200,
  now: Date = new Date()
): TasteRecord[] {
  if (works.length === 0) return [];
  const rand = mulberry32(17); // T17
  const records: TasteRecord[] = [];

  for (let i = 0; i < count; i++) {
    const work = works[i % works.length];
    const status = STATUS_POOL[Math.floor(rand() * STATUS_POOL.length)];

    // 감상일: 최근 2년에 고르게 분포 (최근 30일·올해·작년 필터가 모두 결과를 갖도록)
    // 볼 예정은 감상일 없음, 그 외도 10%는 미입력
    let consumed_at: string | null = null;
    if (status !== "backlog" && rand() > 0.1) {
      const daysAgo = Math.floor(rand() * 730);
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      consumed_at = toDateString(d);
    }

    // 별점: 봤어요·중도하차의 80%만, 1.0~5.0 반 개 단위
    let rating: number | null = null;
    if ((status === "completed" || status === "dropped") && rand() > 0.2) {
      rating = Math.round((1 + rand() * 4) * 2) / 2;
    }

    const created = new Date(now);
    created.setDate(created.getDate() - i); // 최신순 정렬이 일정하도록
    records.push({
      id: `demo-${i}`,
      work_id: work.id,
      status,
      coordinates: [],
      rating,
      replay_count: status === "completed" && rand() > 0.85 ? 1 : 0,
      consumed_at,
      note: null,
      visibility: "private",
      import_source: "manual",
      created_at: created.toISOString(),
      updated_at: created.toISOString(),
    });
  }
  return records;
}
