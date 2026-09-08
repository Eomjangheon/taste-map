// Steam 가져오기 실패 사유와 안내 문구 — T19
//
// **client.ts 에서 분리한 이유**: 화면(클라이언트)이 안내 문구를 쓰는데, client.ts 는
// API 키를 읽는 서버 전용 모듈이다. 서버 모듈을 클라이언트 번들에 끌어들이지 않는다.
//
// 사유 구분은 WEB-3 선행 검증에서 실제로 받아본 실패 모양에 1:1 대응한다.

export type SteamFailure =
  | "no-key" // 서버에 STEAM_API_KEY 가 없다 (운영 문제 — 유저 잘못이 아니다)
  | "bad-input" // 입력에서 SteamID64 를 못 뽑았다
  | "vanity-not-found" // 맞춤 URL 이름이 존재하지 않는다
  | "private" // 프로필 비공개 (또는 보유 게임 0)
  | "steam-error"; // Steam 쪽 오류·장애

export const FAILURE_GUIDE: Record<SteamFailure, { title: string; hint: string }> = {
  "no-key": {
    title: "서버에 Steam API 키가 없습니다",
    hint: "설정 문제입니다. 잠시 후 다시 시도하거나 담당자에게 알려 주세요.",
  },
  "bad-input": {
    title: "SteamID 를 읽지 못했습니다",
    hint: "프로필 주소(steamcommunity.com/id/… 또는 /profiles/…)를 통째로 붙여넣거나, 17자리 SteamID64 를 입력해 주세요.",
  },
  "vanity-not-found": {
    title: "그런 프로필을 찾지 못했습니다",
    hint: "맞춤 프로필 주소의 철자를 확인해 주세요. 대소문자는 구분하지 않습니다.",
  },
  private: {
    title: "프로필이 비공개입니다",
    hint: "Steam → 프로필 편집 → 개인정보 보호 설정에서 '게임 세부 정보'를 공개로 바꾼 뒤 다시 시도해 주세요. 가져오기가 끝나면 되돌려도 됩니다.",
  },
  "steam-error": {
    title: "Steam 이 응답하지 않습니다",
    hint: "Steam 쪽 일시적인 문제일 수 있습니다. 잠시 후 다시 시도해 주세요.",
  },
};

export function guideFor(code: string | undefined): { title: string; hint: string } {
  if (code && code in FAILURE_GUIDE) return FAILURE_GUIDE[code as SteamFailure];
  return FAILURE_GUIDE["steam-error"];
}
