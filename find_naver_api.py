import re
import httpx

html = open("naver_10023.html", encoding="utf-8").read()
# Find all script src
scripts = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', html)
print(f"Found {len(scripts)} scripts")

for s in scripts:
    if "lane" in s or "bus" in s or "main" in s or "chunk" in s:
        print("Checking script:", s)
        try:
            url = s if s.startswith("http") else f"https://m.map.naver.com{s}"
            r = httpx.get(url, timeout=5)
            # Search for api paths in JS
            apis = re.findall(r'["\'](/api/[^"\']+)["\']', r.text)
            for a in set(apis):
                if "bus" in a or "lane" in a or "real" in a or "location" in a:
                    print(f"  Found API: {a}")
        except Exception as e:
            print("  Err:", e)
