SECRET_SNIPPETS = ("sk-", "service_role", "supabase_jwt_secret", "begin private", "openai_api_key")


def public_error_detail(exc: BaseException, fallback: str) -> str:
    text = str(exc or "").strip()
    lowered = text.lower()
    if not text:
        return fallback
    if any(snippet in lowered for snippet in SECRET_SNIPPETS):
        return fallback
    if len(text) > 280:
        return fallback
    return text
