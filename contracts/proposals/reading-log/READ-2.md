# 독서 기록 (`reading-log`) 기술 계약서

> 이 파일은 A의 독서 기록(`reading-log`, 하단 `"독서 기록"` 탭) 계약서다. Step은 **READ-1**(비공개 기록 쓰기·보기)과 **READ-2**(전체 보기·도서관별 보기(내 발자취)·기초 통계 + 홈 하단 창 "내 최근 독서 기록")다.
> 상태: **1차 계약서 — D 기준선(M2 밑그림, 2026-11-19, 검토 전·구현 착수 불가).** D가 문서화된 결정(02 READ-01·READ-02·VISIT-06, 04 "독서 기록"·R8·R12, Q-44)으로 경로·인증·필드·테이블·오류 코드·담당 파일·파트를 먼저 고정(**잠금 칸**)하고, 화면 배치·문구·빈 상태·길이(**열린 칸**, 빈 표 칸)를 열어 두었다. A의 AI는 `../team/prompts/2_계약_보완.md`에 따라 기획(명세서 + 시안)과 함께 빈 칸을 채운 계약 수정본 PR을 제출하고, D가 양쪽을 함께 검토·승인한 뒤 발행한다. `D 추천(참고)` 칸은 시작점일 뿐이다.
> 담당: `기능_배정.md` "A (M2, 2026-11-19 D 확정) 독서 기록". 공통 함수·인증·하단 탭 틀은 [`core.md`](core.md) · [`auth.md`](auth.md), 책 정보 `Book`은 core LIB-0, 기록을 게시물로 올리는 흐름은 [`local-feed.md`](local-feed.md) LOCAL-3이다.

## Pre-flight 5대 관문 (코드 레포 `main` `761b4a1` · `team` `b4220e9`)

| 관문 | 확인한 것 (`file:line`) | 이 계약서의 처리 (잠금 조건) | 미해결 / 후속 |
| :--- | :--- | :--- | :--- |
| ① 격리·권한·호환 | `server/app/auth.py:132`(`lock_active_user`)·`:180`(`get_current_user`), `server/app/common.py:12-23` | 모든 경로 필수 인증, `/me/reading-logs*`로 본인 것만. 남의 기록·없는 기록은 같은 `404 NOT_FOUND`. 기록은 공개되지 않는다(공개는 LOCAL-3 게시물로만, R8). 새 표 RLS 활성·정책 0개 | 없음 |
| ② 동시성·트랜잭션·외부 I/O | `server/app/db.py:16`, `mobile/src/lib/latest.ts:6`, `mobile/src/auth/AuthProvider.tsx:51`(`registerSignOutCleanup`) | 쓰기 트랜잭션 안 `lock_active_user`. 만들기는 `client_request_id` 멱등. 책 정보가 DB에 없으면 LIB-0 서비스로 먼저 확보(외부 조회는 트랜잭션 **밖**). 로그아웃 때 기록 캐시 지움 | 없음 |
| ③ 전제 실재성 | `server/migrations/versions/0002_public_reference.py:51-80`(`books`), `0008_loans.py`(`loans`), `mobile/app/(tabs)/_layout.tsx`(탭 3개) | `reading_logs`는 **없음 → READ-1**. 독서 기록 탭은 **없음 → READ-1-P2**에서 두 번째 자리에 넣는다(core K13 "독서 기록 탭은 독서 기록을 시작할 때 두 번째 자리에", D 허용) | 없음 |
| ④ 담당·공유 파일 | `mobile/app/(tabs)/_layout.tsx`(D 소유), `server/app/main.py`(블록 표식), `mobile/src/features/library-visit/HomeSheet.tsx`(A) | `_layout.tsx`는 `Tabs.Screen name="reading"` 블록 **하나만** 더한다(다른 줄 무변경). `main.py`는 새 `# ── [reading-log-A] ──` 블록. 홈 하단 창은 A 자기 파일 | 없음 |
| ⑤ 승인·확장 | 05 §10(M2 표 미정), 06 M1 동결, 계획 §3 M2 | 새 표 `reading_logs`, 경로 `#41`~`#46`은 M2 확장으로 확정해 05·06에 반영(2026-11-19 D 확정). 새 라이브러리 없음 | 없음 |

---

## READ-1 비공개 독서 기록 쓰기·보기

