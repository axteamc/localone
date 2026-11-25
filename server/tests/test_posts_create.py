"""LOCAL-1-P1: 사진 올리기(#23)·게시(#24)·철회(#25) — local-feed 계약 C5·C6·P5."""

import io
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from time import monotonic
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.main import create_app
from app.services import provider_engine as pe
from app.services.post_storage import MemoryPostImageStorage, SupabasePostImageStorage, build_post_storage
from app.settings import Settings
from tests.conftest import TEST_SUPABASE_URL, USER_A_ID, USER_B_ID
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처)

LIBRARY_ID = 101  # tests/provider_fakes.py public_reference_data
NOW = datetime(2026, 11, 17, 3, 0, tzinfo=timezone.utc)
BOOK_PREFIX = "97911111"


def isbn(index: int = 0) -> str:
    base = f"{BOOK_PREFIX}{index:04d}"
    return base + str((-sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(base))) % 10)


@pytest.fixture
def books(db_engine, public_reference_data):
    """표지 있는 책(0)·표지 없는 책(1). 설명·연도를 채워 조회 엔진이 외부 제공자를 부르지 않게 한다."""

    def clean():
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM posts"))
            conn.execute(text("DELETE FROM books WHERE isbn13 LIKE :p"), {"p": BOOK_PREFIX + "%"})

    clean()
    with db_engine.begin() as conn:
        rows = pe.upsert_books(conn, [
            pe.BookInfo(isbn(0), "표지 있는 책", author="김작가", cover_url="https://img.test/cover0.jpg",
                        description="소개", pub_year=2020),
            pe.BookInfo(isbn(1), "표지 없는 책", author=None, cover_url=None, description="소개", pub_year=2021),
        ], "manual", NOW, overwrite=True)
    yield rows
    clean()


@pytest.fixture
def client(test_db_url, fake_jwks_client, books):
    app = create_app(Settings(app_env="test", database_url=test_db_url,
                              supabase_url=TEST_SUPABASE_URL), fake_jwks_client)
    assert isinstance(app.state.post_storage, MemoryPostImageStorage)
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def auth(client, make_token):
    """A·B 두 사용자를 등록하고 헤더를 돌려준다."""
    headers = {}
    for name, uid in (("A", USER_A_ID), ("B", USER_B_ID)):
        h = {"Authorization": f"Bearer {make_token(sub=uid)}"}
        assert client.post("/api/v1/auth/session", headers=h).status_code == 200
        headers[name] = h
    return headers


def jpeg_with_gps() -> bytes:
    img = Image.new("RGB", (3000, 1500), (200, 120, 40))
    exif = Image.Exif()
    exif[0x010F] = "TestCam"  # Make
    gps = {1: "N", 2: (37.0, 34.0, 0.0), 3: "E", 4: (126.0, 58.0, 0.0)}
    exif[0x8825] = gps
    out = io.BytesIO()
    img.save(out, format="JPEG", exif=exif)
    data = out.getvalue()
    assert Image.open(io.BytesIO(data)).getexif().get_ifd(0x8825), "준비한 사진에 GPS가 있어야 한다"
    return data


def png_bytes() -> bytes:
    out = io.BytesIO()
    Image.new("RGBA", (40, 30), (10, 20, 30, 255)).save(out, format="PNG")
    return out.getvalue()


def upload(client, headers, data: bytes, content_type: str = "image/jpeg"):
    return client.post("/api/v1/uploads/post-images", headers=headers,
                       files={"image": ("photo.jpg", data, content_type)})


def post_body(**overrides):
    body = {"client_request_id": str(uuid4()), "library_id": LIBRARY_ID, "image_kind": "color",
            "image_color": "fill2"}
    body.update(overrides)
    return body


def count_posts(db_engine) -> int:
    with db_engine.connect() as conn:
        return conn.execute(text("SELECT count(*) FROM posts")).scalar_one()


# ─────────── #23 ───────────


