import path from "node:path";
import fs from "node:fs/promises";
import { parseTextToJSONWithStability } from "./stage2_parse_text.js";
import { applyFlightLogic } from "./apply_flight_logic.js";
import { calculateConfidence } from "./apply_confidence.js";
import type { IOData, FlightItem, FieldConfidence } from "./types.js";

// Simplified output types (exported for use in API/frontend)
export interface SimplifiedField {
  field: string;
  value: any;
  confidence: number;
  status: 'use' | 'review' | 'reject';
  needs_review: boolean;
  reason?: string;
}

export interface SimplifiedFlight {
  index: number | null;
  placement_id: string | null;
  name: string | null;
  start: string | null;
  end: string | null;
  units: number | null;
  unit_type: string | null;
  rate_cpm: number | null;
  cost_method: string | null;
  cost: number | null;
  currency: string | null;
  confidence: number;
  status: 'use' | 'review' | 'reject';
  needs_review: boolean;
  reason?: string;
}

export interface SimplifiedOutput {
  fields: SimplifiedField[];
  flights: SimplifiedFlight[];
  overall_confidence: number;
  needs_review: boolean;
  summary: {
    total_fields: number;
    use_count: number;
    review_count: number;
    reject_count: number;
  };
}

/**
 * Transform complex IOData with confidence into simplified, flat structure
 */
function transformToSimplifiedOutput(data: IOData): SimplifiedOutput {
  const fields: SimplifiedField[] = [];
  const confidenceReport = data.confidence!;
  
  // Helper to get confidence for a field
  const getFieldConfidence = (fieldName: string): FieldConfidence | undefined => {
    return confidenceReport.field_confidences.find(fc => fc.field === fieldName);
  };
  
  // Helper to extract reason from components
  const extractReason = (fieldConf: FieldConfidence | undefined): string | undefined => {
    if (!fieldConf) return undefined;
    
    // Look for critical failure or low-scoring components
    const criticalComponent = fieldConf.components.find(c => 
      c.name === 'critical_failure_gate' || 
      (c.score === 0.0 && (c.name.includes('match') || c.name.includes('triangle')))
    );
    
    if (criticalComponent) {
      return criticalComponent.notes;
    }
    
    // For review status, find the weakest component
    if (fieldConf.status === 'review') {
      const weakComponent = fieldConf.components
        .filter(c => c.name !== 'confidence_merge')
        .sort((a, b) => a.score - b.score)[0];
      
      if (weakComponent && weakComponent.score < 0.7) {
        return weakComponent.notes;
      }
    }
    
    return undefined;
  };
  
  // Map top-level fields
  const fieldMappings = [
    { field: 'advertiser_name', value: data.advertiser_name },
    { field: 'agency_name', value: data.agency_name },
    { field: 'campaign_start_date', value: data.campaign_total_flight?.start },
    { field: 'campaign_end_date', value: data.campaign_total_flight?.end },
    { field: 'total_contracted_impressions', value: data.total_contracted_impressions },
    { field: 'total_campaign_spend', value: data.total_campaign_spend },
    { field: 'currency', value: data.currency },
    { field: 'po_number', value: data.po_number },
    { field: 'account_executive_name', value: data.account_executive_name },
    { field: 'frequency_cap', value: data.frequency_cap },
    { field: 'period_start', value: data.period?.start },
    { field: 'period_end', value: data.period?.end }
  ];
  
  fieldMappings.forEach(({ field, value }) => {
    // Special handling for nested fields
    let confFieldName = field;
    if (field === 'campaign_start_date') confFieldName = 'start_date';
    if (field === 'campaign_end_date') confFieldName = 'end_date';
    
    const fieldConf = getFieldConfidence(confFieldName);
    
    if (fieldConf || value !== null) {
      const reason = extractReason(fieldConf);
      const fieldData: SimplifiedField = {
        field,
        value,
        confidence: fieldConf?.confidence_score ?? 0.5,
        status: fieldConf?.status ?? 'review',
        needs_review: (fieldConf?.status === 'review' || fieldConf?.status === 'reject') ?? true
      };
      if (reason) fieldData.reason = reason;
      fields.push(fieldData);
    }
  });
  
  // Map flights
  const flights: SimplifiedFlight[] = data.flights.map((flight, index) => {
    const flightFieldName = `flight_${index + 1}`;
    const flightConf = getFieldConfidence(flightFieldName);
    const reason = extractReason(flightConf);
    
    const flightData: SimplifiedFlight = {
      index: flight.index,
      placement_id: flight.placement_id,
      name: flight.name,
      start: flight.start,
      end: flight.end,
      units: flight.units,
      unit_type: flight.unit_type,
      rate_cpm: flight.rate_cpm,
      cost_method: flight.cost_method,
      cost: flight.cost,
      currency: flight.currency,
      confidence: flightConf?.confidence_score ?? 0.8,
      status: flightConf?.status ?? 'use',
      needs_review: (flightConf?.status === 'review' || flightConf?.status === 'reject') ?? false
    };
    if (reason) flightData.reason = reason;
    return flightData;
  });
  
  // Calculate summary
  const allStatuses = [...fields.map(f => f.status), ...flights.map(f => f.status)];
  const useCount = allStatuses.filter(s => s === 'use').length;
  const reviewCount = allStatuses.filter(s => s === 'review').length;
  const rejectCount = allStatuses.filter(s => s === 'reject').length;
  
  return {
    fields,
    flights,
    overall_confidence: confidenceReport.overall_score,
    needs_review: reviewCount > 0 || rejectCount > 0,
    summary: {
      total_fields: fields.length + flights.length,
      use_count: useCount,
      review_count: reviewCount,
      reject_count: rejectCount
    }
  };
}

