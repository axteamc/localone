"""방문 페이지 피드 게시물: 사진 올리기(#23)·게시(#24)·철회(#25). local-feed LOCAL-1."""

import asyncio
import io
import re
from types import SimpleNamespace
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.auth import CurrentUser, get_current_user, lock_active_user
from app.common import ApiError, now_kst
from app.db import run_db
from app.services.provider_engine import BookRecord, isbn13_is_valid

POST_IMAGE_MAX_BYTES = 10_000_000  # F5
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}  # F5
IMAGE_LONG_SIDE = 2048  # F3
JPEG_QUALITY = 85  # F3
OVERLAY_MAX = 80  # F15
BODY_MAX = 2000  # F15
COLOR_TOKENS = ("fill1", "fill2", "fill3", "cream", "paper", "inkStrong")  # F7

MSG_VALIDATION = "요청 형식이 올바르지 않아요."
MSG_NOT_FOUND = "찾을 수 없어요."
MSG_FORBIDDEN = "할 수 없는 요청이에요."
MSG_TOO_LARGE = "사진이 너무 커요."
MSG_STORAGE = "사진을 올리지 못했어요. 다시 시도해 주세요."

router = APIRouter(prefix="/api/v1")


def validation_error(field: str) -> ApiError:
    return ApiError(422, "VALIDATION_ERROR", MSG_VALIDATION, field)


# ─────────── #23 사진 올리기 ───────────


def reencode_without_exif(data: bytes) -> tuple[bytes, int, int]:
    """디코딩 → 방향 반영 → 긴 변 2048 → EXIF 없는 JPEG(품질 85). 읽을 수 없으면 422 image."""
    from PIL import Image, ImageOps

    try:
        with Image.open(io.BytesIO(data)) as src:
            src.load()
            img = ImageOps.exif_transpose(src)
            if img.mode != "RGB":
                img = img.convert("RGB")
            img.thumbnail((IMAGE_LONG_SIDE, IMAGE_LONG_SIDE))
            out = io.BytesIO()
            # exif·icc 등 원본 메타데이터를 넘기지 않는다(새 이미지로 저장 → 위치 정보 없음, NFR-05)
            img.save(out, format="JPEG", quality=JPEG_QUALITY)
            return out.getvalue(), img.width, img.height
    except Exception as exc:  # Pillow는 손상·형식 오류를 여러 예외로 낸다
        raise validation_error("image") from exc


@router.post("/uploads/post-images")
async def upload_post_image(
    request: Request,
    image: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
) -> JSONResponse:
    data = await image.read(POST_IMAGE_MAX_BYTES + 1)
    if len(data) > POST_IMAGE_MAX_BYTES:
        raise ApiError(413, "PAYLOAD_TOO_LARGE", MSG_TOO_LARGE)
    if image.content_type not in ALLOWED_TYPES:
        raise validation_error("image")
    jpeg, width, height = await asyncio.to_thread(reencode_without_exif, data)
    path = f"{user.id}/{uuid4()}.jpg"
    storage = request.app.state.post_storage
    try:
        await asyncio.to_thread(storage.put, path, jpeg, "image/jpeg")
    except Exception as exc:
        raise ApiError(503, "PROVIDER_UNAVAILABLE", MSG_STORAGE) from exc
    return JSONResponse(
        status_code=201,
        content={
            "image_path": path,
            "image_url": storage.public_url(path),
            "width": width,
            "height": height,
            "bytes": len(jpeg),
        },
    )


# ─────────── #24 게시 ───────────


def _clean_text(value: Any, limit: int) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("문자열이어야 해요")
    value = value.strip()
    if not value:
        return None
    if len(value) > limit:
        raise ValueError(f"{limit}자 이하여야 해요")
    return value


class PostCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")  # 본문의 user_id 등은 읽지 않는다

    client_request_id: UUID
    library_id: int
    isbn13: str | None = None
    image_kind: Literal["photo", "cover", "color"]
    image_path: str | None = None
    image_color: str | None = None
    overlay_text: str | None = None
    body: str | None = None

    @field_validator("overlay_text", mode="before")
    @classmethod
    def _overlay(cls, v: Any) -> str | None:
        return _clean_text(v, OVERLAY_MAX)

    @field_validator("body", mode="before")
    @classmethod
    def _body(cls, v: Any) -> str | None:
        return _clean_text(v, BODY_MAX)

    @field_validator("isbn13", "image_path", "image_color", mode="before")
    @classmethod
    def _blank_is_none(cls, v: Any) -> Any:
        if isinstance(v, str) and not v.strip():
            return None
        return v.strip() if isinstance(v, str) else v


def validate_kind_fields(body: PostCreate, user_id: UUID) -> None:
    """종류별 필수 값과 남의 사진 경로를 막는다(422, detail = 필드 이름)."""
    if body.library_id < 1:
        raise validation_error("library_id")
    if body.isbn13 is not None and not isbn13_is_valid(body.isbn13):
        raise validation_error("isbn13")
    if body.image_kind == "photo":
        own = re.compile(rf"^{re.escape(str(user_id))}/[0-9a-f-]{{36}}\.jpg$")
        if body.image_path is None or not own.match(body.image_path):
            raise validation_error("image_path")
    elif body.image_kind == "color":
        if body.image_color not in COLOR_TOKENS:
            raise validation_error("image_color")
    elif body.isbn13 is None:  # cover
        raise validation_error("isbn13")


POST_COLUMNS = (
    "p.id, p.user_id, p.library_id, p.image_kind, p.image_value, p.overlay_text, p.body, "
    "p.status, p.published_at, l.name AS library_name, b.isbn13 AS book_isbn13, "
    "b.title AS book_title, b.author AS book_author, b.cover_url AS book_cover_url, "
    "COALESCE(up.nickname, '이웃') AS nickname"
)
POST_JOINS = (
    "FROM posts p JOIN libraries l ON l.id = p.library_id "
    "LEFT JOIN books b ON b.id = p.book_id "
    "LEFT JOIN user_profiles up ON up.user_id = p.user_id"
)

INSERT_POST_ON_CONFLICT_DO_NOTHING_RETURNING = text(
    "INSERT INTO posts (user_id, library_id, book_id, image_kind, image_value, overlay_text, body, "
    "client_request_id) VALUES (:uid, :library_id, :book_id, :image_kind, :image_value, :overlay_text, "
    ":body, :rid) ON CONFLICT (user_id, client_request_id) DO NOTHING RETURNING id"
)
SELECT_BY_CLIENT_REQUEST_ID = text(
    "SELECT id FROM posts WHERE user_id = :uid AND client_request_id = :rid"
)


def select_post(c: Connection, post_id: UUID) -> Any:
    return c.execute(text(f"SELECT {POST_COLUMNS} {POST_JOINS} WHERE p.id = :id"), {"id": post_id}).one_or_none()


def params(body: PostCreate, user_id: UUID, book: BookRecord | None) -> dict[str, Any]:
    if body.image_kind == "photo":
        value = body.image_path
    elif body.image_kind == "cover":
        assert book is not None and book.cover_url is not None
        value = book.cover_url
    else:
        value = body.image_color
    return {
        "uid": user_id,
        "library_id": body.library_id,
        "book_id": book.id if book is not None else None,
        "image_kind": body.image_kind,
        "image_value": value,
        "overlay_text": body.overlay_text,
        "body": body.body,
        "rid": body.client_request_id,
    }


def with_image_url(request: Request, row: Any) -> SimpleNamespace:
    """조회 행에 공개 이미지 주소를 붙인다. photo: 저장소 주소, cover: 책 표지 주소, color: None."""
    if row.image_kind == "photo":
        url = request.app.state.post_storage.public_url(row.image_value)
    elif row.image_kind == "cover":
        url = row.image_value
    else:
        url = None
    return SimpleNamespace(**row._mapping, image_url=url)


