import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.routes import router as routes_router
from app.api.live import router as live_router
from app.api.analytics import router as analytics_router
from app.api.simulation import router as simulation_router, seat_predictor
from app.ml.models import EnsembleSeatPredictor
from app.db.session import init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("app.main")

import asyncio
from app.services.rolling_data_service import rolling_service

async def daily_rolling_update_worker():
    """Background worker that continuously updates the 90-day rolling window every 24 hours."""
    while True:
        try:
            await asyncio.sleep(86400) # 24 hours
            rolling_service.update_rolling_window()
            logger.info("[AutoUpdate] Daily rolling update completed for Route 1650 3-month empirical data.")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in daily rolling worker: {e}")
            await asyncio.sleep(3600)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.PROJECT_NAME}...")
    
    # Try connecting to TimescaleDB
    try:
        await init_db()
        logger.info("TimescaleDB initialized successfully.")
    except Exception as e:
        logger.warning(f"TimescaleDB connection deferred (will continue with in-memory seed data): {e}")

    # Load ML Model
    model_path = settings.MODEL_DIR / "ensemble_model.joblib"
    if model_path.exists():
        try:
            logger.info(f"Loading pre-trained ensemble model from {model_path}...")
            loaded = EnsembleSeatPredictor.load(model_path)
            seat_predictor.hist_gb = loaded.hist_gb
            seat_predictor.extra_trees = loaded.extra_trees
            seat_predictor.lgbm = loaded.lgbm
            seat_predictor.classifier = loaded.classifier
            seat_predictor.is_trained = loaded.is_trained
        except Exception as e:
            logger.warning(f"Failed to load ensemble model (version mismatch): {e}. Using default heuristic weights.")
    else:
        logger.info("Ensemble model not found on disk. Initializing with default heuristic weights.")

    logger.info(f"1650 Rolling 3-Month Empirical Dataset loaded: {rolling_service.metadata.get('windowStartDate')} ~ {rolling_service.metadata.get('windowEndDate')}")

    # Launch daily rolling update worker
    update_task = asyncio.create_task(daily_rolling_update_worker())

    yield
    update_task.cancel()
    logger.info("Shutting down backend...")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(routes_router, prefix=settings.API_V1_PREFIX)
app.include_router(live_router, prefix=settings.API_V1_PREFIX)
app.include_router(analytics_router, prefix=settings.API_V1_PREFIX)
app.include_router(simulation_router, prefix=settings.API_V1_PREFIX)

@app.get("/")
async def root():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "targetRoute": settings.TARGET_ROUTE_NAME,
        "docsUrl": "/docs"
    }

@app.get("/health")
async def health_check():
    return {"status": "ok", "db": "ready"}
