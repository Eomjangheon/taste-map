import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeTitle,
  splitTitle,
  sameWorkTitle,
  titleContains,
} from "../lib/catalog/normalize";
import { FIXTURE_ROWS, FIXTURE_WORKS, IDENTITY_CASES } from "../lib/matching/fixtures";

// T18 단위 테스트 — 화면이 아니라 함수를 검증한다.
// 매칭 엔진(T43)이 여기 위에 올라가므로 규칙이 흔들리면 여기서 먼저 빨간불이 나야 한다.

test.describe("정규화 — 한글 안전 (AGENTS.md 규칙)", () => {
  test("한글 검색어가 빈 문자열이 되지 않는다 (WEB-16 실제 버그)", () => {
    expect(normalizeTitle("오징어 게임")).toBe("오징어게임");
    expect(normalizeTitle("기생충")).toBe("기생충");
    // 빈 검색어는 '전체 매칭'이 되면 안 된다
    expect(titleContains("아무 제목", "")).toBe(false);
    expect(titleContains("오징어 게임", "오징어게임")).toBe(true);
  });

  test("자모 분리 한글(NFD)과 완성형이 같은 키가 된다", () => {
    const nfd = "오징어 게임".normalize("NFD");
    expect(nfd).not.toBe("오징어 게임");
    expect(normalizeTitle(nfd)).toBe(normalizeTitle("오징어 게임"));
  });
});

test.describe("시즌·파트 토큰 분리 (§5.3)", () => {
  test("§5.3 이 든 예시 그대로 — 종이의 집 파트4 → 본제 + 시즌", () => {
    const parts = splitTitle("종이의 집 파트4");
    expect(parts.base).toBe("종이의 집");
    expect(parts.season).toBe(4);
  });

  test("Season / 시즌 / Part Two / 파트 2 표기가 같은 숫자로 모인다", () => {
    expect(splitTitle("Squid Game Season 2").season).toBe(2);
    expect(splitTitle("오징어 게임: 시즌2").season).toBe(2);
    expect(splitTitle("Dune: Part Two").season).toBe(2);
    expect(splitTitle("듄: 파트 2").season).toBe(2);
    expect(splitTitle("The Last of Us Part I").season).toBe(1);
  });

  test("표기만 다른 같은 시즌은 같은 키가 된다", () => {
    expect(sameWorkTitle("Squid Game Season 2", "Squid Game  season  2")).toBe(true);
    expect(sameWorkTitle("Dune: Part Two", "Dune Part 2")).toBe(true);
  });

  test("제목에 그냥 들어 있는 숫자를 시즌으로 오인하지 않는다", () => {
    expect(splitTitle("Portal 2").season).toBeNull();
    expect(splitTitle("Cyberpunk 2077").season).toBeNull();
    expect(splitTitle("Persona 5 Royal").season).toBeNull();
    expect(splitTitle("DJMAX RESPECT V").season).toBeNull();
  });

  test("시즌이 다르면 다른 작품이다 (계약 §2 케이스 1)", () => {
    expect(sameWorkTitle("종이의 집 파트4", "종이의 집 파트5")).toBe(false);
    expect(sameWorkTitle("Squid Game", "Squid Game Season 2")).toBe(false);
    expect(sameWorkTitle("Dune", "Dune: Part Two")).toBe(false);
  });
});

