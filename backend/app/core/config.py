import os
from pathlib import Path
from pydantic import ConfigDict
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent.parent

class Settings(BaseSettings):
    PROJECT_NAME: str = "Metropolitan Bus Seat Prediction & Travel Analysis Platform"
    API_V1_PREFIX: str = "/api/v1"
    
    # TimescaleDB / PostgreSQL
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "bus_user")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "bus_password")
    POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", "localhost")
    POSTGRES_PORT: str = os.getenv("POSTGRES_PORT", "5432")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "bus_telemetry_db")
    
    @property
    def ASYNC_DATABASE_URL(self) -> str:
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
    
    @property
    def SYNC_DATABASE_URL(self) -> str:
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # Model save dir
    MODEL_DIR: Path = BASE_DIR / "app" / "ml" / "saved_models"
    
    # GBIS Public Portal API
    GBIS_BASE_URL: str = "http://apis.data.go.kr/6410000"
    TOPIS_BASE_URL: str = "http://ws.bus.go.kr/api/rest"
    
    # Target Route (경기여객 1650번: 구리수택차고지 ↔ 잠실역 ↔ 안양역)
    TARGET_ROUTE_NAME: str = "1650"
    TARGET_ROUTE_ID: str = "234000050"  # Official GBIS Gyeonggi Route ID for 1650 (경기여객 구리 면허)
    TARGET_COMPANY_NAME: str = "경기여객"
    TARGET_START_STATION: str = "구리수택차고지"
    TARGET_END_STATION: str = "안양역"

    # User's Public Data Portal API Key
    DEFAULT_PUBLIC_API_KEY: str = "CKyLU7WpUcNBXIUKMzYPM53tsCXlp1ybg7YxKmp1MHaItmBxnfGSKxXFKgkgWxRFcrRcgZ1vlySJ2LNc3OAYrg%3D%3D"

    model_config = ConfigDict(case_sensitive=True)

settings = Settings()
settings.MODEL_DIR.mkdir(parents=True, exist_ok=True)
