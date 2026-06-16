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

---

## 1. 도메인 설계 / 이력 관리

### Q1. 이력 저장 방식을 왜 "버전 전체 스냅샷"으로 골랐나요?

세 가지 대안을 비교했습니다. 각각의 저장 방식과 시점 조회·버전 비교 시 동작이 핵심 차이입니다.

**(A) 변경분만 저장 — 이벤트 소싱 유사**

- **저장** — 버전 전체가 아니라 "이번에 무엇이 바뀌었는가(델타)"만 행으로 쌓습니다. 예를 들어 초기값 한 벌(v1)을 두고, 이후엔 `{ quantity: 100 → 150 }`, `{ unitPrice: 1000 → 1200 }` 같은 변경분만 순서대로 append합니다.
- **시점 조회** — "그 시점의 발주서 전체 값"을 알려면 v1부터 그 시점까지의 델타를 순서대로 전부 재적용해 상태를 재구성해야 합니다. 버전이 N개면 최대 N번을 접어야 하니, 버전이 늘수록 조회가 느려집니다.
- **취약점** — 과거 델타의 포맷(키 이름·구조)이 한 번이라도 바뀌면, 옛날 델타를 적용하는 로직이 깨져 과거 전체가 복원 불능이 될 수 있습니다. 재적용 로직이 곧 데이터의 정합성을 책임지는 구조라 위험이 큽니다.

**(B) 한 행을 덮어쓰고 감사 로그만 별도 기록**

- **저장** — 발주서 본문은 단 한 행이고, 변경이 승인되면 그 행을 제자리에서 UPDATE합니다. 누가 언제 무엇을 바꿨는지는 별도 audit 로그 테이블에 "변경 사실"로만 남깁니다.
- **현재 값 조회** — 한 행만 읽으면 끝이라 가장 빠릅니다.
- **약점** — audit 로그는 보통 "필드 X를 A→B로 바꿈" 식의 변경 기록이라, 임의 과거 시점의 발주서 전체 스냅샷을 복원하기 어렵습니다. 복원하려면 결국 (A)처럼 로그를 역으로 접어야 하고, 본문을 덮어쓰는 구조라 과거 본문 자체는 이미 사라져 있습니다. "두 버전 비교"도 과거 본문이 없으니 곧바로 안 됩니다.

**(C) 승인 시마다 발주 내용 전체를 새 행으로 저장 — 채택**

- **저장** — 변경이 승인될 때마다 발주 5개 필드(상품명·수량·단가·납기·사양)를 통째로 복사한 새 버전 행을 만듭니다. 각 행은 `versionNo`와 유효 구간 `[validFrom, validTo)`를 갖고, 과거 행은 절대 수정하지 않습니다(append-only). 직전 버전의 `validTo`를 닫고 새 버전의 `validFrom`을 같은 시각으로 여는 식으로 구간이 이어집니다.
- **시점 조회** — `validFrom <= at AND (validTo > at OR validTo IS NULL)` 조건으로 그 시점에 유효했던 행 하나를 단순 쿼리 한 번에 가져옵니다. 재구성·재적용이 없습니다.
- **버전 비교** — 두 `versionNo`의 행을 각각 한 번에 읽어 필드를 맞대면 끝납니다.
- **트레이드오프** — 행 전체를 복사하니 저장 공간은 더 쓰지만(Q2), 시점 조회·버전 비교가 모두 인덱스 한 번으로 끝나고, 과거를 안 건드리니 이력이 사후에 꼬일 일이 없습니다. 이 과제의 핵심 요구사항이 정확히 "특정 시점 조회"와 "두 버전 비교"라, 그 둘이 가장 단순해지는 C를 택했습니다.

**요약**

| | 저장 | 시점 조회 | 버전 비교 | 위험 |
|---|---|---|---|---|
| A 델타 | 변경분만 | v1부터 재적용 (느림) | 재구성 후 비교 | 옛 포맷 바뀌면 복원 불능 |
| B 덮어쓰기 | 한 행 UPDATE | 과거 복원 어려움 | 과거 본문 없음 | 과거 스냅샷 소실 |
| C 스냅샷 | 행 전체 복사 | 쿼리 한 번 | 두 행 비교 | append-only라 안전 |

📍 `prisma/schema.prisma:85-103` — `PurchaseOrderVersion`가 스냅샷 테이블. 5개 발주 필드 + `versionNo` + `[validFrom, validTo)` 유효 구간을 행마다 보유.
📍 시점 조회 한 방 쿼리: `purchase-orders.repository.ts:161-169` (`findVersionAt`). 버전 비교 한 방: `purchase-orders.service.ts:175-203` (`compareVersions`).

