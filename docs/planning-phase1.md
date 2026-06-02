# Figma i18n Plugin — Phase 1 기능 개선 플래닝

> 작성일: 2026-05-04  
> 기준 회의 내용 기반 정리

---

## 전체 요약

| 기능 | 담당 | Phase | 상태 |
|------|------|-------|------|
| 다국어 영역 구분 (목업 제외) | - | 1 | 논의 |
| EN 업로드 시 EN_CA / FR_CA 자동 생성 | - | 1 | ✅ 완료 |
| FR 업로드 시 FR_CA 기계번역 자동 생성 | 건우 | 1 | ✅ 완료 |
| Key-Value 수정 (Value 편집 추가) | 건우 | 1 | 논의 |
| 검색 기능 (Key / Value) | 건우 | 1 | 논의 |
| 원장 관리 방식 | - | 1 | 논의 |
| 버전 관리 | - | 2+ | 스펙아웃 |

---

## 1. 다국어 영역 구분

### 배경
- 현재 스캔 시 목업 데이터, 더미 텍스트까지 모두 추출되어 불필요한 키가 생성됨

### To-be
- 디자인에서 **i18n 라벨**이 필요한 영역만 키 생성 대상으로 구분
- 목업 데이터(e.g. "홍길동", "010-0000-0000", placeholder 텍스트 등)는 스캔 대상에서 제외

### 구현 방향 (안)
- Figma 레이어 네이밍 컨벤션으로 구분:  
  - `[i18n]`이 붙은 레이어만 스캔 대상으로 처리
  - 혹은 특정 컴포넌트/그룹 하위만 스캔 포함
- `classifier.ts`에 필터링 로직 추가 검토

### 논의 필요 사항
- [ ] 목업 텍스트와 실제 라벨 구분 기준 확정 (디자이너와 합의)
- [ ] 레이어 네이밍 컨벤션 vs. Figma 어노테이션 방식 결정

---

## 2. 언어 처리: EN → EN_CA / FR_CA 자동 생성 ✅ 완료

### 배경
- Lokalise에 `en` 언어로 업로드하면 `en_CA`, `fr_CA` 언어도 함께 채워져야 함

### To-be
- EN 텍스트 업로드(동기화) 시:
  - `en_CA` → EN 값과 동일하게 자동 설정
  - `fr_CA` → FR 번역값으로 자동 설정 (아래 항목 참조)

### 구현 방향
- `/api/sync` 엔드포인트에서 Lokalise 업로드 시 언어 매핑 처리
- `lokalise-client` 패키지에서 업로드 시 언어 배열에 `en_CA` 포함

---

## 3. FR 업로드 시 FR_CA 기계번역 자동 생성 ✅ 완료 (담당: 건우)

### 배경
- FR 텍스트 동기화 시, `fr_CA` 언어도 자동으로 채워져야 함

### To-be
- FR 값 업로드 시 Lokalise 기계번역 API 또는 외부 번역 API를 통해
  `fr_CA` 값을 자동 생성 후 업로드

### 구현 방향
```
[FR 동기화 요청]
    ↓
sync-server: FR 값을 Lokalise에 업로드
    ↓
기계번역 API 호출 (Lokalise MT 또는 DeepL 등) → fr_CA 값 생성
    ↓
fr_CA 언어로 Lokalise에 추가 업로드
```

### 구현 내용
- HChat API (`gpt-5.4`) 사용 — `services/translation.ts`
- `buildTranslations()` 함수에서 FR 계열 언어 자동 감지 후 번역 적용
- 번역 실패 시 원문 fallback, `is_fuzzy: true` 마킹으로 검수 필요 표시

### 인프라 확인 필요
- [ ] Lokalise 프로젝트에 `en_CA`, `fr_CA` 언어 등록 여부 확인 (콘솔에서 직접 추가 필요)

---

## 4. Key-Value 수정 — Value 편집 추가 (담당: 건우)

### As-is
- Figma 플러그인에서 Key 값만 자동 생성 및 수정 가능
- Value(실제 번역 텍스트)는 수정 불가

