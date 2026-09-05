import random
import logging
from typing import List, Dict, Any, Tuple
import numpy as np
from app.core.config import settings
from app.services.seed_service import generate_synthetic_telemetry
from app.ml.feature_extractor import extract_45_features
from app.ml.models import EnsembleSeatPredictor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def build_training_dataset(days: int = 30) -> Tuple[np.ndarray, np.ndarray]:
    """Generates synthetic telemetry and extracts (X, y) feature pairs."""
    logger.info(f"Generating synthetic telemetry for {days} days...")
    telemetry = generate_synthetic_telemetry(days=days, sample_interval_minutes=30)
    
    # Group telemetry by bus run (plate_no and rough time blocks)
    logger.info(f"Generated {len(telemetry)} telemetry records. Extracting 45-feature pairs...")
    
    X_list = []
    y_list = []
    
    for i in range(0, len(telemetry) - 3, 2):
        rec1 = telemetry[i]
        curr_seq = rec1["station_seq"]
        curr_seats = rec1["remain_seat_cnt"]
        speed = float(rec1["speed_kmh"])
        dt = rec1["recorded_at"]
        
        # Pick a target downstream station
        max_target = min(39, curr_seq + random.randint(1, 12))
        if max_target <= curr_seq:
            continue
            
        target_seq = max_target
        # Simulate ground truth seat at target based on commute dynamics
        is_rush = (6 <= dt.hour <= 9 or 17 <= dt.hour <= 20) and dt.weekday() < 5
        burn_per_stop = random.uniform(2.5, 4.2) if is_rush else random.uniform(0.4, 1.2)
        delta_seq = target_seq - curr_seq
        true_seats = max(0, min(45, int(curr_seats - (delta_seq * burn_per_stop) + random.randint(-2, 2))))
        
        feat = extract_45_features(
            current_seq=curr_seq,
            target_seq=target_seq,
            current_seats=curr_seats,
            speed_kmh=speed,
            hour=dt.hour,
            minute=dt.minute,
            day_of_week=dt.weekday()
        )
        
        X_list.append(feat)
        y_list.append(float(true_seats))
        
    X = np.array(X_list, dtype=np.float32)
    y = np.array(y_list, dtype=np.float32)
    logger.info(f"Constructed training set with {len(X)} samples, 45 features each.")
    return X, y

def train_and_save_ensemble(days: int = 20) -> EnsembleSeatPredictor:
    """Trains 3-tree ensemble and 14-class classifier, then saves to disk."""
    X, y = build_training_dataset(days=days)
    predictor = EnsembleSeatPredictor()
    logger.info("Fitting HistGB, ExtraTrees, LightGBM, and 14-Interval Classifier...")
    predictor.fit(X, y)
    
    save_path = settings.MODEL_DIR / "ensemble_model.joblib"
    predictor.save(save_path)
    logger.info(f"Ensemble model successfully saved to {save_path}")
    return predictor

if __name__ == "__main__":
    train_and_save_ensemble(days=20)
