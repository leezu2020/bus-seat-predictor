from fastapi import APIRouter, Query, HTTPException
from typing import List, Dict, Any
from app.core.config import settings
from app.services.seed_service import get_route_seed_data

router = APIRouter(prefix="/routes", tags=["Routes"])

@router.get("/search")
async def search_routes(keyword: str = Query(..., description="Bus route number keyword (e.g. 1650)")):
    """Searches for bus routes by name."""
    keyword_clean = keyword.strip()
    route_info = get_route_seed_data()
    
    results = []
    if keyword_clean in route_info["route_name"] or route_info["route_name"] in keyword_clean or not keyword_clean:
        results.append({
            "routeId": route_info["route_id"],
            "routeName": route_info["route_name"],
            "routeType": route_info["route_type"],
            "companyName": route_info["company_name"],
            "startStationName": route_info["start_station_name"],
            "endStationName": route_info["end_station_name"],
            "stationCount": len(route_info["stations"]),
            "turningSeq": route_info.get("turning_seq", 44),
            "intervalWeekday": route_info.get("interval_weekday", "6~15분"),
            "intervalWeekend": route_info.get("interval_weekend", "15~18분"),
            "firstTimeUp": route_info.get("first_time_up", "04:10"),
            "lastTimeUp": route_info.get("last_time_up", "22:35"),
            "firstTimeDown": route_info.get("first_time_down", "05:25"),
            "lastTimeDown": route_info.get("last_time_down", "23:55")
        })
        
    return {"routes": results}

@router.get("/{route_id}/path")
async def get_route_path(route_id: str):
    """Returns route stations, WGS84 coordinates, road polyline path, and turn point."""
    route_info = get_route_seed_data()
    return {
        "routeId": route_info["route_id"],
        "routeName": route_info["route_name"],
        "routeType": route_info["route_type"],
        "companyName": route_info["company_name"],
        "startStationName": route_info["start_station_name"],
        "endStationName": route_info["end_station_name"],
        "turningSeq": route_info.get("turning_seq", 44),
        "firstTimeUp": route_info.get("first_time_up", "04:10"),
        "lastTimeUp": route_info.get("last_time_up", "22:35"),
        "firstTimeDown": route_info.get("first_time_down", "05:25"),
        "lastTimeDown": route_info.get("last_time_down", "23:55"),
        "intervalWeekday": route_info.get("interval_weekday", "6~15분"),
        "intervalWeekend": route_info.get("interval_weekend", "15~18분"),
        "stations": route_info["stations"],
        "busPath": route_info.get("busPath", [])
    }