### To-be
- Key 자동 생성 및 수정 기능 유지
- **Key, Value(번역 텍스트) 직접 수정** 기능 추가
  - 기획자가 키를 유지하면서 value만 변경하는 사용 시나리오 지원
  - 기획자가 value를 유지하면서 key만 변경하는 사용 시나리오 지원

### 구현 포인트

#### 플러그인 UI (`ui.tsx`)
- 스캔 결과 노드 아이템에 Value 수정 인풋 추가
- `changed` 상태 노드: 기존 value 표시 + 새 value 편집 가능
- `new` / `candidate` 상태 노드: key 인풋 옆에 value 인풋 추가

#### 서버 (`/api/sync`)
- `SyncItem` 타입에 `value?: string` 필드 추가
- Lokalise 업로드 시 value가 명시된 경우 해당 값 사용, 없으면 Figma 텍스트 사용

#### 키 생성 규칙 참조
- 키 생성 기획 룰: https://hmg.atlassian.net/wiki/spaces/DLRS/pages/196779925/Phase3

---

## 5. 검색 기능 — Key / Value 검색 (담당: 건우)

### 배경
- 스캔 결과가 많아질수록 특정 항목을 찾기 어려움

### To-be
- 플러그인 UI 상단에 검색 인풋 추가
- 검색 대상: **Key 이름** + **Value(텍스트)** 동시 검색
- 실시간 필터링 (입력 즉시 결과 갱신)

### 구현 포인트

#### 플러그인 UI (`ui.tsx`)
```
[검색 인풋 추가 위치]
───────────────────────────────
| 🔍 key 또는 텍스트 검색...  |
───────────────────────────────
[필터 칩: matched | candidate | new | changed | ignored]
[그룹 선택 바]
[노드 리스트]
```

- `searchQuery` 상태 변수 추가
- `render()` 시 `scanResults`를 `searchQuery`로 추가 필터링
- 검색 인풋 `keyup` 이벤트 → `render()` 재호출

---

## 6. 원장 관리 방식

### 개념
- **전체 1판을 원장(Master)으로 관리**
- 부분 업데이트 시 해당 부분만 부분 업로드

### 운영 방식
```
[원장 상태]
전체 키-값 목록 (Lokalise 기준)
    │
    ├── 전체 업로드: 원장 전체를 Lokalise에 동기화
    └── 부분 업로드: 선택한 노드/영역만 업로드
```

### 버전 이력 기록 (Phase 1 범위 내)
업로드 발생 시 아래 정보를 `sync_history` 테이블에 기록:

| 필드 | 내용 |
|------|------|
| `timestamp` | 업로드 시각 |
| `triggered_by` | 담당자 (이메일) |
| `key_name` | 변경된 키 이름 |
| `action` | create / update / link |
| `prev_value` | 이전 값 |
| `next_value` | 변경 후 값 |

> 이미 `sync_history` 테이블 존재 — 필드 보강 여부 검토 필요

---

## 7. 버전 관리 (Phase 2+ — 스펙아웃)

### 배경
- 키별 변경 이력, 롤백, 담당자별 변경 추적이 필요하나 Phase 1에서는 우선순위 낮음

### 추후 고도화 내용 (메모)
- 키별 버전 히스토리 조회 UI
- 특정 버전으로 롤백
- 담당자별 변경 내역 필터
- 변경 알림(슬랙 등) 연동

---

## 구현 우선순위 (Phase 1)

```
P0 (즉시)
 ├── Value 수정 기능 추가 (건우)
 └── 검색 기능 추가 (건우)

P1 (단기)
 ├── EN → EN_CA / FR_CA 자동 생성 ✅
 └── FR → FR_CA 기계번역 자동 업로드 (건우) ✅

P2 (디자이너 협의 후)
 └── 다국어 영역 구분 (목업 제외 스캔 필터)
```

---

## 관련 링크

- Lokalise 키 생성 기획 룰: https://hmg.atlassian.net/wiki/spaces/DLRS/pages/196779925/Phase3
- 프로젝트 README: `/README.md`
- 테스트 가이드: `/TESTING.md`
