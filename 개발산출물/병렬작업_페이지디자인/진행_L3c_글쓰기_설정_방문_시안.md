# 진행 L3c 글쓰기·글 상세, 설정, 방문 페이지 — 감사 + 시안

상태: **대기**
추천 AI: **시니어** · 브랜치: `design/mock-compose-settings-visit` · PR: (번호) · 코드 수정 없음(시안 HTML + 이 파일만)

## 시작 멘트

```
페이지 디자인 병렬 작업 L3c(글쓰기·글 상세, 설정, 방문 페이지 감사 + 시안)를 시작해. 나는 D야. 코드는 고치지 마.

먼저 읽어: 개발산출물/병렬작업_페이지디자인/README.md(규칙), 이 파일, DESIGN.md "원칙 (확정)"(글자와 공간 규칙 7개)·"페이지 적용 레시피"·결정 기록(주 버튼 무광 판, 곡률 위계, 홈 큐브 파사드), 개발산출물/시안/홈_파사드_큐브_시안.html(기준 재질), 개발산출물/시안/방문_페이지_시안.html(방문 페이지 기존 시안, 도서관 룩은 M2라 바꾸지 않음), 대상 코드(mobile/app/posts/new.tsx, mobile/app/posts/[postId].tsx, mobile/src/features/local-feed/, mobile/app/settings.tsx, mobile/app/libraries/[libraryId].tsx)와 계약 ../team/contracts/local-feed.md·library-visit.md·auth.md의 화면 칸.

선행 조건: 문서 PR(design/page-pass-1)이 main에 머지됐는지. 아니면 시작하지 말고 알려 줘.
git: 최신 main에서 새 브랜치 design/mock-compose-settings-visit. gh는 axteamc 레포에서만 Hunseokc로, 끝나면 choise-hun 복구.

시작 전에: 웹 390·1280 스크린샷으로 지금 모습(EXPO_PUBLIC_API_URL=http://localhost:8000). 이 PC 로컬 DB는 시험 데이터라 visit·compose·detail은 웹 검사에서 데이터 없음으로 실패한다(디자인과 무관) — 시안은 가짜 데이터로 그린다.

할 일: ① 감사 — 네 화면이 레시피 표와 다른 점 목록, 700·600이 남은 곳, 노랑 채움 직접 사용처(ComposeScreen·PostMenu·VisitScreen·ReactionButton). ② 중심 요소 — 후보 3개씩(예상: 글쓰기 입력 칸·사진 자리, 방문 페이지는 레시피만이라 거의 없음), 나머지는 기본값(Claude). 설정은 레시피만 예상. ③ 시안 HTML 하나(개발산출물/시안/글쓰기_설정_방문_파사드_시안.html). ④ 브라우저로 열어 보여 주고 고를 것만 질문으로 끝내기(D에게 이유 묻지 않기).
건드리지 말 것: 코드, 공용 문서, 계약서, 방문 페이지 도서관 룩(M2).
끝나면: 이 파일 상태·감사 결과·후보·"D 세션에 넘길 것" 맞추고 커밋(push·PR은 내가 말할 때).
```

## 감사 결과

(웹 390·1280 스크린샷 경로와 레시피 대비 차이 목록)

## 중심 요소 후보와 D 결정

| 요소 | 후보 | 추천 | D 결정 |
| --- | --- | --- | --- |
| | | | 대기 |

## 진행 기록

(짧게)

## D 세션에 넘길 것

(결정 기록 행, 레시피에 더할 것, 계약과 어긋나는 점)
