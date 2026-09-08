// CSV 가져오기 파서 — T20
//
// **직접 파싱 금지**(이슈 지시). 쉼표로 split 하면 `"Dune: Part Two, Extended"` 같은
// 따옴표 안 쉼표에서 바로 깨진다. 파싱은 papaparse 가 하고, 이 파일은 **열 이름을 읽어
// 어떤 내보내기 파일인지 알아내는 일**만 한다.
//
// ## Letterboxd 공식 내보내기 (zip 안에 여러 CSV)
//   watched.csv  Date, Name, Year, Letterboxd URI
//   ratings.csv  Date, Name, Year, Letterboxd URI, Rating
//   diary.csv    Date, Name, Year, Letterboxd URI, Rating, Rewatch, Tags, Watched Date
//
// **diary.csv 가 가장 정보가 많다** — 감상일(Watched Date)과 재감상(Rewatch)까지 있다.
// 셋 중 아무거나 받아서 있는 만큼만 보존한다.
//
// ⚠ **Letterboxd 는 외부 ID 를 주지 않는다.** `Letterboxd URI` 는 letterboxd.com 의 주소일 뿐
//   TMDB id 가 아니다. 그래서 영화 행은 전부 제목+연도 경로(§5.3 ②③④)로 내려간다 —
//   90% 자동 확정 목표의 실제 관문이 여기다 (T43 측정 보고서).
//
// ## Goodreads
// 파서만 만들어 두고 활성화하지 않는다. 책은 v1(§3.3)이다 — 아래 '명세 모순' 주석 참조.

import Papa from "papaparse";

/** 어떤 서비스의 내보내기인가 */
export type CsvSource = "letterboxd" | "goodreads";

/** 매칭에 넘길 1행 */
export type CsvRow = {
  /** 원본 순서 유지용 키 */
  key: string;
  title: string;
  year: number | null;
  mediaType: "movie" | "book";
  /** 0.5~5.0. 없으면 null */
  rating: number | null;
  /** YYYY-MM-DD. 없으면 null */
  consumedAt: string | null;
  /** 재감상 표시 */
  rewatch: boolean;
};

export type CsvParseResult = {
  source: CsvSource;
  /** 어떤 파일로 알아봤는지 — 화면에 그대로 보여준다 */
  variant: string;
  rows: CsvRow[];
  /** 제목이 비어 있는 등 읽지 못한 행 수 */
  dropped: number;
};

export class CsvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvFormatError";
  }
}

/** 열 이름 비교용 — 대소문자·공백 차이를 흡수한다 */
function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/gu, " ");
}

function pick(row: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const value = row[name];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

function toYear(value: string): number | null {
  const year = Number(value);
  // 영화 연도로 말이 되는 범위만 — "N/A" 같은 값이 1970년으로 둔갑하지 않게
  return Number.isInteger(year) && year >= 1870 && year <= 2200 ? year : null;
}

/** `YYYY-MM-DD` 만 받는다. Letterboxd·Goodreads 모두 이 형태이거나 비어 있다 */
function toDate(value: string): string | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/u);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/** 0.5 단위 0.5~5.0 으로 자른다 (계약의 rating 제약과 같다) */
function toRating(value: string): number | null {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const half = Math.round(raw * 2) / 2;
  return Math.min(5, Math.max(0.5, half));
}

/**
 * CSV 텍스트 1개를 읽는다. 어떤 내보내기인지는 **열 이름으로** 판별한다 —
 * 파일 이름은 유저가 바꿔서 올릴 수 있으므로 믿지 않는다.
 */
export function parseImportCsv(text: string): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeHeader,
  });

  const headers = (parsed.meta.fields ?? []).map(normalizeHeader);
  const rows = parsed.data ?? [];

  if (headers.length === 0 || rows.length === 0) {
    throw new CsvFormatError("CSV 에서 읽을 행이 없습니다");
  }

  // ── Letterboxd: name + year 조합이 이 서비스의 지문이다 ──
  if (headers.includes("name") && headers.includes("year")) {
    const variant = headers.includes("watched date")
      ? "diary.csv"
      : headers.includes("rating")
        ? "ratings.csv"
        : "watched.csv";

    const out: CsvRow[] = [];
    let dropped = 0;
    rows.forEach((row, i) => {
      const title = pick(row, "name");
      if (!title) {
        dropped += 1;
        return;
      }
      out.push({
        key: `csv-${i}`,
        title,
        year: toYear(pick(row, "year")),
        mediaType: "movie",
        rating: toRating(pick(row, "rating")),
        // diary.csv 는 감상일(watched date)이 따로 있다. 없으면 date 를 쓴다
        consumedAt: toDate(pick(row, "watched date", "date")),
        rewatch: pick(row, "rewatch").toLowerCase() === "yes",
      });
    });
    return { source: "letterboxd", variant, rows: out, dropped };
  }

  // ── Goodreads: 파서만 만들어 둔다 (아래 주석 참조) ──
  if (headers.includes("title") && (headers.includes("author") || headers.includes("book id"))) {
    const out: CsvRow[] = [];
    let dropped = 0;
    rows.forEach((row, i) => {
      const title = pick(row, "title");
      if (!title) {
        dropped += 1;
        return;
      }
      out.push({
        key: `csv-${i}`,
        title,
        // Goodreads 의 연도 열은 출간 연도다 (원서/번역서가 갈린다 — 매칭 때 주의해야 한다)
        year: toYear(pick(row, "original publication year", "year published")),
        mediaType: "book",
        // Goodreads 는 1~5 정수다. 0 은 '별점 없음' 이므로 toRating 이 null 로 만든다
        rating: toRating(pick(row, "my rating")),
        consumedAt: toDate(pick(row, "date read")),
        rewatch: false,
      });
    });
    return { source: "goodreads", variant: "goodreads_library_export.csv", rows: out, dropped };
  }

  throw new CsvFormatError(
    `알 수 없는 CSV 형식입니다 (열: ${headers.slice(0, 6).join(", ")}${headers.length > 6 ? " …" : ""})`
  );
}