test.describe("에디션 토큰 — 떼어내되 버리지 않는다", () => {
  test("표기가 달라도 같은 라벨로 모인다", () => {
    expect(splitTitle("Batman: Arkham Asylum GOTY Edition").editions).toEqual(["goty"]);
    expect(splitTitle("Batman: Arkham Asylum - Game of the Year Edition").editions).toEqual(["goty"]);
    expect(splitTitle("Metro 2033 Redux").editions).toEqual(["remaster"]);
    expect(splitTitle("The Last of Us Remastered").editions).toEqual(["remaster"]);
    expect(splitTitle("반지의 제왕 확장판").editions).toEqual(["extended"]);
    expect(splitTitle("블레이드 러너 감독판").editions).toEqual(["directors-cut"]);
  });

  test("상표 기호를 지워도 본제가 남는다", () => {
    const parts = splitTitle("Horizon Zero Dawn™ Complete Edition");
    expect(parts.base).toBe("Horizon Zero Dawn");
    expect(parts.editions).toEqual(["complete"]);
  });

  test("판본이 다르면 다른 작품이다 (계약 §2 케이스 2·3·6)", () => {
    expect(sameWorkTitle("The Last of Us", "The Last of Us Remastered")).toBe(false);
    expect(sameWorkTitle("Devil May Cry 3", "Devil May Cry 3 Special Edition")).toBe(false);
    expect(sameWorkTitle("The Witcher", "The Witcher: Enhanced Edition")).toBe(false);
  });

  test("같은 판본이면 표기가 달라도 같은 작품이다", () => {
    expect(sameWorkTitle("Batman: Arkham Asylum GOTY", "Batman Arkham Asylum Game of the Year Edition")).toBe(true);
    expect(sameWorkTitle("The Last of Us Remastered", "The Last of Us Redux")).toBe(true);
  });
});

test.describe("부제 분리", () => {
  test("콜론·대시 부제를 떼되 하이픈 이름은 건드리지 않는다", () => {
    expect(splitTitle("The Witcher 3: Wild Hunt").head).toBe("The Witcher 3");
    expect(splitTitle("The Witcher 3: Wild Hunt").subtitle).toBe("Wild Hunt");
    expect(splitTitle("Spider-Man: Into the Spider-Verse").head).toBe("Spider-Man");
    // 하이픈이 이름 안에 있으면 부제 구분자가 아니다
    expect(splitTitle("Spider-Man").subtitle).toBeNull();
    expect(splitTitle("Spider-Man").base).toBe("Spider-Man");
  });

  test("부제는 동일성에 영향을 준다 — head 로 합치지 않는다 (계약 §2 케이스 5)", () => {
    expect(sameWorkTitle("Elden Ring", "Elden Ring: Shadow of the Erdtree")).toBe(false);
  });

  test("콜론 뒤 공백이 없어도 분리된다 (WEB-3 PICO PARK 케이스)", () => {
    const parts = splitTitle("PICO PARK:Classic Edition");
    expect(parts.head).toBe("PICO PARK");
    expect(parts.editions).toEqual(["classic"]);
  });
});

