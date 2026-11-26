"""C-97 MY-4: 작성자 profile_id, 남의 공개 프로필 #74·#75, posts.origin, 사용자 신고."""

from unittest.mock import Mock
from uuid import uuid4

import pytest
from alembic import command
from sqlalchemy import text

from app.routers.posts import reencode_without_exif
from app.services.post_storage import SupabasePostImageStorage
from tests.conftest import USER_A_ID, USER_B_ID
from tests.provider_fakes import public_reference_data  # noqa: F401
from tests.test_feed import LIB_1, LIB_2, T0, auth, books, client, isbn, seed  # noqa: F401
from tests.test_ops import ops  # noqa: F401
from tests.test_posts_create import png_bytes, upload
from tests.test_posts_template import LOGS, POSTS, clean_template_logs, new_log, template_body  # noqa: F401

pytestmark = pytest.mark.usefixtures("clean_template_logs")


def public_id(db_engine, uid: str) -> str:
    with db_engine.connect() as c:
        return str(c.execute(text("SELECT public_id FROM users WHERE id = :u"), {"u": uid}).scalar_one())


def set_origin(db_engine, post_id: str, origin: str) -> None:
    with db_engine.begin() as c:
        c.execute(text("UPDATE posts SET origin = :o WHERE id = :id"), {"o": origin, "id": post_id})


def tab(client, pid: str, origin: str, headers=None, **params):
    return client.get(f"/api/v1/users/{pid}/posts", params={"origin": origin, **params}, headers=headers or {})


def ids(response) -> list[str]:
    assert response.status_code == 200, response.text
    return [item["id"] for item in response.json()["items"]]


def test_post_detail_author_has_profile_id_but_no_user_id(client, auth, db_engine):
    post = seed(db_engine, user_id=USER_B_ID)
    with db_engine.begin() as c:
        c.execute(text("UPDATE user_profiles SET avatar_url = 'https://x.test/a.jpg' WHERE user_id = :u"),
                  {"u": USER_B_ID})
    detail = client.get(f"{POSTS}/{post}").json()
    assert detail["author"]["profile_id"] == public_id(db_engine, USER_B_ID)
    assert detail["author"]["avatar_url"] == "https://x.test/a.jpg"
    assert detail["author"]["profile_id"] != USER_B_ID
    assert USER_B_ID not in str(detail)
    assert detail["from_reading_log"] is False


def test_public_media_hides_internal_ids_and_reads_existing_objects(client, auth, db_engine, monkeypatch):
    post = seed(db_engine, user_id=USER_B_ID, overlay=None)
    pid = public_id(db_engine, USER_B_ID)
    legacy = SupabasePostImageStorage("https://fixture.invalid", "", "post-images")
    avatar_path = f"avatars/{USER_B_ID}/{uuid4()}.jpg"
    photo_path = f"{USER_B_ID}/{uuid4()}.jpg"
    jpeg = reencode_without_exif(png_bytes())[0]
    storage = client.app.state.post_storage
    storage.put(avatar_path, jpeg, "image/jpeg")
    storage.put(photo_path, jpeg, "image/jpeg")
    with db_engine.begin() as c:
        c.execute(text("UPDATE user_profiles SET avatar_url = :url WHERE user_id = :uid"),
                  {"url": legacy.public_url(avatar_path), "uid": USER_B_ID})
        c.execute(text("UPDATE posts SET image_kind = 'photo', image_value = :path WHERE id = :id"),
                  {"path": photo_path, "id": post})

    detail = client.get(f"{POSTS}/{post}")
    profile = client.get(f"/api/v1/users/{pid}")
    listing = tab(client, pid, "post")
    avatar_url = f"http://testserver/api/v1/users/{pid}/avatar"
    photo_url = f"http://testserver{POSTS}/{post}/image"
    assert all(r.status_code == 200 and USER_B_ID not in r.text for r in (detail, profile, listing))
    assert detail.json()["author"]["avatar_url"] == profile.json()["avatar_url"] == avatar_url
    assert detail.json()["image_url"] == listing.json()["items"][0]["image_url"] == photo_url
    for url in (avatar_url, photo_url):
        image = client.get(url, follow_redirects=False)
        assert image.status_code == 200 and image.content == jpeg
        assert image.headers["cache-control"] == "no-store"
        assert image.headers["content-type"] == "image/jpeg"
        assert "location" not in image.headers

    missing = f"{POSTS}/{uuid4()}/image"
    assert client.get(missing).status_code == 404
    no_photo = seed(db_engine, user_id=USER_A_ID)
    assert client.get(f"{POSTS}/{no_photo}/image").status_code == 404
    assert client.get(f"/api/v1/users/{public_id(db_engine, USER_A_ID)}/avatar").status_code == 404

    read = Mock(side_effect=OSError("storage offline"))
    monkeypatch.setattr(storage, "read", read)
    for url in (avatar_url, photo_url):
        response = client.get(url)
        assert response.status_code == 503 and response.json()["error"]["code"] == "PROVIDER_UNAVAILABLE"
    read.reset_mock(side_effect=True)
    read.return_value = None
    assert client.get(photo_url).status_code == 404
    read.reset_mock()

    with db_engine.begin() as c:
        c.execute(text("UPDATE posts SET status = 'hidden' WHERE id = :id"), {"id": post})
        c.execute(text("UPDATE users SET status = 'withdrawn' WHERE id = :uid"), {"uid": USER_B_ID})
    for url in (avatar_url, photo_url):
        response = client.get(url)
        assert response.status_code == 404 and response.json()["error"]["code"] == "NOT_FOUND"
    read.assert_not_called()