def test_upload_strips_exif_and_reencodes(client, auth):
    response = upload(client, auth["A"], jpeg_with_gps())
    assert response.status_code == 201
    body = response.json()
    assert re.fullmatch(rf"{USER_A_ID}/[0-9a-f-]{{36}}\.jpg", body["image_path"])
    assert (body["width"], body["height"]) == (2048, 1024)
    stored, content_type = client.app.state.post_storage.files[body["image_path"]]
    assert content_type == "image/jpeg" and body["bytes"] == len(stored)
    saved = Image.open(io.BytesIO(stored))
    assert saved.format == "JPEG" and saved.size == (2048, 1024)
    assert dict(saved.getexif()) == {} and not saved.getexif().get_ifd(0x8825)
    assert b"Exif" not in stored and b"TestCam" not in stored
    assert body["image_url"].startswith("data:image/jpeg;base64,")


def test_upload_png_is_reencoded_to_jpeg(client, auth):
    response = upload(client, auth["A"], png_bytes(), "image/png")
    assert response.status_code == 201 and response.json()["image_path"].endswith(".jpg")
    stored, _ = client.app.state.post_storage.files[response.json()["image_path"]]
    assert Image.open(io.BytesIO(stored)).format == "JPEG"


def test_upload_too_large_is_413_and_nothing_saved(client, auth):
    response = upload(client, auth["A"], b"\xff" * 10_000_001)
    assert response.status_code == 413
    assert response.json()["error"] == {"code": "PAYLOAD_TOO_LARGE", "message": "사진이 너무 커요.", "detail": ""}
    assert client.app.state.post_storage.files == {}


@pytest.mark.parametrize("data,content_type", [(b"hello", "text/plain"), (b"not an image", "image/jpeg")])
def test_upload_rejects_non_image(client, auth, data, content_type):
    response = upload(client, auth["A"], data, content_type)
    assert response.status_code == 422 and response.json()["error"]["detail"] == "image"
    assert client.app.state.post_storage.files == {}


def test_upload_requires_login(client):
    response = upload(client, {}, png_bytes(), "image/png")
    assert response.status_code == 401
    assert client.app.state.post_storage.files == {}


def test_upload_storage_failure_is_503(client, auth):
    class Broken(MemoryPostImageStorage):
        def put(self, path, data, content_type):
            raise OSError("down")

    client.app.state.post_storage = Broken()
    response = upload(client, auth["A"], png_bytes(), "image/png")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "PROVIDER_UNAVAILABLE"
    assert response.json()["error"]["message"] == "사진을 올리지 못했어요. 다시 시도해 주세요."


def test_upload_rejects_excessive_pixels_and_disallowed_format(client, auth):
    huge_png = io.BytesIO()
    Image.new("1", (6000, 6000)).save(huge_png, format="PNG")
    res_huge = upload(client, auth["A"], huge_png.getvalue(), "image/png")
    assert res_huge.status_code == 422 and res_huge.json()["error"]["detail"] == "image"

    gif_buf = io.BytesIO()
    Image.new("RGB", (10, 10)).save(gif_buf, format="GIF")
    res_gif = upload(client, auth["A"], gif_buf.getvalue(), "image/jpeg")
    assert res_gif.status_code == 422 and res_gif.json()["error"]["detail"] == "image"
    assert client.app.state.post_storage.files == {}


def test_production_requires_storage_key_and_rejects_memory_fallback(test_db_url):
    with pytest.raises(ValueError, match="SUPABASE_SERVICE_ROLE_KEY"):
        Settings(
            app_env="production",
            database_url=test_db_url,
            supabase_url=TEST_SUPABASE_URL,
            supabase_service_role_key="",
        )
    prod_missing = Settings.model_construct(
        app_env="production",
        database_url=test_db_url,
        supabase_url=TEST_SUPABASE_URL,
        supabase_service_role_key="",
        post_image_bucket="post-images",
    )
    with pytest.raises(ValueError):
        build_post_storage(prod_missing)
    prod_ok = Settings(
        app_env="production",
        database_url=test_db_url,
        supabase_url=TEST_SUPABASE_URL,
        supabase_service_role_key="service-role-secret",
    )
    assert isinstance(build_post_storage(prod_ok), SupabasePostImageStorage)
    local_settings = Settings(app_env="local", database_url=test_db_url, supabase_url="")
    assert isinstance(build_post_storage(local_settings), MemoryPostImageStorage)


