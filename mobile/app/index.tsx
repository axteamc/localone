import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

// 개발 스모크 화면: GET /api/v1/ready 결과를 보여 준다.
// 주소는 EXPO_PUBLIC_API_URL로 바꾼다(Android 에뮬레이터는 http://10.0.2.2:8000).
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";
const TIMEOUT_MS = 5000;

type State =
  | { kind: "loading" }
  | { kind: "ready"; checkedAt: string }
  | { kind: "error"; message: string };

async function fetchReady(): Promise<State> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}/api/v1/ready`, { signal: controller.signal });
    const body: unknown = await res.json();
    if (res.ok && typeof body === "object" && body !== null && "checked_at" in body) {
      return { kind: "ready", checkedAt: String(body.checked_at) };
    }
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: { message?: unknown } }).error.message ?? "")
        : "";
    return { kind: "error", message: message || "서버가 준비되지 않았어요." };
  } catch {
    return { kind: "error", message: "서버에 연결하지 못했어요." };
  } finally {
    clearTimeout(timer);
  }
}

export default function Index() {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    setState(await fetchReady());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.container}>
      {state.kind === "loading" && <ActivityIndicator accessibilityLabel="확인 중" />}
      {state.kind === "ready" && (
        <>
          <Text style={styles.title}>서버 상태: 준비됨</Text>
          <Text style={styles.sub}>확인 시각 {state.checkedAt}</Text>
        </>
      )}
      {state.kind === "error" && (
        <>
          <Text style={styles.title}>{state.message}</Text>
          <Pressable accessibilityRole="button" onPress={load} style={styles.button}>
            <Text style={styles.buttonText}>다시 시도</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 18, fontWeight: "600", textAlign: "center" },
  sub: { fontSize: 14, color: "#666" },
  button: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, backgroundColor: "#222" },
  buttonText: { color: "#fff", fontSize: 16 },
});
