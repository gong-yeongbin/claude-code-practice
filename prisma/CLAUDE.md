# Prisma 스키마 지침

발주서 변경 승인(co-approval) 도메인의 데이터 모델. 이 문서는 `schema.prisma` 전체를 읽지 않고도 모델 구조와 컨벤션을 파악하기 위한 요약이다. 스키마를 수정하면 이 문서도 함께 갱신한다.

## 클라이언트 생성 설정

- 클라이언트 출력 경로는 기본값이 아닌 `generated/prisma` (`output = "../generated/prisma"`). import는 `generated/prisma`에서 한다.
- 스키마 변경 후 반드시 `pnpm prisma:generate` 실행.
- CLI는 `prisma.config.ts`를 사용한다. 자동 인식되지 않으면 `--config prisma.config.ts`를 명시한다.
- migration은 명령 시에만 실행한다. 모델 추가 시 기본은 generate까지만.

## 도메인 모델 개요

발주서를 생성하고, 확정 후 변경 요청을 올리면 소싱팀이 승인/반려하며, 승인 시 새 버전 스냅샷이 쌓이는 워크플로우.

| 모델 | 테이블(`@@map`) | 역할 |
|------|----------------|------|
| `User` | `users` | 시스템 사용자. 역할(BUYER/SOURCING/MANUFACTURER)로 구분 |
| `PurchaseOrder` | `purchase_order` | 발주서 메타정보·워크플로우 상태. 변경 내용은 버전 테이블에 저장 |
| `ChangeRequest` | `change_request` | 확정된 발주서에 올린 변경 요청. 소싱팀이 승인/반려 |
| `PurchaseOrderVersion` | `purchase_order_version` | 발주서 내용의 버전별 전체 스냅샷(append-only) |

### enum

| enum | 타입(`@@map`) | 값 |
|------|--------------|-----|
| `UserRole` | `user_role` | `BUYER` / `SOURCING` / `MANUFACTURER` |
| `OrderStatus` | `order_status` | `DRAFT` → `PENDING` → `CONFIRMED` → `IN_PRODUCTION` → `COMPLETED` |
| `ChangeRequestStatus` | `change_request_status` | `PENDING` / `APPROVED` / `REJECTED` |

`OrderStatus`는 `CONFIRMED` 이상부터 변경 요청이 가능하다.

## 관계 구조

```
User ──< PurchaseOrder        (buyer: 발주서 생성자)
User ──< ChangeRequest        (requester: 변경 요청자, NOT NULL / @relation "ChangeRequester")
User ──< ChangeRequest        (reviewer: 검토 소싱팀, NULL 허용 / @relation "ChangeReviewer")
PurchaseOrder ──< ChangeRequest
PurchaseOrder ──< PurchaseOrderVersion
ChangeRequest ──< PurchaseOrderVersion   (이 변경요청이 만든 버전, NULL 허용 — v1은 NULL)
```

- `User`는 `ChangeRequest`를 **두 경로**(requester/reviewer)로 참조한다. Prisma는 같은 모델로의 다중 관계에 `@relation` 이름이 필수이므로 `"ChangeRequester"` / `"ChangeReviewer"`로 구분하고, `User`에 역방향 필드 `requestedChanges` / `reviewedChanges`를 둔다.
- `PurchaseOrder.currentVersion`은 최신 유효 버전 번호를 가리키는 비정규화 포인터. 실제 스냅샷은 `PurchaseOrderVersion`에 있다.
- `PurchaseOrderVersion`은 `(purchaseOrderId, versionNo)` 복합 유니크(`@@unique(..., map: "uq_po_version")`). `validFrom`(inclusive)/`validTo`(exclusive, 현재 버전은 NULL)로 시점 조회를 한다.

## 컨벤션 (새 모델 추가 시 준수)

- **id** — `BigInt @id @default(autoincrement())`. PK/FK는 항상 `BigInt`.
- **타임스탬프** — `createdAt`/`updatedAt`은 `DateTime @db.Timestamptz @map("created_at"/"updated_at")`. `createdAt`은 `@default(now())`, `updatedAt`은 `@updatedAt`.
  - 예외: 불변(append-only) 스냅샷 테이블은 `updatedAt`을 두지 않는다. `PurchaseOrderVersion`이 그 예로, `createdAt`만 가진다. DDL에 `updated_at`이 없으면 임의로 추가하지 말 것.
- **네이밍** — 필드명은 camelCase, DB 컬럼은 snake_case `@map`. 테이블명은 snake_case `@@map`(이 스키마는 복수형/단수형이 혼재 — DDL 원본을 따른다).
- **doc comment** — 모델 위와 비자명한 필드 위에 한국어 `///` 주석.
- **PostgreSQL 타입 매핑**
  - 짧은 문자열: `String @db.VarChar(n)` — 길이 제한이 필요하면 반드시 `@db.VarChar`.
  - 긴 텍스트: `String @db.Text`.
  - 정수: `Int`(4B) / `BigInt`(8B, PK·FK).
  - 금액·소수: `Decimal @db.Decimal(p, s)`. **`Float` 금지**(부동소수점 오차).
  - 날짜+시간: `DateTime @db.Timestamptz`. **`@db.Timestamp`(시간대 없음) 금지**.
  - 날짜만: `DateTime @db.Date`.
  - JSON: `Json @db.JsonB`. **`@db.Json`(텍스트 저장) 금지**.
  - UUID: `String @db.Uuid @default(dbgenerated("gen_random_uuid()"))`.
  - Boolean: `Boolean`(별도 `@db` 불필요).
- **관계** — FK가 있으면 양쪽 모델에 관계 필드를 모두 추가한다.
- **enum** — `@@map`으로 DB 타입명을 snake_case로 매핑한다.

## Prisma로 표현 불가능한 제약

`schema.prisma`는 일부 DDL 제약을 담지 못한다. DB에 필요하면 migration SQL에 수동으로 넣거나 애플리케이션 레이어에서 검증한다.

- `change_request.chk_changes_not_empty` — `changes` JSONB가 빈 객체가 아니어야 한다는 `CHECK` 제약. 스키마에 미반영. Service/DTO 검증으로 처리.
