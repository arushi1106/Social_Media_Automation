from unittest.mock import patch

import jwt
from fastapi.testclient import TestClient

import api.main as main_module
from api.config import get_settings
from api.main import app
from api.services.throttle import GenerationThrottle, generation_throttle

client = TestClient(app)


def _enable_auth(monkeypatch, openai: bool = False) -> None:
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    if openai:
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    get_settings.cache_clear()


def _auth_header(user_id: str = "user-1") -> dict[str, str]:
    from datetime import datetime, timedelta, timezone

    secret = get_settings().supabase_jwt_secret or "test-secret"
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": user_id,
            "email": "a@example.com",
            "aud": "authenticated",
            "exp": int((now + timedelta(hours=1)).timestamp()),
        },
        secret,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


def test_health_reports_no_publishing():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["publishes_to_social"] is False
    assert "openai_configured" in body
    assert "auth_configured" in body


def test_generate_requires_auth_configuration():
    get_settings.cache_clear()
    response = client.post(
        "/v1/content/generate",
        json={"platform": "linkedin", "format": "text_post", "topic": "hello world"},
    )
    assert response.status_code in (401, 503)


def test_generate_rejects_unsupported_format_when_authenticated(monkeypatch):
    _enable_auth(monkeypatch)
    response = client.post(
        "/v1/content/generate",
        headers=_auth_header(),
        json={"platform": "linkedin", "format": "caption", "topic": "hello world"},
    )
    assert response.status_code == 422


def test_api_module_does_not_import_publishers():
    source = open(main_module.__file__, encoding="utf-8").read()
    assert "from linkedin" not in source
    assert "from insta" not in source
    assert "from gpt import" not in source
    assert "share" not in main_module.__dict__


def test_throttle_limits_per_user():
    limiter = GenerationThrottle(limit=2, window=60)
    assert limiter.allow("a") is True
    assert limiter.allow("a") is True
    assert limiter.allow("a") is False
    assert limiter.allow("b") is True


