"use client";

// 저장소 선택 진입점 — 화면은 항상 getRecordStore()만 호출한다.
// T15 예고대로 T45에서 완성: 로그인 상태면 서버(Supabase), 게스트면 로컬(IndexedDB).
// 세션 확인이 비동기라서, 호출 시점마다 세션을 보고 위임하는 라우터를 돌려준다
// (화면 코드는 T15 때와 완전히 동일하게 동작).

import { supabase } from "@/lib/supabase";
import { localRecordStore } from "./local-store";
import { serverRecordStore } from "./server-store";
import type { RecordStore, TasteRecord } from "./store";

async function activeStore(): Promise<RecordStore> {
  if (!supabase) return localRecordStore;
  const { data } = await supabase.auth.getSession();
  return data.session ? serverRecordStore : localRecordStore;
}

const routingStore: RecordStore = {
  list: async () => (await activeStore()).list(),
  getByWork: async (workId) => (await activeStore()).getByWork(workId),
  upsert: async (record: TasteRecord) => (await activeStore()).upsert(record),
  remove: async (id) => (await activeStore()).remove(id),
};

export function getRecordStore(): RecordStore {
  return routingStore;
}

export * from "./store";