### Q2. 스냅샷은 행 전체를 복사해서 저장 공간이 낭비되는데, 문제가 안 된다고 본 근거는?

도메인 특성 때문입니다. 발주서 한 건의 필드는 5개(상품명·수량·단가·납기·사양)뿐이고, 변경은 "승인된 변경 요청"이 있을 때만 발생해서 자주 생기지 않습니다. 즉 행 복사 비용이 누적될 만한 상황이 거의 없습니다. 트레이드오프를 인지한 상태에서, 이 도메인에서는 단점이 실질적 문제가 되지 않는다고 판단해 단순함·조회 성능을 택했습니다.

📍 `change-requests.repository.ts:78-90` — 승인 트랜잭션 안에서만 새 버전 행을 create. 즉 행 복사는 "승인" 경로에서만 발생.

### Q3. 필드가 100개로 늘거나 변경이 초당 수천 건 일어나면 이 설계를 유지할 건가요?

그 시점이 갈아탈 신호입니다. 행이 비대해지거나 쓰기 빈도가 높아지면 스냅샷 복사 비용이 무시 못할 수준이 되니, (A) 델타 저장 + 주기적 스냅샷(checkpoint)을 섞은 하이브리드로 전환합니다. 예를 들어 N번마다 풀 스냅샷을 찍고 그 사이는 델타만 쌓으면, 조회 시 가장 가까운 스냅샷부터 델타를 적용해 재적용 비용을 상수로 제한할 수 있습니다. 처음부터 그렇게 안 한 이유는 현재 요구사항에 과한 복잡도이기 때문입니다(YAGNI).

📍 현재 적용 로직이 `change-requests.service.ts:81-115` (`applyChanges`)에 격리돼 있어, 하이브리드로 갈아탈 때 이 메서드와 `applyApproval`만 손대면 됨(나머지 조회 경로는 무영향).

### Q4. valid_from은 inclusive, valid_to는 exclusive로 비대칭으로 정한 이유는?

`[valid_from, valid_to)` 반열림 구간으로 잡으면 인접 버전의 경계 시점이 정확히 한 버전에만 속합니다. v1의 `valid_to`와 v2의 `valid_from`이 같은 시각인데, 둘 다 inclusive면 그 경계 시점에 두 버전이 동시에 매칭돼서 `findFirst`가 어느 걸 줄지 비결정적이 됩니다. exclusive로 잡아서 `validFrom <= at AND (validTo > at OR validTo IS NULL)` 조건이 어떤 시점을 넣어도 정확히 한 버전만 반환하도록 보장했습니다.

📍 `purchase-orders.repository.ts:162-168` — `validFrom: { lte: at }`, `OR: [{ validTo: { gt: at } }, { validTo: null }]`. `lte`(inclusive) + `gt`(exclusive)가 정확히 그 비대칭.
📍 경계가 "딱 맞물리게" 쓰이는 곳: `change-requests.repository.ts:73-88` — 직전 버전 `validTo`에 `reviewedAt`을 찍고(line 75), 새 버전 `validFrom`에 같은 `reviewedAt`을 찍음(line 88). 그래서 그 경계 시각은 새 버전에만 속함.

### Q5. current_version 컬럼은 사실상 캐시인데 왜 중복을 뒀고, 불일치 위험은 어떻게 막나요?

`validTo IS NULL`인 행을 찾으면 최신 버전을 알 수 있어 이론상 불필요하지만, 발주서 단건 조회처럼 빈번한 경로에서 매번 버전 테이블을 뒤지는 걸 피하려고 포인터로 들고 있습니다. 불일치 위험은 승인 트랜잭션 안에서 막습니다. `applyApproval`이 ① 직전 버전 `valid_to` 마감 ② 새 버전 insert ③ `current_version` 갱신을 한 트랜잭션으로 처리하므로, 셋이 함께 커밋되거나 함께 롤백돼서 중간 상태가 외부에 노출되지 않습니다.

📍 컬럼 정의: `prisma/schema.prisma:47` (`currentVersion`).
📍 포인터로 읽는 빈번 경로: `purchase-orders.repository.ts:66-73` (`findById`가 `currentVersion`으로 버전 행을 바로 조회).
📍 세 단계를 한 트랜잭션으로 묶는 곳: `change-requests.repository.ts:58-98` (`applyApproval`) — ① line 73-76, ② line 78-90, ③ line 92-95.

### Q6. 시점 조회를 자정이 아니라 그날의 끝(23:59:59.999)으로 잡은 이유는?

