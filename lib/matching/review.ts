// 매칭 확인 UX 의 데이터 모양 — T44 (매칭 3/3)
//
// 엔진(T43)의 판정 결과를 **화면이 그대로 쓸 수 있는 형태**로 옮긴다.
// Steam(T19)·CSV(T20)가 이 변환을 공유하므로, 가져오기 경로가 늘어도 확인 화면은 하나다.
//
// 세 상태(§5.3 UX 규격)
//   auto   — 자동 확정. 결과만 통보한다
//   choose — 애매. 후보 3개를 주고 **탭 1회**로 고르게 한다
//   skip   — 미발견. 스킵 목록에 모아 일괄 표시한다 (직접 등록 연결은 v1 — T34)

import { isAutoConfirmed, type CatalogEntry, type MatchResult } from "@/lib/matching/engine";
import { posterUrl } from "@/lib/works/poster";

export type ReviewStatus = "auto" | "choose" | "skip";

/** 화면에 그리는 작품 1건 */
export type ReviewWork = {
  id: string;
  title: string;
  mediaType: string;
  releaseYear: number | null;
  coverUrl: string | null;
};

export type ReviewCandidate = {
  work: ReviewWork;
  score: number;
  reason: string;
};

/** 가져오기 1행 + 판정 */
export type ReviewItem = {
  /** 행 고유 키 (원본 순서 유지용) */
  key: string;
  /** 원본이 준 제목 — 유저가 자기 라이브러리에서 알아볼 수 있어야 하므로 손대지 않는다 */
  sourceTitle: string;
  sourceYear: number | null;
  mediaType: string;
  status: ReviewStatus;
  /**
   * Steam 이 준 누적 플레이 시간(분). 다른 경로에서는 없다.
   * 확정 시 기록의 `progress` 로 보존된다 (T19).
   */
  playtimeMinutes?: number | null;
  /** 자동 확정된 작품. choose·skip 이면 null */
  matched: ReviewWork | null;
  /** 왜 이렇게 판정했는지 — 유저에게 그대로 보여준다 */
  reason: string;
  candidates: ReviewCandidate[];
};

function toReviewWork(entry: CatalogEntry): ReviewWork {
  return {
    id: entry.id,
    // 한국어 제목이 있으면 그것 (계약 §4 의 `title` 규약과 같은 규칙)
    title: entry.titleKo ?? entry.canonicalTitle,
    mediaType: entry.mediaType,
    releaseYear: entry.releaseYear,
    coverUrl: posterUrl({ media_type: entry.mediaType, external_ids: entry.externalIds }),
  };
}

export type ReviewSource = {
  key: string;
  title: string;
  year: number | null;
  mediaType: string;
  /** Steam 경로만 채운다 */
  playtimeMinutes?: number | null;
};

/** 엔진 결과 → 확인 화면 항목 */
export function toReviewItems(sources: ReviewSource[], results: MatchResult[]): ReviewItem[] {
  return sources.map((source, i) => {
    const result = results[i];
    const status: ReviewStatus = isAutoConfirmed(result)
      ? "auto"
      : result.path === "similar"
        ? "choose"
        : "skip";

    return {
      key: source.key,
      sourceTitle: source.title,
      sourceYear: source.year,
      mediaType: source.mediaType,
      playtimeMinutes: source.playtimeMinutes ?? null,
      status,
      matched: result.entry ? toReviewWork(result.entry) : null,
      reason: result.candidates[0]?.reason ?? "카탈로그에서 찾지 못함",
      candidates: result.candidates.map((c) => ({
        work: toReviewWork(c.entry),
        score: c.score,
        reason: c.reason,
      })),
    };
  });
}

export type ReviewSummary = {
  total: number;
  auto: number;
  choose: number;
  skip: number;
};

export function summarize(items: ReviewItem[]): ReviewSummary {
  return {
    total: items.length,
    auto: items.filter((i) => i.status === "auto").length,
    choose: items.filter((i) => i.status === "choose").length,
    skip: items.filter((i) => i.status === "skip").length,
  };
}
