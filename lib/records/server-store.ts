"use client";

// 서버(Supabase records 테이블) 기록 저장소 — 로그인 상태의 저장소 (T45)
// RLS "records owner all" 정책이 본인 행만 허용하므로 user_id 필터는 이중 안전장치다.
// 화면은 이 구현을 직접 쓰지 않는다 — getRecordStore()(index.ts)가 세션에 따라 골라준다.

import { supabase } from "@/lib/supabase";
import type { RecordStore, TasteRecord } from "./store";

// user_id는 저장소 계층에서만 다루고 화면 타입(TasteRecord)에는 노출하지 않는다
const COLS =
  "id, work_id, status, coordinates, rating, replay_count, consumed_at, note, visibility, import_source, created_at, updated_at";

async function requireUserId(): Promise<string> {
  const { data } = await supabase!.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("로그인이 필요합니다");
  return id;
}

export const serverRecordStore: RecordStore = {
  async list(): Promise<TasteRecord[]> {
    const userId = await requireUserId();
    const { data, error } = await supabase!
      .from("records")
      .select(COLS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as TasteRecord[];
  },

  async getByWork(workId: string): Promise<TasteRecord | null> {
    const userId = await requireUserId();
    const { data, error } = await supabase!
      .from("records")
      .select(COLS)
      .eq("user_id", userId)
      .eq("work_id", workId)
      .maybeSingle();
    if (error) throw error;
    return (data as TasteRecord) ?? null;
  },

  async upsert(record: TasteRecord): Promise<void> {
    const userId = await requireUserId();
    // 같은 작품 기록 1개(unique user_id+work_id) — 재시도·기기 중복에도 멱등
    const { error } = await supabase!
      .from("records")
      .upsert({ ...record, user_id: userId }, { onConflict: "user_id,work_id" });
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase!.from("records").delete().eq("id", id);
    if (error) throw error;
  },
};
