import { test, expect } from "@playwright/test";
import { playtimeToProgress } from "../lib/steam/playtime";

// T19 완료 조건 스모크:
//   본인 SteamID 입력만으로 보유 게임이 기록으로 일괄 생성되고(import_source=steam·플레이 시간 보존),
//   가져오기 이벤트가 적재된다.
//
// 실패 안내는 키 없이도 확인할 수 있게 나눠 뒀다. 전체 흐름은 실제 계정이 필요하므로
// STEAM_ID64 가 있을 때만 돈다 — 없으면 skip 되고 CI 는 초록이지만 완료 조건을 지켜주지는 못한다.

const hasKey = Boolean(process.env.STEAM_API_KEY);
const steamId = process.env.STEAM_ID64;
const hasCatalogEnv =
  Boolean(process.env.TWITCH_CLIENT_ID) &&
  Boolean(process.env.SUPABASE_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

test.describe("플레이 시간 표기 (progress 형식)", () => {
  test("§6.2 '게임 n시간' 형식으로 적는다", () => {
    expect(playtimeToProgress(1230)).toBe("20.5시간");
    expect(playtimeToProgress(60)).toBe("1.0시간");
    // 1시간 미만은 0.0시간이 되어 버리므로 분으로 적는다
    expect(playtimeToProgress(3)).toBe("3분");
    // 플레이 기록 없음은 빈 값이지 "0시간"이 아니다
    expect(playtimeToProgress(0)).toBeNull();
    expect(playtimeToProgress(null)).toBeNull();
  });
});

test.describe("실패 안내 — 사유별로 다른 문구 (WEB-3 실패 모양 기준)", () => {
  test("읽을 수 없는 입력이면 안내가 뜬다", async ({ page }) => {
    await page.goto("/import/steam");
    await page.getByTestId("steam-input").fill("!!!");
    await page.getByTestId("steam-start").click();

    const panel = page.getByTestId("steam-error");
    await expect(panel).toBeVisible({ timeout: 30_000 });

    if (hasKey) {
      // 키가 있으면 원인이 입력이라는 것까지 특정된다
      await expect(panel).toHaveAttribute("data-code", "bad-input");
      await expect(panel).toContainText("SteamID 를 읽지 못했습니다");
    } else {
      // 키가 없는 환경에서는 '서버 설정 문제'로 안내해야 한다 — 유저 잘못으로 보이면 안 된다
      await expect(panel).toHaveAttribute("data-code", "no-key");
    }
  });

  test("없는 맞춤 프로필 주소는 비공개와 다른 문구로 안내한다", async ({ page }) => {
    test.skip(!hasKey, "STEAM_API_KEY 가 없는 환경에서는 건너뜀");
    test.setTimeout(60_000);

    await page.goto("/import/steam");
    // 존재할 수 없는 이름. Steam 맞춤 URL 상한이 32자라 그 안에서 만든다 —
    // 넘기면 형식 오류(bad-input)로 걸러져서 정작 검증하려는 경로를 못 탄다
    await page.getByTestId("steam-input").fill(`tmapnobody${Date.now() % 1_000_000}`);
    await page.getByTestId("steam-start").click();

    const panel = page.getByTestId("steam-error");
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel).toHaveAttribute("data-code", "vanity-not-found");
  });
});

// ---------------------------------------------------------------- 기록 생성 규약
// 완료 조건의 핵심(= 기록이 실제로 만들어지는가)은 실제 Steam 계정 없이도 지켜져야 한다.
// 그래서 두 API 응답만 고정하고 **화면의 저장 동작**을 검증한다.
// 이 부분이 깨지면 가져오기가 통째로 무의미해지므로 CI 에서 항상 돈다.

const WORK_A = "11111111-1111-4111-8111-111111111111";
const WORK_B = "22222222-2222-4222-8222-222222222222";

/** 매칭 API 를 흉내 낸다 — 자동 확정 2건 */
async function stubImportApis(page: import("@playwright/test").Page) {
  await page.route("**/api/import/steam/library", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        steamId: "76561190000000000",
        total: 2,
        neverPlayed: 1,
        games: [
          { appId: 413150, name: "Stardew Valley", playtimeMinutes: 1230 },
          { appId: 620, name: "Portal 2", playtimeMinutes: 0 },
        ],
      }),
    })
  );

  await page.route("**/api/import/steam/match", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        byAppId: 2,
        byName: 0,
        items: [
          {
            key: "steam-413150",
            sourceTitle: "Stardew Valley",
            sourceYear: null,
            mediaType: "game",
            playtimeMinutes: 1230,
            status: "auto",
            matched: { id: WORK_A, title: "스타듀 밸리", mediaType: "game", releaseYear: 2016, coverUrl: null },
            reason: "steam_appid 일치",
            candidates: [],
          },
          {
            key: "steam-620",
            sourceTitle: "Portal 2",
            sourceYear: null,
            mediaType: "game",
            playtimeMinutes: 0,
            status: "auto",
            matched: { id: WORK_B, title: "포탈 2", mediaType: "game", releaseYear: 2011, coverUrl: null },
            reason: "steam_appid 일치",
            candidates: [],
          },
        ],
      }),
    })
  );
}

