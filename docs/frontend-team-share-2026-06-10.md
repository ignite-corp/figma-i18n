# Figma i18n Sync 플러그인 공유 (2026-06-10)

> **대상**: 프론트엔드팀  
> **버전**: v0.0.22

---

## 왜 만들었나요?

Figma 디자인 텍스트를 Lokalise에 수동으로 입력하는 작업을 자동화하기 위해 만든 **내부 Figma 플러그인**입니다.

디자이너가 Figma에서 텍스트를 작성하면, 개발자가 플러그인으로 스캔 → 매칭 → 동기화하여 Lokalise에 i18n key를 등록할 수 있습니다.

---

## 지원 기능

| 기능 | 설명 |
|------|------|
| **텍스트 스캔** | Annotation이 달린 프레임의 텍스트 노드 자동 수집 |
| **자동 매칭** | 기존 Lokalise key와 유사도 기반 매칭 |
| **Key 생성/연결** | 신규 key 생성 또는 기존 key에 노드 연결 |
| **FR 자동 번역** | LibreTranslate로 EN → FR/FR_CA 자동 번역 |
| **FO / BO 분리** | Dealer FO / BO 프로젝트 독립 관리 |
| **버전 관리** | 텍스트 변경 감지 및 Lokalise 원문 업데이트 |

---

## 설치 방법

### 1. 플러그인 파일 다운로드

Confluence 페이지에서 첨부파일 3개를 **같은 폴더**에 저장합니다.

