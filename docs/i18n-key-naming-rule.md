# 다국어 키 네이밍 룰 (Phase 3)

> 출처: [Confluence - Phase3 다국어 정책](https://hmg.atlassian.net/wiki/spaces/DLRS/pages/196779925)

---

## 1. 키 구성 구조

```
{기능/메뉴}_{화면이름}_{라벨1}_{라벨2}
```

| 구성 요소 | 설명 | 예시 |
|---|---|---|
| 기능/메뉴 | 기능·메뉴 단위의 서비스 구분 | `HOME`, `BOARD`, `QUICK` |
| 화면이름 | 각 서비스의 상세 화면 이름 (Screen code) | 서비스별 개별 정의 |
| 라벨1 | 화면에 표기된 텍스트를 구분하는 라벨 | `POPUP`, `TITLE`, `BUTTON` |
| 라벨2 | 추가 구분이 필요한 경우 기입 | `CANCEL`, `EDIT` 등 |

- 변수가 포함된 텍스트인 경우 라벨2 자리에 변수를 기입할 수 있음
- 변수가 없는 항목은 미기입

---

## 2. 라벨 타입 코드표

| 타입 | 코드 | 예시 |
|---|---|---|
| 버튼 | `BUTTON` | `HOME_MAIN_BUTTON_EDIT` |
| 버튼(공간 부족 시 단일) | `BUTTON` | `HOME_MAIN_POPUP_EDITBUTTON` |
| 버튼(공간 부족 시 복수) | `BUTTON1`, `BUTTON2` | `HOME_MAIN_POPUP_BUTTON1` |
| 링크가 있는 텍스트 | `TEXTBUTTON` | — |
| 팝업 | `POPUP` | — |
| 셀렉트박스 | `SELECTBOX` | — |
| 타이틀 | `TITLE` | — |
| 본문·문구 | `TEXT` | — |
| 플레이스홀더 | `PLACEHOLDER` | — |

---

## 3. FO 기능/메뉴 코드표

| 코드 | 설명 |
|---|---|
| `COMMON` | 공통 컴포넌트 |
| `LOGIN` | 로그인 / 로그아웃 |
| `HOME` | 홈 |
| `SEARCH` | 통합검색 |
| `NOTI` | 노티피케이션 센터 |
| `EMAIL` | 이메일 |
| `QUICK` | 퀵링크 |
| `DEM` | 딜러 직원관리 |
| `BULLETIN` | 블레틴 보드 (게시판) |
| `POST` | 게시글 상세 |
| `PROFILE` | 프로필 |
| `COOKIE` | 쿠키 |

---

## 4. BO 기능/메뉴 코드표

| 코드 | 설명 |
|---|---|
| `COMMON` | 공통 컴포넌트 |
| `GNB` | GNB |
| `JOB` | JOB 권한관리 |
| `MENU` | 메뉴 관리 |
| `BULLETIN` | 게시판 관리 |
| `POST` | 게시글 관리 |
| `DEALER` | 딜러관리 |
| `DEALERZONE` | 딜러 지역관리 |
| `DEALERGROUP` | 딜러 그룹관리 |
| `EMPLOYEE` | 딜러 직원관리 |
| `HOLDING` | 지주사관리 |
| `EMAIL` | 이메일 관리 |

---

## 5. 번역 텍스트 작성 규칙

### 5-1. 변수 입력

- 형태: `{{변수명}}` (이중 중괄호)
- 변수명이 긴 경우: **camelCase** 사용
- 브랜드명은 대소문자 구분 적용

| UI 텍스트 | 번역 입력값 |
|---|---|
| 총 N명 | `총 {{n}}명` |
| Cookie Policy | `{{cookiePolicy}}` |
| Hyundai, Genesis (소문자) | `{{brand}}` |
| HYUNDAI, GENESIS (대문자) | `{{BRAND}}` |

### 5-2. 줄바꿈 입력

- 실제 줄바꿈 문자 대신 `\n` 으로 입력

| UI 텍스트 | 번역 입력값 |
|---|---|
| 수정을 취소하시겠습니까?\n저장되지 않은 내용은 삭제됩니다. | `수정을 취소하시겠습니까?\n저장되지 않은 내용은 삭제됩니다.` |

### 5-3. 텍스트 내 HTML 삽입

| 타입 | 형태 | 예시 |
|---|---|---|
| 아이콘 추가 | `<icon />` | `This menu opens in a new tab and displays an <icon /> icon` |
| 텍스트 색상 | `<tag1>text</tag1>` | `<tag1>Select files</tag1> or drag and drop them here.` |

> 텍스트 중간에 아이콘·색상이 들어가는 경우에만 HTML 삽입
