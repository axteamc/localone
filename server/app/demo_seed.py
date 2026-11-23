"""C-78 광주 시연 콘텐츠. 격리 DB에서만 수동 실행한다."""

import argparse
import json
import os
import re
from collections import Counter
from dataclasses import dataclass
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import bindparam, create_engine, text
from sqlalchemy.engine import Connection, Engine, Row, make_url
from sqlalchemy.exc import SQLAlchemyError

from app.auth import lock_active_user
from app.common import ApiError
from app.policy import NEARBY_DEFAULT_RADIUS_KM
from app.routers.clubs import INSERT_CLUB, ClubCreate, clean_fields
from app.routers.guestbook import GUESTBOOK_BODY_MAX, INSERT_ENTRY
from app.routers.posts import (
    INSERT_POST_ON_CONFLICT_DO_NOTHING_RETURNING,
    PostCreate,
    validate_kind_fields,
)
from app.services.provider_engine import isbn13_is_valid, libraries_nearby
from app.settings import LOCAL_HOSTS

GWANGJU = "24"
DISTRICTS = {"24010": "동구", "24030": "남구", "24040": "북구"}
# 구 코드와 주소의 행정구를 함께 확인한다. 접두어는 확인한 카탈로그 이름 변형만 허용한다.
REQUIRED = (
    ("24010", "계림꿈나무도서관", r"(?:광주(?:광역시)?동구)?계림꿈나무도서관"),
    ("24010", "광주 중앙도서관", r"(?:(?:전남광주통합특별시|광주광역시)교육청|광주)?중앙도서관"),
    ("24010", "광주 산수도서관", r"(?:광주(?:광역)?시립|광주)?산수도서관"),
    ("24030", "남구 문화정보도서관", r"(?:광주(?:광역시)?)?남구문화정보도서관|문화정보도서관"),
    ("24030", "광주 사직도서관", r"(?:광주(?:광역)?시립|광주)?사직도서관"),
    ("24030", "금호평생교육관", r"(?:(?:전남광주통합특별시|광주광역시)교육청)?금호평생교육(?:관|원)"),
    ("24040", "광주 중흥도서관", r"(?:(?:전남광주통합특별시|광주(?:광역시)?)?북구|광주)?중흥도서관"),
    ("24040", "광주 무등도서관", r"(?:광주(?:광역)?시립|광주)?무등도서관"),
)
BOOK_POSTS = (
    ("9788936433598", "coral", "익숙한 일상이 낯설어지는 소설을 찾는 분에게 권해요."),
    ("9788936434120", "atlanticBlue", "광주의 이야기를 읽고 오래 남은 문장을 함께 이야기해요."),
    ("9788954682152", "lemonZest", "읽고 나서도 기억과 우정에 관해 생각하게 되는 책이에요."),
    ("9791161571188", "vanillaCanvas", "일상에서 건네는 작은 친절의 이야기가 읽고 싶을 때 추천해요."),
    ("9788936434267", "indigoDrift", "서로 다른 마음을 이해하는 방법을 생각해 볼 수 있었어요."),
)
GUESTBOOK_BODY = "[시연] 오늘도 도서관에서 좋은 책을 만났어요."
BUNDLE_SIZE = {"post": len(BOOK_POSTS), "guestbook": 1, "club": 1}
SELECT_BOOKS = text("SELECT id, isbn13, title FROM books WHERE isbn13 IN :isbns").bindparams(
    bindparam("isbns", expanding=True)
)


@dataclass(frozen=True)
class SeedPlan:
    libraries: tuple[Row, ...]
    required_codes: dict[str, str]
    nearby_codes: tuple[str, ...]
    books: dict[str, Row]


