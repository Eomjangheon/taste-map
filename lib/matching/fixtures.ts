// 매칭 정답 픽스처 — T18 (매칭 1/3)
//
// **왜 코드보다 이게 먼저인가**: §5.3 의 목표 지표는 "500건 중 450건 자동 확정(약 90%)"이다.
// 측정할 자가 없으면 엔진(T43)이 좋아졌는지 나빠졌는지 아무도 모른다. 그래서 정답표를 먼저 만든다.
//
// **출처 — 지어낸 데이터가 아니다.**
//   · 게임: WEB-3 Steam 실검증 결과 (steam-verify/report/steam-verify-report.md).
//     보유 236건 중 미매칭 11건·주의 26건이 그대로 이 표의 어려운 케이스다.
//     appid 는 그 보고서에서 그대로 가져왔다.
//   · 영화·드라마: T9 시드 작품 50건(supabase/seed/dev_seed.sql)과
//     Letterboxd 공식 내보내기 CSV 의 열 구성(Date·Name·Year·Letterboxd URI·Rating).
//     **Letterboxd 는 외부 ID 를 주지 않는다** — 그래서 영화 행은 전부 제목+연도 경로다.
//   · tmdb id 3건(93405·693134·287516)은 WEB-51 전수 조사에서 확인된 실제 값이다.
//
// **이 파일은 DB 를 읽지 않는다.** 정확도 측정이 Supabase 상태에 좌우되면 재현이 안 되므로
// 미니 카탈로그(FIXTURE_WORKS)를 함께 들고 다닌다. T43 의 측정 스크립트는 이 두 배열만 쓴다.

export type FixtureMedia = "game" | "movie" | "tv";

/** 미니 카탈로그 1건 — works 행에서 매칭에 필요한 필드만 */
export type FixtureWork = {
  /** 픽스처 안에서만 쓰는 키 (works.id 가 아니다) */
  id: string;
  mediaType: FixtureMedia;
  canonicalTitle: string;
  titleKo: string | null;
  releaseYear: number | null;
  externalIds: Record<string, string | number>;
  /** UI 그룹핑 전용 — **동일성 판단에 쓰지 않는다** (계약 §2) */
  parentId?: string;
};

/** 매칭 키 우선순위 4단계 (§5.3) 중 이 행이 **정답대로라면** 통과해야 할 경로 */
export type MatchPath =
  /** ① 외부 ID 직접 대응 → 즉시 확정 */
  | "external-id"
  /** ② 정규화 제목 + 연도 완전 일치 → 자동 확정 */
  | "title-year"
  /** ③ 제목 유사도 + 연도 ±1 → 후보 제시 (자동 확정하면 오답이다) */
  | "similar"
  /** ④ 미발견 → 스킵 목록 */
  | "skip";

/** 가져오기 원본 1행 + 정답 */
export type FixtureRow = {
  id: string;
  /** 어느 가져오기 경로에서 이런 모양으로 들어오는가 */
  source: "steam" | "letterboxd";
  mediaType: FixtureMedia;
  /** 원본이 준 제목 — 손대지 않은 그대로 */
  title: string;
  /** 원본이 준 연도. Steam 은 주지 않는다(null) */
  year: number | null;
  /** 원본이 준 외부 ID (Steam 은 appid, Letterboxd 는 없음) */
  externalIds?: Record<string, string | number>;
  /** 정답 작품(FIXTURE_WORKS.id). null = **못 찾는 것이 정답** */
  expect: string | null;
  /** 정답 경로 */
  path: MatchPath;
  /** 이 케이스가 왜 어려운지 */
  note: string;
};