/**
 * Run stage 4 processing: apply confidence scoring and save final JSON
 * - Promise-based (await only)
 * - Runs 3 parsing iterations for stability analysis
 * - Applies confidence scoring with all validation rules
 * - Saves final JSON to data/combined/{sha}.json
 */
export async function runStage4(
  sha: string,
  openaiTextPath: string,
  orderNumber?: string
): Promise<{
  finalData: IOData;
  simplifiedData: SimplifiedOutput;
  confidenceReport: any;
  filePath: string;
  simplifiedFilePath: string;
}> {
  // Ensure combined directory exists
  const combinedDir = path.join(process.cwd(), "data", "combined");
  await fs.mkdir(combinedDir, { recursive: true });

  const outputPath = path.join(combinedDir, `${sha}.json`);
  const simplifiedOutputPath = path.join(combinedDir, `${sha}.simple.json`);

  try {
    // Read the OpenAI extracted text
    const openaiText = await fs.readFile(openaiTextPath, "utf-8");
    
    console.log(`Running 3-parsing stability analysis (${openaiText.length} characters)`);
    if (orderNumber) {
      console.log(`Using order number from PyMuPDF: ${orderNumber}`);
    }

    // Parse the text 3 times for stability analysis
    const { primary, allRuns } = await parseTextToJSONWithStability(openaiText, orderNumber);

    // Apply flight logic (month boundary proration)
    console.log('Applying flight logic (month boundary proration)...');
    const { io: processedData } = applyFlightLogic(primary);

    // Convert FlightSegment[] to FlightItem[] for IOData compatibility
    const convertedFlights: FlightItem[] = processedData.flights.map(flight => ({
      index: flight.index,
      placement_id: flight.placement_id,
      name: flight.name,
      start: flight.start,
      end: flight.end,
      units: flight.units,
      unit_type: flight.unit_type,
      rate_cpm: flight.rate_cpm,
      cost_method: flight.cost_method,
      cost: flight.cost,
      currency: flight.currency,
      provenance: {
        quote: flight.provenance.quote,
        location_hint: flight.provenance.location_hint,
        find_confidence_interval: flight.provenance.find_confidence_interval,
        value_confidence_interval: flight.provenance.value_confidence_interval,
        rationale: flight.provenance.rationale
      }
    }));

    // Convert provenance array to include confidence fields
    const convertedProvenance = processedData.provenance.map(prov => ({
      field: prov.field,
      quote: prov.quote,
      location_hint: prov.location_hint,
      find_confidence_interval: prov.find_confidence_interval,
      value_confidence_interval: prov.value_confidence_interval,
      rationale: prov.rationale
    }));

    // Create IOData-compatible object
    const ioData: IOData = {
      advertiser_name: processedData.advertiser_name,
      agency_name: processedData.agency_name,
      campaign_total_flight: processedData.campaign_total_flight,
      total_contracted_impressions: processedData.total_contracted_impressions,
      total_campaign_spend: processedData.total_campaign_spend,
      currency: processedData.currency,
      po_number: processedData.po_number,
      account_executive_name: processedData.account_executive_name,
      frequency_cap: processedData.frequency_cap,
      period: processedData.period,
      flights: convertedFlights,
      explanation: processedData.explanation,
      provenance: convertedProvenance
    };

    // Calculate confidence scores using all 3 runs for stability
    console.log('Calculating confidence scores with 3-run stability analysis...');
    const confidenceReport = calculateConfidence(
      ioData,
      allRuns, // All 3 runs for stability analysis
      undefined // CPM will be calculated from flights if available
    );

    // Add confidence to final data
    const finalData: IOData = {
      ...ioData,
      confidence: confidenceReport
    };

    // Generate simplified output
    console.log('Generating simplified output format...');
    const simplifiedData = transformToSimplifiedOutput(finalData);

    // Write both formats to files
    await Promise.all([
      fs.writeFile(outputPath, JSON.stringify(finalData, null, 2), "utf-8"),
      fs.writeFile(simplifiedOutputPath, JSON.stringify(simplifiedData, null, 2), "utf-8")
    ]);

    console.log(`Saved full format to: ${outputPath}`);
    console.log(`Saved simplified format to: ${simplifiedOutputPath}`);

    return {
      finalData,
      simplifiedData,
      confidenceReport,
      filePath: outputPath,
      simplifiedFilePath: simplifiedOutputPath
    };
  } catch (error) {
    throw new Error(`Stage 4 processing failed: ${(error as Error).message}`);
  }
}

