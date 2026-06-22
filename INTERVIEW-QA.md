# 면접 예상 질문 + 모범 답변 (코드 위치 표시 포함)

## 목차

1. 도메인 설계 / 이력 관리 (Q1–Q6)
2. 동시성 / 트랜잭션 (Q7–Q13)
3. NestJS 아키텍처 (Q14–Q18)
4. 검증 / 데이터 무결성 (Q19–Q22)
5. 시간대 / 직렬화 (Q23–Q24)
6. 테스트 전략 (Q25–Q26)
7. 확장성 / 한계 (Q27–Q29)
8. 기술 선택 — 왜 Prisma인가 (Q30)
9. Node.js 동작 방식 (Q31)
10. 인증 / 인가 (Q32)
11. Redis Pub/Sub 동작 방식
12. TypeScript란 무엇인가
13. PostgreSQL 데이터베이스의 장점

---

## 1. 도메인 설계 / 이력 관리

### Q1. 이력 저장 방식을 왜 "버전 전체 스냅샷"으로 골랐나요?

세 가지 대안을 비교했습니다. 각각의 저장 방식과 시점 조회·버전 비교 시 동작이 핵심 차이입니다.

> **공통 시나리오** — 아래 세 방식 모두 같은 변경 이력을 가정합니다.
> - **06-01** 발주서 1번 생성 — 볼트, 수량 100, 단가 1000
> - **06-10** 승인된 변경 — 수량 100 → 150
> - **06-15** 승인된 변경 — 단가 1000 → 1200

**(A) 이벤트 소싱 — 도메인 이벤트를 진실의 원천으로**

- **저장** — 발주서의 현재 상태를 직접 저장하지 않고, 발생한 도메인 이벤트(`Created`, `QuantityChanged`, `PriceChanged` …)를 시간 순서대로 append-only로 쌓습니다. 이벤트 로그가 곧 진실의 원천(source of truth)이고, 이벤트는 일어난 사실이라 절대 수정·삭제하지 않습니다.
- **현재 상태 조회** — 현재 발주서 값은 따로 들고 있지 않으므로, 첫 이벤트부터 순서대로 재생(replay)해 상태를 파생(projection)합니다. 보통은 이 결과를 read model로 따로 투영해 두거나, 비용을 줄이려 주기적 스냅샷(checkpoint)을 찍어 가장 가까운 스냅샷부터만 재생합니다.
- **시점 조회** — "그 시점의 발주서 전체 값"은 그 시각까지의 이벤트만 재생하면 자연스럽게 얻어집니다. 다만 버전이 N개면 최대 N개 이벤트를 접어야 하니, 스냅샷 없이는 버전이 늘수록 조회가 느려집니다.
- **취약점** — 이벤트 스키마(이벤트 타입·페이로드 구조)가 한 번이라도 바뀌면, 옛 이벤트를 재생하는 로직이 깨져 과거 전체가 복원 불능이 될 수 있습니다. 재생 로직이 곧 데이터 정합성을 책임지는 구조라, 이벤트 버전 관리(upcasting)·프로젝션·이벤트 버스 같은 인프라가 따라오고 운영 복잡도가 큽니다.

본문 행이 없고 "사건"만 쌓이는 모습 — **purchase_order_event**

| id | po_id | seq | event_type | payload | created_at |
|---|---|---|---|---|---|
| 1 | 1 | 1 | OrderCreated | `{productName:"볼트", quantity:100, unitPrice:"1000.00", deliveryDate:"07-01", spec:{...}}` | 06-01 |
| 2 | 1 | 2 | QuantityChanged | `{from:100, to:150}` | 06-10 |
| 3 | 1 | 3 | PriceChanged | `{from:"1000.00", to:"1200.00"}` | 06-15 |

→ 현재 수량이 얼마인지 들고 있는 행이 없음. seq 순서대로 이벤트를 재생해야 알 수 있음.

이벤트 소싱을 제대로 운영하려면 본문 테이블 하나로 끝나지 않고, 아래 인프라가 따라옵니다. 이게 (C) 스냅샷 대비 복잡도가 커지는 핵심 이유입니다.

- **이벤트 버전 관리(upcasting)** — 이벤트는 영구 보존되는데 시간이 지나면 구조가 바뀝니다. 옛 포맷 이벤트를 재생 시점에 최신 포맷으로 변환하는 **upcaster**와 이벤트별 스키마 버전 저장이 필요합니다. 빠뜨리면 과거 재생이 깨져 (A) 취약점이 현실이 됩니다.
- **프로젝션(read model)** — 이벤트 로그는 쓰기엔 최적이지만 읽기엔 불리합니다. 그래서 이벤트를 구독해 조회 전용 테이블을 따로 갱신해 둡니다. 사실상 (C) 스냅샷이 하던 "현재값 바로 읽기"를 이벤트 소싱 위에 다시 얹는 셈입니다.

  위 이벤트 로그 테이블이 그대로 입력입니다. "1번 발주서 현재 수량"을 물으면 들고 있는 행이 없어 seq=1→2→3을 매번 재생해야 하고(`100 → 150`, 단가 1200), 발주서가 1만 건이면 목록 한 번에 수십만 번 재생이 일어나니 읽기에 불리합니다. 그래서 새 이벤트가 들어올 때마다 프로젝션 핸들러가 구독해 현재값만 담은 조회 전용 테이블을 갱신해 둡니다.

  ```
  이벤트가 들어올 때마다 프로젝션 핸들러가 갱신 →
    OrderCreated    → INSERT (볼트, 100, 1000)
    QuantityChanged → UPDATE quantity  = 150
    PriceChanged    → UPDATE unitPrice = 1200

  프로젝션 (po_read_model) — 현재값만, 재생 없이 한 행 읽기
    po_id | productName | quantity | unitPrice | updated_at
    1     | 볼트         | 150      | 1200      | 06-15
  ```

  이 조회 전용 테이블은 결국 (C) 스냅샷의 현재 버전 행과 모양이 같습니다. (C)가 트랜잭션 안에서 **곧바로** 쓰던 현재값 행을, (A)는 이벤트를 쌓아두고 버스를 거쳐 **나중에** 만들어 두는 셈입니다.

- **이벤트 버스(event bus)** — 새 이벤트를 발행(publish)하면 알림·집계·프로젝션 갱신 같은 핸들러가 구독(subscribe)해 비동기로 처리합니다(위 예시에서 이벤트를 프로젝션 핸들러로 전달하던 바로 그 통로). 대가로 read model이 잠깐 뒤처지는 **최종 일관성**을 감수합니다.

  버스의 핵심은 한 이벤트를 **여러 핸들러가 동시에** 받아 간다는 점입니다. 06-15에 `PriceChanged` 하나가 발행되면 이렇게 갈라집니다.

  ```
  PriceChanged {from:1000, to:1200}  발행(publish)
        │
        ├─→ 프로젝션 핸들러   : po_read_model.unitPrice = 1200 갱신
        ├─→ 알림 핸들러       : 구매 담당자에게 "단가 변경" 메일 발송
        ├─→ 집계 핸들러       : 이달 단가 변동 통계에 +1
        └─→ 외부연동 핸들러   : ERP에 변경 전송
  ```

  발주서를 바꾸는 쪽(쓰기)은 이벤트 하나만 발행하면 끝이고, 후속 처리는 각 핸들러가 알아서 구독해 갑니다. 새 후속 처리가 생겨도 핸들러만 추가하면 되니 쓰기 코드는 안 건드립니다. 다만 이 처리들이 비동기라, 메일이 늦거나 프로젝션 반영이 잠깐 뒤처질 수 있습니다(최종 일관성).

- **CQRS** — 쓰기 모델(Command)과 읽기 모델(Query)을 분리하는 패턴으로, 이벤트 소싱과는 별개 개념입니다. 다만 이벤트 소싱은 읽기를 위해 프로젝션을 두게 되므로 자연히 CQRS 형태가 됩니다(역은 성립하지 않음 — CQRS는 일반 RDB에서도 씀). 쓰기·읽기를 각각 정합성·조회 성능에 최적화할 수 있지만 데이터를 양쪽에 이중으로 들고 가는 복잡도가 듭니다. 반면 (C)는 쓰기·읽기가 `purchase_order_version` 한 테이블을 보는 단일 모델이라 분리가 필요 없습니다.

  위 두 예시를 합치면 쓰기 경로와 읽기 경로가 이렇게 갈립니다. "수량을 150으로 바꿔라"라는 명령과 "1번 발주서 현재 수량은?"이라는 조회가 서로 다른 모델을 탑니다.

  ```
  쓰기(Command)                          읽기(Query)
  "수량 150으로 변경" 명령                 "현재 수량?" 조회
        │                                      │
        ▼                                      ▼
  이벤트 로그에 QuantityChanged append    po_read_model 한 행 읽기 → 150
        │                                      ▲
        └──(이벤트 버스)──→ 프로젝션 핸들러 ────┘ 갱신
  ```

  쓰기는 이벤트 append만, 읽기는 프로젝션 조회만 책임집니다. 그래서 쓰기는 정합성·이벤트 순서에, 읽기는 인덱스·조회 성능에 따로 최적화할 수 있고, 화면마다 다른 read model(예: 목록용·상세용)을 둘 수도 있습니다. 대신 같은 데이터가 이벤트 로그와 프로젝션 양쪽에 이중으로 존재하고, 둘 사이엔 버스를 거치는 지연(최종 일관성)이 낍니다.

→ 정리하면 이벤트 소싱은 단순 "변경분 저장"이 아니라 upcasting·projection·event bus·CQRS까지 갖춰야 제값을 하는 패턴입니다. 반대로 (C) 스냅샷은 쓰기·읽기가 `purchase_order_version` 한 테이블로 모이는 단일 모델이라, 위 인프라(별도 read model·버스·이중화·최종 일관성)가 통째로 필요 없습니다. 필드 5개·저빈도 변경인 이 과제엔 이벤트 소싱이 과해서 (C)를 택했습니다.

