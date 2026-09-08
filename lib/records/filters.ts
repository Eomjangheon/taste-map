// 기록 필터 모듈 (T17) — 매체·상태·기간 (§6.3, 좌표 영역 필터는 v2 제외)
// 순수 함수만 있는 모듈이다. 리스트 뷰(T17)·그리드(T41)·캘린더(T42)가
// 화면과 무관하게 같은 필터 로직을 소비한다.

import type { RecordStatus, TasteRecord } from "./store";

/** 매체 필터 값 — works.media_type 또는 "all" */
export type MediaFilter = "all" | string;

/** 상태 필터 값 */
export type StatusFilter = "all" | RecordStatus;

/** 기간 필터 프리셋 — 감상일(consumed_at) 기준 */
export type PeriodFilter = "all" | "last30" | "thisYear" | "lastYear";

export type RecordFilters = {
  media: MediaFilter;
  status: StatusFilter;
  period: PeriodFilter;
};

export const DEFAULT_FILTERS: RecordFilters = {
  media: "all",
  status: "all",
  period: "all",
};

export const PERIOD_LABEL: Record<PeriodFilter, string> = {
  all: "전체 기간",
  last30: "최근 30일",
  thisYear: "올해",
  lastYear: "작년",
};

/** 로컬 타임존 기준 YYYY-MM-DD (consumed_at 형식과 동일) */
export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 프리셋을 날짜 범위(양끝 포함)로 변환. "all"은 null = 범위 제한 없음 */
export function periodRange(
  period: PeriodFilter,
  now: Date = new Date()
): { from: string; to: string } | null {
  const year = now.getFullYear();
  switch (period) {
    case "all":
      return null;
    case "last30": {
      const from = new Date(now);
      from.setDate(from.getDate() - 30);
      return { from: toDateString(from), to: toDateString(now) };
    }
    case "thisYear":
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    case "lastYear":
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
  }
}

/**
 * 필터 적용. 기록에는 매체 정보가 없으므로(작품 참조뿐) 매체 필터에는
 * work_id → media_type 조회 함수를 받는다.
 * 기간 필터는 감상일(consumed_at) 기준 — 감상일이 없는 기록(볼 예정 등)은
 * 기간을 지정하면 제외된다.
 */
export function applyRecordFilters(
  records: TasteRecord[],
  filters: RecordFilters,
  mediaOf: (workId: string) => string | undefined,
  now: Date = new Date()
): TasteRecord[] {
  const range = periodRange(filters.period, now);
  return records.filter((r) => {
    if (filters.media !== "all" && mediaOf(r.work_id) !== filters.media) {
      return false;
    }
    if (filters.status !== "all" && r.status !== filters.status) {
      return false;
    }
    if (range) {
      if (!r.consumed_at) return false;
      if (r.consumed_at < range.from || r.consumed_at > range.to) return false;
    }
    return true;
  });
}
