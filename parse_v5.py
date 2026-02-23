import pdfplumber
import json
import re

def parse_pdf_to_columns(pdf_path):
    extracted_events = []
    
    with pdfplumber.open(pdf_path) as pdf:
        active_events = {
            'col1': None,
            'col2': None,
            'col3': None
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
                if abs(w['top'] - current_top) < 5: # Increased tolerance
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
                
                # Column boundaries - simplified to 3 columns to avoid splitting headers from times
                col_words = {'col1': [], 'col2': [], 'col3': []}
                for w in line:
                    if w['x0'] < 260:
                        col_words['col1'].append(w)
                    elif w['x0'] < 430:
                        col_words['col2'].append(w)
                    else:
                        col_words['col3'].append(w)
                
                for col_name, words in col_words.items():
                    if not words: continue
                    
                    # Split segments by time HH:MM
                    segments = []
                    current_segment = []
                    for w in words:
                        if re.match(r'^\d{2}:\d{2}$', w['text']):
                            if current_segment: segments.append(current_segment)
                            current_segment = [w]
                        else:
                            current_segment.append(w)
                    if current_segment: segments.append(current_segment)
                    
                    for seg in segments:
                        seg_text = " ".join([w['text'] for w in seg])
                        time_match = re.search(r'(\d{2}:\d{2})', seg_text)
                        
                        event_names = ["High Jump", "Long Jump", "Triple Jump", "TripleJump", "Pole Vault", "Shot Put", "Discus", "Hammer", "Javelin", "Weight Throw", "Cross Country", "XC", "Pentathlon", "Road Race", "RW", "4x200"]
                        
                        header_found = None
                        for en in event_names:
                            if en.lower() in seg_text.lower():
                                header_found = en
                                active_events[col_name] = en
                                break
                        
                        if time_match:
                            time_str = time_match.group(1)
                            desc = seg_text.replace(time_str, "").strip()
                            final_event = header_found or active_events[col_name]
                            
                            if desc:
                                extracted_events.append({
                                    'day_text': day_text,
                                    'time': time_str,
                                    'event': final_event,
                                    'desc': desc,
                                    'column': col_name
                                })
                            
    return extracted_events

events = parse_pdf_to_columns('timetable.pdf')
with open('parsed_timetable_v5.json', 'w') as f:
    json.dump(events, f, indent=2)
print(f"Extracted {len(events)} events with v5 parser.")
