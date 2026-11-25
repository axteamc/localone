// 알림 설정 두 줄(2026-11-25 C-90, 시안 실기기개선_P2-P4 #el-settings 후보 A의 "알림" 묶음).
// 설정 화면과 알림함 오른쪽 위 설정 아이콘 작은 창이 같은 부품을 쓴다.
// - 반납 알림: 기기 설정(기기에 예약하는 알림). 끄면 바로 이 앱의 대출 알림을 지운다. 웹은 기기 알림이 없어 줄을 흐리게.
// - 모임 안내: 서버 설정 #71(끄면 새 모임 안내가 알림함에 쌓이지 않는다). 실패하면 스위치를 되돌리고 한 줄 안내.
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { clearLoanReminders } from "../loan-assistant/reminders";
import { getLoanRemindersEnabled, setLoanRemindersEnabled } from "../loan-assistant/reminderPref";
import { NOTIFICATIONS_SUPPORTED } from "../loan-assistant/notifications.platform";
import { fetchMySettings, updateMySettings } from "../my-collection/api";
import { theme } from "../../theme";

export const NOTIFY_TEXT = {
  loan: "반납 알림",
  loanSub: "반납일 3일 전·하루 전·당일 아침",
  loanWeb: "휴대폰 앱에서만 받을 수 있어요",
  club: "모임 안내",
  clubSub: "참가한 모임의 일정 확정·변경·취소",
  failed: "바꾸지 못했어요. 다시 해 주세요",
} as const;

export function NotificationSettings() {
  const [loanOn, setLoanOn] = useState<boolean | null>(null);
  const [clubOn, setClubOn] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const saving = useRef(false);

  useEffect(() => {
    let alive = true;
    void getLoanRemindersEnabled().then((v) => alive && setLoanOn(v));
    void fetchMySettings()
      .then((s) => alive && setClubOn(s.club_notices))
      .catch(() => alive && setClubOn(null));
    return () => {
      alive = false;
    };
  }, []);

  const toggleLoan = async (on: boolean) => {
    setLoanOn(on);
    await setLoanRemindersEnabled(on);
    if (!on) await clearLoanReminders();
  };

  const toggleClub = async (on: boolean) => {
    if (saving.current) return;
    saving.current = true;
    const before = clubOn;
    setClubOn(on);
    setFailed(false);
    try {
      const s = await updateMySettings({ club_notices: on });
      setClubOn(s.club_notices);
    } catch {
      setClubOn(before);
      setFailed(true);
    } finally {
      saving.current = false;
    }
  };

  return (
    <View testID="notification-settings">
      <Row
        title={NOTIFY_TEXT.loan}
        sub={NOTIFICATIONS_SUPPORTED ? NOTIFY_TEXT.loanSub : NOTIFY_TEXT.loanWeb}
        value={loanOn === true}
        disabled={loanOn === null || !NOTIFICATIONS_SUPPORTED}
        onChange={(v) => void toggleLoan(v)}
        testID="switch-loan-reminders"
      />
      <Row
        title={NOTIFY_TEXT.club}
        sub={NOTIFY_TEXT.clubSub}
        value={clubOn === true}
        disabled={clubOn === null}
        onChange={(v) => void toggleClub(v)}
        testID="switch-club-notices"
        last
      />
      {failed && <Text style={styles.failed}>{NOTIFY_TEXT.failed}</Text>}
    </View>
  );
}

function Row({ title, sub, value, disabled, onChange, testID, last = false }: {
  title: string;
  sub: string;
  value: boolean;
  disabled: boolean;
  onChange(v: boolean): void;
  testID: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && styles.rowLine]}>
      <View style={styles.texts}>
        <Text style={[styles.title, disabled && styles.dim]}>{title}</Text>
        <Text style={styles.sub}>{sub}</Text>
      </View>
      <Switch
        testID={testID}
        accessibilityLabel={title}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: c.surface3, true: c.inkStrong }}
        thumbColor={c.paper}
        // 웹(react-native-web)은 켜진 손잡이 색을 따로 받는다(없으면 기본 청록)
        {...({ activeThumbColor: c.paper } as object)}
      />
    </View>
  );
}

const c = theme.colors;
const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 8 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: c.seamHairline },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 15, color: c.text },
  sub: { fontSize: 12, color: c.textSub },
  dim: { color: c.textSub },
  failed: { fontSize: 13, color: c.text, paddingHorizontal: 14, paddingBottom: 8 },
});
