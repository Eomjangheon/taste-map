import { Suspense } from "react";
import LibraryClient from "./library-client";

// T17: 모아보기 — 리스트 뷰 + 매체·상태·기간 필터 (뷰 1/3)
// searchParams(demo=1)만 서버에서 읽고 나머지는 전부 클라이언트(로컬 저장소 접근 필요).

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { demo } = await searchParams;
  return (
    <Suspense>
      <LibraryClient demo={demo === "1"} />
    </Suspense>
  );
}
