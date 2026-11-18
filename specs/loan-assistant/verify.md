# 반납 비서 LOAN-1 검증서 (verify.md)

- 기능: `loan-assistant` LOAN-1(빌렸어요·D-day 타이머) · 담당: C · 대상 PR: #168 · 작성일: 2026-11-18
- 기준: 02 LOAN-01(AC-LOAN, AC-DATE), AC-ISOLATION, AC-RACE, 계약서 `contracts/loan-assistant.md` LOAN-1 D+C 확정판(본문 `11f0bfaa`) C1 M1~M10·C6 M-#1~#10·P5. 주니어 세부 명세서 없음(D 직접 확정 Step).
- 서버 시험은 격리된 로컬 Postgres 17 컨테이너, 앱 시험은 가짜 응답(jest 목). 실제 서버 + 로그인 화면 확인은 `미실행`(이 PC에서 Google 로그인을 띄우지 못함).

## 1. 수용 기준 전수 점검

| 요구사항 ID | AC | 준비 | 행동 | 기대 | 실제 (출력·화면) | 증거 (`파일:줄`·캡처) | 웹 | Android | iOS (D) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| LOAN-01 | AC-DATE | 서버 시각 2026-11-16 23:59 KST 고정, 본문 `loaned_on` 다른 날 | #20 | 대출일 2026-11-16, 예정 2026-11-30, `due_on_assumed true` | 시험 통과 | `server/app/routers/loans.py` `start_loan`, `test_start_loan_uses_server_kst_today` | 해당 없음(서버) | 해당 없음 | 대기 |
| LOAN-01 | AC-DATE | 새 대출 | 성공 안내 | "반납 예정일은 YYYY-MM-DD(추정)예요", 목록 "(추정)" | 시험 통과 | `StartLoanButton.tsx` `startedNote`·`convertedNote`, `LoansSection.tsx` `loanDates`, `loans.test.tsx` 첫·셋째 시험 | 통과(가짜) | 미실행 | 대기 |
| LOAN-01 | AC-LOAN | — | #20 두 번 + 동시 4번 | 201 → 200, 같은 id, 행 1 | 시험 통과 | `uq_loans_user_book_on_loan` + `ON CONFLICT DO NOTHING`, `test_start_loan_twice_one_row` | 해당 없음 | 해당 없음 | 대기 |
| LOAN-01 | AC-LOAN | 책 상세 로그인 | "빌렸어요" 두 번 빠르게 | 요청 1번, "기록 중…" | 시험 통과 | `StartLoanButton.tsx` `sending` ref + `disabled`, `start loan from detail double tap…` | 통과(가짜) | 미실행 | 대기 |
| LOAN-01 | — | 예정 1개 | 예정에서 "빌렸어요" | `planId` 전달, 예정 converted 한 번, 카드 제거, 내 대출 다시 읽기 | 시험 통과 | `test_start_from_plan_converts_once`, `start loan from loan plan passes planId…` | 통과(가짜) | 미실행 | 대기 |
| LOAN-01 | — | 기기 날짜 2027-03-01, 서버 `d_day 8` | 목록 | "D-8" 그대로 | 시험 통과 | `loans section renders server d_day verbatim…`, `test_list_dday_and_overdue` | 통과(가짜) | 미실행 | 대기 |
| — | AC-ISOLATION | A·B 대출·예정 | A로 B 예정 #20, A #19 | 404 `plan_id`·행 0 / A 것만 | 시험 통과 | `test_plan_of_other_user_is_404`, `test_list_only_mine_sorted_by_due` | 해당 없음 | 해당 없음 | 대기 |
| — | AC-RACE | 첫 #19 지연 중 다시 읽기 | 첫 응답 늦게 도착 | 새 목록 유지 | 시험 통과 | `LoansSection.tsx` `runner.run`, `loans section handles loading…` 마지막 단계 | 통과 | 미실행 | 대기 |
| — | 실제 서버 + 로그인 | 로컬 서버·Supabase 로그인 | 상세 → 빌렸어요 → 대출·반납 탭 | 같은 화면 | 미실행 | 이 PC에서 Google 로그인 불가 | 미실행 | 미실행 | 대기 |

## 2. 명세서 예외 상황 점검 (계약 C6)

| 예외 # | 확인한 방법 | 화면 문구가 계약과 같은가 | 기록이 안 바뀌었나 | 결과 |
| :--- | :--- | :--- | :--- | :--- |
| M-#1 로그인 안 함 | `test_requires_login`, 앱 첫·다섯째 시험 | 같음("로그인하면 대출을 기록할 수 있어요" + 로그인, 탭 로그인 안내·#19 0번) | 행 0 | 통과 |
| M-#2 형식 | `test_start_validation_is_422_no_row`(6), `test_list_validation_is_422`(3), `test_invalid_cursor_is_422_detail_cursor` | — | 행 0 | 통과 |
| M-#3 예정 책 다름 | `test_plan_book_mismatch_is_422` | — | 행 0, 예정 planned | 통과 |
| M-#4 남의·없는 예정 | `test_plan_of_other_user_is_404` / 앱 404·409 같은 처리 | 같음("이미 바뀐 내용이에요. 목록을 새로 고쳤어요.") | 행 0, B 예정 그대로 | 통과 |
| M-#5 해제·전환된 예정 | `test_released_plan_is_409`, `test_start_from_plan_converts_once`, 앱 409 | 같음 + 예정·대출 다시 읽기 | 행 0 | 통과 |
| M-#6 없는 도서관·책 | `test_unknown_library_is_404_detail_library_id`, `test_unknown_book_is_404_detail_isbn13` | 앱은 "대출을 기록하지 못했어요. 다시 시도해 주세요." | 행 0 | 통과 |
| M-#7 제공자 실패 | `test_provider_failure_passes_through_no_row`, 앱 첫 시험 503 | 같음 | 행 0 | 통과 |
| M-#8 연타 | 위 AC-LOAN 두 줄 | 성공 안내와 같음 | 행 1, 예정 전환 한 번 | 통과 |
| M-#9 탈퇴 경합 | `test_start_while_withdrawing_is_403`(잠금 대기 확인) | — | 행 0 | 통과 |
| M-#10 본문 날짜 | `test_start_loan_uses_server_kst_today` | — | `loaned_on` = 서버 오늘 | 통과 |
| (C5) CHECK·RLS | `test_loans_check_constraints`(4), `test_loans_rls_enabled` | — | IntegrityError, 행 0 | 통과 |

## 3. 명세서와 달라진 점

- 없음. 같은 예정으로 두 번째 #20은 P4 골격 순서(예정 상태 확인이 INSERT보다 먼저)대로 `409`다(M-#8의 200은 `plan_id` 없이 같은 책을 다시 누를 때). PR 검토 메모에 적었다.

## 4. 남은 문제

- Android 미실행: 이 PC에 에뮬레이터가 없음.
- 실제 서버 + 로그인 화면 확인 미실행: 이 PC에서 Google 로그인을 띄우지 못함(LIB-3과 같은 사정).
- 대출 카드의 "기한 수정"·"반납했어요"는 LOAN-2(`TODO(연결): C LOAN-2-P2`, `LoansSection.tsx`).
