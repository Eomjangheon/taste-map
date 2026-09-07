// 기록 도메인 공용 표시 상수 (T16에서 페이지 내부에 있던 것을 T17에서 추출)
// 기록 입력(/records)·리스트 뷰(/library)·그리드(T41)·캘린더(T42)가 함께 쓴다.

import type { RecordStatus } from "./store";

export const STATUS_LABEL: Record<RecordStatus, string> = {
  completed: "봤어요",
  in_progress: "보는 중",
  dropped: "중도하차",
  backlog: "볼 예정",
};

export const STATUS_STYLE: Record<RecordStatus, string> = {
  completed: "bg-green-100 text-green-800",
  in_progress: "bg-blue-100 text-blue-800",
  dropped: "bg-orange-100 text-orange-800",
  backlog: "bg-gray-100 text-gray-600",
};

export const MEDIA_LABEL: Record<string, string> = {
  game: "게임",
  movie: "영화",
  tv: "드라마",
};
