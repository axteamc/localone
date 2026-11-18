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

---

# 반납 비서 LOAN-2 검증서

- 기능: `loan-assistant` LOAN-2(기한 수정·반납) · 담당: C · 대상 PR: #170(스택: #168 위) · 작성일: 2026-11-18
- 기준: 02 LOAN-02·LOAN-03(AC-LOAN, AC-RETURN), AC-ISOLATION, AC-RACE, 계약서 LOAN-2 D+C 확정판(본문 `11f0bfaa`) C1 E1~E8·C6 R-#1~#7·P5.
- 서버 시험은 격리된 로컬 Postgres 17 컨테이너, 앱 시험은 가짜 응답(jest 목). 실제 서버 + 로그인 화면 확인은 `미실행`(이 PC에서 Google 로그인을 띄우지 못함).

## 1. 수용 기준 전수 점검

| 요구사항 ID | AC | 준비 | 행동 | 기대 | 실제 (출력·화면) | 증거 (`파일:줄`·캡처) | 웹 | Android | iOS (D) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| LOAN-02 | AC-LOAN | 대출(대출일 11-16) | #21 전날 / `2026-02-30` 등 7가지 | 422 `due_on`, 행 그대로 | 시험 통과 | `loans.py` `parse_due_on`·`change_due_tx`, `test_change_due_before_loaned_is_422_unchanged`, `test_invalid_due_on_format_is_422_detail_due_on` | 해당 없음 | 해당 없음 | 대기 |
| LOAN-02 | AC-LOAN | — | #21 정상·같은 값 두 번 | `due_on` 바뀜, `due_on_assumed false`, 같은 결과 | 시험 통과 | `test_change_due_sets_not_assumed` | 해당 없음 | 해당 없음 | 대기 |
| LOAN-02 | AC-LOAN | 대출 11-10 | 시트에 11-09·02-30·11-31·형식 틀림 → 11-28 저장 | 보내지 않고 문구, 저장 뒤 시트 닫힘·(추정) 사라짐, 연타 한 번 | 시험 통과 | `DueDateSheet.tsx` `save`, `due date sheet blocks dates before loaned_on…` | 통과(가짜) | 미실행 | 대기 |
| LOAN-03 | AC-RETURN | 대출 | #22 → 서버 날짜 바꿔 #22 | 200·200, `returned_on` 처음 값, 지난 대출로 이동 | 시험 통과 | `return_loan_tx`, `test_return_twice_keeps_first_date` | 해당 없음 | 해당 없음 | 대기 |
| LOAN-03 | AC-RETURN | 도서관 있는 대출 | #22 | `library_return_stats` 0행(E4) | 시험 통과 | `test_return_does_not_write_stats` | 해당 없음 | 해당 없음 | 대기 |
| LOAN-03 | AC-RETURN | 대출 2권 | 반납했어요 → 취소 / 확인 | 확인 창, 취소 시 0번, 확인 시 1번·빌린 책에서 제거·안내 | 시험 통과 | `LoansSection.tsx` `ReturnConfirm`, `return button asks confirmation…` | 통과(가짜) | 미실행 | 대기 |
| — | AC-ISOLATION | B 대출 | A가 #21·#22 | 404, B 행 그대로 | 시험 통과 | `test_other_users_loan_is_404` | 해당 없음 | 해당 없음 | 대기 |
| — | AC-RACE | 빌린 책 응답 지연 | 빌린 책 → 지난 대출 빠르게 | 지난 대출 화면 유지 | 시험 통과 | `createLatestRunner`, `loans section switches between on_loan and returned tabs…` | 통과 | 미실행 | 대기 |
| — | 경합 | 같은 대출 | 반납·수정 동시(3회) | 500 없음, 반납 먼저면 409·예정일 그대로 / 수정 먼저면 수정 뒤 반납 | 시험 통과 | `test_return_and_change_race` | 해당 없음 | 해당 없음 | 대기 |
| — | 실제 서버 + 로그인 | — | 기한 수정·반납 | 같은 화면 | 미실행 | Google 로그인 불가 | 미실행 | 미실행 | 대기 |

## 2. 예외 상황 점검 (계약 C6)

| 예외 # | 확인한 방법 | 화면 문구가 계약과 같은가 | 기록이 안 바뀌었나 | 결과 |
| :--- | :--- | :--- | :--- | :--- |
| R-#1 날짜·형식·`loan_id` | 서버 422 시험 3개, 앱 시트 사전 차단·422 수신 | 같음("대출일(YYYY-MM-DD) 이후 날짜를 골라 주세요.") | 행 그대로 | 통과 |
| R-#2 반납 뒤 수정 | `test_change_due_after_return_is_409`, 앱 409 | 같음(시트 닫고 "이미 바뀐 내용이에요. 새로 고친 뒤 다시 시도해 주세요." + 다시 읽기) | 행 그대로 | 통과 |
| R-#3 남의·없는 대출 | `test_other_users_loan_is_404`, 앱 반납 404 | 같음(창 닫고 같은 문구 + 다시 읽기) | 상대 행 그대로 | 통과 |
| R-#4 반납 두 번 | `test_return_twice_keeps_first_date` | — | 첫 `returned_on` | 통과 |
| R-#5 동시 | `test_return_and_change_race` | — | CHECK 통과, 500 없음 | 통과 |
| R-#6 탈퇴 | `test_withdrawn_is_403_unchanged` | — | 행 그대로 | 통과 |
| R-#7 반납 | 앱 확인 시험, `test_return_does_not_write_stats` | 같음("반납 처리했어요. 지난 대출에서 다시 볼 수 있어요.") | 집계 0행 | 통과 |
| (E6) 실패 503 | `due date sheet handles 409…`, `return button asks…` | 같음(시트·창 유지 + "예정일을 바꾸지 못했어요…"/"반납 처리하지 못했어요…") | — | 통과 |