**(B) 한 행을 덮어쓰고 감사 로그만 별도 기록**

- **저장** — 발주서 본문은 단 한 행이고, 변경이 승인되면 그 행을 제자리에서 UPDATE합니다. 누가 언제 무엇을 바꿨는지는 별도 audit 로그 테이블에 "변경 사실"로만 남깁니다.
- **현재 값 조회** — 한 행만 읽으면 끝이라 가장 빠릅니다.
- **약점** — audit 로그는 보통 "필드 X를 A→B로 바꿈" 식의 변경 기록이라, 임의 과거 시점의 발주서 전체 스냅샷을 복원하기 어렵습니다. 복원하려면 (A)처럼 로그를 재생해 상태를 재구성해야 합니다. 하지만 본문을 덮어쓰는 구조라 과거 본문 자체가 이미 사라져 있어, "두 버전 비교"도 곧바로 되지 않습니다.

본문은 항상 한 행, 변경되면 UPDATE — **purchase_order** (06-15 시점, 최신값만 남음)

| id | productName | quantity | unitPrice | deliveryDate | spec | updated_at |
|---|---|---|---|---|---|---|
| 1 | 볼트 | 150 | 1200.00 | 07-01 | {...} | 06-15 |

변경 "사실"만 별도 기록 — **audit_log**

| id | po_id | field | old | new | changed_at |
|---|---|---|---|---|---|
| 1 | 1 | quantity | 100 | 150 | 06-10 |
| 2 | 1 | unitPrice | 1000 | 1200 | 06-15 |

→ 06-01, 06-10 시점의 본문 전체 모습은 이미 사라짐. 복원하려면 로그를 역으로 접어야 함.

**(C) 승인 시마다 발주 내용 전체를 새 행으로 저장 — 채택**

- **저장** — 변경이 승인될 때마다 발주 5개 필드(상품명·수량·단가·납기·사양)를 통째로 복사한 새 버전 행을 만듭니다. 각 행은 `versionNo`와 유효 구간 `[validFrom, validTo)`를 갖고, 과거 행은 절대 수정하지 않습니다(append-only). 직전 버전의 `validTo`를 닫고 새 버전의 `validFrom`을 같은 시각으로 여는 식으로 구간이 이어집니다.
- **시점 조회** — `validFrom <= at AND (validTo > at OR validTo IS NULL)` 조건으로 그 시점에 유효했던 행 하나를 단순 쿼리 한 번에 가져옵니다. 재구성·재적용이 없습니다.
- **버전 비교** — 두 `versionNo`의 행을 각각 한 번에 읽어 필드를 맞대면 끝납니다.
- **트레이드오프** — 행 전체를 복사하니 저장 공간은 더 쓰지만(Q2), 시점 조회·버전 비교가 모두 인덱스 한 번으로 끝나고, 과거를 안 건드리니 이력이 사후에 꼬일 일이 없습니다. 이 과제의 핵심 요구사항이 정확히 "특정 시점 조회"와 "두 버전 비교"라, 그 둘이 가장 단순해지는 C를 택했습니다.

메타 + 최신 버전 포인터 — **purchase_order**

| id | status | current_version |
|---|---|---|
| 1 | CONFIRMED | 3 |

버전마다 전체 값 한 벌씩 (과거 행은 수정 안 함) — **purchase_order_version**

| id | po_id | version_no | productName | quantity | unitPrice | deliveryDate | spec | valid_from | valid_to |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 1 | 볼트 | 100 | 1000.00 | 07-01 | {...} | 06-01 | 06-10 |
| 2 | 1 | 2 | 볼트 | 150 | 1000.00 | 07-01 | {...} | 06-10 | 06-15 |
| 3 | 1 | 3 | 볼트 | 150 | 1200.00 | 07-01 | {...} | 06-15 | NULL |

→ 각 행이 그 시점의 완전한 발주서. `valid_to`가 NULL인 행이 현재 버전.

**같은 질문, 세 방식의 처리 비용**

"06-12 시점의 발주서를 보여줘"(수량 150, 단가 1000인 상태)를 물으면 이렇게 갈립니다.

| 방식 | 처리 방법 |
|---|---|
| A 이벤트 소싱 | seq=1,2 이벤트 읽고 코드에서 재생(seq=3은 06-15라 제외) → 상태 조립 |
| B 덮어쓰기 | 본문엔 최신값뿐. 06-15 본문에서 audit_log를 역으로 되감아 복원 |
| C 스냅샷 | `valid_from <= '06-12' < valid_to` 조건으로 version_no=2 행 하나 바로 반환 |

```sql
-- C는 이 한 방으로 끝
SELECT * FROM purchase_order_version
WHERE po_id = 1
  AND valid_from <= '2026-06-12'
  AND (valid_to > '2026-06-12' OR valid_to IS NULL);
-- → version_no=2 행 하나
```

**요약**

| | 저장 | 시점 조회 | 버전 비교 | 위험 |
|---|---|---|---|---|
| A 이벤트 소싱 | 도메인 이벤트 | 처음부터 재생 (느림) | 재생 후 비교 | 이벤트 스키마 바뀌면 복원 불능 |
| B 덮어쓰기 | 한 행 UPDATE | 과거 복원 어려움 | 과거 본문 없음 | 과거 스냅샷 소실 |
| C 스냅샷 | 행 전체 복사 | 쿼리 한 번 | 두 행 비교 | append-only라 안전 |

📍 `prisma/schema.prisma:85-103` — `PurchaseOrderVersion`가 스냅샷 테이블. 5개 발주 필드 + `versionNo` + `[validFrom, validTo)` 유효 구간을 행마다 보유.
📍 시점 조회 한 방 쿼리: `purchase-orders.repository.ts:161-169` (`findVersionAt`). 버전 비교 한 방: `purchase-orders.service.ts:175-203` (`compareVersions`).

### Q2. 스냅샷은 행 전체를 복사해서 저장 공간이 낭비되는데, 문제가 안 된다고 본 근거는?

도메인 특성 때문입니다. 두 가지 근거가 있습니다.

- **행 하나가 작다** — 발주서의 필드는 상품명·수량·단가·납기·사양 5개뿐이라, 한 버전을 통째로 복사해도 차지하는 용량이 미미합니다.
- **변경이 드물다** — 버전은 "승인된 변경 요청"이 있을 때만 늘어나므로, 행 복사가 누적될 상황 자체가 거의 없습니다.

즉 복사 비용도 발생 빈도도 낮아 저장 공간 부담이 쌓일 구조가 아닙니다. 트레이드오프를 인지한 상태에서, 이 도메인에서는 단점이 실질적 문제가 되지 않는다고 판단해 단순함·조회 성능을 택했습니다.

📍 `change-requests.repository.ts:78-90` — 승인 트랜잭션 안에서만 새 버전 행을 create. 즉 행 복사는 "승인" 경로에서만 발생.

### Q3. 필드가 100개로 늘거나 변경이 초당 수천 건 일어나면 이 설계를 유지할 건가요?

유지하지 않습니다. 그 시점이 바로 갈아탈 신호입니다.

행이 비대해지거나 쓰기 빈도가 높아지면, 매 변경마다 행 전체를 복사하는 스냅샷 비용이 무시 못할 수준이 됩니다. 이때는 **(A) 이벤트 소싱 + 주기적 스냅샷(checkpoint) 하이브리드**로 전환합니다.

- N번 변경마다 풀 스냅샷을 한 번 찍고, 그 사이의 변경은 이벤트만 쌓습니다.
- 시점 조회 시에는 가장 가까운 스냅샷에서 출발해 그 뒤 이벤트만 재생하므로, 재구성 비용을 이벤트 수와 무관하게 상수로 제한할 수 있습니다.

처음부터 이렇게 안 한 이유는, 현재 요구사항(필드 5개·드문 변경)에는 명백히 과한 복잡도이기 때문입니다(YAGNI).

📍 현재 적용 로직이 `change-requests.service.ts:81-115` (`applyChanges`)에 격리돼 있어, 하이브리드로 갈아탈 때 이 메서드와 `applyApproval`만 손대면 됨(나머지 조회 경로는 무영향).

### Q4. valid_from은 inclusive, valid_to는 exclusive로 비대칭으로 정한 이유는?

경계 시점의 중복 매칭을 막기 위해서입니다.

인접한 두 버전은 경계 시각을 공유합니다. v1의 `valid_to`와 v2의 `valid_from`이 **같은 시각**이죠. 만약 양쪽 다 inclusive라면, 그 경계 시각을 조회할 때 v1·v2가 **동시에 매칭**되어 `findFirst`가 어느 버전을 줄지 비결정적이 됩니다.

그래서 `[valid_from, valid_to)` 반열림 구간으로 잡았습니다.

- `validFrom`은 inclusive, `validTo`는 exclusive
- 조회 조건: `validFrom <= at AND (validTo > at OR validTo IS NULL)`
- 이렇게 하면 경계 시각은 **새 버전(v2)에만** 속해, 어떤 시점을 넣어도 정확히 한 버전만 반환됩니다.

📍 `purchase-orders.repository.ts:162-168` — `validFrom: { lte: at }`, `OR: [{ validTo: { gt: at } }, { validTo: null }]`. `lte`(inclusive) + `gt`(exclusive)가 정확히 그 비대칭.
📍 경계가 "딱 맞물리게" 쓰이는 곳: `change-requests.repository.ts:73-88` — 직전 버전 `validTo`에 `reviewedAt`을 찍고(line 75), 새 버전 `validFrom`에 같은 `reviewedAt`을 찍음(line 88). 그래서 그 경계 시각은 새 버전에만 속함.

### Q5. current_version 컬럼은 사실상 캐시인데 왜 중복을 뒀고, 불일치 위험은 어떻게 막나요?

