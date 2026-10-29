from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field, ValidationError, field_validator

from api.services.generation import (
    BrandContext,
    GenerationError,
    GeneratedContent,
    OpenAICreate,
    REFINE_ACTIONS,
    assert_supported,
    build_brand_block,
    request_json_completion,
    serialize_source,
    validate_source_draft,
)

REVIEW_DIMENSIONS = (
    "hook",
    "clarity",
    "audience",
    "voice",
    "value",
    "platform_fit",
    "cta",
)

DIMENSION_WEIGHTS: dict[str, int] = {
    "hook": 16,
    "clarity": 18,
    "audience": 14,
    "voice": 14,
    "value": 16,
    "platform_fit": 12,
    "cta": 10,
}

DIMENSION_LABELS: dict[str, str] = {
    "hook": "Hook and opening",
    "clarity": "Clarity and readability",
    "audience": "Audience relevance",
    "voice": "Brand voice and consistency",
    "value": "Value and substance",
    "platform_fit": "Platform and format fit",
    "cta": "Call to action and conclusion",
}

assert sum(DIMENSION_WEIGHTS.values()) == 100


class ReviewDimension(BaseModel):
    key: str
    score: int = Field(ge=0, le=100)
    applicable: bool = True
    explanation: str
    evidence: str = ""
    improvement: str = ""
    suggested_refine_action: str = ""

    @field_validator("key")
    @classmethod
    def known_key(cls, value: str) -> str:
        key = value.strip().lower()
        if key not in DIMENSION_WEIGHTS:
            raise ValueError(f"Unknown review dimension: {value}")
        return key

    @field_validator("explanation", "evidence", "improvement")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return (value or "").strip()[:600]

    @field_validator("suggested_refine_action")
    @classmethod
    def allowlisted_action(cls, value: str) -> str:
        key = (value or "").strip().lower()
        if not key:
            return ""
        if key not in REFINE_ACTIONS:
            return ""
        return key


class QualityReview(BaseModel):
    overall_score: int = Field(ge=0, le=100)
    dimensions: list[ReviewDimension]
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    readiness: str
    scoring_notes: str
    disclaimer: str
    limited_context: list[str] = Field(default_factory=list)


def brand_context_gaps(brand: Optional[BrandContext]) -> list[str]:
    profile = brand or BrandContext()
    gaps: list[str] = []
    if not (profile.audience or "").strip():
        gaps.append("audience")
    if not (profile.tone or profile.custom_tone or profile.writing_style or "").strip():
        gaps.append("voice")
    if not (profile.niche or profile.bio or "").strip():
        gaps.append("positioning")
    return gaps


def compute_overall_score(dimensions: list[ReviewDimension]) -> int:
    scored = [item for item in dimensions if item.applicable]
    if not scored:
        return 0
    weight_total = sum(DIMENSION_WEIGHTS[item.key] for item in scored)
    if weight_total <= 0:
        return 0
    weighted = sum(item.score * DIMENSION_WEIGHTS[item.key] for item in scored)
    return round(weighted / weight_total)


def readiness_from_score(overall: int) -> str:
    if overall >= 80:
        return "Consider this ready to copy or keep. Read it once yourself; this score is advisory."
    if overall >= 65:
        return "A useful draft. Polish the flagged dimensions before treating it as ready."
    return "Not ready yet. Address the improvements, then review again."


def scoring_notes(gaps: list[str]) -> str:
    parts = [
        "Overall score is a weighted average of applicable dimensions: "
        "clarity 18, hook 16, value 16, audience 14, voice 14, platform fit 12, CTA 10.",
        "Dimensions marked not applicable are excluded and the remaining weights are renormalised.",
        "This is an advisory studio review, not a prediction of engagement, virality, or business results.",
    ]
    if gaps:
        parts.append(
            "Limited brand context: " + ", ".join(gaps) + ". Those dimensions were not treated as automatic failures."
        )
    return " ".join(parts)


def _clip_list(values: Any, limit: int = 6) -> list[str]:
    if not isinstance(values, list):
        return []
    cleaned: list[str] = []
    for item in values:
        text = str(item).strip()
        if text and text not in cleaned:
            cleaned.append(text[:400])
        if len(cleaned) >= limit:
            break
    return cleaned


