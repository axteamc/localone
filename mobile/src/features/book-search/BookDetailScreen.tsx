// 책 상세(book-search.md LIB-3b V1~V4·V7, Y-6 시안): 큰 표지 → 제목·저자 → 책 소개(더 보기) → 도서 정보 → 본문 끝 보조 행동
// 하단 고정 `대출 예정 | 도서관 확인`(V3). 대출 예정 = 도서관 미지정 저장(U6), 도서관 확인 = 현재 책 단일 조회 창(#12).
// 조회 창을 열 때만 도서관을 찾는다(LIB-2 A10 — 책을 받아 온 뒤, 창을 연 뒤).
// 본문 맨 아래: loan-assistant.md LOAN-1 M10 ① "빌렸어요" 사각 버튼 → YES24 링크(V2)
// (사용자 결정 2026-11-24, 개발산출물/시안/Y-6_빌렸어요_위치_시안.html 후보 C — 계약 반영 대기).
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { createLatestRunner } from "../../lib/latest";
import { openExternalUrl } from "../../lib/platform";
import {
  ApiCallError,
  fetchBook,
  fetchPurchaseLink,
  type AvailabilityItem,
  type Book,
  type PurchaseLink,
} from "../../lib/publicApi";
import { actionColors, cardSurface, theme, type as typeScale } from "../../theme";
import { StartLoanButton } from "../loan-assistant/StartLoanButton";
import { saveLoanPlan } from "./api";
import { availabilitySummary, checkedAtLabel } from "./availabilityText";
import { EmptyAvailability } from "./EmptyAvailability";
import { LibraryAvailabilityCard } from "./LibraryAvailabilityCard";
import { pushRecentBook } from "./recentBooks";
import { RegionPicker } from "./RegionPicker";
import { SAVE_FAILED, SavePlanSheet } from "./SavePlanSheet";
import { BookCover, SEARCH_FAILED } from "./SearchScreen";
import { useAvailability } from "./useAvailability";

export const NOT_FOUND = "찾을 수 없어요.";
export const LOGIN_TO_SAVE = "로그인하면 빌릴 예정을 저장할 수 있어요";
export const SAVED_NOTE = "빌릴 예정 메모에 저장했어요. 대출·반납 탭에서 볼 수 있어요."; // N8
export const PLAN_LABEL = "대출 예정"; // V3
export const FIND_LABEL = "도서관 확인"; // V3
export const SOURCE_YES24 = "출처: YES24"; // V1
export const YES24_DETAIL = "YES24에서 도서 상세 보기 ↗"; // V2 kind=product
export const YES24_SEARCH = "YES24에서 도서 검색 ↗"; // V2 kind=search(시안)
export const YES24_BUY = "YES24에서 구매하기 ↗"; // V7
export const YES24_OPEN_FAILED = "YES24를 열지 못했어요. 다시 시도해 주세요.";
export const LIBRARY_SHEET_TITLE = "가까운 도서관";
export const SCOPE_CAPTION = "현재 책의 대출 상태"; // Y-6 시안 조회 창 범위 줄
export const BASIS_NOTE = "실제 상태는 도서관에서 확인해 주세요.";
export const OPEN_PLANS_LABEL = "빌릴 예정 보기"; // V4 아이콘 접근성 이름

const ISBN13 = /^[0-9]{13}$/;
const DESC_LINES = 5; // "책 소개 더 보기" 전 줄 수(기본값(Claude))

type State =
  | { kind: "loading" }
  | { kind: "ready"; book: Book }
  | { kind: "notFound" }
  | { kind: "error" };