**왜 중복을 뒀나 — 조회 성능 때문입니다.** `validTo IS NULL`인 행을 찾으면 최신 버전을 알 수 있어 이론상 `current_version`은 없어도 됩니다. 하지만 발주서 단건 조회처럼 빈번한 경로에서 매번 버전 테이블을 뒤지는 비용을 피하려고, 최신 버전을 가리키는 포인터로 들고 있습니다.

**불일치 위험은 트랜잭션으로 막습니다.** `applyApproval`이 다음 세 작업을 **한 트랜잭션**으로 처리합니다.

1. 직전 버전 `valid_to` 마감
2. 새 버전 insert
3. `current_version` 갱신

셋이 함께 커밋되거나 함께 롤백되므로, 포인터만 갱신되고 버전 행은 안 바뀐 것 같은 **중간 상태가 외부에 노출되지 않습니다.**

📍 컬럼 정의: `prisma/schema.prisma:47` (`currentVersion`).
📍 포인터로 읽는 빈번 경로: `purchase-orders.repository.ts:66-73` (`findById`가 `currentVersion`으로 버전 행을 바로 조회).
📍 세 단계를 한 트랜잭션으로 묶는 곳: `change-requests.repository.ts:58-98` (`applyApproval`) — ① line 73-76, ② line 78-90, ③ line 92-95.

### Q6. 시점 조회를 자정이 아니라 그날의 끝(23:59:59.999)으로 잡은 이유는?

사용자 기대에 맞추기 위해서입니다.

사용자는 날짜(`YYYY-MM-DD`)만 입력하지만, 그날 오후에 승인된 버전도 그 날짜로 조회되길 기대합니다. 그런데 자정(`00:00`) 기준으로 잡으면, 그날 안에 생성·승인된 버전은 `valid_from`이 자정보다 뒤라서 **누락**됩니다.

그래서 `kstEndOfDay`로 그날의 끝 시각(`23:59:59.999`)으로 변환해, **"그 날짜 안에 존재했던 마지막 버전"**이 잡히도록 했습니다.

📍 `common/utils/date-format.ts:13-26` (`kstEndOfDay`) — line 17에서 `T23:59:59.999+09:00`로 그날 끝 시각 생성.
📍 호출부: `purchase-orders.service.ts:164-168` (`findSnapshot`).
⚠️ 참고로 Swagger 설명(`purchase-orders.controller.ts:138`)에는 "KST 자정 기준"이라고 적혀 있어 실제 동작(그날 끝)과 문구가 어긋납니다. 면접에서 지적받기 전에 "문서 문구가 실제 구현과 불일치, 코드가 정답"이라고 먼저 짚으면 좋습니다.

---

## 2. 동시성 / 트랜잭션

### Q7. 동시 승인 시나리오를 어떻게 막나요?

조건부 업데이트로 선점(낙관적 락)합니다. `applyApproval` 트랜잭션 첫 단계에서 `updateMany({ where: { id, status: PENDING }, data: { status: APPROVED, ... } })`를 실행합니다.

두 검토자가 동시에 같은 요청을 승인하려 해도:

- DB가 해당 행에 쓰기 잠금을 잡고 조건을 원자적으로 평가하므로, **한쪽만 1건을 갱신하고 다른 쪽은 0건**이 됩니다.
- `count === 0`이면 이미 처리됐다고 보고 `ConflictException`을 던져 트랜잭션 전체를 롤백합니다.

📍 `change-requests.repository.ts:60-71` — 조건부 `updateMany`(line 60-68) + `if (claimed.count === 0) throw ConflictException`(line 69-71).

> **꼬리질문 대비 — "낙관적 락 말고 다른 방식은? 왜 비관적 락을 안 썼나?"**
>
> 동시성 제어는 크게 두 축입니다. 같은 "변경요청 1번 동시 승인" 상황을 두 방식으로 비교하면:
>
> **① 낙관적 락 (이 코드가 택한 방식)** — "충돌은 드물다"고 가정하고 **일단 시도 → 안 되면 충돌 처리**.
> ```sql
> -- A, B가 동시에 실행
> UPDATE change_request SET status='APPROVED'
> WHERE id=1 AND status='PENDING';
> -- A: 1건 갱신 성공 → 승인 진행
> -- B: 0건 (이미 APPROVED라 조건 불일치) → ConflictException으로 롤백
> ```
> 보통 version 컬럼(`... AND version=3`)으로 구현하는데, 여기선 `status='PENDING'` 조건이 그 역할을 합니다.
>
> **② 비관적 락** — "충돌이 잦다"고 가정하고 **미리 잠금 → 진 쪽은 대기**.
> ```sql
> -- A가 먼저 행을 잠금
> SELECT * FROM change_request WHERE id=1 FOR UPDATE;
> -- B는 같은 행에 FOR UPDATE를 걸고 A가 커밋할 때까지 "블로킹"(대기)
> -- A 커밋 후 B가 깨어나 다시 읽으면 이미 APPROVED → 그때 거절
> ```
> 충돌(에러)이 아니라 **대기**가 발생한다는 점이 ①과 다릅니다.
>
> 그 위에 보조 도구로 **advisory lock**(존재하지 않는 행=phantom 방어, Q9), **격리 수준 상향**(Serializable, Q12), **유니크 제약**(최후 안전망, Q13)이 있습니다.
>
> **비관적 락을 안 쓴 이유**: 승인 충돌은 "같은 발주서를 두 검토자가 같은 순간에 누르는" 드문 경우뿐인데, `FOR UPDATE`는 정상 요청까지 **매번 행을 잠그고 대기 비용을 치릅니다.** 충돌이 드문 도메인에선 조건부 `updateMany` 한 번이 더 가볍고 충분히 안전합니다. 그래서 **낙관적 락(수정) + advisory lock(생성) + 유니크 제약(안전망)** 조합을 택했습니다.

### Q8. findById로 상태 확인 후 update하는 것과 조건부 updateMany의 차이는?

핵심은 **검사와 변경 사이의 틈(TOCTOU 레이스)**입니다.

**① findById 후 update — 틈이 있는 방식**

검사(check)와 변경(act)이 두 개의 분리된 쿼리라, 그 사이에 다른 요청이 끼어듭니다. 검토자 A·B가 변경요청 1번을 동시에 승인하면:

```
시각  검토자 A                      검토자 B
 t1   findById → status=PENDING ✅
 t2                                findById → status=PENDING ✅  (A가 아직 update 전)
 t3   update SET APPROVED          (A, B 둘 다 검사를 통과한 상태)
 t4                                update SET APPROVED
 결과 → 둘 다 승인됨, 버전 2개 생성 ❌
```

`t1~t3` 사이의 틈에서 B가 낡은 PENDING을 읽어버린 게 원인입니다.

**② 조건부 updateMany — 틈을 없앤 방식**

"PENDING인 경우에만 APPROVED로"를 **DB의 단일 원자 연산**으로 합칩니다. 검사와 변경이 한 쿼리라 끼어들 틈이 없습니다.

```
시각  검토자 A                          검토자 B
 t1   UPDATE ... WHERE status=PENDING   UPDATE ... WHERE status=PENDING
      → DB가 행 잠금을 잡고 직렬화
 t2   1건 갱신 성공 ✅                   0건 (이미 APPROVED) → Conflict ❌
 결과 → 한 명만 승인, 버전 1개 ✅
```

**역할 분담**

참고로 Service의 `review`에 있는 `findById` 상태 체크(①과 같은 형태)는 **사용자 친화적 빠른 실패용**일 뿐입니다. 이미 처리된 요청을 대부분의 정상 케이스에서 미리 거르는 용도이고, 동시성 보증은 못 합니다. 실제 정확성은 트랜잭션 내부의 조건부 `updateMany`(②)가 담당합니다.

📍 "빠른 실패용" 사전 체크: `change-requests.service.ts:26-32` (`findById` 후 PENDING 아니면 Conflict).
📍 진짜 동시성 보증: `change-requests.repository.ts:60-71` (트랜잭션 내 조건부 `updateMany`). 둘의 역할 분담이 핵심.

### Q9. 변경 요청 생성 시 pg_advisory_xact_lock을 쓴 이유는? 유니크 제약이나 사전 체크로 부족한가요?

막으려는 건 **"같은 발주서에 PENDING 변경 요청이 동시에 2개 생기는 것"**입니다.

- **사전 체크만으로는 부족**: `existsPendingChangeRequest` 체크만 있으면 두 요청이 동시에 "없음"을 읽고 둘 다 insert하는 레이스가 생깁니다.
- **유니크 제약으로도 막기 어려움**: "PENDING일 때만 유일"이라는 조건부 제약이 필요한데, 일반 유니크로는 표현이 안 됩니다(Postgres의 partial unique index로는 가능하지만 별도 설계가 필요).

그래서 `purchaseOrderId`를 키로 advisory lock을 잡아, 같은 발주서에 대한 생성 요청을 직렬화했습니다.

📍 `purchase-orders.repository.ts:128-149` (`createChangeRequest`) — line 129 `pg_advisory_xact_lock(${purchaseOrderId})`, line 131-139 락 획득 후 PENDING 재확인.

### Q10. Service에서 한 번, 트랜잭션 안에서 또 한 번 — 왜 두 번 체크하나요?

더블 체크드 락킹(double-checked locking) 패턴입니다. 두 체크의 역할이 다릅니다.

- **첫 체크 (Service, 락 밖)**: 정확성 보증이 아니라 **최적화**입니다. 대부분의 정상 요청을 락 비용 없이 빠르게 걸러냅니다.
- **두 번째 체크 (트랜잭션 안, advisory lock 획득 후)**: 정확성을 담당합니다. 락을 잡은 뒤의 체크라야 "검사~insert" 구간이 직렬화되어 신뢰할 수 있습니다.