def build_plan(conn: Connection, author: UUID) -> SeedPlan:
    rows = conn.execute(
        text("SELECT id, provider_lib_code, name, address, latitude, longitude, dtl_region_code "
             "FROM libraries WHERE region_code = :region ORDER BY provider_lib_code"),
        {"region": GWANGJU},
    ).all()
    required = {}
    targets = {row.provider_lib_code: row for row in rows if row.dtl_region_code in DISTRICTS}
    for district, label, pattern in REQUIRED:
        candidates = [
            row for row in rows
            if row.dtl_region_code == district and re.fullmatch(pattern, "".join(row.name.split()))
        ]
        matches = [row for row in candidates if DISTRICTS[district] in (row.address or "").split()]
        if len(matches) != 1:
            codes = ", ".join(row.provider_lib_code for row in candidates) or "없음"
            raise ValueError(f"필수 관 {label} 식별 실패. 후보 코드: {codes}")
        required[label] = matches[0]

    mudeung = required["광주 무등도서관"]
    if not (mudeung.latitude is not None and -90 <= mudeung.latitude <= 90
            and mudeung.longitude is not None and -180 <= mudeung.longitude <= 180):
        raise ValueError(f"무등도서관 좌표 누락 또는 범위 오류. 코드: {mudeung.provider_lib_code}")
    nearby = {
        lib.provider_lib_code
        for lib, _ in libraries_nearby(conn, mudeung.latitude, mudeung.longitude, NEARBY_DEFAULT_RADIUS_KM)
        if lib.region_code == GWANGJU
    }
    targets.update((row.provider_lib_code, row) for row in rows if row.provider_lib_code in nearby)
    targets.update((row.provider_lib_code, row) for row in required.values())

    status = conn.execute(text("SELECT status FROM users WHERE id = :id"), {"id": author}).scalar_one_or_none()
    if status != "active":
        raise ValueError("활성 시연 계정이 필요합니다.")
    isbns = [isbn for isbn, _, _ in BOOK_POSTS]
    books = {row.isbn13: row for row in conn.execute(SELECT_BOOKS, {"isbns": isbns})}
    missing = [isbn for isbn in isbns if isbn not in books or not isbn13_is_valid(isbn)]
    if missing:
        raise ValueError(f"시연 도서 ISBN 확인 실패. 누락 또는 잘못된 ISBN: {', '.join(missing)}")
    return SeedPlan(tuple(targets[code] for code in sorted(targets)),
                    {label: row.provider_lib_code for label, row in required.items()},
                    tuple(sorted(nearby)), books)


def request_id(code: str, kind: str, slot: int = 1) -> UUID:
    return uuid5(NAMESPACE_URL, f"axteamc/localone/c78-gwangju/{code}/{kind}/{slot}")


def insert_bundle(conn: Connection, library: Row, author: UUID, books: dict[str, Row]) -> Counter[str]:
    lock_active_user(conn, author)
    counts: Counter[str] = Counter()
    code = library.provider_lib_code
    for slot, (isbn, color, body) in enumerate(BOOK_POSTS, start=1):
        post = PostCreate(
            client_request_id=request_id(code, "post", slot), library_id=library.id, isbn13=isbn,
            image_kind="color", image_color=color, overlay_text=f"[시연] {books[isbn].title[:75]}",
            body=f"[시연] {body}",
        )
        validate_kind_fields(post, author)
        counts["post"] += conn.execute(INSERT_POST_ON_CONFLICT_DO_NOTHING_RETURNING, {
            "uid": author, "library_id": post.library_id, "book_id": books[isbn].id,
            "image_kind": post.image_kind, "image_value": post.image_color,
            "overlay_text": post.overlay_text, "body": post.body, "rid": post.client_request_id,
        }).first() is not None
    if not 1 <= len(GUESTBOOK_BODY) <= GUESTBOOK_BODY_MAX:
        raise ValueError("시연 방명록 길이가 허용 범위를 벗어났습니다.")
    counts["guestbook"] += conn.execute(INSERT_ENTRY, {
        "uid": author, "lib": library.id, "body": GUESTBOOK_BODY, "rid": request_id(code, "guestbook"),
    }).first() is not None
    club = ClubCreate(client_request_id=request_id(code, "club"), name="[시연] 동네 책 이야기",
                      intro="[시연] 최근 읽은 책에서 마음에 남은 한 문장을 함께 나눠요.")
    fields = clean_fields(club)
    counts["club"] += conn.execute(INSERT_CLUB, {
        "uid": author, "lib": library.id, **fields, "rid": club.client_request_id,
        "book_id": None, "place": None, "starts_at": None, "ends_at": None, "capacity": None,
    }).first() is not None
    return counts


