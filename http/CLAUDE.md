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

## 이전 응답의 값 재사용

직전 요청의 응답 값을 다음 요청에 쓸 때는 **직접 참조 방식(`{{요청명.response.body...}}`)을 쓰지 않는다.** IDE가 요청을 보내기 전 변수를 치환하려다 응답이 없으면 "unsubstituted variable" 에러로 요청 자체를 막기 때문이다.

대신 **응답 핸들러 스크립트로 전역 변수에 저장**한 뒤 일반 변수처럼 참조한다.

```http
### 유저 전체 조회 (첫 번째 id를 전역 변수에 저장)
GET {{host}}/users

> {%
    client.global.set("firstUserId", response.body.data[0].id);
%}

### 유저 단건 조회 (저장된 변수 사용)
GET {{host}}/users/{{firstUserId}}
```

`{{firstUserId}}`는 일반 변수라 값이 없어도 요청을 막지 않는다. 저장하는 요청을 먼저 한 번 실행한 뒤 사용하는 요청을 실행한다.

## 실행 순서

요청 간 의존성이 있으면 순서대로 실행한다. 예를 들어 전역 변수에 id를 저장하는 조회를 먼저 실행해야 그 변수를 쓰는 단건 조회·삭제가 동작한다.
