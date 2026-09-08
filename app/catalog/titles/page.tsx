"use client";

// T12 완료 조건 확인 화면 — 영화·드라마 제목 검색 → TMDB 조회·적재 → 한국어 제목·포스터·시즌 분리 확인.
// 통합 검색 UI 는 T13 에서 만든다.

import { useState } from "react";

type Result = {
  id: string;
  canonicalTitle: string;
  titleKo: string | null;
  releaseYear: number | null;
  mediaType: string;
  kind: "movie" | "tv-series" | "tv-season";
  externalIds: Record<string, unknown>;
  parentWorkId: string | null;
  posterUrl: string | null;
};

type Payload = {
  query: string;
  results: Result[];
  created: number;
  existing: number;
  totalWorks: number;
  note?: string;
};

const KIND_LABEL: Record<Result["kind"], string> = {
  movie: "영화",
  "tv-series": "드라마",
  "tv-season": "드라마 시즌",
};

export default function TitleCatalogPage() {
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<Payload | null>(null);

  async function search() {
    const q = term.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/catalog/titles?q=${encodeURIComponent(q)}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `요청 실패 (HTTP ${res.status})`);
        setPayload(null);
      } else {
        setPayload(body as Payload);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">영화·드라마 카탈로그 (TMDB)</h1>
      <p className="mt-1 text-sm text-gray-500">
        제목으로 검색하면 TMDB에서 한국어 제목과 함께 조회해 카탈로그에 적재합니다. 드라마는 시즌마다
        별개 작품으로 저장됩니다. (T12 확인 화면 — 통합 검색 UI는 T13)
      </p>

      <div className="mt-6 flex gap-2">
        <input
          data-testid="title-search-input"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          placeholder="예: 오징어 게임"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            // 한글 IME 조합 확정과 겹치지 않게 한다 (AGENTS.md 한국어 입력 UI 규칙)
            if (e.key === "Enter" && !e.nativeEvent.isComposing) search();
          }}
        />
        <button
          data-testid="title-search-submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={search}
          disabled={loading || term.trim() === ""}
        >
          {loading ? "검색 중…" : "검색"}
        </button>
      </div>

      {error && (
        <p data-testid="title-error" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {payload && (
        <div className="mt-6">
          <p className="text-sm">
            신규 적재 <strong data-testid="title-created">{payload.created}</strong>건 · 기존 재사용{" "}
            <strong data-testid="title-existing">{payload.existing}</strong>건 · 카탈로그 총{" "}
            <strong data-testid="title-works-total">{payload.totalWorks}</strong>건
          </p>
          {payload.note && <p className="mt-1 text-xs text-amber-600">{payload.note}</p>}

          <ul className="mt-4 divide-y divide-gray-200">
            {payload.results.map((r) => (
              <li key={r.id} data-testid="title-result" className="flex gap-3 py-3">
                {/* 외부 포스터는 next/image 로 감싸지 않는다 (AGENTS.md 기술 스택) — 규칙상 의도된 <img> */}
                {r.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.posterUrl} alt="" width={48} className="h-16 w-12 rounded object-cover" />
                ) : (
                  <div className="h-16 w-12 rounded bg-gray-100" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {r.titleKo ?? r.canonicalTitle}
                    {r.releaseYear ? (
                      <span className="ml-1 font-normal text-gray-500">({r.releaseYear})</span>
                    ) : null}
                  </p>
                  {r.titleKo && (
                    <p className="truncate text-xs text-gray-400">원제: {r.canonicalTitle}</p>
                  )}
                  <p className="mt-0.5 text-xs text-gray-500">
                    {KIND_LABEL[r.kind]}
                    {r.parentWorkId ? " · 시리즈 연결됨" : ""}
                    {" · "}
                    {Object.entries(r.externalIds)
                      .map(([k, v]) => `${k} ${v}`)
                      .join(" · ")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 무료 라이선스의 조건 — TMDB 데이터가 보이는 화면에는 출처를 표기한다 (docs/tmdb.md) */}
      <footer className="mt-10 border-t border-gray-200 pt-4 text-xs text-gray-500">
        이 화면의 영화·드라마 정보는 TMDB에서 제공받았습니다. This product uses the TMDB API but is not
        endorsed or certified by TMDB.
      </footer>
    </main>
  );
}
