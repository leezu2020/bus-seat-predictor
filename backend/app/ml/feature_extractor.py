import math
from typing import Dict, Any, List
import numpy as np

# Total 45 Features Vector Definition
FEATURE_NAMES = [
    # 1. Current bus state (5)
    "current_seats", "capacity", "load_factor", "is_low_plate", "speed_kmh",
    # 2. Spatial progress structure (9)
    "current_seq", "target_seq", "delta_seq", "sqrt_delta_seq", "total_stations",
    "progress_ratio", "remaining_ratio", "cum_dist_km", "dist_to_target_km",
    # 3. Temporal features (10)
    "hour", "minute", "day_of_week", "is_weekend", "is_morning_rush", "is_evening_rush",
    "sin_hour", "cos_hour", "sin_dow", "cos_dow",
    # 4. Short-term trajectory dynamics (5)
    "seat_delta_last_stop", "seat_delta_rate", "moving_avg_speed_3stops", "accel_est", "speed_deviation",
    # 5. Historical risk metrics (7)
    "hist_avg_seat_decrease", "hist_target_full_rate", "hist_mean_seats_target",
    "hist_p10_seats_target", "hist_p50_seats_target", "hist_p90_seats_target", "hist_var_seats_target",
    # 6. Interaction & Non-linear features (9)
    "rush_x_delta_seq", "load_x_delta_seq", "speed_x_rush", "seats_per_remaining_stop",
    "full_prob_weighted", "rush_x_target_seq", "weekend_x_target_seq", "speed_ratio_to_freeflow", "congestion_index"
]

def extract_45_features(
    current_seq: int,
    target_seq: int,
    current_seats: int,
    speed_kmh: float,
    hour: int,
    minute: int,
    day_of_week: int,
    hist_stats: Dict[str, Any] = None,
    trajectory_context: Dict[str, Any] = None
) -> np.ndarray:
    """
    Extracts the 45-dimensional feature vector specified in Section 4 of the PRD.
    """
    capacity = 45.0
    current_seats = max(0.0, min(capacity, float(current_seats)))
    load_factor = (capacity - current_seats) / capacity
    is_low_plate = 0.0
    speed_kmh = max(0.0, min(120.0, float(speed_kmh)))
    
    # Spatial
    total_stations = 39.0
    delta_seq = max(0.0, float(target_seq - current_seq))
    sqrt_delta_seq = math.sqrt(delta_seq)
    progress_ratio = float(current_seq) / total_stations
    remaining_ratio = delta_seq / total_stations
    cum_dist_km = float(current_seq) * 1.3  # approx 1.3km per stop
    dist_to_target_km = delta_seq * 1.3
    
    # Temporal
    is_weekend = 1.0 if day_of_week in (5, 6) else 0.0
    is_morning_rush = 1.0 if (6 <= hour <= 9 and not is_weekend) else 0.0
    is_evening_rush = 1.0 if (17 <= hour <= 20 and not is_weekend) else 0.0
    is_rush = 1.0 if (is_morning_rush or is_evening_rush) else 0.0
    
    time_float = hour + minute / 60.0
    sin_hour = math.sin(2 * math.pi * time_float / 24.0)
    cos_hour = math.cos(2 * math.pi * time_float / 24.0)
    sin_dow = math.sin(2 * math.pi * day_of_week / 7.0)
    cos_dow = math.cos(2 * math.pi * day_of_week / 7.0)
    
    # Dynamics (from context or default)
    tc = trajectory_context or {}
    seat_delta_last_stop = float(tc.get("seat_delta_last_stop", -2.0 if is_rush else -0.5))
    seat_delta_rate = float(tc.get("seat_delta_rate", seat_delta_last_stop / max(1.0, speed_kmh)))
    moving_avg_speed_3stops = float(tc.get("moving_avg_speed_3stops", speed_kmh))
    accel_est = float(tc.get("accel_est", 0.0))
    speed_deviation = float(tc.get("speed_deviation", abs(speed_kmh - 40.0)))
    
    # Historical stats (from precomputed or default)
    hs = hist_stats or {}
    hist_avg_seat_decrease = float(hs.get("hist_avg_seat_decrease", 3.2 if is_rush else 0.8))
    hist_target_full_rate = float(hs.get("hist_target_full_rate", 0.75 if (is_rush and 6 <= target_seq <= 15) else 0.08))
    hist_mean_seats_target = float(hs.get("hist_mean_seats_target", 2.0 if (is_rush and target_seq >= 8) else 22.0))
    hist_p10_seats_target = float(hs.get("hist_p10_seats_target", 0.0 if is_rush else 10.0))
    hist_p50_seats_target = float(hs.get("hist_p50_seats_target", 1.0 if is_rush else 20.0))
    hist_p90_seats_target = float(hs.get("hist_p90_seats_target", 6.0 if is_rush else 32.0))
    hist_var_seats_target = float(hs.get("hist_var_seats_target", 12.0))
    
    # Interactions
    rush_x_delta_seq = is_rush * delta_seq
    load_x_delta_seq = load_factor * delta_seq
    speed_x_rush = speed_kmh * is_rush
    seats_per_remaining_stop = current_seats / (delta_seq + 1.0)
    full_prob_weighted = hist_target_full_rate * (1.0 - (current_seats / capacity))
    rush_x_target_seq = is_rush * float(target_seq)
    weekend_x_target_seq = is_weekend * float(target_seq)
    speed_ratio_to_freeflow = speed_kmh / 70.0
    congestion_index = 1.0 - min(1.0, speed_ratio_to_freeflow)
    
    vector = [
        current_seats, capacity, load_factor, is_low_plate, speed_kmh,
        float(current_seq), float(target_seq), delta_seq, sqrt_delta_seq, total_stations,
        progress_ratio, remaining_ratio, cum_dist_km, dist_to_target_km,
        float(hour), float(minute), float(day_of_week), is_weekend, is_morning_rush, is_evening_rush,
        sin_hour, cos_hour, sin_dow, cos_dow,
        seat_delta_last_stop, seat_delta_rate, moving_avg_speed_3stops, accel_est, speed_deviation,
        hist_avg_seat_decrease, hist_target_full_rate, hist_mean_seats_target,
        hist_p10_seats_target, hist_p50_seats_target, hist_p90_seats_target, hist_var_seats_target,
        rush_x_delta_seq, load_x_delta_seq, speed_x_rush, seats_per_remaining_stop,
        full_prob_weighted, rush_x_target_seq, weekend_x_target_seq, speed_ratio_to_freeflow, congestion_index
    ]
    
    return np.array(vector, dtype=np.float32)
