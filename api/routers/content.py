from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from openai import APIError, APITimeoutError, RateLimitError
from pydantic import BaseModel, Field

from api.auth import CurrentUser, require_user
from api.config import Settings, get_settings
from api.services.review import review_studio_draft
from api.services.generation import (
    BrandContext,
    GenerationError,
    MAX_CUSTOM,
    MAX_SOURCE_BODY,
    MAX_IDEAS,
    MIN_IDEAS,
    MAX_THEME,
    GeneratedContent,
    generate_content_ideas,
    generate_refinement,
    generate_repurpose,
    generate_studio_draft,
    generate_variations,
    assert_discovery_count,
    assert_discovery_objective,
    assert_repurpose_target,
    assert_supported,
    allowed_idea_platforms,
    validate_source_draft,
)
from api.services.throttle import generation_throttle

router = APIRouter(prefix="/v1/content", tags=["content"])


class GenerateRequest(BaseModel):
    platform: str
    content_format: str = Field(..., alias="format")
    topic: str = Field(..., min_length=1, max_length=400)
    key_points: str = Field(default="", max_length=4000)
    call_to_action: str = Field(default="", max_length=300)
    keywords: str = Field(default="", max_length=300)
    extra_instructions: str = Field(default="", max_length=4000)
    brand: Optional[BrandContext] = None

    model_config = {"populate_by_name": True}


class SourceDraft(GeneratedContent):
    title: str = Field(..., min_length=1, max_length=300)
    body: str = Field(default="", max_length=MAX_SOURCE_BODY)


class RefineRequest(BaseModel):
    platform: str
    content_format: str = Field(..., alias="format")
    source: SourceDraft
    action: str
    custom_instructions: str = Field(default="", max_length=MAX_CUSTOM)
    brand: Optional[BrandContext] = None

    model_config = {"populate_by_name": True}


class VariationsRequest(BaseModel):
    platform: str
    content_format: str = Field(..., alias="format")
    source: SourceDraft
    custom_instructions: str = Field(default="", max_length=MAX_CUSTOM)
    brand: Optional[BrandContext] = None

    model_config = {"populate_by_name": True}


class RepurposeRequest(BaseModel):
    source_platform: str
    source_format: str
    target_platform: str
    target_format: str
    source: SourceDraft
    custom_instructions: str = Field(default="", max_length=MAX_CUSTOM)
    brand: Optional[BrandContext] = None


class GenerateResponse(BaseModel):
    platform: str
    format: str
    title: str
    body: str
    hashtags: list[str]
    slides: list[dict[str, Any]]
    script: Optional[dict[str, str]]
    status: str
    model: str


class VariationsResponse(BaseModel):
    alternatives: list[GenerateResponse]


class IdeasRequest(BaseModel):
    count: int = Field(default=5, ge=MIN_IDEAS, le=MAX_IDEAS)
    theme: str = Field(default="", max_length=MAX_THEME)
    platform: str = Field(default="")
    objective: str = Field(default="")
    brand: Optional[BrandContext] = None


class IdeaResponse(BaseModel):
    title: str
    concept: str
    why_relevant: str
    angle: str
    hook: str
    format: str
    call_to_action: str
    pillar: str
    platform: str
    status: str
    model: str


class IdeasResponse(BaseModel):
    ideas: list[IdeaResponse]
    disclaimer: str


class ReviewRequest(BaseModel):
    platform: str
    content_format: str = Field(..., alias="format")
    source: SourceDraft
    brand: Optional[BrandContext] = None

    model_config = {"populate_by_name": True}


class ReviewDimensionResponse(BaseModel):
    key: str
    score: int
    applicable: bool
    explanation: str
    evidence: str
    improvement: str
    suggested_refine_action: str


class ReviewResponse(BaseModel):
    overall_score: int
    dimensions: list[ReviewDimensionResponse]
    strengths: list[str]
    improvements: list[str]
    recommendations: list[str]
    readiness: str
    scoring_notes: str
    disclaimer: str
    limited_context: list[str]
    platform: str
    format: str
    model: str


def _to_response(result: dict[str, Any]) -> GenerateResponse:
    return GenerateResponse(
        platform=result["platform"],
        format=result["format"],
        title=result["title"],
        body=result["body"],
        hashtags=result.get("hashtags") or [],
        slides=result.get("slides") or [],
        script=result.get("script"),
        status=result["status"],
        model=result["model"],
    )


def _require_openai(user: CurrentUser, settings: Settings) -> None:
    if not settings.openai_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OpenAI is not configured. Set OPENAI_API_KEY on the API server.",
        )
    if not generation_throttle.allow(user.id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many generate requests. Wait a minute and try again.",
        )


