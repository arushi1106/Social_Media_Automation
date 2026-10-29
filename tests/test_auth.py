from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from api.auth import TokenError, decode_access_token
from api.config import Settings
from api.main import app

client = TestClient(app)

ISSUER = "https://example.supabase.co/auth/v1"


def _claims(expired: bool = False, aud: str = "authenticated", iss: str = ISSUER, sub: str = "user-1"):
    now = datetime.now(timezone.utc)
    exp = now - timedelta(minutes=5) if expired else now + timedelta(hours=1)
    return {
        "sub": sub,
        "email": "a@example.com",
        "aud": aud,
        "iss": iss,
        "exp": int(exp.timestamp()),
        "role": "authenticated",
    }


def test_hs256_valid_token():
    settings = Settings(supabase_jwt_secret="test-secret", supabase_url="")
    token = jwt.encode(_claims(), "test-secret", algorithm="HS256")
    payload = decode_access_token(token, settings)
    assert payload["sub"] == "user-1"


def test_hs256_expired_token():
    settings = Settings(supabase_jwt_secret="test-secret", supabase_url="")
    token = jwt.encode(_claims(expired=True), "test-secret", algorithm="HS256")
    with pytest.raises(TokenError) as exc:
        decode_access_token(token, settings)
    assert exc.value.code == "expired"


def test_hs256_invalid_signature():
    settings = Settings(supabase_jwt_secret="test-secret", supabase_url="")
    token = jwt.encode(_claims(), "other-secret", algorithm="HS256")
    with pytest.raises(TokenError) as exc:
        decode_access_token(token, settings)
    assert exc.value.code == "bad_signature"


def test_wrong_audience():
    settings = Settings(supabase_jwt_secret="test-secret", supabase_url="")
    token = jwt.encode(_claims(aud="anon"), "test-secret", algorithm="HS256")
    with pytest.raises(TokenError) as exc:
        decode_access_token(token, settings)
    assert exc.value.code == "bad_audience"


def test_unsupported_none_algorithm():
    import base64
    import json

    def b64(data: dict) -> str:
        raw = json.dumps(data, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    settings = Settings(supabase_jwt_secret="test-secret", supabase_url="")
    token = f"{b64({'alg': 'none', 'typ': 'JWT'})}.{b64(_claims())}."
    with pytest.raises(TokenError) as exc:
        decode_access_token(token, settings)
    assert exc.value.code == "unsupported_alg"


def test_es256_valid_token_with_injected_key():
    settings = Settings(supabase_url="https://example.supabase.co", supabase_jwt_secret="")
    key = ec.generate_private_key(ec.SECP256R1())
    token = jwt.encode(_claims(), key, algorithm="ES256")
    payload = decode_access_token(token, settings, signing_key=key.public_key())
    assert payload["sub"] == "user-1"


def test_es256_wrong_issuer():
    settings = Settings(supabase_url="https://example.supabase.co", supabase_jwt_secret="")
    key = ec.generate_private_key(ec.SECP256R1())
    token = jwt.encode(_claims(iss="https://other.supabase.co/auth/v1"), key, algorithm="ES256")
    with pytest.raises(TokenError) as exc:
        decode_access_token(token, settings, signing_key=key.public_key())
    assert exc.value.code == "bad_issuer"


def test_es256_requires_url_even_if_hs256_secret_present():
    settings = Settings(supabase_url="", supabase_jwt_secret="test-secret")
    key = ec.generate_private_key(ec.SECP256R1())
    token = jwt.encode(_claims(), key, algorithm="ES256")
    with pytest.raises(TokenError) as exc:
        decode_access_token(token, settings)
    assert exc.value.code == "unconfigured"


def test_missing_authorization_header():
    response = client.post(
        "/v1/content/generate",
        json={"platform": "linkedin", "format": "text_post", "topic": "hello world"},
        headers={"Authorization": "Bearer"},
    )
    assert response.status_code in (401, 422, 503)
