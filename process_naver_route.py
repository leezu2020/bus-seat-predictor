import re
import json
import httpx

with open("naver_bus_full.json", "r", encoding="utf-8") as f:
    data = json.load(f)

item = data[1]["queries"][0]["state"]["data"]["item"]
stops = item["busStopGraph"]
path = item["busPath"]
turning = item["turningPoint"]

print(f"Total stops: {len(stops)}, Turning stopIdx: {turning['stopIdx']}, Total path points: {len(path)}")

# Direction 1: Anyang bound (0 to 43)
anyang_stops = stops[:turning["stopIdx"] + 1]
# Direction 2: Guri bound (44 to 88)
guri_stops = stops[turning["stopIdx"] + 1:]

print(f"Anyang-bound stops count: {len(anyang_stops)}")
for s in anyang_stops[:5]:
    print(f"  #{s['id']} [{s['arsId']}] {s['name']} ({s['location']['latitude']}, {s['location']['longitude']})")
print("  ...")
for s in anyang_stops[-5:]:
    print(f"  #{s['id']} [{s['arsId']}] {s['name']} ({s['location']['latitude']}, {s['location']['longitude']})")

print(f"\nGuri-bound stops count: {len(guri_stops)}")
for s in guri_stops[:3]:
    print(f"  #{s['id']} [{s['arsId']}] {s['name']} ({s['location']['latitude']}, {s['location']['longitude']})")
