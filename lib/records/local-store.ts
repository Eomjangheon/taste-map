"use client";

// 로컬(IndexedDB) 기록 저장소 — 게스트 상태의 기본 저장소 (T15)
// 브라우저에만 저장되므로 데이터 삭제·기기 변경 시 유실될 수 있다 (화면에 경고 문구 표시).

import { openDB, type IDBPDatabase } from "idb";
import type { RecordStore, TasteRecord } from "./store";

const DB_NAME = "taste-map";
const STORE_NAME = "records";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        // 같은 작품에 기록 1개 (계약: unique user_id+work_id — 로컬은 단일 사용자이므로 work_id 유니크)
        store.createIndex("work_id", "work_id", { unique: true });
      },
    });
  }
  return dbPromise;
}

export const localRecordStore: RecordStore = {
  async list(): Promise<TasteRecord[]> {
    const db = await getDb();
    const all = (await db.getAll(STORE_NAME)) as TasteRecord[];
    return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async getByWork(workId: string): Promise<TasteRecord | null> {
    const db = await getDb();
    const found = (await db.getFromIndex(STORE_NAME, "work_id", workId)) as
      | TasteRecord
      | undefined;
    return found ?? null;
  },

  async upsert(record: TasteRecord): Promise<void> {
    const db = await getDb();
    await db.put(STORE_NAME, record);
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.delete(STORE_NAME, id);
  },
};