사용자는 날짜(YYYY-MM-DD)만 주는데, 그날 오후에 승인된 버전도 그 날짜로 조회되길 기대합니다. 자정(00:00) 기준으로 잡으면 그날 안에 생성·승인된 버전은 `valid_from`이 자정보다 뒤라 누락됩니다. 그래서 `kstEndOfDay`로 그 날의 끝 시각으로 변환해, "그 날짜 안에 존재했던 마지막 버전"이 잡히도록 했습니다.

📍 `common/utils/date-format.ts:13-26` (`kstEndOfDay`) — line 17에서 `T23:59:59.999+09:00`로 그날 끝 시각 생성.
📍 호출부: `purchase-orders.service.ts:164-168` (`findSnapshot`).
⚠️ 참고로 Swagger 설명(`purchase-orders.controller.ts:138`)에는 "KST 자정 기준"이라고 적혀 있어 실제 동작(그날 끝)과 문구가 어긋납니다. 면접에서 지적받기 전에 "문서 문구가 실제 구현과 불일치, 코드가 정답"이라고 먼저 짚으면 좋습니다.

---

## 2. 동시성 / 트랜잭션

### Q7. 동시 승인 시나리오를 어떻게 막나요?

`applyApproval` 트랜잭션 첫 단계에서 `updateMany({ where: { id, status: PENDING }, data: { status: APPROVED, ... } })`로 선점합니다. 두 검토자가 동시에 같은 요청을 승인하려 해도, 이 조건부 업데이트는 DB가 해당 행에 쓰기 잠금을 잡고 원자적으로 평가하므로 한쪽만 1건을 갱신하고 다른 쪽은 0건이 됩니다. `count === 0`이면 이미 처리됐다고 보고 `ConflictException`을 던져 트랜잭션 전체를 롤백합니다.

📍 `change-requests.repository.ts:60-71` — 조건부 `updateMany`(line 60-68) + `if (claimed.count === 0) throw ConflictException`(line 69-71).

### Q8. findById로 상태 확인 후 update하는 것과 조건부 updateMany의 차이는?

전자는 TOCTOU(check-then-act) 레이스가 있습니다. 두 요청이 모두 `findById`에서 PENDING을 읽은 뒤 둘 다 update를 실행하면 둘 다 승인 처리되고 버전이 두 개 생깁니다. 검사와 변경 사이에 틈이 있기 때문입니다. 조건부 `updateMany`는 "PENDING인 경우에만 APPROVED로"를 DB 한 번의 원자 연산으로 합쳐서 그 틈을 없앱니다. 참고로 Service의 review에 있는 `findById` 상태 체크는 사용자 친화적 빠른 실패용일 뿐이고, 동시성 보증은 트랜잭션 내부의 조건부 업데이트가 담당합니다.

📍 "빠른 실패용" 사전 체크: `change-requests.service.ts:26-32` (`findById` 후 PENDING 아니면 Conflict).
📍 진짜 동시성 보증: `change-requests.repository.ts:60-71` (트랜잭션 내 조건부 `updateMany`). 둘의 역할 분담이 핵심.

### Q9. 변경 요청 생성 시 pg_advisory_xact_lock을 쓴 이유는? 유니크 제약이나 사전 체크로 부족한가요?

막으려는 건 "같은 발주서에 PENDING 변경 요청이 동시에 2개 생기는 것"입니다. `existsPendingChangeRequest` 체크만 있으면 두 요청이 동시에 "없음"을 읽고 둘 다 insert하는 레이스가 있습니다. 그리고 이건 유니크 제약으로 막기 어렵습니다. "PENDING일 때만 유일"이라는 부분 유니크 인덱스가 필요한데, 상태가 여러 값을 갖는 한 일반 유니크로는 표현이 안 됩니다(Postgres partial unique index로는 가능하지만 별도 설계 필요). 그래서 `purchaseOrderId`를 키로 advisory lock을 잡아 같은 발주서에 대한 생성 요청을 직렬화했습니다.

📍 `purchase-orders.repository.ts:128-149` (`createChangeRequest`) — line 129 `pg_advisory_xact_lock(${purchaseOrderId})`, line 131-139 락 획득 후 PENDING 재확인.

### Q10. Service에서 한 번, 트랜잭션 안에서 또 한 번 — 왜 두 번 체크하나요?

더블 체크드 락킹 패턴입니다. Service의 첫 체크는 락을 잡기 전이라 정확성 보증은 아니고, 대부분의 정상 요청을 락 비용 없이 빠르게 걸러내는 최적화입니다. 정확성은 트랜잭션 안에서 advisory lock을 획득한 뒤 다시 한 PENDING 재확인이 담당합니다. 락을 잡은 이후의 체크라야 "검사~insert" 구간이 직렬화되어 신뢰할 수 있습니다.