📍 첫 체크(락 밖, 최적화): `purchase-orders.service.ts:133-135`.
📍 두 번째 체크(락 안, 정확성): `purchase-orders.repository.ts:131-139`. line 129의 락 → line 131 재확인 → line 141 insert 순서가 직렬화 보장.

### Q11. advisory lock 키로 purchaseOrderId를 그대로 넘기는데 다른 도메인과 충돌할 수 있지 않나요?

맞는 지적입니다. 단일 인자 `pg_advisory_xact_lock(bigint)`은 **전역 네임스페이스**라, 다른 도메인이 우연히 같은 정수를 쓰면 불필요하게 경합합니다.

개선하려면 2-인자 버전 `pg_advisory_xact_lock(classid, objid)`을 쓰면 됩니다. 첫 인자에 "변경요청 생성"용 네임스페이스 상수를 넣어 도메인별로 키 공간을 분리하는 방식입니다.

📍 현재 단일 인자 형태: `purchase-orders.repository.ts:129` — `SELECT pg_advisory_xact_lock(${input.purchaseOrderId})`. 여기에 네임스페이스 상수를 첫 인자로 추가하는 게 개선안.

### Q12. applyApproval 트랜잭션의 격리 수준은? advisory lock 없이 Serializable로 같은 보장을 얻을 수 있나요?

격리 수준을 명시하지 않았으므로 Postgres 기본인 **Read Committed**입니다.

- **승인 쪽**은 조건부 `updateMany`의 행 잠금으로 충분해 추가 락이 필요 없습니다.
- **생성 쪽**의 "PENDING 없음" 같은 조건은 존재하지 않는 행(phantom)에 대한 판단이라 Read Committed에서는 막히지 않습니다. 그래서 advisory lock이 필요합니다.

Serializable로 올리면 phantom을 포함한 직렬화 이상을 잡아주지만, 충돌 시 직렬화 실패에 대비한 재시도 로직이 필요하고 트랜잭션 전체 비용이 올라갑니다. **이 한 지점만 직렬화하면 되는 상황**이라, advisory lock이 더 국소적이고 가벼운 선택이었습니다.

📍 격리 수준 미지정 = 기본값: `change-requests.repository.ts:59`와 `purchase-orders.repository.ts:128`의 `$transaction(...)` 호출에 옵션 인자 없음 → Read Committed.
📍 승인은 행 잠금으로 충분: `change-requests.repository.ts:60`(`updateMany`가 기존 행을 잠금). 생성은 phantom이라 행 잠금 불가 → 그래서 line 129 advisory lock.

### Q13. 동시 승인 방어선이 여러 겹인데 각각 무슨 케이스를 막나요?

세 겹입니다.

1. **조건부 `updateMany`(PENDING 선점)**: 같은 요청을 동시에 승인하는 경우를 막습니다.
2. **`(purchase_order_id, version_no)` 복합 유니크**: 어떤 이유로든 같은 버전 번호 insert가 두 번 시도되면 DB가 거부하는 최후의 안전망입니다.
3. **트랜잭션**: ①~insert~포인터 갱신을 원자화합니다.

응용 로직(①)과 DB 제약(②)을 함께 둬서, **코드가 틀려도 데이터 정합성이 깨지지 않도록** 이중으로 방어했습니다.

📍 ① `change-requests.repository.ts:60-71` (조건부 `updateMany`).
📍 ② `prisma/schema.prisma:101` — `@@unique([purchaseOrderId, versionNo], map: "uq_po_version")`.
📍 ③ `change-requests.repository.ts:59-98` (`$transaction`이 ①~③ 전체를 감쌈).

---

## 3. NestJS 아키텍처

### Q14. Controller → Service → Repository 3계층으로 나눈 이유는?

책임을 분리해 테스트와 변경을 쉽게 하기 위해서입니다. 계층별 역할은 이렇습니다.

- **Controller** — HTTP 입출력만
- **Service** — 비즈니스 규칙(존재·권한·상태 검증)
- **Repository** — 데이터 접근만

Repository를 분리한 덕에 얻는 이점은 두 가지입니다.

- Service 테스트에서 Prisma를 직접 mock하지 않고 Repository만 `jest.fn()`으로 대체해, 비즈니스 로직만 격리 검증할 수 있습니다.
- 나중에 ORM이나 쿼리 방식을 바꿔도 Service는 그대로 둘 수 있습니다.

📍 Controller(HTTP만): `purchase-orders.controller.ts:25-27` 등 — Service 호출 후 반환만.
📍 Service(규칙): `purchase-orders.service.ts:24-43` (존재·역할 검증).
📍 Repository(데이터 접근만): `purchase-orders.repository.ts:34-58`.
📍 계층 규약은 `src/CLAUDE.md`에 명문화돼 있음.

### Q15. 비즈니스 로직은 Service, 예외도 Service에서 던지는 경계 기준은?

**"이 판단에 도메인 규칙이 들어가는가"**가 기준입니다.

- "발주서가 CONFIRMED 상태여야 변경 요청 가능", "buyer 본인만 제출 가능" 같은 규칙은 Service에 둡니다.
- Repository는 `T | null`을 반환만 하고, null을 받아 `NotFoundException`을 던질지는 Service가 정합니다.

예외를 Service에 모으면 HTTP 의미(404/403/409)와 도메인 규칙이 한곳에 있어 흐름을 읽기 쉽습니다.

📍 "CONFIRMED여야 변경 가능": `purchase-orders.service.ts:127-131`.
📍 "buyer 본인만 제출": `purchase-orders.service.ts:64-66`.
📍 Repository는 null 반환만: `purchase-orders.repository.ts:60-64` (`findById`가 null 반환) → null 판단은 Service `purchase-orders.service.ts:46-49`.

### Q16. 전역 인터셉터와 익셉션 필터의 실행 시점/순서는?

성공과 실패의 책임이 갈립니다.

- **성공 (인터셉터)** — 핸들러가 반환한 값이 `TransformInterceptor`를 거쳐 `{ success: true, statusCode, message, data, timestamp, path }`로 래핑됩니다.
- **실패 (필터)** — 핸들러나 그 하위에서 예외가 던져지면 인터셉터의 정상 매핑을 타지 않고 `AllExceptionsFilter`가 잡아 `{ success: false, ... }`로 변환합니다.

둘 다 `main.ts`에서 전역 등록돼 있어, 새 컨트롤러를 추가해도 별도 작업이 필요 없습니다.

📍 성공 래핑: `common/interceptors/transform.interceptor.ts:29-37`.
📍 실패 래핑: `common/filters/all-exceptions.filter.ts:39-47`.
📍 전역 등록: `main.ts:14-15`.
📍 204/빈 body는 래핑 제외: `transform.interceptor.ts:26-28`.

### Q17. path param은 ParseIntPipe로 변환하면서 query의 from/to는 왜 Service에서 Number()로 변환하나요?

검증의 성격이 달라 의도적으로 구분했습니다.

- **path param (`id`·`versionNo`)** — 형식이 틀리면 그 자체로 잘못된 경로이므로, 파이프 단에서 400으로 빠르게 거부하는 게 맞습니다.
- **query (`from`/`to`)** — "양의 정수"라는 도메인 규칙 검증이 필요합니다. 단순 정수 변환을 넘어 `Number.isInteger && >= 1`까지 Service에서 함께 검증하고 `BadRequestException`을 던집니다.

검증 책임을 한곳(Service)에 모으려고 query는 문자열로 받았습니다. (snapshot의 `at`도 같은 이유로 문자열로 받아 `kstEndOfDay`에서 형식 검증)

📍 path param은 파이프: `purchase-orders.controller.ts:34` (`@Param('id', ParseIntPipe)`), `:111` (`versionNo`).
📍 query는 문자열로 받음: `purchase-orders.controller.ts:126-127` (`@Query('from') from: string`).
📍 Service에서 양의 정수 검증: `purchase-orders.service.ts:186-190`.
📍 `at`도 문자열 → 형식 검증: `purchase-orders.service.ts:164-167` + `date-format.ts:14-15`.

### Q18. whitelist: true, forbidNonWhitelisted: true를 준 이유는?

**mass-assignment류 문제를 차단**하기 위해서입니다. 세 옵션의 역할은 이렇습니다.

- **`whitelist`** — DTO에 정의되지 않은 속성을 자동으로 제거합니다.
- **`forbidNonWhitelisted`** — 그런 속성이 들어오면 아예 400으로 거부합니다.
- **`transform`** — 들어온 평문 객체를 DTO 인스턴스로 변환해 타입과 데코레이터 검증이 동작하게 합니다.

이렇게 하면 클라이언트가 `status`나 `currentVersion` 같은 서버 제어 필드를 body에 끼워 넣어 의도치 않게 덮어쓰는 일을 막을 수 있습니다.

