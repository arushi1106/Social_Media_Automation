from __future__ import annotations

import json
import re
from typing import Any, Callable, Optional

from openai import OpenAI
from pydantic import BaseModel, Field, ValidationError, field_validator

STUDIO_PLATFORMS = ("linkedin", "instagram")
CONTENT_FORMATS = ("text_post", "caption", "carousel", "script")

FORMATS_BY_PLATFORM: dict[str, tuple[str, ...]] = {
    "linkedin": ("text_post", "carousel", "script"),
    "instagram": ("caption", "carousel", "script"),
}

MAX_TOPIC = 400
MAX_TEXT = 4000
MAX_SOURCE_BODY = 8000
MAX_CUSTOM = 2000
REQUIRED_ALTERNATIVES = 3

REFINE_ACTIONS: dict[str, str] = {
    "conversational": (
        "Rewrite in a more conversational, spoken tone. Keep every factual claim. "
        "Do not add slang that the brand profile would avoid."
    ),
    "professional": (
        "Rewrite in a more professional, precise tone without becoming stiff or generic. "
        "Keep every factual claim."
    ),
    "engaging": (
        "Rewrite to be more engaging: stronger opening, clearer stakes, concrete language. "
        "Do not invent statistics, quotes, or personal experiences."
    ),
    "shorten": (
        "Shorten substantially while keeping the core message, opening hook, and call to action. "
        "Cut repetition, not facts."
    ),
    "expand": (
        "Expand with more useful detail, examples, and explanation. "
        "Do not invent statistics, quotes, testimonials, or personal stories."
    ),
    "improve_hook": (
        "Keep the overall piece, platform, and format. Rewrite a stronger opening hook "
        "suited to this platform. Do not change the facts."
    ),
    "improve_cta": (
        "Keep the overall piece, platform, and format. Rewrite a clearer, more specific "
        "call to action. Do not invent offers or URLs."
    ),
    "custom": (
        "Follow the user's custom instructions. Keep the same platform and format. "
        "Do not invent statistics, quotes, or personal experiences."
    ),
}

OpenAICreate = Callable[..., Any]


class BrandContext(BaseModel):
    name: str = ""
    niche: str = ""
    bio: str = ""
    audience: str = ""
    tone: str = ""
    custom_tone: str = ""
    writing_style: str = ""
    avoid: str = ""
    language: str = "English"
    platforms: list[str] = Field(default_factory=list)
    goals: list[str] = Field(default_factory=list)
    topics: list[str] = Field(default_factory=list)


class Slide(BaseModel):
    title: str = ""
    text: str

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Each carousel slide needs text.")
        return cleaned


