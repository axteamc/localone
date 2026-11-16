import io
import json
import threading
import time
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from fastapi import Depends
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import event

from app.auth import CurrentUser, build_jwks_client, verify_access_token
from app.main import create_app
from app.settings import Settings

URL = "https://auth.example.test"
DB = "postgresql+psycopg://localone:localone@127.0.0.1:1/localone_test"
UID = "00000000-0000-4000-8000-00000000000a"
MESSAGES = {
    "AUTH_REQUIRED": "로그인이 필요해요.",
    "AUTH_INVALID": "로그인 정보를 확인하지 못했어요. 다시 로그인해 주세요.",
    "AUTH_EXPIRED": "로그인 정보를 확인하지 못했어요. 다시 로그인해 주세요.",
    "AUTH_UNAVAILABLE": "로그인 확인이 잠시 안 돼요. 잠시 뒤 다시 시도해 주세요.",
}


@pytest.fixture
def keys():
    return [ec.generate_private_key(ec.SECP256R1()) for _ in range(2)]


def token(key, kid="one", **changes):
    claims = dict(exp=int(time.time()) + 3600, iss=f"{URL}/auth/v1",
                  aud="authenticated", sub=UID, role="authenticated", session_id="session-a")
    claims.update(changes)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key, algorithm="ES256", headers={"kid": kid})


@pytest.fixture
def harness(keys):
    jwk = jwt.PyJWK.from_dict(json.loads(jwt.algorithms.ECAlgorithm.to_jwk(keys[0].public_key())))
    fake = Mock(get_signing_key_from_jwt=Mock(return_value=jwk))
    app = create_app(Settings(app_env="test", database_url=DB, supabase_url=URL), fake)
    db_calls = Mock(side_effect=AssertionError("JWT 시험은 DB에 연결하면 안 된다"))
    event.listen(app.state.engine, "do_connect", db_calls)

    @app.get("/_test/protected")
    async def protected(user: CurrentUser = Depends(verify_access_token)):
        return {"id": str(user.id), "session_id": user.session_id}

    with TestClient(app) as client:
        yield SimpleNamespace(app=app, client=client, fake=fake, keys=keys)
    db_calls.assert_not_called()


def request(h, value):
    return h.client.get("/_test/protected", headers={"Authorization": f"Bearer {value}"})


def error(response, code, status=401):
    assert response.status_code == status
    assert response.json() == {"error": {"code": code, "message": MESSAGES[code], "detail": ""}}


def test_valid_tokens_and_thread_boundary(harness):
    h = harness
    threads = []
    key = h.fake.get_signing_key_from_jwt.return_value
    h.fake.get_signing_key_from_jwt.side_effect = lambda _: (threads.append(threading.get_ident()), key)[1]
    r = request(h, token(h.keys[0]))
    assert r.json() == {"id": UID, "session_id": "session-a"}
    assert threads and threads[0] != h.client.portal.call(threading.get_ident)
    # RSA도 실제 서명·검증한다.
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    h.fake.get_signing_key_from_jwt.side_effect = None
    h.fake.get_signing_key_from_jwt.return_value = jwt.PyJWK.from_dict(
        json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private.public_key())))
    claims = jwt.decode(token(h.keys[0]), options={"verify_signature": False})
    r = request(h, jwt.encode(claims, private, algorithm="RS256", headers={"kid": "rsa"}))
    assert r.status_code == 200
    assert UUID(r.json()["id"]) == UUID(UID)


def test_missing_header_is_auth_required(harness):
    for headers in ({}, {"Authorization": "Basic xxx"}):
        error(harness.client.get("/_test/protected", headers=headers), "AUTH_REQUIRED")
    harness.fake.get_signing_key_from_jwt.assert_not_called()


def test_expired_token_is_auth_expired(harness):
    error(request(harness, token(harness.keys[0], exp=int(time.time()) - 60)), "AUTH_EXPIRED")


def test_wrong_issuer_rejected(harness):
    error(request(harness, token(harness.keys[0], iss="https://other.test/auth/v1")), "AUTH_INVALID")


def test_wrong_audience_rejected(harness):
    error(request(harness, token(harness.keys[0], aud="anon")), "AUTH_INVALID")


def test_anon_role_rejected(harness):
    error(request(harness, token(harness.keys[0], role="anon")), "AUTH_INVALID")


def test_hs256_and_none_rejected(harness):
    claims = jwt.decode(token(harness.keys[0]), options={"verify_signature": False})
    for alg, key in (("HS256", "x" * 64), ("none", None)):
        error(request(harness, jwt.encode(claims, key, algorithm=alg, headers={"kid": "one"})), "AUTH_INVALID")
    harness.fake.get_signing_key_from_jwt.assert_not_called()


