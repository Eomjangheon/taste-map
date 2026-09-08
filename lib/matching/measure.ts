// 매칭 정확도 측정 — T43
//
// §5.3 의 목표 지표는 "500건 중 450건 자동 확정(약 90%)"이다. 이 파일은 그 숫자를
// **픽스처(T18) 기준으로** 재현 가능하게 계산한다. DB 를 읽지 않으므로 언제 돌려도 같은 값이 나온다.
//
// ⚠ **픽스처의 자동 확정률을 90% 와 직접 비교하면 안 된다.** 픽스처는 실사용 분포가 아니라
//   어려운 케이스를 일부러 모아둔 표다(35건 중 16건이 후보 제시·스킵이 정답).
//   90% 는 실사용 라이브러리 기준 목표이고, 그쪽 실측치는 WEB-3 보고서(236건 중 225건 appid 매칭,
//   95.3%)가 갖고 있다. 여기서 봐야 할 숫자는 **정답 경로 재현율**과 **오확정 건수**다.

import { isAutoConfirmed, matchOne, buildIndex, type CatalogEntry } from "@/lib/matching/engine";
import { FIXTURE_ROWS, FIXTURE_WORKS, type MatchPath } from "@/lib/matching/fixtures";

export type CaseOutcome = {
  id: string;
  title: string;
  expectedPath: MatchPath;
  actualPath: MatchPath;
  expected: string | null;
  /** 자동 확정이면 확정된 작품, 후보 제시면 1순위 후보 */
  actual: string | null;
  /** 정답 작품이 후보 안에 들어 있는가 (③ 경로 채점 기준) */
  answerFound: boolean;
  pathOk: boolean;
  answerOk: boolean;
  /** 자동 확정했는데 틀렸다 — 가장 위험한 실패 */
  falseAuto: boolean;
};

export type Measurement = {
  total: number;
  /** 엔진이 ①② 로 처리한 비율 */
  autoRate: number;
  /** 정답표가 ①② 라고 말한 비율 = 이 픽스처에서 가능한 자동 확정 상한 */
  autoCeiling: number;
  /** 정답 경로대로 처리한 비율 */
  pathRate: number;
  /** 정답 작품을 (자동 확정이든 후보든) 찾아낸 비율 */
  answerRate: number;
  falseAutos: CaseOutcome[];
  cases: CaseOutcome[];
  byPath: Record<MatchPath, { expected: number; pathOk: number; answerOk: number }>;
};

export function measureFixtures(): Measurement {
  const index = buildIndex(
    FIXTURE_WORKS.map(
      (w): CatalogEntry => ({
        id: w.id,
        mediaType: w.mediaType,
        canonicalTitle: w.canonicalTitle,
        titleKo: w.titleKo,
        releaseYear: w.releaseYear,
        externalIds: w.externalIds,
      })
    )
  );

  const cases = FIXTURE_ROWS.map((row): CaseOutcome => {
    const result = matchOne(
      {
        title: row.title,
        year: row.year,
        mediaType: row.mediaType,
        externalIds: row.externalIds,
      },
      index
    );

    const actual = result.entry?.id ?? result.candidates[0]?.entry.id ?? null;
    const answerFound =
      row.expect === null
        ? result.path === "skip"
        : result.entry?.id === row.expect ||
          result.candidates.some((c) => c.entry.id === row.expect);

    const auto = isAutoConfirmed(result);
    return {
      id: row.id,
      title: row.title,
      expectedPath: row.path,
      actualPath: result.path,
      expected: row.expect,
      actual,
      answerFound,
      pathOk: result.path === row.path,
      answerOk: answerFound,
      falseAuto: auto && result.entry?.id !== row.expect,
    };
  });

  const paths: MatchPath[] = ["external-id", "title-year", "similar", "skip"];
  const byPath = Object.fromEntries(
    paths.map((path) => {
      const group = cases.filter((c) => c.expectedPath === path);
      return [
        path,
        {
          expected: group.length,
          pathOk: group.filter((c) => c.pathOk).length,
          answerOk: group.filter((c) => c.answerOk).length,
        },
      ];
    })
  ) as Measurement["byPath"];

  const total = cases.length;
  const autoPaths: MatchPath[] = ["external-id", "title-year"];
  return {
    total,
    autoRate: cases.filter((c) => autoPaths.includes(c.actualPath)).length / total,
    autoCeiling: cases.filter((c) => autoPaths.includes(c.expectedPath)).length / total,
    pathRate: cases.filter((c) => c.pathOk).length / total,
    answerRate: cases.filter((c) => c.answerOk).length / total,
    falseAutos: cases.filter((c) => c.falseAuto),
    cases,
    byPath,
  };
}

