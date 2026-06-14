# 변경 이력 관리 설계

발주서 변경 승인(co-approval) 도메인에서 발주 내용이 바뀌는 이력을 어떻게 저장하고 조회할지 정리한 문서다.

## 1. 선택한 방식

### 개요

발주서 내용이 바뀔 때마다 바뀐 필드만 따로 기록하는 대신, 그 시점의 발주 내용 전체를 새 버전 행으로 통째로 남긴다. 버전마다 `versionNo`(1, 2, 3...)가 붙고, `validFrom`/`validTo`로 "이 내용이 언제부터 언제까지 유효했는지"를 표시한다. 흔히 스냅샷 버저닝, 유효시간(valid-time) 테이블이라고 부르는 방식이다.

이력을 다루는 통로가 둘이라는 점이 핵심이다. 하나는 변경 요청에 담기는 델타(`change_request.changes`)로, 누가 무엇을 왜 바꾸려 했는지를 남긴다. 다른 하나는 버전 스냅샷(`purchase_order_version`)으로, 각 시점의 발주 내용 전체를 담아 버전·시점·비교 조회의 원천이 된다. 변경 요청에는 사람이 의도한 변경분만 들어가고, 그 요청이 승인되는 순간 현재 스냅샷에 델타를 적용한 결과가 다음 버전으로 굳는다. 델타는 의사결정 기록, 스냅샷은 확정된 사실인 셈이다.

### 데이터 구조

```
┌──────────────────┐         ┌─────────────────────────┐
│  purchase_order  │ 1     N │     change_request      │
│──────────────────│────────<│─────────────────────────│
│ id (PK)          │         │ id (PK)                 │
│ order_no         │         │ purchase_order_id (FK)  │
│ buyer_id (FK)    │         │ requester_id (FK)       │
│ status           │         │ reason                  │
│ current_version  │──┐      │ changes (JSONB) ← 델타   │
│ ...              │  │      │ status (PENDING/...)    │
└──────────────────┘  │      │ reviewer_id (FK)        │
        │ 1           │      │ review_comment          │
        │             │      │ reviewed_at             │
        │ N           │      └─────────────────────────┘
        │             │                  │ 1
┌───────▼──────────────────────┐         │
│   purchase_order_version     │         │ N
│──────────────────────────────│         │
│ id (PK)                      │<────────┘
│ purchase_order_id (FK)       │  change_request_id (FK, nullable)
│ version_no       ← 1,2,3...  │  · 이 버전을 만든 변경요청
│ product_name                 │  · v1(최초)은 NULL
│ quantity                     │
│ unit_price (Decimal)         │
│ delivery_date (Date)         │
│ spec (JSONB)                 │
│ change_request_id (FK,null)  │
│ valid_from   ← 유효 시작(inc) │
│ valid_to     ← 유효 종료(exc) │  · 현재 버전은 NULL
│ created_at                   │
│ UNIQUE(purchase_order_id,    │
│        version_no)           │
└──────────────────────────────┘
```

`current_version`은 발주서가 지금 어느 버전을 가리키는지 들고 있는 포인터다. 최신 스냅샷을 매번 다시 찾지 않으려고 둔 비정규화 필드일 뿐, 내용의 원천은 언제나 `purchase_order_version`에 있다.

핵심은 `purchase_order_version` 테이블이다. `version_no`는 생성 시 1로 시작해 변경이 승인될 때마다 1씩 올라간다. `product_name`·`quantity`·`unit_price`·`delivery_date`·`spec`은 그 버전 시점의 발주 내용 전체이고, `change_request_id`는 이 버전을 만든 변경 요청을 가리킨다(최초 버전 v1은 변경 요청 없이 생기므로 NULL). `valid_from`은 이 버전이 유효해진 시각(inclusive), `valid_to`는 다음 버전이 생기면서 채워지는 종료 시각(exclusive)이다. 지금 유효한 최신 버전만 `valid_to`가 NULL이다.

제약은 세 가지다. `(purchase_order_id, version_no)`에 복합 유니크(`uq_po_version`)를 걸어 같은 발주서에 같은 버전 번호가 두 번 들어가지 못하게 막는다. 이 테이블은 한 번 쌓이면 `valid_to`가 채워지는 것 말고는 고치지 않는 append-only 테이블이라 `updated_at`을 두지 않았다. 그리고 유효 구간은 빈틈 없이 이어져서 앞 버전의 `valid_to`가 다음 버전의 `valid_from`과 정확히 맞물린다.

```
시간축 ──────────────────────────────────────────────────────►
        │ v1                │ v2                │ v3 (현재)
valid:  [vf1 ─────────── vt1)[vf2 ─────────── vt2)[vf3 ──── NULL
        ↑                    ↑                    ↑
        발주서 생성           1차 변경 승인          2차 변경 승인
```

### 동작 방식

