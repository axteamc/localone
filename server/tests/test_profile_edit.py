"""MY-2-P1: 프로필 수정(#38)·사진 올리기(#39) — my-collection 계약 MY-2 C2·C3·C6·P4·P5."""

import io
from uuid import UUID, uuid4

from PIL import Image
from sqlalchemy import text

from app.auth import CurrentUser, get_current_user
from app.services.post_storage import MemoryPostImageStorage
from tests.conftest import USER_A_ID, USER_B_ID
from tests.provider_fakes import public_reference_data  # noqa: F401  (픽스처)
from tests.test_feed import auth, books, client  # noqa: F401  (픽스처)
from tests.test_posts_create import jpeg_with_gps, png_bytes

PROFILE_KEYS = {"user_id", "nickname", "bio", "avatar_url", "updated_at"}


def profile_row(db_engine, user_id: str = USER_A_ID):
    with db_engine.connect() as conn:
        return conn.execute(text("SELECT nickname, bio, avatar_url, updated_at FROM user_profiles WHERE user_id = :u"),
                            {"u": user_id}).one()


def set_profile(db_engine, user_id: str = USER_A_ID, *, nickname="책읽는고양이", bio="동네 도서관 순례 중",
                avatar_url="https://img.test/old.jpg") -> None:
    with db_engine.begin() as conn:
        conn.execute(text("UPDATE user_profiles SET nickname = :n, bio = :b, avatar_url = :a WHERE user_id = :u"),
                     {"n": nickname, "b": bio, "a": avatar_url, "u": user_id})


def patch(client, headers, body):
    return client.patch("/api/v1/me/profile", headers=headers, json=body)


def upload(client, headers, data: bytes, content_type: str = "image/jpeg"):
    return client.post("/api/v1/uploads/avatar", headers=headers, files={"file": ("me.jpg", data, content_type)})


def assert_error(response, status: int, code: str, detail: str) -> None:
    assert response.status_code == status, response.text
    error = response.json()["error"]
    assert error["code"] == code
    assert error["detail"] == detail


# ─────────── #38 부분 갱신 ───────────


def test_patch_keeps_fields_not_sent(client, auth, db_engine):
    set_profile(db_engine)
    response = patch(client, auth["A"], {"nickname": "  새이름  "})
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == PROFILE_KEYS
    assert body["nickname"] == "새이름"  # 앞뒤 공백 뺌(Y2-2)
    assert body["bio"] == "동네 도서관 순례 중"
    assert body["avatar_url"] == "https://img.test/old.jpg"
    assert body["updated_at"].endswith("+09:00")
    row = profile_row(db_engine)
    assert (row.nickname, row.bio, row.avatar_url) == ("새이름", "동네 도서관 순례 중", "https://img.test/old.jpg")
    assert profile_row(db_engine, USER_B_ID).nickname != "새이름"  # 남의 프로필 무변경


def test_patch_same_value_twice_gives_same_result(client, auth, db_engine):
    first = patch(client, auth["A"], {"bio": "같은 소개"})
    second = patch(client, auth["A"], {"bio": "같은 소개"})
    assert first.status_code == second.status_code == 200
    assert first.json()["bio"] == second.json()["bio"] == "같은 소개"


def test_duplicate_nickname_is_allowed(client, auth, db_engine):
    set_profile(db_engine, USER_B_ID, nickname="이웃책방")
    response = patch(client, auth["A"], {"nickname": "이웃책방"})
    assert response.status_code == 200
    assert profile_row(db_engine).nickname == profile_row(db_engine, USER_B_ID).nickname == "이웃책방"


def test_nickname_length_bounds(client, auth, db_engine):
    set_profile(db_engine)
    before = profile_row(db_engine)
    for bad in ("", "   ", "가" * 41, None):
        assert_error(patch(client, auth["A"], {"nickname": bad}), 422, "VALIDATION_ERROR", "nickname")
    assert profile_row(db_engine) == before  # 막힌 요청은 행을 바꾸지 않는다
    assert patch(client, auth["A"], {"nickname": "가" * 40}).status_code == 200