# ─────────── #24 ───────────

POST_FIELDS = {"id", "library", "book", "image_kind", "image_url", "image_color", "image_value", "from_reading_log", "overlay_text", "body",
               "author", "is_mine", "reaction_count", "my_reaction", "my_bookmark", "published_at"}


def test_create_photo_post_then_read_fields(client, auth, db_engine):
    path = upload(client, auth["A"], png_bytes(), "image/png").json()["image_path"]
    response = client.post("/api/v1/posts", headers=auth["A"], json=post_body(
        image_kind="photo", image_path=path, image_color=None, isbn13=isbn(0),
        overlay_text="  밑줄 친 문장  ", body="  좋았어요  "))
    assert response.status_code == 201
    post = response.json()
    assert set(post) == POST_FIELDS
    assert "user_id" not in response.text and USER_A_ID not in response.text.replace(path, "")
    UUID(post["id"])
    assert post["library"] == {"id": LIBRARY_ID, "name": "정독도서관"}
    assert post["book"] == {"isbn13": isbn(0), "title": "표지 있는 책", "author": "김작가",
                            "cover_url": "https://img.test/cover0.jpg"}
    assert post["image_kind"] == "photo" and post["image_url"].startswith("data:image/jpeg;base64,")
    assert post["image_color"] is None
    assert post["overlay_text"] == "밑줄 친 문장" and post["body"] == "좋았어요"
    assert post["author"] == {"nickname": "이웃-0000"}
    assert post["is_mine"] is True
    assert (post["reaction_count"], post["my_reaction"], post["my_bookmark"]) == (0, False, False)
    assert post["published_at"].endswith("+09:00")
    with db_engine.connect() as conn:
        row = conn.execute(text("SELECT user_id, image_value, status FROM posts")).one()
    assert (str(row.user_id), row.image_value, row.status) == (USER_A_ID, path, "published")


def test_create_color_and_image_only_post(client, auth, db_engine):
    response = client.post("/api/v1/posts", headers=auth["A"], json=post_body(overlay_text="   ", body=""))
    assert response.status_code == 201
    post = response.json()
    assert post["body"] is None and post["overlay_text"] is None and post["book"] is None
    assert post["image_kind"] == "color" and post["image_color"] == "fill2" and post["image_url"] is None
    assert count_posts(db_engine) == 1


def test_create_cover_uses_book_cover(client, auth):
    response = client.post("/api/v1/posts", headers=auth["A"], json=post_body(
        image_kind="cover", image_color=None, isbn13=isbn(0), image_path="https://evil.test/x.jpg"))
    assert response.status_code == 201
    assert response.json()["image_url"] == "https://img.test/cover0.jpg"
    assert response.json()["image_color"] is None


def test_cover_without_book_cover_is_422(client, auth, db_engine):
    response = client.post("/api/v1/posts", headers=auth["A"], json=post_body(
        image_kind="cover", image_color=None, isbn13=isbn(1)))
    assert response.status_code == 422 and response.json()["error"]["detail"] == "image_kind"
    assert count_posts(db_engine) == 0


def test_book_without_cover_as_color_fill3_with_title_overlay(client, auth):
    """앱 F14: 표지 없는 책은 color+fill3+책 연결+제목·저자 글자로 보낸다."""
    response = client.post("/api/v1/posts", headers=auth["A"], json=post_body(
        image_color="fill3", isbn13=isbn(1), overlay_text="표지 없는 책"))
    assert response.status_code == 201
    post = response.json()
    assert post["image_color"] == "fill3" and post["book"]["isbn13"] == isbn(1)
    assert post["book"]["cover_url"] is None and post["overlay_text"] == "표지 없는 책"


