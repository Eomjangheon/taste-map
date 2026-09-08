import { test, expect } from "@playwright/test";
import { normalizeTitle } from "../lib/catalog/normalize";

// T51 완료 조건 스모크:
//   시드에 있는 영화·드라마를 검색해도 중복 행이 생기지 않고, 이미 생긴 중복이 병합되어
//   검색 결과에 한 줄로만 보인다.
//
// ⚠ **이 테스트는 dev DB 에 갱신된 시드(dev_seed.sql)가 적용된 뒤에 초록이 된다.**
//   코드만 머지하고 시드를 적용하지 않으면 계속 빨간불이다 — 순서가 그렇게 설계돼 있다.
//   (마이그레이션과 같은 취급: 적용 → 확인 → 머지)

const hasEnv =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.SUPABASE_SECRET_KEY);

/** WEB-51 이 보고한 중복 3건이 난 작품들 */
const CASES = [
  { term: "오징어 게임", media: "tv" as const, year: 2021 },
  { term: "오징어 게임 시즌 2", media: "tv" as const, year: 2024 },
  { term: "듄: 파트 2", media: "movie" as const, year: 2024 },
];

type Result = {
  id: string;
  title: string;
  canonicalTitle: string;
  titleKo: string | null;
  releaseYear: number | null;
  externalIds: Record<string, unknown>;
};

test.describe("시드 작품 중복 (WEB-51)", () => {
  test("같은 작품이 두 줄로 보이지 않는다", async ({ request }) => {
    test.skip(!hasEnv, "Supabase 환경변수가 없는 환경에서는 건너뜀");

    for (const { term, media, year } of CASES) {
      const res = await request.get(
        `/api/works?q=${encodeURIComponent(term)}&media=${media}&limit=50`
      );
      expect(res.ok(), `${term} 조회 실패`).toBe(true);
      const { results } = (await res.json()) as { results: Result[] };

      // 같은 (정규화 제목, 연도) 로 묶이는 행이 둘 이상이면 유저에게 중복으로 보인다.
      // 원제·한국어 제목 어느 쪽으로 겹쳐도 중복이므로 둘 다 키로 본다.
      const seen = new Map<string, Result[]>();
      for (const row of results.filter((r) => r.releaseYear === year)) {
        for (const title of [row.canonicalTitle, row.titleKo]) {
          if (!title) continue;
          const key = `${normalizeTitle(title)}|${row.releaseYear}`;
          seen.set(key, [...(seen.get(key) ?? []), row]);
        }
      }

      for (const [key, rows] of seen) {
        const unique = new Set(rows.map((r) => r.id));
        expect(
          [...unique].length,
          `${term}: '${key}' 로 ${unique.size}행이 보인다 — ${rows
            .map((r) => `${r.canonicalTitle}(${JSON.stringify(r.externalIds)})`)
            .join(" / ")}`
        ).toBe(1);
      }
    }
  });

  test("시드 영화·드라마에 외부 ID 가 채워져 있다 (재발 방지의 근본)", async ({ request }) => {
    test.skip(!hasEnv, "Supabase 환경변수가 없는 환경에서는 건너뜀");

    // 외부 ID 가 없으면 카탈로그 적재가 같은 작품인 줄 모르고 새 행을 또 만든다.
    // 시드 작품 몇 개를 표본으로 확인한다.
    const samples = [
      { term: "기생충", media: "movie" as const, canonical: "Parasite" },
      { term: "체르노빌", media: "tv" as const, canonical: "Chernobyl" },
      { term: "부산행", media: "movie" as const, canonical: "Train to Busan" },
    ];

    for (const { term, media, canonical } of samples) {
      const res = await request.get(`/api/works?q=${encodeURIComponent(term)}&media=${media}`);
      expect(res.ok()).toBe(true);
      const { results } = (await res.json()) as { results: Result[] };
      const row = results.find((r) => r.canonicalTitle === canonical);
      expect(row, `${canonical} 을 찾지 못했다`).toBeTruthy();
      expect(
        Object.keys(row!.externalIds).length,
        `${canonical} 의 external_ids 가 비어 있다`
      ).toBeGreaterThan(0);
    }
  });
});