📍 `main.ts:11-13` — `new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.

---

## 4. 검증 / 데이터 무결성

### Q19. IsValidChanges 커스텀 밸리데이터를 직접 만든 이유는?

**동적 키를 가진 JSON 구조**라 정적 데코레이터로는 표현이 안 되기 때문입니다.

`changes`는 `{ "quantity": { "new": 1500 } }`처럼 키마다 두 가지를 검증해야 합니다.

- 허용된 필드인지 (화이트리스트)
- 값 타입이 그 필드에 맞는지 (수량은 1 이상 정수, 단가는 양수, 사양은 객체 등)

`@IsString` 같은 정적 데코레이터 조합으로는 이런 동적 구조를 표현할 수 없어, 화이트리스트와 필드별 타입 규칙을 한 곳에서 검증하는 커스텀 밸리데이터를 만들었습니다.

📍 `purchase-orders/dto/is-valid-changes.validator.ts` 전체 — 허용 필드 `ALLOWED_FIELDS`(line 3), 필드별 타입 규칙 `isValidNewValue`(line 15-28), 데코레이터 등록 `IsValidChanges`(line 49-63).

### Q20. applyChanges는 모르는 키를 무시하고 DTO 검증은 거부합니다. 화이트리스트가 두 군데 중복 아닌가요?

역할이 다릅니다.

- **DTO의 `IsValidChanges`** — 입력 경계에서 허용되지 않은 키를 거부하는 1차 방어선.
- **`applyChanges`의 switch** — 검증을 통과한 데이터를 실제 컬럼에 매핑하는 단계라, 방어적으로 모르는 키는 무시.

다만 화이트리스트가 두 곳에 있다는 건 인지하고 있고, 필드 목록이 늘면 한쪽만 고치는 실수가 가능합니다. 개선한다면 허용 필드와 타입 변환 규칙을 한 모듈로 모아, 검증과 적용이 같은 소스를 참조하게 만들겠습니다.

📍 1차 방어선(거부): `is-valid-changes.validator.ts:3` (`ALLOWED_FIELDS`).
📍 매핑(모르는 키 무시): `change-requests.service.ts:96-112` (`applyChanges`의 switch — default 없이 빠짐).
📍 → 두 곳의 필드 목록이 같은 의미를 중복 보유.

### Q21. unit_price는 Decimal(12,2)인데 JS number로 다루면 오차가 납니다. 어떻게 막나요?

**단가를 끝까지 문자열로 다룹니다.** JS number(IEEE 754)로 변환하는 순간 0.1 같은 값에서 오차가 생기므로, number를 거치지 않고 문자열 그대로 Prisma에 넘겨 정밀도를 보존합니다.

- **복사 시** — `current.unitPrice.toString()`으로 받음
- **적용 시** — `String(newValue)`로 저장
- **diff 비교** — `toString()`끼리 문자열 비교

📍 컬럼: `prisma/schema.prisma:91` (`@db.Decimal(12, 2)`).
📍 복사 시 문자열: `change-requests.service.ts:88` (`unitPrice: current.unitPrice.toString()`).
📍 적용 시 문자열: `change-requests.service.ts:104` (`next.unitPrice = String(newValue)`).
📍 diff도 문자열 비교: `purchase-order-version-diff-response.dto.ts:51-55`.

### Q22. findById에서 버전을 못 찾으면 HttpException이 아니라 Error를 던지는데 왜 구분했나요?

**의미가 다른 두 상황을 다르게 다루기 위해서**입니다.

- **"발주서가 없음"** — 클라이언트가 잘못된 id를 준 정상적인 4xx 상황 → `NotFoundException`(404).
- **"발주서는 있는데 `current_version`이 가리키는 버전 행이 없음"** — 일어나서는 안 되는 데이터 무결성 위반. 클라이언트 잘못이 아니라 서버/데이터 버그이므로, 일반 `Error`로 던져 필터가 500으로 처리하게 하고 로그에 스택을 남겨 원인을 추적합니다.

📍 "발주서 없음" → null 반환 후 404: `purchase-orders.repository.ts:62-63` + `purchase-orders.service.ts:47-49`.
📍 "버전 행 없음" → 일반 Error(=500): `purchase-orders.repository.ts:75-79`.
📍 일반 Error가 500+스택로그로 처리되는 곳: `all-exceptions.filter.ts:35-37` (HttpException 아닌 경우 `logger.error(stack)`).

---

## 5. 시간대 / 직렬화

### Q23. Timestamptz를 쓰는데도 KST offset을 수동으로 더하는 이유는?

**저장은 UTC로 정확히, 응답 표현만 KST로 고정**하기 위해서입니다.

서버나 컨테이너의 로컬 타임존 설정에 응답 포맷이 좌우되면 환경마다 결과가 달라집니다. 그래서 `toKstIsoString`에서 명시적으로 +9시간을 더하고 `+09:00` 표기를 붙여, 어떤 환경에서 띄워도 동일한 KST 문자열이 나오게 했습니다. 시점 조회의 `kstEndOfDay`도 같은 맥락으로 KST 기준 하루 경계를 명시적으로 계산합니다.

**Prisma의 타임존 동작과 엮으면:**

- **Prisma에는 타임존 설정 옵션 자체가 없습니다.** schema에도, 클라이언트 생성 옵션에도 "DateTime을 KST로 돌려달라"고 지시할 방법이 없습니다(PostgreSQL 커넥터 기준, 관련 기능 요청이 수년째 열려 있는 상태). Prisma는 무조건 **UTC 기준 JS `Date`** 로 반환합니다.
- `Date`는 내부적으로 epoch 밀리초만 들고 있어 타임존 정보 자체가 없으므로, 여기까지는 환경에 상관없이 UTC로 일관됩니다. **흔들리는 건 그 `Date`를 문자열로 바꾸는 표현 단계**입니다. `date.toISOString()`은 항상 UTC(`...Z`)를 주고, `toLocaleString()` 류는 서버 로컬 타임존을 따라 환경마다 달라집니다. 둘 다 KST 고정 출력에는 부적합합니다.
- 결국 Prisma 쪽에 맡길 수 있는 설정이 없으니, **애플리케이션 경계에서 직접 +9시간 + `+09:00` 표기**를 붙이는 게 유일한 방법입니다. DB 타임존이나 서버 `TZ` 환경변수에도 의존하지 않으므로, 로컬·CI·운영 어디서 돌려도 결과가 같습니다.

📍 저장 타입: `prisma/schema.prisma:95-96` (`validFrom`/`validTo` `@db.Timestamptz`).
📍 응답 표현 고정: `date-format.ts:1-5` (`KST_OFFSET_MS`, `toKstIsoString`).
📍 하루 경계 명시 계산: `date-format.ts:13-26` (`kstEndOfDay`).

### Q24. deepConvertDatesToKst로 응답의 모든 Date를 재귀 변환하는데 성능/예외는?

**현재는 문제없지만, 한계는 인지하고 있습니다.**

- **지금** — 응답 DTO는 필드 수가 적어 재귀 비용이 작습니다.
- **잠재 위험** — `spec` 같은 JSONB는 사용자 입력이라 깊거나 클 수 있어, 매우 큰 객체에서는 전체 순회 비용이 생길 수 있습니다.

실무라면 변환 대상을 응답 스키마가 아는 Date 필드로 한정하거나 직렬화 단계에서 처리하는 방식으로 바꿔, 임의 깊이의 사용자 JSON을 전부 도는 일을 피하겠습니다.

📍 `date-format.ts:28-43` (`deepConvertDatesToKst` — 배열/객체 재귀).
📍 모든 응답에 무조건 적용되는 지점: `transform.interceptor.ts:34` (`deepConvertDatesToKst(data)`). spec이 응답에 실리면 여기서 전부 순회됨.

---

## 6. 테스트 전략

### Q25. Service는 Repository를 mock하고, Repository는 실제 DB로 테스트하라고 한 이유는?

**각 계층의 책임만 격리해서 검증하기 위해서**입니다.

- **Service 테스트** — 비즈니스 규칙(상태·권한·예외)이 목표라, Repository를 mock해 DB 없이 빠르게 분기들을 검증합니다.
- **Repository 테스트** — Prisma 쿼리·트랜잭션·advisory lock이 실제로 의도대로 도는지가 핵심이라, mock하면 의미가 없습니다. 실제 DB로 검증해야 진짜 동작을 확인할 수 있습니다.

📍 규약 명문화: `src/CLAUDE.md` "테스트" 섹션 — "Service 테스트: Repository를 `jest.fn()`으로 mock", "Repository 테스트: 실제 DB 연결로 검증(mock 금지)".
📍 대상 파일: `*.service.spec.ts`(mock) vs `*.repository.spec.ts`(실 DB).

### Q26. 동시성 로직은 단위 테스트로 검증이 어려운데 어떻게 테스트했나요?

단위 테스트로는 레이스를 재현할 수 없어, **실제 DB에 `Promise.all`로 동시 요청을 던져** 검증합니다.

- **동시 승인** — 같은 변경 요청을 여러 번 동시에 승인하고, 정확히 한 건만 성공·나머지는 `ConflictException`인지, 버전이 하나만 늘었는지 확인합니다.
- **동시 생성(advisory lock)** — 같은 발주서에 동시 생성 요청을 던져 PENDING이 하나만 생기는지 확인합니다.

📍 검증 대상 코드: 승인 경합 `change-requests.repository.ts:60-71`, 생성 경합 `purchase-orders.repository.ts:128-149`.
📍 테스트 파일: `change-requests.repository.spec.ts`, `purchase-orders.repository.spec.ts`(실 DB).

> ⚠️ **솔직 체크 필요.** 위 두 spec 파일에 실제로 `Promise.all` 동시성 테스트가 들어있는지 면접 전에 확인하세요. 답변과 코드가 어긋나면 신뢰를 잃습니다.

---

## 7. 확장성 / 한계 (역량 어필)

### Q27. 다단계 승인(결재 라인)으로 확장하려면?

현재 `change_request`의 단일 `reviewer_id`/`status`로는 부족하니, 승인 단계를 별도 테이블(`approval_step`: `change_request_id`, `step_order`, `approver_id`, `status`)로 분리합니다.

- **모든 단계가 APPROVED** 가 됐을 때만 버전 적용 트랜잭션을 타게 합니다.
- **중간 단계 거부 시** 전체를 REJECTED로 마감합니다.

핵심은, 버전 생성 트랜잭션 자체는 마지막 단계 통과 시점에 **지금 구조 그대로 재사용**할 수 있다는 점입니다.

📍 현재 단일 reviewer 구조: `prisma/schema.prisma:72-74` (`reviewerId`/`reviewComment`/`reviewedAt`).
📍 마지막 단계 통과 시 재사용할 트랜잭션: `change-requests.repository.ts:58-98` (`applyApproval` 그대로 호출).

### Q28. 버전·이력 조회에 페이지네이션이 없는데 버전이 수천 개로 늘면?

현재는 변경이 드물어 미적용했지만, 규모가 커지면 두 가지를 보강하겠습니다.

- **목록 조회** — 커서 기반 페이지네이션(`versionNo` 또는 `createdAt` 커서)을 추가합니다.
- **시점 조회** — 인덱스로 한 건만 가져오니 단건 자체는 영향이 없지만, `(purchase_order_id, valid_from)` 또는 `(purchase_order_id, valid_to)`에 인덱스를 둬서 풀스캔 없이 동작하도록 보강합니다.

📍 페이지네이션 없는 목록 조회: `purchase-orders.repository.ts:112-117` (`findApprovalHistories` — `findMany` 전체 반환).
📍 인덱스 보강이 필요한 시점 조회: `purchase-orders.repository.ts:161-169` (`findVersionAt`의 `validFrom`/`validTo` 조건).
📍 현재 인덱스는 `@@unique([purchaseOrderId, versionNo])` 하나뿐: `prisma/schema.prisma:101`. `valid_from`/`valid_to` 복합 인덱스는 없음.

### Q29. requesterId/reviewerId를 body로 받는 방식의 보안 문제와 개선은?

**가장 큰 한계입니다.** 본인이 누구인지를 클라이언트가 보내는 값으로 믿기 때문에, 아무 id나 넣어 타인을 사칭할 수 있습니다(권한 우회).

개선 방향은 이렇습니다.

- 인증 토큰(JWT/세션)에서 사용자 식별자와 역할을 꺼내 쓰고, body의 id는 받지 않거나 토큰 주체와 일치하는지 검증합니다.
- NestJS라면 `AuthGuard`로 인증을, `RolesGuard` + `@Roles()`로 SOURCING/BUYER 역할 인가를 선언적으로 처리해, Service에 흩어진 역할 체크 로직을 가드로 끌어올립니다.

이번 과제는 인증 범위 밖이라, 역할을 명시적으로 받는 형태로 단순화했음을 전제로 둔 설계입니다.

📍 body로 신원을 받는 지점: `change-requests.controller.ts:26` (`ReviewChangeRequestDto`의 `reviewerId`), `purchase-orders.controller.ts:98` (`requesterId`).
📍 가드로 끌어올릴 역할 체크: `change-requests.service.ts:47-54` (`assertReviewerIsSourcing`), `purchase-orders.service.ts:29-31, 64-66, 88-90, 123-125`.

---

## 8. 기술 선택 — 왜 Prisma인가

### Q30. TypeORM이 아니라 Prisma를 고른 이유는?

**핵심은 오류를 잡는 시점입니다.**

- **TypeORM** — 잘못된 컬럼명·관계 누락 같은 실수가 컴파일 때 안 걸리고, 실제 쿼리가 DB에 나가는 런타임에야 터집니다.
- **Prisma** — `schema.prisma`에서 타입을 생성해서, 없는 필드나 잘못된 타입을 쓰면 tsc 단계에서 바로 실패합니다.

이력 스냅샷·버전 비교처럼 컬럼을 많이 다루는 이 과제에서, 오타 위험을 컴파일 타임으로 끌어올린 게 가장 큰 이점이었습니다.

추가로 `$transaction`·`$executeRaw`도 타입 안전하게 제공해, 승인 트랜잭션과 advisory lock 같은 raw SQL 지점에서도 파라미터 바인딩이 일관됩니다.

📍 타입의 단일 원천: `prisma/schema.prisma` → `@prisma/client` 타입 생성.
📍 타입 안전 트랜잭션/raw: `change-requests.repository.ts:59-98`, `purchase-orders.repository.ts:129`.

> **단서.** Prisma도 복잡한 동적 쿼리는 raw로 빠지고 마이그레이션이 덜 유연하다는 트레이드오프는 있다고 덧붙이면 균형이 좋습니다.

---

## 9. Node.js 동작 방식

### Q31. Node.js 동작 방식을 이 프로젝트와 엮어 설명한다면?

Node.js는 **싱글 스레드 이벤트 루프 + 논블로킹 I/O**입니다. DB 쿼리 같은 I/O는 OS에 넘기고 결과를 기다리는 동안 스레드를 멈추지 않아서, 여러 요청이 `await`로 DB를 기다리는 동안 다른 요청을 처리합니다.

여기서 핵심은 **"싱글 스레드라 동시성 문제가 없다"는 오해**입니다.

- `await` 지점마다 제어권이 넘어가 다른 요청이 끼어들 수 있습니다.
- 그래서 "PENDING 확인 → 업데이트" 사이 틈에서 TOCTOU 레이스가 그대로 납니다.

그래서 정확성을 메모리가 아니라 **DB 차원(조건부 `updateMany` 행 잠금, advisory lock)**에 맡겼습니다.

📍 인터리빙 지점: `change-requests.repository.ts:59-98`(트랜잭션 내 각 `await`).
📍 DB로 방어: `change-requests.repository.ts:60-71`(`updateMany`), `purchase-orders.repository.ts:129`(advisory lock).

---

## 10. 인증 / 인가 (현재 범위 밖, 확장 방향)

### Q32. 지금은 신원을 body로 받는데, 실서비스라면 인증을 어떻게 붙이나?

지금은 `requesterId`/`reviewerId`를 body로 받아 사칭이 가능합니다(Q29). 실서비스는 토큰에서 신원을 꺼내는 방식으로 바꿉니다.

**현재 방식(body로 신원 전달)의 장단점**

- **장점** — 인증 인프라가 없어 구현이 단순하고, 과제처럼 역할별 동작만 보여주면 되는 상황에선 충분합니다.
- **단점** — 클라이언트가 보낸 값을 그대로 믿으니 사칭·권한 우회가 자유롭습니다. 실서비스에선 절대 쓸 수 없습니다.

**OAuth2 — 인증을 외부에 위임하는 인가 프레임워크**

구글·사내 SSO 같은 제공자에 로그인을 맡기고, 우리 서버는 발급받은 토큰을 검증만 합니다.

- **장점** — 비밀번호를 직접 다루지 않아 유출 위험이 줄고, 사용자는 기존 계정으로 로그인하니 편합니다. 권한 범위(scope)를 잘게 나눠 위임할 수 있습니다.
- **단점** — 외부 제공자에 의존하니 그쪽 장애가 곧 우리 로그인 장애가 되고, 흐름(리다이렉트·콜백·토큰 교환)이 복잡해 처음 붙일 때 비용이 큽니다.

**JWT — 그 토큰을 담는 흔한 형식(무상태)**

`{ userId, role }`을 서명해 담아, 서버가 DB 조회 없이 서명만 검증하면 신원과 역할을 압니다.

- **장점** — 세션 저장소 조회가 없어 빠르고, 서버를 여러 대로 늘려도 세션 공유가 필요 없어 수평 확장에 유리합니다. 토큰이 자기완결적이라 마이크로서비스 간에 넘기기 좋습니다.
- **단점** — 무상태라 즉시 폐기(로그아웃·권한 박탈·탈취 대응)가 어렵습니다. 그래서 보통 짧은 만료 access token + refresh token + 블랙리스트로 보완합니다. 또 페이로드는 암호화가 아니라 서명일 뿐이라 누구나 내용을 디코딩해 볼 수 있어, 민감 정보를 넣으면 안 됩니다. 탈취 시 그 사용자로 행세할 수 있어 HTTPS와 저장 위치 선택이 중요합니다.

**NestJS 적용**

`AuthGuard`로 JWT를 검증해 `req.user`를 채우고, `RolesGuard` + `@Roles('SOURCING')`로 역할 인가를 선언적으로 처리합니다. 그러면 지금 Service에 흩어진 역할 체크를 가드로 끌어올리고, body의 id는 받지 않게 됩니다.

📍 현재 body로 신원 받는 곳: `change-requests.controller.ts:26`, `purchase-orders.controller.ts:98`.
📍 가드로 옮길 역할 체크: `change-requests.service.ts:47-54`, `purchase-orders.service.ts:29-31, 64-66`.

> **한 줄 정리.** OAuth2 = 인증을 위임하는 틀, JWT = 그 결과를 무상태로 담아 검증하는 토큰. JWT의 장점(무상태·확장성)과 단점(즉시 폐기 어려움)은 동전의 양면이라, 짧은 만료 + refresh token 조합이 사실상 표준입니다.

---

## 11. Redis Pub/Sub 동작 방식

> ⚠️ **이 프로젝트에는 Redis가 구현돼 있지 않습니다.** Q1의 이벤트 소싱 설명에 나온 "이벤트 버스(publish/subscribe)"가 실제로 어떻게 돌아가는지, 그 메시징 토대를 별도로 정리한 참고 자료입니다. 코드 위치(📍) 대신 동작 방식 중심으로 적었습니다.

### 한 줄 요약

Redis Pub/Sub은 **채널(channel)을 매개로 발행자(publisher)와 구독자(subscriber)를 느슨하게 연결하는 메시징 모델**입니다. 발행자는 "누가 받는지" 모른 채 채널에 메시지를 던지고, 그 채널을 구독 중인 모든 구독자가 동시에 받아 갑니다.

### 기본 동작

세 가지 명령이 핵심입니다.

- **`SUBSCRIBE ch`** — 구독자가 채널 `ch`를 구독합니다. 이 커넥션은 구독 전용 모드로 들어가, 일반 명령은 못 쓰고 메시지 수신만 합니다.
- **`PUBLISH ch msg`** — 발행자가 채널 `ch`에 메시지 `msg`를 보냅니다. 반환값은 **그 메시지를 받은 구독자 수**입니다.
- **`UNSUBSCRIBE ch`** — 구독을 해제합니다.

발행 한 번에 구독자가 N명이면 N명 모두에게 전달됩니다(fan-out). 발행자는 수신자가 0명이든 100명이든 똑같이 던지기만 합니다.

```
구독자 A: SUBSCRIBE order.changed   ─┐
구독자 B: SUBSCRIBE order.changed   ─┤  같은 채널 구독
구독자 C: SUBSCRIBE order.created   ─┘  (다른 채널)

