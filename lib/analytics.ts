"use client";

import posthog from "posthog-js";
import { supabase } from "@/lib/supabase";

// track() — 팀의 유일한 이벤트 기록 경로 (docs/contract.md §4)
// PostHog(행동 지표) + 자체 events 테이블(보험) 이중 기록을 내부에서 처리한다.
// 호출부는 track(이름, 속성) 한 줄만 쓰면 된다.

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

let initialized = false;

function ensurePosthog(): boolean {
  if (typeof window === "undefined") return false;
  if (!initialized && POSTHOG_KEY) {
    posthog.init(POSTHOG_KEY, {
      api_host: "https://us.i.posthog.com",
      // 표준 이벤트 7종만 깔끔하게 수집한다 — 자동 수집은 전부 끔 (T2 결정)
      autocapture: false,
      capture_pageview: false,
      persistence: "localStorage",
    });
    initialized = true;
  }
  return initialized;
}

// 표준 이벤트 이름 (docs/contract.md §4가 기준 — 여기 없는 이름은 추가 합의 후 사용)
export type StandardEvent =
  | "app_opened"
  | "record_created" // {media_type, import_source}
  | "import_started" // {source}
  | "import_completed" // {source, total, auto_matched}
  | "set_progress_changed" // {set_id, progress}
  | "result_viewed" // {month}
  | "share_image_created"; // {type}

/** 게스트도 추적 가능한 익명 ID (가입 시 identify()로 계정과 병합) */
export function getAnonId(): string {
  if (ensurePosthog()) return posthog.get_distinct_id();
  // PostHog 키가 없는 환경(로컬 등)에서도 events 테이블 추적이 이어지도록 자체 발급
  try {
    const KEY = "tm_anon_id";
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

export async function track(
  name: StandardEvent,
  properties: Record<string, unknown> = {}
): Promise<void> {
  try {
    if (ensurePosthog()) posthog.capture(name, properties);

    if (supabase) {
      const { data } = await supabase.auth.getUser();
      await supabase.from("events").insert({
        name,
        properties,
        anon_id: getAnonId(),
        user_id: data.user?.id ?? null,
      });
    }
  } catch {
    // 로깅 실패가 앱 동작을 깨면 안 된다 — 조용히 무시
  }
}

/** 가입·로그인 시 호출 (T25) — 게스트 이벤트를 계정과 병합 */
export function identify(userId: string): void {
  if (ensurePosthog()) posthog.identify(userId);
}