## 3. 명세서와 달라진 점

- 없음.

## 4. 남은 문제

- Android 미실행(에뮬레이터 없음), 실제 서버 + 로그인 화면 확인 미실행.
- 기한 수정·반납 뒤 기기 알림 다시 맞추기는 LOAN-3(`TODO(연결): C LOAN-3-P1`, `LoansSection.tsx`).

---

# 반납 비서 LOAN-3 검증서

- 기능: `loan-assistant` LOAN-3(기기 예약 알림·알림 진입) · 담당: C · 대상 PR: #172(스택: #170 위) · 작성일: 2026-11-18
- 기준: 02 LOAN-04·LOAN-05·AC-NOTIFY, 계약서 LOAN-3 D+C 확정판(본문 `11f0bfaa`) T1~T11·C6 T-#1~#5·P5.
- 앱 시험은 기기 예약 저장소를 흉내 낸 목(`notifications.platform` 목)으로 했다. 분기 파일 자체는 `expo-notifications` 목으로 따로 시험. **Android 실기기에서 시각 맞춰 오는지는 미실행**(이 PC에 기기·에뮬레이터 없음, 개발 빌드 필요).

## 1. 수용 기준 전수 점검

| 요구사항 ID | AC | 준비 | 행동 | 기대 | 실제 | 증거 | 웹 | Android | iOS (D) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| LOAN-04 | AC-NOTIFY | today 11-16, due 11-24 | `reminderPlan` | 11-21·11-23·11-24 09:00+09:00 | 시험 통과 | `reminders.ts` `reminderPlan`, `plan has d3 d1 d0 at 09:00 KST` | 해당 없음 | 미실행(실기기) | 대기 |
| LOAN-04 | AC-NOTIFY | due 11-17, 08:00/09:00 | 같음 | 지난 차수 제외(당일 09:00 지나면 그 차수도) | 시험 통과 | `past reminders are skipped` | — | — | 대기 |
| LOAN-04 | AC-NOTIFY | 같은 목록 두 번·겹쳐 부름·책 빠짐 | `syncLoanReminders` | 중복 없음, 빠진 책 알림 지움, 나중 호출이 최종 | 시험 통과 | `sync twice does not duplicate` | — | 미실행 | 대기 |
| LOAN-04 | — | 제목 두 권 | 맞추기 | 잠금 화면 글에 제목 없음 | 시험 통과 | `body never contains title` | — | — | 대기 |
| LOAN-04 | — | 기기 날짜 12-20 | 계획 | 서버 today 기준 | 시험 통과 | `uses server today not device date` | — | — | 대기 |
| LOAN-05 | AC-NOTIFY | 권한 거부 | `/loans` | 예약 0, 안내 + 알림 설정 열기, D-day 그대로 | 시험 통과 | `LoansSection.tsx` 거부 배너, `permission denied skips scheduling…` | — | 미실행 | 대기 |
| — | T9 | 웹 | 맞추기·화면 | `status: "web"`, 한 줄 안내 | 시험 통과, 웹 내보내기 통과 | `web schedules nothing` | 통과(가짜) | — | — |
| — | T8 | 알림 누름 | 루트 구독 | `/loans`로 이동, 대출 알림만 | 시험 통과 | `tapping notification navigates…`, `subscribeNotificationTap fires only…` | — | 미실행 | 대기 |
| — | T6 | 예약 있음 | `clearLoanReminders` | 대출 알림만 지움 | 시험 통과 | `sign out clears all loan reminders` (로그아웃 연결은 `TODO(연결): D(AUTH-2)`) | — | — | 대기 |

## 2. 예외 상황 점검 (계약 C6)

| 예외 # | 확인한 방법 | 결과 |
| :--- | :--- | :--- |
| T-#1 권한 거부 | `permission denied skips scheduling…` | 통과 |
| T-#2 D-1 지남 | `past reminders are skipped` | 통과 |
| T-#3 반납한 대출 | `returned loan has no reminders`, `sync twice…`(다 반납하면 지움) | 통과 |
| T-#4 두 번 맞춤 | `sync twice does not duplicate` | 통과 |
| T-#5 로그아웃 | `sign out clears all loan reminders` — 함수만, 로그아웃 연결은 AUTH-2 대기 | 통과(함수) / 연결 미실행 |

## 3. 명세서와 달라진 점

- 없음.

## 4. 남은 문제

- Android 실기기 알림 도착 확인 미실행(개발 빌드·기기 필요). iOS는 D `needs-ios`.
- 로그아웃 시 알림 지우기 연결은 D AUTH-2의 `registerSignOutCleanup`이 생긴 뒤(`reminders.ts` `TODO(연결): D(AUTH-2)`).