// ------------------------------------------------------------------ 미니 카탈로그
export const FIXTURE_WORKS: FixtureWork[] = [
  // ── 게임 (steam_appid 는 WEB-3 검증 보고서의 실제 값) ──
  { id: "stardew", mediaType: "game", canonicalTitle: "Stardew Valley", titleKo: "스타듀 밸리", releaseYear: 2016, externalIds: { steam_appid: 413150 } },
  { id: "elden-ring", mediaType: "game", canonicalTitle: "Elden Ring", titleKo: "엘든 링", releaseYear: 2022, externalIds: { steam_appid: 1245620 } },
  { id: "elden-ring-sote", mediaType: "game", canonicalTitle: "Elden Ring: Shadow of the Erdtree", titleKo: "엘든 링: 황금 나무의 그림자", releaseYear: 2024, externalIds: {}, parentId: "elden-ring" },
  { id: "witcher3", mediaType: "game", canonicalTitle: "The Witcher 3: Wild Hunt", titleKo: "더 위쳐 3: 와일드 헌트", releaseYear: 2015, externalIds: { steam_appid: 292030 } },
  { id: "witcher1", mediaType: "game", canonicalTitle: "The Witcher", titleKo: "더 위쳐", releaseYear: 2007, externalIds: {} },
  { id: "cyberpunk", mediaType: "game", canonicalTitle: "Cyberpunk 2077", titleKo: "사이버펑크 2077", releaseYear: 2020, externalIds: { steam_appid: 1091500 } },
  { id: "portal2", mediaType: "game", canonicalTitle: "Portal 2", titleKo: "포탈 2", releaseYear: 2011, externalIds: { steam_appid: 620 } },
  { id: "dave", mediaType: "game", canonicalTitle: "Dave the Diver", titleKo: "데이브 더 다이버", releaseYear: 2023, externalIds: { steam_appid: 1868140 } },
  { id: "tlou", mediaType: "game", canonicalTitle: "The Last of Us", titleKo: "더 라스트 오브 어스", releaseYear: 2013, externalIds: {} },
  { id: "tlou-part1", mediaType: "game", canonicalTitle: "The Last of Us Part I", titleKo: "더 라스트 오브 어스 파트 I", releaseYear: 2022, externalIds: {} },
  { id: "persona5", mediaType: "game", canonicalTitle: "Persona 5", titleKo: "페르소나 5", releaseYear: 2016, externalIds: {} },
  { id: "persona5r", mediaType: "game", canonicalTitle: "Persona 5 Royal", titleKo: "페르소나 5 더 로열", releaseYear: 2019, externalIds: {} },
  { id: "arkham-asylum", mediaType: "game", canonicalTitle: "Batman: Arkham Asylum - Game of the Year Edition", titleKo: null, releaseYear: 2010, externalIds: {} },
  { id: "metro-redux", mediaType: "game", canonicalTitle: "Metro Redux", titleKo: null, releaseYear: 2014, externalIds: {} },
  { id: "pico-park", mediaType: "game", canonicalTitle: "Pico Park", titleKo: null, releaseYear: 2021, externalIds: {} },
  { id: "horizon", mediaType: "game", canonicalTitle: "Horizon Zero Dawn", titleKo: "호라이즌 제로 던", releaseYear: 2017, externalIds: {} },
  { id: "tekken7", mediaType: "game", canonicalTitle: "Tekken 7", titleKo: "철권 7", releaseYear: 2017, externalIds: { steam_appid: 389730 } },
  { id: "djmax", mediaType: "game", canonicalTitle: "DJMax Respect V", titleKo: null, releaseYear: 2020, externalIds: { steam_appid: 960170 } },

  // ── 영화 (Letterboxd 는 외부 ID 를 주지 않는다 → 제목+연도로만 붙는다) ──
  { id: "parasite", mediaType: "movie", canonicalTitle: "Parasite", titleKo: "기생충", releaseYear: 2019, externalIds: {} },
  { id: "interstellar", mediaType: "movie", canonicalTitle: "Interstellar", titleKo: "인터스텔라", releaseYear: 2014, externalIds: {} },
  { id: "dark-knight", mediaType: "movie", canonicalTitle: "The Dark Knight", titleKo: "다크 나이트", releaseYear: 2008, externalIds: {} },
  { id: "lalaland", mediaType: "movie", canonicalTitle: "La La Land", titleKo: "라라랜드", releaseYear: 2016, externalIds: {} },
  { id: "your-name", mediaType: "movie", canonicalTitle: "Your Name.", titleKo: "너의 이름은.", releaseYear: 2016, externalIds: {} },
  { id: "spiderverse", mediaType: "movie", canonicalTitle: "Spider-Man: Into the Spider-Verse", titleKo: "스파이더맨: 뉴 유니버스", releaseYear: 2018, externalIds: {} },
  { id: "mad-max", mediaType: "movie", canonicalTitle: "Mad Max: Fury Road", titleKo: "매드 맥스: 분노의 도로", releaseYear: 2015, externalIds: {} },
  { id: "frozen", mediaType: "movie", canonicalTitle: "Frozen", titleKo: "겨울왕국", releaseYear: 2013, externalIds: {} },
  { id: "dune", mediaType: "movie", canonicalTitle: "Dune", titleKo: "듄", releaseYear: 2021, externalIds: {} },
  { id: "dune2", mediaType: "movie", canonicalTitle: "Dune: Part Two", titleKo: "듄: 파트 2", releaseYear: 2024, externalIds: { tmdb: 693134 } },
  { id: "justice-league", mediaType: "movie", canonicalTitle: "Justice League", titleKo: "저스티스 리그", releaseYear: 2017, externalIds: {} },
  { id: "snyder-cut", mediaType: "movie", canonicalTitle: "Zack Snyder's Justice League", titleKo: "잭 스나이더의 저스티스 리그", releaseYear: 2021, externalIds: {} },
  { id: "oldboy", mediaType: "movie", canonicalTitle: "Oldboy", titleKo: "올드보이", releaseYear: 2003, externalIds: {} },

  // ── 드라마 (시즌은 별개 works — 계약 §2 케이스 1) ──
  { id: "squid-game", mediaType: "tv", canonicalTitle: "Squid Game", titleKo: "오징어 게임", releaseYear: 2021, externalIds: { tmdb: 93405 } },
  { id: "squid-game-s2", mediaType: "tv", canonicalTitle: "Squid Game Season 2", titleKo: "오징어 게임 시즌 2", releaseYear: 2024, externalIds: { tmdb_season_id: 287516 }, parentId: "squid-game" },
  { id: "money-heist-p1", mediaType: "tv", canonicalTitle: "Money Heist Part 1", titleKo: "종이의 집 파트 1", releaseYear: 2017, externalIds: {} },
  { id: "chernobyl", mediaType: "tv", canonicalTitle: "Chernobyl", titleKo: "체르노빌", releaseYear: 2019, externalIds: {} },
  { id: "tlou-tv", mediaType: "tv", canonicalTitle: "The Last of Us (TV)", titleKo: "더 라스트 오브 어스 (드라마)", releaseYear: 2023, externalIds: {} },
  { id: "glory", mediaType: "tv", canonicalTitle: "The Glory", titleKo: "더 글로리", releaseYear: 2022, externalIds: {} },
];

