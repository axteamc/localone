"""NFR-05: Uvicorn 접근 로그에서 요청 쿼리를 기록 전에 제거한다."""
import logging


class CoordinatePrivacyFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        # Uvicorn access: (client, method, path_with_query, version, status).
        if isinstance(record.args, tuple) and len(record.args) == 5:
            args = list(record.args)
            args[2] = str(args[2]).split("?", 1)[0]
            record.args = tuple(args)
        return True


def install_coordinate_privacy_filter() -> None:
    logger = logging.getLogger("uvicorn.access")
    if not any(isinstance(f, CoordinatePrivacyFilter) for f in logger.filters):
        logger.addFilter(CoordinatePrivacyFilter())
