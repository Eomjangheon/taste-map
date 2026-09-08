// A 트랙(작품·가져오기) 홈 내비게이션 링크.
//
// 왜 별도 파일인가: 홈(`app/page.tsx`)은 두 트랙이 함께 쓰는 공용 화면이라,
// 양쪽이 같은 링크 목록을 고치면 매번 머지 충돌이 난다(실제로 T12 ↔ T41 에서 발생).
// 링크 추가는 각자 소유한 이 파일에서만 하고, 홈은 컴포넌트를 끼워 넣기만 한다.
// A 가 카탈로그 화면을 추가할 때는 여기에만 줄을 더한다.

const LINKS = [
  { href: "/search", label: "작품 검색" },
  { href: "/catalog/games", label: "게임 카탈로그(IGDB)" },
  { href: "/catalog/titles", label: "영화·드라마 카탈로그(TMDB)" },
  { href: "/import/review", label: "가져오기 확인(T44 미리보기)" },
];

export function CatalogNav() {
  return (
    <>
      {LINKS.map((link) => (
        <a key={link.href} href={link.href} className="text-sm font-medium text-blue-600">
          {link.label} →
        </a>
      ))}
    </>
  );
}
