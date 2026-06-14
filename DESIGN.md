# 변경 이력 관리 설계

발주서 변경 승인(co-approval) 도메인에서 발주 내용이 바뀌는 이력을 어떻게 저장하고 조회할지 정리한 문서다.

## 1. 선택한 방식

### 개요

발주서 내용이 바뀔 때마다 바뀐 필드만 따로 기록하는 대신, 그 시점의 발주 내용 전체를 새 버전 행으로 통째로 저장한다. 버전마다 `versionNo`(1, 2, 3...)가 붙고, `validFrom`/`validTo`로 "이 내용이 언제부터 언제까지 유효했는지"를 표시한다.

이력은 두 군데에 나눠서 저장한다. 하나는 변경 요청에 담기는 변경분(`change_request.changes`)으로, 누가 무엇을 왜 바꾸려 했는지를 남긴다. 다른 하나는 버전 스냅샷(`purchase_order_version`)으로, 각 시점의 발주 내용 전체를 담아 버전·시점·비교 조회에 쓴다. 변경 요청에는 사람이 바꾸고 싶은 값만 들어가고, 그 요청이 승인되는 순간 현재 스냅샷에 그 값을 적용한 결과가 다음 버전이 된다. 쉽게 말하면 변경 요청은 "이렇게 바꿔달라"는 신청서고, 버전 스냅샷은 승인이 끝나 확정된 결과라고 보면 된다.

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

`current_version`은 발주서가 지금 어느 버전을 가리키는지 들고 있는 값이다. 사실 이 값이 없어도 `purchase_order_version`에서 최신 버전을 찾으면 되지만, 조회할 때마다 그러기는 번거로워서 따로 들고 있는 일종의 캐시 같은 값이다. 실제 내용은 언제나 `purchase_order_version`에 있다.

가장 중요한 건 `purchase_order_version` 테이블이다. `version_no`는 생성 시 1로 시작해 변경이 승인될 때마다 1씩 올라간다. `product_name`·`quantity`·`unit_price`·`delivery_date`·`spec`은 그 버전 시점의 발주 내용 전체이고, `change_request_id`는 이 버전을 만든 변경 요청을 가리킨다(최초 버전 v1은 변경 요청 없이 생기므로 NULL). `valid_from`은 이 버전이 유효해진 시각(inclusive), `valid_to`는 다음 버전이 생기면서 채워지는 종료 시각(exclusive)이다. 지금 유효한 최신 버전만 `valid_to`가 NULL이다.

제약은 세 가지를 뒀다. 먼저 `(purchase_order_id, version_no)`에 복합 유니크(`uq_po_version`)를 걸어 같은 발주서에 같은 버전 번호가 두 번 들어가지 못하게 막는다. 또 이 테이블은 한 번 저장되면 `valid_to`가 채워지는 것 말고는 수정하지 않기 때문에(append-only) `updated_at` 컬럼을 따로 두지 않았다. 마지막으로 유효 구간은 빈틈 없이 이어지도록 해서, 앞 버전의 `valid_to`가 다음 버전의 `valid_from`과 같은 시각이 되게 했다.

```
시간축 ──────────────────────────────────────────────────────►
        │ v1                │ v2                │ v3 (현재)
valid:  [vf1 ─────────── vt1)[vf2 ─────────── vt2)[vf3 ──── NULL
        ↑                    ↑                    ↑
        발주서 생성           1차 변경 승인          2차 변경 승인
```

### 동작 방식

**변경 승인 시 저장.** 변경 요청이 승인되면 `applyApproval`(`change-requests.repository.ts`)이 네 가지 작업을 하나의 트랜잭션으로 처리한다. 먼저 `status = PENDING`인 요청만 골라 `APPROVED`로 바꾸는데, 이때 바뀐 행이 0건이면 누군가 이미 처리한 요청이라고 보고 `ConflictException`을 던져 롤백한다(같은 요청을 동시에 승인하는 경우를 막기 위해서다). 그다음 지금까지 유효하던 버전의 `valid_to`를 승인 시각으로 채워 마감하고, 현재 스냅샷에 변경분을 적용한 결과를 `version_no + 1` 행으로 insert한다. 마지막으로 발주서의 `current_version` 값을 새 번호로 바꾼다.

변경분을 적용하는 부분은 서비스의 `applyChanges`가 맡는다. 현재 버전을 그대로 복사한 다음, `changes`에 들어온 필드의 `new` 값만 덮어쓴다. `changes`에 없는 필드는 이전 값을 그대로 유지하고, 모르는 키가 들어오면 무시한다.

