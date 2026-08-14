# figma-i18n

Figma 디자인의 텍스트 노드를 Lokalise i18n key와 연결하고 동기화하는 도구입니다.

## 구성

```
figma-i18n/
├── apps/
│   ├── figma-plugin/     # Figma 플러그인 (UI + main)
│   └── sync-server/      # API 서버 (Fastify + Prisma)
└── packages/
    ├── shared-types/     # 공통 타입 정의
    ├── i18n-matcher/     # 텍스트 매칭 로직
    └── lokalise-client/  # Lokalise API 클라이언트
```

---

## 사전 요구사항

- Node.js 22+
- pnpm 10+
- Supabase 프로젝트 (PostgreSQL)
- Lokalise 계정 및 API 토큰

---

## 초기 설정

### 1. 의존성 설치

```bash
pnpm install
```

### 2. 환경 변수 설정

`.env.example`을 복사해 `apps/sync-server/.env`를 생성합니다.

```bash
cp .env.example apps/sync-server/.env
```

각 항목을 채워넣습니다:

```env
# Supabase (PostgreSQL)
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"

# Lokalise
LOKALISE_API_TOKEN="your_lokalise_api_token"
LOKALISE_PROJECT_ID="your_lokalise_project_id"
LOKALISE_BASE_LANGUAGE="ko"

# 멀티 프로젝트 (선택)
LOKALISE_PROJECT_DEALER_FO="dealer_fo_project_id"
LOKALISE_PROJECT_DEALER_BO="dealer_bo_project_id"

# 서버
PORT=3001
HOST="0.0.0.0"
LOG_LEVEL="info"
CORS_ORIGIN="*"
```

### 3. DB 마이그레이션

```bash
pnpm db:generate   # Prisma 클라이언트 생성
pnpm db:push       # 스키마를 DB에 반영
```

---

## 개발 실행

### Sync Server

```bash
pnpm dev:server
```

서버가 `http://localhost:3001`에서 시작됩니다.

### Figma Plugin

```bash
pnpm dev:plugin
```

빌드 결과물은 `apps/figma-plugin/dist/`에 생성됩니다.

Figma에서 플러그인 불러오기:
1. Figma 앱 → **Plugins** → **Development** → **Import plugin from manifest...**
2. `apps/figma-plugin/manifest.json` 선택

---

## 빌드

```bash
pnpm build           # 전체 빌드
pnpm build:server    # 서버만 빌드
pnpm build:plugin    # 플러그인만 빌드
```

---

## 플러그인 사용 방법

### 1. Server URL 설정

플러그인 상단 **Server URL** 입력란에 sync server 주소를 입력합니다.

```
http://localhost:3001
```

### 2. Email 입력

**Email (triggeredBy)** 란에 본인 이메일을 입력합니다. 동기화 이력에 기록됩니다.

### 3. Lokalise 캐시 갱신

처음 사용하거나 Lokalise key가 업데이트된 경우 캐시를 갱신해야 합니다.

```bash
curl -X POST http://localhost:3001/api/cache/refresh
```

### 4. 스캔

Figma에서 Frame 또는 컴포넌트를 선택한 후 **[스캔]** 버튼을 클릭합니다.

선택 영역의 모든 텍스트 노드를 추출하고 서버에서 Lokalise key와 매칭합니다.

### 5. 스캔 결과 확인

각 텍스트 노드는 다음 상태 중 하나로 분류됩니다:

| 상태 | 설명 |
|------|------|
| `matched` (✅) | 이미 key와 연결되어 있고 텍스트가 동일함 |
| `candidate` (🟡) | 유사한 기존 key가 존재함 (매칭 후보) |
| `new` (🔵) | 매칭되는 key가 없어 신규 생성 필요 |
| `changed` (🔴) | 연결된 key는 있지만 텍스트가 변경됨 |
| `ignored` (⚪) | 무시 처리된 노드 |

필터 칩으로 상태별 필터링이 가능합니다.

### 6. 액션 선택

각 노드에 대해 처리 방법을 선택합니다:

