import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

const execFileAsync = promisify(execFile);

/**
 * Extract text from PDF using PyMuPDF.
 * - Promise-based (await only).
 * - Runs Python script to extract text.
 * - Order number extraction is done separately in run_stage1.ts
 */
export async function extractPyMuPDFText(
  pdfPath: string,
  sha: string
): Promise<{ text: string }> {
  // Ensure extracted directory exists
  const extractedDir = path.join(process.cwd(), "data", "extracted");
  await fs.mkdir(extractedDir, { recursive: true });

  // Run PyMuPDF text extraction
  const pythonScript = path.join(process.cwd(), "..", "scripts", "dump_text.py");
  const outputPath = path.join(extractedDir, `${sha}.pymu.txt`);

  try {
    console.log('Running PyMuPDF text extraction...');
    console.log('   Script:', pythonScript);
    console.log('   PDF:', pdfPath);
    
    // Run the Python script (use venv in dev, system python in prod) 
    // TODO: definitely need to change this when we have a prod environment
    const pythonPath = process.env.PYTHON_PATH || 
      (existsSync(path.join(process.cwd(), "..", ".venv", "bin", "python"))
        ? path.join(process.cwd(), "..", ".venv", "bin", "python")
        : "python3");
    const { stdout } = await execFileAsync(pythonPath, [pythonScript, "--pdf", pdfPath]);
    
    console.log('PyMuPDF extraction complete');
    console.log('   Extracted text length:', stdout.length, 'characters');
    
    // Write the extracted text to file
    await fs.writeFile(outputPath, stdout, "utf-8");

    return {
      text: stdout
    };
  } catch (error) {
    throw new Error(`PyMuPDF extraction failed: ${(error as Error).message}`);
  }
}
