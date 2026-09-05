import time
import pytest
import numpy as np
from app.ml.feature_extractor import extract_45_features, FEATURE_NAMES
from app.ml.models import EnsembleSeatPredictor

def test_feature_vector_dimension():
    """Verify that feature extractor outputs exactly 45 features."""
    assert len(FEATURE_NAMES) == 45
    vec = extract_45_features(
        current_seq=4,
        target_seq=12,
        current_seats=15,
        speed_kmh=42.0,
        hour=8,
        minute=20,
        day_of_week=1
    )
    assert vec.shape == (45,)
    assert not np.isnan(vec).any()

def test_ensemble_latency_p95():
    """Verify that ensemble prediction meets NFR-01: P95 < 400ms."""
    predictor = EnsembleSeatPredictor()
    vec = extract_45_features(
        current_seq=5,
        target_seq=14,
        current_seats=20,
        speed_kmh=35.0,
        hour=8,
        minute=15,
        day_of_week=2
    )
    
    latencies = []
    for _ in range(50):
        t0 = time.perf_counter()
        pred_seats, interval_probs, discrete_pmf = predictor.predict(vec)
        latencies.append((time.perf_counter() - t0) * 1000.0)
        
        assert 0.0 <= pred_seats <= 45.0
        assert len(interval_probs) == 14
        assert len(discrete_pmf) == 46
        
    p95 = np.percentile(latencies, 95)
    print(f"\nInference P95 latency: {p95:.2f} ms")
    assert p95 < 400.0, f"P95 latency exceeded 400ms: {p95}ms"
