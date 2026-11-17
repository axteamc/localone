/**
 * /posts/new?libraryId= — LOCAL-1 글쓰기 경로(core APP-0-P2 스텁을 교체).
 * 피드(VISIT-2·LOCAL-2) 전이라 올린 뒤에는 이 화면에서 내 게시물과 ⋯ 메뉴(결정 4)를 보여 준다.
 * TODO(연결): B LOCAL-2 — 올리면 피드 맨 앞으로 돌아가고 "올렸어요", 내리기는 상세의 ⋯ 메뉴로 옮긴다.
 */
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { theme } from "../../src/theme";
import { ComposeScreen, PostMoreMenu } from "../../src/features/local-feed/ComposeScreen";
import { FAKE_BOOKS, Post, PostBook, defaultPostsApi } from "../../src/features/local-feed/api";
import { pickPostImage } from "../../src/features/local-feed/imagePicker";

/** TODO(연결): D LIB-0 fetchLibrary — core LIB-0 C7 고정 도서관 */
const FAKE_LIBRARY_NAMES: Record<number, string> = { 101: "정독도서관", 102: "종로도서관", 103: "남산도서관" };

/** TODO(연결): C 책 찾기 화면 — 고른 책을 돌려받는다. 지금은 가짜 책을 차례로 돌려준다. */
let fakePick = 0;
async function fakePickBook(): Promise<PostBook | null> {
  const book = FAKE_BOOKS[fakePick % FAKE_BOOKS.length] ?? null;
  fakePick += 1;
  return book;
}

export default function NewPostRoute() {
  const params = useLocalSearchParams<{ libraryId?: string; signedIn?: string }>();
  const libraryId = Number(params.libraryId ?? 101);
  const libraryName = FAKE_LIBRARY_NAMES[libraryId] ?? "도서관";
  const auth = useAuth();
  // 시안 확인용: ?signedIn=1이면 로그인한 것으로 본다. TODO(연결): AUTH 로그인 화면 연결 뒤 제거
  const signedIn = auth.status === "signedIn" || params.signedIn === "1";
  const [posted, setPosted] = useState<Post | null>(null);
  const [withdrawn, setWithdrawn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (!posted) {
    return (
      <ComposeScreen
        libraryId={libraryId}
        libraryName={libraryName}
        api={defaultPostsApi}
        signedIn={signedIn}
        pickImage={pickPostImage}
        pickBook={fakePickBook}
        onClose={goBack}
        onLogin={() => router.push("/login")}
        onPosted={(p) => { setPosted(p); setToast("올렸어요"); }}
      />
    );
  }

  return (
    <View style={s.screen} testID="posted">
      <View style={s.head}>
        <Pressable onPress={goBack}><Text style={s.back}>‹</Text></Pressable>
        {!withdrawn ? <PostMoreMenu post={posted} api={defaultPostsApi} onWithdrawn={() => { setWithdrawn(true); setToast("내렸어요"); }} /> : null}
      </View>
      {withdrawn ? (
        <Text style={s.gone}>더 이상 공개되지 않는 게시물이에요.</Text>
      ) : (
        <View style={s.card}>
          <Text style={s.bold}>{posted.overlay_text ?? "(글자 없음)"}</Text>
          <Text style={s.sub}>{posted.library.name} 광장 · {posted.book ? posted.book.title : "책 없음"}</Text>
        </View>
      )}
      {toast ? <View style={s.toast}><Text style={s.toastT}>{toast}</Text></View> : null}
    </View>
  );
}

const c = theme.colors;
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.cream, padding: 16 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  back: { fontSize: 28, fontWeight: "900", color: c.text },
  card: { marginTop: 16, backgroundColor: c.paper, borderRadius: theme.radii.card, padding: 16, gap: 4 },
  bold: { fontWeight: "700", color: c.text, fontSize: 16 },
  sub: { color: c.textSub },
  gone: { marginTop: 40, textAlign: "center", color: c.text },
  toast: { position: "absolute", bottom: 32, alignSelf: "center", backgroundColor: c.inkStrong, borderRadius: theme.radii.control, paddingHorizontal: 16, paddingVertical: 8 },
  toastT: { color: c.paper, fontWeight: "700" },
});
