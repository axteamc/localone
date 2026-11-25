"""실기기 개선 P5(C-91): 카카오 축소 표지 → 원본 표지 주소."""

import importlib

import pytest
from alembic import command
from sqlalchemy import text

from app.services.provider_engine import _kakao_item, kakao_original_cover
from tests.test_yes24_curated import make_isbn

THUMB = ("https://search1.kakaocdn.net/thumb/R120x174.q85/?fname=http%3A%2F%2Ft1.daumcdn.net%2Flbook%2Fimage%2F532403"
         "%3Ftimestamp%3D20260531080611")
ORIGINAL = "https://t1.daumcdn.net/lbook/image/532403?timestamp=20260531080611"


@pytest.mark.parametrize(
    "url, expected",
    [
        (THUMB, ORIGINAL),
        (THUMB.replace("http%3A", "https%3A"), ORIGINAL),
        ("http://search1.kakaocdn.net/thumb/R120x174/?fname=http%3A%2F%2Ft3.daumcdn.net%2Fx%2Fy", "https://t3.daumcdn.net/x/y"),
        # 원본이 다음 이미지가 아니면 그대로(엉뚱한 곳으로 보내지 않는다)
        ("https://search1.kakaocdn.net/thumb/R120x174/?fname=http%3A%2F%2Fevil.test%2Fa", "https://search1.kakaocdn.net/thumb/R120x174/?fname=http%3A%2F%2Fevil.test%2Fa"),
        ("https://search1.kakaocdn.net/thumb/R120x174/", "https://search1.kakaocdn.net/thumb/R120x174/"),
        ("https://image.yes24.com/goods/1/XL", "https://image.yes24.com/goods/1/XL"),
        ("", ""),
        (None, None),
    ],
)
def test_kakao_original_cover(url, expected):
    assert kakao_original_cover(url) == expected


def test_kakao_item_stores_original_cover():
    info = _kakao_item({"isbn": "8936433598 9788936433598", "title": "채식주의자", "thumbnail": THUMB, "authors": ["한강"]})
    assert info is not None and info.cover_url == ORIGINAL


def test_0029_rewrites_stored_kakao_thumbs(db_engine, alembic_config):
    mig = importlib.import_module("migrations.versions.0029_kakao_original_covers")
    assert mig.original(THUMB) == ORIGINAL and mig.original("https://image.yes24.com/x") is None
    isbn_thumb, isbn_other = make_isbn(2901), make_isbn(2902)
    command.downgrade(alembic_config, "0028_user_settings")
    try:
        with db_engine.begin() as c:
            c.execute(text("INSERT INTO books (isbn13, title, source, cover_url) VALUES (:i, '축소', 'kakao', :u), (:j, '그대로', 'kakao', :v)"),
                      {"i": isbn_thumb, "u": THUMB, "j": isbn_other, "v": "https://image.yes24.com/goods/1/XL"})
    finally:
        command.upgrade(alembic_config, "head")
    with db_engine.begin() as c:
        rows = dict(c.execute(text("SELECT isbn13, cover_url FROM books WHERE isbn13 IN (:i, :j)"),
                              {"i": isbn_thumb, "j": isbn_other}).all())
        c.execute(text("DELETE FROM books WHERE isbn13 IN (:i, :j)"), {"i": isbn_thumb, "j": isbn_other})
    assert rows == {isbn_thumb: ORIGINAL, isbn_other: "https://image.yes24.com/goods/1/XL"}
