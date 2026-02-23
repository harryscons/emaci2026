import json
import re

with open('parsed_timetable_plumber.json', 'r') as f:
    events = json.load(f)

current_day = "Day 1, Friday, March 27"
clean_events = []

for e in events:
    if e['day_text'].strip():
        current_day = e['day_text'].strip()
    
    desc = e['desc']
    # Clean up desc - remove day texts if leaked
    desc = re.sub(r'Day \d,.*$', '', desc).strip()
    if not desc:
        continue
        
    day_match = re.search(r'Day (\d)', current_day)
    day_idx = int(day_match.group(1)) if day_match else 1
    
    clean_events.append({
        'day': day_idx,
        'time': e['time'],
        'desc': desc
    })

# Now we have clean_events with day, time, desc
# We need to map desc to eventCode, ageGroup, gender
# Desc examples:
# "400 m Heats M35"
# "W80+ Final"
# "3000 m Final W65+"
# "3000m RW Final W35-40"
# "60m hurdles Heats W35"

schedule = []
for ce in clean_events:
    desc = ce['desc']
    
    # Try to find age groups (M/W + numbers)
    # Examples: M35, W80+, W65+, W35-40
    age_groups = re.findall(r'([MW])(\d{2}(?:-\d{2})?(?:\+)?)(?:\s|$|I|gr\.\d)', desc)
    
    # Also handle MIX events (e.g., 4x200 MIX Final 80)
    if 'MIX' in desc.upper():
        mix_ags = re.findall(r'(?:MIX|MIXED).*?\s(\d{2}(?:-\d{2})?(?:\+)?)', desc, re.IGNORECASE)
        for ag in mix_ags:
            age_groups.append(('X', ag))
    
    # Identify event type
    event_map = {
        '4x200 m': '4x200',
        '4x200m': '4x200',
        '60m hurdles': '60H',
        '60 m hurdles': '60H',
        '60 m ': '60',
        '60m ': '60',
        '200 m': '200',
        '200m': '200',
        '400 m': '400',
        '400m': '400',
        '800 m': '800',
        '800m': '800',
        '1500 m': '1500',
        '1500m': '1500',
        '3000 m': '3000',
        '3000m': '3000',
        '3000m RW': '3000W',
        '3000 m RW': '3000W',
        '5 km RW': '5KW',
        '5 km': '5K',
        'Cross Country': 'XC',
        'High Jump': 'HJ',
        'Long Jump': 'LJ',
        'Triple Jump': 'TJ',
        'TripleJump': 'TJ',
        'Pole Vault': 'PV',
        'Shot Put': 'SP',
        'Discus': 'DT',
        'Hammer': 'HT',
        'Javelin': 'JT',
        'Weight Throw': 'WT',
        'Pentathlon': 'PEN'
    }
    
    event_code = None
    for k, v in event_map.items():
        if k.lower() in desc.lower():
            if v == '3000' and 'RW' in desc:
                continue # Skip if it's RW
            if v == '60' and 'hurdles' in desc.lower():
                continue # Skip if hurdles
            event_code = v
            break
            
    if event_code and age_groups:
        for gender, ag in age_groups:
            # Map gender to match prog.json (M=M, W=F, X=X)
            gender_code = 'F' if gender == 'W' else gender
            
            # Handle ranges like W35-40
            if '-' in ag:
                parts = ag.split('-')
                start = int(parts[0])
                end = int(parts[1])
                for age_val in range(start, end + 5, 5):
                     schedule.append({
                         'eventCode': event_code,
                         'gender': gender_code,
                         'ageGroup': f'V{age_val}',
                         'day': ce['day'],
                         'time': ce['time'],
                         'desc': desc
                     })
            elif '+' in ag:
                # W65+ means W65, W70, W75, W80, W85, W90, W95
                start = int(ag.replace('+', ''))
                for age_val in range(start, 100, 5):
                     schedule.append({
                         'eventCode': event_code,
                         'gender': gender_code,
                         'ageGroup': f'V{age_val}',
                         'day': ce['day'],
                         'time': ce['time'],
                         'desc': desc
                     })
            else:
                schedule.append({
                    'eventCode': event_code,
                    'gender': gender_code,
                    'ageGroup': f'V{ag}',
                    'day': ce['day'],
                    'time': ce['time'],
                    'desc': desc
                })

with open('schedule.json', 'w') as f:
    json.dump(schedule, f, indent=2)
print(f"Generated schedule with {len(schedule)} entries.")