👉 [Figma i18n Sync 플러그인 사용 가이드](https://ignitecorp.atlassian.net/wiki/spaces/SPT/pages/2567929865)

| 파일 | 설명 |
|------|------|
| `manifest.json` | 플러그인 메타 정보 |
| `main.js` | 플러그인 메인 로직 |
| `ui.js` | 플러그인 UI |

### 2. Figma에 등록

Figma 데스크탑 앱 → 좌측 상단 메뉴 → **Plugins** → **Development** → **Import plugin from manifest...**
→ 다운로드한 폴더에서 `manifest.json` 선택

> ⚠️ Figma **데스크탑 앱** 필수. 웹 브라우저 버전에서는 등록 불가.

---

## 사용 방법

### 기본 워크플로우

```
1. Figma에서 Annotation이 달린 Frame 선택
2. 플러그인 실행 (우클릭 → Plugins → Figma i18n Sync)
3. [스캔] 클릭
4. 각 노드의 상태 확인 후 액션 선택
5. 체크박스로 대상 선택
6. [동기화] 클릭
```

### 노드 상태 설명

| 상태 | 의미 | 권장 액션 |
|------|------|-----------|
| 🟢 **Matched** | 이미 Lokalise key와 연결됨 | 확인만 |
| 🟡 **Candidate** | 유사한 key 발견됨 | 후보 중 연결 선택 |
| 🔵 **New** | 새 텍스트, key 없음 | key 이름 입력 후 생성 |
| 🟠 **Changed** | 기존 텍스트가 수정됨 | 원문 업데이트 여부 확인 |
| ⚫ **Ignored** | 동기화 제외 처리 | — |

### 프로젝트 선택

플러그인 상단에서 **FO / BO** 탭으로 작업 대상 Lokalise 프로젝트를 선택합니다.  
FO와 BO는 완전히 독립 관리되어 서로 영향을 주지 않습니다.

---

## Key 이름 규칙

자동 생성 key는 Figma parent path 기반으로 생성됩니다.

```
Figma: Header > Button Group > Confirm
→ 자동 생성: HEADER_BUTTON_GROUP_LABEL
```

- **대문자** + **언더스코어(`_`)** 구분
- 직접 수정 후 동기화 가능

---

## Annotation 설정 (디자이너 협업)

플러그인은 **모든 텍스트를 스캔하지 않습니다.**  
Figma에서 다음 Annotation Category가 달린 프레임의 하위 텍스트만 수집합니다.

| Category ID | 용도 |
|-------------|------|
| `14539:0` | FO 화면 |
| `12208:0` | BO 화면 |

디자이너에게 번역이 필요한 프레임에 해당 Annotation을 달아달라고 요청해주세요.

---

## 개행 문자 (`\n`) 입력

텍스트에 줄바꿈이 필요한 경우 value 입력 필드에서 **엔터키**로 개행을 입력할 수 있습니다.  
Lokalise에는 `\n` 리터럴로 저장됩니다.

---

## 서버 정보

플러그인은 내부 sync-server를 통해 Lokalise와 통신합니다.

- **Sync Server**: Railway 배포 (항상 온라인)
- **FR 번역**: LibreTranslate (Railway 내부망) 자동 처리
- 별도 서버 실행 불필요 — 플러그인만 설치하면 바로 사용 가능

---

## 개발 중 마주쳤던 문제들

Figma 플러그인 + 서버 배포 과정에서 겪은 이슈들입니다.  
비슷한 프로젝트를 할 때 참고하세요.

---

### 1. Figma 플러그인 UI는 `data:` URL iframe

**문제**: H Chat API Key를 `localStorage`에 저장하려 했더니 `SecurityError` 발생.

```
Uncaught SecurityError: Failed to read the 'localStorage' property from 'Window':
Storage is disabled inside 'data:' URLs.
```

**원인**: Figma 플러그인 UI는 `data:` URL로 실행되는 iframe이라 `localStorage` 사용 불가.

**해결**: `figma.clientStorage`(비동기 API)를 사용하고, `main.ts`에서 메시지 패싱으로 읽기/쓰기.

```ts
// main.ts에서 처리
on("GET_KEY", async () => {
  const key = await figma.clientStorage.getAsync("key");
  emit("KEY_LOADED", key);
});
```

---

### 2. Figma 플러그인에서 내부 API 직접 호출 → `origin: null` 403

**문제**: H Chat API(HMG 내부망)를 플러그인 UI에서 직접 `fetch`로 호출 → **403 Forbidden**.

**원인**: 플러그인 iframe의 `origin`이 `null`이라 API 게이트웨이가 차단.

```
-H 'origin: null'  →  403
-H (origin 없음)   →  200
```

**해결**: 외부 API 호출은 sync-server(Railway)를 프록시로 경유.  
플러그인 → sync-server → 외부 API 구조로 변경.

---

### 3. 전체 re-render로 인한 입력값 초기화

**문제**: 노드 목록에서 key 이름을 입력하다가 체크박스를 클릭하면 입력했던 값이 사라짐.

**원인**: 체크박스 클릭 시 `render()` 호출 → `innerHTML` 전체 교체 → input DOM 재생성.

**해결**: input 이벤트 발생 즉시 상태 Map에 저장.

```ts
// 기존: render() 시 DOM에서 읽음 (사라짐)
const input = document.querySelector(`[data-key-input="${nodeId}"]`);

// 수정: input 이벤트마다 Map에 저장
el.addEventListener("input", (e) => {
  userActions.set(nodeId, { action: "create_new", keyName: e.target.value });
});
```

스크롤 위치 초기화도 동일 원인. `innerHTML` 교체 전/후에 `scrollTop` 저장/복원으로 해결.

---

### 4. FO/BO 프로젝트 데이터 혼용 버그

**문제**: FO에 등록한 key가 BO 스캔 결과에서 "이미 매핑됨(Matched)"으로 표시.

**원인**: `FigmaKeyMapping` 조회 시 `projectId` 필터 누락 → FO/BO 구분 없이 전체 조회.

```ts
// 버그: projectId 필터 없음
prisma.figmaKeyMapping.findMany({ where: { figmaFileId, nodeId } })

// 수정
prisma.figmaKeyMapping.findMany({ where: { figmaFileId, nodeId, projectId } })
```

---

### 5. Node.js ESM + `moduleResolution: bundler` 조합 문제

**문제**: 로컬에서는 빌드/실행 OK, Railway(Node.js 24)에서 `Cannot find module` 오류.

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/apps/sync-server/dist/config'
```

**원인**: `moduleResolution: "bundler"` 설정은 Vite 같은 번들러용. 컴파일된 JS에 `.js` 확장자가 없어서 Node.js ESM이 거부.  
로컬은 `tsc` 캐시로 통과됐지만, Railway는 클린 빌드라 노출.

**해결**: 빌드된 JS를 실행하지 않고 `tsx`로 소스를 직접 실행.

```toml
# railway.toml
startCommand = "tsx src/index.ts"
```

---

### 6. pnpm이 Prisma 빌드 스크립트를 자동 실행 안 함

**문제**: Railway 빌드 후 `PrismaClient` 타입을 찾을 수 없다는 에러.

```
Module '"@prisma/client"' has no exported member 'PrismaClient'
```

**원인**: pnpm은 보안상 패키지의 `postinstall` 스크립트를 자동 실행하지 않음.  
→ `prisma generate`(Prisma Client 코드 생성)가 실행되지 않은 상태.

**해결**: 빌드 커맨드에 명시적으로 추가.

```toml
buildCommand = "pnpm install --frozen-lockfile && pnpm --filter sync-server exec prisma generate"
```

---

### 7. `\n` 이중 이스케이프

**문제**: Figma 텍스트의 `\n`이 Lokalise에 `\\n`으로 저장됨.

**시도**: `sourceText.replace(/\n/g, "\\n")` 추가 → FR은 정상이지만 EN만 `\\n`으로 저장되는 버그.

**원인**: FR은 LibreTranslate 번역 결과(`frTranslations`)를 통해 전달되어 replace를 거치지 않았고,  
EN은 `sourceText`에 직접 replace가 적용되어 이중 이스케이프 발생.

**해결**: replace 자체를 제거. JSON serialization이 `\n`을 이미 올바르게 처리하므로 수동 이스케이프 불필요.

---

## 문의

플러그인 관련 문의: **Service Planning Team**  
버그 리포트: [GitHub Issues](https://github.com/ignite-corp/figma-i18n/issues)  
개발 문서: [Confluence 개발자 문서](https://ignitecorp.atlassian.net/wiki/spaces/IF/pages/2565898462)
