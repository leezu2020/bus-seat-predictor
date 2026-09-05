import httpx
import re
import json

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://map.naver.com/"
}

r = httpx.get("https://m.map.naver.com/bus/lane?busID=10023", headers=headers, follow_redirects=True)
html = r.text

print("Status:", r.status_code, "Final URL:", r.url)

# Search for any streaming state
matches = re.findall(r'window\.__RQ_STREAMING_STATE__\.push\((.*?)\);', html, re.DOTALL)
print("Matches count:", len(matches))
for idx, m in enumerate(matches):
    try:
        data = json.loads(m)
        if isinstance(data, list) and len(data) > 1 and "queries" in data[1]:
            for q in data[1]["queries"]:
                key = q.get("queryKey")
                state = q.get("state", {})
                d = state.get("data")
                print(f"Query key: {key}")
                if isinstance(d, dict):
                    print("  Keys:", list(d.keys()))
                    if "realtime" in str(key).lower() or "bus" in str(key).lower():
                        print("  Sample data snippet:", str(d)[:300])
    except Exception as e:
        print(f"Parse error {idx}: {e}")
