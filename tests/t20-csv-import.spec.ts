import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CsvFormatError, parseImportCsv } from "../lib/import/csv";

// T20 완료 조건 스모크:
//   Letterboxd 실제 내보내기 파일로 영화 기록이 일괄 생성되고, 애매 건은 후보 선택,
//   미발견 건은 스킵 목록에 모인다. Goodreads 는 파서만 돌고 '책은 곧 지원됩니다' 로 막힌다.

const DIARY = readFileSync(join(process.cwd(), "tests/fixtures/letterboxd-diary.csv"), "utf8");

const hasEnv =
  Boolean(process.env.TMDB_READ_TOKEN) &&
  Boolean(process.env.SUPABASE_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

test.describe("CSV 파서 — 직접 파싱하지 않는다", () => {
  test("Letterboxd diary.csv: 감상일·별점·재감상을 읽는다", () => {
    const result = parseImportCsv(DIARY);
    expect(result.source).toBe("letterboxd");
    expect(result.variant).toBe("diary.csv");
    expect(result.rows).toHaveLength(5);

    const parasite = result.rows[0];
    expect(parasite.title).toBe("Parasite");
    expect(parasite.year).toBe(2019);
    expect(parasite.rating).toBe(4.5);
    // Date(기록한 날)가 아니라 Watched Date(본 날)를 감상일로 쓴다
    expect(parasite.consumedAt).toBe("2026-03-01");
    expect(parasite.rewatch).toBe(false);
    expect(result.rows[1].rewatch).toBe(true);
  });

  test("따옴표 안 쉼표를 깨뜨리지 않는다 (직접 split 금지의 이유)", () => {
    const csv = [
      "Date,Name,Year,Letterboxd URI,Rating",
      '2026-01-01,"Good Night, and Good Luck.",2005,https://boxd.it/1,4',
      "2026-01-02,기생충,2019,https://boxd.it/2,5",
    ].join("\n");
    const result = parseImportCsv(csv);
    expect(result.variant).toBe("ratings.csv");
    expect(result.rows[0].title).toBe("Good Night, and Good Luck.");
    expect(result.rows[0].year).toBe(2005);
    // 한글 제목도 그대로 살아 있어야 한다
    expect(result.rows[1].title).toBe("기생충");
  });

  test("watched.csv 는 별점·감상일이 없어도 읽힌다", () => {
    const csv = ["Date,Name,Year,Letterboxd URI", "2026-01-01,Oldboy,2003,https://boxd.it/3"].join("\n");
    const result = parseImportCsv(csv);
    expect(result.variant).toBe("watched.csv");
    expect(result.rows[0].rating).toBeNull();
    expect(result.rows[0].consumedAt).toBe("2026-01-01");
  });

  test("Goodreads 는 형식을 알아보되 책으로 분류한다", () => {
    const csv = [
      "Book Id,Title,Author,My Rating,Date Read,Original Publication Year",
      "123,미움받을 용기,기시미 이치로,5,2026-02-02,2013",
      "124,읽다 만 책,아무개,0,,2020",
    ].join("\n");
    const result = parseImportCsv(csv);
    expect(result.source).toBe("goodreads");
    expect(result.rows[0].mediaType).toBe("book");
    expect(result.rows[0].rating).toBe(5);
    expect(result.rows[0].consumedAt).toBe("2026-02-02");
    // Goodreads 의 0 은 '별점 없음' 이다 — 0점이 아니다
    expect(result.rows[1].rating).toBeNull();
  });

  test("모르는 형식은 형식 오류로 알린다", () => {
    expect(() => parseImportCsv("foo,bar\n1,2")).toThrow(CsvFormatError);
  });
});

test("Goodreads 파일은 '책은 곧 지원됩니다' 로 막는다 (T20 방침)", async ({ page }) => {
  await page.goto("/import/csv");
  await page.getByTestId("csv-file").setInputFiles({
    name: "goodreads_library_export.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Book Id,Title,Author,My Rating,Date Read\n123,미움받을 용기,기시미 이치로,5,2026-02-02\n",
      "utf8"
    ),
  });

  const notice = page.getByTestId("csv-book-notice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("책은 곧 지원됩니다");
  // 읽기는 정상적으로 됐다는 것도 알려준다 (파서는 동작한다)
  await expect(notice).toContainText("1권");
});

test("알 수 없는 형식은 안내로 막힌다", async ({ page }) => {
  await page.goto("/import/csv");
  await page.getByTestId("csv-file").setInputFiles({
    name: "random.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("foo,bar\n1,2\n", "utf8"),
  });
  await expect(page.getByTestId("csv-error")).toContainText("알 수 없는 CSV 형식");
});

test("Letterboxd CSV → 영화 기록 일괄 생성 (T20 완료 조건)", async ({ page }) => {
  test.skip(!hasEnv, "TMDB·Supabase 환경변수가 없는 환경에서는 건너뜀");
  test.setTimeout(5 * 60_000); // 처음 보는 영화는 TMDB 에서 새로 담는다

  await page.goto("/import/csv");
  await page.getByTestId("csv-file").setInputFiles({
    name: "diary.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(DIARY, "utf8"),
  });

  // 확인 UX(T44)가 뜬다
  await expect(page.getByTestId("review-summary")).toBeVisible({ timeout: 4 * 60_000 });

  const auto = Number(await page.getByTestId("count-auto").innerText());
  const choose = Number(await page.getByTestId("count-choose").innerText());
  const skip = Number(await page.getByTestId("count-skip").innerText());
  expect(auto + choose + skip).toBe(5);
  // 시드에 있는 영화들이므로 제목+연도 자동 확정이 있어야 한다
  expect(auto).toBeGreaterThan(0);
  // 있지도 않은 영화는 스킵 목록에 모인다 (④ 경로)
  expect(skip).toBeGreaterThan(0);

  await page.getByTestId("confirm-import").click();
  await expect(page.getByTestId("csv-saved")).toBeVisible({ timeout: 60_000 });

  // 별점·감상일이 보존됐는지 로컬 저장소에서 직접 확인한다
  const records = await page.evaluate<Record<string, unknown>[]>(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("taste-map");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return new Promise((resolve, reject) => {
      const req = db.transaction("records", "readonly").objectStore("records").getAll();
      req.onsuccess = () => resolve(req.result as Record<string, unknown>[]);
      req.onerror = () => reject(req.error);
    });
  });

  expect(records.length).toBe(auto);
  for (const record of records) {
    expect(record.import_source).toBe("csv"); // 계약 §1
    expect(record.status).toBe("completed"); // §5.3
    expect(record.coordinates).toEqual([]);
  }
  // 감상일과 별점이 CSV 값 그대로 들어갔다
  const dates = records.map((r) => r.consumed_at);
  expect(dates.every((d) => typeof d === "string" && d.startsWith("2026-03-"))).toBe(true);
  expect(records.some((r) => r.rating === 4.5)).toBe(true);
  // Rewatch=Yes 였던 인터스텔라가 확정됐다면 재감상 카운트가 올라 있다
  const rewatched = records.filter((r) => r.replay_count === 1);
  expect(rewatched.length).toBeLessThanOrEqual(1);
});
