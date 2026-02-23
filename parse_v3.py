import pdfplumber
import json
import re

def parse_pdf_to_columns(pdf_path):
    extracted_events = []
    
    with pdfplumber.open(pdf_path) as pdf:
        # State across pages for persistent headers? Usually they reset per page but let's see
        active_events = {
            'track': None,
            'field': None,
            'outside': None
        }

        for page_num, page in enumerate(pdf.pages):
            words = page.extract_words()
            if not words: continue
            
            # Sort words
            words.sort(key=lambda w: (round(w['top'], 1), w['x0']))
            
            # Group into lines
            lines = []
            current_line = [words[0]]
            current_top = words[0]['top']
            for w in words[1:]:
                if abs(w['top'] - current_top) < 3:
                    current_line.append(w)
                else:
                    lines.append(current_line)
                    current_line = [w]
                    current_top = w['top']
            if current_line: lines.append(current_line)
            
            day_text = ""
            
            for line in lines:
                line_text = " ".join([w['text'] for w in line])
                if "Day" in line_text:
                    day_text = line_text
                
                # Column boundaries
                col_words = {'track': [], 'field': [], 'outside': []}
                for w in line:
                    if w['x0'] < 280:
                        col_words['track'].append(w)
                    elif w['x0'] < 430:
                        col_words['field'].append(w)
                    else:
                        col_words['outside'].append(w)
                
                for col_name, words in col_words.items():
                    if not words: continue
                    
                    # Split into segments by time
                    segments = []
                    current_segment = []
                    has_time = False
                    for w in words:
                        if ":" in w['text'] and len(w['text']) == 5 and w['text'][0].isdigit():
                            if current_segment: segments.append(current_segment)
                            current_segment = [w]
                            has_time = True
                        else:
                            current_segment.append(w)
                    if current_segment: segments.append(current_segment)
                    
                    for seg in segments:
                        seg_text = " ".join([w['text'] for w in seg])
                        time_match = re.search(r'(\d{2}:\d{2})', seg_text)
                        
                        event_names = ["High Jump", "Long Jump", "Triple Jump", "TripleJump", "Pole Vault", "Shot Put", "Discus", "Hammer", "Javelin", "Weight Throw", "Cross Country", "Pentathlon", "Road Race", "RW"]
                        
                        if time_match:
                            time_str = time_match.group(1)
                            desc = seg_text.replace(time_str, "").strip()
                            
                            # Check if desc has an event name
                            local_event = None
                            for en in event_names:
                                if en.lower() in desc.lower():
                                    local_event = en
                                    # Don't update global active_event here yet, 
                                    # sometimes track events have it on the line but next track event title is different
                                    break
                            
                            # If no event name on this line, use the active one
                            final_event = local_event or active_events[col_name]
                            
                            if desc:
                                extracted_events.append({
                                    'day_text': day_text,
                                    'time': time_str,
                                    'event': final_event,
                                    'desc': desc,
                                    'column': col_name
                                })
                        else:
                            # NO TIME. Check if this is an event header
                            for en in event_names:
                                if en.lower() in seg_text.lower():
                                    active_events[col_name] = en
                                    break
                            
    return extracted_events

events = parse_pdf_to_columns('timetable.pdf')
with open('parsed_timetable_v3.json', 'w') as f:
    json.dump(events, f, indent=2)
print(f"Extracted {len(events)} events with header propagation.")
