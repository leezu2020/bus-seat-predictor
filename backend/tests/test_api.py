import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_search_routes():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/routes/search?keyword=1650")
        assert resp.status_code == 200
        data = resp.json()
        assert "routes" in data
        assert len(data["routes"]) >= 1
        assert data["routes"][0]["routeName"] == "1650"

@pytest.mark.asyncio
async def test_route_path():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/routes/234000050/path")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["stations"]) == 89
        assert data["stations"][0]["stationName"] == "구리수택차고지"
        assert any(s["is_turn_point"] for s in data["stations"])
        assert len(data["busPath"]) > 1000

@pytest.mark.asyncio
async def test_live_buses_mock_stream():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/routes/224000014/live")
        assert resp.status_code == 200
        data = resp.json()
        assert "buses" in data
        assert len(data["buses"]) > 0
        assert "remainSeatCnt" in data["buses"][0]

@pytest.mark.asyncio
async def test_boarding_simulation_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "routeId": "224000014",
            "targetStationSeq": 7,  # 인덕원역
            "waitingQueueCount": 5
        }
        # First call: warmup in-memory cache/model
        await client.post("/api/v1/simulation/boarding", json=payload)
        
        # Second call: verify fast inference P95 < 400ms
        resp = await client.post("/api/v1/simulation/boarding", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert "cumulativeSuccess" in data
        assert "oneBus" in data["cumulativeSuccess"]
        assert "twoBuses" in data["cumulativeSuccess"]
        assert "threeBuses" in data["cumulativeSuccess"]
        assert data["latencyMs"] < 400.0

@pytest.mark.asyncio
async def test_travel_time_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/analytics/travel-time?routeId=224000014")
        assert resp.status_code == 200
        data = resp.json()
        assert "corridors" in data
        assert "heatmap" in data
        assert "mareyRuns" in data
        assert len(data["mareyRuns"]) > 0

@pytest.mark.asyncio
async def test_boarding_simulation_full_bus_priority_and_recommendation():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "routeId": "234000050",
            "targetStationSeq": 58,  # 태영아파트
            "waitingQueueCount": 5,
            "trackedBuses": [
                {"plateNo": "경기74사1082", "currentStationSeq": 56, "currentSeats": 0, "speedKmh": 35.0},
                {"plateNo": "경기74사1063", "currentStationSeq": 48, "currentSeats": 27, "speedKmh": 35.0},
                {"plateNo": "경기74사1020", "currentStationSeq": 65, "currentSeats": 15, "speedKmh": 35.0},  # Passed stop 58
            ]
        }
        resp = await client.post("/api/v1/simulation/boarding", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        
        # 1082 must be the first bus (closest approaching upstream bus)
        buses = data["buses"]
        assert len(buses) >= 2
        assert buses[0]["plateNo"] == "경기74사1082"
        assert buses[0]["currentSeats"] == 0
        assert buses[0]["predictedSeats"] == 0.0
        assert buses[0]["stopsRemaining"] == 2
        
        # Boarding probability for bus 1 must be 0%
        assert data["cumulativeSuccess"]["oneBus"] == 0.0
        
        # Second bus must be 1063
        assert buses[1]["plateNo"] == "경기74사1063"
        assert buses[1]["currentSeats"] == 27
        assert data["cumulativeSuccess"]["twoBuses"] > 0.8
        
        # Recommendation must advise waiting for 2nd bus
        assert data["riskLevel"] == "HIGH"
        assert "후속(2번째) 버스 탑승을 준비하십시오" in data["recommendation"]

@pytest.mark.asyncio
async def test_station_schedule_analytics():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/analytics/station-schedule?routeId=234000050&stationSeq=58&dayOfWeek=0&targetHour=8")
        assert resp.status_code == 200
        data = resp.json()
        assert "arrivals" in data
        assert len(data["arrivals"]) > 0
        assert "summary" in data
        assert "stationName" in data
        first = data["arrivals"][0]
        assert "arrivalTime" in first
        assert "meanSeats" in first
        assert "crowdLevel" in first

@pytest.mark.asyncio
async def test_od_travel_time_analytics():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/analytics/od-travel-time?routeId=234000050&fromSeq=58&toSeq=76&dayOfWeek=0")
        assert resp.status_code == 200
        data = resp.json()
        assert "fromStation" in data
        assert "toStation" in data
        assert "distanceKm" in data
        assert "hourlyTrend" in data
        assert len(data["hourlyTrend"]) == 24
        assert "benchmarks" in data
        assert "morningRush" in data["benchmarks"]

@pytest.mark.asyncio
async def test_taeyoung_morning_rush_ground_truth():
    """Verify 1650 empirical ground truth at Station #58 (태영아파트) on Monday 06:00."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/analytics/station-schedule?routeId=234000050&stationSeq=58&dayOfWeek=0&targetHour=6")
        assert resp.status_code == 200
        data = resp.json()
        arrivals = data["arrivals"]
        assert len(arrivals) > 0
        
        # 1. No buses before first bus arrival (05:42)
        arrival_times = [a["arrivalTime"] for a in arrivals]
        for t in arrival_times:
            h, m = map(int, t.split(":"))
            assert (h * 60 + m) >= (5 * 60 + 40), f"Bus at {t} arrived before first bus arrival time"
            
        # 2. 06:14 ~ 06:15 bus must have single-digit seats (5~9 seats)
        bus_0615 = next((a for a in arrivals if "06:1" in a["arrivalTime"]), None)
        assert bus_0615 is not None, "06:1x bus must exist"
        assert 4.0 <= bus_0615["meanSeats"] <= 9.0, f"06:15 seats was {bus_0615['meanSeats']}, expected single digit 4~9"
        
        # 3. Peak rush (07:00+) must be full (< 1 seat)
        bus_peak = next((a for a in arrivals if a["arrivalTime"].startswith("07:")), None)
        if bus_peak:
            assert bus_peak["meanSeats"] <= 1.0
            assert bus_peak["crowdLevel"] == "FULL"

@pytest.mark.asyncio
async def test_sync_recent_rolling_data():
    """Verify automated/manual rolling update endpoint for recent 3 months."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/v1/analytics/sync-recent-data")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "SUCCESS"
        assert "metadata" in data
        assert data["metadata"]["rollingWindowDays"] == 90
        assert "windowStartDate" in data["metadata"]
        assert "windowEndDate" in data["metadata"]

@pytest.mark.asyncio
async def test_rolling_metadata():
    """Verify rolling metadata retrieval endpoint."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/analytics/rolling-metadata")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "HEALTHY"
        assert data["metadata"]["routeId"] == "234000050"