**특정 시점 조회.** `GET /purchase-orders/:id/snapshot?at=YYYY-MM-DD`. 받은 날짜를 KST 자정 시각으로 바꾼 다음, 그 시각을 품는 유효 구간의 버전을 쿼리 한 번으로 찾는다(`findVersionAt`).

```sql
WHERE purchase_order_id = :id
  AND valid_from <= :at
  AND (valid_to > :at OR valid_to IS NULL)
```

`valid_from`은 포함(inclusive), `valid_to`는 제외(exclusive)로 잡아서 구간 경계가 겹치지 않기 때문에 어떤 시점을 넣어도 버전 하나만 걸린다. 버전 번호를 직접 지정해서 조회하는 `GET /:id/versions/:versionNo`도 따로 있다.

**변경 비교.** `GET /purchase-orders/:id/diff?from=1&to=2`. 두 버전의 스냅샷을 각각 불러와 필드별로 비교한다(`PurchaseOrderVersionDiffResponseDto.fromVersions`). 값이 달라진 필드만 `{ field, old, new }` 형태로 모으고, 다 같으면 빈 배열을 반환한다. 타입마다 비교 방식이 조금씩 달라서, `unit_price`(Decimal)는 `toString()`으로, `spec`(JSON)은 `JSON.stringify`로 문자열로 바꿔 비교하고, `delivery_date`는 시각으로 비교한다. 각 버전이 내용을 통째로 갖고 있어서 굳이 연속된 버전이 아니어도 바로 비교할 수 있다.

## 2. 의사결정 과정

### 고려했던 대안들

처음엔 변경분만 저장하는 방식을 생각했다(대안 A, 이벤트 소싱과 비슷한 방식). 변경 요청의 `changes`만 시간순으로 쌓아두고, 발주 내용은 v1에서 시작해 변경분을 순서대로 적용해서 계산한다. 저장 공간이 적게 들고 "무엇이 바뀌었나"가 자연스럽게 남는 점은 좋다. 그런데 시점이나 버전을 조회할 때마다 변경분을 처음부터 다시 적용해야 해서 버전이 많아질수록 조회가 느려지고, 예전에 저장한 `changes`의 형식이 한 번이라도 바뀌면 적용 로직이 꼬이기 쉽다.

다른 방법으로는, 발주 내용을 한 행에서 계속 덮어쓰고 변경 사실만 별도 로그(감사 로그)에 남기는 방식이 있다(대안 B). 현재 값을 조회하는 건 이게 제일 단순하고 빠르다. 하지만 과거의 발주 내용 전체를 다시 복원하기가 어렵다. 감사 로그는 보통 바뀐 부분만 기록하기 때문에 "그 시점의 전체 스냅샷"이나 "두 버전 비교" 같은 요구사항을 바로 만족시키기 어렵다.

최종적으로는 변경이 승인될 때마다 발주 내용 전체를 새 행으로 저장하고 `validFrom`/`validTo`로 유효 구간을 표시하는 방식을 골랐다(대안 C). 버전 조회나 시점 조회가 쿼리 한 번으로 끝나고, 두 버전 비교도 단순하다. 과거 행을 수정하지 않아서 이력이 꼬일 걱정도 적다. 단점이라면 바뀐 값이 하나뿐이어도 행 전체를 복사해서 저장한다는 정도다.

### 최종 선택 이유

우선 발주서 한 건에 들어가는 필드가 몇 개 안 되고(상품명·수량·단가·납기·사양), 변경도 "승인된 요청"이 있을 때만 일어나서 그렇게 자주 생기지 않는다. 그래서 행 전체를 복사하는 게 부담이 될 만한 상황이 거의 없고, 대안 C의 단점이 이 도메인에서는 크게 문제가 되지 않는다고 판단했다.

그리고 이번 과제에서 제일 중요한 기능이 "특정 시점 조회"와 "두 버전 비교"인데, 변경분만 저장하는 방식(대안 A)은 하필 이 두 부분에서 조회가 복잡해진다. 스냅샷 방식은 둘 다 단순 조회로 끝나서 요구사항에 잘 맞는다고 판단했다.

구현 부담도 크게 늘지 않는다. "무엇을 바꿨는가"는 변경 요청을 처리하려면 어차피 필요한 정보라 `change_request.changes`에 남겨야 한다. 거기에 스냅샷 테이블 하나만 더 두면 변경 요청(승인 흐름)과 버전 스냅샷(조회)을 각각 담당하게 나눌 수 있다. 대안 A와 B의 장점을 적당히 섞은 방식이다. 추가로 스냅샷을 수정하지 않고 쌓기만 하고, 승인 과정을 트랜잭션으로 묶어둬서 과거 이력이 나중에 바뀔 일이 없다는 점도 괜찮다고 생각했다.

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
