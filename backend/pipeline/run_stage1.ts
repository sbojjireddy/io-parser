import path from "node:path";
import fs from "node:fs/promises";
import { extractOpenAIText } from "./stage1_extract_openai.js";
import { extractPyMuPDFText } from "./stage1_extract_pymupdf.js";

/**
 * Run both extractors in parallel for a given PDF.
 * - Promise-based (await only).
 * - Writes artifacts to data/extracted/{sha}.{openai|pymu}.txt
 */
export async function runStage1(
  sha: string,
  pdfPath: string,
  openaiFileId: string,
  extractionPromptPath?: string
): Promise<{
  openai: { text: string; filePath: string };
  pymupdf: { text: string; filePath: string; orderNumber?: any };
}> {
  // Ensure extracted directory exists
  const extractedDir = path.join(process.cwd(), "data", "extracted");
  await fs.mkdir(extractedDir, { recursive: true });

  const openaiOutputPath = path.join(extractedDir, `${sha}.openai.txt`);
  const pymupdfOutputPath = path.join(extractedDir, `${sha}.pymu.txt`);

  // Run both extractors in parallel
  const [openaiResult, pymupdfResult] = await Promise.all([
    // OpenAI extraction
    extractOpenAIText(openaiFileId, extractionPromptPath).then(text => ({
      text,
      filePath: openaiOutputPath
    })),
    
    // PyMuPDF extraction
    extractPyMuPDFText(pdfPath, sha).then(result => ({
      text: result.text,
      filePath: pymupdfOutputPath,
      orderNumber: result.orderNumber
    }))
  ]);

  // Write OpenAI results to file
  await fs.writeFile(openaiOutputPath, openaiResult.text, "utf-8");

  // PyMuPDF results are already written by the extractor
  // Just verify the file exists
  await fs.access(pymupdfOutputPath);

  return {
    openai: openaiResult,
    pymupdf: pymupdfResult
  };
}

// CLI runner
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error("Usage: npm run run:stage1 -- <sha> <pdfPath> <openaiFileId> [extractionPromptPath]");
    process.exit(1);
  }

  const [sha, pdfPath, openaiFileId, extractionPromptPath] = args;

  try {
    console.log(`Running stage 1 extraction for SHA: ${sha}`);
    console.log(`PDF Path: ${pdfPath}`);
    console.log(`OpenAI File ID: ${openaiFileId}`);
    if (extractionPromptPath) {
      console.log(`Extraction Prompt: ${extractionPromptPath}`);
    }

    let results;
    if (extractionPromptPath !== undefined) {
      results = await runStage1(
        sha as string,
        pdfPath as string,
        openaiFileId as string,
        extractionPromptPath as string
      );
    } else {
      results = await runStage1(
        sha as string,
        pdfPath as string,
        openaiFileId as string
      );
    }

    console.log("\nStage 1 extraction completed!");
    console.log(`OpenAI text written to: ${results.openai.filePath}`);
    console.log(`PyMuPDF text written to: ${results.pymupdf.filePath}`);
    
    if (results.pymupdf.orderNumber?.ok) {
      console.log(`\nOrder Number found: ${results.pymupdf.orderNumber.order_number}`);
      console.log(`Provenance: ${results.pymupdf.orderNumber.provenance}`);
      if (results.pymupdf.orderNumber.all_candidates?.length) {
        console.log(`All candidates: ${results.pymupdf.orderNumber.all_candidates.join(", ")}`);
      }
    } else {
      console.log("\nNo order number found");
    }

  } catch (error) {
    console.error("Stage 1 extraction failed:", (error as Error).message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
