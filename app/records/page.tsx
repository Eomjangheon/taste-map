"use client";

// T16: 2단 기록 입력 + 기록 CRUD (§6.2, §8)
// 1단계 = 작품 탭 + 상태 탭 → 즉시 저장 (목표 3탭 이내 — 레포브 5탭 대비 차별화, WEB-4)
// 2단계(선택) = 별점(반 개 단위)·감상문·감상일·재감상·공개 토글
// T53: 작품 검색은 계약 API /api/works 로만 (contract.md §4 — works 직접 읽기 금지).
//      카탈로그에 없으면 서버가 외부(IGDB·TMDB)에서 가져와 적재한 뒤 돌려준다.
// 기록 목록의 제목 표시용 works 조회는 벌크 엔드포인트가 계약에 없어 아직 직접 읽는다
// (A에게 제안 예정 — WEB-53 코멘트).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { track } from "@/lib/analytics";
import StarRating from "@/components/star-rating";
import AccountStatus, { useSessionEmail } from "@/components/account-status";
import { uploadLocalRecords } from "@/lib/records/sync";
import {
  getRecordStore,
  createRecord,
  type TasteRecord,
  type RecordStatus,
} from "@/lib/records";
import { STATUS_LABEL, STATUS_STYLE, MEDIA_LABEL } from "@/lib/records/labels";

type WorkOption = {
  id: string;
  media_type: string;
  canonical_title: string;
  title_ko: string | null;
};

/** 계약 API(/api/works) 검색 결과 — contract.md §4의 응답 필드 */
type SearchResult = {
  id: string;
  mediaType: string;
  title: string;
  canonicalTitle: string;
  titleKo: string | null;
  releaseYear: number | null;
  coverUrl: string | null;
};

const SEARCH_DEBOUNCE_MS = 400;

