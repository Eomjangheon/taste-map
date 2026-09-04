// 기록 저장 계층 인터페이스 (T15)
// 게스트 = 로컬(IndexedDB) 구현, 가입 후 = 서버(Supabase) 구현으로 교체된다 (T45).
// 화면·로직은 이 인터페이스만 사용한다 — 어디에 저장되는지 몰라도 되게.
// 필드는 docs/contract.md의 records 테이블과 1:1 (user_id 제외 — 게스트는 없음, T45 업로드 시 부여).

export type RecordStatus = "completed" | "in_progress" | "dropped" | "backlog";

export type TasteRecord = {
  id: string; // 클라이언트 생성 UUID (T8 결정 — 동기화 충돌 원천 차단)
  work_id: string;
  status: RecordStatus;
  coordinates: unknown[]; // v2까지 빈 배열 유지 (§3.2)
  rating: number | null; // 0.5 ~ 5.0, 0.5 단위
  replay_count: number;
  consumed_at: string | null; // YYYY-MM-DD
  note: string | null;
  visibility: "private" | "public";
  import_source: "manual" | "steam" | "csv" | "screenshot" | "text";
  created_at: string; // ISO
  updated_at: string; // ISO
};

export interface RecordStore {
  list(): Promise<TasteRecord[]>; // created_at 내림차순
  getByWork(workId: string): Promise<TasteRecord | null>;
  upsert(record: TasteRecord): Promise<void>;
  remove(id: string): Promise<void>;
}

/** 새 기록 생성 헬퍼 — 규약 기본값(비공개, 좌표 빈 배열, manual)을 한곳에서 보장 */
export function createRecord(
  workId: string,
  status: RecordStatus,
  partial: Partial<TasteRecord> = {}
): TasteRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    work_id: workId,
    status,
    coordinates: [],
    rating: null,
    replay_count: 0,
    consumed_at: null,
    note: null,
    visibility: "private",
    import_source: "manual",
    created_at: now,
    updated_at: now,
    ...partial,
  };
}