- **담당 역할**: A (서버 파트 포함) · **대상 브랜치**: `main`
- **기준 명세서**: `specs/reading-log/명세서.md`, `specs/reading-log/세부/READ-1.md`, 시안 `specs/reading-log/세부/READ-1_시안.html` (기획 때 작성)
- **판**: 1차 D 확정판(2026-11-19, PR #232·#235 승인 반영)
- **선행 설계**: 02 READ-01·AC-READ, 04 "독서 기록"(필수: 소유자·도서·작성 시각 / 선택: 감상·독서일·도서관·대출 연결, 본인 기본 비공개)·R8·R12, `기능_배정.md` READ절("도서관 없이 쓴 기록은 전체 서재에만", "대출 기록과 독서 기록은 따로이며 연결은 사용자가 고를 때만")
- **작성자**: D (시니어)
- **상태**: **발행 — 구현 착수 가능**(`3_구현.md`). 파트 머리말 4칸의 계약서 커밋 SHA를 확인한 뒤 시작한다.
- **발행 본문 SHA**: `3a52e16fff924afbc3f1b11dfb176a2b83cb7b3a`



### 계약

#### C1. 결정

| # | 결정 | 상태 | 근거 |
| :--- | :--- | :--- | :--- |
| R1-1 | 독서 기록은 **본인만 본다.** 쓰기만으로 공개되지 않으며 다른 사람이 볼 길이 없다. 공개하고 싶으면 LOCAL-3 "게시물로 올리기"로 별도 게시물을 만든다 | 확정 | 02 READ-01, 04 R8 |
| R1-2 | 기록 하나 = 책 하나(필수). 선택: 감상(`note`), 좋았던 문장(`quote`), 읽은 날(`read_on`), 도서관(`library_id`), 대출 연결(`loan_id`) | 확정(필수·선택 구분) / `quote` 칸 분리 기본값(Claude) | 04 "독서 기록" |
| R1-3 | **도서관 없는 기록은 임의의 도서관으로 보정하지 않는다**(`library_id` `NULL` 그대로, 전체 서재에만 보임) | 확정 | 02 READ-01 |
| R1-4 | 대출과 독서 기록은 따로다. **대출 연결은 사용자가 고를 때만** 하며, 고르면 그 대출의 도서관이 기본으로 채워진다(바꿀 수 있음). 자동 연결·자동 기록을 만들지 않는다 | 확정(앞 문장) / 도서관 채우기 기본값(Claude) | `기능_배정.md` READ절 |
| R1-5 | 책 고르기는 C의 책 검색을 그대로 쓴다(`searchBooks`, 새 검색 화면을 만들지 않음). 고른 책이 DB에 없으면 서버가 LIB-0으로 확보한다 | 기본값(Claude) | core LIB-0 |
| R1-6 | 하단 탭은 **홈 / 독서 기록 / 대출·반납 / 내 정보** 순서. 독서 기록 탭은 READ-1에서 두 번째 자리에 생긴다 | 확정 | Q-44, core K13 |
| R1-7 | 기록 지우기는 바로 지운다(비공개라 철회 단계 없음). 그 기록에서 올린 게시물은 남는다(LOCAL-3 L3-4) | 확정(게시물 남음) / 바로 지우기 기본값(Claude) | 04 관계 표 |
| R1-8 | 탈퇴하면 기록을 모두 지운다 | 확정 | 04 R12 |

##### 열린 칸 (A가 기획·시안 작성 후 `2_계약_보완.md`로 채울 결정 — 아래 빈 칸만 채우고 행 추가 가능)

| # | 열린 칸 | D 추천(참고) | 채택 결정 | 상태 | 근거(명세 ID) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1-O1 | 기록 쓰는 입구(독서 기록 탭 `+` / 책 상세 / 반납 뒤) — 다른 화면 입구는 그 화면 담당과 D가 정하므로 이 Step은 탭 안 입구만 | 탭 오른쪽 아래 `+` | 독서 기록 탭 **오른쪽 아래 떠 있는 `+`**(지름 38, 오른쪽 12·탭 바 위 12, 목록을 내려도 같은 자리). 누르면 쓰기 화면(`/reading/new`). 탭 밖 입구 없음 | 확정(사용자) | 큰 틀 결정 1(`specs/reading-log/명세서.md`) |
| R1-O2 | 쓰기 화면 순서(책 고르기 → 칸 채우기)와 칸 배치 | 책 → 감상 → 문장 → 날짜·도서관 → 대출 연결 | **한 화면에 다 같이**(머리 `✕` · `"기록 쓰기"` · `저장`). 칸 순서: 책 칸 → 감상(따로 평가 칸 없이 감상으로, D 시안 확인 후보 B) → 좋았던 문장 → 읽은 날(기본 오늘) → 도서관 → 대출 연결. 아무 칸부터 채워도 된다. 책 칸을 누르면 책 검색 화면(`"어떤 책을 읽었어요?"` + 검색창 + 결과 목록, R1-5 `searchBooks`)이 열리고, 고르면 쓰기 화면으로 돌아와 책 칸이 채워진다(고른 뒤에도 다시 눌러 바꿀 수 있음). 책 없이 저장하면 저장하지 않고 C3 안내. 읽은 날·도서관·대출 연결은 줄 하나씩, 줄을 누르면 아래에서 고르는 시트(도서관 시트에 `"도서관 없이 (집·카페)"` = `library_id` `null`, R1-3) | 확정(D 시안 확인) / 칸 크기·문구 기본값(Claude) | 큰 틀 결정 2(2026-11-19 수정), 명세 `specs/reading-log/세부/READ-1.md` 결정 1·2 |
| R1-O3 | `note`·`quote` 길이 상한 | `note` 2000 · `quote` 300 | `note` 2000자 · `quote` 300자(글자 수, 앞뒤 공백 제거 뒤 빈 문자열은 `null`로 저장). 넘으면 서버 `422`, `detail`=`note` 또는 `quote`, 앱은 칸 아래 `"감상은 2000자까지 쓸 수 있어요"` / `"좋았던 문장은 300자까지 쓸 수 있어요"` | 기본값(Claude) | 명세 `specs/reading-log/세부/READ-1.md` 0절(E6) |
| R1-O4 | 기록 상세 화면 배치와 고치기·지우기 자리 | 상세 `⋯` 메뉴 | 책장에서 책을 누르면 책장 위 카드(표지·제목·저자·감상 첫 줄·읽은 날·읽은 도서관) → `"기록 자세히 보기"` → 기록 화면(`/reading/[logId]`, 머리 `‹` · `"내 기록"` · `⋯`). 본문: 표지·제목·저자 → 읽은 날·도서관·대출 → 감상 → 좋았던 문장(전체 감상은 카드에 넣지 않고 이 화면에서만). `⋯` 메뉴 두 줄 `"수정"` · `"지우기"`. 맨 아래 주 버튼 `"게시물로 올리기"`(이미 올렸으면 `"올린 게시물 보기"`). `"수정"`은 쓰기 화면과 같은 모양(제목 `"기록 수정"`, 책 칸은 바꿀 수 없음 `"책은 바꿀 수 없어요"`) | 확정(사용자) / 카드 겉모양은 READ-2 | 명세 `specs/reading-log/세부/READ-1.md` 결정 3, 큰 틀 결정 3 |
| R1-O5 | 지우기 확인 방식 | 확인창 | 확인창(두 버튼): `"이 기록을 지울까요?"` / `"지우면 되돌릴 수 없어요."` [`"취소"`] [`"지우기"`]. `published_post_id !== null`이면 `"올린 게시물은 그대로 남아요."` 한 줄 더함(R1-7). 지우면 책장으로 돌아가 그 책을 빼고 `"기록을 지웠어요"` | 기본값(Claude) | 명세 `specs/reading-log/세부/READ-1.md` 0절(E8) |
| R1-O6 | 대출 연결 고르는 모양(내 대출 목록에서 고르기) | 같은 책 대출만 위에 | ① `"대출 연결"` 줄 → 아래 시트 `"어떤 대출과 연결할까요?"`: 내 대출 목록(`#19` 대출 중·반납 모두), 같은 책(`isbn13` 일치) 대출이 위, 그다음 `loaned_on` 최근 순. ② 책을 고른 직후 같은 책 대출이 있으면 **한 번 묻는 카드**: `"<도서관 이름>에서 <M월 D일>에 빌린 책이에요"` / `"이 대출과 연결할까요? 도서관도 같이 채워요."` [`"연결하기"`] [`"아니요"`]. 같은 책 대출이 여럿이면 `loaned_on`이 가장 최근인 것으로 묻는다. **누르기 전에는 연결하지 않는다**(R1-4). `"연결하기"` → `loan_id`와 그 대출의 도서관(대출 도서관이 `null`이면 도서관은 그대로)을 채움, `"아니요"` → 아무것도 안 채우고 같은 책을 다시 고르기 전에는 다시 묻지 않음. 연결 뒤에도 줄을 눌러 바꾸거나 `"연결 안 함"`으로 뺄 수 있다 | 확정(사용자) / 여럿일 때 최근 대출·문구 기본값(Claude) | 명세 `specs/reading-log/세부/READ-1.md` 결정 2 |
| R1-O7 | 저장하지 않고 나갈 때 | 확인창 | 쓰기·수정 화면에서 `✕`/뒤로: 바뀐 칸이 있으면 확인창 `"쓰던 기록을 버릴까요?"` [`"계속 쓰기"`] [`"버리기"`], 바뀐 칸이 없으면 바로 닫힘 | 기본값(Claude) | 명세 `specs/reading-log/세부/READ-1.md` 0절(E10) |

#### C2. 엔드포인트 / 주요 함수

| 메서드·경로 (`/api/v1`) | 인증 | 성공 상태 | 날짜 형식 | 목록 페이지·정렬·동률 | 연타·재시도 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /me/reading-logs?library_id=&cursor=&limit=` (#41) | 필수 | `200` | `read_on`: `YYYY-MM-DD` / `created_at`·`updated_at`: ISO 8601 `+09:00` | `limit` 기본 20(1~50), 정렬 `coalesce(read_on, created_at::date) DESC, created_at DESC, id DESC`, 커서 그 세 값 base64url. `library_id`를 주면 그 도서관 기록만 | N/A (읽기) |
| `GET /me/reading-logs/{log_id}` (#42) | 필수 | `200` | 위와 같음 | — | N/A |
| `POST /me/reading-logs` (#43) | 필수 | `201` / 같은 `client_request_id` `200` | 위와 같음 | — | 멱등 |
| `DELETE /me/reading-logs/{log_id}` (#44) | 필수 | `204` (이미 없으면 `404`) | — | — | 두 번째는 `404` |
| `PATCH /me/reading-logs/{log_id}` (#45) | 필수 | `200` | 위와 같음 | — | 보낸 칸만 |

앱 함수 (`mobile/src/features/reading-log/api.ts`):

- `fetchReadingLogs(q: { libraryId?: number; cursor?: string | null; limit?: number }, signal?: AbortSignal): Promise<ReadingLogPage>`
- `fetchReadingLog(logId: string, signal?: AbortSignal): Promise<ReadingLog>`
- `createReadingLog(input: ReadingLogInput, clientRequestId: string): Promise<ReadingLog>`
- `updateReadingLog(logId: string, patch: Partial<ReadingLogInput>): Promise<ReadingLog>`
- `deleteReadingLog(logId: string): Promise<void>`

화면·경로:

- `mobile/app/(tabs)/reading.tsx` → `ReadingLogScreen`(목록, READ-2가 필터·통계를 더함)
- `mobile/app/reading/new.tsx` → `ReadingLogEditor`(새로 쓰기), `mobile/app/reading/[logId].tsx` → `ReadingLogDetail`(보기·고치기·지우기·"게시물로 올리기")
- "게시물로 올리기"는 `router.push({ pathname: "/posts/new", params: { fromLog: logId } })`(B LOCAL-3). 이미 올린 기록(`published_post_id !== null`)이면 `router.push({ pathname: "/posts/[postId]", params: { postId } })`

#### C3. 요청·응답 필드와 화면 문구

| 구분 | 필드/키 | 타입 | 필수 | null 허용 | 설명·고정 문구 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ReadingLog` | `id` | `str (UUID)` | Y | N | 기록 id(`/reading/[logId]`) |
| `ReadingLog` | `book` | core `Book` (`isbn13`, `title`, `author`, `cover_url`) | Y | N | 고른 책(R1-2 필수). 책장 표지·카드·기록 화면에 씀 |
| `ReadingLog` | `library` | `{ id: int; name: str }` | Y | Y | 없으면 `null`(R1-3) |
| `ReadingLog` | `read_on` | `str` | Y | Y | 서울 날짜, 미래 날짜 불가(`422`, `detail="read_on"`) |
| `ReadingLog` | `note` | `str` | Y | Y | 길이 R1-O3 |
| `ReadingLog` | `quote` | `str` | Y | Y | 길이 R1-O3 |
| `ReadingLog` | `loan_id` | `str (UUID)` | Y | Y | 내 대출만. 남의·없는 대출이면 `404 NOT_FOUND` |
| `ReadingLog` | `published_post_id` | `str (UUID)` | Y | Y | 이 기록에서 올린 **공개 중** 게시물(LOCAL-3). 없으면 `null` |
| `ReadingLog` | `created_at`, `updated_at` | `str` | Y | N | 서버 시각(ISO 8601 `+09:00`). `read_on`이 없으면 책장 위치는 `created_at` 날짜(#41 정렬) |
| 요청(#43) `ReadingLogInput` | `isbn13` | `str` | Y | N | 13자리. 책을 확보하지 못하면 `422`, `detail="isbn13"` |
| 요청(#43) | `library_id` | `int` | N | Y | 없는 도서관 `422`, `detail="library_id"` |
| 요청(#43) | `read_on`, `note`, `quote`, `loan_id` | 위 표 | N | Y | 선택 칸. 규칙은 이 표의 `ReadingLog` `read_on`·`note`·`quote`·`loan_id` 행(미래 날짜 `422`, 길이 R1-O3, 남의 대출 `404`). 앱은 읽은 날 기본 오늘을 보냄 |
| 요청(#43) | `client_request_id` | `str (UUID)` | Y | N | 쓰기 화면을 열 때 한 번 만들고 `"다시 저장하기"`·연타 때 같은 값(멱등, C6 연타) |
| 요청(#45) | `isbn13` 빼고 `ReadingLogInput`의 칸 | `ReadingLogInput`의 각 칸 타입(`client_request_id` 제외) | N | Y | 책은 바꾸지 않는다(바꾸려면 새 기록) |
| 응답(#41) | `items[]`, `next_cursor` | `ReadingLog[]`, `str \| null` | Y | — | 책장 한 묶음(기본 20), 다음 묶음 커서. 끝이면 `null` |
| 화면 문구 | 탭 이름 | — | — | — | `"독서 기록"` |
| 화면 문구 | 쓰기 버튼·화면 제목 (`R1-O1`·`R1-O2`) | — | — | — | `+`(접근성 이름 `"기록 쓰기"`) · 쓰기 화면 제목 `"기록 쓰기"` · 수정 화면 제목 `"기록 수정"` · 기록 화면 제목 `"내 기록"` · 책 칸 비었을 때 `"＋ 책 고르기 (꼭 골라야 해요)"` · 책 검색 화면 제목 `"어떤 책을 읽었어요?"` · 감상 칸 안내 `"감상 (비워도 돼요)"` · 좋았던 문장 칸 안내 `"좋았던 문장"` · 책 없이 저장 `"책을 골라야 저장할 수 있어요"` · 저장 뒤 `"저장했어요"` · `⋯` 메뉴 `"수정"`/`"지우기"` · 카드 버튼 `"기록 자세히 보기"` · 도서관 시트 `"어디서 읽었어요?"`·`"도서관 없이 (집·카페)"` · 읽은 날 시트 `"언제 다 읽었어요?"` · 대출 문구는 R1-O6 |
| 화면 문구 | 빈 목록 | — | — | — | `"아직 꽂힌 책이 없어요."` / `"오른쪽 아래 +를 눌러 첫 책을 꽂아 보세요."`(책장 자리, `+`는 그대로) |
| 화면 문구 | 저장·불러오기 실패 | — | — | — | 저장 실패: 쓰기 화면 아래 카드 `"저장하지 못했어요"` / `"인터넷 연결을 확인해 주세요. 쓴 내용은 그대로 있어요."` [`"다시 저장하기"`]. 불러오기 실패(책장·기록 화면): `"기록을 불러오지 못했어요."` [`"다시 해 보기"`](기본값(Claude)). 지우기 실패: `"지우지 못했어요. 다시 해 주세요."`(기록 화면 그대로) |
| 화면 문구 | 지우기 확인 (`R1-O5`) | — | — | — | `"이 기록을 지울까요?"` / `"지우면 되돌릴 수 없어요."` (+ 올린 게시물이 있으면 `"올린 게시물은 그대로 남아요."`) [`"취소"`] [`"지우기"`] · 지운 뒤 `"기록을 지웠어요"` · 나갈 때 `"쓰던 기록을 버릴까요?"` [`"계속 쓰기"`] [`"버리기"`] |
| 화면 문구 | 비로그인 탭 | — | — | — | `"로그인하면 나만 보는 독서 기록을 남길 수 있어요."` + 주 버튼 `"로그인하기"`(API 부르지 않음) · 남의·없는 기록(`404`): `"찾을 수 없는 기록이에요"` |
| 화면 문구 | "게시물로 올리기" 버튼 | — | — | — | `"게시물로 올리기"` |

- 응답에 `user_id` 없음.

#### C4. 플랫폼 분기 표

`N/A: 목록·쓰기 화면은 공통 View 코드. 날짜 고르기는 LOAN-2 DueDateSheet와 같은 방식을 쓰면 그 계약의 분기를 그대로 따른다(새 분기 없음).`

#### C5. 테이블

```sql
-- NNNN_reading_logs.py
CREATE TABLE reading_logs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES users(id),
  book_id           bigint      NOT NULL REFERENCES books(id),
  library_id        bigint      NULL REFERENCES libraries(id),
  loan_id           uuid        NULL REFERENCES loans(id) ON DELETE SET NULL,
  read_on           date        NULL,
  note              text        NULL,
  quote             text        NULL,
  client_request_id uuid        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reading_logs_user_client_request_key UNIQUE (user_id, client_request_id)
);
CREATE INDEX ix_reading_logs_user_order ON reading_logs (user_id, (coalesce(read_on, (created_at AT TIME ZONE 'Asia/Seoul')::date)) DESC, created_at DESC, id DESC);
CREATE INDEX ix_reading_logs_user_library ON reading_logs (user_id, library_id);
ALTER TABLE reading_logs ENABLE ROW LEVEL SECURITY;
```

| 열린 제약 | 컬럼 | 값 (A 채움) |
| :--- | :--- | :--- |
| `reading_logs_note_len_check` | `note` | `CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 2000)` (R1-O3, 빈 문자열은 앱·서버가 `null`로 바꿔 저장) |
| `reading_logs_quote_len_check` | `quote` | `CHECK (quote IS NULL OR char_length(quote) BETWEEN 1 AND 300)` (R1-O3) |

- `loan_id ON DELETE SET NULL`: 탈퇴 순서(AUTH-3)에서 `loans`를 먼저 지워도 기록 삭제와 부딪히지 않게 한다. 05 R12 `NO ACTION` 원칙의 예외로 확정됐다(2026-11-19 D 확정).
- 탈퇴 때 기록 삭제는 D가 M2-0-P5에서 `me.py` `withdraw_user_account`에 더한다(`posts.reading_log_id`를 먼저 `NULL`로).

#### C6. 검증과 에러 처리

| 명세서 예외 # | 발생 조건 | HTTP / `code` / `detail` | 화면에서 바뀌는 영역 | 유지되는 영역 | 기록 보장 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 끊김 | 목록·저장·지우기 실패 | `ApiCallError` | 저장: 쓰기 화면 아래 카드(C3 저장 실패 + `"다시 저장하기"`, 같은 `client_request_id`로 다시 보냄) / 목록·기록 화면: 그 자리에 불러오기 실패 + `"다시 해 보기"` / 지우기: 확인창 닫고 안내 한 줄 | 쓰던 입력값 | 무변경 |
| 빈 결과 | 기록 0개 | `200` `items: []` | 빈 목록 문구 | 탭 | — |
| 연타 | 저장 두 번 | `200` 같은 기록 | 하나만 | — | 행 하나 |
| 비로그인 | 탭 진입 | 앱은 부르지 않음, 직접 호출 `401` | 비로그인 안내 | — | — |
| 타인·없는 기록 | 남의 `log_id` 보기·고치기·지우기 | `404 NOT_FOUND`(같은 응답) | 상세 자리 안내 | 목록 | 남의 행 무변경 |
| 남의 대출 연결 | 남의 `loan_id` | `404 NOT_FOUND` | 대출 칸 안내 | 다른 칸 | 저장 안 됨 |
| 입력 오류 | 길이 밖·미래 날짜·깨진 커서 | `422` / 필드명 | 칸 아래 안내 | 입력값 | 무변경 |
| 책 확보 실패 | 제공자 실패로 책 정보 없음 | `503 PROVIDER_UNAVAILABLE`(LIB-0 그대로) | 책 고르기 안내 | 다른 칸 | 저장 안 됨 |
| 계정 전환 | 로그아웃·다른 계정 | — | 목록 비움 | — | 캐시 지움(`registerSignOutCleanup`) |

#### C7. 다른 기능과 닿는 곳과 `TODO(연결)` 가짜 값

| 의존 대상 | 필요한 것 | 상대 머지 전 가짜 값 |
| :--- | :--- | :--- |
| D `core` LIB-0 | 책 확보(ISBN → `books` 행), `searchBooks` | 있음 |
| C `loan-assistant` | 내 대출 목록 `#19` | 있음 |
| B LOCAL-3 | `/posts/new?fromLog=`, `published_post_id` 원천 | LOCAL-3 머지 전에는 `published_post_id`를 늘 `null`로 주고 버튼은 `/posts/new`로만 보낸다(B 화면이 `fromLog`를 무시해도 깨지지 않음) |
| D `core` M2-0-P5 | 탈퇴 때 기록 삭제 | N/A: D 작업 |

### 구현 계획

#### P1. 확인한 기존 코드 전제

| 참조 대상 | 실제 경로와 줄 | 심볼·시그니처 | 있음 / 앞으로 만듦 |
| :--- | :--- | :--- | :--- |
| 책 검색 | `mobile/src/lib/publicApi.ts:67` | `searchBooks(q, start?, signal?)` | 있음 |
| 책 확보 | `server/app/services/provider_engine.py` | LIB-0 책 조회·저장 | 있음 |
| 내 대출 | `server/app/routers/loans.py`, `mobile/src/features/loan-assistant/api.ts` | `#19` | 있음 |
| 하단 탭 | `mobile/app/(tabs)/_layout.tsx` | `Tabs.Screen` 3개 | 있음 |
| 로그아웃 정리 | `mobile/src/auth/AuthProvider.tsx:51` | `registerSignOutCleanup(fn)` | 있음 |

#### P2. 파트 분할과 담당 파일

| 파트 | 브랜치 | 수정/생성 허용 파일(전수) | 완료 시 확인할 명세서 항목 |
| :--- | :--- | :--- | :--- |
| `READ-1-P1` 서버 | `feat/reading-log-READ-1` | `server/migrations/versions/NNNN_reading_logs.py`, `server/app/routers/reading_logs.py`, `server/app/main.py`(`[reading-log-A]` 블록), `server/tests/test_reading_logs.py` | R1-1~R1-5·R1-7, C6(서버) |
| `READ-1-P2` 탭·목록·쓰기·상세 | 같은 브랜치 | `mobile/app/(tabs)/_layout.tsx`(`reading` 블록 하나), `mobile/app/(tabs)/reading.tsx`, `mobile/app/reading/new.tsx`, `mobile/app/reading/[logId].tsx`, `mobile/src/features/reading-log/api.ts`, `ReadingLogScreen.tsx`, `ReadingLogEditor.tsx`, `ReadingLogDetail.tsx`, `mobile/src/features/reading-log/__tests__/reading-log.test.tsx`, `mobile/src/__tests__/routes.test.tsx`(탭 단언 맞추기) | R1-6, R1-O1~R1-O7, C6(앱) |

> P2가 파일 10개라 `docs/문서_운영.md` §3 참고치(7개)를 넘지만, 경로 래퍼 파일 3개와 탭 레이아웃 1블록·라우트 시험 1개를 포함한 단일 사용자 동선(쓰고 보기)이므로 10개 구성을 D가 사전 승인했다(2026-11-19 D 확정). 세부 기획에서 더 커지면 담당 AI가 `[계약 보완 필요]`로 P2를 둘로 나누자고 적는다.

##### 파트 머리말 — READ-1-P1 · P2 (공통)

| 칸 | 값 |
| --- | --- |
| 1. 태스크 ID | `READ-1-P1` / `READ-1-P2` |
| 2. 담당 역할 | A |
| 3. 기준선 버전 | M2 D 확정판(2026-11-19) |
| 4. 계약서 커밋 | `3a52e16fff924afbc3f1b11dfb176a2b83cb7b3a` |
| 5. 선행 태스크 | 없음(M1 머지분만 씀) |
| 6. 수정 허용 파일 | 위 표 |
| 7. 금지된 결정 | 기록 공개 기능 금지(R1-1). 도서관 자동 보정 금지(R1-3). 자동 대출 연결 금지(R1-4). `_layout.tsx`의 다른 탭·스타일 변경 금지 |
| 8. 완료 조건 | 파트 표 항목 + P5 + 웹·Android |
| 9. 검증 명령 | 서버: `uv run alembic upgrade head` → `uv run pytest`. 앱: `npx tsc --noEmit` → `npx jest --runInBand src/features/reading-log src/__tests__/routes.test.tsx` → `npx expo export --platform web` |
| 10. 보고 형식 | `../prompts/3_구현.md` 5단계 |

#### P3. 새 라이브러리

| 쪽 | 패키지 | 용도 | 설정 |
| --- | --- | --- | --- |
| 서버·앱 | 없음 | — | — |

#### P4. 핵심 흐름 골격

```python
# reading_logs.py — #43 만들기 (외부 I/O 밖 → 트랜잭션 안 멱등)
async def create_reading_log(body: ReadingLogIn, user: CurrentUser = Depends(get_current_user)):
    # 열린 칸 R1-O3: note·quote 길이 검사를 여기에 둔다 → 422
    if body.read_on and body.read_on > today_kst(): raise ApiError(422, "VALIDATION_ERROR", "...", "read_on")
    book_id = await ensure_book(body.isbn13)                # LIB-0, 트랜잭션 밖. 실패 → 503/422
    def tx(c):
        lock_active_user(c, user.id)
        hit = select_by_client_request(c, user.id, body.client_request_id)
        if hit: return hit, False                           # 200 같은 기록
        if body.loan_id: ensure_own_loan(c, user.id, body.loan_id)          # 아니면 404
        if body.library_id: ensure_library_exists_or_422(c, body.library_id)
        return insert_log(c, user.id, book_id, body), True  # library_id 없으면 NULL 그대로 (R1-3)
    row, created = await run_db(engine, tx)
    return JSONResponse(reading_log(row), status_code=201 if created else 200)

# #42·#44·#45: 모두 WHERE id = :id AND user_id = :uid. 0행이면 404 NOT_FOUND
# #44: 트랜잭션 안에서 UPDATE posts SET reading_log_id = NULL WHERE reading_log_id = :id → DELETE reading_logs
# R1-O3: note·quote는 strip 뒤 "" → None, len(note) > 2000 / len(quote) > 300 → ApiError(422, "VALIDATION_ERROR", "글자 수를 넘었어요", "note" 또는 "quote")
#        (#45도 같은 검사, 보낸 칸만)
```

```ts
// ReadingLogEditor.tsx — R1-O2·R1-O6·R1-O7 (세부 명세 결정 1·2, 0절)
const requestId = useRef(newUuid());                 // 화면을 열 때 한 번. 다시 저장도 같은 id (C6 끊김·연타)
const saving = useRef(false);

async function onPickBook(book: Book) {              // 책 검색 화면에서 돌아옴
  setForm(f => ({ ...f, book }));
  if (askedFor.current === book.isbn13) return;      // "아니요" 뒤 같은 책이면 다시 묻지 않음
  const loans = await loadMyLoans();                 // #19 on_loan + returned (listLoans), 실패하면 묻지 않고 넘어감
  const same = loans.filter(l => l.book.isbn13 === book.isbn13)
                    .sort((a, b) => b.loaned_on.localeCompare(a.loaned_on))[0];
  if (same) setAskLoan(same);                        // 카드만 띄움. 연결하지 않는다 (R1-4)
}
function onConfirmLoan(l: Loan) {                    // "연결하기"
  setForm(f => ({ ...f, loanId: l.id, library: l.library ?? f.library }));
  setAskLoan(null);
}
function onDeclineLoan() { askedFor.current = form.book!.isbn13; setAskLoan(null); }

async function onSave() {
  if (!form.book) return showToast("책을 골라야 저장할 수 있어요");
  if (saving.current) return;                        // 진행 중 연타 무시
  saving.current = true;
  try { await createReadingLog(toInput(form), requestId.current); router.back(); showToast("저장했어요"); }
  catch { setSaveFailed(true); }                     // 입력값 그대로, "다시 저장하기"
  finally { saving.current = false; }
}
function onClose() { isDirty(form) ? confirmDiscard() : router.back(); }   // R1-O7
```

#### P5. 필수 테스트

| 파트 | 테스트 이름 | 준비 | 실행 | 기대 단언 | 잡아야 할 버그 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| READ-1-P1 | `reading logs are owner only with same 404` | A 기록, B 토큰 / 없는 id | `#42`·`#44`·`#45` | 모두 `404 NOT_FOUND`, A 기록 무변경 | 남의 기록 읽기·쓰기 |
| READ-1-P1 | `create is idempotent by client request id` | — | 같은 값 두 번 | `201` 뒤 `200`, 같은 id, 행 1 | 연타 |
| READ-1-P1 | `log without library stays null` | `library_id` 없음 | `#43` → `#41?library_id=101` | `library: null`, 도서관 필터에 안 나옴, 전체에는 나옴 | R1-3 |
| READ-1-P1 | `linking other users loan is 404` | B의 대출 | A가 `loan_id`=B 대출 | `404`, 행 0 | 남의 대출 연결 |
| READ-1-P1 | `patch keeps unsent fields and cannot change book` | 기록 | `{note:"x"}` / `{isbn13:...}` | 나머지 그대로 / `isbn13` 무시 또는 `422` | 부분 갱신 |
| READ-1-P1 | `delete keeps published post` | 기록 → 게시물(LOCAL-3 전이면 행 직접 넣음) | `#44` | `204`, 게시물 그대로 `reading_log_id` `NULL` | R1-7 |
| READ-1-P1 | `reading log endpoints require auth` | 비로그인 | `#41`~`#45` | `401` | 익명 접근 |
| READ-1-P1 | `future read date is rejected` | 서울 오늘 고정 | `read_on` 내일 | `422`, `detail="read_on"` | 날짜 |
| READ-1-P2 | `reading tab is second` | — | 탭 렌더 | 홈 → 독서 기록 → 대출·반납 → 내 정보 | R1-6 |
| READ-1-P2 | `failed save keeps typed values` | `#43` 503 | 저장 | 입력값 그대로 | C6 끊김 |
| READ-1-P2 | `sign out clears cached logs` | 목록 불러옴 | 로그아웃 | 목록 비움, 다른 계정 로그인 때 옛 기록 0 | 계정 전환 |
| READ-1-P2 | `publish button goes to compose with fromLog` | `published_post_id: null` / 값 있음 | 누름 | `/posts/new` `fromLog` / `/posts/[postId]` | LOCAL-3 연결 |
| READ-1-P1 | `note and quote length limits are 422` | — | `note` 2001자 / `quote` 301자 / 각각 상한 정확히 | `422` `detail="note"` / `"quote"`, 행 0 / 상한은 `201` | R1-O3 길이 검사가 빠지면 긴 글이 저장되어 첫 두 단언 실패 |
| READ-1-P1 | `blank note is stored as null` | — | `note: "   "` | `201`, `note: null` | 공백 칸이 CHECK(1자 이상)에 걸려 500 |
| READ-1-P2 | `saving without book shows must pick book` | 책 안 고름, 감상만 씀 | 저장 | `"책을 골라야 저장할 수 있어요"`, `createReadingLog` 0회, 감상 그대로 | R1-O2 필수 책 가드 |
| READ-1-P2 | `picking a borrowed book asks before linking loan` | `#19`에 같은 책 대출 2개(11-03·10-01) | 책 고름 → `"아니요"` / 다시 → `"연결하기"` | 카드에 11월 3일 대출, 누르기 전 `loanId` 없음 / `"아니요"` 뒤 `loanId`·도서관 그대로·같은 책에 다시 안 물음 / `"연결하기"` 뒤 `loanId`=11-03 대출·도서관=그 대출 도서관 | R1-4 자동 연결 금지, R1-O6 (묻기 없이 채우면 두 번째 단언 실패) |
| READ-1-P2 | `book without loan shows no loan card` | `#19`에 같은 책 대출 없음 / `#19` 실패 | 책 고름 | 카드 안 뜸, 저장 가능 | 대출 조회 실패가 쓰기를 막음 |
| READ-1-P2 | `library sheet allows no library` | — | 도서관 줄 → `"도서관 없이 (집·카페)"` → 저장 | 요청 `library_id: null` | R1-3 |
| READ-1-P2 | `double save creates one log` | `#43` 느린 응답 | 저장 두 번 빠르게 | `createReadingLog` 1회, 같은 `client_request_id` | 예외 #3 앱 가드 |
| READ-1-P2 | `retry after failed save reuses request id` | 첫 `#43` 실패 | 저장 → `"다시 저장하기"` | 두 요청의 `client_request_id` 같음, 입력값 그대로 | 예외 #1, 재시도 때 새 id면 중복 기록 |
| READ-1-P2 | `leaving dirty editor asks before discarding` | 감상 입력 / 빈 화면 | `✕` | `"쓰던 기록을 버릴까요?"` / 바로 닫힘 | R1-O7 |
| READ-1-P2 | `detail menu has 수정 and 지우기 and edit cannot change book` | 기록 | `⋯` → `"수정"` | 메뉴 두 줄 `"수정"`·`"지우기"`, 수정 화면 제목 `"기록 수정"`, 책 칸 누름 → 검색 화면 안 열림·`"책은 바꿀 수 없어요"`, 저장 요청에 `isbn13` 없음 | R1-O4, #45 책 고정 |
| READ-1-P2 | `delete asks first and removes from shelf` | 기록(`published_post_id` 있음) | `⋯` → `"지우기"` → `"취소"` / 다시 → `"지우기"` | 취소면 `deleteReadingLog` 0회 / 확인창에 `"올린 게시물은 그대로 남아요."`, 1회 뒤 책장에서 빠짐·`"기록을 지웠어요"` | R1-O5, 확인 없이 지우면 첫 단언 실패 |
| READ-1-P2 | `empty shelf shows first book message` | `#41` `items: []` | 탭 열기 | `"아직 꽂힌 책이 없어요."`, `+` 보임 | 예외 #2 |
| READ-1-P2 | `signed out tab shows login prompt without api call` | 비로그인 | 탭 열기 | 로그인 안내·`"로그인하기"`, `fetchReadingLogs` 0회 | 예외 #4 |
| READ-1-P2 | `missing or others log shows not found` | `#42` `404` | `/reading/<id>` 열기 | `"찾을 수 없는 기록이에요"`, 수정·지우기 없음 | 예외 #4 타인 |

## READ-2 전체 보기·도서관별 보기(내 발자취)·기초 통계·홈 "내 최근 독서 기록"

- **담당 역할**: A (서버 파트 포함, 홈 하단 창도 A 화면) · **대상 브랜치**: `main`
- **기준 명세서**: `specs/reading-log/세부/READ-2.md`, 시안 `specs/reading-log/세부/READ-2_시안.html` (기획 때 작성)
- **판**: 1차 D 기준선(M2 밑그림, 2026-11-19)
- **선행 설계**: 02 READ-02(전체 기록·도서관별 거르기·기초 통계, 빈 통계는 0, 내 발자취는 이 탭의 도서관별 보기로 통합)·VISIT-06("내 최근 독서 기록"은 READ가 생길 때 넣는다)·AC-READ, Q-44, `library-visit.md` VISIT-1b W11("내 최근 독서 기록"은 넣지 않는다 — READ-2에서 연다)
- **작성자**: D (시니어)
- **상태**: **D 승인 수정본 — 구현은 두 PR 머지 및 team 계약 발행 확인 뒤 착수.** 선행: READ-1 구현 머지(#251)
- **발행 본문 SHA**: 



### 계약

- 책장 안 읽은 책의 순서는 READ-1의 최근 읽은 순을 사용한다. 기획 결정 2(⚙ 순서 메뉴·꾹 눌러 재배치)는 별도 계약 승인 대기다.

#### C1. 결정

| # | 결정 | 상태 | 근거 |
| :--- | :--- | :--- | :--- |
| R2-1 | 독서 기록 탭에서 **전체 기록**을 보고 **도서관별로 거른다.** 도서관별 보기가 "내 발자취"다(별도 탭·사이드바 없음) | 확정 | 02 READ-02, Q-44 |
| R2-2 | 도서관별 보기에는 **기록이 있는 도서관만** 나온다. 도서관 없는 기록은 전체 보기에만 있다 | 확정 | 02 READ-01·READ-02 |
| R2-3 | **기초 통계**: 전체 기록 수·올해 수·이번 달 수(서울 기준)·도서관별 수. 기록이 없으면 모두 `0`(빈 칸·"-" 아님) | 확정(0) / 항목 셋 기본값(Claude) | 02 READ-02 |
| R2-4 | 통계는 본인 기록만 센다. 인기글·추천·책장 집계에 쓰지 않는다 | 확정 | `기능_배정.md` B절 "비공개 기록·대출은 인기글·추천 집계에 쓰지 않는다" |
| R2-5 | **홈 하단 창 "내 최근 독서 기록"**: 로그인했고 기록이 있으면 하단 창에 최근 기록 한 줄(최대 개수 열린 칸)을 넣는다. 기록이 없거나 비로그인이면 **칸 자체를 그리지 않는다**(빈 자리·가짜 카드 없음). 누르면 그 기록 상세 | 확정(넣는다·빈 칸 없음) / 위치·개수 열린 칸 | 02 VISIT-06, VISIT-1b W11 |
| R2-6 | 하단 창의 기존 칸(인기 도서·소식, VISIT-1b W1~W10)은 순서·동작을 바꾸지 않는다. 새 칸만 끼운다 | 확정 | VISIT-1b 발행판 |

##### 열린 칸 (A가 기획·시안 작성 후 채울 결정)

| # | 열린 칸 | D 추천(참고) | 채택 결정 | 상태 | 근거(명세 ID) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R2-O1 | 전체 / 도서관별 바꾸는 모양(위 알약 / 위 탭) | 위 알약 `"전체"` + 도서관 이름들 | **제목 줄 오른쪽 위 버튼 하나로 바꾼다**(알약·위 탭 없음). 머리: `"독서 기록"` · 오른쪽 `"전체 ⇄"`(도서관별 보기에서는 `"도서관별 ⇄"`). 도서관별 보기 = 도서관마다 책장 한 줄: 이름표(C3, 첫 줄만 최근 날짜 포함) + 표지 가로 줄(그 도서관 기록 최근 순 최대 9권, 옆으로 밀기, 화면 오른쪽 끝에 다음 표지가 약 10% 보이는 폭), 줄 바닥선 색 = 도서관 색(`CUBE_PALETTE[paletteIndexOf(library_id, CUBE_PALETTE.length)]`, 홈 큐브와 같은 도서관 = 같은 색). 이름표 `›` → 그 도서관 책장 화면(머리 `‹` · 도서관 이름 · `"<count>권"`, 본문은 전체 책장과 같은 한 달 한 줄 책장, `#41 ?library_id=`) | 확인(사용자, 큰 틀) / 색 배정 기본값(Claude) | 큰 틀 결정 4(2026-11-19 변경), 명세 6절 |
| R2-O2 | 통계 배치와 문구(맨 위 숫자 셋 / 접히는 칸) | 맨 위 계기판 숫자 셋 | **제목 줄 아래 작은 글자 한 줄** `"전체 {total} · 올해 {this_year} · 이번 달 {this_month}"`(숫자만 `theme.colors.text`, 나머지는 READ-1 `base.sub` 모양). 책장과 **같이 스크롤**된다(제목 줄만 고정). 도서관별 보기에서도 같은 줄을 둔다. 통계를 못 받으면 그 줄만 C3 실패 문구로 바뀌고 책장은 그대로 | 확인(사용자) | 명세 결정 1(시안 #el-top 후보 A), 예외 #1 |
| R2-O3 | 도서관별 보기 정렬(기록 많은 순 / 최근 순) | 기록 많은 순 | **첫 줄**은 가장 최근에 읽은 도서관 하나이며, 이름표에 권수와 최근 날짜를 붙인다. 읽은 날짜는 `read_on`, 없으면 `created_at`의 서울 날짜다. 날짜가 같으면 그 날짜 기록의 `created_at DESC`, 그래도 같으면 `library_id ASC`다. **둘째 줄부터**는 나머지 도서관을 `count DESC, library_id ASC`로 정렬하고 권수만 표시한다. 최초 조회 및 기록 변경 후 재조회에 같은 규칙을 적용한다 | 확정(사용자/D) / 동률 기본값 | 명세 결정 3(시안 #el-libsort 후보 D) |
| R2-O4 | 홈 하단 창 안 자리(인기 도서 위 / 아래)와 개수 | 인기 도서 아래, 최대 5권 옆으로 넘김 | **인기 도서(`PopularBooksRow`) 바로 아래, 소식(`LibraryNewsSection`) 위.** 칸 제목 `"내 최근 독서 기록"`, 표지 **최대 5권**(`#41 limit=5`, #41 정렬 그대로 최근 순) 가로 줄(인기 도서와 같은 표지 크기, 옆으로 넘김), 5권 미만이면 있는 만큼. 표지를 누르면 그 기록 화면. 차선: 맨 위 가장 최근 1권 한 줄 카드 | 확인(사용자) | 명세 결정 4(시안 #el-home 후보 A, 차선 B) |
| R2-O5 | 기록 목록 카드 모양(표지 + 제목 + 날짜 / 표지만) | 표지 + 제목 + 날짜 | **표지만**(READ-1 책장 표지 면 그대로: 한 줄 3권, 한 달 한 줄, 3권 넘으면 그 달 안에서 줄바꿈). 제목·저자·감상 첫 줄·읽은 날·도서관은 책을 누르면 뜨는 책장 위 카드(READ-1 R1-O4 그대로) | 확인(사용자, 큰 틀) / 카드 유지 기본값(Claude) | 큰 틀 결정 3(2026-11-19 수정), 명세 0절 기본값 |

#### C2. 엔드포인트 / 주요 함수

| 메서드·경로 (`/api/v1`) | 인증 | 성공 상태 | 날짜 형식 | 목록 | 연타·재시도 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /me/reading-logs?library_id=&cursor=&limit=` (#41, READ-1) | 필수 | `200` | READ-1 | READ-1 | 러너 |
| `GET /me/reading-logs/stats` (#46, A) | 필수 | `200` | — | `libraries[]`는 R2-O3 순서로 응답 | N/A |

앱 함수·부품:

- `mobile/src/features/reading-log/api.ts` `fetchReadingStats(signal?: AbortSignal): Promise<ReadingStats>`
- `mobile/src/features/reading-log/useReadingLogs.ts` `useReadingLogs(): { filter: { libraryId: number | null }; setFilter(libraryId: number | null): void; items: ReadingLog[]; status: "loading" | "ready" | "empty" | "error"; hasMore: boolean; loadMore(): void; stats: ReadingStats | null; reload(): void }`
- `mobile/src/features/library-visit/RecentReadingRow.tsx` `export function RecentReadingRow(props: { onOpenLog(logId: string): void }): JSX.Element | null` — 비로그인·0개면 `null`(R2-5)

#### C3. 요청·응답 필드와 화면 문구

| 구분 | 필드/키 | 타입 | 필수 | null 허용 | 설명·고정 문구 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 응답(#46) `ReadingStats` | `total` | `int` | Y | N | 0 이상 |
| `ReadingStats` | `this_year` | `int` | Y | N | 서울 기준 올해(`coalesce(read_on, created_at 서울 날짜)`) |
| `ReadingStats` | `this_month` | `int` | Y | N | 서울 기준 이번 달 |
| `ReadingStats` | `libraries[]` | `{ library_id: int; name: str; count: int; last_read_on: str }[]` | Y | N | 기록이 있는 도서관만(R2-2). `last_read_on`은 해당 도서관의 마지막 독서일(`YYYY-MM-DD`, R2-O3) |
| 화면 문구 | 전체 알약 | — | — | — | `"전체"` |
| 화면 문구 | 통계 이름 (`R2-O2`) | — | — | — | `"전체 {total} · 올해 {this_year} · 이번 달 {this_month}"` (기록 0이면 `"전체 0 · 올해 0 · 이번 달 0"`) |
| 화면 문구 | 도서관별 빈 상태 | — | — | — | `libraries: []`이면 책장 자리에 `"도서관에서 읽은 기록이 아직 없어요."` + 둘째 줄 `"기록을 쓸 때 도서관을 고르면 여기 꽂혀요."`, `+`는 그대로 |
| 화면 문구 | 홈 하단 창 칸 제목 (`R2-O4`) | — | — | — | `"내 최근 독서 기록"` |
| 화면 문구 | 통계 불러오기 실패 | — | — | — | 숫자 줄 자리에 `"숫자를 불러오지 못했어요"` + 버튼 `↻` 표시 + `"새로고침"`(접근성 이름 `"새로고침"`, `#46`만 다시) |
| 화면 문구 | 보기 바꾸기 버튼 (`R2-O1`) | — | — | — | 전체 보기 `"전체 ⇄"` / 도서관별 보기 `"도서관별 ⇄"`. 접근성 이름 `"도서관별로 보기"` / `"전체로 보기"` |
| 화면 문구 | 도서관 이름표 (`R2-O1`·`R2-O3`) | — | — | — | 첫 줄 `"<name> <count>권 · 최근 <M>월 <D>일 ›"`, 둘째 줄부터 `"<name> <count>권 ›"` |
| 화면 문구 | 한 도서관 책장 머리 (`R2-O1`) | — | — | — | `‹` · `<name>` · `"<count>권"` |
| 화면 문구 | 도서관 한 줄 불러오기 실패 | — | — | — | 그 줄 자리에 `"책을 불러오지 못했어요"` + 버튼 `↻` 표시 + `"새로고침"`(그 도서관 `#41`만 다시) |

#### C4. 플랫폼 분기 표

`N/A: 공통 View 코드. 홈 하단 창 끌기 분기는 VISIT-1b C4 그대로.`

#### C5. 테이블

`해당 없음: 새 표 없음.` READ-1의 `reading_logs`를 읽기만 한다(`ix_reading_logs_user_library`).

#### C6. 검증과 에러 처리

| 명세서 예외 # | 발생 조건 | HTTP / `code` / `detail` | 화면에서 바뀌는 영역 | 유지되는 영역 | 기록 보장 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 끊김 | 통계·목록 실패 | `ApiCallError` | 그 칸만 | 다른 칸(통계 실패는 목록 유지) | — |
| 빈 결과 | 기록 0 | `200` 숫자 모두 0, `libraries: []` | 0 표시 + 빈 목록 문구 | — | — |
| 연타 | 알약 빠르게 바꿈 | 늦은 `200` | 마지막 알약 것만 | — | — |
| 비로그인 | 탭·홈 하단 창 | 앱은 부르지 않음 | 탭은 READ-1 비로그인 안내, 홈 칸 없음 | 홈 나머지 | — |
| 홈 칸 실패 | `#41` 실패 | `ApiCallError` | 홈 칸을 그리지 않음 | 하단 창 다른 칸(VISIT-1b W10) | — |
| 끊김(도서관 한 줄) | 도서관별 보기에서 그 도서관 `#41 ?library_id=&limit=9` 실패 | `ApiCallError` | 그 줄 자리만 C3 `"책을 불러오지 못했어요"` + `"새로고침"` | 이름표·다른 도서관 줄·숫자 줄 | — |
| 연타(이름표) | 이름표 `›`를 눌러 한 도서관 책장을 열고 바로 다른 이름표 | 늦은 `200` | 마지막으로 연 도서관 책만 | — | — |
| 계정 바뀜·로그아웃 | 응답 도착 전 로그아웃·다른 계정 로그인 | 늦은 `200` | 늦은 응답 버림(READ-1 `shelfStore` owner 확인과 같음), 통계·도서관 줄·홈 칸 비움 | — | 남의 기록이 보이지 않음 |

#### C7. 다른 기능과 닿는 곳과 `TODO(연결)` 가짜 값

| 의존 대상 | 필요한 것 | 상대 머지 전 가짜 값 |
| :--- | :--- | :--- |
| A READ-1 | `#41`, `reading_logs` | READ-1 머지 뒤 시작(선행) |
| A VISIT-1b | `HomeSheet.tsx` 칸 끼우는 자리 | 있음 |
| A VISIT-1b (R2-O4 자리) | `PopularBooksRow`와 `LibraryNewsSection` 사이. `HomeSheet.tsx`의 W11 주석 줄은 이 칸으로 대체 | 있음 |
| A VISIT-1 (홈 큐브 색) | 도서관 색 `CUBE_PALETTE`·`paletteIndexOf` | 있음(`mobile/src/theme/tokens.ts:89`, `mobile/src/features/library-visit/direction.ts:86`) |

### 구현 계획

#### P1. 확인한 기존 코드 전제

| 참조 대상 | 실제 경로와 줄 | 심볼·시그니처 | 있음 / 앞으로 만듦 |
| :--- | :--- | :--- | :--- |
| 홈 하단 창 | `mobile/src/features/library-visit/HomeSheet.tsx`, `useHomeFeed.ts` | VISIT-1b | 있음 |
| 기록 목록 | `#41` | READ-1 | 앞으로 만듦(READ-1) |
| 기록 목록(READ-1 머지 #251 뒤 실제) | `#41` | READ-1 | 있음: `server/app/routers/reading_logs.py:149-183` `list_reading_logs(library_id, cursor, limit)`, 정렬 `SORT_DATE`(`:39` `coalesce(r.read_on, (r.created_at AT TIME ZONE 'Asia/Seoul')::date)`) `DESC, created_at DESC, id DESC`(`:170`) |
| 서울 날짜 | `server/app/common.py:35` | `today_kst(now=None) -> date` | 있음 |
| 앱 목록 함수 | `mobile/src/features/reading-log/api.ts:78-89` | `fetchReadingLogs(q: { libraryId?: number; cursor?: string \| null; limit?: number }, signal?)` | 있음 |
| 책장 저장소·정렬 | `mobile/src/features/reading-log/api.ts:121-185`, `:188-205` | `shelfStore`(owner 확인), `seoulToday`, `shelfDate`, `sortShelf` | 있음 |
| 책장 화면 | `mobile/src/features/reading-log/ReadingLogScreen.tsx:40-60`, `:62` | `groupByMonth`, `chunk`, `ReadingLogScreen`(통계·도서관별은 READ-2라고 주석 `:1-4`) | 있음 |
| 도서관 색 | `mobile/src/theme/tokens.ts:89`, `mobile/src/features/library-visit/direction.ts:86` | `CUBE_PALETTE`, `paletteIndexOf(id: number, n: number): number` | 있음 |
| 최신 응답만 | `mobile/src/lib/latest.ts:6` | `createLatestRunner()` | 있음 |
| 로그아웃 정화 | `mobile/src/auth/AuthProvider.tsx:51` | `registerSignOutCleanup(fn)` | 있음 |
| 홈 하단 창 칸 자리 | `mobile/src/features/library-visit/HomeSheet.tsx`(`PopularBooksRow` → `LibraryNewsSection` → W11 주석) | VISIT-1b | 있음 |
| VISIT-1b 시험 `no reading log section` | `library-visit.md` VISIT-1b P5(`home-sheet.test.tsx`) | 비로그인 기본 렌더에서 `"독서 기록"` 글자 없음 | 있음 — R2-5(비로그인·0개면 칸 없음)와 모순 없음. 칸 제목은 `"내 최근 독서 기록"`이라 로그인·기록 있는 가짜 값으로 바꾸면 깨진다 → 그 시험 파일은 P2 밖이라 손대지 않음 |
| 통계 함수·훅·홈 칸 | `fetchReadingStats`, `useReadingLogs`, `RecentReadingRow`, `#46` | C2 | 앞으로 만듦 |

#### P2. 파트 분할과 담당 파일

| 파트 | 브랜치 | 수정/생성 허용 파일(전수) | 완료 시 확인할 명세서 항목 |
| :--- | :--- | :--- | :--- |
| `READ-2-P1` 통계 서버·탭 거르기 | `feat/reading-log-READ-2` | `server/app/routers/reading_logs.py`(`#46`), `server/tests/test_reading_stats.py`, `mobile/src/features/reading-log/api.ts`, `useReadingLogs.ts`, `ReadingLogScreen.tsx`, `mobile/src/features/reading-log/__tests__/reading-filter.test.tsx` | R2-1~R2-4, R2-O1~R2-O3·R2-O5 |
| `READ-2-P2` 홈 "내 최근 독서 기록" | 같은 브랜치 | `mobile/src/features/library-visit/RecentReadingRow.tsx`, `HomeSheet.tsx`, `mobile/src/features/library-visit/__tests__/recent-reading.test.tsx` | R2-5·R2-6, R2-O4 |

##### 파트 머리말 — READ-2-P1 · P2 (공통)

| 칸 | 값 |
| --- | --- |
| 1. 태스크 ID | `READ-2-P1` / `READ-2-P2` |
| 2. 담당 역할 | A |
| 3. 기준선 버전 | M2 D 기준선 |
| 4. 계약서 커밋 | N/A: 검토 전 수정본 — D 발행 뒤 실제 본문 SHA 기록 |
| 5. 선행 태스크 | READ-1 머지 |
| 6. 수정 허용 파일 | 위 표 |
| 7. 금지된 결정 | 하단 창 기존 칸 순서·동작 변경 금지(R2-6). 빈 기록 칸·가짜 카드 금지(R2-5). 통계를 다른 집계에 쓰지 않음(R2-4) |
| 8. 완료 조건 | 파트 표 항목 + P5 + 웹·Android |
| 9. 검증 명령 | READ-1과 같음 + `npx jest --runInBand src/features/library-visit` |
| 10. 보고 형식 | `../prompts/3_구현.md` 5단계 |

#### P3. 새 라이브러리

| 쪽 | 패키지 | 용도 | 설정 |
| --- | --- | --- | --- |
| 서버·앱 | 없음 | — | — |

#### P4. 핵심 흐름 골격

```python
# #46 — 본인 기록만, 빈 값은 0
SELECT count(*) AS total,
       count(*) FILTER (WHERE date_trunc('year',  d) = date_trunc('year',  :today)) AS this_year,
       count(*) FILTER (WHERE date_trunc('month', d) = date_trunc('month', :today)) AS this_month
FROM (SELECT coalesce(read_on, (created_at AT TIME ZONE 'Asia/Seoul')::date) AS d
      FROM reading_logs WHERE user_id = :uid) t;
-- :today = today_kst(). libraries[]는 library_id IS NOT NULL만 GROUP BY (R2-2)
```

```ts
// RecentReadingRow.tsx
// 비로그인 → null. #41 limit=(열린 칸 R2-O4) → 0개·실패면 null (R2-5, C6 홈 칸 실패)
```

```python
# #46 libraries[] — R2-O3 (위 SQL과 같은 d, 같은 트랜잭션)
WITH dated AS (
  SELECT library_id, created_at,
         coalesce(read_on, (created_at AT TIME ZONE 'Asia/Seoul')::date) AS d
  FROM reading_logs WHERE user_id = :uid AND library_id IS NOT NULL
), per_library AS (
  SELECT DISTINCT ON (library_id) library_id, d AS last_read_on, created_at,
         count(*) OVER (PARTITION BY library_id) AS count
  FROM dated ORDER BY library_id, d DESC, created_at DESC
), ranked AS (
  SELECT *, row_number() OVER (ORDER BY last_read_on DESC, created_at DESC, library_id ASC) AS recent_rank
  FROM per_library
)
SELECT r.library_id, l.name, r.count, r.last_read_on
FROM ranked r JOIN libraries l ON l.id = r.library_id
ORDER BY (r.recent_rank = 1) DESC, r.count DESC, r.library_id ASC;
-- :uid = 검증한 JWT sub. 인증 없으면 401(#41과 같은 의존성)
```

```ts
// ReadingLogScreen.tsx — R2-O1·O2 (READ-1 책장 위에 덧붙임)
// view: "all" | "libraries" | { libraryId, name, count }   (기기 저장 없음, 탭을 다시 열면 "all")
// 머리 고정: "독서 기록" · view === "all" ? "전체 ⇄" : "도서관별 ⇄"
// 스크롤 본문 첫 줄 = 숫자 줄(R2-O2): stats ? `전체 ${t} · 올해 ${y} · 이번 달 ${m}` : statsFailed ? 실패 문구 + "새로고침" : 자리만
// useReadingLogs: owner(userId)가 바뀌면 stats·rows 비우고 세대 +1. 늦은 응답은 세대·owner 다르면 버림(C6 계정 바뀜)
//
// 도서관별 보기:
//   stats.libraries가 []면 C3 도서관별 빈 상태
//   응답 순서로 한 도서관당 한 줄. 첫 줄만 last_read_on을 서울 날짜의 월·일로 표시(C3).
//   각 줄: 처음 보일 때 한 번 fetchReadingLogs({ libraryId, limit: 9 }, signal)   (줄마다 AbortController,
//          보기를 바꾸거나 화면을 떠나면 모두 abort). 실패면 그 줄만 C3 실패 문구 + 새로고침
//   이름표 › → view = { libraryId, name, count }: runner.run(s => fetchReadingLogs({ libraryId, cursor }, s))
//          result.status === "stale"이면 버림(C6 연타 이름표). 본문은 groupByMonth(items) 그대로
//   줄 색: CUBE_PALETTE[paletteIndexOf(libraryId, CUBE_PALETTE.length)]
// "전체 ⇄" 연타: view만 바꾸고 이전 보기 요청 abort → 마지막 보기만(C6 연타)
// 쓰기·지우기 뒤 책장으로 돌아오면 stats와 열린 도서관 줄을 다시 받음(읽은 날짜와 권수에 따라 R2-O3 재적용)
```

```ts
// RecentReadingRow.tsx — R2-O4, R2-5
// if (status !== "signedIn") return null
// fetchReadingLogs({ limit: 5 }, signal) → items.length === 0 || 실패 → null (빈 자리·안내 없음)
// 제목 "내 최근 독서 기록" + 표지 가로 ScrollView(PopularBooksRow와 같은 표지 크기)
// 표지 onPress → props.onOpenLog(log.id) → HomeSheet: router.push({ pathname: "/reading/[logId]", params: { logId } })
// owner가 바뀌면(로그아웃·계정 전환) 늦은 응답 버림 + 비움. 홈에 돌아올 때(focus) 다시 받음
// HomeSheet.tsx: <PopularBooksRow (기존 props)/> <RecentReadingRow onOpenLog={openLog}/> <LibraryNewsSection (기존 props)/>  (기존 두 칸 props·순서 그대로, R2-6)
```

#### P5. 필수 테스트

| 파트 | 테스트 이름 | 준비 | 실행 | 기대 단언 | 잡아야 할 버그 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| READ-2-P1 | `stats are zero without logs` | 기록 0 | `#46` | `total/this_year/this_month` 0, `libraries: []` | 빈 통계 |
| READ-2-P1 | `stats count only own logs in seoul calendar` | A 3개·B 5개, 12월 31일 23:30 KST 기록 | A `#46` | A 것만, 서울 날짜로 올해·이번 달 | 격리·날짜 경계 |
| READ-2-P1 | `library view lists only libraries with logs` | 도서관 없는 기록 2개 | `#46` | `libraries[]`에 `null` 없음, `total`에는 포함 | R2-2 |
| READ-2-P1 | `stats require auth` | 비로그인 | `#46` | `401` | 익명 |
| READ-2-P1 | `filter switch shows last library only` | deferred 2개 | 101 → 102 | 102 기록만 | 늦은 응답 |
| READ-2-P2 | `home row hidden when signed out or empty` | 비로그인 / 0개 / `#41` 실패 | 홈 렌더 | 칸 없음, `"독서 기록"` 글자 없음, 다른 칸 정상 | R2-5 |
| READ-2-P2 | `home row opens log detail` | 기록 2개 | 누름 | `router.push({pathname:"/reading/[logId]",params:{logId}})` 1번 | 이동 |
| READ-2-P2 | `home sheet keeps existing sections order` | 기록 있음 | 렌더 | VISIT-1b 칸 순서 그대로, 새 칸만 R2-O4 자리 | R2-6 |
| READ-2-P1 | `library list pins only the latest library before count order` | A 기록: 101(5권, 11-19), 102(2권, 11-22), 103(1권, 11-21), 104(5권, 11-20). 도서관 없는 11-23 기록도 추가 | A `#46` | 순서 102·101·104·103, 각 도서관 한 번, 권수 정확, 첫 줄 `last_read_on == "2026-11-22"` | R2-O3 — 전체 최근순·전체 권수순·동률 재정렬·중복·도서관 없는 기록 포함을 잡음 |
| READ-2-P1 | `latest library handles seoul fallback and same-day ties` | 101·102·103의 마지막 읽은 날은 11-22. 101의 해당 날짜 기록이 늦게 생성되고 102·103은 동일 시각. 102에 뒤늦게 입력한 과거 기록 추가 | A `#46` → 102에 서울 11-23 00:30에 만든 `read_on=null` 기록 추가 → 재조회 → 그 기록을 삭제하고 재조회 | 첫 줄 101 → 102 → 101, 102의 새 날짜는 UTC 11-22가 아닌 서울 11-23. 101 기록 삭제 후 재조회 시 102·103 중 ID가 작은 102가 첫 줄 | R2-O3 — 과거 기록의 입력 시각 오사용, UTC 날짜, 최근 동률·재조회 오류 |
| READ-2-P1 | `stats line shows three numbers and scrolls with shelf` | `#46` `{total:12,this_year:9,this_month:2}` | 탭 열기 | `"전체 12 · 올해 9 · 이번 달 2"`가 책장 `ScrollView` 안에 있음(머리 밖), 머리에 `"전체 ⇄"` | R2-O2, 결정 1 — 숫자 줄을 머리에 고정하면 실패 |
| READ-2-P1 | `stats failure keeps shelf and retries stats only` | `#46` 실패, `#41` 성공 | 탭 열기 → `"새로고침"` | `"숫자를 불러오지 못했어요"`, 책 표지 보임, 새로고침 때 `fetchReadingStats` 2회·`fetchReadingLogs` 1회 | 예외 #1, C6 끊김 |
| READ-2-P1 | `zero stats and empty library view` | `#46` 0·0·0·`libraries: []` | 탭 → `"전체 ⇄"` | `"전체 0 · 올해 0 · 이번 달 0"`, `"도서관에서 읽은 기록이 아직 없어요."`, `+` 보임 | 예외 #2, R2-3 |
| READ-2-P1 | `library view rows load nine per library with library color` | `libraries` 2곳 | `"전체 ⇄"` | `fetchReadingLogs({libraryId, limit: 9})` 도서관마다 1회, 첫 이름표만 `"최근 11월 22일"` 포함, 아래 줄은 응답 순서와 권수만 표시, 줄 색 = `CUBE_PALETTE[paletteIndexOf(id, n)]` | R2-O1, 결정 4(큰 틀) |
| READ-2-P1 | `one library row failure keeps other rows` | 102 줄 `#41` 실패 | `"전체 ⇄"` → 102 `"새로고침"` | 102 자리만 `"책을 불러오지 못했어요"`, 101 표지·숫자 줄 그대로, 새로고침 때 102 요청만 1회 더 | C6 끊김(도서관 한 줄) |
| READ-2-P1 | `library tag opens that library shelf and late response is dropped` | 101·102 응답 deferred | 101 › → 바로 ‹ → 102 › → 101 응답 먼저 해결 | 머리 `"서대문도서관"`·102 기록만, 101 책 없음 | C6 연타(이름표) — 러너 stale 확인을 빼면 실패 |
| READ-2-P1 | `toggle twice quickly shows last view only` | `#46` deferred | `"전체 ⇄"` 두 번 빠르게 | 마지막 보기(전체) 책장만, 도서관 줄 요청은 abort | 예외 #3, C6 연타 |
| READ-2-P1 | `sign out during stats load clears view` | `#46` deferred | 로그아웃 → 응답 해결 | 숫자 줄·도서관 줄 안 보임, 로그인 안내 | C6 계정 바뀜, AC-RACE |
| READ-2-P2 | `home row sits between popular books and news with up to five covers` | `#41` 7개 중 앞 5개 | 홈 렌더 | `fetchReadingLogs({limit: 5})` 1회, 제목 `"내 최근 독서 기록"`, 표지 5개, 렌더 순서 인기 도서 → 내 최근 독서 기록 → 소식 | R2-O4, 결정 4 — 자리를 바꾸면 순서 단언 실패 |
| READ-2-P2 | `home row drops late response after account switch` | `#41` deferred | 계정 A → B 전환 → A 응답 해결 | 칸 없음(또는 B 응답만) | C6 계정 바뀜 |