발행자:  PUBLISH order.changed "{poId:1, qty:150}"
            │
            ├─→ A 수신 ✅
            ├─→ B 수신 ✅
            └─  C 미수신 (채널 다름)
         반환값 = 2 (받은 구독자 수)
```

### 패턴 구독

`PSUBSCRIBE`로 와일드카드 패턴을 구독할 수 있습니다.

- `PSUBSCRIBE order.*` → `order.created`, `order.changed`, `order.approved` 등을 한 번에 받습니다.
- 한 구독자가 도메인 이벤트 전부를 받아 라우팅하는 식으로 쓸 수 있습니다.

### 핵심 특성 — "fire-and-forget"

가장 중요한 점은 **메시지를 저장하지 않는다**는 것입니다. 이게 다른 메시징과 갈리는 결정적 차이입니다.

- **전송 보장이 없음** — 발행 시점에 구독 중이지 않은 구독자는 그 메시지를 **영영 못 받습니다.** 메시지는 발행 즉시 살아있는 구독자에게만 뿌려지고 버려집니다.
- **이력이 없음** — 나중에 구독한 사람은 과거 메시지를 다시 볼 수 없습니다. 큐에 쌓이지 않습니다.
- **ACK가 없음** — 구독자가 실제로 처리했는지 발행자는 모릅니다.
- **구독자가 죽어 있으면 유실** — 재시작 사이에 발행된 메시지는 사라집니다.

즉 **"지금 듣고 있는 사람에게만, 한 번, 보장 없이"** 보내는 모델입니다.

### 같은 발주서 시나리오에 대입

Q1의 이벤트 소싱 예시에서 `PriceChanged` 이벤트가 발행되면, 이벤트 버스를 Redis Pub/Sub으로 구현했다고 가정할 때 이렇게 흐릅니다.

```
발주서 변경 트랜잭션 커밋 후:
  PUBLISH po.price_changed "{poId:1, from:1000, to:1200}"
        │
        ├─→ 프로젝션 핸들러 : po_read_model.unitPrice = 1200 갱신
        ├─→ 알림 핸들러     : 구매 담당자에게 메일
        ├─→ 집계 핸들러     : 단가 변동 통계 +1
        └─→ ERP 연동 핸들러 : 외부 시스템 전송
