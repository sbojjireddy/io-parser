import path from "node:path";
import fs from "node:fs/promises";
import { parseTextToJSON } from "./stage2_parse_text.js";

/**
 * Run stage 2 parsing on extracted text files
 * - Promise-based (await only)
 * - Merges order number from PyMuPDF extraction
 * - Writes parsed JSON to data/parsed/{sha}.pre_validation.json
 */
export async function runStage2(
  sha: string,
  openaiTextPath: string,
  pymupdfTextPath: string,
  orderNumber?: string
): Promise<{
  parsed: any;
  filePath: string;
}> {
  // Ensure extracted directory exists
  const extractedDir = path.join(process.cwd(), "data", "parsed");
  await fs.mkdir(extractedDir, { recursive: true });

  const outputPath = path.join(extractedDir, `${sha}.pre_validation.json`);

  try {
    // Read the OpenAI extracted text (preferred for parsing)
    const openaiText = await fs.readFile(openaiTextPath, "utf-8");
    
    console.log(`Parsing text with OpenAI (${openaiText.length} characters)`);
    if (orderNumber) {
      console.log(`Using order number from PyMuPDF: ${orderNumber}`);
    }

    // Parse the text to JSON
    const parsed = await parseTextToJSON(openaiText, orderNumber);

    // Write the parsed JSON to file
    await fs.writeFile(outputPath, JSON.stringify(parsed, null, 2), "utf-8");

    return {
      parsed,
      filePath: outputPath
    };
  } catch (error) {
    throw new Error(`Stage 2 parsing failed: ${(error as Error).message}`);
  }
}

// CLI runner
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error("Usage: npm run run:stage2 -- <sha> <openaiTextPath> [pymupdfTextPath] [orderNumber]");
    console.error("Example: npm run run:stage2 -- abc123 ./data/extracted/abc123.openai.txt ./data/extracted/abc123.pymu.txt O-57GQ7-R4");
    process.exit(1);
  }

  const [sha, openaiTextPath, pymupdfTextPath, orderNumber] = args;

  try {
    console.log(`Running stage 2 parsing for SHA: ${sha}`);
    console.log(`OpenAI text path: ${openaiTextPath}`);
    if (pymupdfTextPath) {
      console.log(`PyMuPDF text path: ${pymupdfTextPath}`);
    }
    if (orderNumber) {
      console.log(`Order number: ${orderNumber}`);
    }

    let result;
    if (typeof pymupdfTextPath !== "undefined" && typeof orderNumber !== "undefined") {
      result = await runStage2(
        sha as string,
        openaiTextPath as string,
        pymupdfTextPath as string,
        orderNumber as string
      );
    } else if (typeof pymupdfTextPath !== "undefined") {
      result = await runStage2(
        sha as string,
        openaiTextPath as string,
        pymupdfTextPath as string
      );
    } else if (typeof orderNumber !== "undefined") {
      result = await runStage2(
        sha as string,
        openaiTextPath as string,
        "", // Provide empty string for pymupdfTextPath if not given
        orderNumber as string
      );
    } else {
      result = await runStage2(
        sha as string,
        openaiTextPath as string,
        "" // Provide empty string for pymupdfTextPath if neither optional argument given
      );
    }

    console.log("\nStage 2 parsing completed!");
    console.log(`Parsed JSON written to: ${result.filePath}`);
    // Display key extracted fields
    const parsed = result.parsed;
    console.log(`\nExtracted fields:`);
    console.log(`- Advertiser: ${parsed.advertiser_name || 'null'}`);
    console.log(`- Agency: ${parsed.agency_name || 'null'}`);
    console.log(`- Campaign Flight: ${parsed.campaign_total_flight?.start || 'null'} to ${parsed.campaign_total_flight?.end || 'null'}`);
    console.log(`- Total Impressions: ${parsed.total_contracted_impressions?.toLocaleString() || 'null'}`);
    console.log(`- Total Spend: $${parsed.total_campaign_spend?.toLocaleString() || 'null'} ${parsed.currency || ''}`);
    console.log(`- PO Number: ${parsed.po_number || 'null'}`);
    console.log(`- Account Executive: ${parsed.account_executive_name || 'null'}`);
    console.log(`- Frequency Cap: ${parsed.frequency_cap || 'null'}`);
    console.log(`- Flights: ${parsed.flights?.length || 0} flight(s)`);

    if (parsed.flights && parsed.flights.length > 0) {
      console.log(`\nFlight breakdown:`);
      parsed.flights.forEach((flight: any, index: number) => {
        console.log(`  ${index + 1}. ${flight.name || 'Unnamed'} (${flight.start} to ${flight.end})`);
        console.log(`     Units: ${flight.units?.toLocaleString() || 'null'}, Cost: $${flight.cost?.toLocaleString() || 'null'}, CPM: $${flight.rate_cpm || 'null'}`);
      });
    }

  } catch (error) {
    console.error("Stage 2 parsing failed:", (error as Error).message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
