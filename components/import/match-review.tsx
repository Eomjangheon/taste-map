"use client";

// 매칭 확인 UX 3종 — T44 (매칭 3/3), §5.3 UX 규격
//
//   자동 확정 → 결과만 통보 (기본 접힘. 잘된 일로 화면을 채우지 않는다)
//   애매      → 후보 3개, **탭 1회로 선택**
//   미발견    → 스킵 목록 일괄 표시
//
// **흐름이 끊기지 않게** 가 이 화면의 설계 목표다. 수백 건이 세 상태로 섞여 들어오므로
// 유저가 할 일(애매 건)을 맨 위에 모아 세고, 나머지는 접어 둔다.
// 확정 저장은 여기서 하지 않는다 — Steam(T19)·CSV(T20)가 `onConfirm` 으로 받아 records 를 만든다.

import { useMemo, useState } from "react";
import type { ReviewItem, ReviewWork } from "@/lib/matching/review";

type Props = {
  items: ReviewItem[];
  /** 확정 목록을 넘긴다. 가져오기 이슈(T19·T20)가 여기서 records 를 만든다 */
  onConfirm?: (picked: { item: ReviewItem; work: ReviewWork }[]) => void;
  /** 버튼 문구 — "기록 12건 추가" 처럼 경로마다 다르게 쓴다 */
  confirmLabel?: string;
};

const MEDIA_LABEL: Record<string, string> = { game: "게임", movie: "영화", tv: "드라마" };

/** 유저가 직접 고른 선택. key → 작품 id, 또는 "" (건너뛰기) */
type Picks = Record<string, string>;

function WorkLine({ work }: { work: ReviewWork }) {
  return (
    <span className="inline-flex items-center gap-2">
      {work.coverUrl ? (
        // 외부 포스터는 next/image 로 감싸지 않는다 (AGENTS.md 기술 스택)
        // eslint-disable-next-line @next/next/no-img-element
        <img src={work.coverUrl} alt="" className="h-8 w-6 rounded object-cover" />
      ) : (
        <span className="flex h-8 w-6 items-center justify-center rounded bg-gray-100 text-[10px] text-gray-400">
          {MEDIA_LABEL[work.mediaType]?.[0] ?? "?"}
        </span>
      )}
      <span>
        <strong className="font-medium">{work.title}</strong>
        {work.releaseYear ? <span className="text-gray-500"> ({work.releaseYear})</span> : null}
      </span>
    </span>
  );
}

