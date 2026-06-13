# HTTP 파일 작성 지침

이 디렉터리는 IntelliJ HTTP Client(`.http` 파일)로 API를 수동 테스트하기 위한 요청 모음이다.

## 파일 구성

- 리소스별로 `<리소스>.http` 파일을 만든다. (예: `users.http`)
- 환경 변수는 `http-client.env.json`에 정의한다. `host` 등 환경별로 달라지는 값만 둔다.
- 비밀값(토큰, 비밀번호 등)은 `http-client.private.env.json`에 둔다. IDE가 git에서 기본 제외한다.
- 파일 첫 줄에 그 파일의 역할을 설명하는 한 줄짜리 한국어 주석을 단다.

## 작성 규칙

- 요청은 `###`로 구분한다. `###` 뒤에 한국어 설명을 적는다.
- 변수는 `{{변수명}}`으로 참조한다. `host`는 환경 파일에서 온다.
- 실행 전 우상단에서 환경(`local`)을 선택해야 `host`가 치환된다.

## 응답 구조 주의

이 프로젝트는 전역 `TransformInterceptor`가 모든 성공 응답을 다음 구조로 감싼다.

```json
{ "success": true, "statusCode": 200, "message": "OK", "data": ..., "timestamp": ..., "path": ... }
```

따라서 응답 본문에서 값을 꺼낼 때는 항상 `data` 아래로 들어간다. 단건 응답은 `data.id`, 목록 응답은 `data[0].id`처럼 참조한다. 204(예: DELETE)는 인터셉터가 감싸지 않고 빈 body를 반환한다.

## id 값 다루기

응답을 자동 캡처하는 전역 변수(`> {% client.global.set(...) %}`)는 쓰지 않는다. 경로 파라미터와 요청 본문의 id(예: `/users/1`, `"buyerId": 1`)는 **placeholder 리터럴**이다. 생성·조회 요청을 먼저 보낸 뒤, 그 응답의 `data.id`를 직접 복사해 다음 요청의 id 자리에 바꿔 넣고 실행한다.

## 실행 순서

요청 간 의존성이 있으면 순서대로 실행하고, 앞 응답에서 받은 id를 뒤 요청에 채워 넣는다. 파일 간 의존 순서는 다음과 같다.

1. `users.http` — BUYER와 SOURCING을 만들고 각 응답의 id를 메모해 둔다.
2. `purchase-orders.http` — BUYER의 id를 `buyerId`에 넣어 발주서를 만들고, 그 발주서 id로 변경 요청을 만든다.
3. `change-requests.http` — 변경요청 id를 경로에, SOURCING의 id를 `reviewerId`에 넣어 검토(승인/반려)한다. 승인 후 `purchase-orders.http`의 버전/diff 조회로 결과를 확인한다.
