"use client";

// 통합 작품 검색 화면 — T13
// 기록 입력(T16)과 온보딩 인생작 선택(T27)이 소비하는 검색 경로의 화면 쪽이다.
// 데이터는 계약 API `/api/works` 로만 가져온다 (docs/contract.md §4).

import { useEffect, useRef, useState } from "react";

type Result = {
  id: string;
  mediaType: string;
  title: string;
  canonicalTitle: string;
  titleKo: string | null;
  releaseYear: number | null;
  coverUrl: string | null;
  parentWorkId: string | null;
};

type Payload = {
  query: string;
  media: string;
  results: Result[];
  origin: "catalog" | "external" | "none";
};

const MEDIA = [
  { value: "all", label: "전체" },
  { value: "game", label: "게임" },
  { value: "movie", label: "영화" },
  { value: "tv", label: "드라마" },
];

const MEDIA_LABEL: Record<string, string> = { game: "게임", movie: "영화", tv: "드라마" };

const ORIGIN_LABEL: Record<Payload["origin"], string> = {
  catalog: "카탈로그에서 찾음",
  external: "외부에서 새로 가져옴",
  none: "결과 없음",
};

/** 입력 디바운스(ms) — 타이핑 중에 외부 API 를 두들기지 않도록 */
const DEBOUNCE_MS = 400;

export default function SearchPage() {
  const [term, setTerm] = useState("");
  const [media, setMedia] = useState("all");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // IME 조합 중에는 검색을 쏘지 않는다 (한글 한 글자마다 요청이 나가는 것 방지)
  const composing = useRef(false);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setPayload(null);
      setError(null);
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/works?q=${encodeURIComponent(q)}&media=${encodeURIComponent(media)}`
          );
          const body = await res.json();
          if (!active) return;
          if (!res.ok) {
            setError(body.error ?? `요청 실패 (HTTP ${res.status})`);
            setPayload(null);
          } else {
            setError(null);
            setPayload(body as Payload);
          }
        } catch (e) {
          if (active) setError(e instanceof Error ? e.message : String(e));
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [term, media]);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">작품 검색</h1>
      <p className="mt-1 text-sm text-gray-500">
        게임·영화·드라마를 한 번에 찾습니다. 카탈로그에 없으면 외부에서 가져와 채웁니다.
      </p>

      <input
        data-testid="search-input"
        className="mt-6 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        placeholder="제목을 입력하세요 (2글자 이상)"
        value={term}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(e) => {
          // 한글 조합이 끝난 시점의 값으로 검색한다 (AGENTS.md 한국어 입력 UI 규칙)
          composing.current = false;
          setTerm(e.currentTarget.value);
        }}
        onChange={(e) => {
          setLoading(e.target.value.trim().length >= 2);
          if (!composing.current) setTerm(e.target.value);
        }}
      />

      <div className="mt-3 flex items-center gap-2">
        {MEDIA.map((m) => (
          <button
            key={m.value}
            data-testid={`media-${m.value}`}
            onClick={() => {
              setLoading(term.trim().length >= 2);
              setMedia(m.value);
            }}
            className={
              media === m.value
                ? "rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white"
                : "rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-600"
            }
          >
            {m.label}
          </button>
        ))}
        {loading && <span className="text-xs text-gray-400">검색 중…</span>}
      </div>

      {error && (
        <p data-testid="search-error" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {payload && (
        <div className="mt-6">
          <p className="text-sm text-gray-600">
            <strong data-testid="result-count">{payload.results.length}</strong>건 ·{" "}
            <span data-testid="result-origin">{ORIGIN_LABEL[payload.origin]}</span>
          </p>

          <ul className="mt-3 divide-y divide-gray-200">
            {payload.results.map((r) => (
              <li key={r.id} data-testid="search-result">
                <a href={`/works/${r.id}`} className="flex gap-3 py-3 hover:bg-gray-50">
                  {/* 외부 포스터는 next/image 로 감싸지 않는다 (AGENTS.md) — 규칙상 의도된 <img> */}
                  {r.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.coverUrl}
                      alt=""
                      width={48}
                      className="h-16 w-12 rounded object-cover"
                    />
                  ) : (
                    <div className="h-16 w-12 rounded bg-gray-100" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {r.title}
                      {r.releaseYear ? (
                        <span className="ml-1 font-normal text-gray-500">({r.releaseYear})</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {MEDIA_LABEL[r.mediaType] ?? r.mediaType}
                      {r.titleKo && r.titleKo !== r.canonicalTitle
                        ? ` · 원제 ${r.canonicalTitle}`
                        : ""}
                      {r.parentWorkId ? " · 시리즈 있음" : ""}
                    </p>
                  </div>
                </a>
              </li>
            ))}
          </ul>

          {payload.results.length === 0 && (
            <p data-testid="empty-state" className="mt-4 text-sm text-gray-500">
              검색 결과가 없습니다. 제목 철자를 확인하거나 매체 필터를 바꿔 보세요.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
