"""PostImageStorage.exists(path) 단위 시험 — D 선행 패치(MY-2-P1 아바타 발급 경로 확인용)."""

import urllib.error
import urllib.request
from email.message import Message
from unittest.mock import MagicMock, patch

import pytest

from app.services.post_storage import MemoryPostImageStorage, SupabasePostImageStorage


class _FakeResponse:
    def __init__(self, status: int) -> None:
        self.status = status

    def __enter__(self) -> "_FakeResponse":
        return self

    def __exit__(self, *args: object) -> None:
        return None


def test_memory_storage_exists_tracks_uploaded_paths() -> None:
    storage = MemoryPostImageStorage()
    path = "avatars/00000000-0000-4000-8000-00000000000a/11111111-1111-4111-8111-111111111111.jpg"
    other = "avatars/00000000-0000-4000-8000-00000000000a/22222222-2222-4222-8222-222222222222.jpg"

    assert storage.exists(path) is False
    storage.put(path, b"jpeg-bytes", "image/jpeg")
    assert storage.exists(path) is True
    assert storage.exists(other) is False


def test_supabase_storage_exists_returns_true_on_200_with_head_auth() -> None:
    storage = SupabasePostImageStorage("https://proj.supabase.co/", "service-key", "post-images")
    captured: list[urllib.request.Request] = []

    def fake_urlopen(req: urllib.request.Request, timeout: int) -> _FakeResponse:
        captured.append(req)
        assert timeout > 0
        return _FakeResponse(200)

    with patch("urllib.request.urlopen", side_effect=fake_urlopen):
        assert storage.exists("avatars/u1/file 1.jpg") is True

    assert len(captured) == 1
    req = captured[0]
    assert req.get_method() == "HEAD"
    assert req.full_url == "https://proj.supabase.co/storage/v1/object/authenticated/post-images/avatars/u1/file%201.jpg"
    assert req.get_header("Authorization") == "Bearer service-key"
    assert req.get_header("Apikey") == "service-key"


def test_supabase_storage_exists_returns_false_on_404() -> None:
    storage = SupabasePostImageStorage("https://proj.supabase.co", "service-key", "post-images")
    err = urllib.error.HTTPError("https://proj.supabase.co/x", 404, "Not Found", Message(), None)

    with patch("urllib.request.urlopen", side_effect=err):
        assert storage.exists("avatars/u1/missing.jpg") is False


def test_supabase_storage_exists_reraises_server_and_network_errors() -> None:
    storage = SupabasePostImageStorage("https://proj.supabase.co", "service-key", "post-images")
    err_503 = urllib.error.HTTPError("https://proj.supabase.co/x", 503, "Unavailable", Message(), None)

    with patch("urllib.request.urlopen", side_effect=err_503):
        with pytest.raises(urllib.error.HTTPError):
            storage.exists("avatars/u1/a.jpg")

    with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("down")):
        with pytest.raises(urllib.error.URLError):
            storage.exists("avatars/u1/a.jpg")


def test_supabase_storage_read_bounds_the_body_and_uses_the_configured_bucket() -> None:
    storage = SupabasePostImageStorage("https://proj.supabase.co", "service-key", "post-images")
    body = MagicMock()
    body.__enter__.return_value.read.return_value = b"image"
    with patch("urllib.request.urlopen", return_value=body) as open_url:
        assert storage.read("avatars/u1/a.jpg", 4) == b"image"
    open_url.assert_called_once_with(
        "https://proj.supabase.co/storage/v1/object/public/post-images/avatars/u1/a.jpg", timeout=10,
    )
    body.__enter__.return_value.read.assert_called_once_with(5)

    missing = urllib.error.HTTPError("https://proj.supabase.co/x", 404, "Not Found", Message(), None)
    with patch("urllib.request.urlopen", side_effect=missing):
        assert storage.read("avatars/u1/a.jpg", 4) is None
