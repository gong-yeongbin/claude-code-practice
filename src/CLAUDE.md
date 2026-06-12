# 코드 작성 지침

## 아키텍처

레이어드 구조: **Controller → Service → Repository**. 비즈니스 로직은 Service에, Controller는 HTTP 처리만 담당한다.

### Controller

- 모든 핸들러는 `async`로 선언하고 `Promise<T>` 반환
- `@Controller('리소스명')`으로 기본 경로 설정
- HTTP 메서드 데코레이터(`@Get`, `@Post`, `@Delete` 등)와 `@Param`, `@Body` 사용
- 기본 상태 코드와 다를 경우 `@HttpCode()`로 명시 (예: DELETE → 204)
- 비즈니스 로직 없이 Service 호출 후 결과 반환만 담당
- 요청/응답은 DTO로 타입 명시

### Service

- 모든 메서드는 `async`로 선언
- `@Injectable()` 적용
- 데이터 접근은 Repository에 위임, 직접 Prisma 사용 금지
- 리소스 존재 여부 확인 후 없으면 `NotFoundException` 던지기
- 엔티티를 ResponseDto로 변환할 때 `ResponseDto.fromEntity()` 정적 메서드 사용
- ID는 number다. `@Param('id')`로 받은 문자열은 `Number(id)`로 변환 후 Repository에 전달

### Repository

- 모든 메서드는 `async`로 선언
- `@Injectable()` 적용
- 생성자에서 `PrismaService` 주입
- Prisma 표준 메서드(`create`, `findUnique`, `findMany`, `update`, `delete`) 직접 사용
- 단건 조회는 `T | null` 반환 (null 처리는 Service 책임)
- Prisma 생성 타입(`User`, `UserRole` 등)을 그대로 사용

### 응답 구조

모든 HTTP 응답은 `src/common`의 전역 인터셉터·예외 필터를 거쳐 `ApiResponse<T>` 구조로 통일된다(`src/common/dto/api-response.dto.ts`). Controller/Service는 래핑을 신경 쓰지 않고 DTO나 예외만 반환·발생시킨다.

- 성공 응답은 `TransformInterceptor`가 `{ success: true, statusCode, message, data, timestamp, path }`로 감싼다. Controller는 ResponseDto를 그대로 반환한다.
- 에러 응답은 `AllExceptionsFilter`가 `{ success: false, statusCode, message, error, timestamp, path }`로 감싼다. Service는 `NotFoundException` 등 `HttpException`만 던지면 된다.
- DELETE처럼 204를 반환하는 핸들러는 인터셉터가 래핑하지 않고 빈 body를 유지한다.
- 성공 메시지를 바꾸려면 핸들러에 `@ResponseMessage('메시지')`를 붙인다(`src/common/decorators/response-message.decorator.ts`). 미지정 시 `'OK'`.
- 응답 래퍼는 전역 등록(`main.ts`)으로 동작하므로 새 Controller를 추가해도 별도 작업이 필요 없다.

### 테스트

- 테스트 파일은 대상 파일과 같은 디렉토리에 `*.spec.ts`로 작성
- `describe`는 클래스명, 중첩 `describe`는 메서드명으로 구성
- Service 테스트: Repository를 `jest.fn()`으로 mock하고 비즈니스 로직만 검증
- Controller 테스트: Service를 `jest.fn()`으로 mock하고 HTTP 핸들러만 검증
- Repository 테스트: E2E 또는 실제 DB 연결로 검증 (mock 금지)
- 정상 케이스와 예외 케이스(예: `NotFoundException`) 모두 작성