def apply_plan(engine: Engine, plan: SeedPlan, author: UUID) -> bool:
    total = {status: Counter({kind: 0 for kind in BUNDLE_SIZE}) for status in ("inserted", "existing", "failed")}
    for library in plan.libraries:
        try:
            with engine.begin() as conn:
                counts = insert_bundle(conn, library, author, plan.books)
        except (SQLAlchemyError, ApiError, ValueError) as exc:
            original = getattr(exc, "orig", None)
            print(json.dumps({
                "code": library.provider_lib_code,
                "rolled_back": BUNDLE_SIZE,
                "error": getattr(original, "sqlstate", None) or getattr(exc, "code", None) or type(exc).__name__,
            }), flush=True)
            total["failed"].update(BUNDLE_SIZE)
        else:
            total["inserted"].update(counts)
            total["existing"].update({kind: size - counts[kind] for kind, size in BUNDLE_SIZE.items()})
    print(json.dumps({"target_libraries": len(plan.libraries), **total}), flush=True)
    return not any(total["failed"].values())


def local_database(raw: str) -> Engine:
    try:
        url = make_url(raw)
    except (SQLAlchemyError, ValueError):
        raise ValueError("시연용 DB URL 형식이 올바르지 않습니다.") from None
    if (url.drivername != "postgresql+psycopg" or url.host not in LOCAL_HOSTS
            or not url.port or not url.database or not url.username or url.query):
        raise ValueError("시연용 DB에 로컬 PostgreSQL 호스트·포트·DB명·사용자를 명시하세요. URL 옵션은 허용하지 않습니다.")
    return create_engine(url, connect_args={"hostaddr": "127.0.0.1", "connect_timeout": 3},
                         hide_parameters=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="C-78 광주 시연 콘텐츠. 기본 실행은 읽기 전용 사전 확인입니다.")
    parser.add_argument("--author", type=UUID, required=True, help="격리 DB에 준비한 활성 시연 계정 UUID")
    parser.add_argument("--apply", action="store_true", help="사전 확인 후 격리 DB에 시연 콘텐츠 삽입")
    args = parser.parse_args()
    try:
        engine = local_database(os.environ.get("DEMO_SEED_DATABASE_URL", ""))
        try:
            with engine.begin() as conn:
                conn.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"))
                plan = build_plan(conn, args.author)
            print(json.dumps({
                "mode": "apply" if args.apply else "preview",
                "database": f"{engine.url.host}:{engine.url.port}/{engine.url.database}",
                "author": str(args.author),
                "required_codes": plan.required_codes,
                "nearby_codes": plan.nearby_codes,
                "targets": [{"code": row.provider_lib_code, "name": row.name, "district": row.dtl_region_code}
                            for row in plan.libraries],
                "books": [{"isbn": isbn, "title": plan.books[isbn].title} for isbn, _, _ in BOOK_POSTS],
            }, ensure_ascii=False), flush=True)
            return 0 if not args.apply or apply_plan(engine, plan, args.author) else 1
        finally:
            engine.dispose()
    except ValueError as exc:
        parser.exit(2, f"{exc}\n")
    except SQLAlchemyError as exc:
        parser.exit(2, f"시연용 DB 사전 확인 실패 ({type(exc).__name__})\n")


if __name__ == "__main__":
    raise SystemExit(main())
