# 동작 테스트 가이드

## 목차

1. [테스트 환경 준비](#1-테스트-환경-준비)
2. [Sync Server API 테스트](#2-sync-server-api-테스트)
3. [Figma 플러그인 UI 테스트](#3-figma-플러그인-ui-테스트)
4. [전체 플로우 통합 테스트](#4-전체-플로우-통합-테스트)
5. [엣지 케이스 테스트](#5-엣지-케이스-테스트)

---

## 1. 테스트 환경 준비

### 1-1. 서버 실행

```bash
pnpm dev:server
```

터미널에 아래 메시지가 출력되면 정상입니다.

```
🚀 Sync server running on http://0.0.0.0:3001
✅ Cache ready [default]: N keys in Xms
```

### 1-2. 플러그인 빌드

```bash
pnpm dev:plugin
```

빌드 완료 후 `apps/figma-plugin/dist/` 폴더가 생성됩니다.

### 1-3. Figma에서 플러그인 불러오기

1. Figma 앱 → **Plugins** → **Development** → **Import plugin from manifest...**
2. `apps/figma-plugin/manifest.json` 선택

---

## 2. Sync Server API 테스트

> 서버가 `http://localhost:3001`에서 실행 중인 상태에서 진행합니다.

### 2-1. Health Check

```bash
curl http://localhost:3001/health
```

**예상 결과**

```json
{ "status": "ok", "timestamp": "2024-01-01T00:00:00.000Z" }
```

---

### 2-2. 캐시 상태 조회

```bash
curl http://localhost:3001/api/cache/status
```

**예상 결과**

```json
{
  "status": "idle",
  "totalKeys": 1234,
  "lastSyncAt": "2024-01-01T00:00:00.000Z",
  "projectId": "default"
}
```

- `totalKeys`가 0이면 캐시가 비어 있는 것이므로 캐시 갱신을 먼저 수행합니다.

---

### 2-3. 캐시 갱신

```bash
curl -X POST http://localhost:3001/api/cache/refresh
```

**예상 결과**

```json
{
  "status": "completed",
  "totalKeys": 1234,
  "duration": 2500,
  "lastSyncAt": "2024-01-01T00:00:00.000Z"
}
```

- `duration`은 Lokalise API 응답 시간에 따라 수 초 ~ 수십 초까지 소요될 수 있습니다.
- 멀티 프로젝트 환경에서 특정 프로젝트만 갱신하려면 `projectId` 파라미터를 추가합니다.

```bash
curl -X POST http://localhost:3001/api/cache/refresh \
  -H "Content-Type: application/json" \
  -d '{"projectId": "dealer-fo"}'
```

---

### 2-4. 프로젝트 목록 조회

```bash
curl http://localhost:3001/api/projects
```

**예상 결과**

```json
{
  "projects": [
    { "id": "default", "name": "Default" },
    { "id": "dealer-fo", "name": "Dealer FO" }
  ]
}
```

---

### 2-5. 텍스트 스캔 (`/api/scan`)

```bash
curl -X POST http://localhost:3001/api/scan \
  -H "Content-Type: application/json" \
  -d '{
    "figmaFileId": "test-file-001",
    "nodes": [
      {
        "nodeId": "node-1",
        "text": "차량 가격",
        "parentPath": "Frame / Card / Price"
      },
      {
        "nodeId": "node-2",
        "text": "완전히 새로운 텍스트입니다",
        "parentPath": "Frame / Header / Title"
      }
    ]
  }'
```

**예상 결과**

```json
{
  "results": [
    {
      "nodeId": "node-1",
      "text": "차량 가격",
      "status": "matched",
      "candidates": [],
      "existingMapping": { "keyName": "vehicle.card.price.label", ... }
    },
    {
      "nodeId": "node-2",
      "text": "완전히 새로운 텍스트입니다",
      "status": "new",
      "candidates": [],
      "suggestedKey": "frame.header.title.label"
    }
  ],
  "summary": { "total": 2, "matched": 1, "new": 1, "candidate": 0, "changed": 0, "ignored": 0 }
}
```

---

### 2-6. 동기화 (`/api/sync`)

```bash
curl -X POST http://localhost:3001/api/sync \
  -H "Content-Type: application/json" \
  -d '{
    "figmaFileId": "test-file-001",
    "triggeredBy": "tester@example.com",
    "items": [
      {
        "nodeId": "node-2",
        "action": "create_new",
        "keyName": "frame.header.title.label",
        "text": "완전히 새로운 텍스트입니다"
      }
    ]
  }'
```

**예상 결과**

```json
{
  "results": [{ "nodeId": "node-2", "success": true }],
  "summary": { "total": 1, "succeeded": 1, "failed": 0 }
}
```

---

### 2-7. 동기화 이력 조회 (`/api/history`)

```bash
curl "http://localhost:3001/api/history?figmaFileId=test-file-001&page=1&limit=10"
```

**예상 결과**

```json
{
  "items": [
    {
      "id": 1,
      "nodeId": "node-2",
      "keyName": "frame.header.title.label",
      "action": "create_new",
      "triggeredBy": "tester@example.com",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10
}
```

---

## 3. Figma 플러그인 UI 테스트

### 3-1. 초기 화면

| 항목 | 확인 내용 |
|------|-----------|
| Server URL 입력란 | 기본값 `http://localhost:3001` 표시 |
| 캐시 상태 표시 | 서버 연결 시 key 개수와 마지막 갱신 시간 표시 |
| 안내 메시지 | "Frame을 선택하고 [스캔] 버튼을 눌러주세요" 표시 |

---

### 3-2. 스캔 테스트

1. Figma에서 텍스트 노드가 포함된 Frame 선택
2. 플러그인 상단 **Server URL**에 `http://localhost:3001` 입력
3. **Email** 란에 본인 이메일 입력
4. **[스캔]** 버튼 클릭

| 확인 항목 | 기대 동작 |
|-----------|-----------|
| 로딩 표시 | "⏳ 처리 중..." 표시 |
| 결과 표시 | 텍스트 노드 목록과 상태 배지(matched/candidate/new/changed) 표시 |
| 요약 카운트 | 상단 요약 영역에 상태별 개수 표시 |
| 필터 칩 | 상태별 필터 클릭 시 해당 항목만 표시 |

---

### 3-3. 액션 선택 테스트

각 상태별로 아래 액션이 정상 동작하는지 확인합니다.

| 상태 | 액션 버튼 | 확인 내용 |
|------|-----------|-----------|
| `candidate` | 🔗 연결 | 클릭 시 해당 key와 연결 표시, 동기화 버튼 카운트 증가 |
| `candidate` / `new` | ➕ 신규 Key 생성 | Key 입력란에 값 입력 후 버튼 클릭, 카운트 증가 |
| `changed` | 📝 Source 업데이트 | 클릭 시 동기화 대상으로 추가 |
| 모든 상태 | 무시 | 클릭 시 해당 노드가 동기화 대상에서 제외 |

---

### 3-4. 동기화 테스트

1. 액션을 하나 이상 선택하면 **[동기화 (N)]** 버튼 활성화 확인
2. **[동기화]** 버튼 클릭
3. 아래 항목 확인

| 확인 항목 | 기대 동작 |
|-----------|-----------|
| 완료 알림 | "동기화 완료: N건 성공, M건 실패" 토스트 알림 |
| 상태 갱신 | 성공한 노드의 상태가 `matched`로 변경 |
| 버튼 비활성화 | 처리 완료 후 동기화 버튼 비활성화 |

---

### 3-5. 캐시 갱신 테스트 (플러그인 내)

1. 우측 상단 **[🔄 캐시 갱신]** 버튼 클릭
2. 아래 항목 확인

| 확인 항목 | 기대 동작 |
|-----------|-----------|
| 갱신 중 표시 | 버튼이 "⏳" 아이콘으로 변경되고 비활성화 |
| 완료 알림 | "캐시 갱신 완료: N개 키 (Xms)" 알림 |
| 캐시 상태 갱신 | 상단 캐시 정보 영역의 key 개수 및 시간 업데이트 |

---

## 4. 전체 플로우 통합 테스트

### 시나리오: 신규 텍스트 Lokalise 등록

1. **서버 시작** → `pnpm dev:server`
2. **캐시 갱신** → `curl -X POST http://localhost:3001/api/cache/refresh`
3. **Figma** → 신규 텍스트가 포함된 Frame 선택
4. **플러그인** → [스캔] 클릭 → `new` 상태 노드 확인
5. **Key 입력** → `domain.section.element.modifier` 형식으로 입력
6. **[➕ 신규 Key 생성]** 클릭
7. **[동기화]** 클릭 → 성공 알림 확인
8. **이력 확인** → `curl "http://localhost:3001/api/history?figmaFileId=<파일ID>"`

---

### 시나리오: 기존 텍스트 변경 감지 및 업데이트

1. Figma에서 기존 매핑된 텍스트 노드의 내용 변경
2. 플러그인에서 [스캔] → 해당 노드가 `changed` 상태로 표시
3. [📝 Source 업데이트] 클릭
4. [동기화] → Lokalise의 base language 번역 텍스트 업데이트 확인

---

## 5. 엣지 케이스 테스트

### 5-1. 서버 미연결 상태에서 스캔

- **상황**: Server URL을 잘못 입력하거나 서버가 꺼진 상태
- **기대 동작**: "서버 연결 실패: ..." 오류 메시지 표시

### 5-2. 텍스트 노드 없는 Frame 선택 후 스캔

- **상황**: 이미지나 도형만 있는 Frame 선택
- **기대 동작**: "선택된 영역에 텍스트 노드가 없습니다" 안내 메시지 표시

### 5-3. Key 이름 미입력 상태로 [신규 Key 생성] 클릭

- **기대 동작**: "Key 이름을 입력해주세요" 알림 토스트 표시, 동기화 미진행

### 5-4. 빈 items로 동기화 요청

```bash
curl -X POST http://localhost:3001/api/sync \
  -H "Content-Type: application/json" \
  -d '{
    "figmaFileId": "test-file-001",
    "triggeredBy": "tester@example.com",
    "items": []
  }'
```

- **기대 동작**: `{ "results": [], "summary": { "total": 0, "succeeded": 0, "failed": 0 } }`

### 5-5. 캐시 갱신 중 중복 요청

- **상황**: 갱신 버튼 클릭 후 갱신 완료 전에 다시 클릭
- **기대 동작**: 버튼이 비활성화 상태이므로 중복 요청 불가

### 5-6. 멀티 프로젝트 스캔

```bash
curl -X POST http://localhost:3001/api/scan \
  -H "Content-Type: application/json" \
  -d '{
    "figmaFileId": "test-file-001",
    "projectId": "dealer-fo",
    "nodes": [...]
  }'
```

- **기대 동작**: 해당 프로젝트의 Lokalise key 기준으로 매칭 결과 반환
