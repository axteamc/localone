"""LOCAL-3 public template views, private log linkage, and publication ordering."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event
from uuid import uuid4

import pytest
from sqlalchemy import text

from app.routers import posts
from tests.conftest import USER_A_ID
from tests.test_feed import LIB_1, LIB_2, auth, books, client, isbn  # noqa: F401
from tests.provider_fakes import public_reference_data  # noqa: F401

POSTS = "/api/v1/posts"
LOGS = "/api/v1/me/reading-logs"
pytestmark = pytest.mark.usefixtures("clean_template_logs")


@pytest.fixture
def clean_template_logs(db_engine, books):
    yield
    with db_engine.begin() as c:
        c.execute(text("DELETE FROM reading_logs WHERE book_id = ANY(:ids)"), {"ids": [book.id for book in books]})


def new_log(client, headers):
    response = client.post(LOGS, headers=headers, json={
        "client_request_id": str(uuid4()), "isbn13": isbn(0), "library_id": LIB_1,
        "read_on": "2020-02-03", "note": "비공개 감상", "quote": "비공개 문장",
    })
    assert response.status_code == 201, response.text
    return response.json()["id"]


def template_body(log_id, **overrides):
    return {
        "client_request_id": str(uuid4()), "library_id": LIB_2,
        "reading_log_id": log_id, "image_kind": "template", "image_value": "minimal",
        "isbn13": isbn(0), "overlay_text": "공개 문장", "body": "공개 감상",
        **overrides,
    }


def rows(db_engine):
    with db_engine.connect() as c:
        return c.execute(text("SELECT id, status, reading_log_id FROM posts")).all()


def test_template_post_with_other_users_reading_log_is_404(client, auth, db_engine):
    log_id = new_log(client, auth["A"])
    results = [client.post(POSTS, headers=auth["B"], json=template_body(value))
               for value in (log_id, str(uuid4()))]
    assert [(r.status_code, r.json()["error"]["code"]) for r in results] == [(404, "NOT_FOUND")] * 2
    assert results[0].json() == results[1].json()
    assert rows(db_engine) == []


def test_one_published_post_per_reading_log(client, auth, db_engine):
    log_id = new_log(client, auth["A"])
    first = client.post(POSTS, headers=auth["A"], json=template_body(log_id))
    assert first.status_code == 201, first.text
    first_id = first.json()["id"]

    duplicate = client.post(POSTS, headers=auth["A"], json=template_body(log_id, image_value="ink"))
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "ALREADY_PUBLISHED"
    assert [(str(r.id), r.status, str(r.reading_log_id)) for r in rows(db_engine)] == [
        (first_id, "published", log_id),
    ]

    assert client.post(f"{POSTS}/{first_id}/withdraw", headers=auth["A"]).status_code == 200
    republished = client.post(POSTS, headers=auth["A"], json=template_body(log_id, image_value="ink"))
    assert republished.status_code == 201, republished.text
    assert republished.json()["id"] != first_id
    assert sorted((str(r.id), r.status, str(r.reading_log_id)) for r in rows(db_engine)) == sorted([
        (first_id, "withdrawn", log_id),
        (republished.json()["id"], "published", log_id),
    ])


@pytest.mark.parametrize("key", ["neon", None])
def test_unknown_template_key_is_422(client, auth, db_engine, key):
    response = client.post(POSTS, headers=auth["A"], json=template_body(None, image_value=key))
    assert response.status_code == 422
    assert response.json()["error"]["detail"] == "image_value"
    assert rows(db_engine) == []


@pytest.mark.parametrize("moderation", ["withdraw", "hide"])
def test_reading_log_projects_only_its_current_published_post(client, auth, db_engine, moderation):
    log_id = new_log(client, auth["A"])
    log_url = f"{LOGS}/{log_id}"
    with db_engine.begin() as c:
        c.execute(text("INSERT INTO operators (user_id) VALUES (:u)"), {"u": USER_A_ID})

    def assert_link(expected):
        detail = client.get(log_url, headers=auth["A"]).json()
        assert detail["published_post_id"] == expected
        assert detail["library"]["id"] == LIB_1
        page = client.get(LOGS, headers=auth["A"]).json()
        assert page["items"][0]["published_post_id"] == expected

    assert_link(None)
    first = client.post(POSTS, headers=auth["A"], json=template_body(log_id))
    assert first.status_code == 201
    post_id = first.json()["id"]
    assert_link(post_id)
    patched = client.patch(log_url, headers=auth["A"], json={"note": "새 비공개 감상"})
    assert patched.json()["published_post_id"] == post_id
    duplicate = client.post(POSTS, headers=auth["A"], json=template_body(log_id))
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "ALREADY_PUBLISHED"
    if moderation == "withdraw":
        response = client.post(f"{POSTS}/{post_id}/withdraw", headers=auth["A"])
    else:
        response = client.post(f"/api/v1/ops/targets/post/{post_id}/hide", headers=auth["A"], json={"reason": "기준 위반"})
    assert response.status_code == 200, response.text
    assert_link(None)
    second = client.post(POSTS, headers=auth["A"], json=template_body(log_id, image_value="ink"))
    assert second.status_code == 201
    assert second.json()["id"] != post_id
    assert_link(second.json()["id"])
    foreign = client.get(log_url, headers=auth["B"])
    missing = client.get(f"{LOGS}/{uuid4()}", headers=auth["B"])
    assert foreign.status_code == missing.status_code == 404
    assert foreign.json() == missing.json()


def test_deleting_reading_log_keeps_post(client, auth, db_engine):
    log = new_log(client, auth["A"])
    result = client.post(POSTS, headers=auth["A"], json=template_body(log, image_value="ink"))
    post_id = result.json()["id"]
    assert result.json()["from_reading_log"] is True
    assert client.delete(f"{LOGS}/{log}", headers=auth["A"]).status_code == 204
    assert [(str(row.id), row.status, row.reading_log_id) for row in rows(db_engine)] == [(post_id, "published", None)]
    detail = client.get(f"{POSTS}/{post_id}").json()
    assert detail["from_reading_log"] is True  # C-97 M4-5: 출처(origin)는 올릴 때 정하고 기록을 지워도 그대로
    assert (detail["image_kind"], detail["image_value"], detail["overlay_text"], detail["body"]) == (
        "template", "ink", "공개 문장", "공개 감상",
    )


def test_template_key_is_public_but_record_data_and_storage_path_are_not(client, auth, db_engine):
    template_ids = {}
    for key in ("minimal", "ink"):
        log = new_log(client, auth["A"])
        response = client.post(POSTS, headers=auth["A"], json=template_body(log, image_value=key))
        assert response.status_code == 201, response.text
        post = response.json()
        assert post["from_reading_log"] is True
        assert post["image_value"] == key
        template_ids[post["id"]] = key

    path = f"{USER_A_ID}/{uuid4()}.jpg"
    photo = client.post(POSTS, headers=auth["A"], json=template_body(None, image_kind="photo", image_path=path))
    color = client.post(POSTS, headers=auth["A"], json=template_body(None, image_kind="color", image_color="fill2"))
    cover = client.post(POSTS, headers=auth["A"], json=template_body(None, image_kind="cover"))
    assert [r.status_code for r in (photo, color, cover)] == [201, 201, 201]

    def assert_projection(items):
        by_id = {item["id"]: item for item in items}
        assert template_ids == {pid: by_id[pid]["image_value"] for pid in template_ids}
        for pid in template_ids:
            item = by_id[pid]
            assert item["image_url"] is None and item["image_color"] is None
            assert not {"reading_log_id", "read_on", "loan_id", "quote", "note", "image_path"} & item.keys()
            assert "비공개" not in str(item)
        for original in (photo, color, cover):
            item = by_id[original.json()["id"]]
            assert item["image_value"] is None and "image_path" not in item
            assert item["image_url"] == original.json()["image_url"]
            assert item["image_color"] == original.json()["image_color"]

    details = [client.get(f"{POSTS}/{pid}").json() for pid in (
        *template_ids, photo.json()["id"], color.json()["id"], cover.json()["id"],
    )]
    assert_projection(details)
    for endpoint in (f"/api/v1/libraries/{LIB_2}/posts", f"/api/v1/books/{isbn(0)}/posts", "/api/v1/me/posts"):
        response = client.get(endpoint, headers=auth["A"])
        assert response.status_code == 200, response.text
        assert_projection(response.json()["items"])
    mixed = client.get(f"/api/v1/libraries/{LIB_2}/feed").json()["items"]
    assert_projection([item["post"] for item in mixed if item["kind"] == "post"])


@pytest.mark.parametrize("same_key", [True, False])
def test_parallel_publish_or_retry_keeps_one_post(client, auth, db_engine, monkeypatch, same_key):
    log = new_log(client, auth["A"])
    first = template_body(log)
    second = first if same_key else template_body(log, image_value="ink")
    barrier = Barrier(2, timeout=5)
    original = posts.lock_own_reading_log

    def wait_before_lock(*args):
        barrier.wait()
        return original(*args)

    monkeypatch.setattr(posts, "lock_own_reading_log", wait_before_lock)
    with ThreadPoolExecutor(max_workers=2) as pool:
        def publish(body):
            return client.post(POSTS, headers=auth["A"], json=body)
        left, right = list(pool.map(publish, (first, second)))
    assert sorted([left.status_code, right.status_code]) == ([200, 201] if same_key else [201, 409])
    if same_key:
        assert left.json()["id"] == right.json()["id"]
    else:
        failure = left if left.status_code == 409 else right
        assert failure.json()["error"]["code"] == "ALREADY_PUBLISHED"
    assert len(rows(db_engine)) == 1


@pytest.mark.parametrize("publish_first", [True, False])
def test_publish_and_delete_order_on_the_same_log(client, auth, db_engine, monkeypatch, publish_first):
    log = new_log(client, auth["A"])
    body = template_body(log)
    entered, release = Event(), Event()

    if not publish_first:
        original = posts.lock_own_reading_log

        def wait_before_lock(*args):
            entered.set()
            assert release.wait(5)
            return original(*args)

        monkeypatch.setattr(posts, "lock_own_reading_log", wait_before_lock)
    else:
        original = posts.ensure_log_has_no_published_post

        def wait_after_lock(*args):
            entered.set()
            assert release.wait(5)
            return original(*args)

        monkeypatch.setattr(posts, "ensure_log_has_no_published_post", wait_after_lock)

    with ThreadPoolExecutor(max_workers=2) as pool:
        publication = pool.submit(client.post, POSTS, headers=auth["A"], json=body)
        assert entered.wait(5)
        deletion = pool.submit(client.delete, f"{LOGS}/{log}", headers=auth["A"])
        try:
            if not publish_first:
                assert deletion.result(timeout=5).status_code == 204
        finally:
            release.set()
        publication_response = publication.result(timeout=5)
        assert deletion.result(timeout=5).status_code == 204
    assert publication_response.status_code == (201 if publish_first else 404)
    assert [row.reading_log_id for row in rows(db_engine)] == ([None] if publish_first else [])


def test_template_post_rejects_overlay_style(client, auth, db_engine):  # LOCAL-1b C3
    log = new_log(client, auth["A"])
    for field, value in (("overlay_tone", "dark"), ("overlay_pos", "top")):
        response = client.post("/api/v1/posts", headers=auth["A"], json=template_body(log, **{field: value}))
        assert response.status_code == 422
        assert response.json()["error"]["detail"] == field
    assert rows(db_engine) == []