class ScriptParts(BaseModel):
    hook: str
    body: str
    cta: str

    @field_validator("hook", "body", "cta")
    @classmethod
    def required_part(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Script sections cannot be empty.")
        return cleaned


class GeneratedContent(BaseModel):
    title: str
    body: str = ""
    hashtags: list[str] = Field(default_factory=list)
    slides: list[Slide] = Field(default_factory=list)
    script: Optional[ScriptParts] = None

    @field_validator("title", "body")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("hashtags")
    @classmethod
    def clean_hashtags(cls, value: list[str]) -> list[str]:
        tags: list[str] = []
        for item in value:
            tag = item.strip()
            if not tag:
                continue
            if not tag.startswith("#"):
                tag = f"#{tag.lstrip('#')}"
            if tag.lower() not in {existing.lower() for existing in tags}:
                tags.append(tag)
        return tags[:8]


class GenerationError(ValueError):
    """Raised when the model output cannot be used as a draft."""


def formats_for_platform(platform: str) -> tuple[str, ...]:
    return FORMATS_BY_PLATFORM.get(platform.lower(), ())


def assert_supported(platform: str, content_format: str) -> None:
    platform_key = platform.lower()
    format_key = content_format.lower()
    if platform_key not in STUDIO_PLATFORMS:
        raise ValueError(f"Unsupported platform: {platform}")
    allowed = formats_for_platform(platform_key)
    if format_key not in allowed:
        raise ValueError(f"Unsupported format '{content_format}' for {platform_key}.")


def _clip(value: str, limit: int) -> str:
    return (value or "").strip()[:limit]


def build_brand_block(brand: BrandContext) -> str:
    lines: list[str] = []
    if brand.name:
        lines.append(f"Creator/brand: {brand.name}")
    if brand.niche:
        lines.append(f"Niche: {brand.niche}")
    if brand.bio:
        lines.append(f"Bio: {_clip(brand.bio, 600)}")
    if brand.audience:
        lines.append(f"Audience: {_clip(brand.audience, 400)}")
    tone = brand.custom_tone if brand.tone == "custom" and brand.custom_tone else brand.tone
    if tone:
        lines.append(f"Tone: {tone}")
    if brand.writing_style:
        lines.append(f"Writing style: {_clip(brand.writing_style, 400)}")
    if brand.avoid:
        lines.append(f"Avoid: {_clip(brand.avoid, 400)}")
    if brand.language:
        lines.append(f"Language: {brand.language}")
    if brand.goals:
        lines.append(f"Content goals: {', '.join(brand.goals)}")
    if brand.topics:
        lines.append(f"Preferred topics: {', '.join(brand.topics[:12])}")
    if brand.platforms:
        lines.append(f"Publishing platforms (do not post): {', '.join(brand.platforms)}")
    return "\n".join(lines) if lines else "Brand details were not provided. Write clearly and specifically."


def format_instructions(platform: str, content_format: str) -> str:
    if content_format == "text_post":
        return (
            "Return JSON with title and body. Body is a LinkedIn text post: a hook plus 2-4 short paragraphs. "
            "No hashtag dump, no emoji spam, no 'as an AI'."
        )
    if content_format == "caption":
        return (
            "Return JSON with title, body (Instagram caption), and hashtags (array, max 5). "
            "Caption has a hook, a short body, and a closing line."
        )
    if content_format == "carousel":
        return (
            "Return JSON with title, body (one-sentence overview), and slides: an array of 4 to 6 objects "
            "with title and text. Each slide is concise. This is an outline, not a design file."
        )
    if content_format == "script":
        return (
            "Return JSON with title, body (short logline), and script: {hook, body, cta} for a short vertical video. "
            "Hook in the first 2 seconds of spoken text."
        )
    raise ValueError(f"Unsupported format: {content_format}")


def build_studio_messages(
    *,
    platform: str,
    content_format: str,
    topic: str,
    key_points: str = "",
    call_to_action: str = "",
    keywords: str = "",
    extra_instructions: str = "",
    brand: Optional[BrandContext] = None,
) -> list[dict[str, str]]:
    assert_supported(platform, content_format)
    topic = _clip(topic, MAX_TOPIC)
    if not topic:
        raise ValueError("Topic or brief is required.")

    system = (
        "You write original social drafts for a human creator. "
        "Do not mention that you are an AI. Never instruct the user to publish. "
        "Never produce LinkedIn, Instagram, or Meta API payloads. "
        "Never claim the draft was posted. "
        "Respond with a single JSON object only. "
        f"Platform: {platform}. Format: {content_format}. "
        f"{format_instructions(platform, content_format)}"
    )
    user_parts = [
        "Brand profile:",
        build_brand_block(brand or BrandContext()),
        "",
        f"Topic / brief: {topic}",
    ]
    if key_points:
        user_parts.append(f"Key points: {_clip(key_points, MAX_TEXT)}")
    if call_to_action:
        user_parts.append(f"Call to action: {_clip(call_to_action, 300)}")
    if keywords:
        user_parts.append(f"Keywords / hashtag hints: {_clip(keywords, 300)}")
    if extra_instructions:
        user_parts.append(f"Additional direction: {_clip(extra_instructions, MAX_TEXT)}")
    user_parts.append("Write in the brand's language when one is provided.")

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": "\n".join(user_parts)},
    ]