// ------------------------------------------------------------------ 정답 행 35건
export const FIXTURE_ROWS: FixtureRow[] = [
  // ── ① 외부 ID 직접 대응 (6) — Steam 은 appid 를 주므로 제목이 아무리 달라도 확정된다 ──
  { id: "S01", source: "steam", mediaType: "game", title: "Stardew Valley", year: null, externalIds: { steam_appid: 413150 }, expect: "stardew", path: "external-id", note: "가장 쉬운 기준선" },
  { id: "S02", source: "steam", mediaType: "game", title: "The Witcher 3: Wild Hunt - Complete Edition", year: null, externalIds: { steam_appid: 292030 }, expect: "witcher3", path: "external-id", note: "WEB-3 주의 케이스 — 제목에 에디션이 붙어도 appid 가 이긴다. 제목으로 갔다면 오답" },
  { id: "S03", source: "steam", mediaType: "game", title: "ELDEN RING", year: null, externalIds: { steam_appid: 1245620 }, expect: "elden-ring", path: "external-id", note: "Steam 은 전부 대문자로 주는 경우가 많다" },
  { id: "S04", source: "steam", mediaType: "game", title: "Portal 2", year: null, externalIds: { steam_appid: 620 }, expect: "portal2", path: "external-id", note: "제목의 숫자 2 는 시즌이 아니다" },
  { id: "S05", source: "steam", mediaType: "game", title: "Cyberpunk 2077", year: null, externalIds: { steam_appid: 1091500 }, expect: "cyberpunk", path: "external-id", note: "제목 안의 연도형 숫자" },
  { id: "S06", source: "steam", mediaType: "game", title: "데이브 더 다이버", year: null, externalIds: { steam_appid: 1868140 }, expect: "dave", path: "external-id", note: "Steam 이 한국어 제목을 주는 경우" },

  // ── ② 정규화 제목 + 연도 완전 일치 → 자동 확정 (13) ──
  { id: "T01", source: "letterboxd", mediaType: "movie", title: "PARASITE", year: 2019, expect: "parasite", path: "title-year", note: "대소문자만 다름" },
  { id: "T02", source: "letterboxd", mediaType: "movie", title: "Mad Max: Fury Road", year: 2015, expect: "mad-max", path: "title-year", note: "부제 콜론 — 붙여도 떼도 같은 작품" },
  { id: "T03", source: "letterboxd", mediaType: "movie", title: "Spider-Man: Into the Spider-Verse", year: 2018, expect: "spiderverse", path: "title-year", note: "하이픈이 부제 구분자로 오인되면 안 된다" },
  { id: "T04", source: "letterboxd", mediaType: "movie", title: "Your Name.", year: 2016, expect: "your-name", path: "title-year", note: "제목 끝 마침표" },
  { id: "T05", source: "letterboxd", mediaType: "movie", title: "la la land", year: 2016, expect: "lalaland", path: "title-year", note: "띄어쓰기 + 소문자" },
  { id: "T06", source: "letterboxd", mediaType: "movie", title: "인터스텔라", year: 2014, expect: "interstellar", path: "title-year", note: "한/영 교차 — title_ko 대조가 필요하다 (T14)" },
  { id: "T07", source: "letterboxd", mediaType: "movie", title: "기생충", year: 2019, expect: "parasite", path: "title-year", note: "한국 영화의 한국어 원제" },
  { id: "T08", source: "letterboxd", mediaType: "movie", title: "겨울왕국", year: 2013, expect: "frozen", path: "title-year", note: "계약 §2 케이스 4 — 현지화 제목은 동일 work" },
  { id: "T09", source: "letterboxd", mediaType: "tv", title: "오징어 게임", year: 2021, expect: "squid-game", path: "title-year", note: "드라마 본편" },
  { id: "T10", source: "letterboxd", mediaType: "tv", title: "Squid Game Season 2", year: 2024, expect: "squid-game-s2", path: "title-year", note: "시즌 표기 — 본편(2021)으로 붙으면 오답 (계약 §2 케이스 1)" },
  { id: "T11", source: "letterboxd", mediaType: "tv", title: "오징어 게임: 시즌2", year: 2024, expect: "squid-game-s2", path: "title-year", note: "WEB-51 에서 실제로 관찰된 표기 흔들림 (`오징어 게임: Season 2`)" },
  { id: "T12", source: "letterboxd", mediaType: "movie", title: "듄: 파트 2", year: 2024, expect: "dune2", path: "title-year", note: "`Part Two` = `파트 2` — 본편 Dune(2021)으로 붙으면 오답" },
  { id: "T13", source: "letterboxd", mediaType: "tv", title: "종이의 집 파트1", year: 2017, expect: "money-heist-p1", path: "title-year", note: "§5.3 이 직접 든 예시 (`종이의 집 파트4` → 본제 + 시즌 토큰)" },

  // ── ③ 제목 유사도 + 연도 ±1 → 후보 제시 (10) — **자동 확정하면 오답이다** ──
  { id: "C01", source: "steam", mediaType: "game", title: "Batman: Arkham Asylum GOTY Edition", year: 2009, expect: "arkham-asylum", path: "similar", note: "WEB-3 주의 케이스 — `GOTY` = `Game of the Year Edition`, 연도 1 차이" },
  { id: "C02", source: "steam", mediaType: "game", title: "Metro 2033 Redux", year: 2014, expect: "metro-redux", path: "similar", note: "WEB-3 주의 케이스 — 본제 자체가 다르다(Metro 2033 vs Metro). 유사도로만 잡힌다" },
  { id: "C03", source: "steam", mediaType: "game", title: "PICO PARK:Classic Edition", year: 2021, expect: "pico-park", path: "similar", note: "WEB-3 주의 케이스 — 콜론 뒤 공백 없음 + 에디션 차이라 자동 확정 금지" },
  { id: "C04", source: "steam", mediaType: "game", title: "The Witcher: Enhanced Edition", year: 2008, expect: "witcher1", path: "similar", note: "WEB-3 주의 케이스 — 에디션 + 연도 1 차이 (계약 §2 케이스 2)" },
  { id: "C05", source: "steam", mediaType: "game", title: "Horizon Zero Dawn™ Complete Edition", year: 2017, expect: "horizon", path: "similar", note: "상표 기호 + 에디션. 판본이 다르므로 후보까지만" },
  { id: "C06", source: "letterboxd", mediaType: "movie", title: "Justice League", year: 2021, expect: "snyder-cut", path: "similar", note: "제목은 2017 판과 같고 연도는 스나이더컷 — 후보 2개를 내놓아야 한다 (계약 §2 케이스 3)" },
  { id: "C07", source: "letterboxd", mediaType: "tv", title: "The Last of Us", year: 2023, expect: "tlou-tv", path: "similar", note: "괄호 접미사 `(TV)` + 동명 게임(2013)이 있다. 매체를 안 보면 게임으로 붙는다" },
  { id: "C08", source: "steam", mediaType: "game", title: "Persona 5 Royal", year: 2020, expect: "persona5r", path: "similar", note: "연도 1 차이. `Persona 5`(2016)로 붙으면 오답" },
  { id: "C09", source: "steam", mediaType: "game", title: "TEKKEN 7", year: 2016, expect: "tekken7", path: "similar", note: "WEB-3 주의 케이스 — 전부 대문자 + 연도 1 차이" },
  { id: "C10", source: "steam", mediaType: "game", title: "DJMAX RESPECT V", year: 2019, expect: "djmax", path: "similar", note: "WEB-3 주의 케이스 — 끝의 V 를 로마 숫자로 오인하면 안 된다" },

  // ── ④ 미발견 → 스킵 (6) — WEB-3 미매칭 11건에서 그대로 가져왔다 ──
  { id: "K01", source: "steam", mediaType: "game", title: "Wallpaper Engine", year: null, externalIds: { steam_appid: 431960 }, expect: null, path: "skip", note: "WEB-3 미매칭 — 게임이 아니라 앱. appid 가 있어도 카탈로그에 없으면 스킵이다" },
  { id: "K02", source: "steam", mediaType: "game", title: "Monster Hunter Wilds Beta test", year: null, externalIds: { steam_appid: 3065170 }, expect: null, path: "skip", note: "WEB-3 미매칭 — 베타 테스트 빌드. `Monster Hunter Wilds` 로 붙이면 오답" },
  { id: "K03", source: "steam", mediaType: "game", title: "Tom Clancy's Rainbow Six Siege - Test Server", year: null, externalIds: { steam_appid: 623990 }, expect: null, path: "skip", note: "WEB-3 미매칭 — 테스트 서버 부속 항목" },
  { id: "K04", source: "steam", mediaType: "game", title: "Mini Settlers: Prologue", year: null, externalIds: { steam_appid: 2788870 }, expect: null, path: "skip", note: "WEB-3 미매칭 — 체험판(Prologue)은 본편과 별개이며 카탈로그에 없다" },
  { id: "K05", source: "steam", mediaType: "game", title: "AppGameKit Classic", year: null, externalIds: { steam_appid: 325180 }, expect: null, path: "skip", note: "WEB-3 미매칭 — 개발 도구. `Classic` 을 에디션으로 떼면 더 엉뚱해진다" },
  { id: "K06", source: "letterboxd", mediaType: "movie", title: "Aftersun", year: 2022, expect: null, path: "skip", note: "카탈로그에 없는 정상 영화 — 스킵 목록에 모여야 한다" },
];

