// 모임 날짜·시작·끝 칸과 작은 팝오버(contracts/book-club.md K1-O2a, 2026-11-25 C-92, 시안 오늘의서가_UI개선 #el-datetime 후보 A).
// 글자로 직접 쓰는 칸("YYYY-MM-DD"·"HH:MM")은 그대로 두고, 칸 오른쪽 끝 선형 아이콘을 누르면 세 칸 바로 아래에
// 작은 달력 또는 "시 | 분" 스크롤 휠(5분 단위)이 열린다. 새 라이브러리 없이 View·ScrollView로 그린다(세 플랫폼 같은 코드).
// 만들기(ClubEditor)와 다음 모임 창(NextClubSheet)이 같이 쓴다.
import React, { useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { theme } from "../../theme";
import { CalendarIcon, ClockIcon } from "../../theme/Icons";

const C = theme.colors;

export const WHEEL_ROW = 28;
export const WHEEL_HEIGHT = 112;
const WHEEL_PAD = (WHEEL_HEIGHT - WHEEL_ROW) / 2;
export const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
export const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const KST_MS = 9 * 60 * 60 * 1000;

export const WHEN_TEXT = {
  openCalendar: "달력 열기",
  pickStart: "시작 시각 고르기",
  pickEnd: "끝나는 시각 고르기",
  prevMonth: "이전 달",
  nextMonth: "다음 달",
  month: (y: number, m: number) => `${y}년 ${m}월`,
  wheelTitle: "시간 선택 (시 · 분 스크롤)",
  typeToo: "직접 입력도 가능",
  ok: "확인",
  close: "닫기",
} as const;

type Field = "date" | "start" | "end";

/** 서울 오늘 [년, 월(1~12), 일] */
export function kstToday(now: number = Date.now()): [number, number, number] {
  const d = new Date(now + KST_MS);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}

/** "YYYY-MM-DD"가 실제 날짜면 [년, 월, 일], 아니면 null */
export function parseDay(value: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? [y, mo, d] : null;
}

/** "HH:MM" → [시 줄 번호, 분 줄 번호(가까운 5분 아래)]. 틀리면 null */
export function parseClock(value: string): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return [h, Math.floor(mi / 5)];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 그 달의 칸: 앞 빈칸(null) + 1..말일 */
export function monthCells(y: number, m: number): (number | null)[] {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [...Array.from({ length: first }, () => null), ...Array.from({ length: last }, (_, i) => i + 1)];
}

export type WhenFieldsProps = {
  date: string;
  start: string;
  end: string;
  onDate(v: string): void;
  onStart(v: string): void;
  onEnd(v: string): void;
  placeholders: { date: string; start: string; end: string };
  /** 기존 칸 testID 앞부분(예 "club-editor" → club-editor-date·…-start·…-end) */
  testIDPrefix: string;
  /** 각 칸의 겉모양(테두리·곡률·바탕). 글자는 칸 안 TextInput이 받는다 */
  boxStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function WhenFields(props: WhenFieldsProps) {
  const [open, setOpen] = useState<Field | null>(null);
  const toggle = (f: Field) => setOpen((cur) => (cur === f ? null : f));
  const box = (field: Field, flex: number, value: string, onChange: (v: string) => void, label: string, iconLabel: string) => (
    <View style={[styles.box, props.boxStyle, { flex }, open === field && styles.boxOpen]}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={props.placeholders[field]}
        placeholderTextColor={C.inkMuted}
        style={[styles.text, props.textStyle]}
        accessibilityLabel={label}
        testID={`${props.testIDPrefix}-${field}`}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={iconLabel}
        accessibilityState={{ expanded: open === field }}
        onPress={() => toggle(field)}
        hitSlop={6}
        style={styles.icon}
        testID={`${props.testIDPrefix}-${field}-pick`}
      >
        {field === "date" ? (
          <CalendarIcon color={open === field ? C.inkStrong : C.inkMuted} />
        ) : (
          <ClockIcon color={open === field ? C.inkStrong : C.inkMuted} />
        )}
      </Pressable>
    </View>
  );
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {box("date", 1.4, props.date, props.onDate, "날짜", WHEN_TEXT.openCalendar)}
        {box("start", 1, props.start, props.onStart, "시작 시각", WHEN_TEXT.pickStart)}
        {box("end", 1, props.end, props.onEnd, "끝나는 시각", WHEN_TEXT.pickEnd)}
      </View>
      {open === "date" ? (
        <CalendarPopover
          value={props.date}
          testID={`${props.testIDPrefix}-calendar`}
          onPick={(v) => {
            props.onDate(v);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      ) : open ? (
        <TimeWheelPopover
          key={open}
          value={open === "start" ? props.start : props.end}
          testID={`${props.testIDPrefix}-wheel`}
          onPick={(v) => {
            (open === "start" ? props.onStart : props.onEnd)(v);
            setOpen(null);
          }}
        />
      ) : null}
    </View>
  );
}

function CalendarPopover({ value, onPick, onClose, testID }: { value: string; onPick(v: string): void; onClose(): void; testID: string }) {
  const picked = parseDay(value);
  const [ty, tm, td] = kstToday();
  const [ym, setYm] = useState<[number, number]>(picked ? [picked[0], picked[1]] : [ty, tm]);
  const [y, m] = ym;
  const move = (delta: number) => setYm(([yy, mm]) => {
    const t = mm - 1 + delta;
    return [yy + Math.floor(t / 12), ((t % 12) + 12) % 12 + 1];
  });
  return (
    <View style={styles.pop} testID={testID}>
      <View style={styles.popHead}>
        <Pressable accessibilityRole="button" accessibilityLabel={WHEN_TEXT.prevMonth} onPress={() => move(-1)} style={styles.monthBtn}>
          <Text style={styles.monthArrow}>‹</Text>
        </Pressable>
        <Text style={styles.popTitle} testID={`${testID}-month`}>{WHEN_TEXT.month(y, m)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={WHEN_TEXT.nextMonth} onPress={() => move(1)} style={styles.monthBtn}>
          <Text style={styles.monthArrow}>›</Text>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {DOW.map((d) => (
          <Text key={d} style={styles.dow}>{d}</Text>
        ))}
        {monthCells(y, m).map((d, i) => {
          if (d === null) return <View key={`b${i}`} style={styles.cell} />;
          const sel = picked !== null && picked[0] === y && picked[1] === m && picked[2] === d;
          const today = ty === y && tm === m && td === d;
          return (
            <Pressable
              key={d}
              accessibilityRole="button"
              accessibilityLabel={`${m}월 ${d}일`}
              accessibilityState={{ selected: sel }}
              onPress={() => onPick(`${y}-${pad(m)}-${pad(d)}`)}
              style={styles.cell}
              testID={`${testID}-day-${d}`}
            >
              <View style={[styles.day, today && styles.dayToday, sel && styles.daySel]}>
                <Text style={[styles.dayText, sel && styles.dayTextSel]}>{d}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.popFoot}>
        <Text style={styles.foot}>{WHEN_TEXT.typeToo}</Text>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.footBtn}>
          <Text style={styles.footBtnText}>{WHEN_TEXT.close}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Wheel({ items, index, onIndex, label, testID }: { items: string[]; index: number; onIndex(i: number): void; label: string; testID: string }) {
  const ref = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    // 처음 열 때 고른 값을 가운데로(애니메이션 없이)
    const t = setTimeout(() => ref.current?.scrollTo?.({ y: index * WHEEL_ROW, animated: false }), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.y / WHEEL_ROW);
    onIndex(Math.max(0, Math.min(items.length - 1, i)));
  };
  return (
    <ScrollView
      ref={ref}
      style={styles.wheel}
      contentContainerStyle={{ paddingVertical: WHEEL_PAD }}
      showsVerticalScrollIndicator={false}
      snapToInterval={WHEEL_ROW}
      decelerationRate="fast"
      onMomentumScrollEnd={settle}
      onScrollEndDrag={settle}
      scrollEventThrottle={16}
      accessibilityLabel={label}
      testID={testID}
      nestedScrollEnabled
    >
      {items.map((v, i) => (
        <Pressable
          key={v}
          accessibilityRole="button"
          accessibilityState={{ selected: i === index }}
          onPress={() => {
            onIndex(i);
            ref.current?.scrollTo?.({ y: i * WHEEL_ROW, animated: true });
          }}
          style={styles.wheelRow}
          testID={`${testID}-${v}`}
        >
          <Text style={[styles.wheelText, i === index && styles.wheelTextSel]}>{v}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function TimeWheelPopover({ value, onPick, testID }: { value: string; onPick(v: string): void; testID: string }) {
  const init = parseClock(value) ?? [14, 0];
  const [h, setH] = useState(init[0]);
  const [mi, setMi] = useState(init[1]);
  return (
    <View style={styles.pop} testID={testID}>
      <Text style={[styles.popTitle, styles.wheelTitle]}>{WHEN_TEXT.wheelTitle}</Text>
      <View style={styles.wheelBox}>
        <View style={styles.wheelBand} pointerEvents="none" />
        <Wheel items={HOURS} index={h} onIndex={setH} label="시 선택" testID={`${testID}-h`} />
        <Text style={styles.wheelSep}>:</Text>
        <Wheel items={MINUTES} index={mi} onIndex={setMi} label="분 선택" testID={`${testID}-m`} />
      </View>
      <View style={styles.popFoot}>
        <Text style={styles.foot}>{WHEN_TEXT.typeToo}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => onPick(`${HOURS[h]}:${MINUTES[mi]}`)}
          style={styles.footBtn}
          testID={`${testID}-ok`}
        >
          <Text style={styles.footBtnText}>{WHEN_TEXT.ok}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: "row", gap: 6, alignItems: "center" },
  box: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.seamHairline,
    borderRadius: theme.radii.infoCard,
    backgroundColor: C.paper,
    paddingLeft: 10,
  },
  boxOpen: { borderColor: C.inkStrong },
  text: { flex: 1, minWidth: 0, fontSize: 15, color: C.text, paddingVertical: 10 },
  icon: { width: 36, minHeight: 42, alignItems: "center", justifyContent: "center" },
  pop: {
    backgroundColor: C.panelLit,
    borderWidth: 1,
    borderColor: C.seamHairline,
    borderRadius: theme.radii.infoCard,
    padding: 10,
    gap: 6,
    boxShadow: `0 4px 12px 0 ${C.shadowSoft}`,
  },
  popHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  popTitle: { fontSize: 13, fontWeight: "500", color: C.text },
  monthBtn: { width: 36, height: 32, alignItems: "center", justifyContent: "center" },
  monthArrow: { fontSize: 18, color: C.inkStrong },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dow: { width: `${100 / 7}%`, textAlign: "center", fontSize: 11, color: C.inkMuted, paddingVertical: 4 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, minHeight: 36, alignItems: "center", justifyContent: "center" },
  day: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  dayToday: { borderWidth: 1, borderColor: C.surface3 },
  daySel: { backgroundColor: C.inkStrong, borderColor: C.inkStrong },
  dayText: { fontSize: 13, color: C.text },
  dayTextSel: { color: C.paper, fontWeight: "700" },
  popFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  foot: { fontSize: 11, color: C.inkMuted },
  footBtn: { minHeight: 36, paddingHorizontal: 12, justifyContent: "center" },
  footBtnText: { fontSize: 14, fontWeight: "500", color: C.inkStrong },
  wheelTitle: { color: C.textSub, fontWeight: "400", fontSize: 12 },
  wheelBox: {
    height: WHEEL_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    backgroundColor: C.cream,
    borderRadius: 9,
  },
  wheelBand: {
    position: "absolute",
    left: 6,
    right: 6,
    top: WHEEL_PAD,
    height: WHEEL_ROW,
    borderRadius: 8,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.surface3,
  },
  wheel: { flex: 1, height: WHEEL_HEIGHT },
  wheelRow: { height: WHEEL_ROW, alignItems: "center", justifyContent: "center" },
  wheelText: { fontSize: 12, color: C.textSub },
  wheelTextSel: { fontSize: 13, fontWeight: "700", color: C.inkStrong },
  wheelSep: { fontSize: 13, fontWeight: "700", color: C.inkStrong },
});