def extract_json_object(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if not text:
        raise GenerationError("The model returned an empty response.")
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text, flags=re.IGNORECASE).strip()
        text = re.sub(r"```$", "", text).strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise GenerationError("The model did not return valid JSON.") from exc
    if not isinstance(parsed, dict):
        raise GenerationError("The model JSON must be an object.")
    return parsed


def validate_generated_content(data: dict[str, Any], content_format: str) -> GeneratedContent:
    try:
        content = GeneratedContent.model_validate(data)
    except ValidationError as exc:
        raise GenerationError("The model JSON was missing required draft fields.") from exc

    fmt = content_format.lower()
    if fmt in {"text_post", "caption"} and len(content.body) < 20:
        raise GenerationError("The draft body was too short to use.")
    if fmt == "caption" and not content.body:
        raise GenerationError("A caption needs body text.")
    if fmt == "carousel":
        if len(content.slides) < 3:
            raise GenerationError("A carousel outline needs at least three slides.")
        content.slides = content.slides[:8]
        if not content.body:
            content.body = " ".join(slide.text for slide in content.slides[:2])
    if fmt == "script":
        if content.script is None:
            raise GenerationError("A short-video script needs hook, body, and call to action.")
        if not content.body:
            content.body = content.script.hook
    if not content.title:
        raise GenerationError("The draft is missing a title.")
    return content


def request_json_completion(
    *,
    api_key: str,
    model: str,
    messages: list[dict[str, str]],
    openai_create: Optional[OpenAICreate] = None,
    temperature: float = 0.7,
) -> dict[str, Any]:
    if openai_create is None:
        client = OpenAI(api_key=api_key, timeout=45.0)
        openai_create = client.chat.completions.create
    response = openai_create(
        model=model,
        messages=messages,
        response_format={"type": "json_object"},
        temperature=temperature,
    )
    raw = (response.choices[0].message.content or "").strip()
    return extract_json_object(raw)


def as_draft_payload(
    content: GeneratedContent,
    platform: str,
    content_format: str,
    model: str,
) -> dict[str, Any]:
    payload = content.model_dump()
    payload.update(
        {
            "platform": platform.lower(),
            "format": content_format.lower(),
            "status": "draft",
            "model": model,
        }
    )
    return payload


def serialize_source(content: GeneratedContent) -> str:
    lines = [f"Title: {content.title}", f"Body: {_clip(content.body, MAX_SOURCE_BODY)}"]
    if content.hashtags:
        lines.append("Hashtags: " + " ".join(content.hashtags))
    for index, slide in enumerate(content.slides, start=1):
        lines.append(f"Slide {index}: {slide.title} — {slide.text}")
    if content.script:
        lines.append(f"Script hook: {content.script.hook}")
        lines.append(f"Script body: {content.script.body}")
        lines.append(f"Script CTA: {content.script.cta}")
    return "\n".join(lines)


def assert_refine_action(action: str) -> str:
    key = (action or "").strip().lower()
    if key not in REFINE_ACTIONS:
        raise ValueError(f"Unsupported refinement action: {action}")
    return key


def assert_repurpose_target(
    source_platform: str,
    source_format: str,
    target_platform: str,
    target_format: str,
) -> None:
    assert_supported(source_platform, source_format)
    assert_supported(target_platform, target_format)
    if source_platform.lower() == target_platform.lower() and source_format.lower() == target_format.lower():
        raise ValueError("Choose a different platform or format to repurpose.")


def validate_source_draft(data: dict[str, Any], content_format: str) -> GeneratedContent:
    try:
        return validate_generated_content(data, content_format)
    except GenerationError as exc:
        raise ValueError(str(exc)) from exc


