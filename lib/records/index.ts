"use client";

// 저장소 선택 진입점 — 화면은 항상 getRecordStore()만 호출한다.
// 지금은 게스트 로컬 저장소 고정. 가입·로그인(T25) 후에는 서버 저장소를 반환하도록
// 이 함수 하나만 바뀐다 (T45 — 화면 코드는 변경 없음).

import { localRecordStore } from "./local-store";
import type { RecordStore } from "./store";

export function getRecordStore(): RecordStore {
  return localRecordStore;
}

export * from "./store";
