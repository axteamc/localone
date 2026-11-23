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

from app.auth import JwksClient, build_jwks_client, router as auth_router
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

    app.include_router(auth_router)
    from app.routers.me import router as me_router  # AUTH-3 탈퇴

    app.include_router(me_router)
    # ── [/auth-D] ──

    if settings.app_env in CORS_ENVS:
        # 웹 스모크(브라우저)가 로컬 서버를 부를 수 있게 한다. 인증은 헤더(JWT)라 쿠키 자격 증명은 허용하지 않는다
        app.add_middleware(
            CORSMiddleware,
            allow_origin_regex=LOCAL_ORIGIN_REGEX,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=["Authorization", "Content-Type"],
        )
    else:
        allowed_origins = [o.strip() for o in settings.cors_allowed_origins.split(",") if o.strip()]
        if allowed_origins:
            app.add_middleware(
                CORSMiddleware,
                allow_origins=allowed_origins,
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
        fields = sorted({str(e["loc"][-1]) if e.get("loc") else "body" for e in exc.errors()})
        return error_response(422, "VALIDATION_ERROR", "요청 형식이 올바르지 않아요.", ",".join(fields))

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        logger.exception("처리하지 못한 예외")  # 내용은 로그에만, 응답 detail에는 넣지 않는다
        return error_response(500, "INTERNAL_ERROR", "문제가 생겼어요.")

    # ── [lib-D] ──
    from app.routers.books import router as books_router
    from app.routers.libraries import router as libraries_router
    from app.routers.library_privacy import install_coordinate_privacy_filter
    from app.services.provider_engine import ProviderEngine, build_providers

    install_coordinate_privacy_filter()
    app.state.provider_engine = ProviderEngine(engine, build_providers(settings))
    app.include_router(libraries_router)
    app.include_router(books_router)

    # ── [/lib-D] ──

    # ── [local-feed-B] ──
    from app.routers.posts import router as posts_router
    from app.services.post_storage import build_post_storage

    app.state.post_storage = build_post_storage(settings)
    app.include_router(posts_router)
    from app.routers.feed import router as feed_router

    app.include_router(feed_router)
    from app.routers.reactions import router as reactions_router

    app.include_router(reactions_router)
    from app.routers.guestbook import router as guestbook_router

    app.include_router(guestbook_router)
    # ── [/local-feed-B] ──

    # ── [book-search-C] ──
    from app.routers.loan_plans import router as loan_plans_router

    app.include_router(loan_plans_router)
    # ── [/book-search-C] ──

    # ── [loan-assistant-C] ──
    from app.routers.loans import router as loans_router

    app.include_router(loans_router)
    # ── [/loan-assistant-C] ──

    # ── [my-collection-A] ──
    from app.routers.my_collection import router as my_collection_router

    app.include_router(my_collection_router)
    # ── [/my-collection-A] ──

    # ── [reading-log-A] ──
    from app.routers.reading_logs import router as reading_logs_router  # READ-1 #41~#45

    app.include_router(reading_logs_router)
    # ── [/reading-log-A] ──

    # ── [m2-core-D] ──
    from app.routers.inbox import router as inbox_router  # M2-0-P1 알림함 #47~#49

    app.include_router(inbox_router)
    from app.routers.ops import router as ops_router  # M2-0-P2 운영 경로 /ops/*

    app.include_router(ops_router)
    from app.routers.settings import router as settings_router  # M2-0-P4 반납 집계 동의

    app.include_router(settings_router)
    # ── [/m2-core-D] ──

    return app


def __getattr__(name: str) -> FastAPI:
    # `uvicorn app.main:app`용. import만으로는 설정을 읽지 않아 시험에서 create_app을 직접 쓴다
    if name == "app":
        application = create_app()
        globals()["app"] = application
        return application
    raise AttributeError(name)
