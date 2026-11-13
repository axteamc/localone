"""모든 기능이 쓰는 공통 함수: 오류 응답 형식, 서울(KST) 날짜."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi.responses import JSONResponse

KST = ZoneInfo("Asia/Seoul")


class ApiError(Exception):
    def __init__(self, status_code: int, code: str, message: str, detail: str = ""):
        super().__init__(message)
        self.status_code, self.code = status_code, code
        self.message, self.detail = message, detail


def error_response(status_code: int, code: str, message: str, detail: str = "") -> JSONResponse:
    """모든 API 오류는 이 형식 하나만 쓴다(PROJECT.md §3-5)."""
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "detail": detail}},
    )


def now_kst(now: datetime | None = None) -> datetime:
    """서울 현재 시각. 시험에서는 now를 넘겨 시각을 고정한다."""
    if now is None:
        return datetime.now(KST)
    if now.tzinfo is None:
        raise ValueError("now는 시간대(tzinfo)가 있어야 해요")
    return now.astimezone(KST)


def today_kst(now: datetime | None = None) -> date:
    """서버 시계 기준 Asia/Seoul 날짜. 기기 시각은 쓰지 않는다(PROJECT.md §3-6)."""
    return now_kst(now).date()
