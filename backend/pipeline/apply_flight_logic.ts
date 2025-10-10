import { parseISO, format, addMonths, startOfMonth, endOfMonth, differenceInDays, addDays } from 'date-fns';

export interface FlightSegment {
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
  segment_days?: number;
  proration_factor?: number;
  provenance: {
    quote: string;
    location_hint: string;
    find_confidence_interval: [number, number];
    value_confidence_interval: [number, number];
    rationale: string;
  };
}

export interface ProcessedIO {
  advertiser_name: string | null;
  agency_name: string | null;
  campaign_total_flight: {
    start: string | null;
    end: string | null;
  } | null;
  total_contracted_impressions: number | null;
  total_campaign_spend: number | null;
  currency: string | null;
  po_number: string | null;
  account_executive_name: string | null;
  frequency_cap: number;
  period: {
    start: string | null;
    end: string | null;
  } | null;
  flights: FlightSegment[];
  explanation: {
    summary: string;
    assumptions: string[];
    omissions: string[];
  };
  provenance: Array<{
    field: string;
    quote: string;
    location_hint: string;
    find_confidence_interval: [number, number];
    value_confidence_interval: [number, number];
    rationale: string;
  }>;
}

export interface ProcessingSummary {
  original_flights: number;
  prorated_segments: number;
  month_crossing_flights: number;
  total_cost_before: number;
  total_cost_after: number;
  total_units_before: number;
  total_units_after: number;
  processing_notes: string[];
}

/**
 * Parse date string in YYYY-MM-DD format
 */
function parseDate(dateStr: string): Date {
  return parseISO(dateStr);
}

/**
 * Get number of days in a month
 */
function getDaysInMonth(year: number, month: number): number {
  const date = new Date(year, month - 1, 1);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/**
 * Split a flight that crosses months and prorate cost/impressions based on days.
 * Returns list of prorated flight segments.
 */
function prorateFlight(flight: FlightSegment): FlightSegment[] {
  if (!flight.start || !flight.end) {
    // If dates are missing, return as-is
    return [flight];
  }

  const startDate = parseDate(flight.start);
  const endDate = parseDate(flight.end);
  const totalDays = differenceInDays(endDate, startDate) + 1; // +1 to include both start and end dates
  
  // If flight is within same month, return as-is with segment info
  if (startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear()) {
    const segment = { ...flight };
    segment.segment_days = totalDays;
    segment.proration_factor = 1.0;
    return [segment];
  }
  
  const segments: FlightSegment[] = [];
  let currentDate = startDate;
  let remainingCost = flight.cost || 0;
  let remainingUnits = flight.units || 0;
  
  while (currentDate <= endDate) {
    // Find end of current month
    const monthEnd = endOfMonth(currentDate);
    
    // Segment end is either month end or flight end, whichever comes first
    const segmentEnd = currentDate > monthEnd ? endDate : (endDate < monthEnd ? endDate : monthEnd);
    const segmentDays = differenceInDays(segmentEnd, currentDate) + 1;
    
    // Calculate prorated values
    const prorationFactor = segmentDays / totalDays;
    let proratedCost: number | null = null;
    let proratedUnits: number | null = null;
    
    if (flight.cost !== null) {
      // For the last segment, use remaining cost to avoid rounding errors
      if (currentDate >= endDate || addDays(segmentEnd, 1) > endDate) {
        proratedCost = Math.round(remainingCost * 100) / 100;
      } else {
        proratedCost = Math.round(flight.cost * prorationFactor * 100) / 100;
        remainingCost -= proratedCost;
      }
    }
    
    if (flight.units !== null) {
      // For the last segment, use remaining units to avoid rounding errors
      if (currentDate >= endDate || addDays(segmentEnd, 1) > endDate) {
        proratedUnits = remainingUnits;
      } else {
        proratedUnits = Math.round(flight.units * prorationFactor);
        remainingUnits -= proratedUnits;
      }
    }
    
    // Create segment
    const segment: FlightSegment = {
      ...flight,
      start: format(currentDate, 'yyyy-MM-dd'),
      end: format(segmentEnd, 'yyyy-MM-dd'),
      cost: proratedCost,
      units: proratedUnits,
      segment_days: segmentDays,
      proration_factor: Math.round(prorationFactor * 10000) / 10000
    };
    
    segments.push(segment);
    
    // Move to next month
    currentDate = addDays(segmentEnd, 1);
  }
  
  return segments;
}

/**
 * Process all flights from JSON data and split month-crossing flights.
 * Returns the original JSON structure with prorated flight segments.
 */
export function applyFlightLogic(
  jsonData: ProcessedIO
): { io: ProcessedIO; summary: ProcessingSummary } {
  const allSegments: FlightSegment[] = [];
  let monthCrossingFlights = 0;
  const processingNotes: string[] = [];
  
  const originalTotalCost = jsonData.total_campaign_spend || 0;
  const originalTotalUnits = jsonData.total_contracted_impressions || 0;
  
  for (const flight of jsonData.flights) {
    const segments = prorateFlight(flight);
    
    // Check if this flight was split (crossed months)
    if (segments.length > 1) {
      monthCrossingFlights++;
      processingNotes.push(
        `Flight ${flight.placement_id || 'unnamed'} (${flight.start} to ${flight.end}) split into ${segments.length} segments due to month boundary`
      );
    }
    
    allSegments.push(...segments);
  }
  
  // Create new JSON structure with prorated segments
  const result: ProcessedIO = {
    ...jsonData,
    flights: allSegments
  };
  
  // Keep original totals - proration should not change the total campaign values
  // The proration is only for splitting flights across months, not changing totals
  result.total_campaign_spend = originalTotalCost;
  result.total_contracted_impressions = originalTotalUnits;
  
  // Add processing notes to explanation
  if (processingNotes.length > 0) {
    result.explanation.assumptions.push(...processingNotes);
  }
  
  const summary: ProcessingSummary = {
    original_flights: jsonData.flights.length,
    prorated_segments: allSegments.length,
    month_crossing_flights: monthCrossingFlights,
    total_cost_before: originalTotalCost,
    total_cost_after: result.total_campaign_spend,
    total_units_before: originalTotalUnits,
    total_units_after: result.total_contracted_impressions,
    processing_notes: processingNotes
  };
  
  return { io: result, summary };
}
