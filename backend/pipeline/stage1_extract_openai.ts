import fs from "node:fs/promises";
import path from "node:path";
import { openai } from '../lib/openai.js';

/**
 * Extract text from a PDF file previously uploaded to OpenAI (by fileId).
 * - Promise-based (await only).
 * - Uses a deterministic prompt.
 * - Returns trimmed text.
 */
export async function extractOpenAIText(fileId: string): Promise<string> {
  // Load the prompt from file
  const promptPath = path.join(process.cwd(), 'prompts', 'text_extraction_prompt.txt');
  const prompt = await fs.readFile(promptPath, "utf-8");

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
