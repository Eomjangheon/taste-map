"use client";

// CSV 업로드 가져오기 — T20
//
// §5.2 가져오기 경로 2번. Letterboxd 를 완성하고, Goodreads 는 파서만 두고 안내로 막는다
// (책은 v1 — §3.3. 이슈의 '명세 모순 플래그'에 대한 결론).
//
// **파일은 서버로 올라가지 않는다.** 브라우저에서 파싱하고 매칭에 필요한 열(제목·연도)만 보낸다.
// 별점·감상일은 화면이 들고 있다가 기록을 만들 때 쓴다 — 감상 기록 전체를 서버 로그에 흘리지 않는다.

import { useRef, useState } from "react";
import { MatchReview } from "@/components/import/match-review";
import { track } from "@/lib/analytics";
import { CsvFormatError, parseImportCsv, type CsvRow } from "@/lib/import/csv";
import type { ReviewItem, ReviewWork } from "@/lib/matching/review";
import { createRecord, getRecordStore } from "@/lib/records";

/** 서버의 CSV_CHUNK_SIZE 와 같아야 한다 */
const CHUNK_SIZE = 25;

type Phase = "input" | "parsing" | "matching" | "review" | "saved" | "book";

export default function CsvImportPage() {
  const [phase, setPhase] = useState<Phase>("input");
  const [error, setError] = useState<string | null>(null);
  const [variant, setVariant] = useState("");
  const [total, setTotal] = useState(0);
  const [dropped, setDropped] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [savedCount, setSavedCount] = useState(0);

  /** 별점·감상일은 서버에 보내지 않으므로 여기서 들고 있는다 (key → 원본 행) */
  const rowByKey = useRef(new Map<string, CsvRow>());

  async function onFile(file: File) {
    setError(null);
    setItems([]);
    setMatchedCount(0);
    setPhase("parsing");

    let parsed;
    try {
      parsed = parseImportCsv(await file.text());
    } catch (e) {
      setError(
        e instanceof CsvFormatError
          ? e.message
          : `파일을 읽지 못했습니다: ${e instanceof Error ? e.message : String(e)}`
      );
      setPhase("input");
      return;
    }

    setVariant(parsed.variant);
    setDropped(parsed.dropped);

    // Goodreads — 파서는 돌지만 가져오기는 하지 않는다 (책은 v1)
    if (parsed.source === "goodreads") {
      setTotal(parsed.rows.length);
      setPhase("book");
      return;
    }

    rowByKey.current = new Map(parsed.rows.map((row) => [row.key, row]));
    setTotal(parsed.rows.length);
    if (parsed.rows.length === 0) {
      setError("가져올 행이 없습니다");
      setPhase("input");
      return;
    }

    void track("import_started", { source: "csv" });
    setPhase("matching");

    const collected: ReviewItem[] = [];
    for (let i = 0; i < parsed.rows.length; i += CHUNK_SIZE) {
      const chunk = parsed.rows.slice(i, i + CHUNK_SIZE);
      const res = await fetch("/api/import/csv/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 매칭에 필요한 열만 보낸다
        body: JSON.stringify({
          rows: chunk.map((r) => ({ key: r.key, title: r.title, year: r.year })),
        }),
      });
      const body = (await res.json()) as { items?: ReviewItem[]; error?: string };
      if (!res.ok) {
        setError(body.error ?? `매칭 실패 (HTTP ${res.status})`);
        setPhase("input");
        return;
      }
      collected.push(...(body.items ?? []));
      setMatchedCount(Math.min(i + chunk.length, parsed.rows.length));
      setItems([...collected]);
    }

    setPhase("review");
  }

  /** 확인 UX 가 넘겨준 확정 목록 → 기록 생성 (계약 §1 가져오기 규약) */
  async function saveRecords(picked: { item: ReviewItem; work: ReviewWork }[]) {
    const store = getRecordStore();
    let created = 0;

    for (const { item, work } of picked) {
      const row = rowByKey.current.get(item.key);
      const existing = await store.getByWork(work.id);

      if (existing) {
        // 이미 있는 기록은 덮지 않는다 — 비어 있는 칸만 채운다
        await store.upsert({
          ...existing,
          rating: existing.rating ?? row?.rating ?? null,
          consumed_at: existing.consumed_at ?? row?.consumedAt ?? null,
          updated_at: new Date().toISOString(),
        });
        continue;
      }

      await store.upsert(
        createRecord(work.id, "completed", {
          import_source: "csv",
          rating: row?.rating ?? null,
          consumed_at: row?.consumedAt ?? null,
          replay_count: row?.rewatch ? 1 : 0,
        })
      );
      created += 1;
    }

    setSavedCount(created);
    setPhase("saved");
    void track("import_completed", {
      source: "csv",
      total: items.length,
      auto_matched: items.filter((i) => i.status === "auto").length,
    });
  }

  const percent = total > 0 ? Math.round((matchedCount / total) * 100) : 0;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-bold">CSV 로 가져오기</h1>
      <p className="mt-1 text-sm text-gray-500">
        Letterboxd 내보내기 파일의 영화 기록을 한 번에 옮깁니다. 별점과 감상일도 함께 가져옵니다.
      </p>

      {(phase === "input" || phase === "parsing") && (
        <div className="mt-6 space-y-3">
          <label
            htmlFor="csv-file"
            className="block rounded-lg border-2 border-dashed border-gray-300 p-6 text-center"
          >
            <span className="block text-sm font-medium">CSV 파일 선택</span>
            <span className="mt-1 block text-xs text-gray-500">
              Letterboxd → Settings → Data → Export Your Data 로 받은 zip 안의{" "}
              <code>diary.csv</code> · <code>ratings.csv</code> · <code>watched.csv</code> 중 하나
            </span>
            <input
              id="csv-file"
              data-testid="csv-file"
              type="file"
              accept=".csv,text/csv"
              className="mt-3 w-full text-xs"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
              }}
            />
          </label>
          <p className="text-xs text-gray-500">
            파일은 서버로 올라가지 않습니다. 브라우저에서 읽고 제목·연도만 대조에 사용합니다.
          </p>
          {phase === "parsing" && <p className="text-sm text-gray-500">파일을 읽는 중…</p>}
        </div>
      )}

      {error && (
        <div data-testid="csv-error" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">파일을 가져오지 못했습니다</p>
          <p className="mt-1 text-xs text-red-700">{error}</p>
          <p className="mt-2 text-xs text-red-400">
            Letterboxd 내보내기의 <code>diary.csv</code>·<code>ratings.csv</code>·
            <code>watched.csv</code> 를 그대로 올려 주세요.
          </p>
        </div>
      )}

      {/* Goodreads — 파서는 통과했지만 책은 v1 이라 가져오지 않는다 */}
      {phase === "book" && (
        <div data-testid="csv-book-notice" className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">책은 곧 지원됩니다</p>
          <p className="mt-1 text-xs text-amber-800">
            Goodreads 파일을 정상적으로 읽었습니다({total}권). 다만 지금은 게임·영화·드라마만
            기록할 수 있어서 가져오기는 하지 않았습니다. 책 지원이 열리면 이 파일을 그대로 올리시면
            됩니다.
          </p>
          <button
            type="button"
            data-testid="csv-reset"
            onClick={() => {
              setPhase("input");
              setError(null);
            }}
            className="mt-3 text-sm font-medium text-blue-600"
          >
            다른 파일 올리기
          </button>
        </div>
      )}

      {phase === "matching" && (
        <div data-testid="csv-progress" className="mt-6">
          <p className="text-sm">
            <strong>{variant}</strong> 에서 읽은 <strong>{total}</strong>편을 카탈로그와 대조하는 중…{" "}
            <strong data-testid="csv-progress-count">{matchedCount}</strong> / {total}
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Letterboxd 는 작품 ID 를 주지 않아 제목과 연도로 대조합니다. 처음 보는 영화는 새로 담느라
            조금 걸립니다.
          </p>
        </div>
      )}

      {phase === "review" && (
        <div className="mt-6">
          <p className="mb-3 text-sm text-gray-600">
            <strong>{variant}</strong> 에서 <strong>{total}</strong>편을 읽었습니다.
            {dropped > 0 && <> 제목이 비어 있는 {dropped}행은 건너뛰었습니다.</>}
          </p>
          <MatchReview items={items} onConfirm={(picked) => void saveRecords(picked)} />
        </div>
      )}

      {phase === "saved" && (
        <div data-testid="csv-saved" className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-700">기록 {savedCount}건을 만들었습니다</p>
          <p className="mt-1 text-xs text-green-700">
            별점과 감상일을 그대로 가져왔습니다. 이미 기록이 있던 작품은 덮어쓰지 않았습니다.
          </p>
          <a href="/library" className="mt-3 inline-block text-sm font-medium text-blue-600">
            모아보기에서 확인 →
          </a>
        </div>
      )}

      {/* 무료 라이선스의 조건 — TMDB 데이터가 보이는 화면에는 출처를 표기한다 (docs/tmdb.md) */}
      <p className="mt-10 text-[11px] leading-relaxed text-gray-400">
        이 화면의 영화 정보는 TMDB에서 제공받았습니다. This product uses the TMDB API but is not
        endorsed or certified by TMDB.
      </p>
    </main>
  );
}
