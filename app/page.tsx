import { supabase } from "@/lib/supabase";

// DB 상태 확인 화면이므로 항상 요청 시점에 렌더링한다
export const dynamic = "force-dynamic";

type Work = {
  id: string;
  media_type: string;
  canonical_title: string;
  title_ko: string | null;
  release_year: number | null;
};

export default async function Home() {
  let status: "ok" | "error" | "no-env" = "no-env";
  let detail = "환경변수(NEXT_PUBLIC_SUPABASE_URL/ANON_KEY)가 설정되지 않았습니다";
  let work: Work | null = null;
  let worksCount: number | null = null;

  if (supabase) {
    const { count } = await supabase
      .from("works")
      .select("id", { count: "exact", head: true });
    worksCount = count;

    const { data, error } = await supabase
      .from("works")
      .select("id, media_type, canonical_title, title_ko, release_year")
      .limit(1);
    if (error) {
      status = "error";
      detail = error.message;
    } else if (!data || data.length === 0) {
      status = "error";
      detail = "works 테이블이 비어 있습니다 — 마이그레이션 0001을 적용했는지 확인";
    } else {
      status = "ok";
      detail = "DB 연결 정상";
      work = data[0];
    }
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">🗺️ 취향 지도</h1>
      <p className="mt-1 text-sm text-gray-500">
        (가칭) — T7 walking skeleton: 이 화면은 배포·DB 연결 확인용입니다
      </p>

      <div className="mt-6 rounded-lg border border-gray-200 p-4">
        <p className="text-sm">
          DB 상태:{" "}
          <span
            data-testid="db-status"
            className={
              status === "ok"
                ? "font-semibold text-green-600"
                : "font-semibold text-red-600"
            }
          >
            {status}
          </span>
        </p>
        <p className="mt-1 text-xs text-gray-500">{detail}</p>

        {work && (
          <p data-testid="first-work" className="mt-3 text-sm">
            첫 작품: <strong>{work.title_ko ?? work.canonical_title}</strong> (
            {work.media_type}, {work.release_year})
          </p>
        )}

        {worksCount !== null && (
          <p className="mt-1 text-sm">
            카탈로그: <strong data-testid="works-count">{worksCount}</strong>건
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-4">
        <a href="/records" className="text-sm font-medium text-blue-600">
          내 기록 →
        </a>
        <a href="/library" className="text-sm font-medium text-blue-600">
          모아보기 →
        </a>
        <a href="/catalog/games" className="text-sm font-medium text-blue-600">
          게임 카탈로그(IGDB) →
        </a>
      </div>
    </main>
  );
}
