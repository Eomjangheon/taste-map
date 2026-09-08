import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildIndex, matchOne, type CatalogEntry } from "../lib/matching/engine";
import { FIXTURE_WORKS, IDENTITY_CASES } from "../lib/matching/fixtures";
import { measureFixtures, renderReport } from "../lib/matching/measure";

// T43 — 매칭 엔진. 화면이 아니라 판정을 검증한다.
// 완료 조건: ① 동일성 7케이스 통과 ② 픽스처 기준 자동 확정률이 측정·기록된다.

const catalog: CatalogEntry[] = FIXTURE_WORKS.map((w) => ({
  id: w.id,
  mediaType: w.mediaType,
  canonicalTitle: w.canonicalTitle,
  titleKo: w.titleKo,
  releaseYear: w.releaseYear,
  externalIds: w.externalIds,
}));
const index = buildIndex(catalog);

test.describe("매칭 키 우선순위 (§5.3)", () => {
  test("① 외부 ID 는 제목이 달라도 이긴다", () => {
    const result = matchOne(
      // WEB-3 실제 케이스 — Steam 제목에 에디션이 붙어 있다
      { title: "The Witcher 3: Wild Hunt - Complete Edition", year: null, mediaType: "game", externalIds: { steam_appid: 292030 } },
      index
    );
    expect(result.path).toBe("external-id");
    expect(result.entry?.id).toBe("witcher3");
  });

  test("① 외부 ID 대조는 매체와 함께 한다 (TMDB 영화/드라마 id 네임스페이스 충돌)", () => {
    // 93405 는 드라마 `Squid Game` 의 tmdb id. 같은 숫자를 영화로 들이밀면 붙으면 안 된다
    const result = matchOne(
      { title: "무언가", year: 2021, mediaType: "movie", externalIds: { tmdb: 93405 } },
      index
    );
    expect(result.path).not.toBe("external-id");
  });

  test("② 제목+연도 완전 일치는 자동 확정", () => {
    const result = matchOne({ title: "PARASITE", year: 2019, mediaType: "movie" }, index);
    expect(result.path).toBe("title-year");
    expect(result.entry?.id).toBe("parasite");
  });

  test("② 한/영 교차 대조는 title_ko 로 붙는다 (T14)", () => {
    const result = matchOne({ title: "인터스텔라", year: 2014, mediaType: "movie" }, index);
    expect(result.path).toBe("title-year");
    expect(result.entry?.id).toBe("interstellar");
  });

  test("③ 판본이 다르면 자동 확정하지 않고 후보로 내린다", () => {
    const result = matchOne(
      { title: "Horizon Zero Dawn™ Complete Edition", year: 2017, mediaType: "game" },
      index
    );
    expect(result.path).toBe("similar");
    expect(result.candidates[0].entry.id).toBe("horizon");
  });

  test("③ 후보는 최대 3개다 (§5.3 UX 규격)", () => {
    const result = matchOne({ title: "The Last of Us", year: 2023, mediaType: "tv" }, index);
    expect(result.path).toBe("similar");
    expect(result.candidates.length).toBeLessThanOrEqual(3);
    expect(result.candidates.map((c) => c.entry.id)).toContain("tlou-tv");
  });

  test("④ 카탈로그에 없으면 스킵 — appid 가 있어도 마찬가지다", () => {
    const result = matchOne(
      { title: "Wallpaper Engine", year: null, mediaType: "game", externalIds: { steam_appid: 431960 } },
      index
    );
    expect(result.path).toBe("skip");
    expect(result.candidates).toHaveLength(0);
  });

  test("매체가 다르면 붙지 않는다 (동명의 게임/드라마)", () => {
    const asGame = matchOne({ title: "The Last of Us", year: 2013, mediaType: "game" }, index);
    expect(asGame.entry?.id).toBe("tlou");
    const asTv = matchOne({ title: "The Last of Us", year: 2023, mediaType: "tv" }, index);
    expect(asTv.candidates.map((c) => c.entry.id)).not.toContain("tlou");
  });
});