export function MatchReview({ items, onConfirm, confirmLabel }: Props) {
  const [picks, setPicks] = useState<Picks>({});
  const [showAuto, setShowAuto] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const auto = useMemo(() => items.filter((i) => i.status === "auto"), [items]);
  const choose = useMemo(() => items.filter((i) => i.status === "choose"), [items]);
  const skipped = useMemo(() => items.filter((i) => i.status === "skip"), [items]);

  const decided = choose.filter((i) => picks[i.key] !== undefined);
  const picked = choose.filter((i) => picks[i.key]);
  const remaining = choose.length - decided.length;
  /** 실제로 기록이 만들어질 건수 — 자동 확정 + 유저가 고른 것 */
  const confirmCount = auto.length + picked.length;

  function pick(item: ReviewItem, workId: string) {
    setPicks((prev) => ({ ...prev, [item.key]: workId }));
  }

  function confirm() {
    const resolved = [
      ...auto.map((item) => ({ item, work: item.matched! })),
      ...picked.map((item) => ({
        item,
        work: item.candidates.find((c) => c.work.id === picks[item.key])!.work,
      })),
    ];
    setDone(resolved.length);
    onConfirm?.(resolved);
  }

  return (
    <div className="space-y-6">
      {/* ── 요약: 세 상태를 한 줄에 세어 보여준다 ── */}
      <div
        data-testid="review-summary"
        className="grid grid-cols-3 gap-2 rounded-lg border border-gray-200 p-4 text-center"
      >
        <div>
          <p data-testid="count-auto" className="text-2xl font-bold text-green-600">
            {auto.length}
          </p>
          <p className="text-xs text-gray-500">자동으로 찾음</p>
        </div>
        <div>
          <p data-testid="count-choose" className="text-2xl font-bold text-blue-600">
            {choose.length}
          </p>
          <p className="text-xs text-gray-500">확인 필요</p>
        </div>
        <div>
          <p data-testid="count-skip" className="text-2xl font-bold text-gray-400">
            {skipped.length}
          </p>
          <p className="text-xs text-gray-500">찾지 못함</p>
        </div>
      </div>

      {/* ── ③ 애매 건: 유저가 할 일이라 맨 위에 둔다 ── */}
      {choose.length > 0 && (
        <section data-testid="review-choose">
          <h2 className="text-sm font-semibold">
            확인이 필요해요{" "}
            <span data-testid="remaining-count" className="text-gray-500">
              {remaining > 0 ? `· ${remaining}건 남음` : "· 모두 확인했어요"}
            </span>
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            비슷한 작품이 여럿이라 자동으로 정하지 않았습니다. 맞는 것을 한 번 눌러 주세요.
          </p>

          <ul className="mt-3 space-y-3">
            {choose.map((item) => {
              const chosen = picks[item.key];
              const chosenWork = item.candidates.find((c) => c.work.id === chosen)?.work;

              return (
                <li
                  key={item.key}
                  data-testid="choose-item"
                  data-key={item.key}
                  data-resolved={chosen !== undefined}
                  className="rounded-lg border border-gray-200 p-3"
                >
                  <p className="text-sm">
                    <span className="text-gray-500">가져온 항목</span>{" "}
                    <strong className="font-medium">{item.sourceTitle}</strong>
                    {item.sourceYear ? (
                      <span className="text-gray-500"> ({item.sourceYear})</span>
                    ) : null}
                  </p>

                  {chosen !== undefined ? (
                    // 고른 뒤에는 카드를 접는다 — 남은 일이 눈에 띄어야 흐름이 이어진다
                    <p data-testid="choose-resolved" className="mt-2 text-sm">
                      {chosenWork ? (
                        <>
                          <span className="text-green-600">✓ </span>
                          <WorkLine work={chosenWork} />
                        </>
                      ) : (
                        <span className="text-gray-500">건너뜀</span>
                      )}
                      <button
                        type="button"
                        data-testid="choose-undo"
                        onClick={() =>
                          setPicks((prev) => {
                            const next = { ...prev };
                            delete next[item.key];
                            return next;
                          })
                        }
                        className="ml-3 text-xs text-blue-600 underline"
                      >
                        다시 고르기
                      </button>
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.candidates.map((c) => (
                        <button
                          key={c.work.id}
                          type="button"
                          data-testid="candidate"
                          data-work-id={c.work.id}
                          onClick={() => pick(item, c.work.id)}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-left text-sm hover:border-blue-500 hover:bg-blue-50"
                        >
                          <WorkLine work={c.work} />
                          <span className="mt-1 block text-xs text-gray-500">{c.reason}</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        data-testid="candidate-skip"
                        onClick={() => pick(item, "")}
                        className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
                      >
                        건너뛰기
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── ①② 자동 확정: 결과만 통보. 기본 접힘 ── */}
      {auto.length > 0 && (
        <section data-testid="review-auto">
          <button
            type="button"
            data-testid="auto-toggle"
            onClick={() => setShowAuto((v) => !v)}
            className="text-sm font-semibold"
          >
            자동으로 찾은 {auto.length}건 <span className="text-gray-400">{showAuto ? "▾" : "▸"}</span>
          </button>
          {showAuto && (
            <ul data-testid="auto-list" className="mt-2 space-y-1 text-sm">
              {auto.map((item) => (
                <li
                  key={item.key}
                  data-testid="auto-item"
                  className="flex flex-wrap items-center gap-2 rounded border border-gray-100 px-3 py-2"
                >
                  <span className="text-gray-500">{item.sourceTitle}</span>
                  <span className="text-gray-300">→</span>
                  <WorkLine work={item.matched!} />
                  <span className="text-xs text-gray-400">{item.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── ④ 스킵 목록: 일괄 표시 ── */}
      {skipped.length > 0 && (
        <section data-testid="review-skip">
          <h2 className="text-sm font-semibold text-gray-600">찾지 못한 {skipped.length}건</h2>
          <p className="mt-1 text-xs text-gray-500">
            카탈로그에 없는 항목입니다. 이번 가져오기에서는 건너뜁니다. (직접 등록은 준비 중)
          </p>
          <ul data-testid="skip-list" className="mt-2 space-y-1 text-sm text-gray-500">
            {skipped.map((item) => (
              <li
                key={item.key}
                data-testid="skip-item"
                className="rounded border border-dashed border-gray-200 px-3 py-2"
              >
                {item.sourceTitle}
                {item.sourceYear ? ` (${item.sourceYear})` : ""}
                <span className="ml-2 text-xs text-gray-400">{MEDIA_LABEL[item.mediaType]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── 마무리 ── */}
      <div className="sticky bottom-0 border-t border-gray-200 bg-white/95 py-3">
        {done === null ? (
          <>
            <button
              type="button"
              data-testid="confirm-import"
              onClick={confirm}
              disabled={confirmCount === 0}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:bg-gray-300"
            >
              {confirmLabel ?? `${confirmCount}건 기록에 추가`}
            </button>
            {remaining > 0 && (
              <p className="mt-2 text-center text-xs text-gray-500">
                확인하지 않은 {remaining}건은 추가되지 않습니다
              </p>
            )}
          </>
        ) : (
          <p data-testid="confirm-done" className="text-center text-sm font-semibold text-green-600">
            {done}건을 기록에 추가했습니다
          </p>
        )}
      </div>
    </div>
  );
}
