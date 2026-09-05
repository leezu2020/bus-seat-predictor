import httpx
import re

data = {'searchText': '1650'}
r = httpx.post('https://www.gbis.go.kr/gbis2014/schBus.action?cmd=mainSearchText&gubun=main', data=data, timeout=10)
matches = re.findall(r'url\s*:\s*[\'"][^\'"]+[\'"]', r.text)
print('AJAX URLs in GBIS search page:', matches)

# Also find scripts loaded on this page
scripts = re.findall(r'src=[\'"]([^\'"]+)[\'"]', r.text)
print('Scripts:')
for s in scripts:
    if 'sch' in s or 'bus' in s or 'search' in s or 'map' in s:
        print(' ', s)
