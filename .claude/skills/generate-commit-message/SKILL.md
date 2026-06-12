---
name: generate-commit-message
description: 변경사항을 분석해 Conventional Commits 형식의 한글 커밋 메시지 초안을 작성한다. 사용자가 "커밋 메시지", "commit message", "커밋 메시지 만들어/생성/작성", "이 변경 커밋해줘" 등을 말하거나, 코드 변경을 마친 뒤 커밋을 준비할 때 반드시 이 스킬을 사용한다. 다른 스킬(예: generate-api) 완료 후 커밋 메시지가 필요한 경우에도 사용한다.
---

# Generate Commit Message

staged된 변경사항을 분석해 Conventional Commits 형식의 커밋 메시지 **초안**을 작성한다. 이 스킬은 초안 작성까지만 담당하며, 실제 커밋은 사용자가 직접 실행한다.

## 실행 순서

1. `git diff --staged`로 staged 변경사항을 확인한다. staged된 변경이 없으면 `git diff`로 unstaged 변경도 확인한다. 둘 다 비어 있으면 변경사항이 없음을 알리고 중단한다.
2. 변경 내용을 분석해 아래 컨벤션에 맞는 커밋 메시지 초안을 작성한다. 변경이 여러 관심사로 나뉘면 그 사실을 알리고, 가장 핵심이 되는 변경을 기준으로 메시지를 제안한다.
3. 초안을 코드 블록으로 사용자에게 보여준다. 사용자가 직접 커밋하도록 안내하고, 이 스킬에서는 `git commit`을 실행하지 않는다.

## 커밋 메시지 컨벤션

```
<type>(<scope>): <subject>
```

- `scope`는 생략 가능하다. 변경이 특정 모듈/도메인에 한정되면 그 이름을 쓴다 (예: `purchase-orders`, `prisma`).
- `subject`는 **한글**로, 명령형·간결하게 작성한다. 마침표로 끝내지 않는다.

| 타입 | 용도 |
|------|------|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `refactor` | 동작 변경 없는 코드 정리 |
| `chore` | 빌드/설정/의존성 |
| `docs` | 문서만 변경 |
| `test` | 테스트 추가·수정만 |

## 예시

```
feat(auth): 소셜 로그인 추가
fix(api): 토큰 만료 처리 버그 수정
refactor(prisma): PK/FK 타입을 BigInt에서 Int로 전환
chore: 의존성 업데이트
```

## 커밋 실행

이 스킬은 커밋 메시지 초안 작성까지만 한다. 실제 커밋은 사용자가 직접 실행한다.