📍 첫 체크(락 밖, 최적화): `purchase-orders.service.ts:133-135`.
📍 두 번째 체크(락 안, 정확성): `purchase-orders.repository.ts:131-139`. line 129의 락 → line 131 재확인 → line 141 insert 순서가 직렬화 보장.

### Q11. advisory lock 키로 purchaseOrderId를 그대로 넘기는데 다른 도메인과 충돌할 수 있지 않나요?

맞습니다. 단일 인자 `pg_advisory_xact_lock(bigint)`은 전역 네임스페이스라 다른 도메인이 같은 정수를 쓰면 불필요하게 경합합니다. 개선하려면 2-인자 버전 `pg_advisory_xact_lock(classid, objid)`을 써서 첫 인자에 "변경요청 생성"용 네임스페이스 상수를 넣어 도메인별로 키 공간을 분리하면 됩니다.

📍 현재 단일 인자 형태: `purchase-orders.repository.ts:129` — `SELECT pg_advisory_xact_lock(${input.purchaseOrderId})`. 여기에 네임스페이스 상수를 첫 인자로 추가하는 게 개선안.

### Q12. applyApproval 트랜잭션의 격리 수준은? advisory lock 없이 Serializable로 같은 보장을 얻을 수 있나요?

명시하지 않았으므로 Postgres 기본인 Read Committed입니다. 승인 쪽은 조건부 `updateMany`의 행 잠금으로 충분해 추가 락이 필요 없습니다. 변경 요청 생성 쪽의 "PENDING 없음" 같은 조건은 존재하지 않는 행에 대한 판단이라 Read Committed에서는 막히지 않습니다. Serializable로 올리면 직렬화 이상(phantom 포함)을 잡아주지만, 충돌 시 직렬화 실패로 재시도 로직이 필요하고 전체 트랜잭션 비용이 올라갑니다. 이 한 지점만 직렬화하면 되는 상황이라 advisory lock이 더 국소적이고 가벼운 선택이었습니다.

📍 격리 수준 미지정 = 기본값: `change-requests.repository.ts:59`와 `purchase-orders.repository.ts:128`의 `$transaction(...)` 호출에 옵션 인자 없음 → Read Committed.
📍 승인은 행 잠금으로 충분: `change-requests.repository.ts:60`(`updateMany`가 기존 행을 잠금). 생성은 phantom이라 행 잠금 불가 → 그래서 line 129 advisory lock.

### Q13. 동시 승인 방어선이 여러 겹인데 각각 무슨 케이스를 막나요?

세 겹입니다. ① 조건부 `updateMany`(PENDING 선점): 같은 요청을 동시 승인하는 경우를 막습니다. ② `(purchase_order_id, version_no)` 복합 유니크: 어떤 이유로든 같은 버전 번호 insert가 두 번 시도되면 DB가 거부해 최후의 안전망 역할을 합니다. ③ 트랜잭션: ①~insert~포인터 갱신을 원자화합니다. 응용 로직(①)과 DB 제약(②)을 둘 다 둬서, 코드가 틀려도 데이터 정합성이 깨지지 않게 했습니다.

📍 ① `change-requests.repository.ts:60-71` (조건부 `updateMany`).
📍 ② `prisma/schema.prisma:101` — `@@unique([purchaseOrderId, versionNo], map: "uq_po_version")`.
📍 ③ `change-requests.repository.ts:59-98` (`$transaction`이 ①~③ 전체를 감쌈).

---

## 3. NestJS 아키텍처

### Q14. Controller → Service → Repository 3계층으로 나눈 이유는?

책임을 분리해 테스트와 변경을 쉽게 하기 위해서입니다. Controller는 HTTP 입출력만, Service는 비즈니스 규칙(존재·권한·상태 검증), Repository는 데이터 접근만 담당합니다. Repository를 분리하면 Service 테스트에서 Prisma를 직접 mock하지 않고 Repository만 `jest.fn()`으로 대체해 비즈니스 로직만 격리 검증할 수 있고, 나중에 ORM이나 쿼리 방식을 바꿔도 Service는 그대로 둘 수 있습니다.

📍 Controller(HTTP만): `purchase-orders.controller.ts:25-27` 등 — Service 호출 후 반환만.
📍 Service(규칙): `purchase-orders.service.ts:24-43` (존재·역할 검증).
📍 Repository(데이터 접근만): `purchase-orders.repository.ts:34-58`.
📍 계층 규약은 `src/CLAUDE.md`에 명문화돼 있음.

