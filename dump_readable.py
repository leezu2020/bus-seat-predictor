import json

with open('extracted_stops.json', 'r', encoding='utf-8') as f:
    d = json.load(f)

with open('stops_readable.txt', 'w', encoding='utf-8') as out:
    for i, s in enumerate(d['stops']):
        dir_name = '안양역 방면' if i <= 43 else '구리수택차고지 방면'
        ars = s.get('arsId') or '-'
        name = s.get('name')
        lat = s['location']['latitude']
        lng = s['location']['longitude']
        out.write(f"[{i:02d}] ({dir_name}) ID:{s['id']} ARS:{ars} {name} ({lat}, {lng})\n")

print("Done! Total stops:", len(d['stops']))
