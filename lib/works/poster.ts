// 포스터 URL 헬퍼 (T41) — 계약 문서(works)에 포스터 필드가 없으므로
// 스키마를 건드리지 않고 표시 계층에서 유도한다.
// 게임: external_ids.steam_appid → Steam CDN 세로 커버(API 키 불필요).
// 영화·드라마: 카탈로그(A, T12·T14)가 external_ids를 채우기 전까지 null →
// 화면은 플레이스홀더 타일을 그린다.

export function posterUrl(work: {
  media_type: string;
  external_ids: Record<string, unknown> | null;
}): string | null {
  const appid = work.external_ids?.["steam_appid"];
  if (
    work.media_type === "game" &&
    (typeof appid === "number" || typeof appid === "string")
  ) {
    return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;
  }
  return null;
}