export function BookDetailScreen({ isbn13 }: { isbn13: string }) {
  const router = useRouter();
  const { userId, status: authStatus } = useAuth();
  const runner = useMemo(() => createLatestRunner(), []);
  const linkRunner = useMemo(() => createLatestRunner(), []);
  const [state, setState] = useState<State>(
    ISBN13.test(isbn13) ? { kind: "loading" } : { kind: "notFound" }
  );
  const [saveNote, setSaveNote] = useState<"login" | "saved" | "failed" | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // 연타해도 한 번만 보낸다(L3-#3)
  const [sheetOpen, setSheetOpen] = useState(false); // 도서관 고르는 담기 창(N3·N7, 빈 결과에서)
  const [findOpen, setFindOpen] = useState(false); // 도서관 확인 창(V3)
  const [candidates, setCandidates] = useState<AvailabilityItem[]>([]); // 담기 창 후보 = 지금 찾아본 도서관(N3)
  const [link, setLink] = useState<PurchaseLink | null>(null);
  const [linkFailed, setLinkFailed] = useState(false);
  const [descOpen, setDescOpen] = useState(false);

  const load = useCallback(async () => {
    if (!ISBN13.test(isbn13)) {
      setState({ kind: "notFound" }); // 13자리가 아니면 묻지 않는다(C3)
      return;
    }
    setState({ kind: "loading" });
    const r = await runner.run((signal) => fetchBook(isbn13, signal));
    if (r.status === "stale") return;
    if (r.status === "error") {
      const e = r.error;
      const missing = e instanceof ApiCallError && (e.status === 404 || e.status === 422);
      setState({ kind: missing ? "notFound" : "error" }); // S-4 / S-11, 기록하지 않음
      return;
    }
    setState({ kind: "ready", book: r.value });
  }, [isbn13, runner]);

  useEffect(() => {
    setFindOpen(false);
    setLink(null);
    setDescOpen(false);
    void load();
    return () => {
      runner.cancel();
      linkRunner.cancel();
    };
    // userId가 바뀌어도 다시 부르지 않는다(같은 책)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isbn13]);

  const readyBook = state.kind === "ready" ? state.book : null;

  // V2 YES24 링크(#15). 실패하면 링크만 숨긴다(책 상세는 그대로).
  useEffect(() => {
    if (!readyBook) return;
    void linkRunner.run((signal) => fetchPurchaseLink(readyBook.isbn13, signal)).then((r) => {
      if (r.status === "ok" && r.value) setLink(r.value);
    });
  }, [readyBook, linkRunner]);

  // 책을 받아 온 뒤에만 최근 본 도서에 남긴다(B4). 로그인 복원이 끝난 뒤의 계정으로 한 번만 남긴다
  // (복원 중 guest 키로 가지 않게 — D 이월 메모, 이슈 113). 저장 실패는 화면을 막지 않는다(S-6).
  const recordedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!readyBook || authStatus === "loading" || recordedFor.current === readyBook.isbn13) return;
    recordedFor.current = readyBook.isbn13;
    void pushRecentBook(userId, readyBook).catch(() => undefined);
  }, [readyBook, authStatus, userId]);

  /** V3 "대출 예정" — 도서관 없이 바로 담는다(U6). 로그인 복원 중에는 아무것도 하지 않는다(②-3). */
  const onPlan = async () => {
    if (authStatus === "loading" || savingRef.current || !readyBook) return;
    if (authStatus !== "signedIn") {
      setSaveNote("login");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveNote(null);
    try {
      await saveLoanPlan(readyBook.isbn13, null); // 201 새로 / 200 이미 있음 — 둘 다 저장된 것(U4)
      setSaveNote("saved");
    } catch (e) {
      setSaveNote(e instanceof ApiCallError && e.status === 401 ? "login" : "failed");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // 빈 결과의 "나중에 빌릴 책으로 저장" — 지금 찾아본 도서관 중에서 골라 담는다(N3·N7 흐름 그대로, U6).
  const onSaveWithLibrary = () => {
    if (authStatus === "loading") return;
    if (authStatus === "signedIn") {
      setSaveNote(null);
      setSheetOpen(true);
    } else {
      setSaveNote("login");
    }
  };

  const openLink = async () => {
    if (!link) return;
    setLinkFailed(!(await openExternalUrl(link.url)));
  };

  if (state.kind === "loading") {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator accessibilityLabel="불러오는 중" />
      </View>
    );
  }
  if (state.kind === "notFound") {
    return (
      <View style={styles.screen}>
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>{NOT_FOUND}</Text>
        </View>
      </View>
    );
  }
  if (state.kind === "error") {
    return (
      <View style={styles.screen}>
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>{SEARCH_FAILED}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void load()}
            style={({ pressed }) => [styles.darkBtn, pressed && ACT.secondaryPressed]}
          >
            <Text style={styles.darkBtnText} numberOfLines={1}>다시 해 보기</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const b = state.book;
  const topFacts: [string, string][] = [];
  if (b.publisher) topFacts.push(["출판사", b.publisher]);
  if (b.pub_year !== null) topFacts.push(["출판 연도", String(b.pub_year)]);
  const longDesc = (b.description?.length ?? 0) > 160; // 대략 5줄 넘는 소개만 접는다(기본값(Claude))

  return (
    <View style={styles.screen}>
      {/* V4: 우측 상단 리스트 아이콘(숫자 없음) → 대출·반납 탭의 빌릴 예정 */}
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              testID="open-plans"
              accessibilityRole="button"
              accessibilityLabel={OPEN_PLANS_LABEL}
              onPress={() => router.push("/loans")}
              hitSlop={8}
              style={styles.headerIcon}
            >
              <ListIcon />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.flex} contentContainerStyle={styles.scrollBody}>
        {/* Y-6 시안: 표지 띠(바탕·아래 줄눈) → 왼쪽 정렬 제목·저자·출처 → 구역마다 위 줄눈 */}
        <View style={styles.hero}>
          <BookCover book={b} style={styles.cover} fontSize={15} />
        </View>
        <View style={styles.content}>
        <View testID="detail-info" style={styles.meta}>
          <Text style={styles.title}>{b.title}</Text>
          {!!b.author && <Text style={styles.sub}>{b.author}</Text>}
          {b.source === "yes24" && <Text style={styles.kicker}>{SOURCE_YES24}</Text>}
        </View>

        {saveNote === "login" && (
          <View style={styles.note}>
            <Text style={styles.noteText}>{LOGIN_TO_SAVE}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/login")}
              style={({ pressed }) => [styles.darkBtn, pressed && ACT.secondaryPressed]}
            >
              <Text style={styles.darkBtnText} numberOfLines={1}>로그인</Text>
            </Pressable>
          </View>
        )}
        {saveNote === "saved" && (
          <View testID="saved-note" style={styles.note}>
            <Text style={styles.noteText}>{SAVED_NOTE}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/loans")}
              style={({ pressed }) => [styles.darkBtn, pressed && ACT.secondaryPressed]}
            >
              <Text style={styles.darkBtnText} numberOfLines={1}>대출·반납 보기</Text>
            </Pressable>
          </View>
        )}
        {saveNote === "failed" && <Text style={styles.error}>{SAVE_FAILED}</Text>}

        {b.description !== null && (
          <View testID="description" style={styles.block}>
            <Text style={styles.section} numberOfLines={1}>책 소개</Text>
            <Text style={styles.desc} numberOfLines={longDesc && !descOpen ? DESC_LINES : undefined}>
              {b.description}
            </Text>
            {longDesc && (
              <Pressable accessibilityRole="button" onPress={() => setDescOpen((v) => !v)} hitSlop={8}>
                <Text style={styles.textBtn}>{descOpen ? "접기" : "책 소개 더 보기"}</Text>
              </Pressable>
            )}
          </View>
        )}

        <View testID="bibliography" style={styles.block}>
          <Text style={styles.section} numberOfLines={1}>도서 정보</Text>
          {/* Y-6 시안 정보 칸: 출판사·출판 연도 2칸 + ISBN 1칸, 테두리 칸 */}
          <View style={styles.facts}>
            {topFacts.length > 0 && (
              <View style={styles.factsRow}>
                {topFacts.map(([k, v], i) => (
                  <View key={k} style={[styles.factCell, i > 0 && styles.factCellLeft]}>
                    <Text style={styles.factKey}>{k}</Text>
                    <Text style={styles.factValue}>{v}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={[styles.factCell, topFacts.length > 0 && styles.factCellTop]}>
              <Text style={styles.factKey}>ISBN</Text>
              <Text style={styles.factValue}>{b.isbn13}</Text>
            </View>
          </View>
        </View>

        {/* 본문 맨 아래 보조 행동(사용자 결정 2026-11-24): "빌렸어요" 사각 버튼(C) → YES24 링크 */}
        <View testID="detail-end" style={styles.block}>
          <StartLoanButton variant="detail" input={{ isbn13: b.isbn13 }} />
          {link !== null && (
            <Pressable testID="yes24-detail" accessibilityRole="link" onPress={() => void openLink()} hitSlop={8}>
              <Text style={styles.textBtn}>{link.kind === "product" ? YES24_DETAIL : YES24_SEARCH}</Text>
            </Pressable>
          )}
          {linkFailed && <Text style={styles.error}>{YES24_OPEN_FAILED}</Text>}
        </View>
        </View>
      </ScrollView>

      {findOpen && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="도서관 창 닫기"
            onPress={() => setFindOpen(false)}
            style={styles.scrim}
          />
          <View testID="library-sheet" style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle} numberOfLines={1}>{LIBRARY_SHEET_TITLE}</Text>
              {/* 시안: X 아이콘(44×44). 글자 대신 선 두 개로 그린다(Android 기본 글꼴에 없는 기호 문제(이슈 128)와 같은 이유) */}
              <Pressable
                testID="library-sheet-close"
                accessibilityRole="button"
                accessibilityLabel="도서관 창 닫기"
                onPress={() => setFindOpen(false)}
                style={styles.closeBtn}
              >
                <View style={[styles.closeLine, styles.closeLineA]} />
                <View style={[styles.closeLine, styles.closeLineB]} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetPad}>
              <AvailabilitySection
                isbn13={b.isbn13}
                onItems={setCandidates}
                onSaveForLater={onSaveWithLibrary}
                purchase={link}
                onOpenPurchase={() => void openLink()}
              />
            </ScrollView>
          </View>
        </>
      )}

      <View style={styles.actions}>
        <Pressable
          testID="save-plan"
          accessibilityRole="button"
          accessibilityState={{ disabled: saving }}
          disabled={saving}
          onPress={() => void onPlan()}
          style={({ pressed }) => [styles.actionBtn, ACT.secondary, pressed && ACT.secondaryPressed, saving && styles.dim]}
        >
          <Text style={[styles.actionText, ACT.secondaryText]} numberOfLines={1}>{PLAN_LABEL}</Text>
        </Pressable>
        <Pressable
          testID="find-libraries"
          accessibilityRole="button"
          accessibilityState={{ expanded: findOpen }}
          onPress={() => setFindOpen((v) => !v)}
          style={({ pressed }) => [styles.actionBtn, ACT.primary, pressed && ACT.primaryPressed]}
        >
          <Text style={[styles.actionText, ACT.primaryText]} numberOfLines={1}>{FIND_LABEL}</Text>
        </Pressable>
      </View>

      <SavePlanSheet
        visible={sheetOpen}
        isbn13={b.isbn13}
        candidates={candidates}
        onClose={() => setSheetOpen(false)}
        onSaved={() => {
          setSheetOpen(false);
          setSaveNote("saved");
        }}
        onLoginRequired={() => {
          setSheetOpen(false);
          setSaveNote("login");
        }}
      />
    </View>
  );
}

function ListIcon() {
  return (
    <View style={styles.icon}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.iconLine} />
      ))}
    </View>
  );
}

