from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, HttpUrl

from api.auth import CurrentUser, require_user
from api.services.extraction import extract_source

router = APIRouter(prefix="/v1/sources", tags=["sources"])


class ExtractRequest(BaseModel):
    url: HttpUrl


class ExtractResponse(BaseModel):
    url: str
    title: str
    text: str


@router.post("/extract", response_model=ExtractResponse)
def extract(payload: ExtractRequest, _user: CurrentUser = Depends(require_user)) -> ExtractResponse:
    try:
        result = extract_source(str(payload.url))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception as exc:  # network/HTML failures
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Source extraction failed. The remote site may be blocking requests.",
        ) from exc
    return ExtractResponse(**result)
