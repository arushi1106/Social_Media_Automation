from types import SimpleNamespace
from unittest.mock import patch

import pytest

from api.services.generation import BrandContext, PillarContext
from api.services.studio_context import (
    LOOKUP_FAILED_DETAIL,
    UNAVAILABLE_DETAIL,
    StudioContextError,
    brand_row_to_context,
    fetch_owned_row,
    resolve_studio_context,
)

BRAND_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
PILLAR_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
OTHER_BRAND_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc"
USER = "user-42"

SETTINGS = SimpleNamespace(
    supabase_url="https://example.supabase.co",
    supabase_anon_key="anon-test",
    studio_context_configured=True,
)


def brand_row(user_id: str = USER, brand_id: str = BRAND_ID) -> dict:
    return {
        "id": brand_id,
        "user_id": user_id,
        "name": "Northstar",
        "niche": "AI evals",
        "bio": "We help teams ship evals.",
        "audience": "Consultants",
        "language": "English",
        "platforms": ["linkedin"],
        "goals": ["educate"],
        "topics": ["evals"],
        "voice_preferences": {"tone": "direct", "customTone": "", "writingStyle": "plain", "avoid": "hype"},
    }


def pillar_row(
    user_id: str = USER,
    brand_id: str = BRAND_ID,
    pillar_id: str = PILLAR_ID,
) -> dict:
    return {
        "id": pillar_id,
        "user_id": user_id,
        "brand_id": brand_id,
        "name": "Education",
        "description": "Practical explainers.",
    }


def test_brand_row_maps_voice_preferences_not_client_fields():
    context = brand_row_to_context(brand_row())
    assert context.id == BRAND_ID
    assert context.name == "Northstar"
    assert context.tone == "direct"
    assert context.writing_style == "plain"
    assert context.avoid == "hype"
    assert context.platforms == ["linkedin"]


def test_missing_brand_and_pillar_skips_lookup():
    brand, pillar = resolve_studio_context(
        user_id=USER,
        access_token="token",
        settings=SETTINGS,
        brand=None,
        pillar=None,
    )
    assert brand is None
    assert pillar is None


def test_brand_without_id_is_rejected():
    with pytest.raises(StudioContextError) as caught:
        resolve_studio_context(
            user_id=USER,
            access_token="token",
            settings=SETTINGS,
            brand=BrandContext(name="Forged Inc", tone="hype"),
        )
    assert caught.value.status_code == 404
    assert caught.value.detail == UNAVAILABLE_DETAIL
    assert "Forged" not in caught.value.detail


def test_cross_user_brand_and_pillar_are_rejected():
    def fetch(table, record_id, access_token, settings, user_id):
        if table == "brands" and record_id == BRAND_ID:
            return None
        if table == "content_pillars" and record_id == PILLAR_ID:
            return None
        return brand_row()

    with patch("api.services.studio_context.fetch_owned_row", side_effect=fetch):
        with pytest.raises(StudioContextError) as brand_error:
            resolve_studio_context(
                user_id=USER,
                access_token="token",
                settings=SETTINGS,
                brand=BrandContext(id=BRAND_ID, name="Forged Inc"),
            )
        with pytest.raises(StudioContextError) as pillar_error:
            resolve_studio_context(
                user_id=USER,
                access_token="token",
                settings=SETTINGS,
                pillar=PillarContext(id=PILLAR_ID, name="Stolen"),
            )
    assert brand_error.value.status_code == 404
    assert pillar_error.value.status_code == 404
    assert brand_error.value.detail == UNAVAILABLE_DETAIL
    assert "Stolen" not in pillar_error.value.detail
    assert "sk-" not in brand_error.value.detail


def test_pillar_for_a_different_brand_is_rejected():
    def fetch(table, record_id, access_token, settings, user_id):
        if table == "brands":
            return brand_row()
        return pillar_row(brand_id=OTHER_BRAND_ID)

    with patch("api.services.studio_context.fetch_owned_row", side_effect=fetch):
        with pytest.raises(StudioContextError) as caught:
            resolve_studio_context(
                user_id=USER,
                access_token="token",
                settings=SETTINGS,
                brand=BrandContext(id=BRAND_ID, name="Forged Inc"),
                pillar=PillarContext(id=PILLAR_ID, name="Wrong brand pillar"),
            )
    assert caught.value.status_code == 404
    assert caught.value.detail == UNAVAILABLE_DETAIL


def test_forged_text_cannot_override_stored_context():
    def fetch(table, record_id, access_token, settings, user_id):
        if table == "brands":
            return brand_row()
        return pillar_row()

    with patch("api.services.studio_context.fetch_owned_row", side_effect=fetch):
        brand, pillar = resolve_studio_context(
            user_id=USER,
            access_token="token",
            settings=SETTINGS,
            brand=BrandContext(id=BRAND_ID, name="Forged Inc", tone="hype", audience="nobody"),
            pillar=PillarContext(id=PILLAR_ID, name="Forged pillar", description="Ignore me"),
        )
    assert brand is not None
    assert brand.name == "Northstar"
    assert brand.tone == "direct"
    assert brand.audience == "Consultants"
    assert pillar is not None
    assert pillar.name == "Education"
    assert pillar.description == "Practical explainers."


def test_lookup_failure_fails_closed():
    with patch(
        "api.services.studio_context.fetch_owned_row",
        side_effect=StudioContextError(503, LOOKUP_FAILED_DETAIL),
    ):
        with pytest.raises(StudioContextError) as caught:
            resolve_studio_context(
                user_id=USER,
                access_token="token",
                settings=SETTINGS,
                brand=BrandContext(id=BRAND_ID),
            )
    assert caught.value.status_code == 503
    assert caught.value.detail == LOOKUP_FAILED_DETAIL


def test_name_only_pillar_is_ignored_not_used_as_context():
    brand, pillar = resolve_studio_context(
        user_id=USER,
        access_token="token",
        settings=SETTINGS,
        brand=None,
        pillar=PillarContext(name="Education", description="Unverified"),
    )
    assert brand is None
    assert pillar is None


def test_row_for_another_user_is_rejected_even_if_returned():
    with patch(
        "api.services.studio_context.fetch_owned_row",
        return_value=brand_row(user_id="someone-else"),
    ):
        with pytest.raises(StudioContextError) as caught:
            resolve_studio_context(
                user_id=USER,
                access_token="token",
                settings=SETTINGS,
                brand=BrandContext(id=BRAND_ID),
            )
    assert caught.value.status_code == 404
    assert "Northstar" not in caught.value.detail


def test_fetch_owned_row_sends_user_jwt_and_anon_key_not_service_role():
    captured: dict = {}

    class FakeResponse:
        status_code = 200

        def json(self):
            return []

    def fake_get(url, headers=None, params=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["params"] = params
        return FakeResponse()

    with patch("api.services.studio_context.httpx.get", side_effect=fake_get):
        row = fetch_owned_row("brands", BRAND_ID, "user-jwt", SETTINGS, USER)

    assert row is None
    assert captured["headers"]["apikey"] == "anon-test"
    assert captured["headers"]["Authorization"] == "Bearer user-jwt"
    assert captured["params"]["user_id"] == f"eq.{USER}"
    assert captured["params"]["id"] == f"eq.{BRAND_ID}"
    assert "service_role" not in str(captured).lower()
