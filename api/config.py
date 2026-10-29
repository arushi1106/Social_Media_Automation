from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    api_host: str = "127.0.0.1"
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    supabase_url: str = ""
    supabase_jwt_secret: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def openai_configured(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def auth_configured(self) -> bool:
        return bool(self.supabase_url or self.supabase_jwt_secret)

    @property
    def jwt_hs256_configured(self) -> bool:
        return bool(self.supabase_jwt_secret)

    @property
    def jwt_jwks_configured(self) -> bool:
        return bool(self.supabase_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()
