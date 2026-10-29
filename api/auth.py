from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Optional

import jwt
from fastapi import Depends, Header, HTTPException, status
from jwt import PyJWKClient

from api.config import Settings, get_settings

HS256 = "HS256"
ASYMMETRIC = frozenset({"ES256", "RS256"})
ALLOWED_ALGS = frozenset({HS256, *ASYMMETRIC})


class CurrentUser:
    def __init__(self, user_id: str, email: Optional[str] = None, token: str = ""):
        self.id = user_id
        self.email = email
        self.token = token


class TokenError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def issuer_from_url(supabase_url: str) -> str:
    return f"{supabase_url.rstrip('/')}/auth/v1"


def jwks_url(supabase_url: str) -> str:
    return f"{issuer_from_url(supabase_url)}/.well-known/jwks.json"


@lru_cache
def _jwks_client(url: str) -> PyJWKClient:
    return PyJWKClient(url, cache_keys=True, lifespan=300)


def _http_for_token_error(error: TokenError) -> HTTPException:
    code = status.HTTP_503_SERVICE_UNAVAILABLE if error.code == "unconfigured" else status.HTTP_401_UNAUTHORIZED
    return HTTPException(status_code=code, detail=error.message)


def decode_access_token(
    token: str,
    settings: Settings,
    *,
    signing_key=None,
) -> dict:
    token = (token or "").strip()
    if not token:
        raise TokenError("missing", "Missing bearer token.")
    if not settings.auth_configured:
        raise TokenError(
            "unconfigured",
            "Supabase JWT verification is not configured. Set SUPABASE_URL for JWKS or SUPABASE_JWT_SECRET for legacy HS256.",
        )
    try:
        header = jwt.get_unverified_header(token)
    except jwt.DecodeError as exc:
        raise TokenError("malformed", "The session token is malformed.") from exc

    alg = header.get("alg")
    if not isinstance(alg, str) or alg.lower() == "none" or alg not in ALLOWED_ALGS:
        raise TokenError("unsupported_alg", "The session token uses an unsupported signing method.")

    options = {
        "require": ["exp", "sub"],
        "verify_aud": True,
        "verify_signature": True,
    }
    kwargs = {
        "algorithms": [alg],
        "audience": "authenticated",
        "leeway": 30,
        "options": options,
    }
    if alg in ASYMMETRIC and settings.supabase_url:
        kwargs["issuer"] = issuer_from_url(settings.supabase_url)

    try:
        if alg == HS256:
            if not settings.supabase_jwt_secret:
                raise TokenError(
                    "unconfigured",
                    "Legacy HS256 tokens require SUPABASE_JWT_SECRET on the API server.",
                )
            key = settings.supabase_jwt_secret
        else:
            if signing_key is not None:
                key = signing_key
            else:
                if not settings.supabase_url:
                    raise TokenError(
                        "unconfigured",
                        "Asymmetric Supabase tokens require SUPABASE_URL so the API can load JWKS.",
                    )
                client = _jwks_client(jwks_url(settings.supabase_url))
                key = client.get_signing_key_from_jwt(token).key
        return jwt.decode(token, key, **kwargs)
    except TokenError:
        raise
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("expired", "Your session has expired. Sign in again.") from exc
    except jwt.InvalidAudienceError as exc:
        raise TokenError("bad_audience", "The session token audience is not valid for this API.") from exc
    except jwt.InvalidIssuerError as exc:
        raise TokenError("bad_issuer", "The session token issuer does not match this Supabase project.") from exc
    except jwt.InvalidSignatureError as exc:
        raise TokenError("bad_signature", "The session token signature is invalid.") from exc
    except jwt.PyJWTError as exc:
        raise TokenError("invalid", "The session token could not be verified.") from exc


def require_user(
    authorization: Annotated[Optional[str], Header()] = None,
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    if not settings.auth_configured:
        raise _http_for_token_error(
            TokenError(
                "unconfigured",
                "Supabase JWT verification is not configured. Set SUPABASE_URL for JWKS or SUPABASE_JWT_SECRET for legacy HS256.",
            )
        )
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
        )
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_access_token(token, settings)
    except TokenError as exc:
        raise _http_for_token_error(exc) from exc
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is missing a user id.",
        )
    return CurrentUser(user_id=str(user_id), email=payload.get("email"), token=token)
