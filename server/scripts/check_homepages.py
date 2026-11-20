"""저장된 도서관 homepage 전수 점검(읽기 전용). 사용: DATABASE_URL=... python scripts/check_homepages.py [--region 29] [--out 결과.tsv]

- 같은 주소는 한 번만 열고(전국 ~1,100곳이어도 주소 수만큼), 호스트마다 robots.txt를 먼저 읽는다.
- robots.txt가 루트(/)를 막거나 방화벽이 막으면 **열지 않고** `사람확인`으로 표시한다(HTML 확인표 출력).
- 요청 사이 2초 간격, 식별 가능한 User-Agent. DB는 읽기만 한다.
판정: OK / 이사(최종 호스트가 다름) / 깨짐(4xx·5xx·접속 실패) / 인트로(제목에 '선택'·'고르'·'인트로') / 사람확인
"""
from __future__ import annotations

import argparse, html, os, re, sys, time, urllib.error, urllib.request, urllib.robotparser
from pathlib import Path
from urllib.parse import urlsplit

from sqlalchemy import create_engine, text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.homepage_fix import fix_homepage  # noqa: E402

UA = "libmarks-linkcheck/1.0 (student project; homepage link health check)"
DELAY = 2.0


def fetch(url: str, timeout: int = 20) -> tuple[int, str, str]:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read(20000).decode(r.headers.get_content_charset() or "utf-8", "replace")
            return r.status, r.geturl(), body
    except urllib.error.HTTPError as e:
        return e.code, url, ""
    except Exception as e:  # 접속 실패·시간 초과
        return 0, url, str(e)[:80]


def robots_allows(host_scheme: str, host: str, path: str, cache: dict) -> bool | None:
    """True 허용 / False 금지 / None 읽을 수 없음(방화벽 등)."""
    if host not in cache:
        status, _, body = fetch(f"{host_scheme}://{host}/robots.txt")
        time.sleep(DELAY)
        if status == 404:
            cache[host] = "ALLOW"
        elif status != 200 or "<html" in body[:300].lower():
            cache[host] = None
        else:
            rp = urllib.robotparser.RobotFileParser()
            rp.parse(body.splitlines())
            cache[host] = rp
    rp = cache[host]
    if rp == "ALLOW":
        return True
    if rp is None:
        return None
    return rp.can_fetch(UA, f"{host_scheme}://{host}{path or '/'}")


def check(url: str, cache: dict) -> tuple[str, str]:
    p = urlsplit(url)
    ok = robots_allows(p.scheme, p.netloc, p.path, cache)
    if ok is not True:
        return "사람확인", "robots 금지" if ok is False else "robots 못 읽음(방화벽?)"
    status, final, body = fetch(url)
    time.sleep(DELAY)
    if status == 0 or status >= 400:
        return "깨짐", f"{status} {body}".strip()
    title = (re.search(r"<title[^>]*>(.*?)</title>", body, re.I | re.S) or [None, ""])[1].strip()
    if urlsplit(final).netloc.lower() != p.netloc.lower():
        return "이사", f"→ {final}"
    if re.search(r"선택|고르|인트로|intro", title, re.I):
        return "인트로", title[:40]
    return "OK", title[:40]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", help="region_code 앞자리(예: 29=광주). 생략하면 전체")
    ap.add_argument("--out", default="homepage_check.tsv")
    a = ap.parse_args()
    eng = create_engine(os.environ["DATABASE_URL"])
    q = "SELECT name, homepage FROM libraries WHERE homepage IS NOT NULL AND homepage <> ''"
    params = {}
    if a.region:
        q += " AND region_code = :r"
        params["r"] = a.region
    with eng.connect() as c:
        libs = c.execute(text(q + " ORDER BY name"), params).all()
    by_url: dict[str, list[str]] = {}
    for name, hp in libs:
        key = re.sub(r"^http://", "https://", fix_homepage(hp) or hp).rstrip("/")  # http/https·끝 슬래시 중복 합침
        by_url.setdefault(key, []).append(name)
    print(f"도서관 {len(libs)}곳 · 고유 주소 {len(by_url)}개", file=sys.stderr)
    cache: dict = {}
    rows = []
    for url, names in by_url.items():
        verdict, note = check(url, cache)
        rows.append((verdict, url, note, names))
        print(verdict, url, note, file=sys.stderr)
    order = {"깨짐": 0, "이사": 1, "인트로": 2, "사람확인": 3, "OK": 4}
    rows.sort(key=lambda r: order[r[0]])
    Path(a.out).write_text("\n".join("\t".join([v, u, n, ",".join(ns)]) for v, u, n, ns in rows), encoding="utf-8")
    human = [r for r in rows if r[0] == "사람확인"]
    if human:
        li = "".join(f'<li><a href="{html.escape(u)}" target="_blank" rel="noopener">{html.escape(u)}</a> — {html.escape(", ".join(ns[:3]))} ({html.escape(n)})</li>' for _, u, n, ns in human)
        Path(a.out).with_suffix(".html").write_text(f'<!doctype html><meta charset="utf-8"><title>사람 확인 목록</title><h1>눌러서 정상 화면인지 확인</h1><ol>{li}</ol>', encoding="utf-8")
    print(f"저장: {a.out} (사람확인 {len(human)}개는 .html)", file=sys.stderr)


if __name__ == "__main__":
    main()
