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
    assert "studio_context_configured" in body
    blob = str(body).lower()
    assert "sk-" not in blob
    assert "service_role" not in blob


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
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "draft"
    assert body["format"] == "text_post"
    assert "publish" not in body
    assert "scheduled" not in body


def test_generate_rejects_oversized_instructions(monkeypatch):
    _enable_auth(monkeypatch)
    response = client.post(
        "/v1/content/generate",
        headers=_auth_header(),
        json={
            "platform": "linkedin",
            "format": "text_post",
            "topic": "Shipping evals",
            "extra_instructions": "x" * 4001,
        },
    )
    assert response.status_code == 422


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


def test_variations_reject_unknown_angle(monkeypatch):
    _enable_auth(monkeypatch)
    response = client.post(
        "/v1/content/variations",
        headers=_auth_header(),
        json={
            "platform": "linkedin",
            "format": "text_post",
            "source": SOURCE_DRAFT,
            "angle": "viral",
        },
    )
    assert response.status_code == 422


def test_hooks_require_auth_and_succeed_when_mocked(monkeypatch):
    _enable_auth(monkeypatch)
    denied = client.post(
        "/v1/content/hooks",
        json={"platform": "linkedin", "format": "text_post", "source": SOURCE_DRAFT},
    )
    assert denied.status_code in (401, 503)
    _enable_auth(monkeypatch, openai=True)
    monkeypatch.setattr(generation_throttle, "allow", lambda user_id: True)
    fake = {
        "hooks": [
            {"text": "Hook a", "angle": "question"},
            {"text": "Hook b", "angle": "practical"},
            {"text": "Hook c", "angle": "opinion"},
            {"text": "Hook d", "angle": "educational"},
        ],
        "status": "draft",
        "model": "gpt-4o-mini",
    }
    with patch("api.routers.content.generate_hooks", return_value=fake):
        response = client.post(
            "/v1/content/hooks",
            headers=_auth_header(),
            json={"platform": "linkedin", "format": "text_post", "source": SOURCE_DRAFT},
        )
    assert response.status_code == 200
    assert len(response.json()["hooks"]) == 4
    assert "publish" not in response.json()


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
        json={"count": 20},
    )
    assert too_many.status_code == 422
    bad_platform = client.post(
        "/v1/content/ideas",
        headers=_auth_header(),
        json={"count": 3, "platform": "tiktok"},
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
            json={"count": 3, "platform": "linkedin"},
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
            json={"count": 3},
        )
    assert bad.status_code == 502

    with patch("api.routers.content.generate_content_ideas", side_effect=APITimeoutError("t")):
        timeout = client.post(
            "/v1/content/ideas",
            headers=_auth_header(),
            json={"count": 3},
        )
    assert timeout.status_code == 504

    monkeypatch.setattr(generation_throttle, "allow", lambda user_id: False)
    limited = client.post(
        "/v1/content/ideas",
        headers=_auth_header(),
        json={"count": 3},
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


BRAND_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
PILLAR_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
OTHER_BRAND_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc"


def _enable_context(monkeypatch, openai: bool = True) -> None:
    _enable_auth(monkeypatch, openai=openai)
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-test")
    get_settings.cache_clear()
    monkeypatch.setattr(generation_throttle, "allow", lambda user_id: True)


def _owned_brand(user_id: str = "user-42") -> dict:
    return {
        "id": BRAND_ID,
        "user_id": user_id,
        "name": "Northstar",
        "niche": "",
        "bio": "",
        "audience": "Consultants",
        "language": "English",
        "platforms": ["linkedin"],
        "goals": [],
        "topics": [],
        "voice_preferences": {"tone": "direct"},
    }


def _owned_pillar(user_id: str = "user-42", brand_id: str = BRAND_ID) -> dict:
    return {
        "id": PILLAR_ID,
        "user_id": user_id,
        "brand_id": brand_id,
        "name": "Education",
        "description": "Practical explainers.",
    }


GENERATE_OK = {
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


def test_generate_authorized_brand_and_pillar_uses_stored_context(monkeypatch):
    _enable_context(monkeypatch)
    captured = {}

    def fetch(table, record_id, access_token, settings, user_id):
        if table == "brands":
            return _owned_brand(user_id)
        return _owned_pillar(user_id)

    def fake_generate(**kwargs):
        captured["brand"] = kwargs["brand"]
        captured["pillar"] = kwargs["pillar"]
        captured["topic"] = kwargs["topic"]
        return GENERATE_OK

    with patch("api.services.studio_context.fetch_owned_row", side_effect=fetch):
        with patch("api.routers.content.generate_studio_draft", side_effect=fake_generate):
            response = client.post(
                "/v1/content/generate",
                headers=_auth_header("user-42"),
                json={
                    "platform": "linkedin",
                    "format": "text_post",
                    "topic": "Shipping evals",
                    "extra_instructions": "Keep it practical.",
                    "brand": {"id": BRAND_ID, "name": "Forged Inc", "tone": "hype"},
                    "pillar": {"id": PILLAR_ID, "name": "Forged pillar", "description": "No"},
                },
            )
    assert response.status_code == 200
    assert captured["brand"].name == "Northstar"
    assert captured["brand"].tone == "direct"
    assert captured["pillar"].name == "Education"
    assert captured["topic"] == "Shipping evals"


def test_generate_rejects_another_users_brand_id(monkeypatch):
    _enable_context(monkeypatch)

    def fetch(table, record_id, access_token, settings, user_id):
        return None

    with patch("api.services.studio_context.fetch_owned_row", side_effect=fetch):
        with patch("api.routers.content.generate_studio_draft", return_value=GENERATE_OK) as generate:
            response = client.post(
                "/v1/content/generate",
                headers=_auth_header("user-42"),
                json={
                    "platform": "linkedin",
                    "format": "text_post",
                    "topic": "Shipping evals",
                    "brand": {"id": BRAND_ID, "name": "Victim brand"},
                },
            )
    assert response.status_code == 404
    assert generate.call_count == 0
    assert "Victim" not in response.text
    assert "sk-" not in response.text


def test_refine_rejects_pillar_on_another_brand(monkeypatch):
    _enable_context(monkeypatch)

    def fetch(table, record_id, access_token, settings, user_id):
        if table == "brands":
            return _owned_brand(user_id)
        return _owned_pillar(user_id, brand_id=OTHER_BRAND_ID)

    with patch("api.services.studio_context.fetch_owned_row", side_effect=fetch):
        response = client.post(
            "/v1/content/refine",
            headers=_auth_header("user-42"),
            json={
                "platform": "linkedin",
                "format": "text_post",
                "source": SOURCE_DRAFT,
                "action": "shorten",
                "brand": {"id": BRAND_ID},
                "pillar": {"id": PILLAR_ID},
            },
        )
    assert response.status_code == 404
    assert response.json()["detail"] == "That content context is not available."


def test_generate_fails_closed_when_context_lookup_unavailable(monkeypatch):
    _enable_auth(monkeypatch, openai=True)
    monkeypatch.setenv("SUPABASE_ANON_KEY", "")
    get_settings.cache_clear()
    monkeypatch.setattr(generation_throttle, "allow", lambda user_id: True)
    response = client.post(
        "/v1/content/generate",
        headers=_auth_header("user-42"),
        json={
            "platform": "linkedin",
            "format": "text_post",
            "topic": "Shipping evals",
            "brand": {"id": BRAND_ID, "name": "Northstar"},
        },
    )
    assert response.status_code == 503
    assert "traceback" not in response.text.lower()


def test_hooks_without_pillar_still_succeed(monkeypatch):
    _enable_context(monkeypatch)
    fake = {
        "hooks": [
            {"text": "Hook a", "angle": "question"},
            {"text": "Hook b", "angle": "practical"},
            {"text": "Hook c", "angle": "opinion"},
            {"text": "Hook d", "angle": "educational"},
        ],
        "status": "draft",
        "model": "gpt-4o-mini",
    }
    with patch("api.routers.content.generate_hooks", return_value=fake) as generate:
        response = client.post(
            "/v1/content/hooks",
            headers=_auth_header(),
            json={"platform": "linkedin", "format": "text_post", "source": SOURCE_DRAFT},
        )
    assert response.status_code == 200
    assert generate.call_count == 1
