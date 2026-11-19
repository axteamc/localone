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
    data4library_api_key: str = ""
    data4library_api_base_url: str = "http://data4library.kr/api"
    kakao_rest_api_key: str = ""  # 카카오 책 검색(REST API 키). 지도용 JavaScript 키와 다르다
    kakao_api_base_url: str = "https://dapi.kakao.com/v3/search"
    # 게시물 사진 저장소(local-feed LOCAL-1 F4). 키가 없으면 기기 메모리 저장소를 쓴다(시험·로컬)
    supabase_service_role_key: str = ""
    post_image_bucket: str = "post-images"
    # AUTH-2 G3: 토큰의 session_id가 Supabase auth.sessions에 살아 있는지 본다(로그아웃한 세션 거부).
    # 시험 DB(postgres:17)에는 auth 스키마가 없어 local·test 기본값은 꺼 둔다.
    # 값을 주지 않으면 production은 켜고, production에서 명시적으로 끄면 시작하지 않는다.
    auth_session_check: bool | None = None  # 아래 검사에서 True/False로 정해진다
    # 배포 웹 프런트엔드 출처(쉼표 구분). 비어 있으면 production에서 CORS를 켜지 않는다.
    cors_allowed_origins: str = ""

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
        if self.app_env == "production" and not self.supabase_service_role_key:
            raise ValueError("production에서는 SUPABASE_SERVICE_ROLE_KEY가 필요해요")
        if self.auth_session_check is None:
            self.auth_session_check = self.app_env == "production"
        if self.app_env == "production" and not self.auth_session_check:
            raise ValueError("production에서는 AUTH_SESSION_CHECK=true가 필요해요")
        return self


def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # 값은 환경 변수에서 읽는다
