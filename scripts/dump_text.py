#!/usr/bin/env python3
"""
dump_text.py
PyMuPDF text dump that approximates reading order and preserves table-like spacing.

Usage:
  python dump_text.py --pdf path/to/file.pdf
"""

import argparse
import sys
import fitz  # PyMuPDF


def extract_text_with_reading_order(pdf_path: str) -> str:
    """
    Extract text from PDF with approximate reading order and table preservation.
    """
    doc = fitz.open(pdf_path)
    text_parts = []
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        
        # Get text blocks with position information
        blocks = page.get_text("dict")
        
        # Sort blocks by y-coordinate (top to bottom), then x-coordinate (left to right)
        text_blocks = []
        for block in blocks["blocks"]:
            if "lines" in block:  # Text block
                for line in block["lines"]:
                    line_text = ""
                    for span in line["spans"]:
                        line_text += span["text"]
                    if line_text.strip():
                        text_blocks.append({
                            "text": line_text,
                            "bbox": line["bbox"]  # [x0, y0, x1, y1]
                        })
        
        # Sort by y-coordinate (top to bottom), then x-coordinate (left to right)
        text_blocks.sort(key=lambda b: (b["bbox"][1], b["bbox"][0]))
        
        # Add page separator
        if page_num > 0:
            text_parts.append(f"\n--- Page {page_num + 1} ---\n")
        
        # Add text blocks with spacing
        for i, block in enumerate(text_blocks):
            text_parts.append(block["text"])
            
            # Add spacing between blocks that are far apart vertically
            if i < len(text_blocks) - 1:
                current_bottom = block["bbox"][3]
                next_top = text_blocks[i + 1]["bbox"][1]
                if next_top - current_bottom > 20:  # Significant vertical gap
                    text_parts.append("\n")
    
    doc.close()
    return "\n".join(text_parts)


def main():
    parser = argparse.ArgumentParser(description="Extract text from PDF with reading order")
    parser.add_argument("--pdf", required=True, help="Path to PDF file")
    args = parser.parse_args()
    
    try:
        text = extract_text_with_reading_order(args.pdf)
        print(text)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
