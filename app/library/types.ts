// 모아보기 화면 공용 타입 (T17 리스트 → T41 그리드 → T42 캘린더가 함께 쓴다)

import type { TasteRecord } from "@/lib/records";

export type Work = {
  id: string;
  media_type: string;
  canonical_title: string;
  title_ko: string | null;
  release_year: number | null;
  external_ids: Record<string, unknown> | null;
};

export type ViewProps = {
  records: TasteRecord[]; // 필터·정렬이 끝난 목록 (빈 배열은 부모가 처리)
  workById: Map<string, Work>;
};

export function displayTitle(w: Work | undefined): string {
  return w ? (w.title_ko ?? w.canonical_title) : "(작품 정보 없음)";
}