def test_bio_length_and_blank(client, auth, db_engine):
    set_profile(db_engine)
    before = profile_row(db_engine)
    assert_error(patch(client, auth["A"], {"bio": "가" * 61}), 422, "VALIDATION_ERROR", "bio")
    assert profile_row(db_engine) == before
    blank = patch(client, auth["A"], {"bio": "   "})
    assert blank.status_code == 200 and blank.json()["bio"] is None  # 공백만이면 null(Y2-3)
    assert profile_row(db_engine).bio is None
    full = patch(client, auth["A"], {"bio": " " + "가" * 60 + " "})
    assert full.status_code == 200 and full.json()["bio"] == "가" * 60
    cleared = patch(client, auth["A"], {"bio": None})
    assert cleared.status_code == 200 and cleared.json()["bio"] is None


def test_empty_patch_body_is_422(client, auth, db_engine):
    set_profile(db_engine)
    before = profile_row(db_engine)
    assert_error(patch(client, auth["A"], {}), 422, "VALIDATION_ERROR", "body")
    assert_error(patch(client, auth["A"], {"follower_count": 3}), 422, "VALIDATION_ERROR", "body")  # 모르는 칸만
    assert profile_row(db_engine) == before  # updated_at 포함 그대로


def test_patch_creates_missing_profile_row(client, make_token, db_engine):
    user_c = "00000000-0000-4000-8000-00000000000c"
    with db_engine.begin() as conn:  # users만 있고 user_profiles 행 없음
        conn.execute(text("INSERT INTO users (id) VALUES (:u)"), {"u": user_c})
    headers = {"Authorization": f"Bearer {make_token(sub=user_c)}"}
    response = patch(client, headers, {"bio": "처음 소개"})
    assert response.status_code == 200, response.text
    assert response.json()["bio"] == "처음 소개"
    assert profile_row(db_engine, user_c).nickname.startswith("이웃-")


# ─────────── #38 사진 경로 ───────────


def test_upload_then_patch_sets_https_avatar(client, auth, db_engine):
    up = upload(client, auth["A"], png_bytes(), "image/png")
    assert up.status_code == 201, up.text
    path = up.json()["avatar_path"]
    assert path.startswith(f"avatars/{USER_A_ID}/") and path.endswith(".jpg")
    assert profile_row(db_engine).avatar_url is None  # #39는 DB에 쓰지 않는다
    response = patch(client, auth["A"], {"avatar_path": path})
    assert response.status_code == 200, response.text
    assert response.json()["avatar_url"] == f"https://memory.local/{path}"  # 0010 https CHECK 호환
    assert client.get("/api/v1/me/profile", headers=auth["A"]).json()["avatar_url"] == f"https://memory.local/{path}"


def test_patch_rejects_other_users_avatar_path(client, auth, db_engine):
    set_profile(db_engine)
    before = profile_row(db_engine)
    path_b = upload(client, auth["B"], png_bytes(), "image/png").json()["avatar_path"]
    assert_error(patch(client, auth["A"], {"avatar_path": path_b, "nickname": "바뀌면안됨"}),
                 422, "VALIDATION_ERROR", "avatar_path")
    assert profile_row(db_engine) == before


def test_patch_rejects_unissued_own_avatar_path(client, auth, db_engine):
    set_profile(db_engine)
    before = profile_row(db_engine)
    for bad in (f"avatars/{USER_A_ID}/{uuid4()}.jpg",  # 형식은 맞지만 #39가 준 적 없음
                f"avatars/{USER_A_ID}/photo.jpg",
                f"avatars/{USER_A_ID}/{uuid4()}.png",
                f"{USER_A_ID}/{uuid4()}.jpg",
                f"avatars/{USER_A_ID}/../{USER_B_ID}/{uuid4()}.jpg"):
        assert_error(patch(client, auth["A"], {"avatar_path": bad}), 422, "VALIDATION_ERROR", "avatar_path")
    assert profile_row(db_engine) == before