/** 브라우저의 로컬 저장소(IndexedDB)에서 기록을 직접 읽는다 */
async function readRecords(page: import("@playwright/test").Page) {
  return page.evaluate<Record<string, unknown>[]>(async () => {
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
}

test("가져오기 확정 → 계약 §1 규약대로 기록이 만들어진다", async ({ page }) => {
  await stubImportApis(page);
  await page.goto("/import/steam");

  await page.getByTestId("steam-input").fill("76561190000000000");
  await page.getByTestId("steam-start").click();

  // 플레이 기록 없는 게임 수를 화면에 드러낸다 (§5.3 상 전량 completed 로 들어가는 점 고지)
  await expect(page.getByTestId("never-played")).toHaveText("1");
  await expect(page.getByTestId("count-auto")).toHaveText("2");

  await page.getByTestId("confirm-import").click();
  await expect(page.getByTestId("steam-saved")).toContainText("2건");

  const records = await readRecords(page);
  expect(records).toHaveLength(2);

  const stardew = records.find((r) => r.work_id === WORK_A)!;
  expect(stardew.import_source).toBe("steam"); // 계약 §1
  expect(stardew.status).toBe("completed"); // §5.3
  expect(stardew.coordinates).toEqual([]); // §3.2 — v2까지 빈 배열
  expect(stardew.visibility).toBe("private");
  expect(stardew.progress).toBe("20.5시간"); // 플레이 시간 보존

  // 플레이 기록이 없으면 "0시간" 이 아니라 비운다
  const portal = records.find((r) => r.work_id === WORK_B)!;
  expect(portal.progress).toBeNull();
});

test("이미 있는 기록은 덮지 않고 플레이 시간만 갱신한다 (계약 §1 충돌 규약)", async ({ page }) => {
  await stubImportApis(page);

  // 유저가 직접 남긴 기록을 먼저 심는다 — 별점·감상문이 가져오기로 지워지면 안 된다
  await page.goto("/import/steam");
  await page.evaluate(async (workId) => {
    // 저장소는 앱이 첫 저장 때 만든다. 아직 없을 수 있으므로 같은 스키마로 열어 준다
    // (local-store.ts 의 upgrade 와 동일 — 이미 있으면 그대로 쓴다)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("taste-map", 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore("records", { keyPath: "id" });
        store.createIndex("work_id", "work_id", { unique: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const now = new Date().toISOString();
    await new Promise((resolve, reject) => {
      const req = db
        .transaction("records", "readwrite")
        .objectStore("records")
        .put({
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          work_id: workId,
          status: "in_progress",
          coordinates: [],
          rating: 4.5,
          replay_count: 2,
          consumed_at: "2026-01-01",
          note: "내가 쓴 감상문",
          visibility: "private",
          import_source: "manual",
          created_at: now,
          updated_at: now,
        });
      req.onsuccess = () => resolve(null);
      req.onerror = () => reject(req.error);
    });
  }, WORK_A);

  await page.reload();
  await page.getByTestId("steam-input").fill("76561190000000000");
  await page.getByTestId("steam-start").click();
  await page.getByTestId("confirm-import").click();
  await expect(page.getByTestId("steam-saved")).toBeVisible();

  const records = await readRecords(page);
  const kept = records.find((r) => r.work_id === WORK_A)!;
  expect(kept.note).toBe("내가 쓴 감상문"); // 감상문 보존
  expect(kept.rating).toBe(4.5); // 별점 보존
  expect(kept.status).toBe("in_progress"); // 상태를 completed 로 덮지 않는다
  expect(kept.import_source).toBe("manual"); // 출처도 덮지 않는다
  expect(kept.progress).toBe("20.5시간"); // 플레이 시간만 갱신

  // 새로 만든 건 1건뿐이다 (기존 기록은 세지 않는다)
  await expect(page.getByTestId("steam-saved")).toContainText("1건");
});

test("SteamID 입력 → 기록 일괄 생성 (T19 완료 조건)", async ({ page }) => {
  test.skip(!hasKey || !steamId || !hasCatalogEnv, "STEAM_API_KEY·STEAM_ID64·카탈로그 환경변수가 필요");
  test.setTimeout(10 * 60_000); // 수백 건 매칭 + 카탈로그 적재

  await page.goto("/import/steam");
  await page.getByTestId("steam-input").fill(steamId!);
  await page.getByTestId("steam-start").click();

  // 진행 표시가 실제로 올라간다 (멈춘 것처럼 보이지 않아야 한다)
  await expect(page.getByTestId("steam-progress")).toBeVisible({ timeout: 60_000 });

  // 매칭이 끝나면 확인 UX(T44)가 뜬다
  await expect(page.getByTestId("review-summary")).toBeVisible({ timeout: 9 * 60_000 });

  // appid 직접 대응(① 경로)이 있으므로 자동 확정이 0일 수 없다 (WEB-3 실측 95.3%)
  const auto = Number(await page.getByTestId("count-auto").innerText());
  expect(auto).toBeGreaterThan(0);

  // 자동 확정분만으로 기록을 만든다
  await page.getByTestId("confirm-import").click();
  const saved = page.getByTestId("steam-saved");
  await expect(saved).toBeVisible({ timeout: 120_000 });
  await expect(saved).toContainText("기록");

  // 만든 기록이 모아보기에 실제로 보인다 (같은 브라우저 컨텍스트 = 같은 로컬 저장소)
  await page.goto("/library");
  await expect(page.getByTestId("empty-screen")).toHaveCount(0);
  await expect(page.getByTestId("filtered-count")).not.toHaveText("0");
});
