"use client";

// T15 검증용 최소 기록 화면 — 작품 선택 + 상태 저장 + 목록.
// 본격 2단 기록 입력 UX는 T16에서 이 화면을 대체·확장한다.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { track } from "@/lib/analytics";
import {
  getRecordStore,
  createRecord,
  type TasteRecord,
  type RecordStatus,
} from "@/lib/records";

type WorkOption = {
  id: string;
  media_type: string;
  canonical_title: string;
  title_ko: string | null;
};

const STATUS_LABEL: Record<RecordStatus, string> = {
  completed: "봤어요",
  in_progress: "보는 중",
  dropped: "중도하차",
  backlog: "볼 예정",
};

export default function RecordsPage() {
  const store = useMemo(() => getRecordStore(), []);
  const [works, setWorks] = useState<WorkOption[]>([]);
  const [records, setRecords] = useState<TasteRecord[]>([]);
  const [selectedWork, setSelectedWork] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<RecordStatus>("completed");
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setRecords(await store.list());
  }, [store]);

  useEffect(() => {
    reload();
    if (supabase) {
      supabase
        .from("works")
        .select("id, media_type, canonical_title, title_ko")
        .order("title_ko")
        .then(({ data }) => setWorks(data ?? []));
    }
  }, [reload]);

  const workTitle = useMemo(() => {
    const map = new Map(
      works.map((w) => [w.id, w.title_ko ?? w.canonical_title])
    );
    return (id: string) => map.get(id) ?? "(작품 정보 없음)";
  }, [works]);

  async function save() {
    if (!selectedWork) return;
    const existing = await store.getByWork(selectedWork);
    if (existing) {
      await store.upsert({
        ...existing,
        status: selectedStatus,
        updated_at: new Date().toISOString(),
      });
      setMessage("기존 기록의 상태를 바꿨어요");
    } else {
      const media = works.find((w) => w.id === selectedWork)?.media_type;
      await store.upsert(createRecord(selectedWork, selectedStatus));
      setMessage("기록했어요");
      track("record_created", { media_type: media, import_source: "manual" });
    }
    await reload();
  }

  async function remove(id: string) {
    if (!confirm("이 기록을 삭제할까요?")) return;
    await store.remove(id);
    await reload();
  }

  return (
    <main className="mx-auto w-full max-w-xl p-6 sm:p-8">
      <h1 className="text-2xl font-bold">내 기록</h1>
      <p className="mt-1 text-xs text-gray-500">
        지금은 계정 없이 <strong>이 브라우저에만</strong> 저장됩니다. 브라우저
        데이터를 지우면 기록도 사라져요 — 가입하면 서버에 안전하게 보관됩니다
        (준비 중).
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <select
          value={selectedWork}
          onChange={(e) => setSelectedWork(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          data-testid="work-select"
        >
          <option value="">작품 선택…</option>
          {works.map((w) => (
            <option key={w.id} value={w.id}>
              [{w.media_type}] {w.title_ko ?? w.canonical_title}
            </option>
          ))}
        </select>
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value as RecordStatus)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          data-testid="status-select"
        >
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          onClick={save}
          disabled={!selectedWork}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          data-testid="save-record"
        >
          기록
        </button>
      </div>

      {message && <p className="mt-3 text-sm text-green-700">{message}</p>}

      <ul data-testid="record-list" className="mt-6 flex flex-col gap-2">
        {records.length === 0 ? (
          <li className="text-sm text-gray-400">
            아직 기록이 없습니다. 첫 작품을 기록해 보세요.
          </li>
        ) : (
          records.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 p-3"
            >
              <div>
                <p className="text-sm font-medium">{workTitle(r.work_id)}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {STATUS_LABEL[r.status]} ·{" "}
                  {new Date(r.created_at).toLocaleDateString("ko-KR")}
                </p>
              </div>
              <button
                onClick={() => remove(r.id)}
                className="text-sm text-gray-500 hover:text-red-600"
              >
                삭제
              </button>
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
