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
