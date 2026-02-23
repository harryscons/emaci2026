import pdfplumber
import json
import re

def parse_pdf_to_columns(pdf_path):
    extracted_events = []
    
    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages):
            words = page.extract_words()
            if not words: continue
            
            # Sort words top-to-bottom, then left-to-right
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
            # Columns (estimated from analysis)
            # Track: ~95, Field: ~293, Outside: ~440
            
            active_events = {
                'track': None,
                'field': None,
                'outside': None
            }
            
            for line in lines:
                line_text = " ".join([w['text'] for w in line])
                if "Day" in line_text:
                    day_text = line_text
                
                # Check for column specific headers/events on this line
                # If a word is an event name (like "High Jump") but no time, update active_events
                
                # Identify which words belong to which column
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
                    text = " ".join([w['text'] for w in words])
                    
                    # Split into segments by time
                    segments = []
                    current_segment = []
                    for w in words:
                        if ":" in w['text'] and len(w['text']) == 5 and w['text'][0].isdigit():
                            if current_segment: segments.append(current_segment)
                            current_segment = [w]
                        else:
                            current_segment.append(w)
                    if current_segment: segments.append(current_segment)
                    
                    for seg in segments:
                        seg_text = " ".join([w['text'] for w in seg])
                        time_match = re.search(r'(\d{2}:\d{2})', seg_text)
                        
                        if time_match:
                            time_str = time_match.group(1)
                            desc = seg_text.replace(time_str, "").strip()
                            if desc:
                                extracted_events.append({
                                    'day_text': day_text,
                                    'time': time_str,
                                    'desc': desc,
                                    'column': col_name
                                })
                        else:
                            # No time, might be an event header for this column
                            # We'll handle this in the second pass or just keep it simple
                            pass
                            
    return extracted_events

events = parse_pdf_to_columns('timetable.pdf')
with open('parsed_timetable_v2.json', 'w') as f:
    json.dump(events, f, indent=2)
print(f"Extracted {len(events)} events with column awareness.")
