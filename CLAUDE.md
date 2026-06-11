# CLAUDE.md

이 파일은 Claude Code(claude.ai/code)가 이 저장소에서 작업할 때 참고하는 지침입니다.

## 언어

모든 질의 응답은 **한글**로 한다.

## 패키지 매니저

npm이나 yarn이 아닌 **pnpm**을 사용한다.

## 로컬 개발 사전 준비

앱 실행 전 PostgreSQL을 먼저 시작한다:

```bash
docker-compose up -d
```

이후:

```bash
pnpm run start:dev
```

## Prisma

클라이언트는 기본값(`node_modules/@prisma/client`)이 아닌 `generated/prisma`에 생성된다. 스키마 변경 후 반드시 재생성한다:

```bash
pnpm prisma:generate
```

CLI는 `prisma.config.ts`를 사용한다. 자동으로 인식되지 않을 경우 migrate/push 명령에 `--config prisma.config.ts`를 명시한다.

## 코드 스타일

Prettier는 작은따옴표와 trailing comma를 강제한다. ESLint는 TypeScript 타입 체킹과 함께 실행된다.

- `pnpm run lint` — 자동 수정 포함 린트
- `pnpm run format` — Prettier 포맷팅

## 테스트

- 유닛 테스트: `pnpm test` (`src/` 하위 `*.spec.ts` 파일)
- E2E 테스트: `pnpm run test:e2e`