def test_same_client_request_id_returns_same_post(client, auth, db_engine):
    body = post_body()
    first = client.post("/api/v1/posts", headers=auth["A"], json=body)
    second = client.post("/api/v1/posts", headers=auth["A"], json=body)
    assert (first.status_code, second.status_code) == (201, 200)
    assert first.json() == second.json()
    assert count_posts(db_engine) == 1

    concurrent = post_body()
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: client.post("/api/v1/posts", headers=auth["A"], json=concurrent),
                                range(4)))
    assert sorted(r.status_code for r in results) == [200, 200, 200, 201]
    assert len({r.json()["id"] for r in results}) == 1
    assert count_posts(db_engine) == 2


def test_same_client_request_id_of_other_user_is_separate(client, auth, db_engine):
    body = post_body()
    a = client.post("/api/v1/posts", headers=auth["A"], json=body)
    b = client.post("/api/v1/posts", headers=auth["B"], json=body)
    assert (a.status_code, b.status_code) == (201, 201) and a.json()["id"] != b.json()["id"]
    assert count_posts(db_engine) == 2


def test_image_path_of_other_user_is_422(client, auth, db_engine):
    b_path = upload(client, auth["B"], png_bytes(), "image/png").json()["image_path"]
    response = client.post("/api/v1/posts", headers=auth["A"], json=post_body(
        image_kind="photo", image_path=b_path, image_color=None))
    assert response.status_code == 422 and response.json()["error"]["detail"] == "image_path"
    assert count_posts(db_engine) == 0


@pytest.mark.parametrize("overrides,field", [
    ({"image_kind": "photo", "image_color": None}, "image_path"),
    ({"image_color": "red"}, "image_color"),
    ({"image_color": None}, "image_color"),
    ({"image_kind": "cover", "image_color": None}, "isbn13"),
    ({"isbn13": "9781111100009"}, "isbn13"),
    ({"overlay_text": "가" * 81}, "overlay_text"),
    ({"body": "가" * 2001}, "body"),
    ({"image_kind": "video"}, "image_kind"),
    ({"client_request_id": "not-a-uuid"}, "client_request_id"),
    ({"library_id": 0}, "library_id"),
])
def test_create_validation_is_422_no_row(client, auth, db_engine, overrides, field):
    response = client.post("/api/v1/posts", headers=auth["A"], json=post_body(**overrides))
    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert response.json()["error"]["detail"] == field
    assert count_posts(db_engine) == 0


def test_text_length_limits_accept_boundary(client, auth):
    response = client.post("/api/v1/posts", headers=auth["A"], json=post_body(
        overlay_text="가" * 80, body="나" * 2000))
    assert response.status_code == 201
    assert len(response.json()["overlay_text"]) == 80 and len(response.json()["body"]) == 2000


def test_unknown_library_is_404_no_row(client, auth, db_engine):
    response = client.post("/api/v1/posts", headers=auth["A"], json=post_body(library_id=999999))
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND" and response.json()["error"]["detail"] == "library_id"
    assert count_posts(db_engine) == 0


def test_unknown_isbn_is_404_no_row(client, auth, db_engine):
    response = client.post("/api/v1/posts", headers=auth["A"], json=post_body(isbn13=isbn(9)))
    # 제공자 없음 + 캐시 없음 → 엔진 503 (외부를 부르지 않는다)
    assert response.status_code == 503 and response.json()["error"]["code"] == "PROVIDER_UNAVAILABLE"

    class NoBook:
        calls: list = []

        def lookup_isbn(self, isbn13):
            return None

    client.app.state.provider_engine = pe.ProviderEngine(
        db_engine, pe.Providers(books=NoBook(), library_data=None), now_fn=lambda: NOW)
    response = client.post("/api/v1/posts", headers=auth["A"], json=post_body(isbn13=isbn(9)))
    assert response.status_code == 404 and response.json()["error"]["detail"] == "isbn13"
    assert count_posts(db_engine) == 0


def test_create_requires_login(client, db_engine, books):
    response = client.post("/api/v1/posts", json=post_body())
    assert response.status_code == 401
    assert count_posts(db_engine) == 0


