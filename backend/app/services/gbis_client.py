import logging
import urllib.parse
import httpx
import xmltodict
from typing import Dict, Any, List, Optional
from fastapi import HTTPException
from app.core.config import settings

logger = logging.getLogger(__name__)

class GBISClient:
    """
    Stateless proxy client calling GBIS RESTful endpoints on data.go.kr.
    Uses v2 getBusLocationListv2 endpoint.
    Handles quota limits (Error 22 -> 429) and auth errors (Error 30 -> 401).
    Does NOT log or persist service keys.
    """
    def __init__(self):
        self.base_url = settings.GBIS_BASE_URL

    async def get_bus_locations(self, route_id: str, service_key: str) -> List[Dict[str, Any]]:
        """
        Calls /buslocationservice/v2/getBusLocationListv2
        Returns list of active buses with plateNo, stationId, stationSeq, remainSeatCnt.
        """
        # Ensure serviceKey is properly formatted for data.go.kr
        key_raw = service_key.strip()
        url = f"{self.base_url}/buslocationservice/v2/getBusLocationListv2?serviceKey={key_raw}&routeId={route_id}"
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                resp = await client.get(url)
            except Exception as e:
                logger.error(f"GBIS connection error: {str(e)}")
                raise HTTPException(status_code=502, detail="Failed to connect to GBIS upstream server")

        if resp.status_code == 429:
            raise HTTPException(status_code=429, detail="공공데이터포털 일일 트래픽 쿼터가 초과되었습니다 (오류 코드 22).")
        elif resp.status_code == 401:
            raise HTTPException(status_code=401, detail="등록되지 않았거나 만료된 공공데이터 API Key입니다 (오류 코드 30).")

        # Try JSON parsing
        try:
            data = resp.json()
            response_obj = data.get("response", {})
            header = response_obj.get("msgHeader", {})
            result_code = header.get("resultCode")
            result_msg = header.get("resultMessage", "")
            
            if result_code in ("22", 22):
                raise HTTPException(status_code=429, detail="공공데이터포털 일일 트래픽 쿼터가 초과되었습니다 (오류 코드 22).")
            elif result_code in ("30", 30):
                raise HTTPException(status_code=401, detail="등록되지 않았거나 만료된 공공데이터 API Key입니다 (오류 코드 30).")
            elif result_code not in (0, "0", None) and result_code != "SUCCESS":
                logger.warning(f"GBIS returned code {result_code}: {result_msg}")
                raise HTTPException(status_code=502, detail=f"GBIS 공공데이터 오류: {result_msg}")
                
            items = response_obj.get("msgBody", {}).get("busLocationList", [])
            if isinstance(items, dict):
                items = [items]
                
            buses = []
            for item in items:
                plate = item.get("plateNo", "차량")
                remain_seats = int(item.get("remainSeatCnt", -1))
                crowded = int(item.get("crowded", 0))
                
                # Standardize seat count if not directly numeric (using crowded code when negative)
                if remain_seats < 0:
                    if crowded == 1:
                        remain_seats = 22  # 여유
                    elif crowded == 2:
                        remain_seats = 8   # 보통
                    elif crowded >= 3:
                        remain_seats = 0   # 혼잡/만차
                        
                buses.append({
                    "plateNo": plate,
                    "stationId": str(item.get("stationId", "")),
                    "stationSeq": int(item.get("stationSeq", 0)),
                    "remainSeatCnt": remain_seats,
                    "lowPlate": item.get("lowPlate") in ("1", 1, True, "true"),
                    "endBus": item.get("endBus") in ("1", 1, True, "true"),
                    "crowded": crowded
                })
            return buses
            
        except HTTPException:
            raise
        except Exception:
            # Fallback to XML parsing
            pass
            
        content = resp.text
        if "<OpenAPI_ServiceResponse>" in content or "<response>" in content:
            try:
                parsed = xmltodict.parse(content)
            except Exception:
                raise HTTPException(status_code=502, detail="Invalid response from GBIS server")
                
            header = parsed.get("response", {}).get("msgHeader", {}) or parsed.get("OpenAPI_ServiceResponse", {}).get("cmmMsgHeader", {})
            return_code = header.get("resultCode") or header.get("returnReasonCode")
            return_msg = header.get("resultMessage") or header.get("returnAuthMsg") or ""
            
            if return_code in ("22", 22):
                raise HTTPException(status_code=429, detail="공공데이터포털 일일 트래픽 쿼터가 초과되었습니다 (오류 코드 22).")
            elif return_code in ("30", 30):
                raise HTTPException(status_code=401, detail="등록되지 않았거나 만료된 공공데이터 API Key입니다 (오류 코드 30).")
                
            body = parsed.get("response", {}).get("msgBody", {})
            items = body.get("busLocationList", [])
            if isinstance(items, dict):
                items = [items]
                
            buses = []
            for item in items:
                buses.append({
                    "plateNo": item.get("plateNo"),
                    "stationId": str(item.get("stationId")),
                    "stationSeq": int(item.get("stationSeq", 0)),
                    "remainSeatCnt": int(item.get("remainSeatCnt", -1)),
                    "lowPlate": item.get("lowPlate") in ("1", 1, True, "true"),
                    "endBus": item.get("endBus") in ("1", 1, True, "true")
                })
            return buses
            
        return []

gbis_client = GBISClient()
