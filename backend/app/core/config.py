from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Competitive Programming Coach"
    DATABASE_URL: str = "postgresql+asyncpg://cp_user:cp_password@localhost:5432/cp_coach"
    QDRANT_URL: str = "http://localhost:6333"
    NVIDIA_API_KEY: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
