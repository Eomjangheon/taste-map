"use client";

// Steam 연동 가져오기 — T19
//
// MVP 차별점 ①(§12). 게임을 1급 매체로 다루는 부분의 실제 입구다.
//
// 흐름: ID 입력 → 라이브러리 조회(1회) → 50건씩 매칭(진행률) → 확인 UX(T44) → 기록 생성
//
// **기록은 이 화면이 만든다.** 계약 §1 의 가져오기 규약을 지킨다 —
// import_source='steam', status='completed', coordinates=[], 클라이언트 UUID,
// 같은 작품에 기록이 이미 있으면 **덮지 않고** 플레이 시간 같은 메타만 갱신한다.

import { useRef, useState } from "react";
import { MatchReview } from "@/components/import/match-review";
import { track } from "@/lib/analytics";
import type { ReviewItem, ReviewWork } from "@/lib/matching/review";
import { createRecord, getRecordStore } from "@/lib/records";
import { guideFor } from "@/lib/steam/guide";
import { playtimeToProgress } from "@/lib/steam/playtime";

/** 화면이 한 번에 보내는 건수 — 서버의 CHUNK_SIZE 와 같아야 한다 */
const CHUNK_SIZE = 50;

type OwnedGame = { appId: number; name: string; playtimeMinutes: number };

type Phase = "input" | "loading" | "matching" | "review" | "saved";

type Failure = { code?: string; message: string };

