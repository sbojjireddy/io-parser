import fs from "node:fs/promises";
import { openai } from '../lib/openai.js';

/**
 * Extract text from a PDF file previously uploaded to OpenAI (by fileId).
 * - Promise-based (await only).
 * - Uses a deterministic prompt.
 * - Returns trimmed text.
 */
export async function extractOpenAIText(
  fileId: string,
  extractionPromptPath?: string
): Promise<string> {
  const defaultPrompt = `Extract the entire document in **structured Markdown**.

RULES:
• Strictly no hallucinations. Values must be copied EXACTLY as written in the PDF
• Extract EVERYTHING — every table, value, date, name, rate, and detail — verbatim.
• **Do NOT skip or abbreviate ANY content.** Do NOT use ellipses (...) or shorten names, tables, or text.
• Include all pages and all sections from start to finish.
• **Only** summarize long-form legal or boilerplate sections (e.g., indemnity, governing law, payment terms) in 2–3 sentences each.
• All business, financial, and operational content must be extracted fully — including long flighting tables, monthly allocations, added value sections, and any extended placement rows.
• Render all tables as properly formatted Markdown tables with full headers and all rows.
• Preserve numeric precision, currency symbols, and date formats exactly.
• Insert <!-- Page N --> comments where each new page begins.
• If any content is unreadable or appears as an image, mark it as [UNREADABLE] or [IMAGE] and continue — do NOT skip the section.
• Do not omit any section simply because it looks repetitive or long.
• Output Markdown only — no explanations or commentary.`;

  const prompt =
    extractionPromptPath
      ? await fs.readFile(extractionPromptPath, "utf-8")
      : defaultPrompt;

  console.log('Calling OpenAI Responses API for text extraction...');
  console.log('   Model: gpt-4.1');
  console.log('   File ID:', fileId);
  
  const response = await openai.responses.create({
    model: "gpt-4.1",
    temperature: 0,
    input: [{
      role: "user",
      content: [
        { type: "input_file", file_id: fileId },
        { type: "input_text", text: prompt }
      ]
    }]
  });

  const text = (response as any).output_text ?? "";
  console.log('OpenAI text extraction complete');
  console.log('   Extracted text length:', text.length, 'characters');
  
  return String(text).trim();
}