def test_kind_value_check_constraint(db_engine, books):
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id) VALUES (:id)"), {"id": USER_A_ID})
    bad_rows = [
        ("photo", "https://img.test/x.jpg", None),
        ("cover", "fill1", books[0].id),
        ("color", "red", None),
        ("cover", "https://img.test/x.jpg", None),  # 표지인데 책 없음
    ]
    for kind, value, book_id in bad_rows:
        with pytest.raises(IntegrityError):
            with db_engine.begin() as conn:
                conn.execute(text(
                    "INSERT INTO posts (user_id, library_id, book_id, image_kind, image_value, client_request_id) "
                    "VALUES (:u, :l, :b, :k, :v, :r)"),
                    {"u": USER_A_ID, "l": LIBRARY_ID, "b": book_id, "k": kind, "v": value, "r": uuid4()})
    for column, value in (("overlay_text", ""), ("overlay_text", "가" * 81), ("body", "가" * 2001)):
        with pytest.raises(IntegrityError):
            with db_engine.begin() as conn:
                conn.execute(text(
                    f"INSERT INTO posts (user_id, library_id, image_kind, image_value, client_request_id, {column}) "
                    "VALUES (:u, :l, 'color', 'fill1', :r, :x)"),
                    {"u": USER_A_ID, "l": LIBRARY_ID, "r": uuid4(), "x": value})
    assert count_posts(db_engine) == 0


def test_body_user_id_is_ignored(client, auth, db_engine):
    response = client.post("/api/v1/posts", headers=auth["A"], json=post_body(user_id=USER_B_ID))
    assert response.status_code == 201
    with db_engine.connect() as conn:
        assert str(conn.execute(text("SELECT user_id FROM posts")).scalar_one()) == USER_A_ID


def test_create_while_withdrawing_is_403_no_row(client, auth, db_engine):
    """인증을 통과한 뒤 탈퇴가 먼저 잠그면, 쓰기 트랜잭션의 lock_active_user가 기다렸다가 403."""
    with db_engine.connect() as withdraw:
        tx = withdraw.begin()
        withdraw.execute(text("UPDATE users SET status = 'withdrawn' WHERE id = :id"), {"id": USER_A_ID})
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(lambda: client.post("/api/v1/posts", headers=auth["A"], json=post_body()))
            try:
                deadline = monotonic() + 5
                blocked = False
                with db_engine.connect() as observer:
                    while monotonic() < deadline and not future.done():
                        blocked = observer.execute(text(
                            "SELECT count(*) > 0 FROM pg_stat_activity WHERE wait_event_type = 'Lock' "
                            "AND query LIKE 'SELECT status FROM users%FOR SHARE'")).scalar_one()
                        observer.rollback()  # pg_stat_activity는 트랜잭션마다 스냅숏이라 매번 새로 본다
                        if blocked:
                            break
                assert blocked, "게시 쓰기가 탈퇴 잠금을 기다리지 않았다"
            finally:
                tx.commit()
            response = future.result(timeout=5)
    assert response.status_code == 403 and response.json()["error"]["code"] == "ACCOUNT_WITHDRAWN"
    assert count_posts(db_engine) == 0


def test_posts_rls_enabled(db_engine):
    with db_engine.connect() as conn:
        assert conn.execute(text("SELECT relrowsecurity FROM pg_class WHERE relname = 'posts'")).scalar_one()
        assert conn.execute(text("SELECT count(*) FROM pg_policies WHERE tablename = 'posts'")).scalar_one() == 0


# ─────────── #25 ───────────


def _status(db_engine, post_id: str) -> str:
    with db_engine.connect() as conn:
        return conn.execute(text("SELECT status FROM posts WHERE id = :id"), {"id": post_id}).scalar_one()


def test_withdraw_by_author_hides_and_is_idempotent(client, auth, db_engine):
    post_id = client.post("/api/v1/posts", headers=auth["A"], json=post_body()).json()["id"]
    first = client.post(f"/api/v1/posts/{post_id}/withdraw", headers=auth["A"])
    second = client.post(f"/api/v1/posts/{post_id}/withdraw", headers=auth["A"])
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json() == {"id": post_id, "status": "withdrawn"}
    assert _status(db_engine, post_id) == "withdrawn"
    assert count_posts(db_engine) == 1  # 행은 지우지 않는다