test.describe("정답 픽스처 무결성", () => {
  test("30건 이상이고 id 가 겹치지 않는다 (T18 완료 조건)", () => {
    expect(FIXTURE_ROWS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(FIXTURE_ROWS.map((r) => r.id)).size).toBe(FIXTURE_ROWS.length);
    expect(new Set(FIXTURE_WORKS.map((w) => w.id)).size).toBe(FIXTURE_WORKS.length);
  });

  test("정답이 가리키는 작품이 미니 카탈로그에 실제로 있다", () => {
    const ids = new Set(FIXTURE_WORKS.map((w) => w.id));
    for (const row of FIXTURE_ROWS) {
      if (row.expect === null) continue;
      expect(ids, `${row.id} 의 정답 ${row.expect}`).toContain(row.expect);
    }
    for (const work of FIXTURE_WORKS) {
      if (!work.parentId) continue;
      expect(ids, `${work.id} 의 parentId`).toContain(work.parentId);
    }
  });

  test("네 경로가 모두 들어 있다 (한 경로만 쉬운 표가 되지 않게)", () => {
    const byPath = new Map<string, number>();
    for (const row of FIXTURE_ROWS) byPath.set(row.path, (byPath.get(row.path) ?? 0) + 1);
    for (const path of ["external-id", "title-year", "similar", "skip"]) {
      expect(byPath.get(path) ?? 0, `${path} 경로 케이스 수`).toBeGreaterThanOrEqual(5);
    }
  });

  test("외부 ID 경로 행은 실제로 외부 ID 를 들고 있다", () => {
    for (const row of FIXTURE_ROWS.filter((r) => r.path === "external-id")) {
      expect(Object.keys(row.externalIds ?? {}).length, row.id).toBeGreaterThan(0);
    }
    // Letterboxd 는 외부 ID 를 주지 않는다 — 픽스처가 그 사실을 어기면 측정이 낙관적으로 왜곡된다
    for (const row of FIXTURE_ROWS.filter((r) => r.source === "letterboxd")) {
      expect(Object.keys(row.externalIds ?? {}).length, row.id).toBe(0);
    }
  });

  test("제목+연도 경로 행은 정답 작품과 연도가 정확히 같다", () => {
    const works = new Map(FIXTURE_WORKS.map((w) => [w.id, w]));
    for (const row of FIXTURE_ROWS.filter((r) => r.path === "title-year")) {
      const work = works.get(row.expect!)!;
      expect(row.year, row.id).toBe(work.releaseYear);
    }
  });

  test("유사도 경로 행은 연도 ±1 안에 있다 (§5.3 ③ 조건)", () => {
    const works = new Map(FIXTURE_WORKS.map((w) => [w.id, w]));
    for (const row of FIXTURE_ROWS.filter((r) => r.path === "similar")) {
      const work = works.get(row.expect!)!;
      if (row.year === null || work.releaseYear === null) continue;
      expect(Math.abs(row.year - work.releaseYear), row.id).toBeLessThanOrEqual(1);
    }
  });
});

test.describe("동일성 7케이스 — T18 이 제목만으로 답할 수 있는 범위", () => {
  // 케이스 4(현지화 제목)는 제목 문자열만으로는 알 수 없다. title_ko 매핑(T14)을 읽어야 하며
  // 그 판단은 매칭 엔진(T43)의 몫이다 — 여기서 통과시키면 거짓 초록불이 된다.
  test("별개 works 케이스는 제목만으로 구분된다", () => {
    for (const c of IDENTITY_CASES.filter((c) => !c.same)) {
      expect(sameWorkTitle(c.a, c.b), `케이스 ${c.case} ${c.label}`).toBe(false);
    }
  });

  test("같은 제목은 같은 작품이다 (케이스 7 플랫폼 차이)", () => {
    const platform = IDENTITY_CASES.find((c) => c.case === 7)!;
    expect(sameWorkTitle(platform.a, platform.b)).toBe(true);
  });

  test("케이스 4(현지화)는 제목만으로는 못 푼다 — T43 이 title_ko 로 푼다", () => {
    const localized = IDENTITY_CASES.find((c) => c.case === 4)!;
    expect(sameWorkTitle(localized.a, localized.b)).toBe(false);
  });
});

test("정규화 규칙이 T13 검색과 한 함수로 공유된다 (규칙 이원화 금지)", () => {
  const source = readFileSync(join(process.cwd(), "lib/catalog/search.ts"), "utf8");
  // T13 검색은 자기 정규화를 따로 두지 않고 이 파일에서 가져다 쓴다
  expect(source).toContain('from "@/lib/catalog/normalize"');
  // 한글을 지워버리는 정규식이 다시 기어들어오지 않게 막는다 (AGENTS.md).
  // 주석에는 그 정규식이 '쓰지 말라'는 설명으로 등장하므로 주석을 걷어내고 본다.
  const normalize = readFileSync(join(process.cwd(), "lib/catalog/normalize.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  // `\W`·`[^\w]` 로 문자를 지우는 순간 한글이 통째로 날아간다 — 그 형태만 금지한다.
  // (`\b` 는 영어 토큰의 경계를 잡는 데만 쓰며 문자를 지우지 않는다 — normalize.ts 주석 참조)
  expect(normalize).not.toMatch(/\[\^\\w\]|\\W/);
});
