# api

`$ARGUMENTS` NestJS 모듈을 TDD 방식으로 생성한다.

## 사전 준비

`src/users/` 디렉토리의 모든 파일을 읽어 패턴을 파악한 뒤 작업을 시작한다.

## 명명 규칙

`$ARGUMENTS`는 복수 소문자로 입력된다 (예: `orders`).

| 용도 | 규칙 | 예시 (orders 기준) |
|------|------|-------------------|
| 디렉토리/파일명 | 그대로 | `orders/`, `orders.controller.ts` |
| Class 접두사 | PascalCase | `OrdersController`, `OrdersService` |
| Entity 명 | 끝 `s` 제거 + PascalCase | `Order` |
| 변수명 | camelCase | `ordersService`, `ordersRepository` |
| Prisma 접근자 | 단수 camelCase | `prisma.order` |

## 실행 순서

### 0단계: 파일 존재 확인

`src/$ARGUMENTS/` 디렉토리가 이미 존재하면 경고 메시지를 출력하고 중단한다.

### 1단계: Spec 파일 3개 작성

#### `src/$ARGUMENTS/$ARGUMENTS.controller.spec.ts`

- `Test.createTestingModule()`에서 Service를 `jest.fn()`으로 mock
  ```
  useValue: { create: jest.fn(), findMany: jest.fn(), find: jest.fn(), delete: jest.fn() }
  ```
- 테스트 케이스 4개:
  - `create`: dto를 인자로 service.create가 호출되는지, 반환값이 service 결과와 동일한지 확인
  - `findMany`: service.findMany가 호출되는지, 반환값이 service 결과와 동일한지 확인
  - `find`: id `'1'`을 인자로 service.find가 호출되는지 확인
  - `delete`: id `'1'`을 인자로 service.delete가 호출되는지 확인

#### `src/$ARGUMENTS/$ARGUMENTS.service.spec.ts`

- Repository를 `jest.fn()`으로 mock
  ```
  useValue: { create: jest.fn(), findById: jest.fn(), findMany: jest.fn(), delete: jest.fn() }
  ```
- 공통 픽스처: `const mockEntity = { id: 1n, createdAt: new Date(), updatedAt: new Date() } as any`
- 테스트 케이스 6개:
  - `create`: repository.create(dto)가 호출되고 결과가 `toBeInstanceOf(XxxResponseDto)`인지 확인
  - `find` 정상: repository.findById(1n) 호출, 결과가 ResponseDto 인스턴스인지 확인
  - `find` 예외: repository.findById가 `null` 반환 시 `NotFoundException` throw 확인
  - `findMany`: repository.findMany 호출, 결과가 ResponseDto 배열인지 확인
  - `delete` 정상: repository.findById → repository.delete(1n) 순서로 호출 확인
  - `delete` 예외: repository.findById가 `null` 반환 시 `NotFoundException` throw 확인

#### `src/$ARGUMENTS/$ARGUMENTS.repository.spec.ts`

- 실제 PrismaService 사용 (mock 금지, `PrismaModule` import)
- `beforeAll`: TestingModule 생성
- `afterEach`: 테스트 데이터 정리 (TODO 주석으로 남김 — Prisma 스키마 추가 후 활성화)
  ```typescript
  // afterEach(async () => { await prisma.xxx.deleteMany(); });
  ```
- `afterAll`: `await prisma.$disconnect()`
- 테스트 케이스 4개 (각 CRUD 메서드): `data`는 `{} as any` + `// TODO: 도메인 필드 채울 것` 주석

### 2단계: 테스트 실행 (실패 확인 — RED)

```bash
pnpm test -- src/$ARGUMENTS
```

구현 파일이 없으므로 컴파일 에러가 발생한다. 에러 내용을 확인하고 다음 단계로 진행한다.

### 3단계: 구현 파일 6개 작성

`src/users/` 패턴을 그대로 따른다:

**`src/$ARGUMENTS/$ARGUMENTS.module.ts`**
- Controller, Service, Repository를 providers에 등록
- Service를 exports에 등록

**`src/$ARGUMENTS/$ARGUMENTS.controller.ts`**
- `@Post()`, `@Get()`, `@Get(':id')`, `@Delete(':id')` 핸들러
- DELETE에 `@HttpCode(204)` 명시
- 비즈니스 로직 없이 Service 위임만 담당

**`src/$ARGUMENTS/$ARGUMENTS.service.ts`**
- create, find, findMany, delete 메서드 (모두 async)
- find에서 entity 없으면 `NotFoundException` throw
- entity → ResponseDto 변환은 `XxxResponseDto.fromEntity()` 사용
- BigInt ID 변환: `BigInt(id)`

**`src/$ARGUMENTS/$ARGUMENTS.repository.ts`**
- `create(data: Prisma.XxxCreateInput)` 타입 사용
- findById, findMany, delete — Prisma 표준 메서드 그대로

**`src/$ARGUMENTS/dto/create-{단수}.dto.ts`**
- class-validator 데코레이터 (`@IsString()`, `@IsNotEmpty()` 등)
- `// TODO: 도메인 필드를 추가하고 적절한 검증 데코레이터를 적용하세요` 주석 포함

**`src/$ARGUMENTS/dto/{단수}-response.dto.ts`**
- `id: string`, `createdAt: Date`, `updatedAt: Date` 기본 필드
- `static fromEntity(entity: Xxx): XxxResponseDto` 정적 메서드
- `// TODO: 도메인 필드를 추가하세요` 주석 포함

### 4단계: 테스트 재실행 (통과 확인 — GREEN)

```bash
pnpm test -- src/$ARGUMENTS
```

`controller.spec.ts`와 `service.spec.ts`가 통과해야 한다.
`repository.spec.ts`는 DB 연결 없으면 실패가 정상이다.

### 5단계: 완료 안내

다음 작업이 남아있음을 안내한다:
1. `prisma/schema.prisma`에 Xxx 모델 추가 (id BigInt, createdAt, updatedAt + 도메인 필드)
2. `pnpm prisma:migrate` 실행
3. `src/$ARGUMENTS/dto/` 파일에 실제 도메인 필드 추가
4. `repository.spec.ts`의 TODO 주석 활성화 및 필드 채우기
5. `src/app.module.ts`에 XxxModule import 등록
6. `docker-compose up -d` 후 `pnpm test -- src/$ARGUMENTS` 전체 통과 확인