def test_generate_with_mocked_model(monkeypatch):
    _enable_auth(monkeypatch, openai=True)
    monkeypatch.setattr(generation_throttle, "allow", lambda user_id: True)
    fake = {
        "platform": "linkedin",
        "format": "text_post",
        "title": "Title",
        "body": "A sufficiently long body for a LinkedIn draft that passes validation.",
        "hashtags": [],
        "slides": [],
        "script": None,
        "status": "draft",
        "model": "gpt-4o-mini",
    }
    with patch("api.routers.content.generate_studio_draft", return_value=fake):
        response = client.post(
            "/v1/content/generate",
            headers=_auth_header("user-42"),
            json={
                "platform": "linkedin", "format": "text_post",
                "topic": "Shipping evals",
                "brand": {"name": "Northstar", "tone": "direct"},
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "draft"
    assert body["format"] == "text_post"
    assert "publish" not in body


def test_generate_missing_topic_is_422(monkeypatch):
    _enable_auth(monkeypatch)
    response = client.post(
        "/v1/content/generate",
        headers=_auth_header(),
        json={"platform": "linkedin", "format": "text_post", "topic": ""},
    )
    assert response.status_code == 422


SOURCE_DRAFT = {
    "title": "Eval debt",
    "body": "Teams ship models without evals, then spend weeks arguing about quality. Start with a golden set.",
    "hashtags": [],
    "slides": [],
    "script": None,
}


def test_refine_requires_auth(monkeypatch):
    _enable_auth(monkeypatch)
    response = client.post(
        "/v1/content/refine",
        json={
            "platform": "linkedin",
            "format": "text_post",
            "source": SOURCE_DRAFT,
            "action": "shorten",
        },
    )
    assert response.status_code == 401


def test_refine_rejects_unsupported_and_empty(monkeypatch):
    _enable_auth(monkeypatch, openai=True)
    bad_platform = client.post(
        "/v1/content/refine",
        headers=_auth_header(),
        json={
            "platform": "tiktok",
            "format": "text_post",
            "source": SOURCE_DRAFT,
            "action": "shorten",
        },
    )
    assert bad_platform.status_code == 422
    empty = client.post(
        "/v1/content/refine",
        headers=_auth_header(),
        json={
            "platform": "linkedin",
            "format": "text_post",
            "source": {"title": "x", "body": "too short"},
            "action": "shorten",
        },
    )
    assert empty.status_code == 422
    too_long = client.post(
        "/v1/content/refine",
        headers=_auth_header(),
        json={
            "platform": "linkedin",
            "format": "text_post",
            "source": {**SOURCE_DRAFT, "body": "x" * 8001},
            "action": "shorten",
        },
    )
    assert too_long.status_code == 422


def test_refine_with_mocked_model(monkeypatch):
    _enable_auth(monkeypatch, openai=True)
    monkeypatch.setattr(generation_throttle, "allow", lambda user_id: True)
    fake = {
        "platform": "linkedin",
        "format": "text_post",
        "title": "Shorter",
        "body": "A sufficiently long rewritten LinkedIn draft that still keeps the original facts.",
        "hashtags": [],
        "slides": [],
        "script": None,
        "status": "draft",
        "model": "gpt-4o-mini",
    }
    with patch("api.routers.content.generate_refinement", return_value=fake):
        response = client.post(
            "/v1/content/refine",
            headers=_auth_header("user-42"),
            json={
                "platform": "linkedin",
                "format": "text_post",
                "source": SOURCE_DRAFT,
                "action": "shorten",
            },
        )
    assert response.status_code == 200
    assert response.json()["title"] == "Shorter"


def test_variations_invalid_model_output_is_502(monkeypatch):
    from api.services.generation import GenerationError

    _enable_auth(monkeypatch, openai=True)
    monkeypatch.setattr(generation_throttle, "allow", lambda user_id: True)
    with patch("api.routers.content.generate_variations", side_effect=GenerationError("bad")):
        response = client.post(
            "/v1/content/variations",
            headers=_auth_header(),
            json={"platform": "linkedin", "format": "text_post", "source": SOURCE_DRAFT},
        )
    assert response.status_code == 502


def test_variations_success(monkeypatch):
    _enable_auth(monkeypatch, openai=True)
    monkeypatch.setattr(generation_throttle, "allow", lambda user_id: True)
    alts = [
        {
            "platform": "linkedin",
            "format": "text_post",
            "title": f"T{i}",
            "body": f"A sufficiently long alternative body number {i} that passes validation easily.",
            "hashtags": [],
            "slides": [],
            "script": None,
            "status": "draft",
            "model": "gpt-4o-mini",
        }
        for i in range(3)
    ]
    with patch("api.routers.content.generate_variations", return_value=alts):
        response = client.post(
            "/v1/content/variations",
            headers=_auth_header(),
            json={"platform": "linkedin", "format": "text_post", "source": SOURCE_DRAFT},
        )
    assert response.status_code == 200
    assert len(response.json()["alternatives"]) == 3


def test_repurpose_and_provider_errors(monkeypatch):
    from openai import APITimeoutError, RateLimitError

    _enable_auth(monkeypatch, openai=True)
    monkeypatch.setattr(generation_throttle, "allow", lambda user_id: True)
    same = client.post(
        "/v1/content/repurpose",
        headers=_auth_header(),
        json={
            "source_platform": "linkedin",
            "source_format": "text_post",
            "target_platform": "linkedin",
            "target_format": "text_post",
            "source": SOURCE_DRAFT,
        },
    )
    assert same.status_code == 422

    fake = {
        "platform": "instagram",
        "format": "caption",
        "title": "Caption",
        "body": "A sufficiently long Instagram caption that keeps the original eval-set message intact.",
        "hashtags": ["#ai"],
        "slides": [],
        "script": None,
        "status": "draft",
        "model": "gpt-4o-mini",
    }
    with patch("api.routers.content.generate_repurpose", return_value=fake):
        ok = client.post(
            "/v1/content/repurpose",
            headers=_auth_header(),
            json={
                "source_platform": "linkedin",
                "source_format": "text_post",
                "target_platform": "instagram",
                "target_format": "caption",
                "source": SOURCE_DRAFT,
            },
        )
    assert ok.status_code == 200
    assert ok.json()["platform"] == "instagram"

    with patch("api.routers.content.generate_repurpose", side_effect=APITimeoutError("t")):
        timeout = client.post(
            "/v1/content/repurpose",
            headers=_auth_header(),
            json={
                "source_platform": "linkedin",
                "source_format": "text_post",
                "target_platform": "instagram",
                "target_format": "caption",
                "source": SOURCE_DRAFT,
            },
        )
    assert timeout.status_code == 504

    timeout_request = type("Req", (), {})()
    rate_response = type("Resp", (), {"request": timeout_request, "status_code": 429})()
    with patch(
        "api.routers.content.generate_repurpose",
        side_effect=RateLimitError("busy", response=rate_response, body=None),
    ):
        limited = client.post(
            "/v1/content/repurpose",
            headers=_auth_header(),
            json={
                "source_platform": "linkedin",
                "source_format": "text_post",
                "target_platform": "instagram",
                "target_format": "caption",
                "source": SOURCE_DRAFT,
            },
        )
    assert limited.status_code == 429


def test_ideas_requires_auth(monkeypatch):
    _enable_auth(monkeypatch)
    response = client.post("/v1/content/ideas", json={"count": 3})
    assert response.status_code == 401


def test_ideas_rejects_invalid_count_and_platform(monkeypatch):
    _enable_auth(monkeypatch, openai=True)
    too_many = client.post(
        "/v1/content/ideas",
        headers=_auth_header(),
        json={"count": 20, "brand": {"platforms": ["linkedin"]}},
    )
    assert too_many.status_code == 422
    bad_platform = client.post(
        "/v1/content/ideas",
        headers=_auth_header(),
        json={"count": 3, "platform": "tiktok", "brand": {"platforms": ["linkedin"]}},
    )
    assert bad_platform.status_code == 422


def test_ideas_with_mocked_model(monkeypatch):
    _enable_auth(monkeypatch, openai=True)
    monkeypatch.setattr(generation_throttle, "allow", lambda user_id: True)
    fake = [
        {
            "title": f"Idea {i}",
            "concept": "A concrete concept for the audience.",
            "why_relevant": "It maps to a job they already have.",
            "angle": "Practical.",
            "hook": "Start here.",
            "format": "text_post",
            "call_to_action": "Comment.",
            "pillar": "evals",
            "platform": "linkedin",
            "status": "suggestion",
            "model": "gpt-4o-mini",
        }
        for i in range(3)
    ]
    with patch("api.routers.content.generate_content_ideas", return_value=fake):
        response = client.post(
            "/v1/content/ideas",
            headers=_auth_header("user-42"),
            json={"count": 3, "platform": "linkedin", "brand": {"name": "Northstar", "platforms": ["linkedin"]}},
        )
    assert response.status_code == 200
    body = response.json()
    assert len(body["ideas"]) == 3
    assert "not proven" in body["disclaimer"].lower()


def test_ideas_provider_errors_and_throttle(monkeypatch):
    from openai import APITimeoutError
    from api.services.generation import GenerationError

    _enable_auth(monkeypatch, openai=True)
    monkeypatch.setattr(generation_throttle, "allow", lambda user_id: True)
    with patch("api.routers.content.generate_content_ideas", side_effect=GenerationError("bad")):
        bad = client.post(
            "/v1/content/ideas",
            headers=_auth_header(),
            json={"count": 3, "brand": {"platforms": ["linkedin"]}},
        )
    assert bad.status_code == 502

    with patch("api.routers.content.generate_content_ideas", side_effect=APITimeoutError("t")):
        timeout = client.post(
            "/v1/content/ideas",
            headers=_auth_header(),
            json={"count": 3, "brand": {"platforms": ["linkedin"]}},
        )
    assert timeout.status_code == 504

    monkeypatch.setattr(generation_throttle, "allow", lambda user_id: False)
    limited = client.post(
        "/v1/content/ideas",
        headers=_auth_header(),
        json={"count": 3, "brand": {"platforms": ["linkedin"]}},
    )
    assert limited.status_code == 429


def test_refine_rate_limited(monkeypatch):
    _enable_auth(monkeypatch, openai=True)
    monkeypatch.setattr(generation_throttle, "allow", lambda user_id: False)
    response = client.post(
        "/v1/content/refine",
        headers=_auth_header(),
        json={
            "platform": "linkedin",
            "format": "text_post",
            "source": SOURCE_DRAFT,
            "action": "shorten",
        },
    )
    assert response.status_code == 429


def test_review_requires_auth_and_valid_source(monkeypatch):
    _enable_auth(monkeypatch, openai=True)
    unauth = client.post(
        "/v1/content/review",
        json={"platform": "linkedin", "format": "text_post", "source": SOURCE_DRAFT},
    )
    assert unauth.status_code == 401
    empty = client.post(
        "/v1/content/review",
        headers=_auth_header(),
        json={"platform": "linkedin", "format": "text_post", "source": {"title": "x", "body": "too short"}},
    )
    assert empty.status_code == 422
    bad_format = client.post(
        "/v1/content/review",
        headers=_auth_header(),
        json={"platform": "linkedin", "format": "caption", "source": SOURCE_DRAFT},
    )
    assert bad_format.status_code == 422


def test_review_with_mocked_model(monkeypatch):
    _enable_auth(monkeypatch, openai=True)
    monkeypatch.setattr(generation_throttle, "allow", lambda user_id: True)
    fake = {
        "overall_score": 72,
        "dimensions": [
            {
                "key": key,
                "score": 70,
                "applicable": True,
                "explanation": "ok",
                "evidence": "line",
                "improvement": "",
                "suggested_refine_action": "",
            }
            for key in (
                "hook",
                "clarity",
                "audience",
                "voice",
                "value",
                "platform_fit",
                "cta",
            )
        ],
        "strengths": ["Clear open"],
        "improvements": ["Vague close"],
        "recommendations": ["Ask a question"],
        "readiness": "A useful draft. Polish the flagged dimensions before treating it as ready.",
        "scoring_notes": "Weighted average.",
        "disclaimer": "Advisory quality review. Not a forecast of reach, engagement, or results.",
        "limited_context": [],
        "platform": "linkedin",
        "format": "text_post",
        "model": "gpt-4o-mini",
    }
    with patch("api.routers.content.review_studio_draft", return_value=fake):
        response = client.post(
            "/v1/content/review",
            headers=_auth_header("user-42"),
            json={"platform": "linkedin", "format": "text_post", "source": SOURCE_DRAFT},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["overall_score"] == 72
    assert "forecast" in body["disclaimer"].lower()
    assert len(body["dimensions"]) == 7


def test_review_malformed_is_502(monkeypatch):
    from api.services.generation import GenerationError

    _enable_auth(monkeypatch, openai=True)
    monkeypatch.setattr(generation_throttle, "allow", lambda user_id: True)
    with patch("api.routers.content.review_studio_draft", side_effect=GenerationError("bad")):
        response = client.post(
            "/v1/content/review",
            headers=_auth_header(),
            json={"platform": "linkedin", "format": "text_post", "source": SOURCE_DRAFT},
        )
    assert response.status_code == 502
