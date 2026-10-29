import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from api.services.generation import (
    BrandContext,
    GenerationError,
    allowed_idea_platforms,
    assert_discovery_count,
    assert_discovery_objective,
    build_discovery_messages,
    generate_content_ideas,
    validate_content_ideas,
)

IDEA = {
    "title": "Golden evals",
    "concept": "A small eval set beats vague quality debates.",
    "why_relevant": "Consultants need a concrete way to talk about quality.",
    "angle": "Practical operating habit.",
    "hook": "Stop arguing about quality.",
    "format": "text_post",
    "call_to_action": "Comment your eval count.",
    "pillar": "evals",
    "platform": "linkedin",
}


def _idea(title: str) -> dict:
    return {**IDEA, "title": title}


def test_discovery_count_and_objective_limits():
    assert assert_discovery_count(5) == 5
    with pytest.raises(ValueError, match="between"):
        assert_discovery_count(20)
    with pytest.raises(ValueError, match="Unsupported content objective"):
        assert_discovery_objective("go_viral")
    assert assert_discovery_objective("education") == "education"


def test_allowed_platforms_respect_brand_and_studio_list():
    brand = BrandContext(platforms=["linkedin"])
    assert allowed_idea_platforms(brand, "") == ["linkedin"]
    with pytest.raises(ValueError, match="Unsupported platform"):
        allowed_idea_platforms(brand, "tiktok")
    with pytest.raises(ValueError, match="brand profile"):
        allowed_idea_platforms(brand, "instagram")


def test_validate_ideas_requires_exact_count_and_distinct_titles():
    with pytest.raises(GenerationError, match="exactly 3"):
        validate_content_ideas({"ideas": [_idea("A"), _idea("B")]}, 3, ["linkedin"])
    with pytest.raises(GenerationError, match="too similar"):
        validate_content_ideas({"ideas": [_idea("Same"), _idea("Same"), _idea("Same")]}, 3, ["linkedin"])
    ideas = validate_content_ideas(
        {"ideas": [_idea("One"), _idea("Two"), _idea("Three")]},
        3,
        ["linkedin"],
    )
    assert len(ideas) == 3


def test_malformed_idea_rejected():
    with pytest.raises(GenerationError):
        validate_content_ideas({"ideas": [{"title": "x"}]}, 1, ["linkedin"])


def test_discovery_messages_include_brand_and_forbid_fake_trends():
    messages = build_discovery_messages(
        count=3,
        theme="Q4 evals",
        platform="linkedin",
        objective="education",
        brand=BrandContext(name="Northstar", audience="Consultants", platforms=["linkedin"]),
    )
    assert "Northstar" in messages[1]["content"]
    assert "Q4 evals" in messages[1]["content"]
    assert "not performance predictions" in messages[0]["content"].lower()
    assert "search volume" in messages[0]["content"].lower()


def test_discovery_messages_keep_brief_text_separate_from_brand():
    messages = build_discovery_messages(
        count=3,
        extra_instructions="Campaign: Eval launch. Do not invent metrics.",
        brand=BrandContext(name="Northstar"),
    )
    assert "User-authored content brief" in messages[1]["content"]
    assert "Eval launch" in messages[1]["content"]


def test_generate_content_ideas_uses_injected_openai():
    payload = {"ideas": [_idea("One"), _idea("Two"), _idea("Three")]}
    fake_choice = SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload)))
    create = MagicMock(return_value=SimpleNamespace(choices=[fake_choice]))
    results = generate_content_ideas(
        api_key="sk-test",
        model="gpt-4o-mini",
        count=3,
        platform="linkedin",
        brand=BrandContext(name="Northstar", platforms=["linkedin"]),
        openai_create=create,
    )
    assert len(results) == 3
    assert results[0]["status"] == "suggestion"
    assert results[0]["platform"] == "linkedin"
    create.assert_called_once()
    assert "sk-test" not in str(create.call_args)
