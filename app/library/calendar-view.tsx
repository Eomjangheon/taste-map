"use client";

// 캘린더 뷰 (T42, 뷰 3/3) — consumed_at(감상일) 기준 월 캘린더
// 직접 그리지 않고 경량 라이브러리 react-day-picker 사용 (§6.3 초보 시간 함정 회피).
// 일자 탭 → 그날의 기록을 리스트 뷰 컴포넌트로 재사용해 보여준다. 월 이동은 내장 내비게이션.

import { useMemo, useState } from "react";
import { DayPicker, type DayButtonProps } from "react-day-picker";
import { ko } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { toDateString } from "@/lib/records/filters";
import ListView from "./list-view";
import type { ViewProps } from "./types";

export default function CalendarView({ records, workById }: ViewProps) {
  // 감상일 없는 기록(볼 예정 등)은 달력에 놓을 자리가 없다 — 개수만 안내
  const dated = useMemo(
    () => records.filter((r) => r.consumed_at != null),
    [records]
  );
  const undatedCount = records.length - dated.length;

  const countByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of dated) {
      m.set(r.consumed_at!, (m.get(r.consumed_at!) ?? 0) + 1);
    }
    return m;
  }, [dated]);

  // 부모가 감상일 내림차순으로 정렬해 주므로 첫 건이 가장 최근 — 그 달에서 시작
  const [month, setMonth] = useState<Date>(() =>
    dated[0]?.consumed_at
      ? new Date(`${dated[0].consumed_at}T00:00:00`)
      : new Date()
  );
  const [selected, setSelected] = useState<Date | undefined>();

  const selectedKey = selected ? toDateString(selected) : null;
  const dayRecords = selectedKey
    ? dated.filter((r) => r.consumed_at === selectedKey)
    : [];

  function DayWithCount(props: DayButtonProps) {
    // modifiers는 DayButton 계약상 받지만(버튼 속성으로 새면 안 됨) 여기선 쓰지 않는다
    const { day, modifiers, children, ...buttonProps } = props;
    void modifiers;
    const count = countByDate.get(toDateString(day.date)) ?? 0;
    return (
      <button
        {...buttonProps}
        className={`${buttonProps.className ?? ""} relative`}
        data-testid={count > 0 ? "cal-day-has" : undefined}
      >
        {children}
        {count > 0 && (
          <span
            data-testid="cal-count"
            className="absolute right-0.5 top-0.5 rounded-full bg-blue-600 px-1 text-[9px] font-semibold leading-3.5 text-white"
          >
            {count}
          </span>
        )}
      </button>
    );
  }

  return (
    <div data-testid="calendar-view" className="mt-2">
      <div className="flex justify-center rounded-xl border border-gray-200 p-3 [--rdp-accent-color:#2563eb] [--rdp-day-height:2.75rem] [--rdp-day-width:2.75rem]">
        <DayPicker
          mode="single"
          selected={selected}
          onSelect={setSelected}
          month={month}
          onMonthChange={setMonth}
          locale={ko}
          components={{ DayButton: DayWithCount }}
        />
      </div>

      {undatedCount > 0 && (
        <p className="mt-2 text-xs text-gray-400" data-testid="cal-undated">
          감상일이 없는 기록 {undatedCount}건은 캘린더에 표시되지 않아요.
        </p>
      )}

      {selectedKey ? (
        <div className="mt-4">
          <p className="text-sm text-gray-500">
            <strong className="text-gray-900">{selectedKey}</strong>{" "}
            <span data-testid="cal-day-count">{dayRecords.length}</span>건
          </p>
          {dayRecords.length > 0 ? (
            <ListView records={dayRecords} workById={workById} />
          ) : (
            <p className="mt-2 rounded-xl border border-dashed border-gray-300 p-4 text-center text-sm text-gray-400">
              이 날의 기록이 없어요.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-4 text-center text-sm text-gray-400">
          날짜를 누르면 그날의 기록이 보여요.
        </p>
      )}
    </div>
  );
}