```

쓰기 쪽은 `PUBLISH` 한 번이면 끝이고, 후속 처리는 각 구독자가 알아서 받아 갑니다. 새 후속 처리가 생겨도 구독자만 추가하면 되니 쓰기 코드는 안 건드립니다(Q1의 이벤트 버스 설명과 동일한 장점).

### 한계 — 왜 이벤트 소싱의 "진실의 원천"으로는 못 쓰나

여기서 Q1과 연결되는 중요한 구분이 있습니다. **Redis Pub/Sub은 이벤트를 "전달"하는 통로일 뿐, 이벤트를 "보관"하는 저장소가 아닙니다.**

- 이벤트 소싱은 이벤트 로그가 **진실의 원천(source of truth)**이라 절대 유실되면 안 됩니다. 그런데 Pub/Sub은 fire-and-forget이라 유실이 기본 동작입니다.
- 그래서 실제 이벤트 소싱에서는 이벤트를 **먼저 DB(이벤트 스토어)에 영속화**하고, Pub/Sub은 "새 이벤트가 생겼다"고 **알리는 신호**로만 씁니다. 진실은 DB에 있고 Pub/Sub은 전달책입니다.

### Pub/Sub vs Redis Streams vs 메시지 큐

전송 보장이 필요하면 Pub/Sub 대신 다른 도구를 씁니다.

| | Pub/Sub | Redis Streams | Kafka / RabbitMQ |
|---|---|---|---|
| 메시지 저장 | 안 함 (즉시 폐기) | 함 (append-only 로그) | 함 (디스크 영속) |
| 과거 메시지 재수신 | 불가 | 가능 (offset 조회) | 가능 |
| 전송 보장 | 없음 | ACK·소비자 그룹 | ACK·재시도·DLQ |
| 용도 | 실시간 알림·휘발성 fan-out | 경량 이벤트 로그 | 대규모 영속 이벤트 스트리밍 |

→ **"실시간 알림처럼 놓쳐도 되는 휘발성 fan-out"**에는 Pub/Sub이 가볍고 적합하지만, **"한 건도 유실되면 안 되는 이벤트"**에는 Streams나 메시지 큐를 씁니다. 이벤트 소싱의 이벤트는 후자에 해당합니다.

### 흔한 오해 / 꼬리질문 대비

- **"Pub/Sub이면 메시지 큐 아닌가?"** — 아닙니다. 큐는 메시지를 쌓아두고 소비자가 가져갈 때까지 보관하지만(전송 보장), Pub/Sub은 발행 즉시 살아있는 구독자에게만 뿌리고 버립니다(보장 없음).
- **"같은 채널 구독자가 여럿이면 한 명만 받나, 다 받나?"** — **다 받습니다(fan-out/broadcast).** 큐처럼 "한 명이 가져가면 끝(competing consumers)"이 아닙니다. 작업 분배가 목적이면 Streams의 소비자 그룹이나 메시지 큐를 써야 합니다.
- **"발행 시점에 구독자가 없으면?"** — 메시지는 그냥 버려집니다. `PUBLISH` 반환값이 0일 뿐, 에러가 아닙니다.
- **"트랜잭션과 같이 쓸 때 주의점은?"** — DB 커밋 **전에** `PUBLISH`하면, 트랜잭션이 롤백돼도 이미 발행된 이벤트는 회수가 안 됩니다(구독자가 없는 변경을 처리해 버림). 그래서 보통 **커밋 후 발행**하거나, 더 안전하게는 **트랜잭셔널 아웃박스(outbox) 패턴**으로 이벤트를 같은 트랜잭션에 DB로 저장한 뒤 별도 프로세스가 발행합니다.

---

## 12. TypeScript란 무엇인가

> 이 프로젝트가 실제로 TypeScript로 작성돼 있어, 일반 개념과 함께 이 코드베이스에서 어떻게 쓰이는지를 코드 위치(📍)로 연결했습니다.

### 한 줄 요약

TypeScript는 **JavaScript에 정적 타입(static type)을 더한 상위집합(superset) 언어**입니다. 모든 유효한 JavaScript는 그 자체로 유효한 TypeScript이고, 여기에 타입 표기를 얹어 **실행 전(컴파일 타임)에 타입 오류를 잡는** 게 핵심입니다.

### 왜 쓰나 — 오류를 잡는 시점이 앞당겨진다

순수 JavaScript는 **런타임에야** 오류가 터집니다. 없는 속성을 읽거나(`undefined`), 숫자에 문자열을 넣는 실수가 실제로 그 코드가 실행될 때까지 숨어 있습니다.

TypeScript는 이 오류를 **컴파일 타임(`tsc`)으로 끌어올립니다.**

```typescript
// JavaScript — 런타임에야 터짐
function total(order) {
  return order.quantity * order.unitPrce; // 오타(unitPrce) → undefined → NaN, 그래도 실행됨
}

