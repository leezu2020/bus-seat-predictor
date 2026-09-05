import httpx
import re

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://m.map.naver.com/"
}

r_page = httpx.get("https://m.map.naver.com/bus/lane?busID=10023", headers=headers, follow_redirects=True)
js_links = re.findall(r'src="([^"]+\.js)"', r_page.text)
if not js_links:
    js_links = re.findall(r'href="([^"]+\.js)"', r_page.text)

print("Found JS links:", js_links)

for link in js_links:
    try:
        r_js = httpx.get(link, headers=headers, timeout=10)
        found = re.findall(r'https?://[a-zA-Z0-9\.\-_/]+/api/[a-zA-Z0-9\.\-_/]+', r_js.text)
        if found:
            print(f"In {link}: found {len(found)} api endpoints:")
            for u in set(found):
                if "bus" in u:
                    print("  ->", u)
        # Also look for path strings with bus
        bus_paths = re.findall(r'["\'](/v\d+/[^"\']*bus[^"\']*)["\']', r_js.text)
        if bus_paths:
            print("  bus paths:", set(bus_paths))
    except Exception as e:
        print("ERR in", link, e)
