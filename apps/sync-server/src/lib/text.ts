/**
 * Lokalise에 쓰기 전 개행 표기를 실제 개행(\n)으로 통일한다.
 * - 리터럴 `\n` (백슬래시+n): 구버전 플러그인(≤0.0.33)이 개행을 이렇게 변환해 보낸다
 * - U+2028 / U+2029: Figma의 Shift+Enter(soft line break)가 node.characters에 이 문자로 들어온다
 * - \r\n, \r
 */
export function normalizeLineBreaks(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u2028\u2029]/g, "\n")
    .replace(/\\n/g, "\n");
}
