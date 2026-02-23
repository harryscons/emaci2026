import json
import re

with open('parsed_timetable_v6.json', 'r') as f:
    events = json.load(f)

schedule = []
for e in events:
    desc = e['desc']
    event_header = e['event']
    full_text = f"{event_header or ''} {desc}".strip()
    
    # Improved regex: look for Gender + Age
    # We allow some words like "Final" or "Heats" between them
    # Note: we use (?![\w+]) instead of \b at the end to allow the + symbol
    gender_pattern = r'\b(M/W|MIXED|MIX|M|W|X)\b'
    age_pattern = r'(\d{2}(?:-\d{2})?(?:\+)?)(?![0-9])'
    gap_pattern = r'(?:\s*(?:Final|Heats|m|SF|QF|Semi|gr\.\d)\s*)*'
    
    pattern = f'{gender_pattern}{gap_pattern}{age_pattern}'
    matches = re.findall(pattern, full_text, re.IGNORECASE)
    
    # Special case for concatenated forms like M35, W70+
    if not matches:
        concat_pattern = r'\b(M|W)(\d{2}(?:-\d{2})?(?:\+)?)(?![0-9])'
        matches = re.findall(concat_pattern, full_text, re.IGNORECASE)
    
    if not matches:
        # Try split pattern if needed, but be careful
        # e.g., "W 70+" or "M 35"
        pass

    # Event Mapping
    event_code = None
    header_map = {
        'High Jump': 'HJ', 'Long Jump': 'LJ', 'Triple Jump': 'TJ', 'TripleJump': 'TJ',
        'Pole Vault': 'PV', 'Shot Put': 'SP', 'Discus': 'DT', 'Hammer': 'HT',
        'Javelin': 'JT', 'Weight Throw': 'WT', 'Pentathlon': 'PEN',
        'Cross Country': 'XC', 'XC': 'XC', 'Road Race': '5K', 'RW': '3000W', '4x200': '4x200'
    }
    
    if event_header:
        for k, v in header_map.items():
            if k.lower() in event_header.lower():
                event_code = v
                break
    
    desc_map = {
        '4x200': '4x200', '60m hurdles': '60H', '60 m hurdles': '60H', '60H': '60H',
        '60 m': '60', '60m': '60', '200 m': '200', '200m': '200',
        '400 m': '400', '400m': '400', '800 m': '800', '800m': '800',
        '1500 m': '1500', '1500m': '1500', '3000 m': '3000', '3000m': '3000',
        '3000m RW': '3000W', '3000 m RW': '3000W', '5 km RW': '5KW', '5 km': '5K',
        'Cross Country': 'XC', 'XC': 'XC'
    }
    
    for k, v in desc_map.items():
        if k.lower() in desc.lower():
            if v == '3000' and 'RW' in desc.upper(): continue
            if v == '60' and 'hurdles' in desc.lower(): continue
            event_code = v
            break

    if event_code and matches:
        day_match = re.search(r'Day (\d)', e['day_text'])
        day_idx = int(day_match.group(1)) if day_match else 1
        
        for genders_str, ag in matches:
            target_genders = []
            gs = genders_str.upper()
            if gs in ['MIX', 'MIXED', 'X']: target_genders = ['X']
            elif '/' in gs or gs == 'M+W': target_genders = ['M', 'F']
            elif gs == 'W': target_genders = ['F']
            else: target_genders = ['M']
            
            target_ages = []
            if '-' in ag:
                parts = ag.split('-')
                start = int(parts[0])
                # Clean up end part (could be 50+)
                end_str = re.sub(r'\D', '', parts[1])
                end = int(end_str) if end_str else start
                for age_val in range(start, end + 5, 5):
                    target_ages.append(f'V{age_val}')
            elif '+' in ag:
                start = int(ag.replace('+', ''))
                for age_val in range(start, 100, 5):
                    target_ages.append(f'V{age_val}')
            else:
                target_ages.append(f'V{ag}')
            
            for tg in target_genders:
                for ta in target_ages:
                    schedule.append({
                        'eventCode': event_code,
                        'gender': tg,
                        'ageGroup': ta,
                        'day': day_idx,
                        'time': e['time'],
                        'desc': full_text
                    })

with open('schedule.json', 'w') as f:
    json.dump(schedule, f, indent=2)
print(f"Generated schedule with {len(schedule)} entries.")