def _run_model(producer: Callable[[], Any]) -> Any:
    try:
        return producer()
    except GenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The writing service returned a draft we could not use. Try again.",
        ) from exc
    except RateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="The writing service is busy. Try again shortly.",
        ) from exc
    except APITimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="The writing service timed out. Try a shorter brief.",
        ) from exc
    except APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Draft generation failed. Check OPENAI_API_KEY and model access on the server.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Draft generation failed. Try again.",
        ) from exc


@router.post("/generate", response_model=GenerateResponse)
def generate(
    payload: GenerateRequest,
    user: CurrentUser = Depends(require_user),
    settings: Settings = Depends(get_settings),
) -> GenerateResponse:
    try:
        assert_supported(payload.platform, payload.content_format)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    _require_openai(user, settings)
    result = _run_model(
        lambda: generate_studio_draft(
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            platform=payload.platform,
            content_format=payload.content_format,
            topic=payload.topic,
            key_points=payload.key_points,
            call_to_action=payload.call_to_action,
            keywords=payload.keywords,
            extra_instructions=payload.extra_instructions,
            brand=payload.brand,
        )
    )
    return _to_response(result)


@router.post("/refine", response_model=GenerateResponse)
def refine(
    payload: RefineRequest,
    user: CurrentUser = Depends(require_user),
    settings: Settings = Depends(get_settings),
) -> GenerateResponse:
    try:
        assert_supported(payload.platform, payload.content_format)
        validate_source_draft(payload.source.model_dump(), payload.content_format)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    _require_openai(user, settings)
    result = _run_model(
        lambda: generate_refinement(
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            platform=payload.platform,
            content_format=payload.content_format,
            source=payload.source.model_dump(),
            action=payload.action,
            custom_instructions=payload.custom_instructions,
            brand=payload.brand,
        )
    )
    return _to_response(result)


@router.post("/variations", response_model=VariationsResponse)
def variations(
    payload: VariationsRequest,
    user: CurrentUser = Depends(require_user),
    settings: Settings = Depends(get_settings),
) -> VariationsResponse:
    try:
        assert_supported(payload.platform, payload.content_format)
        validate_source_draft(payload.source.model_dump(), payload.content_format)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    _require_openai(user, settings)
    results = _run_model(
        lambda: generate_variations(
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            platform=payload.platform,
            content_format=payload.content_format,
            source=payload.source.model_dump(),
            custom_instructions=payload.custom_instructions,
            brand=payload.brand,
        )
    )
    return VariationsResponse(alternatives=[_to_response(item) for item in results])


@router.post("/repurpose", response_model=GenerateResponse)
def repurpose(
    payload: RepurposeRequest,
    user: CurrentUser = Depends(require_user),
    settings: Settings = Depends(get_settings),
) -> GenerateResponse:
    try:
        assert_repurpose_target(
            payload.source_platform,
            payload.source_format,
            payload.target_platform,
            payload.target_format,
        )
        validate_source_draft(payload.source.model_dump(), payload.source_format)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    _require_openai(user, settings)
    result = _run_model(
        lambda: generate_repurpose(
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            source_platform=payload.source_platform,
            source_format=payload.source_format,
            target_platform=payload.target_platform,
            target_format=payload.target_format,
            source=payload.source.model_dump(),
            custom_instructions=payload.custom_instructions,
            brand=payload.brand,
        )
    )
    return _to_response(result)


@router.post("/ideas", response_model=IdeasResponse)
def ideas(
    payload: IdeasRequest,
    user: CurrentUser = Depends(require_user),
    settings: Settings = Depends(get_settings),
) -> IdeasResponse:
    try:
        assert_discovery_count(payload.count)
        assert_discovery_objective(payload.objective)
        allowed_idea_platforms(payload.brand, payload.platform)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    _require_openai(user, settings)
    results = _run_model(
        lambda: generate_content_ideas(
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            count=payload.count,
            theme=payload.theme,
            platform=payload.platform,
            objective=payload.objective,
            brand=payload.brand,
        )
    )
    return IdeasResponse(
        ideas=[IdeaResponse.model_validate(item) for item in results],
        disclaimer="AI-generated suggestions, not proven performance predictions.",
    )


@router.post("/review", response_model=ReviewResponse)
def review(
    payload: ReviewRequest,
    user: CurrentUser = Depends(require_user),
    settings: Settings = Depends(get_settings),
) -> ReviewResponse:
    try:
        assert_supported(payload.platform, payload.content_format)
        validate_source_draft(payload.source.model_dump(), payload.content_format)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    _require_openai(user, settings)
    result = _run_model(
        lambda: review_studio_draft(
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            platform=payload.platform,
            content_format=payload.content_format,
            source=payload.source.model_dump(),
            brand=payload.brand,
        )
    )
    return ReviewResponse.model_validate(result)
