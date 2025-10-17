import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { extractOpenAIText } from "./stage1_extract_openai.js";
import { extractPyMuPDFText } from "./stage1_extract_pymupdf.js";

const execFileAsync = promisify(execFile);

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

  // Check if extracted files already exist
  const openaiExists = existsSync(openaiOutputPath);
  const pymupdfExists = existsSync(pymupdfOutputPath);

  let openaiResult: { text: string; filePath: string };
  let pymupdfResult: { text: string; filePath: string };

  if (openaiExists && pymupdfExists) {
    console.log('Using cached extracted text files...');
    // Read from existing files
    const [openaiText, pymupdfText] = await Promise.all([
      fs.readFile(openaiOutputPath, "utf-8"),
      fs.readFile(pymupdfOutputPath, "utf-8")
    ]);
    
    openaiResult = { text: openaiText, filePath: openaiOutputPath };
    pymupdfResult = { text: pymupdfText, filePath: pymupdfOutputPath };
    
    console.log('Loaded cached extractions');
    console.log(`   OpenAI: ${openaiText.length} characters`);
    console.log(`   PyMuPDF: ${pymupdfText.length} characters`);
  } else {
    // Run extractors for missing files
    const extractionTasks = [];
    
    if (!openaiExists) {
      console.log('Running OpenAI extraction...');
      extractionTasks.push(
        extractOpenAIText(openaiFileId, extractionPromptPath).then(async text => {
          await fs.writeFile(openaiOutputPath, text, "utf-8");
          return { text, filePath: openaiOutputPath };
        })
      );
    } else {
      console.log('Using cached OpenAI extraction...');
      extractionTasks.push(
        fs.readFile(openaiOutputPath, "utf-8").then(text => ({
          text,
          filePath: openaiOutputPath
        }))
      );
    }
    
    if (!pymupdfExists) {
      console.log('Running PyMuPDF extraction...');
      extractionTasks.push(
        extractPyMuPDFText(pdfPath, sha).then(result => ({
          text: result.text,
          filePath: pymupdfOutputPath
        }))
      );
    } else {
      console.log('Using cached PyMuPDF extraction...');
      extractionTasks.push(
        fs.readFile(pymupdfOutputPath, "utf-8").then(text => ({
          text,
          filePath: pymupdfOutputPath
        }))
      );
    }
    
    // Ensure we always have two extraction results, even if one is missing
    const results = await Promise.all(extractionTasks);
    openaiResult = results[0]!;
    pymupdfResult = results[1]!;
  }

  // Extract order number from BOTH PyMuPDF and OpenAI extracts, then pick the best
  console.log('\nExtracting order numbers from both sources...');
  
  const pythonPath = process.env.PYTHON_PATH || 
    (existsSync(path.join(process.cwd(), "..", ".venv", "bin", "python"))
      ? path.join(process.cwd(), "..", ".venv", "bin", "python")
      : "python3");
  
  const orderNumberScript = path.join(process.cwd(), "..", "python", "extract_order_number.py");
  
  let pymupdfOrderNumber: any = undefined;
  let openaiOrderNumber: any = undefined;
  
  try {
    // Extract from PyMuPDF
    const { stdout: pymupdfStdout } = await execFileAsync(pythonPath, [orderNumberScript, pymupdfOutputPath]);
    pymupdfOrderNumber = JSON.parse(pymupdfStdout);
    console.log('   PyMuPDF:', pymupdfOrderNumber.ok ? pymupdfOrderNumber.order_number : 'Not found');
    if (pymupdfOrderNumber.scores) {
      console.log('   PyMuPDF candidates:', Object.keys(pymupdfOrderNumber.scores).join(', '));
    }
  } catch (error) {
    console.log('   PyMuPDF order extraction failed');
  }
  
  try {
    // Extract from OpenAI
    const { stdout: openaiStdout } = await execFileAsync(pythonPath, [orderNumberScript, openaiOutputPath]);
    openaiOrderNumber = JSON.parse(openaiStdout);
    console.log('   OpenAI:', openaiOrderNumber.ok ? openaiOrderNumber.order_number : 'Not found');
    if (openaiOrderNumber.scores) {
      console.log('   OpenAI candidates:', Object.keys(openaiOrderNumber.scores).join(', '));
    }
  } catch (error) {
    console.log('   OpenAI order extraction failed');
  }
  
  // Pick the best order number between the two sources
  let finalOrderNumber = undefined;
  
  if (pymupdfOrderNumber?.ok && openaiOrderNumber?.ok) {
    // Both found order numbers - pick the one with higher score
    const pymupdfScore = pymupdfOrderNumber.scores?.[pymupdfOrderNumber.order_number] || 0;
    const openaiScore = openaiOrderNumber.scores?.[openaiOrderNumber.order_number] || 0;
    
    if (pymupdfScore >= openaiScore) {
      finalOrderNumber = pymupdfOrderNumber;
      console.log(`Using PyMuPDF order number (score: ${pymupdfScore}): ${pymupdfOrderNumber.order_number}`);
    } else {
      finalOrderNumber = openaiOrderNumber;
      console.log(`Using OpenAI order number (score: ${openaiScore}): ${openaiOrderNumber.order_number}`);
    }
  } else if (pymupdfOrderNumber?.ok) {
    // Only PyMuPDF found it
    finalOrderNumber = pymupdfOrderNumber;
    console.log(`Using PyMuPDF order number: ${pymupdfOrderNumber.order_number}`);
  } else if (openaiOrderNumber?.ok) {
    // Only OpenAI found it
    finalOrderNumber = openaiOrderNumber;
    console.log(`Using OpenAI order number: ${openaiOrderNumber.order_number}`);
  } else {
    console.log('No order number found in either source');
  }

  return {
    openai: openaiResult,
    pymupdf: {
      ...pymupdfResult,
      orderNumber: finalOrderNumber
    }
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
