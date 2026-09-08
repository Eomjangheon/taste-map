// 매칭 확인 화면 — T44
//
// **왜 픽스처로 그리는가**: T44 의 완료 조건은 "T43 의 매칭 결과를 넣으면 확인 UX 3종이
// 배포 URL 에서 동작한다" 이다. 실제 가져오기(Steam T19 · CSV T20)는 아직 없으므로,
// 정답 픽스처(T18)를 엔진(T43)에 그대로 태운 결과를 넣어 화면을 확인할 수 있게 한다.
// T19·T20 은 이 페이지가 아니라 `MatchReview` 컴포넌트를 가져다 쓴다.
//
// DB 를 읽지 않으므로 환경변수 없이도 뜬다 — 검수자가 프리뷰 URL 에서 바로 누를 수 있다.

import { MatchReview } from "@/components/import/match-review";
import { matchAll, type CatalogEntry } from "@/lib/matching/engine";
import { FIXTURE_ROWS, FIXTURE_WORKS } from "@/lib/matching/fixtures";
import { summarize, toReviewItems, type ReviewSource } from "@/lib/matching/review";

const catalog: CatalogEntry[] = FIXTURE_WORKS.map((w) => ({
  id: w.id,
  mediaType: w.mediaType,
  canonicalTitle: w.canonicalTitle,
  titleKo: w.titleKo,
  releaseYear: w.releaseYear,
  externalIds: w.externalIds,
}));

export default function ImportReviewPage() {
  const sources: ReviewSource[] = FIXTURE_ROWS.map((row) => ({
    key: row.id,
    title: row.title,
    year: row.year,
    mediaType: row.mediaType,
  }));

  const results = matchAll(
    FIXTURE_ROWS.map((row) => ({
      title: row.title,
      year: row.year,
      mediaType: row.mediaType,
      externalIds: row.externalIds,
    })),
    catalog
  );

  const items = toReviewItems(sources, results);
  const summary = summarize(items);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-bold">가져오기 확인</h1>
      <p className="mt-1 text-sm text-gray-500">
        {summary.total}건을 카탈로그와 대조했습니다.
      </p>

      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        이 화면은 <strong>T44 확인 UX 미리보기</strong>입니다. 실제 라이브러리가 아니라 매칭 정답
        픽스처(T18) {summary.total}건을 매칭 엔진(T43)에 태운 결과이며, Steam·CSV 가져오기 연결은
        T19·T20 에서 붙습니다.
      </p>

      <div className="mt-6">
        <MatchReview items={items} />
      </div>
    </main>
  );
}