def test_bad_signature_rejected(harness):
    error(request(harness, token(harness.keys[1])), "AUTH_INVALID")


@pytest.mark.parametrize("changes", [dict(exp=None), dict(iss=None), dict(aud=None),
                                    dict(sub=None), dict(sub="bad"), dict(role=None)])
def test_invalid_claims_and_kid_rejected(harness, changes):
    error(request(harness, token(harness.keys[0], **changes)), "AUTH_INVALID")


@pytest.mark.parametrize("kid", [None, 42, ""])
def test_invalid_kid_no_http(harness, kid):
    claims = jwt.decode(token(harness.keys[0]), options={"verify_signature": False})
    # PyJWT의 encode 자체가 비문자열 kid를 거부하므로 헤더만 직접 인코딩한다.
    header = {"alg": "ES256"} if kid is None else {"alg": "ES256", "kid": kid}
    value = jwt.utils.base64url_encode(json.dumps(header).encode()).decode()
    value += "." + jwt.utils.base64url_encode(json.dumps(claims).encode()).decode() + ".AA"
    error(request(harness, value), "AUTH_INVALID")
    harness.fake.get_signing_key_from_jwt.assert_not_called()


@pytest.mark.parametrize("value", ["", "broken", "a.b.c"])
def test_malformed_token(harness, value):
    error(request(harness, value), "AUTH_INVALID")
    harness.fake.get_signing_key_from_jwt.assert_not_called()


def test_jwks_unavailable_is_503(harness):
    harness.fake.get_signing_key_from_jwt.side_effect = jwt.PyJWKClientConnectionError()
    error(request(harness, token(harness.keys[0])), "AUTH_UNAVAILABLE", 503)


def test_empty_supabase_url_is_503(harness):
    harness.app.state.settings.supabase_url = ""
    error(request(harness, token(harness.keys[0])), "AUTH_UNAVAILABLE", 503)
    harness.fake.get_signing_key_from_jwt.assert_not_called()


def test_production_requires_supabase_url():
    with pytest.raises(ValidationError, match="SUPABASE_URL"):
        Settings(app_env="production", database_url=DB, supabase_url="")


@pytest.fixture
def http_jwks(harness, monkeypatch):
    h = harness
    clock = [1000.0]
    monkeypatch.setattr("jwt.jwks_client.time.monotonic", lambda: clock[0])
    jwks = []
    for kid, key in zip(("one", "two"), h.keys):
        jwks.append(dict(json.loads(jwt.algorithms.ECAlgorithm.to_jwk(key.public_key())), kid=kid))
    state = SimpleNamespace(payload=json.dumps({"keys": [jwks[0]]}).encode(), calls=0,
                            clock=clock, jwks=jwks)

    def open_http(req, timeout):
        assert req.full_url == f"{URL}/auth/v1/.well-known/jwks.json"
        assert timeout == 3
        state.calls += 1
        return io.BytesIO(state.payload)

    monkeypatch.setattr("urllib.request.OpenerDirector.open", lambda self, req, timeout: open_http(req, timeout))
    h.app.state.jwks_client = build_jwks_client(h.app.state.settings)
    return state


def test_unknown_kid_refetches_once(harness, http_jwks):
    h, s = harness, http_jwks
    assert request(h, token(h.keys[0])).status_code == 200
    s.clock[0] += 31
    s.payload = json.dumps({"keys": [s.jwks[1]]}).encode()
    assert request(h, token(h.keys[1], "two")).status_code == 200
    assert s.calls == 2


def test_unknown_kid_cooldown(harness, http_jwks):
    h, s = harness, http_jwks
    assert request(h, token(h.keys[0])).status_code == 200
    for _ in range(3):
        error(request(h, token(h.keys[1], "two")), "AUTH_INVALID")
    assert s.calls == 1
    s.clock[0] += 31
    s.payload = json.dumps({"keys": [s.jwks[1]]}).encode()
    assert request(h, token(h.keys[1], "two")).status_code == 200
    assert s.calls == 2


def test_revoked_key_leaves_cache_after_ttl(harness, http_jwks):
    h, s = harness, http_jwks
    assert request(h, token(h.keys[0])).status_code == 200
    s.payload = json.dumps({"keys": [s.jwks[1]]}).encode()
    s.clock[0] += 601
    error(request(h, token(h.keys[0])), "AUTH_INVALID")
    assert s.calls == 2


@pytest.mark.parametrize("payload", [b"{", b"[]", b"{}", b'{"keys":[]}',
                                     b'{"keys":[{"kty":"EC"}]}', b'{"keys":42}'])
def test_malformed_jwks_is_503(harness, http_jwks, payload):
    http_jwks.payload = payload
    error(request(harness, token(harness.keys[0])), "AUTH_UNAVAILABLE", 503)
    assert http_jwks.calls == 1