**변경 승인 시 저장.** 변경 요청이 승인되면 `applyApproval`(`change-requests.repository.ts`)이 네 가지를 한 트랜잭션으로 처리한다. 먼저 `status = PENDING`인 요청만 골라 `APPROVED`로 바꾸는데, 이때 매칭이 0건이면 누군가 이미 처리한 것이라 보고 `ConflictException`으로 롤백한다(동시 승인 방지). 그다음 지금까지 유효하던 버전의 `valid_to`를 승인 시각으로 채워 마감하고, 현재 스냅샷에 델타를 적용한 결과를 `version_no + 1` 행으로 insert한다. 마지막으로 발주서의 `current_version` 포인터를 새 번호로 옮긴다.

델타 적용 자체는 서비스의 `applyChanges`가 맡는다. 현재 버전을 베이스로 깔고 `changes`에 들어온 필드의 `new` 값만 덮어쓴 뒤 나머지는 그대로 복사해 다음 스냅샷을 완성한다. 모르는 키는 그냥 무시한다.

**특정 시점 조회.** `GET /purchase-orders/:id/snapshot?at=YYYY-MM-DD`. 받은 날짜를 KST 자정 시각으로 바꾼 다음, 그 시각을 품는 유효 구간의 버전을 쿼리 한 번으로 찾는다(`findVersionAt`).

```sql
WHERE purchase_order_id = :id
  AND valid_from <= :at
  AND (valid_to > :at OR valid_to IS NULL)
```

`valid_from`이 inclusive, `valid_to`가 exclusive라 경계가 겹치지 않으니 어떤 시점을 넣어도 버전 하나만 걸린다. 버전 번호를 직접 찍어 조회하는 `GET /:id/versions/:versionNo`도 있다.

**변경 비교.** `GET /purchase-orders/:id/diff?from=1&to=2`. 두 버전의 스냅샷을 각각 불러와 필드별로 맞대본다(`PurchaseOrderVersionDiffResponseDto.fromVersions`). 달라진 필드만 `{ field, old, new }`로 모으고, 같으면 빈 배열이다. `unit_price`(Decimal)는 `toString()`으로, `spec`(JSON)은 `JSON.stringify`로, `delivery_date`는 시각으로 각각 타입에 맞게 정규화해서 비교한다. 스냅샷을 통째로 들고 있으니 인접하지 않은 버전끼리도 바로 비교할 수 있다.

## 2. 의사결정 과정

### 고려했던 대안들

처음 떠올린 건 변경분만 쌓는 방식이었다(대안 A, 이벤트 소싱에 가깝다). 변경 요청의 `changes`만 시간순으로 남기고, 발주 내용은 v1에서 시작해 델타를 차례로 재생(replay)해 계산한다. 저장 공간이 작고 "무엇이 바뀌었나"가 자연스럽게 남는 게 장점이다. 대신 시점이나 버전을 조회할 때마다 처음부터 델타를 다시 감아야 해서 읽기 비용이 버전 수만큼 늘고, 과거 델타의 형식이 한 번 바뀌면 재생 로직이 통째로 흔들린다.

반대쪽 극단은 본문을 한 행에서 계속 덮어쓰고 변경 사실만 감사 로그로 남기는 방식이다(대안 B). 현재 값 조회가 제일 단순하고 빠르지만, 과거의 완전한 상태를 되살리기가 어렵다. 감사 로그는 보통 변경분만 갖고 있어서 "그 시점 스냅샷"이나 "두 버전 비교" 요구를 직접 만족시키지 못한다.

채택한 건 매 변경마다 전체 스냅샷을 새 행으로 쌓고 `validFrom`/`validTo`로 구간을 표시하는 방식이다(대안 C). 버전·시점 조회가 인덱스 한 번으로 끝나고, 두 버전 비교도 단순해진다. 과거 행을 건드리지 않으니 이력 추적도 안정적이다. 약점은 변경분이 작아도 행 전체를 복제한다는 것 정도다.

### 최종 선택 이유

발주서 한 건의 필드가 몇 개 안 되고(상품명·수량·단가·납기·사양) 변경도 "승인된 요청"으로만 일어나 자주 생기지 않는다. 전체 복제가 부담이 되는 상황 자체가 잘 안 나온다는 뜻이라, 대안 C의 유일한 약점이 이 도메인에서는 거의 드러나지 않는다.

반대로 이번 과제에서 제일 중요한 건 "특정 시점 조회"와 "두 버전 비교"인데, 델타 재생 방식은 하필 이 두 군데에서 비용과 복잡도가 올라간다. 스냅샷 방식은 둘 다 단순 조회로 끝나서 요구사항과 결이 맞다.