def validate_quality_review(data: dict[str, Any], gaps: list[str]) -> QualityReview:
    raw_dims = data.get("dimensions")
    if not isinstance(raw_dims, list):
        raise GenerationError("The review must include a dimensions array.")
    parsed: list[ReviewDimension] = []
    seen: set[str] = set()
    for item in raw_dims:
        if not isinstance(item, dict):
            raise GenerationError("Each dimension must be a JSON object.")
        try:
            dimension = ReviewDimension.model_validate(item)
        except ValidationError as exc:
            raise GenerationError("A review dimension was missing required fields.") from exc
        if dimension.key in seen:
            continue
        if dimension.key in {"audience", "voice"} and dimension.key in gaps:
            dimension.applicable = False
        if not dimension.applicable:
            dimension.score = dimension.score if dimension.score else 0
        parsed.append(dimension)
        seen.add(dimension.key)
    missing = [key for key in REVIEW_DIMENSIONS if key not in seen]
    if missing:
        raise GenerationError("The review omitted required quality dimensions.")
    ordered = sorted(parsed, key=lambda item: REVIEW_DIMENSIONS.index(item.key))
    overall = compute_overall_score(ordered)
    return QualityReview(
        overall_score=overall,
        dimensions=ordered,
        strengths=_clip_list(data.get("strengths")),
        improvements=_clip_list(data.get("improvements")),
        recommendations=_clip_list(data.get("recommendations")),
        readiness=readiness_from_score(overall),
        scoring_notes=scoring_notes(gaps),
        disclaimer="Advisory quality review. Not a forecast of reach, engagement, or results.",
        limited_context=gaps,
    )


def build_review_messages(
    *,
    platform: str,
    content_format: str,
    source: GeneratedContent,
    brand: Optional[BrandContext] = None,
) -> list[dict[str, str]]:
    assert_supported(platform, content_format)
    gaps = brand_context_gaps(brand)
    system = (
        "You review an existing social draft. You do not rewrite the post. "
        "Do not generate a replacement draft. Do not instruct the user to publish. "
        "Never produce LinkedIn, Instagram, or Meta API payloads. "
        "Do not predict engagement, virality, reach, impressions, or business results. "
        "Do not invent character limits, algorithm rules, or unverified platform statistics. "
        "Do not invent a target audience or brand voice if the profile does not provide them. "
        "Do not penalise personal or educational posts for lacking a sales CTA. "
        "Judge LinkedIn text posts and Instagram captions with different style expectations. "
        "Respond with a single JSON object only."
    )
    schema = (
        '{"dimensions":[{"key":"hook|clarity|audience|voice|value|platform_fit|cta",'
        '"score":0,"applicable":true,"explanation":"","evidence":"","improvement":"",'
        '"suggested_refine_action":"improve_hook|shorten|expand|professional|conversational|engaging|improve_cta|custom|"}],'
        '"strengths":[],"improvements":[],"recommendations":[]}'
    )
    user_parts = [
        "Return exactly these dimension keys: hook, clarity, audience, voice, value, platform_fit, cta.",
        "Score 0-100. Set applicable=false when the brand profile lacks the information needed to judge that dimension.",
        "suggested_refine_action must be empty or one of the studio refine actions.",
        f"JSON shape: {schema}",
        "",
        f"Platform: {platform}. Format: {content_format}.",
        "Brand profile:",
        build_brand_block(brand or BrandContext()),
        "",
        "Draft to review:",
        serialize_source(source),
    ]
    if gaps:
        user_parts.append(
            "Limited context (do not treat as failures): " + ", ".join(gaps) + "."
        )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": "\n".join(user_parts)},
    ]


def review_studio_draft(
    *,
    api_key: str,
    model: str,
    platform: str,
    content_format: str,
    source: dict[str, Any],
    brand: Optional[BrandContext] = None,
    openai_create: Optional[OpenAICreate] = None,
) -> dict[str, Any]:
    draft = validate_source_draft(source, content_format)
    gaps = brand_context_gaps(brand)
    messages = build_review_messages(
        platform=platform,
        content_format=content_format,
        source=draft,
        brand=brand,
    )
    parsed = request_json_completion(
        api_key=api_key,
        model=model,
        messages=messages,
        openai_create=openai_create,
        temperature=0.2,
    )
    review = validate_quality_review(parsed, gaps)
    payload = review.model_dump()
    payload["model"] = model
    payload["platform"] = platform.lower()
    payload["format"] = content_format.lower()
    return payload
