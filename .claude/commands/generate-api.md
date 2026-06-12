반드시 2개의 인자를 받는다.

- **첫 번째 인자** (필수): 모듈명. 복수 소문자 (예: `orders`)
- **두 번째 인자** (필수): 작업 설명. 신규 생성이면 `"신규"`, 수정이면 기능 설명 (예: `"주문 상태를 변경하는 PATCH 엔드포인트 추가"`)

인자가 1개만 전달되면 두 번째 인자를 요청한 뒤 진행한다.

## 사전 준비

`src/users/` 디렉토리의 모든 파일을 읽어 패턴을 파악한 뒤 작업을 시작한다.

## 명명 규칙

첫 번째 인자는 복수 소문자로 입력된다 (예: `orders`).

| 용도 | 규칙 | 예시 (orders 기준) |
|------|------|-------------------|
| 디렉토리/파일명 | 그대로 | `orders/`, `orders.controller.ts` |
| Class 접두사 | PascalCase | `OrdersController`, `OrdersService` |
| Entity 명 | 끝 `s` 제거 + PascalCase | `Order` |
| 변수명 | camelCase | `ordersService`, `ordersRepository` |
| Prisma 접근자 | 단수 camelCase | `prisma.order` |

## 실행 순서

### 0단계: 모드 결정

`src/<첫 번째 인자>/` 디렉토리 존재 여부로 모드를 결정한다.

**신규 생성 모드** (디렉토리 없음, 두 번째 인자 = `"신규"`): 1단계부터 순서대로 진행한다.

**수정 모드** (디렉토리 있음):
1. `src/<첫 번째 인자>/` 하위 파일 목록을 출력한다.
2. 두 번째 인자를 기능 요구사항으로 간주해 영향받는 파일(controller, service, repository, dto, spec)을 파악하고 변경 범위를 안내한다.
3. 확인 후 해당 파일만 수정한다. spec 파일도 함께 갱신한다.
4. `pnpm test -- src/<첫 번째 인자> --coverage`를 실행해 기존 테스트가 깨지지 않는지 확인한다.

### 0.5단계: 엔드포인트 범위 도출 (필수)

**이 스킬은 CRUD 골격을 자동으로 만들지 않는다. 두 번째 인자에서 도출한 엔드포인트만 만든다.**

두 번째 인자를 분석해 실제로 필요한 엔드포인트 집합을 도출한다.

- 설명에 특정 동작이 명시되면 그것만 만든다. 예를 들어 "생성하는 엔드포인트"면 `@Post()` 하나만, "주문 상태를 변경하는 PATCH"면 `@Patch(':id')` 하나만 만든다.
- 명시되지 않은 엔드포인트(조회·삭제 등)는 **임의로 추가하지 않는다.** "패턴 유지", "골격 완성"을 이유로 요청 범위를 넘기지 않는다.
- 두 번째 인자가 `"신규"`처럼 엔드포인트를 특정하지 않으면, 코딩을 시작하기 전에 `AskUserQuestion`으로 어떤 엔드포인트가 필요한지 물어본다. 추측해서 CRUD 전체를 만들지 않는다.

도출한 엔드포인트 목록을 사용자에게 한 줄로 안내한 뒤 1단계로 진행한다. 이후 모든 단계(spec, 구현, http)는 **이 목록에 있는 엔드포인트에 한정**해 작성한다.

### 1단계: Spec 파일 3개 작성

**커버리지 목표: statements/branches/functions/lines 모두 90% 이상.**
4단계에서 `--coverage`로 측정하며, 미달 시 테스트를 보강한 뒤 재실행한다.

spec은 **0.5단계에서 도출한 엔드포인트에 한정**해 작성한다. 도출되지 않은 메서드의 테스트는 작성하지 않는다.

테스트 케이스를 작성하기 전에 두 번째 인자를 분석해 다음을 파악한다.
- 추가/수정되는 메서드 목록과 시그니처
- 각 메서드의 정상 경로와 예외 경로 (예: 존재하지 않는 리소스, 유효하지 않은 입력 등)
- 관련 DTO 필드와 검증 규칙

파악한 내용을 바탕으로 **모든 분기를 커버하는** 테스트 케이스를 직접 설계해 작성한다. 추가 분기가 도출되면 케이스를 더 추가한다.

#### `src/$ARGUMENTS/$ARGUMENTS.controller.spec.ts`

- `Test.createTestingModule()`에서 Service를 `jest.fn()`으로 mock
- 파악한 엔드포인트별로 정상/예외 경로를 각각 케이스로 작성한다.
  - 정상: 올바른 인자로 service 메서드가 호출되는지, 반환값이 service 결과와 동일한지 확인
  - 예외: service가 예외를 throw하면 컨트롤러가 그대로 전파하는지 확인

#### `src/$ARGUMENTS/$ARGUMENTS.service.spec.ts`

- Repository를 `jest.fn()`으로 mock
- 공통 픽스처: `const mockEntity = { id: 1, createdAt: new Date(), updatedAt: new Date() } as any`
- 파악한 서비스 메서드별로 정상/예외 경로를 각각 케이스로 작성한다.
  - 정상: repository 메서드 호출 순서와 반환값(ResponseDto 변환 포함) 확인
  - 예외: repository가 `null` 반환 시 적절한 예외(`NotFoundException` 등) throw 확인
  - 경계값: 빈 배열, 단일 항목 등 엣지 케이스 포함

#### `src/$ARGUMENTS/$ARGUMENTS.repository.spec.ts`

