import httpx
import re

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

r = httpx.get("https://www.gbis.go.kr/", headers=headers, timeout=10, follow_redirects=True)
print("GBIS Status:", r.status_code, "URL:", r.url)

# Find search actions
actions = re.findall(r'action=[\'"]([^\'"]+)[\'"]', r.text)
print("Actions:", actions)

# Look for js scripts
scripts = re.findall(r'src=[\'"]([^\'"]+\.js)[\'"]', r.text)
print("Scripts count:", len(scripts))
for s in scripts[:5]:
    print(" ", s)