| 액션 | 적용 상황 | 설명 |
|------|-----------|------|
| **연결** | `candidate` | 제안된 기존 key와 연결 |
| **신규 Key 생성** | `new`, `candidate` | 새 key를 생성하고 연결 |
| **Source 업데이트** | `changed` | Lokalise의 기본 번역 텍스트를 현재 텍스트로 업데이트 |
| **무시** | 모든 상태 | 해당 노드를 동기화 대상에서 제외 |

`new` 상태의 노드는 key 이름 입력란에 자동 제안된 key가 채워집니다.  
Key 이름 규칙: `domain.section.element.modifier` (예: `vehicle.card.price.label`)

### 7. 동기화

액션을 선택한 항목이 생기면 **[동기화]** 버튼이 활성화됩니다.  
버튼 옆 숫자는 처리 대기 중인 항목 수입니다.

동기화 완료 시 결과 메시지가 표시되고 상태가 갱신됩니다.

### 8. 키 검색 탭

Figma 스캔과 무관하게 Lokalise에 등록된 key를 직접 수정할 때 사용합니다.

1. key 이름 또는 값의 일부를 입력하고 **[검색]** (또는 Enter)
2. 결과 항목의 value를 수정한 뒤 **[저장]** — 그 사이 Lokalise에서 수정된 key라면 저장이 보류되고 최신 값이 표시됩니다

저장이 성공하면 **현재 페이지에서 해당 key에 연결된 텍스트 노드도 같은 값으로 교체**됩니다 (아래 참고).

저장 시 프로젝트의 모든 언어에 해당 값이 반영되며, base가 EN인 프로젝트의 FR 계열 언어는 DeepL 자동 번역이 적용됩니다 (동기화와 동일한 규칙).

### 9. JSON 추가 탭

`{ "KEY": "값" }` 형태의 JSON을 붙여넣어 key를 대량으로 생성·수정합니다. 중첩 객체는 지원하지 않습니다.

1. JSON을 붙여넣고 **[미리보기]** — 캐시와 대조해 `신규` / `변경` / `동일`로 분류합니다
2. 반영할 항목을 체크 (신규·변경은 기본 선택, 동일은 선택 불가)
3. **[반영]** — 신규는 생성, 변경은 value 업데이트

### Figma 캔버스 텍스트 자동 반영

Lokalise에 값이 반영되면 Figma 캔버스의 텍스트도 같은 값으로 맞추고, 반영된 개수를 알려줍니다.

| 시점 | 대상 노드 |
|---|---|
| 스캔 탭 [동기화] | 동기화에 성공한 노드 중 **Value를 직접 수정한 노드**. nodeId로 정확히 그 노드만 바꿉니다 (삭제·무시 제외) |
| 키 검색 탭 [저장] | 해당 key에 연결된 **현재 페이지**의 노드 전부 |
| JSON 추가 탭 [반영] | 반영에 성공한 key에 연결된 **현재 페이지**의 노드 전부 |

| 조건 | 동작 |
|---|---|
| 노드 찾는 방법 | 키 검색·JSON 탭은 노드의 `pluginData`에 저장된 key로 역추적합니다. 즉 **한 번이라도 동기화되어 key가 연결된 노드만** 대상입니다 |
| 범위 | key 역추적은 현재 페이지만 탐색합니다. 다른 페이지의 노드는 반영되지 않습니다 |
| 값 | base 언어(EN) 값이 그대로 들어갑니다. `\n`은 실제 개행으로 변환됩니다 |
| 서식 | Figma API 특성상 한 노드 안에 서식이 섞여 있으면(부분 볼드 등) 첫 글자 서식으로 통일됩니다 |

되돌리려면 Figma에서 `Cmd+Z`를 누르면 됩니다. 텍스트 교체와 함께 `pluginData`의 `sourceText`도 갱신되므로 다음 스캔에서 `changed`로 잡히지 않습니다.

