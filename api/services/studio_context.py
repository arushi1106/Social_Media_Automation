from __future__ import annotations

import json
from typing import Any, Optional
from uuid import UUID

import httpx

from api.config import Settings
from api.services.generation import BrandContext, PillarContext

UNAVAILABLE_DETAIL = "That content context is not available."
LOOKUP_FAILED_DETAIL = "Could not verify content context."

BRAND_SELECT = (
    "id,user_id,name,niche,bio,audience,language,platforms,goals,topics,voice_preferences"
)
PILLAR_SELECT = "id,user_id,brand_id,name,description"


class StudioContextError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def parse_record_id(value: str) -> Optional[str]:
    raw = (value or "").strip()
    if not raw:
        return None
    try:
        return str(UUID(raw))
    except ValueError:
        return None


def _voice_map(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def brand_row_to_context(row: dict[str, Any]) -> BrandContext:
    voice = _voice_map(row.get("voice_preferences"))
    platforms = row.get("platforms") or []
    goals = row.get("goals") or []
    topics = row.get("topics") or []
    return BrandContext(
        id=str(row.get("id") or ""),
        name=str(row.get("name") or ""),
        niche=str(row.get("niche") or ""),
        bio=str(row.get("bio") or ""),
        audience=str(row.get("audience") or ""),
        tone=str(voice.get("tone") or ""),
        custom_tone=str(voice.get("customTone") or voice.get("custom_tone") or ""),
        writing_style=str(voice.get("writingStyle") or voice.get("writing_style") or ""),
        avoid=str(voice.get("avoid") or ""),
        language=str(row.get("language") or "English"),
        platforms=[str(item) for item in platforms if item],
        goals=[str(item) for item in goals if item],
        topics=[str(item) for item in topics if item],
    )


def pillar_row_to_context(row: dict[str, Any]) -> PillarContext:
    return PillarContext(
        id=str(row.get("id") or ""),
        name=str(row.get("name") or ""),
        description=str(row.get("description") or ""),
    )


def _as_row(payload: Any) -> Optional[dict[str, Any]]:
    if isinstance(payload, list):
        if not payload:
            return None
        first = payload[0]
        return first if isinstance(first, dict) else None
    if isinstance(payload, dict):
        return payload
    return None


def fetch_owned_row(
    table: str,
    record_id: str,
    access_token: str,
    settings: Settings,
    user_id: str,
) -> Optional[dict[str, Any]]:
    if table not in {"brands", "content_pillars"}:
        raise StudioContextError(503, LOOKUP_FAILED_DETAIL)
    if not settings.studio_context_configured:
        raise StudioContextError(503, LOOKUP_FAILED_DETAIL)
    if not access_token.strip():
        raise StudioContextError(503, LOOKUP_FAILED_DETAIL)

    select = BRAND_SELECT if table == "brands" else PILLAR_SELECT
    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/{table}"
    headers = {
        "apikey": settings.supabase_anon_key,
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    }
    params = {
        "id": f"eq.{record_id}",
        "user_id": f"eq.{user_id}",
        "select": select,
        "limit": "1",
    }
    try:
        response = httpx.get(url, headers=headers, params=params, timeout=8.0)
    except httpx.HTTPError as exc:
        raise StudioContextError(503, LOOKUP_FAILED_DETAIL) from exc

    if response.status_code >= 500:
        raise StudioContextError(503, LOOKUP_FAILED_DETAIL)
    if response.status_code in {401, 403}:
        raise StudioContextError(404, UNAVAILABLE_DETAIL)
    if response.status_code != 200:
        raise StudioContextError(404, UNAVAILABLE_DETAIL)

    try:
        payload = response.json()
    except ValueError as exc:
        raise StudioContextError(503, LOOKUP_FAILED_DETAIL) from exc
    return _as_row(payload)


def _requested_brand_id(brand: Optional[BrandContext]) -> Optional[str]:
    if brand is None:
        return None
    return parse_record_id(brand.id)


def _requested_pillar_id(pillar: Optional[PillarContext]) -> Optional[str]:
    if pillar is None:
        return None
    return parse_record_id(pillar.id)


def _brand_object_present(brand: Optional[BrandContext]) -> bool:
    if brand is None:
        return False
    return bool(
        brand.id
        or brand.name
        or brand.niche
        or brand.bio
        or brand.audience
        or brand.tone
        or brand.custom_tone
        or brand.writing_style
        or brand.avoid
        or brand.platforms
        or brand.goals
        or brand.topics
    )


def _pillar_object_present(pillar: Optional[PillarContext]) -> bool:
    if pillar is None:
        return False
    return bool(pillar.id or pillar.name or pillar.description)


def resolve_studio_context(
    *,
    user_id: str,
    access_token: str,
    settings: Settings,
    brand: Optional[BrandContext] = None,
    pillar: Optional[PillarContext] = None,
) -> tuple[Optional[BrandContext], Optional[PillarContext]]:
    wants_brand = _brand_object_present(brand)
    wants_pillar = _pillar_object_present(pillar)
    if not wants_brand and not wants_pillar:
        return None, None

    brand_id = _requested_brand_id(brand) if wants_brand else None
    if wants_brand and not brand_id:
        raise StudioContextError(404, UNAVAILABLE_DETAIL)

    pillar_id = _requested_pillar_id(pillar) if wants_pillar else None
    if wants_pillar and pillar and (pillar.name or pillar.description) and not pillar_id:
        # Name-only payloads are not stored context; ignore them instead of using the text.
        wants_pillar = False
        pillar_id = None
    if wants_pillar and not pillar_id:
        raise StudioContextError(404, UNAVAILABLE_DETAIL)

    trusted_brand: Optional[BrandContext] = None
    if brand_id:
        row = fetch_owned_row("brands", brand_id, access_token, settings, user_id)
        if not row or str(row.get("user_id") or "") != user_id:
            raise StudioContextError(404, UNAVAILABLE_DETAIL)
        trusted_brand = brand_row_to_context(row)

    trusted_pillar: Optional[PillarContext] = None
    if pillar_id:
        row = fetch_owned_row("content_pillars", pillar_id, access_token, settings, user_id)
        if not row or str(row.get("user_id") or "") != user_id:
            raise StudioContextError(404, UNAVAILABLE_DETAIL)
        if trusted_brand is not None and str(row.get("brand_id") or "") != trusted_brand.id:
            raise StudioContextError(404, UNAVAILABLE_DETAIL)
        trusted_pillar = pillar_row_to_context(row)

    return trusted_brand, trusted_pillar
