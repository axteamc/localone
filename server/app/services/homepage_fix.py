"""정보나루가 주는 도서관 홈페이지 주소 중 깨졌거나 엉뚱한 곳으로 가는 것을 고친다.

정보나루 동기화(`_store_libraries`)가 `homepage`를 매번 덮어쓰므로, 고침은 저장 직전에 한다.
새로 깨진 주소를 찾으면 아래 표에 한 줄만 더한다. 찾는 법: `scripts/check_homepages.py`.
"""
from __future__ import annotations

from urllib.parse import urlsplit

# 도메인이 이사한 곳: 옛 호스트 → 새 호스트(경로는 그대로, https로)
HOST_MOVED = {
    "lib.gen.go.kr": "lib.jge.go.kr",  # 광주 교육청 도서관 6곳(2026-11 이전, 옛 주소는 404)
}

# 주소 전체를 바꾸는 것(비교는 스킴·끝 슬래시 무시): 루트가 "도서관 고르기" 화면이라 본관 메인으로
EXACT = {
    "gjlib.jeonnam-gwangju.go.kr": "https://gjlib.jeonnam-gwangju.go.kr/main",  # 광주 시립 3곳
}


def fix_homepage(url: str | None) -> str | None:
    if not url:
        return url
    parts = urlsplit(url.strip())
    host = parts.netloc.lower()
    path = parts.path.rstrip("/")
    if host in EXACT and not path:
        return EXACT[host]
    if host in HOST_MOVED:
        tail = f"?{parts.query}" if parts.query else ""
        return f"https://{HOST_MOVED[host]}{path}{tail}"
    return url


# 정보나루가 엉뚱한 시군구 코드로 돌려주는 도서관: (받은 코드, 주소 앞부분) → 바른 코드
# 군위군은 2023년 대구로 넘어왔는데 정보나루는 달성군(22510) 쪽에 군위 도서관을 둔다.
REGION_MOVED = {
    ("22510", "대구광역시 군위군"): "22520",
}


def fix_region_code(dtl_region_code: str, address: str | None) -> str:
    for (code, prefix), fixed in REGION_MOVED.items():
        if dtl_region_code == code and (address or "").startswith(prefix):
            return fixed
    return dtl_region_code