def test_profile_counts_and_tabs_split_by_origin_without_overlap(client, auth, db_engine):
    plain_1 = seed(db_engine, user_id=USER_A_ID, at=T0)
    plain_2 = seed(db_engine, user_id=USER_A_ID, at=T0.replace(hour=T0.hour + 1))
    log = new_log(client, auth["A"])
    uploaded = upload(client, auth["A"], png_bytes(), "image/png")
    assert uploaded.status_code == 201, uploaded.text
    from_log = client.post(POSTS, headers=auth["A"], json={
        "client_request_id": str(uuid4()), "library_id": LIB_1, "reading_log_id": log,
        "image_kind": "photo", "image_path": uploaded.json()["image_path"],
        "body": "기록에서",
    })
    assert from_log.status_code == 201, from_log.text
    log_post = from_log.json()["id"]
    assert from_log.json()["from_reading_log"] is True

    pid = public_id(db_engine, USER_A_ID)
    profile = client.get(f"/api/v1/users/{pid}").json()
    assert (profile["post_count"], profile["reading_log_count"], profile["is_me"]) == (2, 1, False)
    assert ids(tab(client, pid, "post")) == [plain_2, plain_1]
    assert ids(tab(client, pid, "reading_log")) == [log_post]
    assert client.get(f"/api/v1/users/{pid}", headers=auth["A"]).json()["is_me"] is True
    assert client.get(f"/api/v1/users/{pid}", headers=auth["B"]).json()["is_me"] is False


def test_origin_stays_reading_log_after_source_log_deleted(client, auth, db_engine):
    log = new_log(client, auth["A"])
    post_id = client.post(POSTS, headers=auth["A"], json=template_body(log)).json()["id"]
    assert client.delete(f"{LOGS}/{log}", headers=auth["A"]).status_code == 204
    pid = public_id(db_engine, USER_A_ID)
    assert ids(tab(client, pid, "reading_log")) == [post_id]
    assert ids(tab(client, pid, "post")) == []
    assert client.get(f"{POSTS}/{post_id}").json()["from_reading_log"] is True


def test_profile_hides_withdrawn_and_hidden_posts(client, auth, db_engine):
    seen = seed(db_engine, user_id=USER_B_ID)
    seed(db_engine, user_id=USER_B_ID, status="withdrawn")
    seed(db_engine, user_id=USER_B_ID, status="hidden")
    seed(db_engine, user_id=USER_A_ID)  # 다른 사람 글은 안 섞인다
    pid = public_id(db_engine, USER_B_ID)
    assert ids(tab(client, pid, "post")) == [seen]
    assert client.get(f"/api/v1/users/{pid}").json()["post_count"] == 1


