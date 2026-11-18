// 반납 알림의 플랫폼 분기 — loan-assistant.md LOAN-3 C4가 허용하는 C의 분기 파일 하나.
// `Platform.OS`·`expo-notifications`는 이 파일에서만 쓴다(reminders.ts·LoansSection.tsx·_layout.tsx 금지).
// iOS·Android: expo-notifications 날짜 트리거(Android는 채널 `loan-reminders`). 웹: 아무 일도 하지 않는다(T9).
import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";

/** 웹은 기기 예약 알림이 없다(T9). */
export const NOTIFICATIONS_SUPPORTED = Platform.OS !== "web";

const LOAN_PREFIX = "loan:";
const ANDROID_CHANNEL = "loan-reminders";

let channelReady: Promise<unknown> | null = null;
function ensureChannel(): Promise<unknown> {
  if (Platform.OS !== "android") return Promise.resolve();
  channelReady ??= Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
    name: "반납 알림",
    importance: Notifications.AndroidImportance.DEFAULT,
  }).catch((e: unknown) => {
    channelReady = null; // 실패를 기억하지 않는다(다음 맞추기 때 다시 만든다)
    throw e;
  });
  return channelReady;
}

/**
 * 권한이 있으면 granted. 아직 묻지 않았을 때만 시스템 창을 한 번 띄운다.
 * 이미 거부했으면(다시 물을 수 없으면) 창을 띄우지 않고 denied(T10).
 * Android 13+는 알림 채널이 하나도 없으면 권한 창이 뜨지 않으므로, 권한을 보거나 묻기 전에 채널부터 만든다
 * (Expo SDK 58 expo-notifications 권한 안내). 새 설치에서 첫 허용 → 예약까지 이어지게 하기 위함(T10).
 */
export async function requestNotificationPermission(): Promise<"granted" | "denied" | "unsupported"> {
  if (!NOTIFICATIONS_SUPPORTED) return "unsupported";
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return "granted";
  if (current.status === "denied" || current.canAskAgain === false) return "denied";
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted ? "granted" : "denied";
}

/** 날짜 트리거로 기기에 예약한다. 같은 식별자면 기기가 앞의 것을 바꾼다. */
export async function scheduleLocal(id: string, date09KST: Date, title: string, body: string): Promise<void> {
  if (!NOTIFICATIONS_SUPPORTED) return;
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title, body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: date09KST,
      channelId: ANDROID_CHANNEL,
    },
  });
}

/** 이 앱이 건 대출 알림(`loan:` 식별자)만 지운다. 다른 기능의 알림은 건드리지 않는다. */
export async function cancelAllLoan(): Promise<void> {
  if (!NOTIFICATIONS_SUPPORTED) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(LOAN_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
}

export function openNotificationSettings(): void {
  void Linking.openSettings().catch(() => undefined);
}

/**
 * 알림을 눌렀을 때(앱이 꺼져 있다가 알림으로 열린 경우 포함) onTap을 부른다. 앱이 켜져 있을 때도 배너를 보인다.
 * 돌려준 함수로 구독을 끊는다.
 */
export function subscribeNotificationTap(onTap: () => void): () => void {
  if (!NOTIFICATIONS_SUPPORTED) return () => undefined;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  const isLoan = (r: Notifications.NotificationResponse | null) =>
    !!r && r.notification.request.identifier.startsWith(LOAN_PREFIX);
  let active = true;
  void Notifications.getLastNotificationResponseAsync()
    .then((r) => {
      if (active && isLoan(r)) {
        onTap();
        void Notifications.clearLastNotificationResponseAsync();
      }
    })
    .catch(() => undefined);
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    if (isLoan(r)) onTap();
  });
  return () => {
    active = false;
    sub.remove();
  };
}
