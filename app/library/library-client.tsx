"use client";

// 모아보기 (T17 리스트 + T41 그리드 + T42 캘린더 — 뷰 3종 완성)
// 필터·검색 로직은 부모(여기)가 소유하고 모든 뷰가 같은 결과를 소비하므로
// 뷰를 전환해도 필터·검색어가 유지된다 (T42 완료 조건).
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
import { MEDIA_LABEL, STATUS_LABEL } from "@/lib/records/labels";
import { loose } from "@/lib/text";
import { type Work } from "./types";
import GridView from "./grid-view";
import ListView from "./list-view";
import CalendarView from "./calendar-view";
import AccountStatus from "@/components/account-status";

const MEDIA_OPTIONS = ["all", "game", "movie", "tv"] as const;
const STATUS_OPTIONS = [
  "all",
  "completed",
  "in_progress",
  "dropped",
  "backlog",
] as const;

type ViewMode = "grid" | "list" | "calendar";

export default function LibraryClient({ demo }: { demo: boolean }) {
  const [works, setWorks] = useState<Work[]>([]);
  const [records, setRecords] = useState<TasteRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filters, setFilters] = useState<RecordFilters>(DEFAULT_FILTERS);
  const [query, setQuery] = useState(""); // 내 기록 제목 검색 (T42)
  const [view, setView] = useState<ViewMode>("grid"); // 그리드 = 대표 뷰 (§6.3)

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const workList: Work[] = supabase
        ? ((
            await supabase
              .from("works")
              .select(
                "id, media_type, canonical_title, title_ko, release_year, external_ids"
              )
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
    let result = applyRecordFilters(
      records,
      filters,
      (workId) => workById.get(workId)?.media_type
    );
    // 내 기록 제목 검색 — 띄어쓰기·특수문자 무시 (T16 작품 검색과 같은 규칙)
    const q = loose(query);
    if (q) {
      result = result.filter((r) => {
        const w = workById.get(r.work_id);
        if (!w) return false;
        return (
          loose(w.title_ko ?? "").includes(q) ||
          loose(w.canonical_title).includes(q)
        );
      });
    }
    // 감상일 내림차순, 감상일 없는 기록은 뒤에서 기록일 내림차순
    return [...result].sort((a, b) => {
      if (a.consumed_at && b.consumed_at)
        return b.consumed_at.localeCompare(a.consumed_at);
      if (a.consumed_at) return -1;
      if (b.consumed_at) return 1;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [records, filters, query, workById]);

  const filterActive =
    filters.media !== "all" ||
    filters.status !== "all" ||
    filters.period !== "all" ||
    query !== "";
  // 필터·검색이 바뀌면 그리드의 "더 보기" 페이지를 처음으로 리셋
  const filterKey = `${filters.media}|${filters.status}|${filters.period}|${query}`;

  return (
    <main className="mx-auto w-full max-w-2xl p-6 sm:p-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">모아보기</h1>
        <span className="flex items-baseline gap-3">
          <AccountStatus />
          <a href="/records" className="text-sm font-medium text-blue-600">
            + 기록하기
          </a>
        </span>
      </div>
      {demo && (
        <p className="mt-1 text-xs text-amber-600" data-testid="demo-banner">
          검수용 데모 데이터 {records.length}건을 보는 중입니다 — 내 기록이
          아니에요.
        </p>
      )}

      {/* ── 기록 0건: 빈 상태 화면 (T27 온보딩의 가져오기·기록 유도가 들어올 자리) ── */}
      {loaded && records.length === 0 ? (
        <div
          className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-300 px-6 py-14 text-center"
          data-testid="empty-screen"
        >
          <span className="text-4xl">🗺️</span>
          <p className="text-base font-semibold">아직 기록이 없어요</p>
          <p className="text-sm text-gray-500">
            첫 작품을 기록하면 이 자리가 포스터로 채워집니다.
          </p>
          <a
            href="/records"
            className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
          >
            첫 작품 기록하기
          </a>
          <p className="text-xs text-gray-400">
            Steam 라이브러리 한 번에 가져오기는 준비 중이에요.
          </p>
        </div>
      ) : (
        <>
          {/* ── 뷰 탭 + 필터 바 ── */}
          <div className="mt-5 flex flex-col gap-2">
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1 self-start">
              {(
                [
                  ["grid", "그리드"],
                  ["list", "리스트"],
                  ["calendar", "캘린더"],
                ] as [ViewMode, string][]
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setView(mode)}
                  data-testid={`view-${mode}`}
                  className={`rounded-md px-3 py-1 text-xs font-medium ${
                    view === mode
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="내 기록에서 제목 검색 (띄어쓰기 안 맞아도 OK)"
              data-testid="record-search"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
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
                  onClick={() => {
                    setFilters(DEFAULT_FILTERS);
                    setQuery("");
                  }}
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

          {loaded && filtered.length === 0 ? (
            <div
              className="mt-2 rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400"
              data-testid="empty-state"
            >
              조건에 맞는 기록이 없어요. 필터를 풀어보세요.
            </div>
          ) : view === "grid" ? (
            <GridView key={filterKey} records={filtered} workById={workById} />
          ) : view === "calendar" ? (
            <CalendarView records={filtered} workById={workById} />
          ) : (
            <ListView records={filtered} workById={workById} />
          )}
        </>
      )}
    </main>
  );
}