### Q15. 비즈니스 로직은 Service, 예외도 Service에서 던지는 경계 기준은?

"이 판단에 도메인 규칙이 들어가는가"가 기준입니다. "발주서가 CONFIRMED 상태여야 변경 요청 가능", "buyer 본인만 제출 가능" 같은 규칙은 Service에 둡니다. Repository는 `T | null`을 반환만 하고, null을 받아 `NotFoundException`을 던질지는 Service가 정합니다. 예외를 Service에 모으면 HTTP 의미(404/403/409)와 도메인 규칙이 한곳에 있어 흐름을 읽기 쉽습니다.

📍 "CONFIRMED여야 변경 가능": `purchase-orders.service.ts:127-131`.
📍 "buyer 본인만 제출": `purchase-orders.service.ts:64-66`.
📍 Repository는 null 반환만: `purchase-orders.repository.ts:60-64` (`findById`가 null 반환) → null 판단은 Service `purchase-orders.service.ts:46-49`.

### Q16. 전역 인터셉터와 익셉션 필터의 실행 시점/순서는?

정상 흐름에서는 핸들러가 반환한 값이 `TransformInterceptor`를 거쳐 `{ success: true, statusCode, message, data, timestamp, path }`로 래핑됩니다. 핸들러나 그 하위에서 예외가 던져지면 인터셉터의 정상 매핑을 타지 않고 `AllExceptionsFilter`가 잡아 `{ success: false, ... }`로 변환합니다. 즉 성공은 인터셉터, 실패는 필터가 책임지고, 둘 다 `main.ts`에서 전역 등록돼 새 컨트롤러를 추가해도 별도 작업이 필요 없습니다.

📍 성공 래핑: `common/interceptors/transform.interceptor.ts:29-37`.
📍 실패 래핑: `common/filters/all-exceptions.filter.ts:39-47`.
📍 전역 등록: `main.ts:14-15`.
📍 204/빈 body는 래핑 제외: `transform.interceptor.ts:26-28`.

### Q17. path param은 ParseIntPipe로 변환하면서 query의 from/to는 왜 Service에서 Number()로 변환하나요?

의도적 구분입니다. `id`·`versionNo` 같은 path param은 형식이 틀리면 그 자체로 잘못된 경로이므로 파이프 단에서 400으로 빠르게 거부하는 게 맞습니다. 반면 diff의 `from`/`to`는 "양의 정수"라는 도메인 규칙 검증이 필요해서, 단순 정수 변환을 넘어 `Number.isInteger && >= 1`까지 Service에서 함께 검증하고 `BadRequestException`을 던집니다. 검증 책임을 한곳에 모으려고 query는 문자열로 받아 Service에서 처리했습니다. (snapshot의 `at`도 같은 이유로 문자열로 받아 `kstEndOfDay`에서 형식 검증)

📍 path param은 파이프: `purchase-orders.controller.ts:34` (`@Param('id', ParseIntPipe)`), `:111` (`versionNo`).
📍 query는 문자열로 받음: `purchase-orders.controller.ts:126-127` (`@Query('from') from: string`).
📍 Service에서 양의 정수 검증: `purchase-orders.service.ts:186-190`.
📍 `at`도 문자열 → 형식 검증: `purchase-orders.service.ts:164-167` + `date-format.ts:14-15`.

### Q18. whitelist: true, forbidNonWhitelisted: true를 준 이유는?

`whitelist`는 DTO에 정의되지 않은 속성을 자동으로 제거하고, `forbidNonWhitelisted`는 그런 속성이 들어오면 아예 400으로 거부합니다. 클라이언트가 `status`나 `currentVersion` 같은 서버 제어 필드를 body에 끼워 넣어 의도치 않게 덮어쓰는 mass-assignment류 문제를 차단합니다. `transform: true`는 들어온 평문 객체를 DTO 인스턴스로 변환해 타입과 데코레이터 검증이 동작하게 합니다.