// TypeScript — tsc 단계에서 즉시 실패
function total(order: { quantity: number; unitPrice: number }): number {
  return order.quantity * order.unitPrce; // ❌ Property 'unitPrce' does not exist
}
```

이 프로젝트는 발주서 스냅샷·버전 비교처럼 컬럼을 많이 다뤄, 오타 한 번이 곧 버그입니다. 그 위험을 컴파일 타임으로 옮긴 게 Q30(왜 Prisma인가)에서 말한 이점과 정확히 같은 맥락입니다.

### 동작 방식 — 컴파일 → JS로 변환

브라우저나 Node.js는 TypeScript를 직접 실행하지 못합니다. 그래서 `tsc`가 타입을 검사한 뒤 **타입 표기를 모두 지운 순수 JavaScript로 변환(transpile)**합니다.

- **타입은 컴파일 후 사라집니다(type erasure).** 런타임에는 타입 정보가 없습니다. 그래서 `if (typeof x === 'string')` 같은 런타임 검사는 여전히 직접 해야 합니다.
- 변환 산출물은 `tsconfig.json`의 `target`(이 프로젝트는 `ES2023`)·`module` 설정을 따릅니다.

📍 이 프로젝트의 컴파일 설정: `tsconfig.json` — `target: ES2023`, `outDir: ./dist`(변환된 JS가 여기로 나감).

### 핵심 개념

- **타입 추론(inference)** — 모든 곳에 타입을 적을 필요는 없습니다. `const n = 1`이면 `n`은 자동으로 `number`로 추론됩니다. 표기는 추론이 안 되는 경계(함수 인자·공개 API)에 주로 답니다.
- **구조적 타이핑(structural typing)** — 이름이 아니라 **모양(shape)**으로 호환을 판단합니다. 어떤 객체가 필요한 속성을 다 가지고 있으면, 그 타입을 명시적으로 선언하지 않았어도 호환됩니다(Java의 명목적 타이핑과 반대).
- **유니온 / 제네릭** — `string | null`처럼 여러 타입을 합치거나(유니온), `Array<T>`처럼 타입을 매개변수화(제네릭)할 수 있습니다. Repository가 `T | null`을 반환하고 Service가 null을 판단하는 이 프로젝트 패턴(Q15·Q22)이 유니온의 실제 사용 예입니다.
- **`strictNullChecks`** — 이 프로젝트는 이 옵션이 켜져 있어, `null`/`undefined`일 수 있는 값을 검사 없이 쓰면 컴파일 에러가 납니다. "버전 행이 없을 수 있다"는 상황을 타입이 강제로 짚게 만듭니다.

📍 strict null 설정: `tsconfig.json` — `strictNullChecks: true`. (다만 `noImplicitAny: false`라 완전한 strict 모드는 아니어서, 타입을 안 적으면 `any`로 새는 지점이 일부 허용됩니다.)

### 이 프로젝트에서 TypeScript가 일하는 곳

- **Prisma 타입 생성** — `schema.prisma`에서 모델 타입을 생성해, 없는 필드나 잘못된 타입을 쓰면 `tsc`에서 바로 막힙니다. 타입의 단일 원천이 스키마입니다(Q30).
- **데코레이터 + 메타데이터** — `tsconfig.json`의 `emitDecoratorMetadata`/`experimentalDecorators`가 켜져 있어, NestJS의 의존성 주입(`@Injectable`)과 class-validator의 DTO 검증(`@IsString` 등)이 타입 정보를 런타임까지 넘겨받아 동작합니다.
- **DTO 타입 안전** — 요청/응답 DTO가 타입으로 정의돼, 컨트롤러·서비스 사이에 오가는 데이터 모양이 컴파일 타임에 보장됩니다(Q18의 `whitelist`/`transform`과 결합).

📍 데코레이터 메타데이터 활성화: `tsconfig.json` — `emitDecoratorMetadata: true`.
📍 타입의 단일 원천: `prisma/schema.prisma` → `@prisma/client` 타입 생성(Q30과 동일 지점).

### 한계 / 꼬리질문 대비

- **"타입이 있으면 런타임 검증은 필요 없나?"** — 필요합니다. 타입은 컴파일 후 지워지므로(type erasure), **외부에서 들어오는 데이터**(HTTP body, DB raw 결과)는 타입을 믿을 수 없습니다. 그래서 이 프로젝트도 입력 경계에서 class-validator로 런타임 검증을 따로 합니다(Q18·Q19).
- **"`any`를 쓰면?"** — 타입 검사를 그 지점에서 꺼버리는 탈출구라, 남발하면 TypeScript를 쓰는 의미가 사라집니다. 이 프로젝트는 `noImplicitAny: false`라 암묵적 `any`가 일부 허용되지만, 명시적 타입을 다는 쪽이 안전합니다.
- **"TypeScript가 런타임을 더 빠르게 하나?"** — 아닙니다. 변환 후 순수 JS이므로 런타임 성능은 동일합니다. 이점은 전적으로 **개발 시점의 안전성·자동완성·리팩터링**에 있습니다.

> **한 줄 정리.** TypeScript = JavaScript + 컴파일 타임 정적 타입. 런타임에는 타입이 지워지므로, 타입은 "개발 중 실수를 막는 장치"이고 외부 입력 검증은 별도(class-validator)로 해야 합니다. 이 프로젝트에선 Prisma 타입 생성과 데코레이터 메타데이터가 그 안전성을 떠받칩니다.

---

## 13. PostgreSQL 데이터베이스의 장점

> 이 프로젝트가 실제로 PostgreSQL 16을 쓰고 있어, 일반적인 장점을 나열하는 데 그치지 않고 **이 코드베이스가 그 장점을 실제로 어디서 쓰는지** 코드 위치(📍)로 연결했습니다. 막연히 "성능이 좋다"가 아니라, 이 과제의 어떤 결정이 PostgreSQL의 어떤 기능 덕에 가능했는지가 핵심입니다.

### 한 줄 요약

PostgreSQL은 **표준 SQL을 충실히 따르면서, 강한 ACID 트랜잭션·풍부한 데이터 타입·확장 기능을 갖춘 오픈소스 RDBMS**입니다. 이 프로젝트의 핵심 요구사항(동시성 제어·정밀 수치·시점 이력)이 전부 PostgreSQL 고유 기능에 직접 기대고 있습니다.

### 1. 강력한 동시성 제어 (이 프로젝트가 가장 크게 의존)

PostgreSQL은 **MVCC(다중 버전 동시성 제어)**로 읽기와 쓰기가 서로 막지 않게 하고, 그 위에 행 잠금·advisory lock 같은 도구를 제공합니다. 이 프로젝트의 동시성 방어선(Q7~Q13)이 전부 여기에 올라타 있습니다.

- **조건부 `UPDATE` 행 잠금** — `updateMany({ where: { status: PENDING }, ... })`가 행 잠금 + 원자적 조건 평가로 동시 승인을 막습니다(Q7·Q8).
- **`pg_advisory_xact_lock`** — 존재하지 않는 행(phantom)에 대한 "PENDING 없음" 판단을 직렬화하는 데 advisory lock을 씁니다. 이건 **PostgreSQL 고유 기능**으로, 일반 SQL 표준에는 없습니다(Q9~Q11).
- **트랜잭션 격리 수준** — 기본 Read Committed 위에서 필요한 한 지점만 advisory lock으로 국소 직렬화했습니다(Q12).

📍 조건부 잠금: `change-requests.repository.ts:60-71`.
📍 advisory lock: `purchase-orders.repository.ts:128-149` (`pg_advisory_xact_lock`).

### 2. 정밀한 수치 타입 — `NUMERIC/DECIMAL`

PostgreSQL의 `NUMERIC(precision, scale)`은 **부동소수점 오차 없이** 정확한 십진수를 저장합니다. 돈·단가처럼 오차가 곧 사고인 값에 필수입니다.

이 프로젝트의 단가는 `@db.Decimal(12, 2)`로 저장되고, 애플리케이션은 이 값을 끝까지 문자열로 다뤄 JS number(IEEE 754) 오차를 피합니다(Q21). 정밀 저장은 DB가, 정밀 전달은 앱이 맡는 구조입니다.

📍 컬럼: `prisma/schema.prisma:111` (`@db.Decimal(12, 2)`).

### 3. 타임존 인식 타임스탬프 — `TIMESTAMPTZ`

`TIMESTAMPTZ`는 입력값을 **UTC로 정규화해 저장**하고 조회 시 세션 타임존으로 변환해 줍니다. "언제"를 환경에 무관하게 한 점으로 못 박는 타입입니다.

이 프로젝트는 모든 시각 컬럼을 `@db.Timestamptz`로 두고, 저장은 UTC로 정확히 하되 응답 표현만 앱 경계에서 KST로 고정합니다(Q23). 시점 이력 조회(`[validFrom, validTo)` 구간)도 이 타입 위에서 동작합니다(Q1·Q4).

📍 시각 컬럼: `prisma/schema.prisma:118-121` (`validFrom`/`validTo` `@db.Timestamptz`).

### 4. 1급 JSON 지원 — `JSONB`

PostgreSQL의 `JSONB`는 JSON을 **이진 형태로 저장**해 인덱싱·연산이 가능합니다. 스키마가 고정되지 않은 데이터를 RDB의 트랜잭션·제약 안에서 다룰 수 있습니다.

이 프로젝트는 동적 키를 갖는 변경 요청(`changes`)과 자유 형식 사양(`spec`)을 `@db.JsonB`로 저장합니다. 덕분에 정형 컬럼(수량·단가)과 비정형 데이터(사양)를 한 테이블·한 트랜잭션에서 함께 다룹니다(Q19의 커스텀 밸리데이터가 이 동적 구조를 검증).

📍 JSONB 컬럼: `prisma/schema.prisma:85` (`changes`), `:114` (`spec`).

### 5. 강한 무결성 제약

복합 유니크·외래키·체크 제약 등으로 **애플리케이션 코드가 틀려도 DB가 데이터 정합성을 지킵니다.**

이 프로젝트는 `(purchase_order_id, version_no)` 복합 유니크를 동시 승인 방어의 **최후 안전망**으로 둡니다. 응용 로직(조건부 update)이 1차, DB 제약이 2차인 이중 방어입니다(Q13).

📍 복합 유니크: `prisma/schema.prisma:125` (`@@unique([purchaseOrderId, versionNo], map: "uq_po_version")`).

### 6. 그 밖의 일반적 장점

- **표준 SQL 준수 + 확장성** — 표준을 충실히 따르면서 advisory lock·`JSONB`·배열·범위 타입·확장(extension) 등 풍부한 기능을 더합니다.
- **오픈소스·무라이선스** — 상용 DB 대비 비용 부담이 없고 생태계가 큽니다.
- **신뢰성** — WAL(Write-Ahead Logging) 기반 크래시 복구, 복제, 시점 복구(PITR)를 지원합니다.
- **확장 기능** — 필요 시 PostGIS(공간), pg_trgm(유사 검색) 등을 확장으로 붙일 수 있습니다.

### 꼬리질문 대비

- **"왜 MySQL이 아니라 PostgreSQL인가?"** — 이 과제는 advisory lock(생성 직렬화)·`TIMESTAMPTZ`(시점 이력)·`JSONB`(동적 changes)에 직접 기대는데, 이 조합이 PostgreSQL에서 가장 자연스럽습니다. MySQL에도 유사 기능이 있지만, 이 셋을 한 번에 깔끔히 제공하는 점이 결정적이었습니다.
- **"advisory lock이 PostgreSQL 전용이면 다른 DB로 옮길 때 문제 아닌가?"** — 맞습니다. 그 부분이 이식성을 떨어뜨립니다. 다만 Q9에서 보듯 advisory lock은 phantom 직렬화라는 한 지점에만 쓰여 격리돼 있고, partial unique index 등 다른 방식으로 대체 설계가 가능합니다.
- **"`JSONB`를 쓰면 결국 스키마리스 아닌가?"** — 비정형 일부(`spec`)만 JSONB이고, 정형 데이터(수량·단가·버전 구간)는 일반 컬럼·제약으로 강하게 잡혀 있습니다. RDB의 무결성과 JSON의 유연성을 한 테이블에서 **선택적으로** 섞은 구조입니다.

> **한 줄 정리.** 이 프로젝트가 PostgreSQL을 고른 건 "범용적으로 좋아서"가 아니라, 동시성 제어(advisory lock)·정밀 수치(Decimal)·시점 이력(Timestamptz)·동적 데이터(JSONB)라는 네 요구가 정확히 PostgreSQL의 강점과 맞물렸기 때문입니다.
