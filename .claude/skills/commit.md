# commit

staged된 변경사항을 분석해서 Conventional Commits 형식의 커밋 메시지를 생성한다.

## 실행 순서

1. `git diff --staged`로 staged 변경사항을 확인한다. staged가 없으면 `git diff`로 unstaged도 확인한다.
2. 변경 내용을 분석해서 아래 컨벤션에 맞는 커밋 메시지 초안을 작성한다.
3. 초안을 사용자에게 보여준다.

## 커밋 메시지 컨벤션

```
<type>(<scope>): <subject>
```

- scope는 생략 가능
- subject는 한글로 작성

| 타입 | 용도 |
|------|------|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `refactor` | 동작 변경 없는 코드 정리 |
| `chore` | 빌드/설정/의존성 |
| `docs` | 문서만 변경 |

## 예시

```
feat(auth): 소셜 로그인 추가
fix(api): 토큰 만료 처리 버그 수정
chore: 의존성 업데이트
```
