"use client";

// 한국어 제목 보정 — 운영자(개발자) 전용 내부 화면. T14
// 내부용이므로 꾸미지 않는다 (이슈 체크리스트).
//
// 표본 조사(docs/t14-title-ko-survey.md): 게임은 IGDB 결손 60~90% 이고 있는 값도 속어라
// 여기서 넣는 값이 유일한 한국어 제목이다. 영화·드라마는 결손 0% 라 예외 보정만 하면 된다.

import { useEffect, useState } from "react";

type Work = {
  id: string;
  media_type: string;
  canonical_title: string;
  title_ko: string | null;
  release_year: number | null;
  external_ids: Record<string, unknown>;
};

const MEDIA = [
  { value: "", label: "전체" },
  { value: "game", label: "게임" },
  { value: "movie", label: "영화" },
  { value: "tv", label: "드라마" },
];

export default function TitleKoAdminPage() {
  const [media, setMedia] = useState("");
  const [works, setWorks] = useState<Work[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 이펙트 본문에서 곧바로 setState 하지 않는다 (연쇄 렌더 유발 — 린트 규칙).
  // 로딩 표시는 media 변경 핸들러가 켜고, 여기서는 await 이후에만 상태를 만진다.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/title-ko?media=${encodeURIComponent(media)}`);
        const body = await res.json();
        if (!active) return;
        if (!res.ok) setError(body.error ?? `요청 실패 (HTTP ${res.status})`);
        else {
          setError(null);
          setWorks(body.works as Work[]);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [media]);

  async function save(work: Work) {
    const titleKo = (drafts[work.id] ?? "").trim();
    if (!titleKo || saving) return;
    setSaving(work.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/title-ko", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workId: work.id, titleKo }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `저장 실패 (HTTP ${res.status})`);
        return;
      }
      // 저장한 항목은 목록에서 빼고 결과를 남긴다 — 결손 목록이므로 채워지면 대상이 아니다
      setSaved((prev) => ({ ...prev, [work.id]: titleKo }));
      setWorks((prev) => prev.filter((w) => w.id !== work.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold">한국어 제목 보정 (내부용)</h1>
      <p className="mt-1 text-sm text-gray-500">
        한국어 제목이 비어 있는 작품 목록입니다. 등록하면 검색에 바로 반영됩니다. 카탈로그 재적재는
        이 값을 덮지 않습니다. (T14)
      </p>

      <div className="mt-4 flex items-center gap-2">
        <select
          data-testid="media-filter"
          className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          value={media}
          onChange={(e) => {
            setLoading(true);
            setMedia(e.target.value);
          }}
        >
          {MEDIA.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <span data-testid="missing-count" className="text-sm text-gray-600">
          {loading ? "불러오는 중…" : `${works.length}건`}
        </span>
      </div>

      {error && (
        <p data-testid="admin-error" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}

      <ul className="mt-4 divide-y divide-gray-200">
        {works.map((w) => (
          <li key={w.id} data-testid="missing-row" data-work-id={w.id} className="py-3">
            <p className="text-sm font-medium">
              {w.canonical_title}
              {w.release_year ? (
                <span className="ml-1 font-normal text-gray-500">({w.release_year})</span>
              ) : null}
              <span className="ml-2 text-xs text-gray-400">{w.media_type}</span>
            </p>
            <p className="mt-0.5 text-xs text-gray-400">
              {Object.entries(w.external_ids ?? {})
                .map(([k, v]) => `${k} ${v}`)
                .join(" · ") || "외부 id 없음"}
            </p>
            <div className="mt-2 flex gap-2">
              <input
                data-testid="title-ko-input"
                className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
                placeholder="한국어 제목"
                value={drafts[w.id] ?? ""}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [w.id]: e.target.value }))}
                onKeyDown={(e) => {
                  // 한글 IME 조합 확정과 겹치지 않게 한다 (AGENTS.md 한국어 입력 UI 규칙)
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) void save(w);
                }}
              />
              <button
                data-testid="title-ko-save"
                className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
                onClick={() => void save(w)}
                disabled={saving === w.id || !(drafts[w.id] ?? "").trim()}
              >
                {saving === w.id ? "저장 중…" : "저장"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {Object.keys(saved).length > 0 && (
        <div className="mt-6 border-t border-gray-200 pt-4">
          <p className="text-sm font-medium">이번에 등록한 것</p>
          <ul className="mt-1 text-sm text-gray-600">
            {Object.entries(saved).map(([id, title]) => (
              <li key={id} data-testid="saved-row">
                {title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
