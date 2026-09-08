"use client";

// 포스터 그리드 뷰 (T41, §6.3 대표 뷰)
// 커버: 게임은 Steam CDN 세로 커버, 그 외·로드 실패는 매체별 플레이스홀더 타일.
// 외부 포스터는 next/image 금지 → 일반 <img> (AGENTS.md).
// 페이지네이션: "더 보기" 32개씩. 필터가 바뀌면 부모가 key를 갈아 페이지가 리셋된다.

import { useState } from "react";
import { posterUrl } from "@/lib/works/poster";
import { STATUS_LABEL, STATUS_STYLE } from "@/lib/records/labels";
import { displayTitle, type Work, type ViewProps } from "./types";

const PAGE_SIZE = 32;

const MEDIA_ICON: Record<string, string> = {
  game: "🎮",
  movie: "🎬",
  tv: "📺",
};

const MEDIA_TILE_STYLE: Record<string, string> = {
  game: "from-indigo-100 to-indigo-200 text-indigo-900",
  movie: "from-rose-100 to-rose-200 text-rose-900",
  tv: "from-teal-100 to-teal-200 text-teal-900",
};

function PlaceholderTile({ work }: { work: Work | undefined }) {
  const media = work?.media_type ?? "";
  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br p-2 text-center ${
        MEDIA_TILE_STYLE[media] ?? "from-gray-100 to-gray-200 text-gray-700"
      }`}
      data-testid="poster-placeholder"
    >
      <span className="text-2xl">{MEDIA_ICON[media] ?? "📁"}</span>
      <span className="line-clamp-3 text-xs font-medium leading-tight">
        {displayTitle(work)}
      </span>
      {work?.release_year != null && (
        <span className="text-[10px] opacity-60">{work.release_year}</span>
      )}
    </div>
  );
}

export default function GridView({ records, workById }: ViewProps) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  // 포스터 URL은 있지만 실제 이미지가 없는 작품(구형 게임 등) → 플레이스홀더로 대체
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());

  const shown = records.slice(0, visible);

  return (
    <>
      <ul
        data-testid="library-grid"
        className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4"
      >
        {shown.map((r) => {
          const w = workById.get(r.work_id);
          const url = w && !failed.has(w.id) ? posterUrl(w) : null;
          const dimmed = r.status === "backlog";
          return (
            <li key={r.id} data-testid="grid-card">
              <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-gray-100 shadow-sm">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 외부 포스터는 next/image 금지 (AGENTS.md)
                  <img
                    src={url}
                    alt={displayTitle(w)}
                    loading="lazy"
                    onError={() =>
                      setFailed((prev) => new Set(prev).add(w!.id))
                    }
                    className={`h-full w-full object-cover ${
                      dimmed ? "opacity-50 grayscale" : ""
                    }`}
                  />
                ) : (
                  <div className={dimmed ? "h-full opacity-60 grayscale" : "h-full"}>
                    <PlaceholderTile work={w} />
                  </div>
                )}
                <span
                  className={`absolute left-1 top-1 rounded px-1 py-0.5 text-[10px] ${STATUS_STYLE[r.status]}`}
                >
                  {STATUS_LABEL[r.status]}
                </span>
                {r.rating != null && (
                  <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[10px] font-medium text-white">
                    ★ {r.rating.toFixed(1)}
                  </span>
                )}
              </div>
              {url && (
                <p className="mt-1 truncate text-xs text-gray-600">
                  {displayTitle(w)}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {records.length > visible && (
        <button
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
          data-testid="grid-more"
          className="mt-4 w-full rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-600 hover:border-blue-500 hover:text-blue-600"
        >
          더 보기 ({records.length - visible}건 남음)
        </button>
      )}
    </>
  );
}
