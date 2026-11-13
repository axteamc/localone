"""환경 변수 읽기·검증. 필수 값이 없거나 잘못되면 서버는 시작하지 않는다."""

from pathlib import Path
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

LOCAL_HOSTS = {"localhost", "127.0.0.1"}

# 개발용 CORS: 로컬 출처만(Expo 웹 개발 서버 http://localhost:8081 등). 정규식은 전체 일치로 검사돼
# http://localhost.evil.com 같은 출처는 통과하지 못한다. production에서는 CORS를 켜지 않는다.
LOCAL_ORIGIN_REGEX = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"
CORS_ENVS = {"local", "test"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        extra="ignore",
    )

    app_env: Literal["local", "test", "production"]
    database_url: str
    supabase_url: str = ""

    @model_validator(mode="after")
    def _check_database_url(self) -> "Settings":
        try:
            host = make_url(self.database_url).host
        except Exception as exc:
            raise ValueError("DATABASE_URL 형식이 올바르지 않아요") from exc
        if self.app_env == "test" and host not in LOCAL_HOSTS:
            # 시험이 원격·운영 DB에 붙는 사고를 막는다(PROJECT.md §3-8)
            raise ValueError("APP_ENV=test에서는 localhost·127.0.0.1 DB만 쓸 수 있어요")
        if self.app_env == "production" and not self.supabase_url:
            raise ValueError("production에서는 SUPABASE_URL이 필요해요")
        return self


def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # 값은 환경 변수에서 읽는다