export default function RecordsPage() {
  const store = useMemo(() => getRecordStore(), []);
  const sessionEmail = useSessionEmail();
  const [works, setWorks] = useState<WorkOption[]>([]);
  const [records, setRecords] = useState<TasteRecord[]>([]);
  const [query, setQuery] = useState("");
  const [selectedWork, setSelectedWork] = useState<WorkOption | null>(null);
  // T53: 검색 상태 — null = 검색 전(2글자 미만 포함)
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchOrigin, setSearchOrigin] = useState<string | null>(null);
  // IME 조합 중에는 검색을 쏘지 않는다 (한글 한 글자마다 요청 방지 — /search 화면과 동일 규칙)
  const composing = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // 2단계 편집 상태
  const [editRating, setEditRating] = useState<number | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStatus, setEditStatus] = useState<RecordStatus>("completed");
  const [editPublic, setEditPublic] = useState(false);

  const reload = useCallback(async () => {
    setRecords(await store.list());
  }, [store]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // 로그인 상태면 남아 있는 로컬 기록을 먼저 계정으로 옮긴다 (T45 — 실패 시 다음 방문 때 재시도)
      const moved = await uploadLocalRecords().catch(() => 0);
      if (moved > 0 && !cancelled) {
        setMessage(`이 브라우저의 기록 ${moved}건을 계정으로 옮겼어요`);
      }
      const list = await store.list();
      if (!cancelled) setRecords(list);
      if (supabase) {
        const { data } = await supabase
          .from("works")
          .select("id, media_type, canonical_title, title_ko")
          .order("title_ko");
        if (!cancelled) setWorks(data ?? []);
      }
    }
    load();
    // 로그인·로그아웃 즉시 반영 — 저장소가 세션에 따라 바뀌므로 다시 읽는다 (T45)
    const { data: sub } =
      supabase?.auth.onAuthStateChange(() => load()) ?? { data: null };
    return () => {
      cancelled = true;
      sub?.subscription.unsubscribe();
    };
  }, [store]);

  const workById = useMemo(() => new Map(works.map((w) => [w.id, w])), [works]);
  const titleOf = (id: string) => {
    const w = workById.get(id);
    return w ? (w.title_ko ?? w.canonical_title) : "(작품 정보 없음)";
  };

  // T53: 계약 API 검색 (디바운스, 2글자 미만 미호출 — contract.md §4 규약)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return; // 상태 정리는 입력 핸들러에서 (린트: effect 내 동기 setState 금지)
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/works?q=${encodeURIComponent(q)}&media=all&limit=8`
        );
        const body = await res.json();
        if (!active) return;
        if (!res.ok) {
          setSearchError(
            res.status === 503
              ? "검색 서버 설정이 아직 준비되지 않았어요 (환경변수 누락)"
              : (body.error ?? `검색 실패 (HTTP ${res.status})`)
          );
          setResults([]);
          setSearchOrigin(null);
        } else {
          setSearchError(null);
          setResults(body.results as SearchResult[]);
          setSearchOrigin(body.origin as string);
        }
      } catch {
        if (active) {
          setSearchError("검색 중 문제가 생겼어요 — 잠시 후 다시 시도해 주세요");
          setResults([]);
        }
      } finally {
        if (active) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  /** 검색 결과 선택 — 제목 표시 캐시(works)에도 합류시켜 저장 직후 목록에 제목이 나오게 */
  function selectResult(r: SearchResult) {
    const w: WorkOption = {
      id: r.id,
      media_type: r.mediaType,
      canonical_title: r.canonicalTitle,
      title_ko: r.titleKo,
    };
    setWorks((prev) => (prev.some((p) => p.id === w.id) ? prev : [...prev, w]));
    setSelectedWork(w);
  }

  /** 1단계: 상태 탭 = 즉시 저장 */
  async function quickSave(status: RecordStatus) {
    if (!selectedWork) return;
    const existing = await store.getByWork(selectedWork.id);
    let saved: TasteRecord;
    if (existing) {
      saved = { ...existing, status, updated_at: new Date().toISOString() };
      await store.upsert(saved);
      setMessage(`'${titleOf(selectedWork.id)}' 상태를 바꿨어요`);
    } else {
      saved = createRecord(selectedWork.id, status);
      await store.upsert(saved);
      setMessage(`'${titleOf(selectedWork.id)}' 기록 완료!`);
      track("record_created", {
        media_type: selectedWork.media_type,
        import_source: "manual",
      });
    }
    setSelectedWork(null);
    setQuery("");
    setResults(null); // 다음 검색을 위해 결과 초기화 (지우지 않으면 이전 목록이 다시 보임)
    await reload();
    openDetail(saved); // 2단계를 바로 열어줌 — 원치 않으면 그냥 지나가면 됨
  }

  /** 2단계 편집 열기 */
  function openDetail(r: TasteRecord) {
    setExpandedId(r.id);
    setEditRating(r.rating);
    setEditNote(r.note ?? "");
    setEditDate(r.consumed_at ?? new Date().toISOString().slice(0, 10));
    setEditStatus(r.status);
    setEditPublic(r.visibility === "public");
  }

  async function saveDetail(r: TasteRecord) {
    await store.upsert({
      ...r,
      status: editStatus,
      rating: editRating,
      note: editNote.trim() || null,
      consumed_at: editStatus === "backlog" ? null : editDate || null,
      visibility: editPublic ? "public" : "private",
      updated_at: new Date().toISOString(),
    });
    setExpandedId(null);
    setMessage("저장했어요");
    await reload();
  }

  async function addReplay(r: TasteRecord) {
    await store.upsert({
      ...r,
      replay_count: r.replay_count + 1,
      updated_at: new Date().toISOString(),
    });
    await reload();
  }

  async function remove(id: string) {
    if (!confirm("이 기록을 삭제할까요?")) return;
    await store.remove(id);
    if (expandedId === id) setExpandedId(null);
    await reload();
  }

  return (
    <main className="mx-auto w-full max-w-xl p-6 sm:p-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">내 기록</h1>
        <span className="flex items-baseline gap-3">
          <AccountStatus />
          <a href="/library" className="text-sm font-medium text-blue-600">
            모아보기 →
          </a>
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {sessionEmail ? (
          <>기록이 계정에 안전하게 보관되고 있어요.</>
        ) : (
          <>
            계정 없이 <strong>이 브라우저에만</strong> 저장됩니다 —{" "}
            <a href="/auth" className="text-blue-600">
              가입하면
            </a>{" "}
            서버에 안전하게 보관돼요.
          </>
        )}
      </p>

      {/* ── 1단계: 작품 찾기 → 상태 탭 = 저장 ── */}
      <div className="mt-6 rounded-xl border border-gray-200 p-4">
        {!selectedWork ? (
          <>
            <input
              value={query}
              onCompositionStart={() => {
                composing.current = true;
              }}
              onCompositionEnd={(e) => {
                // 한글 조합이 끝난 시점의 값으로 검색 (AGENTS.md 한국어 입력 UI 규칙)
                composing.current = false;
                const v = e.currentTarget.value;
                setQuery(v);
                if (v.trim().length < 2) {
                  setResults(null);
                  setSearchError(null);
                  setSearching(false);
                }
              }}
              onChange={(e) => {
                const v = e.target.value;
                setSearching(v.trim().length >= 2);
                if (!composing.current) {
                  setQuery(v);
                  if (v.trim().length < 2) {
                    setResults(null);
                    setSearchError(null);
                  }
                }
              }}
              placeholder="어떤 작품이든 찾아드려요 (2글자 이상, 띄어쓰기 안 맞아도 OK)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              data-testid="work-search"
            />
            {searching && (
              <p className="mt-2 text-xs text-gray-400" data-testid="search-loading">
                찾아보는 중… (처음 찾는 작품은 몇 초 걸릴 수 있어요)
              </p>
            )}
            {searchError && (
              <p className="mt-2 text-xs text-red-600" data-testid="search-error">
                {searchError}
              </p>
            )}
            {results && results.length > 0 && (
              <>
                <ul className="mt-2 flex flex-col gap-1" data-testid="work-results">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button
                        onClick={() => selectResult(r)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100"
                      >
                        {r.coverUrl && (
                          // eslint-disable-next-line @next/next/no-img-element -- 외부 포스터는 next/image 금지 (AGENTS.md)
                          <img
                            src={r.coverUrl}
                            alt=""
                            loading="lazy"
                            className="h-9 w-6 shrink-0 rounded object-cover"
                          />
                        )}
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                          {MEDIA_LABEL[r.mediaType] ?? r.mediaType}
                        </span>
                        <span className="min-w-0 truncate">{r.title}</span>
                        {r.releaseYear != null && (
                          <span className="shrink-0 text-xs text-gray-400">
                            {r.releaseYear}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
                {searchOrigin === "external" && (
                  <p className="mt-1 text-xs text-gray-400">
                    외부에서 방금 가져온 작품이에요 — 카탈로그에 추가됐어요.
                  </p>
                )}
              </>
            )}
            {results && results.length === 0 && !searching && !searchError && (
              <p className="mt-2 text-xs text-gray-400">
                검색 결과가 없어요. 제목을 조금 다르게 써볼까요?
              </p>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium" data-testid="selected-work">
                {selectedWork.title_ko ?? selectedWork.canonical_title}
              </p>
              <button
                onClick={() => setSelectedWork(null)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                다시 선택
              </button>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              상태를 누르면 바로 저장돼요:
            </p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {(Object.keys(STATUS_LABEL) as RecordStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => quickSave(s)}
                  data-testid={`quick-${s}`}
                  className="rounded-lg border border-gray-300 px-2 py-2 text-sm hover:border-blue-500 hover:bg-blue-50"
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {message && (
        <p className="mt-3 text-sm text-green-700" data-testid="save-message">
          {message}
        </p>
      )}

      {/* ── 기록 목록 + 2단계 상세 ── */}
      <ul data-testid="record-list" className="mt-6 flex flex-col gap-2">
        {records.length === 0 ? (
          <li className="text-sm text-gray-400">
            아직 기록이 없습니다. 첫 작품을 기록해 보세요.
          </li>
        ) : (
          records.map((r) => (
            <li key={r.id} className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {titleOf(r.work_id)}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                    <span
                      className={`rounded px-1.5 py-0.5 ${STATUS_STYLE[r.status]}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                    {r.rating != null && <span>★ {r.rating.toFixed(1)}</span>}
                    {r.replay_count > 0 && (
                      <span>재감상 {r.replay_count}회</span>
                    )}
                    {r.visibility === "public" && <span>공개</span>}
                    {r.consumed_at && <span>{r.consumed_at}</span>}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2 text-sm">
                  <button
                    onClick={() =>
                      expandedId === r.id ? setExpandedId(null) : openDetail(r)
                    }
                    className="text-blue-600"
                    data-testid={`detail-${r.work_id}`}
                  >
                    {expandedId === r.id ? "닫기" : "상세"}
                  </button>
                  <button
                    onClick={() => remove(r.id)}
                    className="text-gray-400 hover:text-red-600"
                  >
                    삭제
                  </button>
                </div>
              </div>

              {r.note && expandedId !== r.id && (
                <p className="mt-2 truncate text-xs text-gray-500">{r.note}</p>
              )}

              {expandedId === r.id && (
                <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 pt-3">
                  <div className="grid grid-cols-4 gap-2">
                    {(Object.keys(STATUS_LABEL) as RecordStatus[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => setEditStatus(s)}
                        className={`rounded-lg border px-2 py-1.5 text-xs ${
                          editStatus === s
                            ? "border-blue-500 bg-blue-50 font-medium"
                            : "border-gray-300"
                        }`}
                      >
                        {STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>
                  <StarRating value={editRating} onChange={setEditRating} />
                  <textarea
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="감상을 남겨보세요 (선택)"
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    data-testid="note-input"
                  />
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    {editStatus !== "backlog" && (
                      <label className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">감상일</span>
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="rounded border border-gray-300 px-2 py-1 text-sm"
                        />
                      </label>
                    )}
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={editPublic}
                        onChange={(e) => setEditPublic(e.target.checked)}
                      />
                      <span className="text-xs text-gray-500">공개</span>
                    </label>
                    {r.status === "completed" && (
                      <button
                        onClick={() => addReplay(r)}
                        className="text-xs text-blue-600"
                      >
                        재감상 +1
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => saveDetail(r)}
                    className="self-end rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
                    data-testid="save-detail"
                  >
                    저장
                  </button>
                </div>
              )}
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
