"use client";

// T17: 리스트 뷰 + 매체·상태·기간 필터 (§6.3, 뷰 3종 분할 1/3)
// 필터 로직은 lib/records/filters.ts 모듈 — T41(그리드)·T42(캘린더)가 그대로 재사용한다.
// demo=1이면 저장소 대신 검수용 데모 기록 200건(메모리)을 보여준다.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getRecordStore, type TasteRecord, type RecordStatus } from "@/lib/records";
import {
  applyRecordFilters,
  DEFAULT_FILTERS,
  PERIOD_LABEL,
  type PeriodFilter,
  type RecordFilters,
} from "@/lib/records/filters";
import { buildDemoRecords } from "@/lib/records/demo";
import { MEDIA_LABEL, STATUS_LABEL, STATUS_STYLE } from "@/lib/records/labels";

type Work = {
  id: string;
  media_type: string;
  canonical_title: string;
  title_ko: string | null;
  release_year: number | null;
};

const MEDIA_OPTIONS = ["all", "game", "movie", "tv"] as const;
const STATUS_OPTIONS = [
  "all",
  "completed",
  "in_progress",
  "dropped",
  "backlog",
] as const;

export default function LibraryClient({ demo }: { demo: boolean }) {
  const [works, setWorks] = useState<Work[]>([]);
  const [records, setRecords] = useState<TasteRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filters, setFilters] = useState<RecordFilters>(DEFAULT_FILTERS);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const workList: Work[] = supabase
        ? ((
            await supabase
              .from("works")
              .select("id, media_type, canonical_title, title_ko, release_year")
              .order("id")
          ).data ?? [])
        : [];
      const recordList = demo
        ? buildDemoRecords(workList)
        : await getRecordStore().list();
      if (cancelled) return;
      setWorks(workList);
      setRecords(recordList);
      setLoaded(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [demo]);

  const workById = useMemo(() => new Map(works.map((w) => [w.id, w])), [works]);

  const filtered = useMemo(() => {
    const result = applyRecordFilters(
      records,
      filters,
      (workId) => workById.get(workId)?.media_type
    );
    // 감상일 내림차순, 감상일 없는 기록은 뒤에서 기록일 내림차순
    return [...result].sort((a, b) => {
      if (a.consumed_at && b.consumed_at)
        return b.consumed_at.localeCompare(a.consumed_at);
      if (a.consumed_at) return -1;
      if (b.consumed_at) return 1;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [records, filters, workById]);

  const filterActive =
    filters.media !== "all" ||
    filters.status !== "all" ||
    filters.period !== "all";

  return (
    <main className="mx-auto w-full max-w-xl p-6 sm:p-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">모아보기</h1>
        <a href="/records" className="text-sm font-medium text-blue-600">
          + 기록하기
        </a>
      </div>
      {demo && (
        <p className="mt-1 text-xs text-amber-600" data-testid="demo-banner">
          검수용 데모 데이터 {records.length}건을 보는 중입니다 — 내 기록이
          아니에요.
        </p>
      )}

      {/* ── 필터 바 (매체·상태·기간) ── */}
      <div className="mt-5 flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5" data-testid="filter-media">
          {MEDIA_OPTIONS.map((m) => (
            <button
              key={m}
              onClick={() => setFilters((f) => ({ ...f, media: m }))}
              data-testid={`filter-media-${m}`}
              className={`rounded-full border px-3 py-1 text-xs ${
                filters.media === m
                  ? "border-blue-500 bg-blue-50 font-medium text-blue-700"
                  : "border-gray-300 text-gray-600"
              }`}
            >
              {m === "all" ? "전체 매체" : MEDIA_LABEL[m]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" data-testid="filter-status">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setFilters((f) => ({ ...f, status: s }))}
              data-testid={`filter-status-${s}`}
              className={`rounded-full border px-3 py-1 text-xs ${
                filters.status === s
                  ? "border-blue-500 bg-blue-50 font-medium text-blue-700"
                  : "border-gray-300 text-gray-600"
              }`}
            >
              {s === "all" ? "전체 상태" : STATUS_LABEL[s as RecordStatus]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filters.period}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                period: e.target.value as PeriodFilter,
              }))
            }
            data-testid="filter-period"
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700"
          >
            {(Object.keys(PERIOD_LABEL) as PeriodFilter[]).map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABEL[p]}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-400">기간은 감상일 기준</span>
          {filterActive && (
            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              data-testid="filter-reset"
              className="ml-auto text-xs text-blue-600"
            >
              필터 초기화
            </button>
          )}
        </div>
      </div>

      <p className="mt-4 text-sm text-gray-500">
        <strong data-testid="filtered-count" className="text-gray-900">
          {filtered.length}
        </strong>
        건
      </p>

      {/* ── 리스트 뷰: 제목·연도·상태·별점 ── */}
      <ul data-testid="library-list" className="mt-2 flex flex-col gap-2">
        {loaded && filtered.length === 0 ? (
          <li
            className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400"
            data-testid="empty-state"
          >
            {records.length === 0 ? (
              <>
                아직 기록이 없어요.{" "}
                <a href="/records" className="font-medium text-blue-600">
                  첫 작품 기록하러 가기 →
                </a>
              </>
            ) : (
              <>조건에 맞는 기록이 없어요. 필터를 풀어보세요.</>
            )}
          </li>
        ) : (
          filtered.map((r) => {
            const w = workById.get(r.work_id);
            return (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {w ? (w.title_ko ?? w.canonical_title) : "(작품 정보 없음)"}
                    {w?.release_year != null && (
                      <span className="ml-1.5 text-xs font-normal text-gray-400">
                        {w.release_year}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                    {w && (
                      <span
                        className="rounded bg-gray-100 px-1.5 py-0.5"
                        data-testid="row-media"
                      >
                        {MEDIA_LABEL[w.media_type] ?? w.media_type}
                      </span>
                    )}
                    <span
                      className={`rounded px-1.5 py-0.5 ${STATUS_STYLE[r.status]}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                    {r.consumed_at && <span>{r.consumed_at}</span>}
                  </p>
                </div>
                <span className="shrink-0 text-sm text-gray-700">
                  {r.rating != null ? `★ ${r.rating.toFixed(1)}` : ""}
                </span>
              </li>
            );
          })
        )}
      </ul>
    </main>
  );
}
