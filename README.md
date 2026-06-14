# co-approval

발주서 변경 승인 API. 로컬에서 띄우는 방법이랑 .http로 API 찔러보는 방법만 정리해뒀습니다.

## 띄우기

먼저 패키지부터 깔고:

```bash
pnpm install
```

DB 접속 정보는 루트 `.env`에 있습니다. docker-compose 값이랑 똑같이 맞춰놨으니 그냥 쓰면 됩니다.

```env
DATABASE_URL="postgresql://coapproval:coapproval_secret@localhost:5432/co_approval"
```

포트는 따로 안 건드리면 3000으로 뜹니다. 바꾸고 싶으면 `.env`에 `PORT=...` 추가하면 되고요.

DB는 docker-compose로 띄웁니다. PostgreSQL 16 컨테이너 하나 올라옵니다.

```bash
docker-compose up -d
```

접속 정보는 이렇습니다.

| 항목 | 값 |
|------|-----|
| host:port | `localhost:5432` |
| user | `coapproval` |
| password | `coapproval_secret` |
| database | `co_approval` |

그다음 Prisma 클라이언트를 생성합니다. 이 프로젝트는 클라이언트가 기본 위치가 아니라 `generated/prisma`에 깔리니까, 처음 한 번이랑 schema 바꿀 때마다 꼭 다시 돌려야 합니다.

```bash
pnpm prisma:generate
```

마이그레이션으로 스키마를 DB에 반영하고:

```bash
pnpm prisma:migrate
```

> 명령이 `prisma.config.ts`를 못 찾으면 뒤에 `--config prisma.config.ts` 붙여주세요.

마지막으로 서버 실행.

```bash
pnpm run start:dev
```

뜨고 나면 `http://localhost:3000`이고, Swagger 문서는 `http://localhost:3000/api-docs`에서 봅니다.

## .http로 테스트하기

`http/` 폴더에 IntelliJ HTTP Client용 요청들을 모아놨습니다. Swagger 말고 이쪽이 편하면 이걸로 찔러보면 됩니다.

IntelliJ Ultimate나 WebStorm은 HTTP Client가 기본 내장이고, Community면 **HTTP Client** 플러그인을 깔아야 합니다.

쓰는 법은 대충 이렇습니다.

1. `.http` 파일을 엽니다.
2. 편집기 우상단 드롭다운에서 환경을 `local`로 고릅니다. 그래야 요청의 `{{host}}`가 `http://localhost:3000`으로 치환됩니다. (값은 `http/http-client.env.json`에 있어요.)
3. 요청은 `###`로 나뉘는데, 보내고 싶은 요청 왼쪽의 초록 화살표(▶︎)를 누르면 그것만 날아갑니다.
4. 응답은 아래 패널에 뜹니다. 거기서 받은 `data.id`를 복사해서 다음 요청에 채워 넣으면 됩니다.

요청끼리 의존성이 있어서 순서대로 해야 합니다.

1. `users.http` — BUYER랑 SOURCING 만들고 각각 `data.id` 메모.
2. `purchase-orders.http` — BUYER id로 발주서 만들고 제출·확정·변경 요청.
3. `change-requests.http` — SOURCING id로 변경 요청 승인/반려.

경로나 본문에 들어가는 id(`buyerId`, `requesterId`, `reviewerId` 등)는 그냥 placeholder라, 앞 응답에서 받은 실제 id로 바꿔서 보내야 합니다.
