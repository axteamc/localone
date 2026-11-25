from unittest.mock import Mock
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services import provider_engine
from app.settings import Settings


@pytest.fixture
def client():
    settings = Settings(_env_file=None, app_env="test", kakao_rest_api_key="fake",
                        database_url="postgresql+psycopg://localhost:1/localone_test")
    with TestClient(create_app(settings)) as c:
        yield c


@pytest.fixture
def upstream(monkeypatch):
    mock = Mock(return_value={"documents": []})
    monkeypatch.setattr(provider_engine, "_http_get_json", mock)
    return mock


def post(client, q):
    return client.post("/api/v1/places/search", json={"query": q})


@pytest.mark.parametrize("q", ["", " 가 ", "가" * 101, None, 24])
def test_invalid(client, upstream, q):
    res = post(client, q)
    assert res.status_code == 422
    assert res.json()["error"]["detail"] == "query"
    upstream.assert_not_called()


@pytest.mark.parametrize("q", ["가나", "가" * 100])
def test_valid_empty(client, upstream, q):
    res = post(client, " " + q + " ")
    assert res.status_code == 200 and res.json() == {"items": []}
    url, headers, _ = upstream.call_args.args
    assert urlsplit(url).path == "/v2/local/search/keyword.json"
    assert parse_qs(urlsplit(url).query) == {"query": [q], "size": ["5"]}
    assert headers == {"Authorization": "KakaoAK fake"}


def test_filtered_fields_order_and_limit(client, upstream):
    docs = [dict(id=str(i), place_name="우체국", address_name="광주 동구 금남로 12",
                 x="126.9", y="35.1", phone="private") for i in range(6)]
    docs[1]["address_name"] = "세종 조치원읍"
    docs[2]["address_name"] = "전남광주통합특별시 동구 충장로2가 16"
    docs[3]["address_name"] = "전남광주통합특별시 순천시 덕암동 188-100"
    upstream.return_value = {"documents": docs}
    items = post(client, "우체국").json()["items"]
    assert [p["id"] for p in items] == list("01234")
    assert items[0] == dict(id="0", name="우체국", area_label="광주광역시 동구", lat=35.1, lng=126.9)
    assert items[1]["area_label"] == "세종특별자치시"
    assert items[2]["area_label"] == "전남광주통합특별시 동구"
    assert items[3]["area_label"] == "전남광주통합특별시 순천시"


@pytest.mark.parametrize("body", [{}, {"documents": {}}, {"documents": [None]},
    {"documents": [dict(id="1", place_name="가", address_name="서울 중구", x="nan", y=35)]}])
def test_malformed_is_unavailable(client, upstream, body):
    upstream.return_value = body
    res = post(client, "우체국")
    assert res.status_code == 503 and res.json()["error"]["code"] == "PROVIDER_UNAVAILABLE"


@pytest.mark.parametrize("status,expected", [(403, 503), (429, 429)])
def test_provider_errors(client, upstream, status, expected):
    error = provider_engine.ProviderError()
    error.__cause__ = HTTPError("", status, "private", {}, None)
    upstream.side_effect = error
    res = post(client, "우체국")
    assert res.status_code == expected
    assert res.json()["error"]["code"] == ("PROVIDER_LIMIT" if status == 429 else "PROVIDER_UNAVAILABLE")


def test_malformed_json_and_missing_body(client, upstream):
    for raw in (b"", b"{"):
        res = client.post("/api/v1/places/search", content=raw, headers={"Content-Type": "application/json"})
        assert res.status_code == 422
        assert res.json()["error"]["detail"] == "query"
    upstream.assert_not_called()


def test_timeout(client, upstream):
    upstream.side_effect = provider_engine.ProviderError("TimeoutError")
    res = post(client, "우체국")
    assert res.status_code == 503 and res.json()["error"]["code"] == "PROVIDER_UNAVAILABLE"


def test_missing_key(client, upstream):
    client.app.state.settings.kakao_rest_api_key = ""
    assert post(client, "우체국").status_code == 503
    upstream.assert_not_called()
