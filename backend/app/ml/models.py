import os
import logging
from pathlib import Path
from typing import Dict, Any, Tuple
import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor, ExtraTreesRegressor, HistGradientBoostingClassifier
import lightgbm as lgb
from app.core.config import settings
from app.ml.convolution import restore_pmf_from_14_intervals

logger = logging.getLogger(__name__)

def seat_to_interval_class(seat: int) -> int:
    """Maps seat count (0..45) to 14 classes."""
    seat = max(0, min(45, int(seat)))
    if seat <= 10:
        return seat  # 0..10
    elif 11 <= seat <= 20:
        return 11
    elif 21 <= seat <= 30:
        return 12
    else:
        return 13

class EnsembleSeatPredictor:
    """
    3-Tree Ensemble Regression & 14-Class Polynomial Probability Estimator:
    y_ens = 0.40 * HistGB + 0.40 * ExtraTrees + 0.20 * LightGBM
    """
    def __init__(self):
        self.hist_gb: HistGradientBoostingRegressor = None
        self.extra_trees: ExtraTreesRegressor = None
        self.lgbm: lgb.LGBMRegressor = None
        self.classifier: HistGradientBoostingClassifier = None
        self.is_trained: bool = False
        
    def fit(self, X: np.ndarray, y_seats: np.ndarray):
        """Fits ensemble regressors and 14-class interval classifier."""
        # 1. HistGradientBoostingRegressor
        self.hist_gb = HistGradientBoostingRegressor(max_iter=100, random_state=42)
        self.hist_gb.fit(X, y_seats)
        
        # 2. ExtraTreesRegressor
        self.extra_trees = ExtraTreesRegressor(n_estimators=50, max_depth=10, random_state=42, n_jobs=-1)
        self.extra_trees.fit(X, y_seats)
        
        # 3. LightGBM Regressor
        self.lgbm = lgb.LGBMRegressor(n_estimators=80, max_depth=6, learning_rate=0.08, random_state=42, verbose=-1)
        self.lgbm.fit(X, y_seats)
        
        # 4. 14-Class Interval Classifier
        y_classes = np.array([seat_to_interval_class(s) for s in y_seats])
        self.classifier = HistGradientBoostingClassifier(max_iter=80, random_state=42)
        self.classifier.fit(X, y_classes)
        
        self.is_trained = True

    def predict(self, feature_vector: np.ndarray) -> Tuple[float, np.ndarray, np.ndarray]:
        """
        Predicts:
        - expected_seat: float (0..45)
        - interval_probs: 14-element array
        - discrete_pmf: 46-element array (P(S=0) to P(S=45))
        """
        if feature_vector.ndim == 1:
            X = feature_vector.reshape(1, -1)
        else:
            X = feature_vector
            
        if self.is_trained and self.hist_gb is not None:
            pred_hgb = float(self.hist_gb.predict(X)[0])
            pred_et = float(self.extra_trees.predict(X)[0])
            pred_lgb = float(self.lgbm.predict(X)[0])
            pred_seats = 0.40 * pred_hgb + 0.40 * pred_et + 0.20 * pred_lgb
            pred_seats = max(0.0, min(45.0, pred_seats))
            
            # Predict 14 class probabilities
            probs_raw = self.classifier.predict_proba(X)[0]
            # Ensure 14 classes length if some class had 0 instances in train set
            classes = list(self.classifier.classes_)
            interval_probs = np.zeros(14, dtype=np.float64)
            for idx, cls in enumerate(classes):
                if 0 <= cls < 14:
                    interval_probs[cls] = probs_raw[idx]
        else:
            # Fallback heuristic calculation based on feature values
            current_seats = float(feature_vector[0])
            delta_seq = float(feature_vector[7])
            is_rush = float(feature_vector[18]) or float(feature_vector[19])
            burn_rate = 3.5 if is_rush else 0.8
            pred_seats = max(0.0, min(45.0, current_seats - (delta_seq * burn_rate)))
            
            # Synthetic Dirichlet-like distribution around pred_seats
            target_class = seat_to_interval_class(int(round(pred_seats)))
            interval_probs = np.full(14, 0.02)
            interval_probs[target_class] += 0.74
            
        # Normalize
        interval_probs /= interval_probs.sum()
        discrete_pmf = restore_pmf_from_14_intervals(interval_probs)
        
        return round(pred_seats, 1), interval_probs, discrete_pmf

    def save(self, filepath: Path = None):
        if filepath is None:
            filepath = settings.MODEL_DIR / "ensemble_model.joblib"
        data = {
            "hist_gb": self.hist_gb,
            "extra_trees": self.extra_trees,
            "lgbm": self.lgbm,
            "classifier": self.classifier,
            "is_trained": self.is_trained
        }
        joblib.dump(data, filepath)

    @classmethod
    def load(cls, filepath: Path = None) -> "EnsembleSeatPredictor":
        predictor = cls()
        if filepath is None:
            filepath = settings.MODEL_DIR / "ensemble_model.joblib"
        if filepath.exists():
            try:
                data = joblib.load(filepath)
                predictor.hist_gb = data.get("hist_gb")
                predictor.extra_trees = data.get("extra_trees")
                predictor.lgbm = data.get("lgbm")
                predictor.classifier = data.get("classifier")
                predictor.is_trained = data.get("is_trained", False)
            except Exception as e:
                logger.warning(f"Could not load pre-trained model file ({e}). Falling back to heuristic seat predictor.")
                predictor.is_trained = False
        return predictor