test.describe("동일성 7케이스 (계약 §2) — T43 완료 조건", () => {
  // 두 제목을 한 카탈로그에 넣고, 한쪽으로 가져오기를 돌렸을 때 다른 쪽으로 자동 확정되면 실패다.
  for (const c of IDENTITY_CASES) {
    test(`케이스 ${c.case} ${c.label}`, () => {
      const a: CatalogEntry = { id: "a", mediaType: "game", canonicalTitle: c.a, titleKo: c.same ? c.b : null, releaseYear: 2020, externalIds: {} };
      const b: CatalogEntry = { id: "b", mediaType: "game", canonicalTitle: c.b, titleKo: null, releaseYear: 2020, externalIds: {} };
      // 케이스 7(플랫폼 차이)은 애초에 works 가 1건이다 — 같은 제목의 행을 두 개 만들면
      // 검증하려는 것(플랫폼이 달라도 한 작품)이 아니라 카탈로그 중복 상황을 검증하게 된다.
      const local = buildIndex(c.a === c.b ? [a] : [a, b]);
      const result = matchOne({ title: c.a, year: 2020, mediaType: "game" }, local);

      if (c.same) {
        // 현지화 제목(케이스 4)·플랫폼 차이(케이스 7)는 같은 work 로 붙어야 한다
        expect(result.path).toBe("title-year");
        expect(result.entry?.id).toBe("a");
      } else {
        // 별개 works — b 로 자동 확정되면 두 판본이 한 작품으로 합쳐진 것이다
        expect(result.entry?.id).not.toBe("b");
      }
    });
  }

  test("같은 제목의 행이 카탈로그에 둘이면 자동 확정하지 않고 사람에게 묻는다", () => {
    // WEB-51 이 보고한 시드 중복 같은 상황. 어느 쪽에 기록할지 엔진이 임의로 고르면 안 된다.
    const dup = buildIndex([
      { id: "seed", mediaType: "tv", canonicalTitle: "Squid Game", titleKo: "오징어 게임", releaseYear: 2021, externalIds: {} },
      { id: "tmdb", mediaType: "tv", canonicalTitle: "Squid Game", titleKo: "오징어 게임", releaseYear: 2021, externalIds: { tmdb: 93405 } },
    ]);
    const result = matchOne({ title: "오징어 게임", year: 2021, mediaType: "tv" }, dup);
    expect(result.path).toBe("similar");
    expect(result.candidates.map((c) => c.entry.id)).toEqual(["seed", "tmdb"]);
  });

  test("케이스 4: title_ko 가 있으면 현지화 제목으로 가져와도 원제 행에 붙는다", () => {
    const result = matchOne({ title: "겨울왕국", year: 2013, mediaType: "movie" }, index);
    expect(result.path).toBe("title-year");
    expect(result.entry?.id).toBe("frozen");
  });
});

test.describe("정확도 측정 (T43 완료 조건 — 중간 측정)", () => {
  test("오확정이 0건이다 — 조용히 틀리는 것이 가장 나쁘다", () => {
    const m = measureFixtures();
    expect(m.falseAutos.map((c) => `${c.id} ${c.title} → ${c.actual}`)).toEqual([]);
  });

  test("정답 경로 재현율·발견율이 기준선 위에 있다", () => {
    const m = measureFixtures();
    expect(m.pathRate).toBeGreaterThanOrEqual(0.9);
    expect(m.answerRate).toBeGreaterThanOrEqual(0.9);
  });

  test("측정 보고서를 낸다", () => {
    const m = measureFixtures();
    const report = renderReport(m, new Date().toISOString().slice(0, 10));
    console.log(`\n${report}`);
    // 로컬에서 돌릴 때마다 보고서를 갱신해 숫자가 낡지 않게 한다.
    // CI 에서는 쓰지 않는다 — 작업 트리를 더럽히면 안 된다.
    if (!process.env.CI) {
      writeFileSync(join(process.cwd(), "docs/t43-matching-accuracy.md"), report, "utf8");
    }
    expect(report).toContain("자동 확정률");
  });
});
