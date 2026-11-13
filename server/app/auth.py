"""Supabase access JWT 검증. 외부 키 조회는 스레드에서, DB는 사용하지 않는다."""

import asyncio
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

import jwt
from fastapi import Request

from app.common import ApiError
from app.settings import Settings

ALLOWED_ALGS = ["ES256", "RS256"]
MSG_INVALID = "로그인 정보를 확인하지 못했어요. 다시 로그인해 주세요."
MSG_EXPIRED = MSG_INVALID
MSG_UNAVAILABLE = "로그인 확인이 잠시 안 돼요. 잠시 뒤 다시 시도해 주세요."


@dataclass(frozen=True)
class CurrentUser:
    id: UUID
    session_id: str | None


class JwksClient(Protocol):
    def get_signing_key_from_jwt(self, token: str) -> jwt.PyJWK: ...


class JwksUnavailableError(Exception):
    pass


class UnknownSigningKeyError(Exception):
    pass


class _JwksClient(jwt.PyJWKClient):
    def get_signing_keys(self, refresh: bool = False) -> list[jwt.PyJWK]:
        # 전송·JSON·키 집합 오류를 단계에서 구분한다. 메시지 문자열은 검사하지 않는다.
        try:
            return super().get_signing_keys(refresh)
        except (jwt.PyJWTError, ValueError, TypeError, KeyError, OSError) as exc:
            raise JwksUnavailableError from exc


def build_jwks_client(settings: Settings) -> JwksClient:
    # 빈 설정은 verify_access_token에서 거부하므로 이 주소로 조회하지 않는다.
    base = settings.supabase_url or "https://unconfigured.invalid"
    return _JwksClient(
        f"{base}/auth/v1/.well-known/jwks.json", cache_keys=False,
        cache_jwk_set=True, lifespan=600, timeout=3, cooldown_duration=30,
    )


def resolve_signing_key(client: JwksClient, token: str) -> jwt.PyJWK:
    header = jwt.get_unverified_header(token)
    kid = header.get("kid")
    if not isinstance(kid, str) or not kid or header.get("alg") not in ALLOWED_ALGS:
        raise jwt.InvalidTokenError
    try:
        return client.get_signing_key_from_jwt(token)
    except jwt.PyJWKClientConnectionError as exc:
        raise JwksUnavailableError from exc
    except jwt.PyJWKClientError as exc:
        # 실제 클라이언트의 조회 단계 오류는 위 어댑터가 이미 분리했다.
        raise UnknownSigningKeyError from exc


def parse_uuid_or_raise_invalid(value: str) -> UUID:
    try:
        return UUID(value)
    except (ValueError, TypeError, AttributeError) as exc:
        raise ApiError(401, "AUTH_INVALID", MSG_INVALID) from exc


async def verify_access_token(request: Request) -> CurrentUser:
    s = request.app.state.settings
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise ApiError(401, "AUTH_REQUIRED", "로그인이 필요해요.")
    token = header.removeprefix("Bearer ")
    if not s.supabase_url:
        raise ApiError(503, "AUTH_UNAVAILABLE", MSG_UNAVAILABLE)
    try:
        key = await asyncio.to_thread(resolve_signing_key, request.app.state.jwks_client, token)
    except JwksUnavailableError as exc:
        raise ApiError(503, "AUTH_UNAVAILABLE", MSG_UNAVAILABLE) from exc
    except (UnknownSigningKeyError, jwt.InvalidTokenError) as exc:
        raise ApiError(401, "AUTH_INVALID", MSG_INVALID) from exc
    try:
        claims = jwt.decode(
            token, key.key, algorithms=ALLOWED_ALGS, audience="authenticated",
            issuer=f"{s.supabase_url}/auth/v1", leeway=10,
            options={"require": ["exp", "iss", "aud", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise ApiError(401, "AUTH_EXPIRED", MSG_EXPIRED) from exc
    except jwt.PyJWTError as exc:
        raise ApiError(401, "AUTH_INVALID", MSG_INVALID) from exc
    if claims.get("role") != "authenticated":
        raise ApiError(401, "AUTH_INVALID", MSG_INVALID)
    user_id = parse_uuid_or_raise_invalid(claims["sub"])
    return CurrentUser(id=user_id, session_id=claims.get("session_id"))
