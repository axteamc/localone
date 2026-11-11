# 결과: SET-0 거버넌스 규칙 및 문서 구조 초기화

> **2026-11-11 전환:** 여기 적힌 시니어/주니어 AI 협업 체계(GEMINI.md·AGENTS.md·협업_시니어주니어·4단계 템플릿 등)는 폐기했다. 팀 작업 방식은 `../team/CLAUDE.md`(axteamc/team, private)를 따른다. 이 파일은 당시 기록으로만 둔다.

- **일시:** 2026-11-10
- **수행자:** Antigravity (Gemini)
- **대상 브랜치:** main (초기화)

## 1. 수행 내용

`~/config` 및 ULevelP 검증 거버넌스 체계를 바탕으로 `localone` 프로젝트에 표준 AI 협업 체계를 반영함:
1. **AI 에이전트 3대 규칙 세팅:**
   - `GEMINI.md`: Antigravity / Gemini 작업 규칙 (최신 4단계 협업, 골디락스 Step 분할, Pre-flight 5대 관문, 13대 실수 방지 가드레일)
   - `CLAUDE.md`: Claude Code 작업 규칙 (메뉴얼 vs 자유, 진행 파일 라이프사이클)
   - `AGENTS.md`: OpenAI Codex / GPT 작업 규칙 (계약 변경 승인, 골디락스 분할, 핀포인트 검증)
2. **문서 운영 및 도메인 규칙 (`docs/`):**
   - `docs/문서_운영.md`: 목적별 기준 문서, 갱신 순서, 4대 완료 판정(구현/화면/통합/운영), 대기능 3~4 Step 골디락스 가이드
   - `docs/rules/`: `backend-kotlin.md`, `frontend-state.md`, `frontend-layout.md`, `testing-security.md`
3. **협업 산출물 템플릿 (`개발산출물/`):**
   - `개발산출물/협업_시니어주니어.md`: 2층 설계 원칙, 8대 필수 항목, 4단계 협업 체계
   - `개발산출물/주니어_체크리스트.md`: 주니어 셀프 점검 및 리뷰 피드백 동적 누적
   - `개발산출물/프롬프트_템플릿_4단계.md`: 시니어 GPT ↔ 주니어 Gemini 4단계 협업 프롬프트
   - `개발산출물/프론트_정렬규격.md`: 화면 배치 약속(`data-align-group`), G0~G8 자동 검사 규격
   - `개발산출물/인수인계_메모.md`: PC/세션 간 인수인계 템플릿
   - `개발산출물/진행_프로젝트_설정.md`: 초기 프로젝트 설정 관리
4. **Git 환경 설정:**
   - `.gitattributes`: `* text=auto eol=lf`
   - `.gitignore`: Mac, IDE, Node, Gradle, Python, 시크릿 등 무시 규칙
   - 디렉토리 구조: `개발산출물/명세`, `결과`, `완료`, `계획`

## 2. 검증 결과

- 모든 파일 UTF-8 LF 생성 확인
- 프로젝트 고유 식별자 일반화 및 무결성 확인
- 디렉토리 구조 정상 구성 확인