def test_profile_pages_with_cursor(client, auth, db_engine):
    made = [seed(db_engine, user_id=USER_B_ID, at=T0) for _ in range(3)]  # 같은 시각 → id로 동률 정리
    pid = public_id(db_engine, USER_B_ID)
    first = tab(client, pid, "post", limit=2).json()
    rest = tab(client, pid, "post", limit=2, cursor=first["next_cursor"]).json()
    got = [i["id"] for i in first["items"]] + [i["id"] for i in rest["items"]]
    assert sorted(got) == sorted(made) and len(set(got)) == 3 and rest["next_cursor"] is None


def test_withdrawn_or_unknown_profile_is_404_and_bad_origin_is_422(client, auth, db_engine):
    post = seed(db_engine, user_id=USER_B_ID)
    pid = public_id(db_engine, USER_B_ID)
    assert tab(client, pid, "everything").status_code == 422
    with db_engine.begin() as c:
        c.execute(text("UPDATE users SET status = 'withdrawn' WHERE id = :u"), {"u": USER_B_ID})
    for path in (f"/api/v1/users/{pid}", f"/api/v1/users/{uuid4()}"):
        response = client.get(path)
        assert response.status_code == 404 and response.json()["error"]["code"] == "NOT_FOUND"
    assert tab(client, pid, "post").status_code == 404
    assert client.get(f"{POSTS}/{post}").json()["author"]["profile_id"] is None
    with db_engine.begin() as c:
        c.execute(text("UPDATE users SET status = 'active' WHERE id = :u"), {"u": USER_B_ID})


def test_report_user_once_and_never_self(client, ops, db_engine):  # noqa: F811
    auth = ops
    b_pid = public_id(db_engine, USER_B_ID)
    body = {"target_kind": "user", "target_id": b_pid, "reason": "abuse"}
    assert client.post("/api/v1/reports", headers=auth["A"], json=body).status_code == 201
    assert client.post("/api/v1/reports", headers=auth["A"], json=body).status_code == 200
    with db_engine.connect() as c:
        stored = c.execute(text("SELECT target_kind, target_id FROM reports")).all()
    assert [(k, str(t)) for k, t in stored] == [("user", USER_B_ID)]  # 저장은 내부 id

    self_report = client.post("/api/v1/reports", headers=auth["A"],
                              json={**body, "target_id": public_id(db_engine, USER_A_ID)})
    assert self_report.status_code == 422
    unknown = client.post("/api/v1/reports", headers=auth["A"], json={**body, "target_id": str(uuid4())})
    assert unknown.status_code == 404

    with db_engine.connect() as c:
        nickname = c.execute(text("SELECT nickname FROM user_profiles WHERE user_id = :u"), {"u": USER_B_ID}).scalar_one()
    listed = client.get("/api/v1/ops/reports", headers=auth["A"]).json()["items"]
    assert [(r["target_kind"], r["target_status"], r["target_preview"]) for r in listed] == [
        ("user", "active", nickname),
    ]


def test_migration_backfills_origin(client, auth, db_engine, alembic_config):
    log = new_log(client, auth["A"])
    command.downgrade(alembic_config, "0032_post_overlay_style")
    try:
        plain = seed(db_engine, user_id=USER_A_ID)
        template = seed(db_engine, user_id=USER_A_ID, overlay=None)
        linked = seed(db_engine, user_id=USER_A_ID)
        with db_engine.begin() as c:
            c.execute(text("UPDATE posts SET image_kind = 'template', image_value = 'ink' WHERE id = :id"),
                      {"id": template})
            c.execute(text("UPDATE posts SET reading_log_id = :log WHERE id = :id"), {"log": log, "id": linked})
    finally:
        command.upgrade(alembic_config, "head")

    with db_engine.connect() as c:
        got = dict(c.execute(text("SELECT id::text, origin FROM posts")).all())
    assert got == {plain: "post", template: "reading_log", linked: "reading_log"}
