import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from api.services.generation import BrandContext, GenerationError
from api.services.review import (
    DIMENSION_WEIGHTS,
    ReviewDimension,
    brand_context_gaps,
    compute_overall_score,
    review_studio_draft,
    validate_quality_review,
)

SOURCE = {
    "title": "Eval debt",
    "body": "Teams ship models without evals, then spend weeks arguing about quality. Start with a golden set.",
    "hashtags": [],
    "slides": [],
    "script": None,
}


def _dimension(key: str, score: int, applicable: bool = True) -> dict:
    return {
        "key": key,
        "score": score,
        "applicable": applicable,
        "explanation": f"{key} explanation",
        "evidence": "Opening sentence names the problem.",
        "improvement": "Tighten the first line.",
        "suggested_refine_action": "improve_hook" if key == "hook" else "",
    }


def _payload(overrides: dict | None = None) -> dict:
    data = {
        "dimensions": [
            _dimension("hook", 70),
            _dimension("clarity", 80),
            _dimension("audience", 60),
            _dimension("voice", 75),
            _dimension("value", 82),
            _dimension("platform_fit", 78),
            _dimension("cta", 50),
        ],
        "strengths": ["Clear problem statement."],
        "improvements": ["The close is vague."],
        "recommendations": ["Rewrite the last line as a specific question."],
        "overall_score": 1,
    }
    if overrides:
        data.update(overrides)
    return data


def test_weights_sum_to_100():
    assert sum(DIMENSION_WEIGHTS.values()) == 100


def test_overall_score_ignores_model_overall_and_na_dimensions():
    parsed = validate_quality_review(_payload(), gaps=[])
    expected = compute_overall_score(
        [ReviewDimension.model_validate(item) for item in _payload()["dimensions"]]
    )
    assert parsed.overall_score == expected
    assert parsed.overall_score != 1
    assert "advisory" in parsed.disclaimer.lower()
    assert "virality" in parsed.disclaimer.lower() or "engagement" in parsed.disclaimer.lower()


def test_missing_audience_is_not_an_automatic_failure():
    gaps = brand_context_gaps(BrandContext(name="Northstar"))
    assert "audience" in gaps
    payload = _payload()
    payload["dimensions"][2]["applicable"] = True
    payload["dimensions"][2]["score"] = 0
    parsed = validate_quality_review(payload, gaps)
    audience = next(item for item in parsed.dimensions if item.key == "audience")
    assert audience.applicable is False
    assert parsed.overall_score == compute_overall_score(parsed.dimensions)


def test_incomplete_dimensions_rejected():
    with pytest.raises(GenerationError, match="omitted"):
        validate_quality_review({"dimensions": [_dimension("hook", 50)]}, [])


def test_review_uses_injected_openai():
    fake_choice = SimpleNamespace(message=SimpleNamespace(content=json.dumps(_payload())))
    create = MagicMock(return_value=SimpleNamespace(choices=[fake_choice]))
    result = review_studio_draft(
        api_key="sk-test",
        model="gpt-4o-mini",
        platform="linkedin",
        content_format="text_post",
        source=SOURCE,
        brand=BrandContext(name="Northstar", audience="Consultants", tone="direct"),
        openai_create=create,
    )
    assert 0 <= result["overall_score"] <= 100
    assert len(result["dimensions"]) == 7
    assert result["platform"] == "linkedin"
    create.assert_called_once()
    assert create.call_args.kwargs["temperature"] == 0.2
    assert "sk-test" not in str(create.call_args)
