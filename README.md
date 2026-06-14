## 로컬 실행 방법

### 1. 의존성 설치

```bash
pnpm install
```

### 2. 환경 변수 확인

루트의 `.env`에 DB 접속 정보가 들어 있다. docker-compose 기본값과 맞춰져 있어 그대로 사용하면 된다.

```env
DATABASE_URL="postgresql://coapproval:coapproval_secret@localhost:5432/co_approval"
```

> 앱은 기본적으로 `3000` 포트에서 뜬다. 바꾸려면 `.env`에 `PORT=원하는포트`를 추가한다.

### 3. PostgreSQL 시작

`docker-compose.yml`이 PostgreSQL 16 컨테이너를 띄운다.

```bash
docker-compose up -d
```

| 항목 | 값 |
|------|-----|
| host:port | `localhost:5432` |
| user | `coapproval` |
| password | `coapproval_secret` |
| database | `co_approval` |

### 4. Prisma 클라이언트 생성

클라이언트는 기본 위치(`node_modules/@prisma/client`)가 아닌 **`generated/prisma`**에 생성된다. 최초 실행 시, 그리고 `prisma/schema.prisma`를 변경할 때마다 재생성한다.

```bash
pnpm prisma:generate
```

### 5. DB 마이그레이션 적용

스키마를 DB에 반영한다.

```bash
pnpm prisma:migrate
```

> CLI는 `prisma.config.ts`를 사용한다. 자동 인식되지 않으면 명령에 `--config prisma.config.ts`를 명시한다.

### 6. 개발 서버 실행

```bash
pnpm run start:dev
```

서버가 뜨면:

- API: `http://localhost:3000`
- Swagger 문서: `http://localhost:3000/api-docs`

---

## API 문서 (Swagger)

서버를 실행한 뒤 아래 주소에서 Swagger UI로 전체 엔드포인트를 확인하고 직접 호출해 볼 수 있다.

- **Swagger UI**: http://localhost:3000/api-docs

---

## API 수동 테스트 (.http)

`http/` 디렉터리에 IntelliJ HTTP Client용 요청 모음이 있다.

### IntelliJ에서 사용하기

IntelliJ IDEA(Ultimate)와 WebStorm에는 HTTP Client가 내장되어 있다. (Community 에디션은 **HTTP Client** 플러그인을 설치해야 한다.)

1. `http/` 안의 `.http` 파일을 연다.
2. **편집기 우상단의 환경 선택 드롭다운에서 `local`을 고른다.** 이 환경의 `host`(= `http://localhost:3000`)가 요청의 `{{host}}`에 치환된다. 값은 `http/http-client.env.json`에 정의되어 있다.
3. 각 요청은 `###`로 구분된다. 실행하려는 요청 왼쪽 여백의 **▶︎(초록 화살표)** 를 누르면 그 요청만 전송된다.
4. 응답은 하단의 **Services / Run** 패널에 표시된다. 응답에서 받은 `data.id`를 복사해 다음 요청의 id 자리에 채워 넣는다.

### 실행 순서

요청 간 의존성이 있으므로 다음 순서로 실행한다.

1. `users.http` — BUYER와 SOURCING을 만들고 각 응답의 `data.id`를 메모한다.
2. `purchase-orders.http` — BUYER의 id로 발주서를 만들고, 제출·확정·변경 요청을 보낸다.
3. `change-requests.http` — 변경 요청을 SOURCING의 id로 검토(승인/반려)한다.

경로의 id와 요청 본문의 id(`buyerId`, `requesterId`, `reviewerId` 등)는 placeholder다. 앞 응답에서 받은 실제 id로 바꿔 실행한다.
