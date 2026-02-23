import pdfplumber
import json
import traceback

events = []

try:
    with pdfplumber.open('timetable.pdf') as pdf:
        for page_num, page in enumerate(pdf.pages):
            words = page.extract_words()
            
            # Sort words top-to-bottom, then left-to-right
            words.sort(key=lambda w: (round(w['top'], 1), w['x0']))
            
            # Group words into lines based on vertical position
            lines = []
            if not words: continue
            
            current_line = [words[0]]
            current_top = words[0]['top']
            
            for w in words[1:]:
                # If word is roughly on the same line (within 3 points)
                if abs(w['top'] - current_top) < 3:
                    current_line.append(w)
                else:
                    lines.append(current_line)
                    current_line = [w]
                    current_top = w['top']
            if current_line:
                lines.append(current_line)
                
            day_text = ""
            for line in lines:
                text = " ".join([w['text'] for w in line])
                if "Day" in text:
                    day_text = text
                
                # We need to find words that look like HH:MM
                # A line could have multiple HH:MM, each starting a column
                # Let's break the line into event strings based on HH:MM
                
                idx = 0
                while idx < len(line):
                    w = line[idx]
                    if ":" in w['text'] and len(w['text']) == 5 and w['text'][0].isdigit():
                        time_str = w['text']
                        event_words = []
                        idx += 1
                        # Collect words until next time_str
                        while idx < len(line):
                            next_w = line[idx]
                            if ":" in next_w['text'] and len(next_w['text']) == 5 and next_w['text'][0].isdigit():
                                break
                            event_words.append(next_w['text'])
                            idx += 1
                        
                        desc = " ".join(event_words)
                        if desc:
                            events.append({
                                'page': page_num,
                                'time': time_str,
                                'desc': desc,
                                'day_text': day_text
                            })
                    else:
                        idx += 1

    with open('parsed_timetable_plumber.json', 'w') as f:
        json.dump(events, f, indent=2)

except Exception as e:
    print(traceback.format_exc())