def _rewrite_system(platform: str, content_format: str) -> str:
    return (
        "You rewrite existing social drafts for a human creator. "
        "Do not mention that you are an AI. Never instruct the user to publish. "
        "Never produce LinkedIn, Instagram, or Meta API payloads. "
        "Never claim the draft was posted. "
        "Do not invent statistics, quotes, testimonials, or personal experiences. "
        "Preserve the creator's key message and factual details. "
        "Respond with a single JSON object only. "
        f"Platform: {platform}. Format: {content_format}. "
        f"{format_instructions(platform, content_format)}"
    )


def build_refine_messages(
    *,
    platform: str,
    content_format: str,
    source: GeneratedContent,
    action: str,
    custom_instructions: str = "",
    brand: Optional[BrandContext] = None,
) -> list[dict[str, str]]:
    assert_supported(platform, content_format)
    action_key = assert_refine_action(action)
    custom = _clip(custom_instructions, MAX_CUSTOM)
    if action_key == "custom" and not custom:
        raise ValueError("Custom instructions are required for a custom rewrite.")

    user_parts = [
        "Brand profile:",
        build_brand_block(brand or BrandContext()),
        "",
        "Current draft (keep this platform and format):",
        serialize_source(source),
        "",
        f"Rewrite action: {action_key}",
        REFINE_ACTIONS[action_key],
    ]
    if custom:
        user_parts.append(f"Custom instructions: {custom}")
    user_parts.append("Write in the brand's language when one is provided.")
    return [
        {"role": "system", "content": _rewrite_system(platform, content_format)},
        {"role": "user", "content": "\n".join(user_parts)},
    ]


def build_variations_messages(
    *,
    platform: str,
    content_format: str,
    source: GeneratedContent,
    custom_instructions: str = "",
    brand: Optional[BrandContext] = None,
) -> list[dict[str, str]]:
    assert_supported(platform, content_format)
    system = (
        "You write three distinct rewrites of an existing social draft. "
        "Do not mention that you are an AI. Never instruct the user to publish. "
        "Never produce LinkedIn, Instagram, or Meta API payloads. "
        "Do not invent statistics, quotes, testimonials, or personal experiences. "
        "Preserve the core message and factual details. "
        "Each alternative must use different wording and structure. "
        "Respond with a single JSON object: "
        '{"alternatives": [draft, draft, draft]} where each draft matches the format schema. '
        "Return exactly three alternatives. "
        f"Platform: {platform}. Format: {content_format}. "
        f"{format_instructions(platform, content_format)}"
    )
    user_parts = [
        "Brand profile:",
        build_brand_block(brand or BrandContext()),
        "",
        "Current draft:",
        serialize_source(source),
        "",
        "Produce exactly three distinct alternatives for the same platform and format.",
    ]
    custom = _clip(custom_instructions, MAX_CUSTOM)
    if custom:
        user_parts.append(f"Additional direction: {custom}")
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": "\n".join(user_parts)},
    ]


def build_repurpose_messages(
    *,
    source_platform: str,
    source_format: str,
    target_platform: str,
    target_format: str,
    source: GeneratedContent,
    custom_instructions: str = "",
    brand: Optional[BrandContext] = None,
) -> list[dict[str, str]]:
    assert_repurpose_target(source_platform, source_format, target_platform, target_format)
    system = _rewrite_system(target_platform, target_format)
    user_parts = [
        "Brand profile:",
        build_brand_block(brand or BrandContext()),
        "",
        f"Source platform: {source_platform}. Source format: {source_format}.",
        "Source draft:",
        serialize_source(source),
        "",
        f"Rewrite this as a native {target_platform} {target_format}.",
        "Adapt structure, length, tone, and call to action for the target platform.",
        "Do not merely append hashtags or swap platform names.",
        "Keep the key message and factual details. Do not invent new claims.",
    ]
    custom = _clip(custom_instructions, MAX_CUSTOM)
    if custom:
        user_parts.append(f"Additional direction: {custom}")
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": "\n".join(user_parts)},
    ]


