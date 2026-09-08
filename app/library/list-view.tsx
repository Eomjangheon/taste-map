"use client";

// 리스트 뷰 (T17) — T41에서 뷰 탭 분리로 파일 이동, 마크업은 그대로

import { MEDIA_LABEL, STATUS_LABEL, STATUS_STYLE } from "@/lib/records/labels";
import { displayTitle, type ViewProps } from "./types";

export default function ListView({ records, workById }: ViewProps) {
  return (
    <ul data-testid="library-list" className="mt-2 flex flex-col gap-2">
      {records.map((r) => {
        const w = workById.get(r.work_id);
        return (
          <li
            key={r.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {displayTitle(w)}
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
      })}
    </ul>
  );
}