구현 품을 따져도 손해가 아니다. "무엇을 바꿨는가"는 변경 요청 처리에 어차피 필요한 정보라 `change_request.changes`에 남길 수밖에 없다. 거기에 스냅샷 테이블 하나만 더 얹으면 델타(감사·승인 흐름)와 스냅샷(조회)을 따로 챙길 수 있다. 사실상 대안 A와 B의 좋은 쪽만 가져온 절충이다. 덤으로 스냅샷이 append-only이고 승인이 트랜잭션으로 묶여 있어서 과거 이력이 나중에 슬쩍 바뀔 여지도 없다.

## 3. 구현 상세

### 핵심 로직

승인이 일어나면 아래 순서가 한 트랜잭션 안에서 돈다.

```ts
// change-requests.repository.ts — applyApproval
return this.prisma.$transaction(async (tx) => {
  // 1. PENDING일 때만 승인으로 선점 (동시 승인 방지)
  const claimed = await tx.changeRequest.updateMany({
    where: { id: input.changeRequestId, status: ChangeRequestStatus.PENDING },
    data: { status: ChangeRequestStatus.APPROVED, /* reviewer, comment, reviewedAt */ },
  });
  if (claimed.count === 0) throw new ConflictException('already processed');

  // 2. 직전 버전 마감 (valid_to 채움)
  await tx.purchaseOrderVersion.updateMany({
    where: { purchaseOrderId: input.purchaseOrderId, validTo: null },
    data: { validTo: input.reviewedAt },
  });

  // 3. 델타 적용된 다음 버전 스냅샷 insert
  await tx.purchaseOrderVersion.create({
    data: { /* nextVersion 필드 전체 */, versionNo: input.nextVersionNo,
            changeRequestId: input.changeRequestId, validFrom: input.reviewedAt },
  });

  // 4. current_version 포인터 이동
  await tx.purchaseOrder.update({
    where: { id: input.purchaseOrderId },
    data: { currentVersion: input.nextVersionNo },
  });
});
```

다음 버전 필드는 현재 스냅샷을 복사한 뒤 들어온 변경분만 덮어써서 만든다.

```ts
// change-requests.service.ts — applyChanges
const next = { /* 현재 버전 전체 복사 */ };
for (const [key, value] of Object.entries(changes)) {
  switch (key) {
    case 'product_name':  next.productName  = String(value.new); break;
    case 'quantity':      next.quantity     = Number(value.new); break;
    case 'unit_price':    next.unitPrice    = String(value.new); break;
    case 'delivery_date': next.deliveryDate = new Date(value.new); break;
    case 'spec':          next.spec         = value.new; break;
    // 그 외 키는 무시
  }
}
```

시점 조회는 유효 구간 조건 하나로 끝난다.

```ts
// purchase-orders.repository.ts — findVersionAt
return this.prisma.purchaseOrderVersion.findFirst({
  where: {
    purchaseOrderId,
    validFrom: { lte: at },
    OR: [{ validTo: { gt: at } }, { validTo: null }],
  },
});
```

### 예외 상황 처리

| 상황 | 처리 |
|------|------|
| 존재하지 않는 발주서 조회 | `NotFoundException` (`PurchaseOrder {id} not found`) |
| 존재하지 않는 버전 번호 조회 | `NotFoundException` (`version {n} not found`) |
| 해당 시점에 유효한 버전이 없음 (발주서 생성 이전 날짜 등) | `NotFoundException` (`has no version at {at}`) |
| 잘못된 날짜 형식 / 존재하지 않는 날짜(예: `2026-02-31`) | `kstStartOfDay`가 `null` 반환 → `BadRequestException` |
| diff의 `from`/`to`가 양의 정수가 아님 | `BadRequestException` |
| 동시 승인 경쟁 (두 검토자가 같은 요청을 동시에 승인) | 트랜잭션 내 `updateMany`로 `PENDING` 선점 → 진 쪽은 0건 매칭 → `ConflictException` 롤백, `version_no` 중복 insert 방지 |
| 동시 변경 요청 생성 (같은 발주서에 PENDING 중복 생성 시도) | `pg_advisory_xact_lock`으로 직렬화 후 PENDING 중복 재확인 → `ConflictException` |
| 데이터 불일치 (`current_version`이 가리키는 버전 행이 없음) | 모호한 크래시 대신 명시적 `Error`를 던져 로그에 정합성 오류로 남긴다 |

## 부록 — 관련 API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/purchase-orders/:id` | 발주서 + 현재 버전 스냅샷 |
| `GET` | `/purchase-orders/:id/versions/:versionNo` | 특정 버전 스냅샷 |
| `GET` | `/purchase-orders/:id/snapshot?at=YYYY-MM-DD` | 특정 시점에 유효했던 버전 |
| `GET` | `/purchase-orders/:id/diff?from=&to=` | 두 버전 간 변경 필드 비교 |
| `GET` | `/purchase-orders/:id/approval-histories` | 승인된 변경 이력(델타) 목록 |
| `POST` | `/purchase-orders/:id/change-requests` | 변경 요청 생성 |
| `PATCH` | `/change-requests/:id` | 변경 요청 승인/반려 |