def validate_three_alternatives(data: dict[str, Any], content_format: str) -> list[GeneratedContent]:
    alternatives = data.get("alternatives")
    if not isinstance(alternatives, list) or len(alternatives) != REQUIRED_ALTERNATIVES:
        raise GenerationError("The model must return exactly three alternatives.")
    validated: list[GeneratedContent] = []
    signatures: list[str] = []
    for item in alternatives:
        if not isinstance(item, dict):
            raise GenerationError("Each alternative must be a JSON object.")
        content = validate_generated_content(item, content_format)
        signature = " ".join(
            [
                content.title.lower(),
                content.body.lower(),
                " ".join(slide.text.lower() for slide in content.slides),
                (content.script.hook.lower() if content.script else ""),
            ]
        ).strip()
        signatures.append(signature)
        validated.append(content)
    if len(set(signatures)) != REQUIRED_ALTERNATIVES:
        raise GenerationError("The three alternatives were too similar to use.")
    return validated


def generate_studio_draft(
    *,
    api_key: str,
    model: str,
    platform: str,
    content_format: str,
    topic: str,
    key_points: str = "",
    call_to_action: str = "",
    keywords: str = "",
    extra_instructions: str = "",
    brand: Optional[BrandContext] = None,
    openai_create: Optional[OpenAICreate] = None,
) -> dict[str, Any]:
    messages = build_studio_messages(
        platform=platform,
        content_format=content_format,
        topic=topic,
        key_points=key_points,
        call_to_action=call_to_action,
        keywords=keywords,
        extra_instructions=extra_instructions,
        brand=brand,
    )
    parsed = request_json_completion(
        api_key=api_key,
        model=model,
        messages=messages,
        openai_create=openai_create,
    )
    content = validate_generated_content(parsed, content_format)
    return as_draft_payload(content, platform, content_format, model)


def generate_refinement(
    *,
    api_key: str,
    model: str,
    platform: str,
    content_format: str,
    source: dict[str, Any],
    action: str,
    custom_instructions: str = "",
    brand: Optional[BrandContext] = None,
    openai_create: Optional[OpenAICreate] = None,
) -> dict[str, Any]:
    draft = validate_source_draft(source, content_format)
    messages = build_refine_messages(
        platform=platform,
        content_format=content_format,
        source=draft,
        action=action,
        custom_instructions=custom_instructions,
        brand=brand,
    )
    parsed = request_json_completion(
        api_key=api_key,
        model=model,
        messages=messages,
        openai_create=openai_create,
        temperature=0.6,
    )
    content = validate_generated_content(parsed, content_format)
    return as_draft_payload(content, platform, content_format, model)


def generate_variations(
    *,
    api_key: str,
    model: str,
    platform: str,
    content_format: str,
    source: dict[str, Any],
    custom_instructions: str = "",
    brand: Optional[BrandContext] = None,
    openai_create: Optional[OpenAICreate] = None,
) -> list[dict[str, Any]]:
    draft = validate_source_draft(source, content_format)
    messages = build_variations_messages(
        platform=platform,
        content_format=content_format,
        source=draft,
        custom_instructions=custom_instructions,
        brand=brand,
    )
    parsed = request_json_completion(
        api_key=api_key,
        model=model,
        messages=messages,
        openai_create=openai_create,
        temperature=0.85,
    )
    alternatives = validate_three_alternatives(parsed, content_format)
    return [as_draft_payload(item, platform, content_format, model) for item in alternatives]