// ------------------------------------------------------------------ 동일성 7케이스 (계약 §2)
/**
 * T43 이 통과해야 할 동일성 규칙 표. `same: false` 는 **별개 works** 라는 뜻이고,
 * 매칭 엔진이 두 제목을 하나로 합치면 실패다.
 */
export const IDENTITY_CASES: {
  case: number;
  label: string;
  a: string;
  b: string;
  same: boolean;
}[] = [
  { case: 1, label: "시리즈의 시즌", a: "종이의 집 파트4", b: "종이의 집 파트5", same: false },
  { case: 2, label: "리마스터판", a: "The Last of Us", b: "The Last of Us Remastered", same: false },
  { case: 3, label: "감독판/확장판", a: "The Lord of the Rings: The Two Towers", b: "The Lord of the Rings: The Two Towers Extended Edition", same: false },
  { case: 4, label: "더빙/현지화 제목", a: "Frozen", b: "겨울왕국", same: true },
  { case: 5, label: "게임 DLC", a: "Elden Ring", b: "Elden Ring: Shadow of the Erdtree", same: false },
  { case: 6, label: "게임 리마스터/리메이크", a: "Devil May Cry 3", b: "Devil May Cry 3 Special Edition", same: false },
  { case: 7, label: "플랫폼 차이 (PC/PS/Switch)", a: "Stardew Valley", b: "Stardew Valley", same: true },
];
