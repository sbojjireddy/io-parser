"""
TODO: Add more robust order number extraction logic
This pattern matches and pulls the entire number, but a lot of the order numbers are stripped
Ex: "40104.1" -> "40104"
    "O-57GQ7-R4" -> "O-57GQ7"
Need to add logic for correct number format
"""

import sys
import re
import json


def extract_order_number(text_file_path: str) -> dict:
    """
    Robust order number extractor - looks for all "order number" patterns and picks the best one.
    
    Returns:
        dict: { ok: bool, order_number: str, provenance: str, all_candidates: list, scores: dict }
    """
    try:
        with open(text_file_path, 'r', encoding='utf-8') as f:
            text = f.read()
        
        candidates = []
        
        # Strategy: Find lines/contexts that mention "order number" or "order #"
        # Then extract values that appear after these keywords
        
        # Split into lines for context-aware extraction
        lines = text.split('\n')
        
        for i, line in enumerate(lines):
            line_lower = line.lower()
            
            # Check if this line mentions "order number" or "order #"
            if re.search(r'\border\s*(?:number|#|num)', line_lower):
                # Extract all potential order numbers from this line and next 2 lines
                context_lines = [line]
                if i + 1 < len(lines):
                    context_lines.append(lines[i + 1])
                if i + 2 < len(lines):
                    context_lines.append(lines[i + 2])
                
                context = ' '.join(context_lines)
                
                # Pattern 1: After "order number:" or "order #:"
                match = re.search(r'order\s*(?:number|#|num)\s*:?\s*([A-Z0-9][A-Z0-9\.\-]{2,})', context, re.IGNORECASE)
                if match:
                    candidates.append({
                        'value': match.group(1),
                        'context': context[:100],
                        'pattern': 'labeled'
                    })
                
                # Pattern 2: Look for common order number formats in context
                # Format: O-XXXXX-RX
                for match in re.finditer(r'\b([A-Z]-[A-Z0-9]{4,}-[A-Z0-9]{1,2})\b', context, re.IGNORECASE):
                    candidates.append({
                        'value': match.group(1),
                        'context': context[:100],
                        'pattern': 'tubi_format'
                    })
                
                # Format: XXXXX.X or XXXXX
                for match in re.finditer(r'\b(\d{4,}(?:\.\d+)?)\b', context):
                    value = match.group(1)
                    # Filter out dates (like 2025, 20251231) and years
                    if not (value.startswith('20') and len(value) >= 4):
                        candidates.append({
                            'value': value,
                            'context': context[:100],
                            'pattern': 'numeric'
                        })
                
                # Format: Alphanumeric (CP32K5B style)
                for match in re.finditer(r'\b([A-Z]{2,}[0-9][A-Z0-9]{2,})\b', context, re.IGNORECASE):
                    candidates.append({
                        'value': match.group(1),
                        'context': context[:100],
                        'pattern': 'alphanumeric'
                    })
        
        # Remove duplicates
        unique_candidates = {}
        for cand in candidates:
            value = cand['value'].strip()
            if value and value not in unique_candidates:
                # Skip obviously wrong values
                if (value.lower() in ['and', 'the', 'for', 'with', 'from', 'order', 'number', 'sent', 'date'] or
                    value.isalpha() or  # All letters
                    len(value) < 3):  # Too short
                    continue
                unique_candidates[value] = cand
        
        if not unique_candidates:
            return {
                "ok": False,
                "order_number": "UNKNOWN",
                "provenance": "NO_ORDER_NUMBER_FOUND",
                "all_candidates": [],
                "scores": {}
            }
        
        # Score each candidate
        scored_candidates = []
        for value, cand in unique_candidates.items():
            score = 0
            
            # Pattern bonuses
            if cand['pattern'] == 'labeled':  # Found after "Order Number:" label
                score += 1000
            elif cand['pattern'] == 'tubi_format':  # O-XXXXX-RX format
                score += 800
            elif cand['pattern'] == 'alphanumeric':  # CP32K5B format
                score += 600
            elif cand['pattern'] == 'numeric':  # Plain numbers
                score += 400
            
            # Length bonus (longer is generally better, but cap it)
            score += min(len(value) * 10, 100)
            
            # Digit bonus
            digit_count = sum(c.isdigit() for c in value)
            score += digit_count * 20
            
            # Hyphen/dash bonus (common in order numbers)
            score += value.count('-') * 100
            
            # Penalty for too many letters (but some letters are ok)
            letter_count = sum(c.isalpha() for c in value)
            if letter_count > digit_count * 2:  # More than 2x letters vs digits
                score -= 100
            
            scored_candidates.append({
                'value': value,
                'score': score,
                'pattern': cand['pattern'],
                'context': cand['context']
            })
        
        # Sort by score
        scored_candidates.sort(key=lambda x: x['score'], reverse=True)
        
        # Pick the best one
        best = scored_candidates[0]
        
        return {
            "ok": True,
            "order_number": best['value'],
            "provenance": f"FOUND_{best['value']}_pattern_{best['pattern']}_score_{best['score']}",
            "all_candidates": [c['value'] for c in scored_candidates],
            "scores": {c['value']: c['score'] for c in scored_candidates}
        }
        
    except Exception as e:
        return {
            "ok": False,
            "order_number": "ERROR",
            "provenance": f"EXTRACTION_ERROR: {str(e)}",
            "all_candidates": [],
            "scores": {}
        }


def main():
    if len(sys.argv) != 2:
        print("Usage: python extract_order_number.py <text_file_path>", file=sys.stderr)
        sys.exit(1)
    
    text_file_path = sys.argv[1]
    result = extract_order_number(text_file_path)
    
    # Output as JSON for the Node.js script to parse
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()