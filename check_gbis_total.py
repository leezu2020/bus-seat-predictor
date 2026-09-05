import httpx
import re

for js in ['/gbis2014/js/map/searchTotal_2025.js?ver=1.16', '/gbis2014/js/map/searchRoute.js?ver=1.60', '/gbis2014/js/map/searchRealtime.js?ver=1.72']:
    url = f"https://www.gbis.go.kr{js}"
    r = httpx.get(url, timeout=10)
    print(f"=== {js} ===")
    actions = set(re.findall(r'/[a-zA-Z0-9_\-/]+\.action', r.text))
    for a in actions:
        print("  action:", a)