def test_avatar_null_removes_photo(client, auth, db_engine):
    set_profile(db_engine)
    response = patch(client, auth["A"], {"avatar_path": None})
    assert response.status_code == 200
    body = response.json()
    assert body["avatar_url"] is None
    assert (body["nickname"], body["bio"]) == ("책읽는고양이", "동네 도서관 순례 중")


def test_storage_check_failure_is_503_and_keeps_profile(client, auth, db_engine):
    set_profile(db_engine)
    before = profile_row(db_engine)

    class Broken(MemoryPostImageStorage):
        def exists(self, path):
            raise OSError("down")

    client.app.state.post_storage = Broken()
    response = patch(client, auth["A"], {"avatar_path": f"avatars/{USER_A_ID}/{uuid4()}.jpg", "bio": "새 소개"})
    assert_error(response, 503, "PROVIDER_UNAVAILABLE", "")
    assert profile_row(db_engine) == before


# ─────────── #39 사진 올리기 ───────────


def test_avatar_upload_strips_exif_location(client, auth):
    response = upload(client, auth["A"], jpeg_with_gps())
    assert response.status_code == 201, response.text
    assert set(response.json()) == {"avatar_path"}
    stored, content_type = client.app.state.post_storage.files[response.json()["avatar_path"]]
    assert content_type == "image/jpeg"
    saved = Image.open(io.BytesIO(stored))
    assert not saved.getexif().get_ifd(0x8825)  # GPS 없음(NFR-05)
    assert dict(saved.getexif()) == {}


def test_avatar_upload_gives_new_path_each_time(client, auth):
    first = upload(client, auth["A"], png_bytes(), "image/png").json()["avatar_path"]
    second = upload(client, auth["A"], png_bytes(), "image/png").json()["avatar_path"]
    assert first != second


def test_avatar_upload_rejects_too_large_or_not_image(client, auth):
    too_large = upload(client, auth["A"], b"\xff" * 10_000_001)
    assert_error(too_large, 413, "PAYLOAD_TOO_LARGE", "")
    assert_error(upload(client, auth["A"], "글자 파일".encode(), "text/plain"), 422, "VALIDATION_ERROR", "file")
    assert_error(upload(client, auth["A"], b"not really a jpeg"), 422, "VALIDATION_ERROR", "file")  # 디코더 image → file
    gif = io.BytesIO()
    Image.new("RGB", (10, 10)).save(gif, format="GIF")
    assert_error(upload(client, auth["A"], gif.getvalue()), 422, "VALIDATION_ERROR", "file")
    assert client.app.state.post_storage.files == {}  # 저장소 올리기 0회


def test_avatar_upload_storage_failure_is_503(client, auth):
    class Broken(MemoryPostImageStorage):
        def put(self, path, data, content_type):
            raise OSError("down")

    client.app.state.post_storage = Broken()
    assert_error(upload(client, auth["A"], png_bytes(), "image/png"), 503, "PROVIDER_UNAVAILABLE", "")


# ─────────── 인증·탈퇴 ───────────


def test_profile_edit_requires_auth(client, auth, db_engine):
    before = profile_row(db_engine)
    assert patch(client, {}, {"nickname": "익명"}).status_code == 401
    assert upload(client, {}, png_bytes(), "image/png").status_code == 401
    assert profile_row(db_engine) == before
    assert client.app.state.post_storage.files == {}


def test_patch_after_withdrawal_is_403(client, auth, db_engine):
    """인증은 통과했지만 저장 직전에 탈퇴 처리된 경합: lock_active_user가 막는다(C6)."""
    set_profile(db_engine)
    before = profile_row(db_engine)
    client.app.dependency_overrides[get_current_user] = lambda: CurrentUser(id=UUID(USER_A_ID), session_id=None)
    try:
        with db_engine.begin() as conn:
            conn.execute(text("UPDATE users SET status = 'withdrawn' WHERE id = :u"), {"u": USER_A_ID})
        assert_error(patch(client, auth["A"], {"nickname": "탈퇴중저장"}), 403, "ACCOUNT_WITHDRAWN", "")
    finally:
        client.app.dependency_overrides.pop(get_current_user, None)
    assert profile_row(db_engine) == before