def generate_repurpose(
    *,
    api_key: str,
    model: str,
    source_platform: str,
    source_format: str,
    target_platform: str,
    target_format: str,
    source: dict[str, Any],
    custom_instructions: str = "",
    brand: Optional[BrandContext] = None,
    openai_create: Optional[OpenAICreate] = None,
) -> dict[str, Any]:
    draft = validate_source_draft(source, source_format)
    messages = build_repurpose_messages(
        source_platform=source_platform,
        source_format=source_format,
        target_platform=target_platform,
        target_format=target_format,
        source=draft,
        custom_instructions=custom_instructions,
        brand=brand,
    )
    parsed = request_json_completion(
        api_key=api_key,
        model=model,
        messages=messages,
        openai_create=openai_create,
        temperature=0.7,
    )
    content = validate_generated_content(parsed, target_format)
    return as_draft_payload(content, target_platform, target_format, model)


MIN_IDEAS = 3
MAX_IDEAS = 8
DEFAULT_IDEAS = 5
MAX_THEME = 400

DISCOVERY_OBJECTIVES: dict[str, str] = {
    "education": "Help the audience learn a specific, practical point.",
    "engagement": "Invite conversation, saves, or comments without clickbait.",
    "storytelling": "Frame a narrative the creator could tell from their work, without inventing personal events.",
    "thought_leadership": "Take a clear point of view on a problem in the niche.",
}


class ContentIdea(BaseModel):
    title: str
    concept: str
    why_relevant: str
    angle: str
    hook: str
    format: str
    call_to_action: str = ""
    pillar: str = ""
    platform: str

    @field_validator("title", "concept", "why_relevant", "angle", "hook", "format", "platform")
    @classmethod
    def required_idea_text(cls, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            raise ValueError("Idea fields cannot be empty.")
        return cleaned[:400] if len(cleaned) > 400 else cleaned

    @field_validator("call_to_action", "pillar")
    @classmethod
    def optional_idea_text(cls, value: str) -> str:
        return (value or "").strip()[:300]


def assert_discovery_count(count: int) -> int:
    if count < MIN_IDEAS or count > MAX_IDEAS:
        raise ValueError(f"Ask for between {MIN_IDEAS} and {MAX_IDEAS} ideas.")
    return count


def assert_discovery_objective(objective: str) -> str:
    key = (objective or "").strip().lower()
    if not key:
        return ""
    if key not in DISCOVERY_OBJECTIVES:
        raise ValueError(f"Unsupported content objective: {objective}")
    return key


def allowed_idea_platforms(brand: Optional[BrandContext], requested: str = "") -> list[str]:
    requested_key = (requested or "").strip().lower()
    brand_platforms = [item.lower() for item in (brand.platforms if brand else []) if item]
    if requested_key:
        if requested_key not in STUDIO_PLATFORMS:
            raise ValueError(f"Unsupported platform: {requested}")
        if brand_platforms and requested_key not in brand_platforms:
            raise ValueError("That platform is not in your brand profile.")
        return [requested_key]
    filtered = [item for item in brand_platforms if item in STUDIO_PLATFORMS]
    return filtered or list(STUDIO_PLATFORMS)


def validate_content_idea(data: dict[str, Any], allowed_platforms: list[str]) -> ContentIdea:
    try:
        idea = ContentIdea.model_validate(data)
    except ValidationError as exc:
        raise GenerationError("The model JSON was missing required idea fields.") from exc
    platform = idea.platform.lower()
    if platform not in allowed_platforms:
        raise GenerationError("An idea targeted an unsupported platform.")
    try:
        assert_supported(platform, idea.format)
    except ValueError as exc:
        raise GenerationError(str(exc)) from exc
    return idea


def validate_content_ideas(data: dict[str, Any], count: int, allowed_platforms: list[str]) -> list[ContentIdea]:
    items = data.get("ideas")
    if not isinstance(items, list) or len(items) != count:
        raise GenerationError(f"The model must return exactly {count} ideas.")
    validated: list[ContentIdea] = []
    titles: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            raise GenerationError("Each idea must be a JSON object.")
        idea = validate_content_idea(item, allowed_platforms)
        key = idea.title.lower()
        if key in titles:
            raise GenerationError("The ideas were too similar to use.")
        titles.append(key)
        validated.append(idea)
    return validated


def build_discovery_messages(
    *,
    count: int,
    theme: str = "",
    platform: str = "",
    objective: str = "",
    brand: Optional[BrandContext] = None,
) -> list[dict[str, str]]:
    count = assert_discovery_count(count)
    objective_key = assert_discovery_objective(objective)
    allowed = allowed_idea_platforms(brand, platform)
    format_lines = [
        f"- {item}: {', '.join(FORMATS_BY_PLATFORM[item])}" for item in allowed
    ]
    system = (
        "You suggest original social content ideas for a human creator. "
        "These are suggestions, not performance predictions. "
        "Do not invent trend data, search volume, follower counts, or audience statistics. "
        "Do not invent personal experiences or unverified claims. "
        "Do not mention that you are an AI. Never instruct the user to publish. "
        "Never produce LinkedIn, Instagram, or Meta API payloads. "
        "Respond with a single JSON object: "
        '{"ideas": [idea, ...]} with exactly the requested number of ideas. '
        "Each idea object must include: title, concept, why_relevant, angle, hook, "
        "format, call_to_action, pillar, platform."
    )
    user_parts = [
        "Brand profile:",
        build_brand_block(brand or BrandContext()),
        "",
        f"Return exactly {count} distinct ideas.",
        "Allowed platforms and formats:",
        *format_lines,
    ]
    theme_text = _clip(theme, MAX_THEME)
    if theme_text:
        user_parts.append(f"Optional theme or campaign: {theme_text}")
    if objective_key:
        user_parts.append(f"Content objective: {objective_key}. {DISCOVERY_OBJECTIVES[objective_key]}")
    user_parts.append("Write in the brand's language when one is provided.")
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": "\n".join(user_parts)},
    ]