/** V7: 단일 조회 결과가 하나 이상이고 **모두** `holding = "no"`로 확정된 때만. `unknown`이 섞이면 숨긴다. */
export function allConfirmedNotHeld(items: AvailabilityItem[]): boolean {
  return items.length > 0 && items.every((i) => i.holding === "no");
}

function AvailabilitySection({
  isbn13,
  onItems,
  onSaveForLater,
  purchase,
  onOpenPurchase,
}: {
  isbn13: string;
  onItems(items: AvailabilityItem[]): void;
  onSaveForLater(): void;
  purchase: PurchaseLink | null;
  onOpenPurchase(): void;
}) {
  const a = useAvailability(isbn13);
  useEffect(() => onItems(a.items), [a.items, onItems]);
  const [picking, setPicking] = useState(false); // "지역 다시 고르기"(A12)
  const [selected, setSelected] = useState<number | null>(null); // V5 한 곳 선택(기본값(Claude): 표시만)
  useEffect(() => setPicking(false), [isbn13]);
  useEffect(() => setSelected(null), [a.items]); // 조회 범위가 바뀌면 선택을 푼다
  const today = a.checkedAt?.slice(0, 10) ?? "";
  const footer = a.checkedAt ? checkedAtLabel(a.checkedAt) : null;
  const busy = a.status === "locating" || a.status === "loading";
  const city = a.scope === "city";
  const summary = availabilitySummary(a.items);
  const showPicker = a.status === "need_region" || picking;
  const showBuy = !busy && !showPicker && a.status !== "error" && purchase !== null && allConfirmedNotHeld(a.items);

  const chooseRegion = (code: string) => {
    setPicking(false);
    a.chooseRegion(code);
  };
  const nearbyAgain = () => {
    setPicking(false);
    a.reloadNearby?.();
  };

  return (
    <View testID="availability" style={styles.availability}>
      {city && !!a.selectedRegionLabel && (
        <Text style={styles.summary} numberOfLines={1}>{`도시 전체 도서관 · ${a.selectedRegionLabel}`}</Text>
      )}
      {/* A4: 도시 전체 버튼은 구역 머리에 늘 보인다. 도시 전체 모드에서는 내 주변 다시 보기도 함께 */}
      {/* 시안: 왼쪽 "현재 책의 대출 상태" 안내 + 오른쪽 밑줄 글자 버튼(높이 44) */}
      <View style={styles.scopeRow}>
        <Text style={styles.caption} numberOfLines={1}>{SCOPE_CAPTION}</Text>
        <View style={styles.scopeLinks}>
          {city && (
            <Pressable accessibilityRole="button" onPress={nearbyAgain} style={styles.scopeBtn}>
              <Text style={styles.scopeBtnText} numberOfLines={1}>내 주변 다시 보기</Text>
            </Pressable>
          )}
          <Pressable
            testID="search-city"
            accessibilityRole="button"
            onPress={() => {
              setPicking(false);
              a.searchCity();
            }}
            style={styles.scopeBtn}
          >
            <Text style={styles.scopeBtnText} numberOfLines={1}>현재 도시 내 모든 도서관 검색</Text>
          </Pressable>
        </View>
      </View>

      {busy && <ActivityIndicator accessibilityLabel="도서관 찾는 중" style={styles.availBusy} />}

      {!busy && showPicker && <RegionPicker onChoose={chooseRegion} onLocationAllowed={nearbyAgain} />}

      {!busy && !showPicker && a.status === "empty" && (
        <EmptyAvailability
          scope={a.scope}
          onSearchCity={() => a.searchCity()}
          onSaveForLater={onSaveForLater} // 지금 찾아본 도서관 중에서 골라 저장(N3·N7)
          onPickRegion={() => setPicking(true)}
        />
      )}

      {!busy && !showPicker && city && summary.unknown > 0 && (
        <Text style={styles.summary}>
          {`총 ${summary.total}곳 중 확인 ${summary.checked}곳 · 미확인 ${summary.unknown}곳`}
        </Text>
      )}

      {a.status === "error" && (
        <View style={styles.stateBoxInline}>
          <Text style={styles.stateText}>{a.errorMessage}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={a.retry}
            style={({ pressed }) => [styles.darkBtn, pressed && ACT.secondaryPressed]}
          >
            <Text style={styles.darkBtnText} numberOfLines={1}>다시 시도</Text>
          </Pressable>
        </View>
      )}

      {/* V-3: 빈 결과 안내가 있어도 카드 목록은 그 아래 그대로 */}
      {!busy && !showPicker && a.status !== "error" && a.items.length > 0 && (
        <View testID="availability-list" style={styles.cards}>
          {a.items.map((item) => (
            <LibraryAvailabilityCard
              key={item.library.id}
              item={item}
              today={today}
              onRetry={a.retry}
              selected={selected === item.library.id}
              onToggleSelect={() => setSelected((s) => (s === item.library.id ? null : item.library.id))}
            />
          ))}
          {!!footer && <Text style={styles.caption}>{footer}</Text>}
          <Text style={styles.caption}>{BASIS_NOTE}</Text>
        </View>
      )}

      {/* 시안: 창 맨 아래 가로 전체, 위 줄눈 */}
      {showBuy && (
        <Pressable testID="yes24-buy" accessibilityRole="link" onPress={onOpenPurchase} style={styles.purchase}>
          <Text style={styles.textBtnFlat}>{YES24_BUY}</Text>
        </Pressable>
      )}
    </View>
  );
}

