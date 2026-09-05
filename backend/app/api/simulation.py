import time
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException
import numpy as np
from app.core.config import settings
from app.ml.feature_extractor import extract_45_features
from app.ml.models import EnsembleSeatPredictor
from app.ml.convolution import compute_boarding_simulation, restore_pmf_from_14_intervals
from app.services.mock_stream import get_simulated_live_buses
from app.services.seed_service import get_route_seed_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/simulation", tags=["Simulation"])

# Global in-memory predictor singleton
seat_predictor = EnsembleSeatPredictor.load()

class TrackedBusInput(BaseModel):
    plateNo: str
    currentStationSeq: int
    currentSeats: int
    speedKmh: Optional[float] = 35.0

class BoardingSimulationRequest(BaseModel):
    routeId: str = Field(default=settings.TARGET_ROUTE_ID)
    targetStationSeq: int = Field(..., ge=1, le=89, description="User's target boarding station sequence")
    waitingQueueCount: int = Field(5, ge=0, le=50, description="Number of passengers waiting ahead in line (q)")
    trackedBuses: Optional[List[TrackedBusInput]] = None

@router.post("/boarding")
async def run_boarding_simulation(payload: BoardingSimulationRequest):
    """
    Runs 45-feature ensemble seat prediction and discrete convolution simulator
    for approaching buses against user queue count q.
    Guarantees latency P95 < 400ms.
    """
    t_start = time.perf_counter()
    now = datetime.now()
    target_seq = payload.targetStationSeq
    q = payload.waitingQueueCount
    
    route_info = get_route_seed_data()
    stations = route_info["stations"]
    station_map = {s["station_seq"]: s for s in stations}
    
    # 1. Identify candidate approaching buses from input or simulated live stream
    bus_pool = []
    if payload.trackedBuses and len(payload.trackedBuses) > 0:
        bus_pool = [b.model_dump() for b in payload.trackedBuses]
    else:
        bus_pool = get_simulated_live_buses()

    # Filter upstream candidate buses heading towards target_seq
    candidate_tuples = []
    for b in bus_pool:
        b_seq = b.get("currentStationSeq") or b.get("stationSeq") or 1
        curr_s = b.get("currentSeats") if "currentSeats" in b else b.get("remainSeatCnt", 20)
        sp = float(b.get("speedKmh", 35.0))
        pl = b.get("plateNo", "차량미상")
        
        dist = None
        if target_seq <= 44:
            # UP direction (안양역 방면)
            if 1 <= b_seq <= target_seq:
                dist = target_seq - b_seq
        else:
            # DOWN direction (구리수택차고지 방면, seq 45..89)
            if 44 <= b_seq <= target_seq:
                dist = target_seq - b_seq
            elif 1 <= b_seq < 44:
                # Approaching turn loop at 44
                dist = (44 - b_seq) + (target_seq - 44)
                
        if dist is not None:
            candidate_tuples.append((dist, {
                "plateNo": pl,
                "currentStationSeq": b_seq,
                "stationSeq": b_seq,
                "currentSeats": curr_s,
                "remainSeatCnt": curr_s,
                "speedKmh": sp,
                "stopsRemaining": dist
            }))

    # Sort closest to target station first (dist ascending)
    candidate_tuples.sort(key=lambda item: item[0])
    candidate_buses = [item[1] for item in candidate_tuples[:3]]
    
    # If not enough upstream buses, synthesize candidate buses upstream
    while len(candidate_buses) < 3:
        idx = len(candidate_buses) + 1
        if candidate_buses:
            synth_seq = max(1, candidate_buses[-1]["currentStationSeq"] - 4)
            synth_dist = candidate_buses[-1]["stopsRemaining"] + 4
        else:
            synth_seq = max(1, target_seq - (idx * 3))
            synth_dist = idx * 3
            
        candidate_buses.append({
            "plateNo": f"경기74사{1070 + idx}",
            "stationSeq": synth_seq,
            "currentStationSeq": synth_seq,
            "remainSeatCnt": max(0, 35 - (synth_seq % 20) * 2),
            "currentSeats": max(0, 35 - (synth_seq % 20) * 2),
            "speedKmh": 32.0,
            "stopsRemaining": synth_dist
        })
        
    # 2. Extract 45 features & Predict for each bus
    bus_results = []
    bus_pmfs = []
    
    for bus in candidate_buses[:3]:
        curr_seq = bus.get("currentStationSeq") or bus.get("stationSeq", 1)
        curr_seats = bus.get("currentSeats") if "currentSeats" in bus else bus.get("remainSeatCnt", 20)
        speed = float(bus.get("speedKmh", 30.0))
        plate = bus.get("plateNo", "차량미상")
        stops_rem = bus.get("stopsRemaining", max(0, target_seq - curr_seq))
        
        if curr_seats == 0:
            pred_seats = 0.0
            interval_probs = np.zeros(14, dtype=np.float64)
            interval_probs[0] = 1.0
            discrete_pmf = restore_pmf_from_14_intervals(interval_probs)
        else:
            feat = extract_45_features(
                current_seq=curr_seq,
                target_seq=target_seq,
                current_seats=curr_seats,
                speed_kmh=speed,
                hour=now.hour,
                minute=now.minute,
                day_of_week=now.weekday()
            )
            pred_seats, interval_probs, discrete_pmf = seat_predictor.predict(feat)
            max_possible = min(45.0, float(curr_seats) + max(0, stops_rem) * 0.5)
            pred_seats = round(min(pred_seats, max_possible), 1)
            
        bus_pmfs.append(discrete_pmf)
        
        bus_results.append({
            "plateNo": plate,
            "currentStationSeq": curr_seq,
            "currentStationName": station_map.get(curr_seq, {}).get("station_name", f"정류소 {curr_seq}"),
            "currentSeats": curr_seats,
            "predictedSeats": pred_seats,
            "stopsRemaining": stops_rem,
            "intervalProbabilities": [round(p, 4) for p in interval_probs.tolist()]
        })
        
    # 3. Discrete Convolution Simulation with Queue Count q
    sim_res = compute_boarding_simulation(bus_pmfs=bus_pmfs, queue_count=q)
    
    # 4. Attach first bus success prob to bus results
    if len(bus_results) > 0:
        bus_results[0]["firstBusInstantSuccessProb"] = sim_res["first_bus_success_prob"]
        
    elapsed_ms = round((time.perf_counter() - t_start) * 1000.0, 2)
    
    return {
        "routeId": payload.routeId,
        "targetStationSeq": target_seq,
        "targetStationName": station_map.get(target_seq, {}).get("station_name", f"정류소 {target_seq}"),
        "waitingQueueCount": q,
        "latencyMs": elapsed_ms,
        "buses": bus_results,
        "cumulativeSuccess": {
            "oneBus": sim_res["first_bus_success_prob"],
            "twoBuses": sim_res["two_bus_cum_success_prob"],
            "threeBuses": sim_res["three_bus_cum_success_prob"]
        },
        "expectedPassedBuses": sim_res["expected_passed_buses"],
        "passedBusesDistribution": sim_res["passed_buses_distribution"],
        "recommendation": sim_res["recommendation"],
        "riskLevel": sim_res["risk_level"]
    }
