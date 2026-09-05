import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Header, HTTPException, Path
from app.services.gbis_client import gbis_client
from app.services.mock_stream import get_simulated_live_buses
from app.services.seed_service import get_route_seed_data
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/routes", tags=["Live"])

@router.get("/{route_id}/live")
async def get_live_buses(
    route_id: str = Path(..., description="Route ID"),
    x_public_api_key: Optional[str] = Header(None, alias="X-Public-API-Key", description="BYOK Public Data Portal API Key")
):
    """
    Returns real-time locations and seat counts of buses on Route 1650.
    Uses GBIS API with provided or configured BYOK key, mapping real buses directly to the 89 stations.
    Falls back to realistic simulation stream if needed.
    """
    active_key = x_public_api_key.strip() if (isinstance(x_public_api_key, str) and x_public_api_key.strip()) else settings.DEFAULT_PUBLIC_API_KEY
    query_route_id = settings.TARGET_ROUTE_ID  # Always use official 234000050 for 1650
    
    if active_key and active_key.strip() != "DEMO_KEY":
        try:
            raw_buses = await gbis_client.get_bus_locations(route_id=query_route_id, service_key=active_key.strip())
            
            route_info = get_route_seed_data()
            stations = route_info["stations"]
            total_st = len(stations)
            station_map = {str(s["station_id"]): s for s in stations}
            seq_map = {s["station_seq"]: s for s in stations}
            
            buses = []
            for b in raw_buses:
                gbis_seq = b["stationSeq"]
                # 1:1 mapping directly to the 89 stations
                st = seq_map.get(gbis_seq) or station_map.get(str(b.get("stationId", "")))
                if not st and 1 <= gbis_seq <= total_st:
                    st = stations[gbis_seq - 1]
                if not st:
                    st = stations[0]
                
                buses.append({
                    "plateNo": b["plateNo"],
                    "stationId": st["station_id"],
                    "stationSeq": st["station_seq"],
                    "stationName": st["station_name"],
                    "latitude": st["latitude"],
                    "longitude": st["longitude"],
                    "remainSeatCnt": b["remainSeatCnt"],
                    "lowPlate": b["lowPlate"],
                    "endBus": b["endBus"],
                    "speedKmh": 35.0,
                    "isSimulated": False
                })
                
            if len(buses) > 0:
                return {
                    "routeId": route_id,
                    "routeName": "1650",
                    "mode": "LIVE_GBIS",
                    "buses": buses
                }
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"GBIS call failed, falling back to mock stream: {e}")

    # Fallback to simulated live stream
    sim_buses = get_simulated_live_buses()
    for b in sim_buses:
        b["isSimulated"] = True
        
    return {
        "routeId": route_id,
        "routeName": "1650",
        "mode": "SIMULATED_STREAM",
        "buses": sim_buses
    }
