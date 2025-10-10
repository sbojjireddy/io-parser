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
    Super simple order number extractor - just look for "order number" patterns and pick the best one.
    
    Returns:
        dict: { ok: bool, order_number: str, provenance: str, all_candidates: list }
    """
    try:
        with open(text_file_path, 'r', encoding='utf-8') as f:
            text = f.read()
        
        # Simple patterns that look for "order number" or "order #" followed by a value
        order_patterns = [
            r'order\s*number\s*:?\s*([A-Z0-9\.\-]+)',  # "Order Number: 40104.1"
            r'order\s*#?\s*:?\s*([A-Z0-9\.\-]+)',      # "Order #: 40104.1" or "Order: 40104.1"
            r'order\s*#?\s*([A-Z0-9\.\-]+)',           # "Order # 40104.1"
        ]
        
        candidates = []
        
        # Find all matches
        for pattern in order_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                # Filter out obviously bad matches (too short, common words, etc.)
                if (len(match) >= 3 and 
                    match.lower() not in ['and', 'the', 'for', 'with', 'from', 'this', 'that', 'order'] and
                    not match.isalpha()):  # Must contain at least one number
                    candidates.append(match)
        
        # Remove duplicates while preserving order
        seen = set()
        unique_candidates = []
        for candidate in candidates:
            if candidate not in seen:
                seen.add(candidate)
                unique_candidates.append(candidate)
        
        # Pick the best candidate (longest one that looks most like an order number)
        # TO-DO Random logic: can be improved
        if unique_candidates:
            # Prefer candidates that are mostly alphanumeric with some numbers
            best_candidate = max(unique_candidates, key=lambda x: (
                len(x),  # Longer is better
                sum(c.isdigit() for c in x),  # More digits is better
                -sum(c.isalpha() for c in x)  # Fewer letters is better (but some are ok)
            ))
            
            return {
                "ok": True,
                "order_number": best_candidate,
                "provenance": f"FOUND_{best_candidate}",
                "all_candidates": unique_candidates
            }
        else:
            return {
                "ok": False,
                "order_number": "UNKNOWN",
                "provenance": "NO_ORDER_NUMBER_FOUND",
                "all_candidates": []
            }
        
    except Exception as e:
        return {
            "ok": False,
            "order_number": "ERROR",
            "provenance": f"EXTRACTION_ERROR: {str(e)}",
            "all_candidates": []
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