def post_public(
    row: Any,
    *,
    viewer: CurrentUser | None,
    nickname: str,
    reaction_count: int,
    my_reaction: bool,
    my_bookmark: bool,
) -> dict[str, Any]:
    """#24·#27 응답 `Post` 모양(C3). user_id는 넣지 않는다."""
    book = None
    if row.book_isbn13 is not None:
        book = {
            "isbn13": row.book_isbn13,
            "title": row.book_title,
            "author": row.book_author,
            "cover_url": row.book_cover_url,
        }
    return {
        "id": str(row.id),
        "library": {"id": int(row.library_id), "name": row.library_name},
        "book": book,
        "image_kind": row.image_kind,
        "image_url": row.image_url,
        "image_color": row.image_value if row.image_kind == "color" else None,
        "overlay_text": row.overlay_text,
        "body": row.body,
        "author": {"nickname": nickname},
        "is_mine": viewer is not None and viewer.id == row.user_id,
        "reaction_count": reaction_count,
        "my_reaction": my_reaction if viewer is not None else False,
        "my_bookmark": my_bookmark if viewer is not None else False,
        "published_at": now_kst(row.published_at).isoformat(timespec="seconds"),
    }


async def _book_for(request: Request, isbn13: str) -> BookRecord:
    try:
        return await request.app.state.provider_engine.get_book(isbn13)
    except ApiError as exc:
        if exc.status_code == 404:
            raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND, "isbn13") from exc
        raise


@router.post("/posts")
async def create_post(
    request: Request, body: PostCreate, user: CurrentUser = Depends(get_current_user)
) -> JSONResponse:
    validate_kind_fields(body, user.id)
    # 책 조회는 외부 I/O라 트랜잭션 밖(404·429·503)
    book = await _book_for(request, body.isbn13) if body.isbn13 else None
    if body.image_kind == "cover" and (book is None or book.cover_url is None):
        raise validation_error("image_kind")

    def tx(c: Connection) -> tuple[Any, bool]:
        lock_active_user(c, user.id)
        if not c.execute(text("SELECT 1 FROM libraries WHERE id = :id"), {"id": body.library_id}).first():
            raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND, "library_id")
        inserted = c.execute(INSERT_POST_ON_CONFLICT_DO_NOTHING_RETURNING, params(body, user.id, book)).first()
        created = inserted is not None
        post_id = inserted.id if created else c.execute(
            SELECT_BY_CLIENT_REQUEST_ID, {"uid": user.id, "rid": body.client_request_id}
        ).scalar_one()
        return select_post(c, post_id), created

    row, created = await run_db(request.app.state.engine, tx)
    content = post_public(
        with_image_url(request, row),
        viewer=user,
        nickname=row.nickname,
        reaction_count=0,  # 공감·북마크 표는 LOCAL-2에서 생긴다. 막 만든 글은 0·false
        my_reaction=False,
        my_bookmark=False,
    )
    return JSONResponse(status_code=201 if created else 200, content=content)


# ─────────── #25 철회 ───────────


@router.post("/posts/{post_id}/withdraw")
async def withdraw_post(
    request: Request, post_id: UUID, user: CurrentUser = Depends(get_current_user)
) -> dict[str, str]:
    def tx(c: Connection) -> None:
        lock_active_user(c, user.id)
        row = c.execute(
            text("SELECT user_id, status FROM posts WHERE id = :id FOR UPDATE"), {"id": post_id}
        ).one_or_none()
        if row is None:
            raise ApiError(404, "NOT_FOUND", MSG_NOT_FOUND, "post_id")
        if row.user_id != user.id:
            raise ApiError(403, "FORBIDDEN", MSG_FORBIDDEN)
        if row.status != "withdrawn":
            c.execute(
                text("UPDATE posts SET status = 'withdrawn', updated_at = now() WHERE id = :id"),
                {"id": post_id},
            )

    await run_db(request.app.state.engine, tx)
    return {"id": str(post_id), "status": "withdrawn"}
