// 띄어쓰기·특수문자 무시 비교용 정규화 (WEB-4 관찰 반영)
// T16 기록 입력의 작품 검색 → T42 내 기록 검색이 함께 쓰도록 추출.
// 정식 제목 정규화 규칙은 T18에서 A(작품·가져오기)가 소유한다 — 이건 화면 검색용 간이 버전.
// 주의: 정규식 \W 는 한글까지 지워버린다 — 모든 언어의 글자·숫자(\p{L}\p{N})만 남긴다 (AGENTS.md)

export function loose(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
