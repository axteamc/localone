"""앱 만들기, GET /api/v1/ready, 오류 처리기."""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy import create_engine
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.auth import JwksClient, build_jwks_client
from app.common import ApiError, error_response, now_kst
from app.settings import CORS_ENVS, LOCAL_ORIGIN_REGEX, Settings, get_settings

logger = logging.getLogger("localone")
DB_TIMEOUT_SECONDS = 2

HTTP_ERRORS = {
    404: ("NOT_FOUND", "찾을 수 없어요."),
    405: ("METHOD_NOT_ALLOWED", "허용되지 않는 요청 방식이에요."),
}


def create_app(
    settings: Settings | None = None, jwks_client: JwksClient | None = None
) -> FastAPI:
    settings = settings or get_settings()
    # psycopg 비동기는 Windows의 uvicorn 기본 루프(Proactor)에서 동작하지 않아,
    # 동기 엔진을 스레드에서 쓴다. 엔진은 만들기만 하고 시작 때 DB에 연결하지 않는다(DB가 없어도 서버는 시작)
    engine = create_engine(
        settings.database_url,
        connect_args={"connect_timeout": DB_TIMEOUT_SECONDS},
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield
        engine.dispose()

    app = FastAPI(
        title="localone", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None
    )
    app.state.settings = settings
    app.state.engine = engine

    # ── [auth-D] ──
    app.state.jwks_client = jwks_client if jwks_client is not None else build_jwks_client(settings)

    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError):
        return error_response(exc.status_code, exc.code, exc.message, exc.detail)
    # ── [/auth-D] ──

    if settings.app_env in CORS_ENVS:
        # 웹 스모크(브라우저)가 로컬 서버를 부를 수 있게 한다. 인증은 헤더(JWT)라 쿠키 자격 증명은 허용하지 않는다
        app.add_middleware(
            CORSMiddleware,
            allow_origin_regex=LOCAL_ORIGIN_REGEX,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=["Authorization", "Content-Type"],
        )

    def _ping() -> None:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

    @app.get("/api/v1/ready")
    async def ready() -> Any:
        try:
            await asyncio.wait_for(asyncio.to_thread(_ping), DB_TIMEOUT_SECONDS)
        except TimeoutError:
            return error_response(503, "DB_TIMEOUT", "데이터베이스 응답이 늦어요.")
        except Exception:
            logger.exception("DB 연결 실패")
            return error_response(503, "DB_UNAVAILABLE", "데이터베이스에 연결하지 못했어요.")
        return {"status": "ok", "db": "ok", "checked_at": now_kst().isoformat(timespec="seconds")}

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException):
        code, message = HTTP_ERRORS.get(exc.status_code, ("HTTP_ERROR", "요청을 처리하지 못했어요."))
        return error_response(exc.status_code, code, message)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError):
        return error_response(422, "VALIDATION_ERROR", "요청 형식이 올바르지 않아요.")

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        logger.exception("처리하지 못한 예외")  # 내용은 로그에만, 응답 detail에는 넣지 않는다
        return error_response(500, "INTERNAL_ERROR", "문제가 생겼어요.")

    return app


def __getattr__(name: str) -> FastAPI:
    # `uvicorn app.main:app`용. import만으로는 설정을 읽지 않아 시험에서 create_app을 직접 쓴다
    if name == "app":
        application = create_app()
        globals()["app"] = application
        return application
    raise AttributeError(name)
