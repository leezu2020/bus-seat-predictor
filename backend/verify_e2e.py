import asyncio
import httpx
from app.main import app

async def main():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        r_path = await client.get("/api/v1/routes/234000050/path")
        path_data = r_path.json()
        print("1. Path stations:", len(path_data["stations"]), "busPath points:", len(path_data["busPath"]))
        print("   Company:", path_data["companyName"], "Start:", path_data["startStationName"], "End:", path_data["endStationName"])
        
        r_live = await client.get("/api/v1/routes/234000050/live")
        live_data = r_live.json()
        print("2. Live mode:", live_data["mode"], "buses count:", len(live_data["buses"]))
        for b in live_data["buses"][:5]:
            print(f"   Bus {b['plateNo']} @ #{b['stationSeq']} {b['stationName']} ({b['remainSeatCnt']} seats)")
            
        r_sim = await client.post("/api/v1/simulation/boarding", json={
            "routeId": "234000050",
            "targetStationSeq": 16, # 잠실역.잠실대교남단(중)
            "waitingQueueCount": 5
        })
        sim = r_sim.json()
        print("3. Sim station:", sim["targetStationName"])
        print("   Latency:", sim["latencyMs"], "ms")
        print("   P(1 bus):", sim["cumulativeSuccess"]["oneBus"])
        print("   Recommendation:", sim["recommendation"])

if __name__ == "__main__":
    asyncio.run(main())
