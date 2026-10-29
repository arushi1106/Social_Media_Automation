import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from api.services.generation import (
    BrandContext,
    PillarContext,
    GenerationError,
    VARIATION_ANGLES,
    assert_refine_action,
    assert_repurpose_target,
    assert_variation_angle,
    build_hooks_messages,
    build_refine_messages,
    build_repurpose_messages,
    build_variations_messages,
    generate_hooks,
    generate_refinement,
    generate_repurpose,
    generate_variations,
    validate_hooks,
    validate_source_draft,
    validate_three_alternatives,
)


SOURCE = {
    "title": "Eval debt",
    "body": "Teams ship models without evals, then spend weeks arguing about quality. Start with a golden set.",
    "hashtags": [],
    "slides": [],
    "script": None,
}


def _completion(payload: dict) -> MagicMock:
    fake_choice = SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload)))
    fake_response = SimpleNamespace(choices=[fake_choice])
    return MagicMock(return_value=fake_response)


def test_refine_action_allowlist():
    assert assert_refine_action("shorten") == "shorten"
    with pytest.raises(ValueError, match="Unsupported refinement"):
        assert_refine_action("make_viral")


def test_custom_refine_requires_instructions():
    with pytest.raises(ValueError, match="Custom instructions"):
        build_refine_messages(
            platform="linkedin",
            content_format="text_post",
            source=validate_source_draft(SOURCE, "text_post"),
            action="custom",
        )


def test_refine_messages_include_source_and_brand():
    source = validate_source_draft(SOURCE, "text_post")
    messages = build_refine_messages(
        platform="linkedin",
        content_format="text_post",
        source=source,
        action="conversational",
        brand=BrandContext(name="Northstar", tone="direct"),
    )
    blob = messages[1]["content"]
    assert "Eval debt" in blob
    assert "golden set" in blob
    assert "Northstar" in blob
    assert "conversational" in blob
    assert "Selected content pillar" not in blob


def test_refine_messages_keep_saved_pillar_when_present():
    source = validate_source_draft(SOURCE, "text_post")
    messages = build_refine_messages(
        platform="linkedin",
        content_format="text_post",
        source=source,
        action="shorten",
        brand=BrandContext(name="Northstar"),
        pillar=PillarContext(id="p1", name="Education", description="Explainers."),
    )
    blob = messages[1]["content"]
    assert "Education" in blob
    assert "Northstar" in blob
    assert "golden set" in blob


def test_empty_source_rejected():
    with pytest.raises(ValueError):
        validate_source_draft({"title": "x", "body": ""}, "text_post")


def test_generate_refinement_valid(monkeypatch):
    rewritten = {
        "title": "Stop arguing about quality",
        "body": "Teams still ship without evals. A small golden set turns opinions into a shared bar for quality.",
        "hashtags": [],
        "slides": [],
        "script": None,
    }
    create = _completion(rewritten)
    result = generate_refinement(
        api_key="sk-test",
        model="gpt-4o-mini",
        platform="linkedin",
        content_format="text_post",
        source=SOURCE,
        action="professional",
        brand=BrandContext(name="Northstar"),
        openai_create=create,
    )
    assert result["title"] == "Stop arguing about quality"
    assert result["platform"] == "linkedin"
    assert result["status"] == "draft"
    create.assert_called_once()


def test_generate_refinement_rejects_malformed_json():
    fake_choice = SimpleNamespace(message=SimpleNamespace(content="not json"))
    create = MagicMock(return_value=SimpleNamespace(choices=[fake_choice]))
    with pytest.raises(GenerationError):
        generate_refinement(
            api_key="sk-test",
            model="gpt-4o-mini",
            platform="linkedin",
            content_format="text_post",
            source=SOURCE,
            action="shorten",
            openai_create=create,
        )


def test_variations_require_exactly_three_distinct():
    with pytest.raises(GenerationError, match="exactly three"):
        validate_three_alternatives({"alternatives": [SOURCE, SOURCE]}, "text_post")
    long_a = {**SOURCE, "body": SOURCE["body"] + " Option alpha adds a first close."}
    long_b = {**SOURCE, "body": SOURCE["body"] + " Option beta frames a second close."}
    long_c = {**SOURCE, "body": SOURCE["body"] + " Option gamma uses a third close."}
    three = validate_three_alternatives({"alternatives": [long_a, long_b, long_c]}, "text_post")
    assert len(three) == 3
    with pytest.raises(GenerationError, match="too similar"):
        validate_three_alternatives({"alternatives": [long_a, long_a, long_a]}, "text_post")


def test_generate_variations_success():
    alts = {
        "alternatives": [
            {**SOURCE, "title": "A", "body": SOURCE["body"] + " First distinct close for option one."},
            {**SOURCE, "title": "B", "body": SOURCE["body"] + " Second distinct close for option two."},
            {**SOURCE, "title": "C", "body": SOURCE["body"] + " Third distinct close for option three."},
        ]
    }
    create = _completion(alts)
    results = generate_variations(
        api_key="sk-test",
        model="gpt-4o-mini",
        platform="linkedin",
        content_format="text_post",
        source=SOURCE,
        openai_create=create,
    )
    assert len(results) == 3
    assert results[0]["title"] == "A"
    messages = build_variations_messages(
        platform="linkedin",
        content_format="text_post",
        source=validate_source_draft(SOURCE, "text_post"),
    )
    assert "exactly three" in messages[0]["content"].lower()


