import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

const execFileAsync = promisify(execFile);

export interface OrderNumberResult {
  ok: boolean;
  order_number?: string;
  provenance?: string;
  all_candidates?: string[];
}

/**
 * Extract text from PDF using PyMuPDF and optionally extract order number.
 * - Promise-based (await only).
 * - Runs Python script to extract text.
 * - Calls extract_order_number.py if present.
 * - Returns order number extraction result.
 */
export async function extractPyMuPDFText(
  pdfPath: string,
  sha: string
): Promise<{ text: string; orderNumber?: OrderNumberResult }> {
  // Ensure extracted directory exists
  const extractedDir = path.join(process.cwd(), "data", "extracted");
  await fs.mkdir(extractedDir, { recursive: true });

  // Run PyMuPDF text extraction
  const pythonScript = path.join(process.cwd(), "..", "python", "dump_text.py");
  const outputPath = path.join(extractedDir, `${sha}.pymu.txt`);

  try {
    // Run the Python script (use venv in dev, system python in prod) 
    // TODO: definitely need to change this when we have a prod environment
    const pythonPath = process.env.PYTHON_PATH || 
      (existsSync(path.join(process.cwd(), "..", ".venv", "bin", "python"))
        ? path.join(process.cwd(), "..", ".venv", "bin", "python")
        : "python3");
    const { stdout } = await execFileAsync(pythonPath, [pythonScript, "--pdf", pdfPath]);
    
    // Write the extracted text to file
    await fs.writeFile(outputPath, stdout, "utf-8");

    // Try to extract order number if the script exists
    let orderNumber: OrderNumberResult | undefined;
    const orderNumberScript = path.join(process.cwd(), "..", "python", "extract_order_number.py");
    
    try {
      await fs.access(orderNumberScript);
      // Script exists, run it
      const { stdout: orderStdout } = await execFileAsync(pythonPath, [orderNumberScript, outputPath]);
      orderNumber = JSON.parse(orderStdout);
    } catch (error) {
      // Script doesn't exist or failed, skip order number extraction
      console.log("Order number extraction script not found or failed, skipping...");
    }

    return {
      text: stdout,
      ...(orderNumber && { orderNumber })
    };
  } catch (error) {
    throw new Error(`PyMuPDF extraction failed: ${(error as Error).message}`);
  }
}
