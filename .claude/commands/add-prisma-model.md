`$ARGUMENTS`로 전달된 SQL DDL을 해석해 `prisma/schema.prisma`에 새 model을 추가하고 Prisma 클라이언트를 재생성한다.

## 입력 형식

`$ARGUMENTS`에 SQL DDL을 그대로 붙여넣는다.

```sql
CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  total_amount NUMERIC(12, 2) NOT NULL,
  status VARCHAR(20) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

DDL이 없으면 사용자에게 DDL을 요청한 뒤 진행한다.

## DDL → Prisma 타입 변환 규칙

| SQL 타입 | Prisma 타입 |
|----------|------------|
| `BIGSERIAL` / `BIGINT` | `BigInt` |
| `INT` / `SERIAL` | `Int` |
| `VARCHAR(n)` | `String @db.VarChar(n)` |
| `TEXT` | `String @db.Text` |
| `NUMERIC(p,s)` / `DECIMAL(p,s)` | `Decimal @db.Decimal(p, s)` |
| `TIMESTAMPTZ` | `DateTime @db.Timestamptz` |
| `DATE` | `DateTime @db.Date` |
| `BOOLEAN` | `Boolean` |
| `UUID` | `String @db.Uuid` |
| `JSONB` | `Json @db.JsonB` |
| `NOT NULL` 없음 | 필드명 뒤에 `?` |
| `DEFAULT now()` | `@default(now())` |
| `DEFAULT gen_random_uuid()` | `@default(dbgenerated("gen_random_uuid()"))` |
| `REFERENCES table(id)` | 관계 필드 + `@relation` 추가 |

## 실행 순서

1. `prisma/schema.prisma`를 읽어 기존 컨벤션(필드 순서, 매핑 규칙, 타입 사용 패턴)을 파악한다.
2. `src/CLAUDE.md`를 읽어 NestJS 모듈 컨벤션을 파악한다.
3. DDL을 파싱해 테이블명, 컬럼 목록, 제약 조건, 외래 키를 추출한다.
4. 기존 schema의 컨벤션을 따라 model 블록을 작성한다.
   - `id`는 `BigInt @id @default(autoincrement())`
   - `createdAt`/`updatedAt`은 항상 포함 (`@db.Timestamptz @map("created_at/updated_at")`)
   - 테이블명은 snake_case 복수형 `@@map`
   - 필드명은 camelCase, DB 컬럼명은 snake_case `@map` 적용
   - 한국어 `///` doc comment를 model 위에 작성
   - **PostgreSQL 타입 매핑 규칙 (반드시 준수)**
     - 짧은 문자열(이름, 코드 등): `String @db.VarChar(n)` — n은 도메인에 맞게 지정
     - 긴 텍스트(설명, 메모 등): `String @db.Text`
     - 정수: `Int` (4바이트) 또는 `BigInt` (8바이트, PK/FK에 사용)
     - 소수/금액: `Decimal @db.Decimal(precision, scale)` — Float/Float는 사용 금지
     - 날짜+시간: `DateTime @db.Timestamptz` — 시간대 정보를 포함하는 `timestamptz` 사용. `@db.Timestamp`(시간대 없음)는 사용 금지
     - 날짜만: `DateTime @db.Date`
     - UUID: `String @db.Uuid @default(dbgenerated("gen_random_uuid()"))`
     - JSON: `Json @db.JsonB` — `@db.Json`(텍스트 저장)은 사용 금지
     - Boolean: `Boolean` (별도 `@db` 불필요)
5. model 블록을 `schema.prisma` 파일 끝에 추가한다.
6. `pnpm prisma:generate`를 실행해 클라이언트를 재생성한다.
7. 성공하면 추가된 model 블록을 사용자에게 보여준다.

## 컨벤션 참고

기존 User model 예시.

```prisma
/// 시스템 사용자. 역할에 따라 주문자/소싱팀/생산자로 구분
model User {
  id        BigInt   @id @default(autoincrement())
  name      String   @db.VarChar(100)
  role      UserRole
  createdAt DateTime @default(now()) @db.Timestamptz @map("created_at")
  updatedAt DateTime @updatedAt @db.Timestamptz @map("updated_at")

  @@map("users")
}
```

## 주의사항

- Migration은 실행하지 않는다. schema 추가 후 generate만 한다.
- enum이 필요하면 model 위에 enum 블록도 함께 추가한다. enum 값은 `@@map`으로 DB 타입명을 snake_case로 매핑한다.
- 관계 필드가 있으면 양쪽 model에 모두 추가한다.
- `@db` 없이 `String`만 쓰면 PostgreSQL의 `text` 타입이 된다. 길이 제한이 필요한 필드에는 반드시 `@db.VarChar(n)`을 붙인다.
- `Float`는 부동소수점 오차가 있으므로 금액 등 정밀도가 필요한 필드에는 절대 사용하지 않는다. `Decimal @db.Decimal(p, s)`를 사용한다.
- 모든 `DateTime` 필드는 `@db.Timestamptz`를 붙여 시간대 정보를 보존한다.
