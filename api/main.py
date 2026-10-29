from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.config import get_settings
from api.routers.content import router as content_router
from api.routers.sources import router as sources_router

settings = get_settings()

app = FastAPI(
    title="Content Studio API",
    description="Source extraction and draft generation. Does not publish to LinkedIn or Instagram.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sources_router)
app.include_router(content_router)


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "service": "content-studio-api",
        "publishes_to_social": False,
        "openai_configured": settings.openai_configured,
        "auth_configured": settings.auth_configured,
        "jwt_jwks_configured": settings.jwt_jwks_configured,
        "jwt_hs256_configured": settings.jwt_hs256_configured,
    }
