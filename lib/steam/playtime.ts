// 플레이 시간 표기 — T19
//
// 기록의 `progress` 에 넣는 형식을 **한 곳에 가둔다.** 형식이 아직 합의 전이라
// 나중에 바뀔 수 있고, 바뀔 때 고칠 자리가 하나여야 한다.
//
// 형식은 명세서 §6.2 의 "게임 n시간" 문구를 그대로 따른다
// (같은 컬럼에 시리즈는 "8화", 책은 "120쪽" 이 들어갈 자리다).

/** 분 → `"20.5시간"`. 0분이면 null — 빈 값을 굳이 문자열로 만들지 않는다 */
export function playtimeToProgress(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  const hours = minutes / 60;
  // 1시간 미만은 소수 첫째 자리로도 0.0 이 되므로 분으로 적는다
  if (hours < 0.1) return `${Math.round(minutes)}분`;
  return `${hours.toFixed(1)}시간`;
}

/** 화면 표시용 — 저장 형식과 같은 문구를 쓴다 */
export function playtimeLabel(minutes: number | null | undefined): string {
  return playtimeToProgress(minutes) ?? "플레이 기록 없음";
}
