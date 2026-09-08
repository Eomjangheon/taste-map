"use client";

// T11 완료 조건 확인 화면 — 게임 제목 검색 → IGDB 조회·적재 → 중복 생성 여부 확인.
// 통합 검색 UI 는 T13 에서 만든다. 이 화면은 A 트랙 내부 확인용이다.

import { useState } from "react";

type Result = {
  id: string;
  canonicalTitle: string;
  titleKo: string | null;
  releaseYear: number | null;
  igdbId: number | null;
  steamAppId: number | null;
  parentWorkId: string | null;
  gameType: string | null;
  coverUrl: string | null;
};

type Payload = {
  query: string;
  results: Result[];
  created: number;
  existing: number;
  totalWorks: number;
  note?: string;
};

export default function GameCatalogPage() {
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
      const res = await fetch(`/api/catalog/games?q=${encodeURIComponent(q)}`);
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
      <h1 className="text-2xl font-bold">게임 카탈로그 (IGDB)</h1>
      <p className="mt-1 text-sm text-gray-500">
        제목으로 검색하면 IGDB에서 조회해 카탈로그에 적재합니다. 같은 게임을 두 번 검색해도 새로
        만들지 않습니다. (T11 확인 화면 — 통합 검색 UI는 T13)
      </p>

      <div className="mt-6 flex gap-2">
        <input
          data-testid="catalog-search-input"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          placeholder="예: Stardew Valley"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            // 한글 IME 조합 확정과 겹치지 않게 한다 (AGENTS.md 한국어 입력 UI 규칙)
            if (e.key === "Enter" && !e.nativeEvent.isComposing) search();
          }}
        />
        <button
          data-testid="catalog-search-submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={search}
          disabled={loading || term.trim() === ""}
        >
          {loading ? "검색 중…" : "검색"}
        </button>
      </div>

      {error && (
        <p data-testid="catalog-error" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {payload && (
        <div className="mt-6">
          <p className="text-sm">
            신규 적재 <strong data-testid="catalog-created">{payload.created}</strong>건 · 기존
            재사용 <strong data-testid="catalog-existing">{payload.existing}</strong>건 · 카탈로그
            총 <strong data-testid="works-total">{payload.totalWorks}</strong>건
          </p>
          {payload.note && <p className="mt-1 text-xs text-amber-600">{payload.note}</p>}

          <ul className="mt-4 divide-y divide-gray-200">
            {payload.results.map((r) => (
              <li key={r.id} data-testid="catalog-result" className="flex gap-3 py-3">
                {/* 외부 포스터는 next/image 로 감싸지 않는다 (AGENTS.md 기술 스택) — 규칙상 의도된 <img> */}
                {r.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.coverUrl} alt="" width={48} className="h-16 w-12 rounded object-cover" />
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
                  <p className="mt-0.5 text-xs text-gray-500">
                    igdb {r.igdbId ?? "—"}
                    {r.steamAppId ? ` · steam ${r.steamAppId}` : ""}
                    {r.gameType ? ` · ${r.gameType}` : ""}
                    {r.parentWorkId ? " · 상위 작품 연결됨" : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
