import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openai } from '../lib/openai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JSON_SCHEMA = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../prompts/io_schema.json'), 'utf-8')
);

const PARSING_PROMPT = fs.readFileSync(
  path.join(__dirname, '../prompts/io_parsing_prompt.txt'),
  'utf-8'
);


/**
 * Parse extracted text using OpenAI with structured output (single run)
 * - Promise-based (await only)
 * - Uses JSON schema validation
 * - Returns validated parsed object
 */

export async function parseTextToJSON(
  text: string,
  orderNumber?: string
): Promise<any> {
  try {
    // Use OpenAI with structured output
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: PARSING_PROMPT
        },
        {
          role: "user",
          content: `Parse this Tubi IO document. ${orderNumber ? `The order number is: ${orderNumber}` : ''}

Here is the IO Document text:
${text}`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "tubi_io_parser",
          schema: JSON_SCHEMA,
          strict: true
        }
      },
      temperature: 0
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content returned from OpenAI");
    }

    const parsed = JSON.parse(content);
    
    // Override po_number with order number from PyMuPDF if available (PyMuPDF takes precedence)
    if (orderNumber) {
      parsed.po_number = orderNumber;
      // Add provenance entry for the order number override
      parsed.provenance.push({
        field: "po_number",
        quote: `Order Number: ${orderNumber}`,
        location_hint: "extracted from PyMuPDF text extraction (PyMuPDF precedence)",
        find_confidence_interval: [95, 100],
        value_confidence_interval: [95, 100],
        rationale: "Order number provided by PyMuPDF extraction (takes precedence over OpenAI)"
      });
    } else if (parsed.po_number) {
      // If PyMuPDF didn't find order number but OpenAI did, keep OpenAI's result
      parsed.provenance.push({
        field: "po_number",
        quote: `Order Number: ${parsed.po_number}`,
        location_hint: "extracted from OpenAI text parsing (fallback)",
        find_confidence_interval: [80, 90],
        value_confidence_interval: [75, 85],
        rationale: "Order number from OpenAI parsing (PyMuPDF extraction failed)"
      });
    }

    return parsed;
  } catch (error) {
    throw new Error(`Text parsing failed: ${(error as Error).message}`);
  }
}

/**
 * Parse extracted text using OpenAI with structured output (3 runs for stability)
 * - Promise-based (await only)
 * - Uses JSON schema validation
 * - Runs 3 times for stability analysis
 * - Returns primary result and all runs for confidence scoring
 */
export async function parseTextToJSONWithStability(
  text: string,
  orderNumber?: string
): Promise<{ primary: any; allRuns: any[] }> {
  const allRuns: any[] = [];
  
  for (let i = 0; i < 3; i++) {
    console.log(`Extraction run ${i + 1}/3...`);
    
    try {
      // Use OpenAI with structured output
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: PARSING_PROMPT
          },
          {
            role: "user",
            content: `Parse this Tubi IO document. ${orderNumber ? `The order number is: ${orderNumber}` : ''}

Here is the IO Document text:
${text}`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "tubi_io_parser",
            schema: JSON_SCHEMA,
            strict: true
          }
        },
        temperature: 0
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error(`No content received from OpenAI on run ${i + 1}`);
      }

      const parsed = JSON.parse(content);
      
      // Override po_number with order number from PyMuPDF if available (PyMuPDF takes precedence)
      if (orderNumber) {
        parsed.po_number = orderNumber;
        // Add provenance entry for the order number override
        parsed.provenance.push({
          field: "po_number",
          quote: `Order Number: ${orderNumber}`,
          location_hint: "extracted from PyMuPDF text extraction (PyMuPDF precedence)",
          find_confidence_interval: [95, 100],
          value_confidence_interval: [95, 100],
          rationale: "Order number provided by PyMuPDF extraction (takes precedence over OpenAI)"
        });
      } else if (parsed.po_number) {
        // If PyMuPDF didn't find order number but OpenAI did, keep OpenAI's result
        parsed.provenance.push({
          field: "po_number",
          quote: `Order Number: ${parsed.po_number}`,
          location_hint: "extracted from OpenAI text parsing (fallback)",
          find_confidence_interval: [80, 90],
          value_confidence_interval: [75, 85],
          rationale: "Order number from OpenAI parsing (PyMuPDF extraction failed)"
        });
      }

      allRuns.push(parsed);
    } catch (error) {
      console.error(`JSON parsing failed on run ${i + 1}. Error:`, (error as Error).message);
      throw new Error(`Failed to parse JSON response on run ${i + 1}: ${(error as Error).message}`);
    }
  }

  // Use the first run as the primary result
  const primary = allRuns[0];
  
  return { primary, allRuns };
}