def generate_content_ideas(
    *,
    api_key: str,
    model: str,
    count: int = DEFAULT_IDEAS,
    theme: str = "",
    platform: str = "",
    objective: str = "",
    brand: Optional[BrandContext] = None,
    openai_create: Optional[OpenAICreate] = None,
) -> list[dict[str, Any]]:
    count = assert_discovery_count(count)
    allowed = allowed_idea_platforms(brand, platform)
    messages = build_discovery_messages(
        count=count,
        theme=theme,
        platform=platform,
        objective=objective,
        brand=brand,
    )
    parsed = request_json_completion(
        api_key=api_key,
        model=model,
        messages=messages,
        openai_create=openai_create,
        temperature=0.8,
    )
    ideas = validate_content_ideas(parsed, count, allowed)
    payloads: list[dict[str, Any]] = []
    for idea in ideas:
        item = idea.model_dump()
        item["platform"] = idea.platform.lower()
        item["format"] = idea.format.lower()
        item["status"] = "suggestion"
        item["model"] = model
        payloads.append(item)
    return payloads


# Kept for older unit tests that described the source-to-blog path.
PLATFORM_INSTRUCTIONS = {
    "linkedin": "Write a LinkedIn post: 1 short hook, 2-4 short paragraphs, no hashtag dump, no emoji spam.",
    "instagram": "Write an Instagram caption: a hook, a short body, and a clear closing line. Limit hashtags to 5.",
}


def build_messages(
    *,
    platform: str,
    source_title: str,
    source_text: str,
    brand_voice: Optional[str] = None,
    extra_instructions: Optional[str] = None,
) -> list[dict[str, str]]:
    brand = BrandContext(tone=brand_voice or "", writing_style=brand_voice or "")
    content_format = "text_post" if platform.lower() == "linkedin" else "caption"
    if platform.lower() not in STUDIO_PLATFORMS:
        raise ValueError(f"Unsupported platform: {platform}")
    return build_studio_messages(
        platform=platform.lower(),
        content_format=content_format,
        topic=source_title or "Untitled",
        key_points=source_text,
        extra_instructions=extra_instructions or "",
        brand=brand,
    )