def test_withdraw_by_other_is_403_unchanged(client, auth, db_engine):
    post_id = client.post("/api/v1/posts", headers=auth["A"], json=post_body()).json()["id"]
    response = client.post(f"/api/v1/posts/{post_id}/withdraw", headers=auth["B"])
    assert response.status_code == 403
    assert response.json()["error"] == {"code": "FORBIDDEN", "message": "할 수 없는 요청이에요.", "detail": ""}
    assert _status(db_engine, post_id) == "published"


def test_withdraw_unknown_is_404(client, auth):
    response = client.post(f"/api/v1/posts/{uuid4()}/withdraw", headers=auth["A"])
    assert response.status_code == 404 and response.json()["error"]["code"] == "NOT_FOUND"


def test_withdraw_requires_login(client, auth, db_engine):
    post_id = client.post("/api/v1/posts", headers=auth["A"], json=post_body()).json()["id"]
    assert client.post(f"/api/v1/posts/{post_id}/withdraw").status_code == 401
    assert _status(db_engine, post_id) == "published"


# ─────────── #72 게시물 고치기 (C-91) ───────────


def test_edit_updates_only_sent_text_fields_and_returns_detail(client, auth, db_engine):
    created = client.post("/api/v1/posts", headers=auth["A"], json=post_body()).json()
    post_id = created["id"]
    r = client.patch(f"/api/v1/posts/{post_id}", headers=auth["A"], json={"body": "  고친 본문  "})
    assert r.status_code == 200
    got = r.json()
    assert got["id"] == post_id and got["body"] == "고친 본문"
    assert got["overlay_text"] == created["overlay_text"]  # 보내지 않은 칸은 그대로
    assert got["is_mine"] is True and got["image_kind"] == created["image_kind"]
    r = client.patch(f"/api/v1/posts/{post_id}", headers=auth["A"], json={"overlay_text": "새 글자", "body": None})
    assert r.json()["overlay_text"] == "새 글자" and r.json()["body"] is None  # null은 비움
    assert client.get(f"/api/v1/posts/{post_id}").json()["overlay_text"] == "새 글자"


def test_edit_rejects_other_fields_empty_body_and_too_long(client, auth):
    post_id = client.post("/api/v1/posts", headers=auth["A"], json=post_body()).json()["id"]
    for body in ({}, {"image_kind": "color"}, {"isbn13": isbn(1)}, {"body": "가" * 2001}, {"overlay_text": "가" * 81}):
        r = client.patch(f"/api/v1/posts/{post_id}", headers=auth["A"], json=body)
        assert r.status_code == 422, body


def test_edit_by_other_403_unknown_404_withdrawn_404_and_login(client, auth, db_engine):
    post_id = client.post("/api/v1/posts", headers=auth["A"], json=post_body()).json()["id"]
    r = client.patch(f"/api/v1/posts/{post_id}", headers=auth["B"], json={"body": "남의 글"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"
    assert client.patch(f"/api/v1/posts/{uuid4()}", headers=auth["A"], json={"body": "x"}).json()["error"]["code"] == "NOT_FOUND"
    assert client.patch(f"/api/v1/posts/{post_id}", json={"body": "x"}).status_code == 401
    client.post(f"/api/v1/posts/{post_id}/withdraw", headers=auth["A"])
    r = client.patch(f"/api/v1/posts/{post_id}", headers=auth["A"], json={"body": "내린 글"})
    assert r.status_code == 404 and r.json()["error"]["code"] == "POST_NOT_AVAILABLE"


def test_create_accepts_h6_9_and_legacy_6_color_tokens(client, auth):
    from app.routers.posts import COLOR_TOKENS, FEED_COLOR_TOKENS, LEGACY_COLOR_TOKENS

    assert len(FEED_COLOR_TOKENS) == 9
    assert len(LEGACY_COLOR_TOKENS) == 6
    for token in COLOR_TOKENS:
        response = client.post(
            "/api/v1/posts",
            headers=auth["A"],
            json=post_body(image_kind="color", image_color=token),
        )
        assert response.status_code == 201, f"{token}: {response.text}"
        assert response.json()["image_color"] == token