// CLI runner
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error("Usage: npm run run:stage4 -- <sha> <openaiTextPath> [orderNumber]");
    console.error("Example: npm run run:stage4 -- abc123 ./data/extracted/abc123.openai.txt O-57GQ7-R4");
    process.exit(1);
  }

  const [sha, openaiTextPath, orderNumber] = args;

  try {
    console.log(`Running stage 4 processing for SHA: ${sha}`);
    console.log(`OpenAI text path: ${openaiTextPath}`);
    if (orderNumber) {
      console.log(`Order number: ${orderNumber}`);
    }

    const result = await runStage4(
      sha as string,
      openaiTextPath as string,
      orderNumber as string
    );

    console.log("\nStage 4 processing completed!");
    console.log(`Final JSON written to: ${result.filePath}`);
    
    // Display confidence summary
    const confidence = result.confidenceReport;
    console.log(`\nConfidence Analysis Summary:`);
    console.log(`- Overall Score: ${(confidence.overall_score * 100).toFixed(1)}%`);
    console.log(`- Use: ${confidence.summary.use_count} fields`);
    console.log(`- Review: ${confidence.summary.review_count} fields`);
    console.log(`- Reject: ${confidence.summary.reject_count} fields`);

    // Display key extracted fields
    const final = result.finalData;
    console.log(`\nFinal Extracted Fields:`);
    console.log(`- Advertiser: ${final.advertiser_name || 'null'}`);
    console.log(`- Agency: ${final.agency_name || 'null'}`);
    console.log(`- Campaign Flight: ${final.campaign_total_flight?.start || 'null'} to ${final.campaign_total_flight?.end || 'null'}`);
    console.log(`- Total Impressions: ${final.total_contracted_impressions?.toLocaleString() || 'null'}`);
    console.log(`- Total Spend: $${final.total_campaign_spend?.toLocaleString() || 'null'} ${final.currency || ''}`);
    console.log(`- PO Number: ${final.po_number || 'null'}`);
    console.log(`- Account Executive: ${final.account_executive_name || 'null'}`);
    console.log(`- Frequency Cap: ${final.frequency_cap || 'null'}`);
    console.log(`- Flights: ${final.flights?.length || 0} flight(s)`);

    // Display confidence details for key fields
    console.log(`\nField Confidence Details:`);
    const keyFields = ['advertiser_name', 'agency_name', 'total_campaign_spend', 'total_contracted_impressions', 'po_number', 'account_executive_name'];
    keyFields.forEach((fieldName: string) => {
      const fieldConf = confidence.field_confidences.find((fc: FieldConfidence) => fc.field === fieldName);
      if (fieldConf) {
        console.log(`- ${fieldName}: ${(fieldConf.confidence_score * 100).toFixed(1)}% (${fieldConf.status})`);
      }
    });

    // Display flight confidence summary
    const flightConfidences = confidence.field_confidences.filter((fc: FieldConfidence) => fc.field.startsWith('flight_'));
    if (flightConfidences.length > 0) {
      const flightUseCount = flightConfidences.filter((fc: FieldConfidence) => fc.status === 'use').length;
      const flightReviewCount = flightConfidences.filter((fc: FieldConfidence) => fc.status === 'review').length;
      const flightRejectCount = flightConfidences.filter((fc: FieldConfidence) => fc.status === 'reject').length;
      console.log(`\nFlight Confidence Summary:`);
      console.log(`- Use: ${flightUseCount} flights`);
      console.log(`- Review: ${flightReviewCount} flights`);
      console.log(`- Reject: ${flightRejectCount} flights`);
    }

  } catch (error) {
    console.error("Stage 4 processing failed:", (error as Error).message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
