"""정보나루 `operatingTime` 원문 → 요일별 운영시간(VISIT-1 TODAY).

원문은 도서관마다 쓰는 법이 다르다(운영 1,624곳 실측 2026-11-25: 기존 파서는 시간이 적힌 1,283곳 중 429곳만 읽음).
- 구분: `/`·`|`·줄바꿈·쉼표, 실 이름 머리(`자료실:`·`(학습실)`·`[열람실]`)
- 요일: `평일`·`주말`·`주중`·`매일`·`월~금`·`월 ~ 금요일`·`토,일`·`평일 및 주말`·`(평일)`(시간 앞 또는 뒤)
- 시각: `09:00`·`9:00`·`9시`·`오전 9시 ~ 오후 6시`
- 여러 실이 있으면 자료실(책을 빌리는 곳) 기준. 학습·열람실 시간은 대출과 무관해 쓰지 않는다 — 기본값(Claude).
- 모르는 말이 요일 자리에 있으면(`예약자만`) 그 시간은 쓰지 않는다. 계절(동절기·하절기)만 다른 원문도 쓰지 않는다.
"""

from __future__ import annotations

import re
from datetime import date

WEEKDAYS = "월화수목금토일"
ALL_DAYS = frozenset(range(7))

# 실 이름은 낱말 처음부터(문헌정보실을 "정보실"로 자르지 않게)
_ROOM = (
    r"(?<![가-힣])(?:(?!평일|주말|주중|매일)[가-힣]{1,6}\s)?[가-힣]{0,8}?"
    r"(?:자료열람실|자료실|열람실|학습실|정보실|어린이실|간행물실|전시실|기념관|열린공간|휴게실|멀티미디어실|디지털실|독서실)"
)
# 실 이름 머리: "자료실:", "(자료실)", "[열람실]", "2층 종합자료실 운영시간 -", "자료실, 간행물실:"
_ROOM_HEAD = re.compile(
    rf"[\[(]?\s*(?:지하\s*)?(?:\d+\s*층\s*)?(?P<name>{_ROOM}(?:\s*[ⅠⅡ‧·]+)*(?:\s*(?:[,·‧]|및)\s*(?:\d+\s*층\s*)?{_ROOM}(?:\s*[ⅠⅡ‧·]+)*)*)"
    r"\s*[\])]?\s*(?:운영\s*시간)?\s*[:：\-]?"
)
_R = r"\d{1,2}:\d{2}\s*[~∼～–-]\s*\d{1,2}:\d{2}"
# 점심시간(운영시간이 아님): "점심시간 12:00~13:00", "12:00~13:00 (점심시간) 이용불가"
_LUNCH = re.compile(rf"(?:점심|중식)\s*(?:시간)?\s*(?:휴무|미운영)?\s*[:：]?\s*{_R}|{_R}\s*\(\s*(?:점심|중식)[^)\d]*\)[^/,|\d]*")

_RANGE = re.compile(r"(\d{1,2}):(\d{2})\s*[~∼～–-]\s*(\d{1,2}):(\d{2})")
_NOTE = re.compile(r"\((?!\s*(?:평일|주말|주중|[월화수목금토일]\s*[~,·요]))(?:[^()]*?(?:점심|중식|휴게|동절기|하절기|공휴일|휴실|운영\s*기준|까지|자세한|단,)[^()]*)\)")
_SEASON = re.compile(r"동절기|하절기|\d{1,2}\s*월\s*~\s*\d{1,2}\s*월")


def _drop_lunch(m: re.Match[str]) -> str:
    """점심 시간대(11~14시 시작, 2시간 이하)만 지운다. "09:00~17:00 (점심시간 휴무)"의 운영시간은 남긴다."""
    h1, m1, h2, m2 = (int(x) for x in re.findall(r"\d+", _RANGE.search(m[0]).group(0)))
    lunch = 11 <= h1 <= 14 and 0 < (h2 * 60 + m2) - (h1 * 60 + m1) <= 120
    return " " if lunch else m[0].split("(")[0]