const c = theme.colors;
const ACT = actionColors(theme.colors);
const styles = StyleSheet.create({
  availability: { gap: 6 },
  availBusy: { marginVertical: 16 },
  cards: { gap: 6 },
  scopeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 8 },
  scopeLinks: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, marginLeft: "auto" },
  scopeBtn: { minHeight: 44, justifyContent: "center" },
  scopeBtnText: { fontSize: 12, color: c.text, textDecorationLine: "underline" },
  caption: { fontSize: 12, color: c.textSub, lineHeight: 18 },
  summary: { ...typeScale.gauge },
  purchase: {
    minHeight: 44,
    justifyContent: "center",
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: c.seamHairline,
  },
  textBtnFlat: { fontSize: 14, color: c.text, textDecorationLine: "underline" },
  stateBoxInline: {
    ...cardSurface(theme, { onPanel: true }),
    padding: 18,
    gap: 12,
    alignItems: "flex-start",
  },
  screen: { flex: 1, backgroundColor: c.panelFrosted },
  center: { alignItems: "center", justifyContent: "center" },
  flex: { flex: 1 },
  // Y-6 시안 값: 표지 띠 22/24 여백·아래 줄눈, 본문 좌우 18, 구역 16 여백 + 위 줄눈
  scrollBody: { paddingBottom: 20 },
  hero: {
    alignItems: "center",
    paddingTop: 22,
    paddingBottom: 24,
    paddingHorizontal: 16,
    backgroundColor: c.panelFrosted,
    borderBottomWidth: 1,
    borderBottomColor: c.seamHairline,
  },
  cover: { width: 133, height: 200 },
  content: { paddingHorizontal: 18 },
  meta: { paddingVertical: 16, gap: 6 },
  block: { paddingVertical: 16, borderTopWidth: 1, borderTopColor: c.seamHairline },
  title: { ...typeScale.title, fontSize: 24, lineHeight: 30 },
  sub: { fontSize: 14, color: c.text },
  kicker: { fontSize: 12, color: c.textSub },
  note: {
    marginTop: 12,
    ...cardSurface(theme, { onPanel: true }),
    padding: 14,
    gap: 10,
    alignItems: "flex-start",
  },
  noteText: { fontSize: 15, color: c.text },
  error: { marginTop: 8, fontSize: 14, color: c.loanOut },
  section: { fontSize: 16, fontWeight: "400", color: c.inkSoft, marginBottom: 8 },
  desc: { fontSize: 14, color: c.text, lineHeight: 22 },
  textBtn: { fontSize: 14, color: c.text, textDecorationLine: "underline", marginTop: 8, paddingVertical: 4 },
  facts: {
    borderWidth: 1,
    borderColor: c.seamHairline,
    borderRadius: theme.radii.infoCard,
    backgroundColor: c.panelFrosted,
    overflow: "hidden",
  },
  factsRow: { flexDirection: "row" },
  factCell: { flex: 1, paddingVertical: 10, paddingHorizontal: 12 },
  factCellLeft: { borderLeftWidth: 1, borderLeftColor: c.seamHairline },
  factCellTop: { borderTopWidth: 1, borderTopColor: c.seamHairline },
  factKey: { fontSize: 12, color: c.textSub },
  factValue: { fontSize: 14, color: c.text, marginTop: 2 },
  actions: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    backgroundColor: c.panelLit,
    borderTopWidth: 1,
    borderTopColor: c.seamHairline,
  },
  actionBtn: {
    flex: 1,
    height: 48,
    borderRadius: theme.radii.control,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  actionText: { fontSize: 15, fontWeight: "500" },
  dim: { opacity: 0.5 },
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.shadowSoft },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 72,
    maxHeight: "78%",
    backgroundColor: c.panelLit,
    borderWidth: 1,
    borderColor: c.seamHairline,
    borderTopLeftRadius: theme.radii.infoCard,
    borderTopRightRadius: theme.radii.infoCard,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 14,
    paddingRight: 8,
    paddingTop: 4,
  },
  sheetTitle: { fontSize: 16, fontWeight: "400", color: c.inkSoft },
  closeBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  closeLine: { position: "absolute", width: 18, height: 1.6, backgroundColor: c.inkStrong },
  closeLineA: { transform: [{ rotate: "45deg" }] },
  closeLineB: { transform: [{ rotate: "-45deg" }] },
  sheetPad: { paddingHorizontal: 12, paddingBottom: 6 },
  headerIcon: { padding: 8, minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  icon: { width: 20, gap: 4 },
  iconLine: { height: 2, backgroundColor: c.inkStrong },
  stateBox: {
    margin: 16,
    ...cardSurface(theme, { onPanel: true }),
    padding: 18,
    gap: 12,
    alignItems: "flex-start",
  },
  stateText: { fontSize: 15, color: c.text, lineHeight: 22 },
  darkBtn: {
    ...ACT.secondary,
    borderRadius: theme.radii.control,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  darkBtnText: { fontSize: 14, ...ACT.secondaryText, fontWeight: "500" },
});
