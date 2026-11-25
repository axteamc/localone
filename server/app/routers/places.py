from typing import Annotated

from fastapi import APIRouter, Request
from pydantic import BaseModel, StringConstraints

from app.services.provider_engine import search_places

router = APIRouter()


class PlaceSearch(BaseModel):
    query: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]


@router.post("/api/v1/places/search")
def places(body: PlaceSearch, request: Request):
    return {"items": search_places(body.query, request.app.state.settings.kakao_rest_api_key)}