def _normalize(raw: str) -> str:
    t = raw.replace("&middot;", "·").replace("‧", "·").replace("∼", "~").replace("～", "~")
    t = _LUNCH.sub(_drop_lunch, t)
    t = _NOTE.sub(" ", t)
    t = re.sub(r"\(도서관 자세한.*$", "", t)

    def ampm(m: re.Match[str]) -> str:
        hour = int(m[2])
        if m[1] == "오후" and hour < 12:
            hour += 12
        return f"{hour}:{m[3] or '00'}"

    t = re.sub(r"(오전|오후)\s*(\d{1,2})(?:\s*시|:(\d{2}))", ampm, t)
    t = re.sub(r"(\d{1,2})\s*시(?!간)", r"\1:00", t)
    t = re.sub(r"([월화수목금토일])(?:요일)?\s*-\s*([월화수목금토일])", r"\1~\2", t)  # "월요일-목요일"
    # "평일 9~18시" 같은 앞 시각의 시 생략 → "9:00~18:00"
    t = re.sub(r"(?<![\d:])(\d{1,2})\s*~\s*(\d{1,2}):00", r"\1:00~\2:00", t)
    return t


def _days(spec: str) -> frozenset[int] | None:
    """요일 자리의 말 → 요일 집합. 비면 None 대신 빈 집합(호출부가 판단), 모르는 말이면 None."""
    # "평일(화~금)"·"주말(토,일)"은 괄호 안 요일이 정확한 값
    s = re.sub(r"(평일|주말|주중)\s*\(([^()]*[월화수목금토일][^()]*)\)", r"\2", spec)
    s = re.sub(r"[()\[\]:：\-]", " ", s)
    s = s.replace("요일", "").replace("및", ",").replace("·", ",").replace(".", ",").replace("주중", "평일")
    s = re.sub(r"매주|운영|법정\s*공휴일|공휴일", " ", s)  # 요일과 함께 쓰는 덧말
    s = re.sub(r"\s*~\s*", "~", s).strip(" ,")
    if not s:
        return frozenset()
    out: set[int] = set()
    for part in re.split(r"[,\s]+", s):
        if part in {"매일", "연중", "평일주말"}:
            out |= ALL_DAYS
        elif part == "평일":
            out |= set(range(5))
        elif part == "주말":
            out |= {5, 6}
        elif re.fullmatch(f"[{WEEKDAYS}]~[{WEEKDAYS}]", part):
            out |= set(range(WEEKDAYS.index(part[0]), WEEKDAYS.index(part[2]) + 1))
        elif re.fullmatch(f"[{WEEKDAYS}]+", part):
            out |= {WEEKDAYS.index(ch) for ch in part}
        else:
            return None
    return frozenset(out)


def _segments(text: str) -> list[tuple[str | None, str]]:
    """(실 이름 또는 None, 그 실의 원문) 목록"""
    out: list[tuple[str | None, str]] = []
    for group in re.split(r"\s*[/|\n]\s*", text):
        heads = list(_ROOM_HEAD.finditer(group))
        if not heads:
            out.append((None, group))
            continue
        prefix = group[: heads[0].start()]
        if _days(prefix):  # "(평일) 자료실 …, 열람실 … (주말) 자료실 …" — 요일이 먼저면 실로 나누지 않는다
            out.append((None, group))
            continue
        if _RANGE.search(prefix):
            out.append((None, prefix))
        for i, h in enumerate(heads):
            end = heads[i + 1].start() if i + 1 < len(heads) else len(group)
            out.append((h["name"], group[h.end():end]))
    return [(name, body) for name, body in out if _RANGE.search(body)]


def _rank(name: str | None) -> int:
    """0 책을 빌리는 자료실 · 1 실 이름 없음 · 2 어린이·디지털 등 다른 실 · 3 학습·열람실(대출과 무관)"""
    if name is None:
        return 1
    return min(_rank_one(part) for part in re.split(r"\s*(?:[,·‧]|및)\s*", name) if part)


