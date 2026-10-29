from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from api.services.generation import (
    BrandContext,
    GenerationError,
    PLATFORM_INSTRUCTIONS,
    STUDIO_PLATFORMS,
    assert_supported,
    build_messages,
    build_studio_messages,
    extract_json_object,
    generate_studio_draft,
    validate_generated_content,
)


def test_build_messages_includes_brand_voice_and_platform():
    messages = build_messages(
        platform="linkedin",
        source_title="A title",
        source_text="Source body",
        brand_voice="Direct, no jargon.",
    )
    assert messages[0]["role"] == "system"
    assert "linkedin" in messages[0]["content"].lower()
    assert "Direct, no jargon." in messages[1]["content"]
    assert "Source body" in messages[1]["content"]
    assert "never produce" in messages[0]["content"].lower() or "Never" in messages[0]["content"]


def test_unsupported_platform_raises():
    with pytest.raises(ValueError, match="Unsupported platform"):
        build_messages(platform="tiktok", source_title="t", source_text="x")


def test_supported_platforms_are_draft_only():
    assert set(STUDIO_PLATFORMS) == {"linkedin", "instagram"}
    assert set(PLATFORM_INSTRUCTIONS) == {"linkedin", "instagram"}


def test_assert_supported_rejects_bad_format():
    with pytest.raises(ValueError, match="Unsupported format"):
        assert_supported("linkedin", "caption")
    with pytest.raises(ValueError, match="Unsupported platform"):
        assert_supported("x", "text_post")


def test_studio_messages_include_brand_profile_fields():
    brand = BrandContext(
        name="Northstar",
        niche="AI",
        audience="Consultants",
        tone="witty",
        language="English",
        goals=["educate"],
        topics=["LLMs"],
    )
    messages = build_studio_messages(
        platform="instagram",
        content_format="caption",
        topic="Why evals matter",
        call_to_action="Save this post",
        brand=brand,
    )
    blob = messages[1]["content"]
    assert "Northstar" in blob
    assert "Consultants" in blob
    assert "Why evals matter" in blob
    assert "Save this post" in blob
    assert "json" in messages[0]["content"].lower()


def test_validate_text_post_and_carousel():
    post = validate_generated_content(
        {"title": "Hooks", "body": "A complete LinkedIn draft with enough characters."},
        "text_post",
    )
    assert post.title == "Hooks"
    carousel = validate_generated_content(
        {
            "title": "Five slides",
            "body": "",
            "slides": [
                {"title": "1", "text": "Hook"},
                {"title": "2", "text": "Problem"},
                {"title": "3", "text": "Fix"},
            ],
        },
        "carousel",
    )
    assert len(carousel.slides) == 3
    assert carousel.body


def test_malformed_and_short_output_rejected():
    with pytest.raises(GenerationError):
        extract_json_object("not json")
    with pytest.raises(GenerationError):
        validate_generated_content({"title": "x", "body": "too short"}, "text_post")
    with pytest.raises(GenerationError):
        validate_generated_content({"title": "s", "body": "ok"}, "script")


def test_generate_studio_draft_uses_injected_openai(monkeypatch):
    payload = {
        "title": "Eval debt",
        "body": "This is a full LinkedIn post that is definitely long enough to pass validation.",
        "hashtags": [],
        "slides": [],
        "script": None,
    }
    fake_choice = SimpleNamespace(message=SimpleNamespace(content=__import__("json").dumps(payload)))
    fake_response = SimpleNamespace(choices=[fake_choice])
    create = MagicMock(return_value=fake_response)
    result = generate_studio_draft(
        api_key="sk-test",
        model="gpt-4o-mini",
        platform="linkedin",
        content_format="text_post",
        topic="Eval debt",
        brand=BrandContext(name="Northstar"),
        openai_create=create,
    )
    assert result["status"] == "draft"
    assert result["title"] == "Eval debt"
    assert result["platform"] == "linkedin"
    create.assert_called_once()
    kwargs = create.call_args.kwargs
    assert kwargs["response_format"] == {"type": "json_object"}
    assert "sk-test" not in str(kwargs)
