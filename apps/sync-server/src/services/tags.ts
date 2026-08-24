/** Figma 플러그인이 생성한 key임을 표시하는 고정 태그 */
export const FIGMA_SYNC_TAG = "figma-sync";

/** 고정 태그에 사용자가 지정한 태그를 덧붙인 목록 (공백 제거·중복 제거) */
export function buildKeyTags(userTags?: string[]): string[] {
  const extra = (userTags ?? []).map((t) => t.trim()).filter(Boolean);
  return [...new Set([FIGMA_SYNC_TAG, ...extra])];
}