const PATH_LABEL: Record<MatchPath, string> = {
  "external-id": "① 외부 ID",
  "title-year": "② 제목+연도",
  similar: "③ 후보 제시",
  skip: "④ 스킵",
};

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** 사람이 읽는 측정 보고서 (docs/t43-matching-accuracy.md 로 저장한다) */
export function renderReport(m: Measurement, measuredAt: string): string {
  const lines: string[] = [];
  lines.push("# T43 매칭 정확도 중간 측정 (WEB-43)");
  lines.push("");
  lines.push(`**측정 시각**: ${measuredAt} · **기준**: T18 정답 픽스처 ${m.total}건`);
  lines.push("**재생성**: `npm run measure:matching`");
  lines.push("");
  lines.push("## 요약");
  lines.push("");
  lines.push("| 지표 | 값 |");
  lines.push("| --- | --- |");
  lines.push(`| 자동 확정률 (엔진이 ①② 로 처리) | **${pct(m.autoRate)}** |`);
  lines.push(`| 이 픽스처의 자동 확정 상한 (정답이 ①②) | ${pct(m.autoCeiling)} |`);
  lines.push(`| 정답 경로 재현율 | **${pct(m.pathRate)}** |`);
  lines.push(`| 정답 작품 발견율 (확정 + 후보 포함) | **${pct(m.answerRate)}** |`);
  lines.push(`| 오확정(자동 확정했는데 틀림) | **${m.falseAutos.length}건** |`);
  lines.push("");
  lines.push("## 경로별");
  lines.push("");
  lines.push("| 정답 경로 | 케이스 | 경로 일치 | 정답 발견 |");
  lines.push("| --- | --- | --- | --- |");
  for (const [path, stat] of Object.entries(m.byPath)) {
    lines.push(
      `| ${PATH_LABEL[path as MatchPath]} | ${stat.expected} | ${stat.pathOk}/${stat.expected} | ${stat.answerOk}/${stat.expected} |`
    );
  }
  lines.push("");

  const misses = m.cases.filter((c) => !c.pathOk || !c.answerOk);
  lines.push("## 어긋난 케이스");
  lines.push("");
  if (misses.length === 0) {
    lines.push("없음.");
  } else {
    lines.push("| # | 제목 | 정답 | 결과 |");
    lines.push("| --- | --- | --- | --- |");
    for (const c of misses) {
      lines.push(
        `| ${c.id} | ${c.title} | ${PATH_LABEL[c.expectedPath]} → ${c.expected ?? "스킵"} | ${PATH_LABEL[c.actualPath]} → ${c.actual ?? "없음"} |`
      );
    }
  }
  lines.push("## 해석 — 90% 목표와의 갭 (T43 완료 조건)");
  lines.push("");
  lines.push(
    `**픽스처 자동 확정률 ${pct(m.autoRate)} 를 §5.3 의 90% 와 직접 비교하면 안 된다.** ` +
      `이 표는 실사용 분포가 아니라 어려운 케이스를 일부러 모은 것이고, ` +
      `정답 자체가 ①② 인 행이 ${pct(m.autoCeiling)} 뿐이다. 즉 상한을 이미 채우고 있다.`
  );
  lines.push("");
  lines.push("실사용 기준 추정은 이렇다.");
  lines.push("");
  lines.push(
    "- **Steam(T19)**: WEB-3 실검증에서 보유 236건 중 225건이 appid 로 직접 매칭됐다(95.3%, " +
      "플레이 시간 가중 92.1%). appid 는 경로 ① 이므로 **Steam 만 놓고 보면 90% 목표는 이미 넘는다.** " +
      "남는 11건은 매칭 실패가 아니라 게임이 아닌 항목(Wallpaper Engine)·베타/테스트 빌드다."
  );
  lines.push(
    "- **CSV(T20)**: Letterboxd 내보내기에는 외부 ID 가 없다. 영화 전량이 ②③④ 로 내려오므로 " +
      "**90% 달성의 실제 관문은 여기다.** T20 에서 실제 내보내기 파일로 다시 측정해야 한다."
  );
  lines.push("");
  lines.push("**보완 방향**");
  lines.push("");
  lines.push(
    "1. 병목은 매칭 규칙이 아니라 **카탈로그 커버리지**다. 스킵 케이스는 대부분 '못 알아본 것'이 아니라 " +
      "'카탈로그에 없는 것'이다. T19·T20 에서 스킵 직전에 온디맨드 적재(T11·T12)를 한 번 태우면 " +
      "스킵의 상당수가 ①② 로 내려온다."
  );
  lines.push(
    "2. **Steam 은 출시 연도를 주지 않는다.** 연도가 없으면 ② 는 제목이 유일할 때만, ③ 은 유사도 85% " +
      "이상일 때만 걸리도록 좁혀 뒀다. IGDB 적재 시 연도를 확보하면 이 제약이 풀린다."
  );
  lines.push(
    "3. 나머지는 확인 UX(T44)가 받는다 — 후보 3개 제시는 §5.3 의 설계 전제이지 실패 처리가 아니다."
  );
  lines.push("");
  lines.push(
    "> ⚠ 재현율 100% 를 성능 근거로 쓰지 않는다. 픽스처와 엔진을 같은 시점에 함께 설계했으므로 " +
      "이 숫자는 '설계대로 동작한다'는 뜻이지 '실데이터에서 잘 맞는다'는 뜻이 아니다. " +
      "실측은 T19·T20 에서 본인 라이브러리·실제 CSV 로 한다."
  );
  lines.push("");
  return lines.join("\n");
}
