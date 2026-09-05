import re
import json
import httpx

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://map.naver.com/"
}

r = httpx.get("https://m.map.naver.com/bus/lane?busID=10023", headers=headers, follow_redirects=True)
html = r.text

matches = re.findall(r'window\.__RQ_STREAMING_STATE__\.push\((.*?)\);', html, re.DOTALL)
print("Found RQ matches:", len(matches))

all_data = []
for idx, m in enumerate(matches):
    try:
        parsed = json.loads(m)
        all_data.append(parsed)
    except Exception as e:
        print(f"Match {idx} JSON parse error: {e}")

with open("naver_bus_full.json", "w", encoding="utf-8") as f:
    json.dump(all_data, f, indent=2, ensure_ascii=False)

print("Saved all RQ streaming state to naver_bus_full.json!")
