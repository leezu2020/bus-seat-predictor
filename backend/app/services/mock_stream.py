import time
import math
from datetime import datetime
from typing import List, Dict, Any
from app.services.seed_service import get_route_seed_data

def get_simulated_live_buses() -> List[Dict[str, Any]]:
    """
    Generates realistic dynamic real-time bus positions along Route 1650 (89 stops) based on current clock.
    Uses KD 경기여객 fleet numbers (경기74사10xx).
    """
    now = datetime.now()
    epoch_sec = time.time()
    
    route_info = get_route_seed_data()
    stations = route_info["stations"]
    num_stations = len(stations)
    if num_stations == 0:
        return []
    
    hour = now.hour
    dow = now.weekday()
    is_weekend = dow >= 5
    is_morning_rush = (6 <= hour <= 9) and not is_weekend
    is_evening_rush = (17 <= hour <= 20) and not is_weekend
    
    # 12 active buses spaced along the 89-stop line
    num_buses = 12
    buses = []
    
    for i in range(num_buses):
        plate_no = f"경기74사{1060 + i}"
        cycle_period = 7200.0  # ~120 minutes full round trip
        bus_offset = (i / num_buses) * cycle_period
        elapsed = (epoch_sec + bus_offset) % cycle_period
        station_progress = (elapsed / cycle_period) * (num_stations - 1)
        
        station_seq = int(math.floor(station_progress)) + 1
        station_seq = max(1, min(num_stations, station_seq))
        curr_station = stations[station_seq - 1]
        
        # Calculate seat count based on station sequence and rush hour
        if station_seq <= 44:
            # Anyang bound
            if is_morning_rush:
                if station_seq <= 8:
                    seats = max(5, 45 - station_seq * 4)
                elif 9 <= station_seq <= 24:
                    seats = max(0, 12 - (station_seq - 8))
                else:
                    seats = random_det_int(i, epoch_sec, 0, 8)
            elif is_evening_rush:
                seats = random_det_int(i, epoch_sec, 15, 36)
            else:
                seats = random_det_int(i, epoch_sec, 18, 42)
        else:
            # Guri bound
            if is_evening_rush:
                if station_seq >= 68:
                    seats = max(0, 10 - (station_seq - 68))
                else:
                    seats = random_det_int(i, epoch_sec, 10, 30)
            elif is_morning_rush:
                seats = random_det_int(i, epoch_sec, 22, 42)
            else:
                seats = random_det_int(i, epoch_sec, 16, 38)
                
        buses.append({
            "plateNo": plate_no,
            "stationId": curr_station["station_id"],
            "stationSeq": station_seq,
            "stationName": curr_station["station_name"],
            "latitude": curr_station["latitude"],
            "longitude": curr_station["longitude"],
            "remainSeatCnt": int(seats),
            "lowPlate": (i % 4 == 0),
            "endBus": False,
            "speedKmh": 25.0 if (is_morning_rush or is_evening_rush) else 50.0
        })
        
    buses.sort(key=lambda b: b["stationSeq"])
    return buses

def random_det_int(i: int, epoch: float, low: int, high: int) -> int:
    span = max(1, high - low + 1)
    val = (i * 7 + int(epoch // 30)) % span
    return low + val
