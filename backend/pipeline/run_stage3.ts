import path from "node:path";
import fs from "node:fs/promises";
import { applyFlightLogic } from "./apply_flight_logic.js";
import type { ProcessedIO, ProcessingSummary } from "./apply_flight_logic.js";

/**
 * Run stage 3 processing on parsed JSON data
 * - Promise-based (await only)
 * - Applies month boundary proration logic
 * - Writes processed JSON to data/combined/{sha}.ready.json
 */
export async function runStage3(
  sha: string,
  parsedJsonPath: string
): Promise<{
  processed: ProcessedIO;
  summary: ProcessingSummary;
  filePath: string;
}> {
  // Ensure combined directory exists
  const combinedDir = path.join(process.cwd(), "data", "combined");
  await fs.mkdir(combinedDir, { recursive: true });

  const outputPath = path.join(combinedDir, `${sha}.ready.json`);

  try {
    // Read the parsed JSON data
    const jsonContent = await fs.readFile(parsedJsonPath, "utf-8");
    const parsedData: ProcessedIO = JSON.parse(jsonContent);
    
    console.log(`Processing ${parsedData.flights.length} flights for month boundary proration`);

    // Apply flight logic processing
    const { io: processed, summary } = applyFlightLogic(parsedData);

    // Write the processed JSON to file
    await fs.writeFile(outputPath, JSON.stringify(processed, null, 2), "utf-8");

    return {
      processed,
      summary,
      filePath: outputPath
    };
  } catch (error) {
    throw new Error(`Stage 3 processing failed: ${(error as Error).message}`);
  }
}

// CLI runner
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error("Usage: npm run run:stage3 -- <sha> <parsedJsonPath>");
    console.error("Example: npm run run:stage3 -- abc123 ./data/parsed/abc123.pre_validation.json");
    process.exit(1);
  }

  const [sha, parsedJsonPath] = args;

  try {
    console.log(`Running stage 3 processing for SHA: ${sha}`);
    console.log(`Parsed JSON path: ${parsedJsonPath}`);

    const result = await runStage3(
      sha as string,
      parsedJsonPath as string
    );

    console.log("\nStage 3 processing completed!");
    console.log(`Processed JSON written to: ${result.filePath}`);
    // Display processing summary
    const summary = result.summary;
    console.log(`\nProcessing Summary:`);
    console.log(`- Original flights: ${summary.original_flights}`);
    console.log(`- Prorated segments: ${summary.prorated_segments}`);
    console.log(`- Month-crossing flights: ${summary.month_crossing_flights}`);
    console.log(`- Total cost: $${summary.total_cost_before.toLocaleString()} → $${summary.total_cost_after.toLocaleString()}`);
    console.log(`- Total units: ${summary.total_units_before.toLocaleString()} → ${summary.total_units_after.toLocaleString()}`);

    if (summary.processing_notes.length > 0) {
      console.log(`\nProcessing Notes:`);
      summary.processing_notes.forEach(note => {
        console.log(`- ${note}`);
      });
    }

    // Display flight segments
    const processed = result.processed;
    if (processed.flights && processed.flights.length > 0) {
      console.log(`\nFlight Segments (with month-crossing proration):`);
      console.log("=".repeat(80));
      
      processed.flights.forEach((segment, index) => {
        console.log(`Segment ${index + 1}:`);
        console.log(`  Placement: ${segment.placement_id || 'null'} (${segment.name || 'unnamed'})`);
        console.log(`  Period: ${segment.start} to ${segment.end}`);
        if (segment.segment_days && segment.proration_factor) {
          console.log(`  Days: ${segment.segment_days} (Proration: ${(segment.proration_factor * 100).toFixed(1)}%)`);
        }
        console.log(`  Units: ${segment.units?.toLocaleString() || 'null'} ${segment.unit_type || ''}`);
        console.log(`  Cost: $${segment.cost?.toLocaleString() || 'null'} ${segment.currency || ''}`);
        console.log();
      });
    }

  } catch (error) {
    console.error("Stage 3 processing failed:", (error as Error).message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