export default function SteamImportPage() {
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [failure, setFailure] = useState<Failure | null>(null);

  const [total, setTotal] = useState(0);
  const [neverPlayed, setNeverPlayed] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [savedCount, setSavedCount] = useState(0);

  // IME 조합 중 Enter 는 한글 확정이지 제출이 아니다 (AGENTS.md 한국어 입력 규칙)
  const composing = useRef(false);

  async function start() {
    const value = input.trim();
    if (!value || phase === "loading" || phase === "matching") return;

    setFailure(null);
    setItems([]);
    setMatchedCount(0);
    setPhase("loading");
    void track("import_started", { source: "steam" });

    try {
      // 1단계: 라이브러리 조회. 몇 개인지 먼저 알아야 진행률을 그린다
      const res = await fetch("/api/import/steam/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: value }),
      });
      const body = (await res.json()) as {
        games?: OwnedGame[];
        total?: number;
        neverPlayed?: number;
        error?: string;
        code?: string;
      };

      if (!res.ok) {
        setFailure({ code: body.code, message: body.error ?? `요청 실패 (HTTP ${res.status})` });
        setPhase("input");
        return;
      }

      const games = body.games ?? [];
      setTotal(games.length);
      setNeverPlayed(body.neverPlayed ?? 0);

      if (games.length === 0) {
        setFailure({ code: "private", message: "보유한 게임이 없습니다" });
        setPhase("input");
        return;
      }

      // 2단계: 청크로 매칭. 한 청크가 끝날 때마다 화면을 갱신해 멈춘 것처럼 보이지 않게 한다
      setPhase("matching");
      const collected: ReviewItem[] = [];

      for (let i = 0; i < games.length; i += CHUNK_SIZE) {
        const chunk = games.slice(i, i + CHUNK_SIZE);
        const chunkRes = await fetch("/api/import/steam/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ games: chunk }),
        });
        const chunkBody = (await chunkRes.json()) as { items?: ReviewItem[]; error?: string };

        if (!chunkRes.ok) {
          setFailure({ message: chunkBody.error ?? `매칭 실패 (HTTP ${chunkRes.status})` });
          setPhase("input");
          return;
        }

        collected.push(...(chunkBody.items ?? []));
        setMatchedCount(Math.min(i + chunk.length, games.length));
        setItems([...collected]);
      }

      setPhase("review");
    } catch (error) {
      setFailure({ message: error instanceof Error ? error.message : String(error) });
      setPhase("input");
    }
  }

  /** 확인 UX 가 넘겨준 확정 목록 → 기록 생성 (계약 §1 가져오기 규약) */
  async function saveRecords(picked: { item: ReviewItem; work: ReviewWork }[]) {
    const store = getRecordStore();
    let created = 0;

    for (const { item, work } of picked) {
      const progress = playtimeToProgress(item.playtimeMinutes);
      const existing = await store.getByWork(work.id);

      if (existing) {
        // 이미 있는 기록은 **덮지 않는다.** 유저가 남긴 별점·감상문이 가져오기로 지워지면 안 된다
        await store.upsert({
          ...existing,
          progress: progress ?? existing.progress ?? null,
          updated_at: new Date().toISOString(),
        });
        continue;
      }

      await store.upsert(
        createRecord(work.id, "completed", { import_source: "steam", progress })
      );
      created += 1;
    }

    setSavedCount(created);
    setPhase("saved");
    void track("import_completed", {
      source: "steam",
      total: items.length,
      auto_matched: items.filter((i) => i.status === "auto").length,
    });
  }

  const guide = failure ? guideFor(failure.code) : null;
  const percent = total > 0 ? Math.round((matchedCount / total) * 100) : 0;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-bold">Steam 라이브러리 가져오기</h1>
      <p className="mt-1 text-sm text-gray-500">
        보유한 게임을 한 번에 기록으로 옮깁니다. 플레이 시간도 함께 가져옵니다.
      </p>

      {/* ── 입력 ── */}
      {(phase === "input" || phase === "loading") && (
        <div className="mt-6 space-y-3">
          <label className="block text-sm font-medium" htmlFor="steam-input">
            프로필 주소 또는 SteamID64
          </label>
          <input
            id="steam-input"
            data-testid="steam-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onCompositionStart={() => (composing.current = true)}
            onCompositionEnd={() => (composing.current = false)}
            onKeyDown={(e) => {
              // 한글 조합 중 Enter 는 확정 키다 — 제출로 삼으면 안 된다
              if (e.key === "Enter" && !e.nativeEvent.isComposing && !composing.current) {
                void start();
              }
            }}
            placeholder="https://steamcommunity.com/id/내이름 또는 7656119…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-500">
            로그인하지 않습니다. 공개된 보유 게임 목록만 읽습니다.
          </p>
          <button
            type="button"
            data-testid="steam-start"
            onClick={() => void start()}
            disabled={input.trim() === "" || phase === "loading"}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:bg-gray-300"
          >
            {phase === "loading" ? "라이브러리를 찾는 중…" : "가져오기 시작"}
          </button>
        </div>
      )}

      {/* ── 실패: 사유별 안내 (WEB-3 에서 확인한 실패 모양 기준) ── */}
      {guide && (
        <div
          data-testid="steam-error"
          data-code={failure?.code ?? "unknown"}
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm font-semibold text-red-700">{guide.title}</p>
          <p className="mt-1 text-xs text-red-700">{guide.hint}</p>
          <p className="mt-2 text-xs text-red-400">{failure?.message}</p>
        </div>
      )}

      {/* ── 진행 표시: 수백 건이라 멈춘 것처럼 보이면 안 된다 ── */}
      {phase === "matching" && (
        <div data-testid="steam-progress" className="mt-6">
          <p className="text-sm">
            보유 게임 <strong>{total}</strong>개를 카탈로그와 대조하는 중…{" "}
            <strong data-testid="steam-progress-count">{matchedCount}</strong> / {total}
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            처음 가져오는 게임은 카탈로그에 새로 담느라 조금 걸립니다. 창을 닫지 말아 주세요.
          </p>
        </div>
      )}

      {/* ── 확인 UX (T44) ── */}
      {phase === "review" && (
        <div className="mt-6">
          <p className="mb-3 text-sm text-gray-600">
            보유 게임 <strong>{total}</strong>개를 대조했습니다.
            {neverPlayed > 0 && (
              <>
                {" "}
                이 중 <strong data-testid="never-played">{neverPlayed}</strong>개는 플레이 기록이
                없지만, 현재 규격(§5.3)대로 모두 <strong>완료</strong> 상태로 들어갑니다.
              </>
            )}
          </p>
          <MatchReview
            items={items}
            onConfirm={(picked) => void saveRecords(picked)}
            confirmLabel={undefined}
          />
        </div>
      )}

      {/* ── 완료 ── */}
      {phase === "saved" && (
        <div data-testid="steam-saved" className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-700">
            기록 {savedCount}건을 만들었습니다
          </p>
          <p className="mt-1 text-xs text-green-700">
            이미 기록이 있던 작품은 덮어쓰지 않고 플레이 시간만 갱신했습니다.
          </p>
          <a href="/library" className="mt-3 inline-block text-sm font-medium text-blue-600">
            모아보기에서 확인 →
          </a>
        </div>
      )}
    </main>
  );
}
