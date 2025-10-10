#!/usr/bin/env python3
"""
extract_order_number.py
Extract order number from PyMuPDF scraped text using format classification.

Usage:
  python extract_order_number.py <text_file_path>
"""

import sys
import re
import json


def classify_io_format(text: str) -> tuple[str, str]:
    """
    Simple IO format classifier that identifies the format type and extracts order number.
    
    Returns:
        tuple: (format_type, order_number)
    """
    lines = text.split('\n')
    text_lower = text.lower()
    
    # Format 1: Traditional Prisma-style IOs (Publicis Groupe agencies)
    # Key indicators: "Campaign" or "Status summary" anywhere in text, "Order #" pattern
    if (len(lines) > 20 and 
        ("campaign" in text_lower or "status summary" in text_lower)):
        
        # Look for order number pattern like "O-57GQ7-R4"
        order_match = re.search(r'order\s*#?\s*:?\s*(O-[A-Z0-9\-]+)', text, re.IGNORECASE)
        if not order_match:
            order_match = re.search(r'order\s*#?\s*:?\s*([A-Z0-9\-]{6,})', text, re.IGNORECASE)
        order_num = order_match.group(1) if order_match else "UNKNOWN"
        return f"FORMAT1_{order_num}", order_num
    
    # Format 2: MediaHub-style IOs (IPG agencies)  
    # Key indicators: "FROM" on line 3, "Placement changes" in text
    elif (len(lines) > 35 and
          "from" in lines[2].lower() and
          "placement changes" in text_lower):
        
        order_match = re.search(r'order\s*#?\s*([A-Z0-9\-]+)', text, re.IGNORECASE)
        order_num = order_match.group(1) if order_match else "UNKNOWN"
        return f"FORMAT2_{order_num}", order_num
    
    # Format 3: Bliss Point Media-style IOs (Performance marketing)
    # Key indicators: "Signed" on line 4, "Tinuiti" in text
    elif (len(lines) > 30 and
          "signed" in lines[3].lower() and
          "tinuiti" in text_lower):
        
        # Look for "Order Number" pattern first
        order_match = re.search(r'order\s*number\s*:?\s*([A-Z0-9\.\-]+)', text, re.IGNORECASE)
        if not order_match:
            # Fallback to BPMTUBIID pattern
            order_match = re.search(r'bpmtubiid(\d+)', text_lower)
            if not order_match:
                # Final fallback to any number pattern
                order_match = re.search(r'(\d{6,})', text)
        order_num = order_match.group(1) if order_match else "UNKNOWN"
        return f"FORMAT3_{order_num}", order_num
    
    # Format 4: Tatari-style IOs (Performance marketing platform)
    # Key indicators: "Tatari" and "default creative group" in text
    elif (len(lines) > 15 and
          "tatari" in text_lower and
          "default creative group" in text_lower):
        
        # Look for order number in various patterns
        order_match = re.search(r'order\s*#?\s*(\d+)', text, re.IGNORECASE)
        if not order_match:
            order_match = re.search(r'orders/([A-Z0-9]+)', text, re.IGNORECASE)
        order_num = order_match.group(1) if order_match else "UNKNOWN"
        return f"FORMAT4_{order_num}", order_num
    
    else:
        return "UNKNOWN_FORMAT", "UNKNOWN"


def extract_order_number(text_file_path: str) -> dict:
    """
    Extract order number from text file and return structured result.
    
    Returns:
        dict: { ok: bool, order_number: str, provenance: str, all_candidates: list }
    """
    try:
        with open(text_file_path, 'r', encoding='utf-8') as f:
            text = f.read()
        
        format_type, order_number = classify_io_format(text)
        
        # Collect all potential order number candidates
        all_candidates = []
        
        # Pattern 1: Order # patterns
        order_patterns = [
            r'order\s*#?\s*:?\s*(O-[A-Z0-9\-]+)',
            r'order\s*#?\s*:?\s*([A-Z0-9\-]{6,})',
            r'order\s*number\s*:?\s*([A-Z0-9\.\-]+)',
            r'order\s*#?\s*(\d+)',
            r'orders/([A-Z0-9]+)',
            r'bpmtubiid(\d+)',
            r'(\d{6,})'
        ]
        
        for pattern in order_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            all_candidates.extend(matches)
        
        # Remove duplicates and filter out obvious non-order numbers
        all_candidates = list(set([c for c in all_candidates if len(c) >= 3]))
        
        return {
            "ok": order_number != "UNKNOWN",
            "order_number": order_number,
            "provenance": format_type,
            "all_candidates": all_candidates
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