def _rank_one(name: str) -> int:
    if re.search(r"학습|열람실|휴게|독서|열린|전시|기념", name) and "자료열람실" not in name:
        return 3
    if re.search(r"자료실|자료열람실|문헌", name) and not re.search(r"어린이|유아|아동|디지털|멀티|영어", name):
        return 0
    return 2


def _read(body: str) -> dict[int, str] | None:
    """한 실의 원문 → 요일별 시간. 모르는 요일 말이 있으면 그 시간만 버린다."""
    ranges = list(_RANGE.finditer(body))
    result: dict[int, str] = {}
    consumed_to = 0
    # 요일이 먼저 오고 실이 섞인 원문("(평일) 열람실 … 자료실 … (주말) …")은 실마다 시간이 있다 → 가장 앞선 실만
    labels = [_rank(h["name"]) for h in _ROOM_HEAD.finditer(body)]
    top = min(labels) if labels else None
    carried: frozenset[int] | None = None
    unspecified: list[str] = []
    for i, m in enumerate(ranges):
        h1, m1, h2, m2 = (int(x) for x in m.groups())
        raw_lead = body[consumed_to:m.start()]
        heads = list(_ROOM_HEAD.finditer(raw_lead))
        lead = _ROOM_HEAD.sub(" ", raw_lead)
        next_start = ranges[i + 1].start() if i + 1 < len(ranges) else len(body)
        tail_m = re.match(r"\s*\(([^()]*)\)", body[m.end():next_start])
        days = _days(lead)
        if days is None and "," in lead:  # "09:00~18:00, 매주 수요일 …" — 앞 조각 말고 이 시간의 요일만
            days = _days(lead.split(",")[-1])
        consumed_to = m.end()
        if days is not None and not days and heads and carried:
            days = carried  # "(평일) 자료실 … 열람실 …"의 두 번째 실도 같은 요일
        elif (days is None or not days) and tail_m and _days(tail_m[1]):
            days = _days(tail_m[1])  # "9:00~18:00 (평일)"처럼 요일이 뒤
            consumed_to = m.end() + tail_m.end()
        if days is None:
            continue
        if days:
            carried = days
        if heads and top is not None and _rank(heads[-1]["name"]) != top:
            continue
        if h1 > 23 or h2 > 24 or m1 > 59 or m2 > 59:
            continue
        hours = f"{h1:02d}:{m1:02d}~{h2:02d}:{m2:02d}"
        if not days:
            unspecified.append(hours)
            continue
        for d in days:
            result.setdefault(d, hours)
    # 요일 없는 시간이 하나뿐이면 나머지 요일 전부("09:00~18:00", "09:00~20:00(토,일 09:00~17:00)").
    # 여럿이면 어느 날인지 모른다. 휴관일은 closed_text가 따로 정한다.
    if len(unspecified) == 1:
        for d in ALL_DAYS:
            result.setdefault(d, unspecified[0])
    return result or None


def week_hours(operating_time_text: str | None) -> dict[int, str]:
    if not operating_time_text or _SEASON.search(re.sub(r"\([^()]*\)", "", operating_time_text)):
        return {}
    text = _normalize(operating_time_text)
    result: dict[int, str] = {}
    best: int | None = None
    # 가장 앞선 순위(자료실 → 이름 없음 → 어린이 → 학습·열람)에서 읽힌 묶음들만 합친다
    # ("평일 … / 주말 …"처럼 나뉜 같은 순위는 모두, 다른 순위로 빈 요일을 채우지는 않는다)
    for name, body in sorted(_segments(text), key=lambda seg: _rank(seg[0])):
        if best is not None and _rank(name) != best:
            break
        found = _read(body)
        if found:
            best = _rank(name)
            for day, hours in found.items():
                result.setdefault(day, hours)
    return result


def today_hours(operating_time_text: str | None, today: date) -> str | None:
    return week_hours(operating_time_text).get(today.weekday())
