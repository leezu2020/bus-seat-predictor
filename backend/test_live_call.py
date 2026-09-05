import asyncio
from app.api.live import get_live_buses

async def main():
    res = await get_live_buses(route_id="234000050")
    print("Mode:", res["mode"])
    print("Live bus count:", len(res["buses"]))
    for b in res["buses"][:6]:
        plate = b["plateNo"]
        seq = b["stationSeq"]
        name = b["stationName"]
        seats = b["remainSeatCnt"]
        print(f"  {plate} @ #{seq} {name} (Seats: {seats})")

if __name__ == "__main__":
    asyncio.run(main())