📍 `main.ts:11-13` — `new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.

---

## 4. 검증 / 데이터 무결성

### Q19. IsValidChanges 커스텀 밸리데이터를 직접 만든 이유는?

`changes`는 `{ "quantity": { "new": 1500 } }`처럼 키마다 허용 필드인지, 값 타입이 그 필드에 맞는지(수량은 1 이상 정수, 단가는 양수, 사양은 객체 등) 검증해야 합니다. 이건 동적 키를 가진 JSON 구조라 `@IsString` 같은 정적 데코레이터 조합으로는 표현이 안 됩니다. 그래서 화이트리스트 필드와 필드별 타입 규칙을 한 곳에서 검증하는 커스텀 밸리데이터를 만들었습니다.

📍 `purchase-orders/dto/is-valid-changes.validator.ts` 전체 — 허용 필드 `ALLOWED_FIELDS`(line 3), 필드별 타입 규칙 `isValidNewValue`(line 15-28), 데코레이터 등록 `IsValidChanges`(line 49-63).

### Q20. applyChanges는 모르는 키를 무시하고 DTO 검증은 거부합니다. 화이트리스트가 두 군데 중복 아닌가요?

역할이 다릅니다. DTO의 `IsValidChanges`는 입력 경계에서 허용되지 않은 키를 거부하는 1차 방어선이고, `applyChanges`의 switch는 검증을 통과한 데이터를 실제 컬럼에 매핑하는 단계라 방어적으로 모르는 키는 무시합니다. 다만 화이트리스트가 두 곳에 있는 건 인지하고 있고, 필드 목록이 늘면 한쪽만 고치는 실수가 가능합니다. 개선한다면 허용 필드와 타입 변환 규칙을 한 모듈로 모아 검증과 적용이 같은 소스를 참조하게 만들 겁니다.

📍 1차 방어선(거부): `is-valid-changes.validator.ts:3` (`ALLOWED_FIELDS`).
📍 매핑(모르는 키 무시): `change-requests.service.ts:96-112` (`applyChanges`의 switch — default 없이 빠짐).
📍 → 두 곳의 필드 목록이 같은 의미를 중복 보유.

### Q21. unit_price는 Decimal(12,2)인데 JS number로 다루면 오차가 납니다. 어떻게 막나요?

단가는 끝까지 문자열로 다룹니다. 현재 버전을 복사할 때 `current.unitPrice.toString()`으로 받고, 변경 적용 시에도 `String(newValue)`로 저장합니다. diff 비교도 `toString()`끼리 문자열 비교합니다. JS number(IEEE 754)로 변환하는 순간 0.1 같은 값에서 오차가 생기므로, Decimal은 number로 거치지 않고 문자열 그대로 Prisma에 넘겨 정밀도를 보존합니다.

📍 컬럼: `prisma/schema.prisma:91` (`@db.Decimal(12, 2)`).
📍 복사 시 문자열: `change-requests.service.ts:88` (`unitPrice: current.unitPrice.toString()`).
📍 적용 시 문자열: `change-requests.service.ts:104` (`next.unitPrice = String(newValue)`).
📍 diff도 문자열 비교: `purchase-order-version-diff-response.dto.ts:51-55`.

### Q22. findById에서 버전을 못 찾으면 HttpException이 아니라 Error를 던지는데 왜 구분했나요?

의미가 다른 두 상황을 다르게 다루기 위해서입니다. "발주서가 없음"은 클라이언트가 잘못된 id를 준 정상적인 4xx 상황이라 `NotFoundException`(404)입니다. 반면 "발주서는 있는데 `current_version`이 가리키는 버전 행이 없음"은 일어나서는 안 되는 데이터 무결성 위반입니다. 이건 클라이언트 잘못이 아니라 서버/데이터 버그이므로 일반 Error로 던져 필터가 500으로 처리하게 하고, 로그에 스택을 남겨 원인을 추적하도록 의도적으로 구분했습니다.

📍 "발주서 없음" → null 반환 후 404: `purchase-orders.repository.ts:62-63` + `purchase-orders.service.ts:47-49`.
📍 "버전 행 없음" → 일반 Error(=500): `purchase-orders.repository.ts:75-79`.
📍 일반 Error가 500+스택로그로 처리되는 곳: `all-exceptions.filter.ts:35-37` (HttpException 아닌 경우 `logger.error(stack)`).

---

## 5. 시간대 / 직렬화

### Q23. Timestamptz를 쓰는데도 KST offset을 수동으로 더하는 이유는?

저장은 UTC(Timestamptz)로 정확히 하되, 응답 표현만 KST로 고정하기 위해서입니다. 서버나 컨테이너의 로컬 타임존 설정에 응답 포맷이 좌우되면 환경마다 결과가 달라지므로, `toKstIsoString`에서 명시적으로 +9시간 후 `+09:00` 표기를 붙여 어떤 환경에서 띄워도 동일한 KST 문자열이 나오게 했습니다. 시점 조회의 `kstEndOfDay`도 같은 맥락으로 KST 기준 하루 경계를 명시적으로 계산합니다.

📍 저장 타입: `prisma/schema.prisma:95-96` (`validFrom`/`validTo` `@db.Timestamptz`).
📍 응답 표현 고정: `date-format.ts:1-5` (`KST_OFFSET_MS`, `toKstIsoString`).
📍 하루 경계 명시 계산: `date-format.ts:13-26` (`kstEndOfDay`).

### Q24. deepConvertDatesToKst로 응답의 모든 Date를 재귀 변환하는데 성능/예외는?

응답 DTO는 필드 수가 적어 재귀 비용이 작아 현재는 문제가 없습니다. 다만 `spec` 같은 JSONB는 사용자 입력이라 깊거나 클 수 있어, 매우 큰 객체에서는 전체 순회 비용이 생길 수 있습니다. 실무라면 변환 대상을 응답 스키마가 아는 Date 필드로 한정하거나, 직렬화 단계에서 처리하는 방식으로 바꿔 임의 깊이의 사용자 JSON을 전부 도는 일을 피하겠습니다.

📍 `date-format.ts:28-43` (`deepConvertDatesToKst` — 배열/객체 재귀).
📍 모든 응답에 무조건 적용되는 지점: `transform.interceptor.ts:34` (`deepConvertDatesToKst(data)`). spec이 응답에 실리면 여기서 전부 순회됨.

---

## 6. 테스트 전략

### Q25. Service는 Repository를 mock하고, Repository는 실제 DB로 테스트하라고 한 이유는?

각 계층의 책임만 격리해서 검증하기 위해서입니다. Service 테스트는 비즈니스 규칙(상태·권한·예외)이 목표라 Repository를 mock해서 DB 없이 빠르게 분기들을 검증합니다. 반대로 Repository는 Prisma 쿼리·트랜잭션·advisory lock이 실제로 의도대로 도는지가 핵심이라 mock하면 의미가 없어, 실제 DB로 검증해야 진짜 동작을 확인할 수 있습니다.

📍 규약 명문화: `src/CLAUDE.md` "테스트" 섹션 — "Service 테스트: Repository를 `jest.fn()`으로 mock", "Repository 테스트: 실제 DB 연결로 검증(mock 금지)".
📍 대상 파일: `*.service.spec.ts`(mock) vs `*.repository.spec.ts`(실 DB).

### Q26. 동시성 로직은 단위 테스트로 검증이 어려운데 어떻게 테스트했나요?

단위 테스트로는 레이스를 재현할 수 없어, 실제 DB에 같은 변경 요청을 `Promise.all`로 동시에 여러 번 승인 요청하고 정확히 한 건만 성공·나머지는 `ConflictException`인지, 그리고 버전이 하나만 늘었는지를 확인하는 방식으로 검증합니다. 변경 요청 동시 생성(advisory lock)도 같은 발주서에 동시 생성 요청을 던져 PENDING이 하나만 생기는지 확인합니다.

📍 검증 대상 코드: 승인 경합 `change-requests.repository.ts:60-71`, 생성 경합 `purchase-orders.repository.ts:128-149`.
📍 테스트 파일: `change-requests.repository.spec.ts`, `purchase-orders.repository.spec.ts`(실 DB).

> ⚠️ **솔직 체크 필요.** 위 두 spec 파일에 실제로 `Promise.all` 동시성 테스트가 들어있는지 면접 전에 확인하세요. 답변과 코드가 어긋나면 신뢰를 잃습니다.

---

## 7. 확장성 / 한계 (역량 어필)

### Q27. 다단계 승인(결재 라인)으로 확장하려면?

현재 `change_request`의 단일 `reviewer_id`/`status`로는 부족하니, 승인 단계를 별도 테이블(`approval_step`: `change_request_id`, `step_order`, `approver_id`, `status`)로 분리합니다. 변경 요청은 모든 단계가 APPROVED가 됐을 때만 버전 적용 트랜잭션을 타게 하고, 중간 단계 거부 시 전체를 REJECTED로 마감합니다. 버전 생성 트랜잭션 자체는 마지막 단계 통과 시점에 지금 구조 그대로 재사용할 수 있습니다.

📍 현재 단일 reviewer 구조: `prisma/schema.prisma:72-74` (`reviewerId`/`reviewComment`/`reviewedAt`).
📍 마지막 단계 통과 시 재사용할 트랜잭션: `change-requests.repository.ts:58-98` (`applyApproval` 그대로 호출).

### Q28. 버전·이력 조회에 페이지네이션이 없는데 버전이 수천 개로 늘면?

현재는 변경이 드물어 미적용했지만, 목록 조회에 커서 기반 페이지네이션(`versionNo` 또는 `createdAt` 커서)을 추가하겠습니다. 시점/단건 조회는 인덱스로 한 건만 가져오니 영향이 없고, `(purchase_order_id, valid_from)` 또는 `(purchase_order_id, valid_to)`에 인덱스를 둬서 시점 조회 쿼리가 풀스캔 없이 동작하도록 보강하겠습니다.

📍 페이지네이션 없는 목록 조회: `purchase-orders.repository.ts:112-117` (`findApprovalHistories` — `findMany` 전체 반환).
📍 인덱스 보강이 필요한 시점 조회: `purchase-orders.repository.ts:161-169` (`findVersionAt`의 `validFrom`/`validTo` 조건).
📍 현재 인덱스는 `@@unique([purchaseOrderId, versionNo])` 하나뿐: `prisma/schema.prisma:101`. `valid_from`/`valid_to` 복합 인덱스는 없음.

### Q29. requesterId/reviewerId를 body로 받는 방식의 보안 문제와 개선은?

가장 큰 한계입니다. 본인이 누구인지를 클라이언트가 보내는 값으로 믿기 때문에, 아무 id나 넣어 타인을 사칭할 수 있습니다(권한 우회). 실서비스에서는 인증 토큰(JWT/세션)에서 사용자 식별자와 역할을 꺼내 쓰고, body의 id는 받지 않거나 토큰 주체와 일치하는지 검증해야 합니다. NestJS라면 `AuthGuard`로 인증을, `RolesGuard` + `@Roles()`로 SOURCING/BUYER 역할 인가를 선언적으로 처리해 Service의 역할 체크 로직을 가드로 끌어올리겠습니다. 이번 과제는 인증 범위 밖이라 역할을 명시적으로 받는 형태로 단순화했음을 전제로 둔 설계입니다.

📍 body로 신원을 받는 지점: `change-requests.controller.ts:26` (`ReviewChangeRequestDto`의 `reviewerId`), `purchase-orders.controller.ts:98` (`requesterId`).
📍 가드로 끌어올릴 역할 체크: `change-requests.service.ts:47-54` (`assertReviewerIsSourcing`), `purchase-orders.service.ts:29-31, 64-66, 88-90, 123-125`.

---

## 8. 기술 선택 — 왜 Prisma인가

### Q30. TypeORM이 아니라 Prisma를 고른 이유는?

핵심은 오류를 잡는 시점입니다. TypeORM은 잘못된 컬럼명·관계 누락 같은 실수가 컴파일 때 안 걸리고, 실제 쿼리가 DB에 나가는 런타임에야 터집니다. Prisma는 `schema.prisma`에서 타입을 생성해서, 없는 필드나 잘못된 타입을 쓰면 tsc 단계에서 바로 실패합니다. 이력 스냅샷·버전 비교처럼 컬럼을 많이 다루는 이 과제에서, 오타 위험을 컴파일 타임으로 끌어올린 게 가장 큰 이점이었습니다.

추가로 `$transaction`·`$executeRaw`도 타입 안전하게 제공해, 승인 트랜잭션과 advisory lock 같은 raw SQL 지점에서도 파라미터 바인딩이 일관됩니다.

📍 타입의 단일 원천: `prisma/schema.prisma` → `@prisma/client` 타입 생성.
📍 타입 안전 트랜잭션/raw: `change-requests.repository.ts:59-98`, `purchase-orders.repository.ts:129`.

> **단서.** Prisma도 복잡한 동적 쿼리는 raw로 빠지고 마이그레이션이 덜 유연하다는 트레이드오프는 있다고 덧붙이면 균형이 좋습니다.

---

## 9. Node.js 동작 방식

### Q31. Node.js 동작 방식을 이 프로젝트와 엮어 설명한다면?

Node.js는 싱글 스레드 이벤트 루프 + 논블로킹 I/O입니다. DB 쿼리 같은 I/O는 OS에 넘기고 결과를 기다리는 동안 스레드를 멈추지 않아서, 여러 요청이 `await`로 DB를 기다리는 동안 다른 요청을 처리합니다.

여기서 핵심은 "싱글 스레드라 동시성 문제가 없다"는 오해입니다. `await` 지점마다 제어권이 넘어가 다른 요청이 끼어들 수 있어서, "PENDING 확인 → 업데이트" 사이 틈에서 TOCTOU 레이스가 그대로 납니다. 그래서 정확성을 메모리가 아니라 **DB 차원(조건부 `updateMany` 행 잠금, advisory lock)**에 맡겼습니다.

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
