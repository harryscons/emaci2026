import re
import json

with open('timetable_extracted.txt', 'r') as f:
    text = f.read()

pages = text.split('--- PAGE')

events_list = []
current_day_idx = 0

for page in pages[1:]:
    for line in page.split('\n'):
        # Check for day marker
        match = re.search(r'Day\s+(\d)', line)
        if match:
            current_day_idx = int(match.group(1)) - 1

        # Find times (HH:MM) and descriptions
        matches = list(re.finditer(r'(\d{2}:\d{2})\s+((?:(?!\d{2}:\d{2}).)+)', line))
        for m in matches:
            time = m.group(1).strip()
            desc = m.group(2).strip()
            
            # Clean up the description
            desc = re.sub(r'Day \d,.*$', '', desc).strip()
            if desc:
                events_list.append({
                    "day_idx": current_day_idx,
                    "time": time,
                    "desc": desc
                })

print(json.dumps(events_list[:20], indent=2))
with open('parsed_timetable_raw.json', 'w') as f:
    json.dump(events_list, f, indent=2)
