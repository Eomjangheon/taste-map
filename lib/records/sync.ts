"use client";

// 로컬 → 서버 1회 일괄 업로드 (T45, §6.1 후반부)
// 범위는 일방향 1회 업로드로 축소(이슈 결정) — 다기기 양방향 병합은 하지 않는다.
// 클라이언트 UUID + upsert(user_id,work_id) 덕에 몇 번을 재시도해도 안전(멱등).
// 실패하면 로컬을 지우지 않는다 → 다음 방문 때 화면 로드 경로에서 자동 재시도된다.

import { supabase } from "@/lib/supabase";
import { localRecordStore } from "./local-store";

/** 로그인 상태면 로컬 기록 전량을 서버로 올리고 로컬을 비운다. 옮긴 건수를 반환. */
export async function uploadLocalRecords(): Promise<number> {
  if (!supabase) return 0;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return 0;

  const locals = await localRecordStore.list();
  if (locals.length === 0) return 0;

  const rows = locals.map((r) => ({ ...r, user_id: userId }));
  const { error } = await supabase
    .from("records")
    .upsert(rows, { onConflict: "user_id,work_id" });
  if (error) throw error;

  // 업로드가 성공했을 때만 로컬 정리 (완료 조건: 정리 시점 처리)
  await Promise.all(locals.map((r) => localRecordStore.remove(r.id)));
  return locals.length;
}
