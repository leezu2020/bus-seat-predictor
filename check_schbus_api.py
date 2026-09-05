import httpx
import re

r = httpx.get("https://www.gbis.go.kr/gbis2014/js/map/searchTotal_2025.js?ver=1.16", timeout=10)
matches = [m.start() for m in re.finditer(r'schBusAPI\.action', r.text)]
for idx in matches:
    print("--- snippet ---")
    print(r.text[max(0, idx-100):min(len(r.text), idx+300)])
