/** 텍스트 정규화 유틸 */

/** 공백, 줄바꿈 정규화 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** 대소문자 + 공백 정규화 */
export function normalizeForComparison(text: string): string {
  return normalizeWhitespace(text).toLowerCase();
}

/** 특수문자 제거 (매칭용) */
export function stripSpecialChars(text: string): string {
  return text.replace(/[^\w\s가-힣ㄱ-ㅎㅏ-ㅣ]/g, "").trim();
}

/** key name 정규화 (domain.section.element.modifier) */
export function normalizeKeySegment(segment: string): string {
  return segment
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9가-힣-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
