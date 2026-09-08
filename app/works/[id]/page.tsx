// 작품 상세 화면 — T13
// 제목·연도·커버·매체를 보여주고, 시즌·DLC 는 §3.1 대로 별개 작품으로 묶어서 표시한다.
// 기록 버튼 자리는 B 의 기록 입력(T16)으로 연결한다.

import { getWorkDetail } from "@/lib/catalog/search";

export const dynamic = "force-dynamic";

const MEDIA_LABEL: Record<string, string> = { game: "게임", movie: "영화", tv: "드라마" };

function Cover({ url, size = "h-40 w-28" }: { url: string | null; size?: string }) {
  if (!url) return <div className={`${size} rounded bg-gray-100`} />;
  // 외부 포스터는 next/image 로 감싸지 않는다 (AGENTS.md) — 규칙상 의도된 <img>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={`${size} rounded object-cover`} />;
}

export default async function WorkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const hasEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
  if (!hasEnv) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p data-testid="detail-error" className="text-sm text-red-600">
          환경변수가 비어 있습니다: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY
        </p>
      </main>
    );
  }

  const work = await getWorkDetail(id);
  if (!work) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p data-testid="detail-not-found" className="text-sm text-gray-600">
          작품을 찾을 수 없습니다.
        </p>
        <a href="/search" className="mt-4 inline-block text-sm font-medium text-blue-600">
          ← 검색으로
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <a href="/search" className="text-sm font-medium text-blue-600">
        ← 검색으로
      </a>

      <div className="mt-4 flex gap-4">
        <Cover url={work.coverUrl} />
        <div className="min-w-0">
          <h1 data-testid="detail-title" className="text-2xl font-bold">
            {work.title}
          </h1>
          {work.titleKo && work.titleKo !== work.canonicalTitle && (
            <p className="mt-0.5 text-sm text-gray-500">원제: {work.canonicalTitle}</p>
          )}
          <p data-testid="detail-meta" className="mt-2 text-sm text-gray-600">
            {MEDIA_LABEL[work.mediaType] ?? work.mediaType}
            {work.releaseYear ? ` · ${work.releaseYear}` : ""}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {Object.entries(work.externalIds)
              .map(([k, v]) => `${k} ${v}`)
              .join(" · ") || "외부 id 없음"}
          </p>

          {/* 기록 버튼 자리 — B 의 기록 입력(T16)으로 연결한다 */}
          <a
            data-testid="detail-record-link"
            href="/records"
            className="mt-4 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
          >
            이 작품 기록하기 →
          </a>
        </div>
      </div>

      {work.parent && (
        <section className="mt-8 border-t border-gray-200 pt-4">
          <h2 className="text-sm font-medium text-gray-500">상위 작품</h2>
          <a
            data-testid="detail-parent"
            href={`/works/${work.parent.id}`}
            className="mt-2 flex items-center gap-3 hover:bg-gray-50"
          >
            <Cover url={work.parent.coverUrl} size="h-16 w-12" />
            <span className="text-sm font-medium">
              {work.parent.title}
              {work.parent.releaseYear ? (
                <span className="ml-1 font-normal text-gray-500">({work.parent.releaseYear})</span>
              ) : null}
            </span>
          </a>
        </section>
      )}

      {work.children.length > 0 && (
        <section className="mt-8 border-t border-gray-200 pt-4">
          <h2 className="text-sm font-medium text-gray-500">
            함께 묶인 작품 {work.children.length}건
          </h2>
          <p className="mt-1 text-xs text-gray-400">
            시즌·DLC는 별개 작품으로 저장됩니다. 여기서는 보기 편하도록 묶어서 보여줍니다.
          </p>
          <ul className="mt-2 divide-y divide-gray-200">
            {work.children.map((c) => (
              <li key={c.id} data-testid="detail-child">
                <a href={`/works/${c.id}`} className="flex items-center gap-3 py-2 hover:bg-gray-50">
                  <Cover url={c.coverUrl} size="h-16 w-12" />
                  <span className="text-sm">
                    {c.title}
                    {c.releaseYear ? (
                      <span className="ml-1 text-gray-500">({c.releaseYear})</span>
                    ) : null}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
