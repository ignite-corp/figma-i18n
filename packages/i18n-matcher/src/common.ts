import type { MatchResult } from "shared-types";

/** 공통 문구 사전: 텍스트 → key */
const COMMON_DICTIONARY: Record<string, string> = {
  // 버튼
  "확인": "common.confirm.button",
  "취소": "common.cancel.button",
  "닫기": "common.close.button",
  "저장": "common.save.button",
  "삭제": "common.delete.button",
  "수정": "common.edit.button",
  "등록": "common.register.button",
  "다음": "common.next.button",
  "이전": "common.prev.button",
  "완료": "common.complete.button",
  "검색": "common.search.button",
  "더보기": "common.more.button",
  "전체": "common.all.label",
  "선택": "common.select.button",
  // 시스템 메시지
  "로딩 중...": "common.loading.message",
  "로딩중...": "common.loading.message",
  "검색 결과가 없습니다": "common.no-results.message",
  "검색결과가 없습니다": "common.no-results.message",
  "필수 입력 항목입니다": "common.required.error",
  "네트워크 오류가 발생했습니다": "common.network-error.message",
  "잠시 후 다시 시도해주세요": "common.retry.message",
  // 영문 공통
  "OK": "common.ok.button",
  "Cancel": "common.cancel-en.button",
  "Confirm": "common.confirm-en.button",
  "Close": "common.close-en.button",
  "Save": "common.save-en.button",
  "Delete": "common.delete-en.button",
  "Next": "common.next-en.button",
  "Previous": "common.prev-en.button",
};

/** 공통 문구 사전 매칭 */
export function commonDictionaryMatch(text: string): MatchResult | null {
  const trimmed = text.trim();
  const keyName = COMMON_DICTIONARY[trimmed];

  if (!keyName) return null;

  return {
    keyName,
    value: trimmed,
    matchType: "common_dictionary" as const,
    score: 0.9,
  };
}

/** 사전에 등록된 모든 항목 조회 (admin용) */
export function getCommonDictionary(): Record<string, string> {
  return { ...COMMON_DICTIONARY };
}