def test_variation_angles_are_allowlisted():
    assert set(VARIATION_ANGLES) == {"educational", "storytelling", "opinion", "practical", "question"}
    assert assert_variation_angle("") == ""
    assert assert_variation_angle("mixed") == "mixed"
    with pytest.raises(ValueError, match="Unsupported variation angle"):
        assert_variation_angle("viral")
    source = validate_source_draft(SOURCE, "text_post")
    brand = BrandContext(name="Northstar", audience="Consultants", tone="direct")
    pillar = PillarContext(id="p1", name="Education", description="Explainers.")
    for angle in VARIATION_ANGLES:
        blob = "\n".join(
            part["content"]
            for part in build_variations_messages(
                platform="linkedin",
                content_format="text_post",
                source=source,
                brand=brand,
                pillar=pillar,
                angle=angle,
                topic="Why evals matter",
            )
        )
        assert "Northstar" in blob
        assert "Consultants" in blob
        assert "Education" in blob
        assert "Why evals matter" in blob
        assert angle in blob
        assert "linkedin" in blob.lower()
        assert "do not invent" in blob.lower() or "Do not invent" in blob
    mixed = build_variations_messages(
        platform="linkedin",
        content_format="text_post",
        source=source,
        angle="mixed",
    )[1]["content"]
    assert "educational" in mixed
    assert "storytelling" in mixed
    assert "practical" in mixed


def test_hooks_return_openings_not_full_drafts():
    with pytest.raises(GenerationError, match="exactly 4"):
        validate_hooks({"hooks": ["one"]})
    with pytest.raises(GenerationError, match="empty"):
        validate_hooks({"hooks": ["a", "b", "c", ""]})
    with pytest.raises(GenerationError, match="too similar"):
        validate_hooks({"hooks": ["Same hook", "Same hook", "Third", "Fourth"]})
    valid = validate_hooks(
        {
            "hooks": [
                {"text": "Stop shipping without evals.", "angle": "opinion"},
                {"text": "What is your golden set?", "angle": "question"},
                {"text": "Three steps to a golden set.", "angle": "practical"},
                {"text": "Evals are the missing chapter.", "angle": "educational"},
            ]
        }
    )
    assert len(valid) == 4
    assert valid[0]["angle"] == "opinion"
    payload = {
        "hooks": [
            {"text": "Hook one for evals", "angle": "question"},
            {"text": "Hook two for evals", "angle": "practical"},
            {"text": "Hook three for evals", "angle": "opinion"},
            {"text": "Hook four for evals", "angle": "educational"},
        ]
    }
    create = _completion(payload)
    result = generate_hooks(
        api_key="sk-test",
        model="gpt-4o-mini",
        platform="linkedin",
        content_format="text_post",
        source=SOURCE,
        brand=BrandContext(name="Northstar", audience="Consultants"),
        pillar=PillarContext(id="p1", name="Education", description="Explainers."),
        topic="Why evals matter",
        openai_create=create,
    )
    assert result["status"] == "draft"
    assert "body" not in result
    assert len(result["hooks"]) == 4
    messages = build_hooks_messages(
        platform="linkedin",
        content_format="text_post",
        source=validate_source_draft(SOURCE, "text_post"),
        brand=BrandContext(name="Northstar"),
        topic="Why evals matter",
    )
    blob = messages[0]["content"] + messages[1]["content"]
    assert "hooks only" in blob.lower() or "not a rewritten" in blob.lower()
    assert "Why evals matter" in blob
    assert "Northstar" in blob
    assert "Eval debt" in blob


def test_repurpose_rejects_same_target():
    with pytest.raises(ValueError, match="different platform or format"):
        assert_repurpose_target("linkedin", "text_post", "linkedin", "text_post")
    with pytest.raises(ValueError, match="Unsupported format"):
        assert_repurpose_target("linkedin", "text_post", "linkedin", "caption")


def test_generate_repurpose_changes_platform():
    caption = {
        "title": "Golden set",
        "body": "Stop arguing about quality. Start with a golden eval set your team can reuse every week.",
        "hashtags": ["#ai"],
        "slides": [],
        "script": None,
    }
    create = _completion(caption)
    result = generate_repurpose(
        api_key="sk-test",
        model="gpt-4o-mini",
        source_platform="linkedin",
        source_format="text_post",
        target_platform="instagram",
        target_format="caption",
        source=SOURCE,
        brand=BrandContext(name="Northstar"),
        openai_create=create,
    )
    assert result["platform"] == "instagram"
    assert result["format"] == "caption"
    messages = build_repurpose_messages(
        source_platform="linkedin",
        source_format="text_post",
        target_platform="instagram",
        target_format="caption",
        source=validate_source_draft(SOURCE, "text_post"),
    )
    assert "do not merely append hashtags" in messages[1]["content"].lower()
    assert "instagram" in messages[0]["content"].lower()