- 실제 PrismaService 사용 (mock 금지, `PrismaModule` import)
- `beforeAll`: TestingModule 생성
- `afterEach`: 테스트 데이터 정리 (TODO 주석으로 남김 — Prisma 스키마 추가 후 활성화)
  ```typescript
  // afterEach(async () => { await prisma.xxx.deleteMany(); });
  ```
- `afterAll`: `await prisma.$disconnect()`
- 파악한 repository 메서드별로 정상/예외 경로를 케이스로 작성한다.
  - 정상: 실제 DB 조작 결과 확인
  - 없음/경계: 존재하지 않는 id 조회 시 `null` 반환, 빈 테이블 조회 등
  - `data`의 도메인 필드는 `{} as any` + `// TODO: 도메인 필드 채울 것` 주석

### 2단계: 테스트 실행 (실패 확인 — RED)

```bash
pnpm test -- src/$ARGUMENTS
```

구현 파일이 없으므로 컴파일 에러가 발생한다. 에러 내용을 확인하고 다음 단계로 진행한다.

### 3단계: 구현 파일 작성

`src/users/` 패턴을 그대로 따른다.

**`src/$ARGUMENTS/$ARGUMENTS.module.ts`**
- Controller, Service, Repository를 providers에 등록
- Service를 exports에 등록

**`src/$ARGUMENTS/$ARGUMENTS.controller.ts`**
- **0.5단계에서 도출한 엔드포인트의 핸들러만** 작성한다. 도출되지 않은 핸들러는 만들지 않는다.
- 참고용 핸들러 시그니처. 생성 `@Post()`, 전체 조회 `@Get()`, 단건 조회 `@Get(':id')`, 삭제 `@Delete(':id')`.
- DELETE를 만드는 경우에만 `@HttpCode(204)`를 명시한다.
- 비즈니스 로직 없이 Service 위임만 담당

**`src/$ARGUMENTS/$ARGUMENTS.service.ts`**
- **도출한 엔드포인트가 호출하는 메서드만** 작성한다 (모두 async). 예를 들어 생성만 도출됐으면 `create`만 만든다.
- find 계열을 만드는 경우 entity 없으면 `NotFoundException` throw
- entity → ResponseDto 변환은 `XxxResponseDto.fromEntity()` 사용
- id는 number다. `@Param('id')`로 받은 문자열은 `Number(id)` 또는 `ParseIntPipe`로 변환한다.

**`src/$ARGUMENTS/$ARGUMENTS.repository.ts`**
- **Service가 실제로 호출하는 메서드만** 작성한다. 사용하지 않는 메서드는 만들지 않는다.
- 생성 `create(data: Prisma.XxxCreateInput)`, 단건 조회 `findById`, 전체 조회 `findMany`, 삭제 `delete` — Prisma 표준 메서드 그대로

**`src/$ARGUMENTS/dto/create-{단수}.dto.ts`**
- 두 번째 인자에서 파악한 도메인 필드를 실제로 작성한다.
- 각 필드에 적절한 class-validator 데코레이터를 적용한다.
- 도메인 필드를 파악하기 어려우면 `// TODO: 도메인 필드를 추가하고 적절한 검증 데코레이터를 적용하세요` 주석만 남긴다.

**`src/$ARGUMENTS/dto/{단수}-response.dto.ts`**
- `id: number`, `createdAt: Date`, `updatedAt: Date` 기본 필드
- 두 번째 인자에서 파악한 도메인 필드를 실제로 작성한다.
- `static fromEntity(entity: Xxx): XxxResponseDto` 정적 메서드에서 도메인 필드도 매핑한다.
- 도메인 필드를 파악하기 어려우면 `// TODO: 도메인 필드를 추가하세요` 주석만 남긴다.

### 4단계: 테스트 재실행 (통과 + 커버리지 확인 — GREEN)

```bash
pnpm test -- src/$ARGUMENTS --coverage
```

통과 기준.
- `controller.spec.ts`와 `service.spec.ts`가 모두 통과해야 한다.
- `repository.spec.ts`는 DB 연결 없으면 실패가 정상이다.
- statements/branches/functions/lines 커버리지가 **모두 90% 이상**이어야 한다.
- 미달 항목이 있으면 해당 분기를 커버하는 테스트를 추가하고 재실행한다.

### 5단계: 완료 안내

다음 작업이 남아있음을 안내한다.
- `src/app.module.ts`에 XxxModule import 등록

등록이 완료되면 `http/$ARGUMENTS.http`를 생성한다. `http/CLAUDE.md`의 패턴을 따른다.
- 첫 줄에 해당 리소스의 역할을 설명하는 한 줄짜리 한국어 주석을 단다.
- **컨트롤러에 실제로 만든 엔드포인트만** `###` 요청으로 작성한다. 만들지 않은 엔드포인트의 요청은 넣지 않는다.
- 전체 조회와 단건 조회·삭제를 모두 만든 경우에만, 전체 조회에서 응답 핸들러 스크립트로 첫 항목 id를 전역 변수에 저장하고 단건 조회·삭제에서 그 변수를 참조한다.
- 응답 본문 참조 시 `data` 래핑을 고려한다 (목록은 `data[0].id`, 단건은 `data.id`).
- 생성 요청 본문에는 DTO 도메인 필드를 채운다. 파악이 어려우면 `// TODO` 주석으로 남긴다.

모든 작업이 완료되면 `generate-commit-message` 스킬을 호출해 커밋 메시지를 생성한다.
