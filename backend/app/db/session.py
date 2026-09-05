import logging
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
from app.core.config import settings
from app.db.models import Base

logger = logging.getLogger(__name__)

# Primary TimescaleDB engine
engine = create_async_engine(
    settings.ASYNC_DATABASE_URL,
    echo=False,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False
)

async def init_db():
    """Initializes the database schema and creates hypertable if supported."""
    try:
        async with engine.begin() as conn:
            # Check TimescaleDB extension
            try:
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;"))
                logger.info("TimescaleDB extension enabled.")
            except Exception as e:
                logger.warning(f"Could not enable timescaledb extension (might be already enabled or non-superuser): {e}")

            # Create tables
            await conn.run_sync(Base.metadata.create_all)
            logger.info("All base tables created.")

            # Attempt hypertable conversion
            try:
                await conn.execute(text(
                    "SELECT create_hypertable('raw_bus_telemetry', by_range('recorded_at', INTERVAL '1 day'), if_not_exists => TRUE);"
                ))
                logger.info("TimescaleDB hypertable 'raw_bus_telemetry' ensured.")
            except Exception as e:
                logger.info(f"Hypertable creation notice: {e}")
                
        logger.info("Database initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to connect or initialize TimescaleDB: {e}")
        raise e

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
