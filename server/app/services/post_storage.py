"""게시물 사진 저장소 어댑터(local-feed LOCAL-1 F4).

운영: Supabase Storage 버킷(`post_image_bucket`, 공개 읽기). 키가 없는 시험·로컬은 메모리 저장소.
"""

import base64
import threading
import urllib.error
import urllib.request
from typing import Protocol
from urllib.parse import quote

from app.settings import Settings

STORAGE_TIMEOUT_SECONDS = 10


class PostImageStorage(Protocol):
    def put(self, path: str, data: bytes, content_type: str) -> None: ...

    def public_url(self, path: str) -> str: ...


class SupabasePostImageStorage:
    def __init__(self, base_url: str, service_role_key: str, bucket: str):
        self.base_url = base_url.rstrip("/")
        self.service_role_key = service_role_key
        self.bucket = bucket

    def put(self, path: str, data: bytes, content_type: str) -> None:
        req = urllib.request.Request(
            f"{self.base_url}/storage/v1/object/{self.bucket}/{quote(path)}",
            data=data,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.service_role_key}",
                "apikey": self.service_role_key,
                "Content-Type": content_type,
                "x-upsert": "false",
            },
        )
        with urllib.request.urlopen(req, timeout=STORAGE_TIMEOUT_SECONDS) as resp:  # 실패는 호출 쪽에서 503
            if resp.status >= 300:
                raise urllib.error.HTTPError(req.full_url, resp.status, "storage put failed", resp.headers, None)

    def public_url(self, path: str) -> str:
        return f"{self.base_url}/storage/v1/object/public/{self.bucket}/{quote(path)}"


class MemoryPostImageStorage:
    """시험·키 미설정 환경용. 공개 주소는 저장한 바이트의 data URL(서버를 다시 켜면 사라진다)."""

    def __init__(self) -> None:
        self.files: dict[str, tuple[bytes, str]] = {}
        self._lock = threading.Lock()

    def put(self, path: str, data: bytes, content_type: str) -> None:
        with self._lock:
            self.files[path] = (data, content_type)

    def public_url(self, path: str) -> str:
        with self._lock:
            stored = self.files.get(path)
        if stored is None:
            return f"memory://post-images/{path}"
        data, content_type = stored
        return f"data:{content_type};base64,{base64.b64encode(data).decode('ascii')}"


def build_post_storage(settings: Settings) -> PostImageStorage:
    if settings.supabase_url and settings.supabase_service_role_key:
        return SupabasePostImageStorage(
            settings.supabase_url, settings.supabase_service_role_key, settings.post_image_bucket
        )
    return MemoryPostImageStorage()