---

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/health` | 서버 상태 확인 |
| `POST` | `/api/scan` | 텍스트 노드 스캔 및 매칭 |
| `POST` | `/api/sync` | 선택한 액션 일괄 동기화 |
| `POST` | `/api/cache/refresh` | Lokalise key 캐시 갱신 |
| `GET` | `/api/cache/status` | 캐시 상태 조회 |
| `GET` | `/api/projects` | 사용 가능한 Lokalise 프로젝트 목록 |
| `GET` | `/api/keys/find` | key 이름·값 부분 일치 검색 (캐시 조회) |
| `POST` | `/api/keys/lookup` | key 이름 목록의 Lokalise 최신 값 조회 + 캐시 반영 |
| `POST` | `/api/keys/update` | 특정 key의 value 업데이트 (충돌 감지) |
| `POST` | `/api/keys/bulk` | JSON 기반 key 대량 생성·업데이트 (충돌 감지) |

---

## 캐시와 Lokalise 동기화

검색 속도를 위해 Lokalise key를 `lokalise_key_cache` 테이블에 캐싱합니다. 캐시 전체 갱신은 **서버 시작 시**와 **[캐시 갱신] 버튼**(`POST /api/cache/refresh`) 두 경우에만 일어납니다. 따라서 Lokalise에서 직접 수정한 내용은 갱신 전까지 플러그인에 반영되지 않습니다.

캐시가 오래되어 최신 값을 덮어쓰는 사고를 막기 위해 **쓰기 직전 해당 key만 Lokalise에서 재조회해 충돌을 감지**합니다.

| 기능 | 동작 |
|---|---|
| 키 검색 탭 [저장] | 화면에 보고 있던 값과 Lokalise 최신 값이 다르면 저장을 보류하고 최신 값을 보여줍니다. [덮어쓰기]로 강제 저장하거나 [최신 값 가져오기]로 되돌릴 수 있습니다 |
| JSON 추가 탭 [미리보기] | 붙여넣은 key들의 Lokalise 최신 값을 조회해 분류하고 캐시도 함께 갱신합니다 |
| JSON 추가 탭 [반영] | 미리보기 이후 값이 바뀐 항목, 이미 존재하는 신규 key는 건너뛰고 사유를 표시합니다 |

> Render 무료 플랜은 15분간 요청이 없으면 인스턴스를 중지시켜 다음 요청이 10초 이상 걸립니다. 이를 막기 위해 서버가 10분마다 자기 자신의 `/health`를 호출합니다 (`RENDER_EXTERNAL_URL`이 있을 때만 동작). 인스턴스가 계속 살아있으면 시작 시 전체 갱신도 그만큼 덜 일어나므로, Lokalise를 직접 크게 수정한 뒤에는 [캐시 갱신]을 눌러주세요.

---

## 매칭 로직

텍스트와 Lokalise key를 비교할 때 다음 순서로 매칭을 시도합니다:

1. **Exact match** — 텍스트가 완전히 동일한 key
2. **Normalized match** — 공백·대소문자를 정규화 후 비교
3. **Common dictionary match** — DB에 등록된 공통 문구 사전 조회
4. **Fuzzy match** — 유사도 80% 이상인 key 후보 최대 5개 반환

---

## 멀티 프로젝트

여러 Lokalise 프로젝트를 사용하는 경우 `.env`에 프로젝트 ID를 추가합니다.

```env
LOKALISE_PROJECT_DEALER_FO="xxxxxxxx"
LOKALISE_PROJECT_DEALER_BO="yyyyyyyy"
```

스캔·동기화 시 `projectId` 파라미터로 대상 프로젝트를 지정할 수 있습니다.

---

## 데이터베이스 스키마

| 테이블 | 설명 |
|--------|------|
| `figma_key_mapping` | Figma 노드 ID ↔ Lokalise key 매핑 |
| `lokalise_key_cache` | Lokalise key 로컬 캐시 |
| `sync_history` | 동기화 이력 (액션, 이전/이후 값, 작업자) |
| `common_dictionary` | 공통 문구 사전 |
| `cache_meta` | 캐시 상태 메타데이터 |
