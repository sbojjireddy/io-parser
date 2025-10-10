import type { IOData, FlightItem, ConfidenceComponent, FieldConfidence, ConfidenceReport } from './types.js';

// Helper function for string similarity (for agency names, etc.)
function calculateStringSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  
  // Normalize strings: lowercase, remove extra spaces, remove common suffixes
  const normalize = (s: string) => s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\([^)]*\)$/, '') // Remove trailing parentheses like "(22-KUNCYHE-7)"
    .trim();
  
  const norm1 = normalize(str1);
  const norm2 = normalize(str2);
  
  if (norm1 === norm2) return 0.95; // Very high similarity for normalized matches
  
  // Calculate Levenshtein distance-based similarity
  const maxLen = Math.max(norm1.length, norm2.length);
  if (maxLen === 0) return 1.0;
  
  const distance = levenshteinDistance(norm1, norm2);
  return Math.max(0, (maxLen - distance) / maxLen);
}

function levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0]![j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i]![j] = matrix[i - 1]![j - 1]!;
        } else {
          matrix[i]![j] = Math.min(
            matrix[i - 1]![j - 1]! + 1,
            matrix[i]![j - 1]! + 1,
            matrix[i - 1]![j]! + 1
          );
        }
      }
    }
    
    return matrix[str2.length]![str1.length]!;
  }
  
// Helper functions for parsing and validation
function parseNumeric(value: any): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'string' ? parseFloat(value.replace(/[,$]/g, '')) : Number(value);
  return isNaN(num) ? null : num;
}

function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

// R1. Budget Format Validation
function validateBudgetFormat(totalSpend: number | null): ConfidenceComponent {
  const parsedBudget = parseNumeric(totalSpend);
  const isValid = parsedBudget !== null && parsedBudget > 0;
  
  return {
    name: 'budget_format',
    score: isValid ? 1.0 : 0.0,
    notes: isValid ? 'Valid positive budget' : 'Invalid or missing budget'
  };
}

// R2. CPM Format Validation
function validateCpmFormat(cpm: number | null): ConfidenceComponent {
  const parsedCpm = parseNumeric(cpm);
  const isValid = parsedCpm !== null && parsedCpm > 0;
  
  return {
    name: 'cpm_format',
    score: isValid ? 1.0 : 0.0,
    notes: isValid ? 'Valid positive CPM' : 'Invalid or missing CPM'
  };
}

// R3. Impressions Format Validation
function validateImpressionsFormat(impressions: number | null): ConfidenceComponent {
  const parsedImpressions = parseNumeric(impressions);
  const isValid = parsedImpressions !== null && Number.isInteger(parsedImpressions) && parsedImpressions > 1000;
  
  return {
    name: 'impressions_format',
    score: isValid ? 1.0 : 0.0,
    notes: isValid ? 'Valid impressions count' : 'Invalid impressions (must be integer > 1000)'
  };
}

// R4. Campaign Dates Format Validation
function validateCampaignDatesFormat(startDate: string | null, endDate: string | null): ConfidenceComponent {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const isValid = start !== null && end !== null && start <= end; // Allow start = end

  return {
    name: 'campaign_dates_format',
    score: isValid ? 1.0 : 0.0,
    notes: isValid ? 'Valid ordered campaign dates' : 'Invalid or unordered campaign dates'
  };
}

// R5. Flight Row Dates Format Validation
function validateFlightDatesFormat(flights: FlightItem[]): ConfidenceComponent {
  if (flights.length === 0) {
    return {
      name: 'flight_row_dates_format',
      score: 0.7,
      notes: 'No flights to validate'
    };
  }

  let validCount = 0;
  for (const flight of flights) {
    const start = parseDate(flight.start);
    const end = parseDate(flight.end);
    if (start !== null && end !== null && start <= end) { // Allow start = end
      validCount++;
    }
  }

  const score = validCount / flights.length;
  return {
    name: 'flight_row_dates_format',
    score,
    notes: `${validCount}/${flights.length} flights have valid dates`
  };
}

// R6. Span Quality - Check if field was extracted from expected location
function validateSpanQuality(field: string, location: string | null): ConfidenceComponent {
  if (!location) {
    return {
      name: 'span_quality',
      score: 0.6,
      notes: 'No location information available'
    };
  }

  const locationLower = location.toLowerCase();
  
  // Helper function to check if any keywords match
  const containsAnyKeyword = (text: string, keywords: string[]): boolean => {
    return keywords.some(keyword => text.includes(keyword.toLowerCase()));
  };

  // More flexible keyword matching per field
  const fieldKeywords: Record<string, { primary: string[]; good: string[]; acceptable: string[] }> = {
    'advertiser_name': {
      primary: ['advertiser/brand', 'advertiser name', 'brand name', 'primary ad server'],
      good: ['advertiser', 'brand', 'client name', 'client:', 'company name', 'ad server'],
      acceptable: ['supplier', 'from:', 'to:', 'account', 'customer']
    },
    'agency_name': {
      primary: ['agency name', 'from to section', 'agency:', 'from/to'],
      good: ['agency', 'client', 'from', 'to', 'account manager', 'contact'],
      acceptable: ['supplier', 'vendor', 'partner']
    },
    'total_campaign_spend': {
      primary: ['order total', 'campaign total', 'total cost', 'total spend'],
      good: ['total', 'budget', 'spend', 'cost', 'amount', 'price', 'investment'],
      acceptable: ['revenue', 'billing', 'invoice', 'payment']
    },
    'total_contracted_impressions': {
      primary: ['order total', 'total impressions', 'contracted impressions'],
      good: ['total', 'impressions', 'imps', 'delivery', 'volume'],
      acceptable: ['units', 'quantity', 'reach', 'views']
    },
    'po_number': {
      primary: ['order number', 'po number', 'purchase order'],
      good: ['order', 'po', 'purchase', 'order #', 'po #', 'reference'],
      acceptable: ['id', 'number', 'code', 'ref', 'external']
    },
    'frequency_cap': {
      primary: ['frequency caps', 'frequency cap', 'frequency limit'],
      good: ['frequency', 'cap', 'limit', 'per day', 'daily', 'weekly'],
      acceptable: ['impression', 'delivery', 'control', 'pacing']
    },
    'currency': {
      primary: ['currency', 'usd', '$', 'dollar'],
      good: ['budget', 'spend', 'cost', 'total', 'amount'],
      acceptable: ['price', 'payment', 'billing', 'financial']
    },
    'start_date': {
      primary: ['start date', 'campaign start', 'flight start', 'begin date'],
      good: ['start', 'begin', 'from', 'launch', 'kickoff', 'campaign dates'],
      acceptable: ['date', 'period', 'schedule', 'timing']
    },
    'end_date': {
      primary: ['end date', 'campaign end', 'flight end', 'completion date'],
      good: ['end', 'finish', 'to', 'close', 'wrap', 'campaign dates'],
      acceptable: ['date', 'period', 'schedule', 'timing']
    },
    'period_start': {
      primary: ['period start', 'period labels', 'campaign period', 'inferred', 'implied'],
      good: ['period', 'start', 'begin', 'flight', 'duration', 'timeline'],
      acceptable: ['schedule', 'timing', 'calendar', 'range']
    },
    'period_end': {
      primary: ['period end', 'period labels', 'campaign period', 'inferred', 'implied'],
      good: ['period', 'end', 'finish', 'flight', 'duration', 'timeline'],
      acceptable: ['schedule', 'timing', 'calendar', 'range']
    },
    'account_executive_name': {
      primary: ['account executive', 'ae name', 'account manager'],
      good: ['account exec', 'ae', 'executive', 'manager', 'contact', 'representative'],
      acceptable: ['sales', 'rep', 'owner', 'lead', 'coordinator']
    }
  };

  const fieldData = fieldKeywords[field];
  if (!fieldData) {
    return {
      name: 'span_quality',
      score: 0.6,
      notes: 'Unknown field for span quality check'
    };
  }

  // Check primary keywords (highest score)
  if (containsAnyKeyword(locationLower, fieldData.primary)) {
    const matchedKeyword = fieldData.primary.find(keyword => locationLower.includes(keyword.toLowerCase()));
    return {
      name: 'span_quality',
      score: 1.0,
      notes: `Found in primary expected location: "${matchedKeyword}"`
    };
  }

  // Check good keywords (high score)
  if (containsAnyKeyword(locationLower, fieldData.good)) {
    const matchedKeyword = fieldData.good.find(keyword => locationLower.includes(keyword.toLowerCase()));
    return {
      name: 'span_quality',
      score: 0.9,
      notes: `Found in good location: "${matchedKeyword}"`
    };
  }

  // Check acceptable keywords (medium score)
  if (containsAnyKeyword(locationLower, fieldData.acceptable)) {
    const matchedKeyword = fieldData.acceptable.find(keyword => locationLower.includes(keyword.toLowerCase()));
    return {
      name: 'span_quality',
      score: 0.7,
      notes: `Found in acceptable location: "${matchedKeyword}"`
    };
  }

  // Special handling for common document sections that might be valid
  const commonSections = ['header', 'footer', 'summary', 'details', 'information', 'data', 'table', 'section'];
  if (containsAnyKeyword(locationLower, commonSections)) {
    const matchedSection = commonSections.find(section => locationLower.includes(section));
    return {
      name: 'span_quality',
      score: 0.6,
      notes: `Found in document section: "${matchedSection}" - may be valid`
    };
  }

  return {
    name: 'span_quality',
    score: 0.5,
    notes: `Location "${location}" not in expected areas - manual review recommended`
  };
}

// R7. Stability - Check consistency across multiple extraction runs
function validateStability(values: any[], fieldType: 'string' | 'number' | 'other' = 'other'): ConfidenceComponent {
  // If we don't have exactly 3 runs, but we have at least 1 value, give partial credit
  if (values.length === 0) {
    return {
      name: 'stability',
      score: 0.7,
      notes: 'No data available for stability check'
    };
  }
  
  if (values.length === 1) {
    return {
      name: 'stability',
      score: 0.8,
      notes: 'Single run - no stability comparison available'
    };
  }

  if (values.length === 2) {
    const similarity = fieldType === 'string' && typeof values[0] === 'string' && typeof values[1] === 'string' 
      ? calculateStringSimilarity(values[0], values[1])
      : values[0] === values[1] ? 1.0 : 0.0;
    
    const score = similarity >= 0.9 ? 0.9 : similarity >= 0.7 ? 0.7 : 0.6;
    return {
      name: 'stability',
      score,
      notes: `Two runs - ${similarity >= 0.9 ? 'very similar' : similarity >= 0.7 ? 'similar' : 'different'} values (${(similarity * 100).toFixed(0)}% similarity)`
    };
  }

  if (values.length !== 3) {
    return {
      name: 'stability',
      score: 0.7,
      notes: `${values.length} runs provided (expected 3 for full stability analysis)`
    };
  }

  // For 3 runs, check similarity
  if (fieldType === 'string') {
    const stringValues = values.filter(v => typeof v === 'string');
    if (stringValues.length === values.length) {
      // Calculate pairwise similarities
      const sim12 = calculateStringSimilarity(stringValues[0]!, stringValues[1]!);
      const sim13 = calculateStringSimilarity(stringValues[0]!, stringValues[2]!);
      const sim23 = calculateStringSimilarity(stringValues[1]!, stringValues[2]!);
      
      const avgSimilarity = (sim12 + sim13 + sim23) / 3;
      
      let score: number;
      let notes: string;
      
      if (avgSimilarity >= 0.95) {
        score = 1.0;
        notes = `Highly consistent across 3 runs (${(avgSimilarity * 100).toFixed(0)}% avg similarity)`;
      } else if (avgSimilarity >= 0.85) {
        score = 0.9;
        notes = `Very similar across 3 runs (${(avgSimilarity * 100).toFixed(0)}% avg similarity)`;
      } else if (avgSimilarity >= 0.7) {
        score = 0.7;
        notes = `Moderately similar across 3 runs (${(avgSimilarity * 100).toFixed(0)}% avg similarity)`;
      } else {
        score = 0.4;
        notes = `Low similarity across 3 runs (${(avgSimilarity * 100).toFixed(0)}% avg similarity)`;
      }
      
      return { name: 'stability', score, notes };
    }
  }

  // Fallback to exact matching for non-strings or mixed types
  const uniqueValues = new Set(values.map(v => JSON.stringify(v)));
  const uniqueCount = uniqueValues.size;

  let score: number;
  let notes: string;

  switch (uniqueCount) {
    case 1:
      score = 1.0;
      notes = 'Consistent across all 3 runs';
      break;
    case 2:
      score = 0.7;
      notes = 'Two different values across 3 runs';
      break;
    case 3:
      score = 0.4;
      notes = 'Three different values across 3 runs';
      break;
    default:
      score = 0.4;
      notes = 'High variance across runs';
  }

  return {
    name: 'stability',
    score,
    notes
  };
}

// Flight-specific validation functions
function validateFlightDates(flight: FlightItem): ConfidenceComponent {
  const start = parseDate(flight.start);
  const end = parseDate(flight.end);
  
  if (!start || !end) {
    return {
      name: 'flight_dates',
      score: 0.0,
      notes: 'Invalid or missing flight dates'
    };
  }
  
  if (start > end) {
    return {
      name: 'flight_dates',
      score: 0.2,
      notes: 'Start date is after end date'
    };
  }
  
  return {
    name: 'flight_dates',
    score: 1.0,
    notes: 'Valid flight date range'
  };
}

function validateFlightCpm(flight: FlightItem): ConfidenceComponent {
  const cpm = parseNumeric(flight.rate_cpm);
  
  if (cpm === null) {
    return {
      name: 'flight_cpm',
      score: 0.7,
      notes: 'No CPM specified (may be added value)'
    };
  }
  
  if (cpm < 0) {
    return {
      name: 'flight_cpm',
      score: 0.0,
      notes: 'Negative CPM is invalid'
    };
  }
  
  if (cpm === 0) {
    return {
      name: 'flight_cpm',
      score: 0.8,
      notes: 'Zero CPM (likely added value flight)'
    };
  }
  
  if (cpm > 0 && cpm < 100) {
    return {
      name: 'flight_cpm',
      score: 1.0,
      notes: 'Valid CPM range'
    };
  }
  
  return {
    name: 'flight_cpm',
    score: 0.6,
    notes: 'Unusually high CPM - verify'
  };
}

function validateFlightUnits(flight: FlightItem): ConfidenceComponent {
  const units = parseNumeric(flight.units);
  
  if (units === null || units === undefined) {
    return {
      name: 'flight_units',
      score: 0.0,
      notes: 'Missing units/impressions'
    };
  }
  
  if (units < 0) {
    return {
      name: 'flight_units',
      score: 0.0,
      notes: 'Negative units are invalid'
    };
  }
  
  if (units === 0) {
    return {
      name: 'flight_units',
      score: 0.3,
      notes: 'Zero units - unusual'
    };
  }
  
  if (units < 1000) {
    return {
      name: 'flight_units',
      score: 0.5,
      notes: 'Very low impression count - verify'
    };
  }
  
  return {
    name: 'flight_units',
    score: 1.0,
    notes: 'Valid impression count'
  };
}

function validateFlightCost(flight: FlightItem): ConfidenceComponent {
  const cost = parseNumeric(flight.cost);
  const units = parseNumeric(flight.units);
  const cpm = parseNumeric(flight.rate_cpm);
  
  if (cost === null || cost === undefined) {
    return {
      name: 'flight_cost',
      score: 0.0,
      notes: 'Missing cost'
    };
  }
  
  if (cost < 0) {
    return {
      name: 'flight_cost',
      score: 0.0,
      notes: 'Negative cost is invalid'
    };
  }
  
  if (cost === 0) {
    return {
      name: 'flight_cost',
      score: cpm === 0 ? 0.8 : 0.3,
      notes: cpm === 0 ? 'Zero cost for added value flight' : 'Zero cost with non-zero CPM - verify'
    };
  }
  
  // Check cost consistency with CPM and units
  if (cpm && cpm > 0 && units && units > 0) {
    const expectedCost = (cpm * units) / 1000;
    const costDiff = Math.abs(cost - expectedCost) / expectedCost;
    
    if (costDiff < 0.001) { // Less than 0.1% difference - essentially perfect
      return {
        name: 'flight_cost',
        score: 1.0,
        notes: 'Cost matches CPM calculation perfectly'
      };
    } else {
      // ANY deviation from perfect calculation = REJECT (parsing error)
      return {
        name: 'flight_cost',
        score: 0.0,
        notes: `PARSING ERROR: Cost calculation mismatch by ${(costDiff * 100).toFixed(2)}% - Expected: ${expectedCost.toFixed(2)}, Actual: ${cost}. This indicates incorrect parsing.`
      };
    }
  }
  
  return {
    name: 'flight_cost',
    score: 0.8,
    notes: 'Valid cost (unable to verify against CPM)'
  };
}

// Validate that a flight's dates are within the campaign period
function validateFlightWithinCampaignPeriod(
  flight: FlightItem, 
  campaignStart: string, 
  campaignEnd: string
): ConfidenceComponent {
  const flightStart = parseDate(flight.start);
  const flightEnd = parseDate(flight.end);
  const campaignStartDate = parseDate(campaignStart);
  const campaignEndDate = parseDate(campaignEnd);

  if (!flightStart || !flightEnd) {
    return {
      name: 'flight_within_campaign',
      score: 0.3,
      notes: 'Invalid flight dates - cannot validate against campaign period'
    };
  }

  if (!campaignStartDate || !campaignEndDate) {
    return {
      name: 'flight_within_campaign',
      score: 0.7,
      notes: 'Invalid campaign dates - cannot validate flight period'
    };
  }

  // Check if flight is completely within campaign period
  if (flightStart >= campaignStartDate && flightEnd <= campaignEndDate) {
    return {
      name: 'flight_within_campaign',
      score: 1.0,
      notes: `Flight (${flight.start} to ${flight.end}) is within campaign period (${campaignStart} to ${campaignEnd})`
    };
  }

  // Flight is outside campaign period - AUTO REJECT
  let issue = '';
  if (flightStart < campaignStartDate) {
    issue += `Flight starts before campaign (${flight.start} < ${campaignStart})`;
  }
  if (flightEnd > campaignEndDate) {
    if (issue) issue += '; ';
    issue += `Flight ends after campaign (${flight.end} > ${campaignEnd})`;
  }

  return {
    name: 'flight_within_campaign',
    score: 0.0, // AUTO REJECT - flight outside campaign period
    notes: `REJECT: Flight outside campaign period - ${issue}`
  };
}

// Individual flight validation with STRICT cost validation and campaign period check
function validateIndividualFlight(flight: FlightItem, campaignStart?: string | null, campaignEnd?: string | null): FieldConfidence {
  const components: ConfidenceComponent[] = [
    validateFlightDates(flight),
    validateFlightCpm(flight),
    validateFlightUnits(flight),
    validateFlightCost(flight)
  ];

  // Add campaign period validation if campaign dates are available
  if (campaignStart && campaignEnd) {
    components.push(validateFlightWithinCampaignPeriod(flight, campaignStart, campaignEnd));
  }
  
  // Check if cost calculation failed - if so, REJECT the entire flight
  const costComponent = components.find(c => c.name === 'flight_cost');
  if (costComponent && costComponent.score === 0.0) {
    // Cost calculation failed - REJECT entire flight
    return {
      field: `flight_${flight.index || 'unknown'}`,
      confidence_score: 0.0,
      status: 'reject',
      components,
      values_across_runs: [] // Individual flights don't have multi-run data
    };
  }

  // Check if flight is outside campaign period - if so, REJECT the entire flight
  const periodComponent = components.find(c => c.name === 'flight_within_campaign');
  if (periodComponent && periodComponent.score === 0.0) {
    // Flight outside campaign period - REJECT entire flight
    return {
      field: `flight_${flight.index || 'unknown'}`,
      confidence_score: 0.0,
      status: 'reject',
      components,
      values_across_runs: [] // Individual flights don't have multi-run data
    };
  }
  
  const totalScore = components.reduce((sum, comp) => sum + comp.score, 0);
  const confidence_score = totalScore / components.length;
  
  let status: 'use' | 'review' | 'reject';
  if (confidence_score >= 0.80) { // Changed from 0.85 to 0.80
    status = 'use';
  } else if (confidence_score >= 0.55) {
    status = 'review';
  } else {
    status = 'reject';
  }
  
  return {
    field: `flight_${flight.index || 'unknown'}`,
    confidence_score,
    status,
    components,
    values_across_runs: [] // Individual flights don't have multi-run data
  };
}

// New validation: Total impressions must equal sum of flight units (ZERO TOLERANCE)
function validateTotalImpressionsMatchFlights(
  totalImpressions: number | null,
  flights: FlightItem[]
): ConfidenceComponent {
  const parsedTotalImpressions = parseNumeric(totalImpressions);
  
  if (parsedTotalImpressions === null) {
    return {
      name: 'total_impressions_match',
      score: 0.7,
      notes: 'No total impressions to validate against'
    };
  }
  
  if (flights.length === 0) {
    return {
      name: 'total_impressions_match',
      score: 0.5,
      notes: 'No flights to compare against total impressions'
    };
  }
  
  const sumFlightUnits = flights.reduce((sum, flight) => sum + (parseNumeric(flight.units) || 0), 0);
  
  if (sumFlightUnits === 0) {
    return {
      name: 'total_impressions_match',
      score: 0.3,
      notes: 'Flight units sum to zero'
    };
  }
  
  const difference = Math.abs(parsedTotalImpressions - sumFlightUnits);
  
  // ZERO TOLERANCE - must match exactly or it's a parsing error
  if (difference === 0) {
    return {
      name: 'total_impressions_match',
      score: 1.0,
      notes: 'Perfect match: Total impressions equals sum of flight units'
    };
  } else {
    // ANY mismatch = parsing error = REJECT
    const percentDiff = (difference / parsedTotalImpressions) * 100;
    return {
      name: 'total_impressions_match',
      score: 0.0,
      notes: `PARSING ERROR: Total impressions mismatch - Total=${parsedTotalImpressions.toLocaleString()}, Flight Sum=${sumFlightUnits.toLocaleString()}, Diff=${difference.toLocaleString()} (${percentDiff.toFixed(1)}%). This indicates incorrect parsing.`
    };
  }
}

// R8. Numeric Triangle - Budget/CPM/Impressions consistency
function validateNumericTriangle(
  budget: number | null,
  cpm: number | null,
  impressions: number | null
): ConfidenceComponent {
  const parsedBudget = parseNumeric(budget);
  const parsedCpm = parseNumeric(cpm);
  const parsedImpressions = parseNumeric(impressions);

  if (parsedBudget === null || parsedCpm === null || parsedImpressions === null) {
    return {
      name: 'numeric_triangle',
      score: 0.7,
      notes: 'Missing values for triangle validation'
    };
  }

  const impliedImpressions = parsedBudget / (parsedCpm / 1000);
  const diff = Math.abs(parsedImpressions - impliedImpressions) / impliedImpressions;

  let score: number;
  let notes: string;

  if (diff < 0.05) {
    score = 1.0;
    notes = `Excellent match (${(diff * 100).toFixed(1)}% difference)`;
  } else if (diff < 0.15) {
    score = 0.8;
    notes = `Good match (${(diff * 100).toFixed(1)}% difference)`;
  } else if (diff < 0.30) {
    score = 0.5;
    notes = `Fair match (${(diff * 100).toFixed(1)}% difference)`;
  } else {
    score = 0.2;
    notes = `Poor match (${(diff * 100).toFixed(1)}% difference)`;
  }

  return {
    name: 'numeric_triangle',
    score,
    notes
  };
}

// R9. Flights Within Campaign Period
function validateFlightsWithinCampaign(
  flights: FlightItem[],
  campaignStart: string | null,
  campaignEnd: string | null
): ConfidenceComponent {
  if (flights.length === 0) {
    return {
      name: 'flights_within_campaign',
      score: 0.7,
      notes: 'No flights to validate'
    };
  }

  const campaignStartDate = parseDate(campaignStart);
  const campaignEndDate = parseDate(campaignEnd);

  if (!campaignStartDate || !campaignEndDate) {
    return {
      name: 'flights_within_campaign',
      score: 0.7,
      notes: 'Invalid campaign dates'
    };
  }

  let validCount = 0;
  for (const flight of flights) {
    const flightStart = parseDate(flight.start);
    const flightEnd = parseDate(flight.end);

    if (flightStart && flightEnd &&
        campaignStartDate <= flightStart &&
        flightStart < flightEnd &&
        flightEnd <= campaignEndDate) {
      validCount++;
    }
  }

  const score = validCount / flights.length;
  return {
    name: 'flights_within_campaign',
    score,
    notes: `${validCount}/${flights.length} flights within campaign period`
  };
}

// R10. Totals Match Sums (ZERO TOLERANCE)
function validateTotalsMatchSums(
  flights: FlightItem[],
  totalBudget: number | null,
  totalImpressions: number | null
): ConfidenceComponent {
  const parsedTotalBudget = parseNumeric(totalBudget);
  const parsedTotalImpressions = parseNumeric(totalImpressions);

  const sumBudget = flights.reduce((sum, flight) => sum + (parseNumeric(flight.cost) || 0), 0);
  const sumImpressions = flights.reduce((sum, flight) => sum + (parseNumeric(flight.units) || 0), 0);

  let budgetScore = 0.7; // Default for missing total
  let impressionsScore = 0.7; // Default for missing total
  let budgetNotes = '';
  let impressionsNotes = '';

  if (parsedTotalBudget !== null) {
    const budgetDiff = Math.abs(sumBudget - parsedTotalBudget);
    if (budgetDiff < 0.01) { // Less than 1 cent difference
      budgetScore = 1.0;
      budgetNotes = 'Budget: Perfect match';
    } else {
      // ANY budget mismatch = parsing error
      budgetScore = 0.0;
      const percentDiff = (budgetDiff / parsedTotalBudget) * 100;
      budgetNotes = `Budget PARSING ERROR: Sum=${sumBudget.toLocaleString()}, Total=${parsedTotalBudget.toLocaleString()}, Diff=${budgetDiff.toLocaleString()} (${percentDiff.toFixed(2)}%)`;
    }
  } else {
    budgetNotes = 'Budget: No total to validate against';
  }

  if (parsedTotalImpressions !== null) {
    const impressionsDiff = Math.abs(sumImpressions - parsedTotalImpressions);
    if (impressionsDiff === 0) { // Must be exact match
      impressionsScore = 1.0;
      impressionsNotes = 'Impressions: Perfect match';
    } else {
      // ANY impressions mismatch = parsing error
      impressionsScore = 0.0;
      const percentDiff = (impressionsDiff / parsedTotalImpressions) * 100;
      impressionsNotes = `Impressions PARSING ERROR: Sum=${sumImpressions.toLocaleString()}, Total=${parsedTotalImpressions.toLocaleString()}, Diff=${impressionsDiff.toLocaleString()} (${percentDiff.toFixed(1)}%)`;
    }
  } else {
    impressionsNotes = 'Impressions: No total to validate against';
  }

  const finalScore = (budgetScore + impressionsScore) / 2;
  const combinedNotes = [budgetNotes, impressionsNotes].filter(note => note).join('; ');

  return {
    name: 'totals_match_sums',
    score: finalScore,
    notes: combinedNotes || 'Unable to validate totals - missing declared totals'
  };
}

// R11. Identity Guard - Prevent misassignment of organization fields
function validateIdentityGuard(
  advertiserName: string | null,
  agencyName: string | null,
  supplierName: string | null,
  advertiserLocation: string | null,
  agencyLocation: string | null,
  supplierLocation: string | null
): { advertiser: number; agency: number; supplier: number } {
  const multipliers = { advertiser: 1.0, agency: 1.0, supplier: 1.0 };

  // Check for identical names
  const names = [
    { name: advertiserName, field: 'advertiser' },
    { name: agencyName, field: 'agency' },
    { name: supplierName, field: 'supplier' }
  ].filter(item => item.name !== null);

  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (names[i]!.name === names[j]!.name) {
        multipliers[names[i]!.field as keyof typeof multipliers] = 0.4;
        multipliers[names[j]!.field as keyof typeof multipliers] = 0.4;
      }
    }
  }

  // Check for wrong location extraction
  const locationChecks = [
    { location: advertiserLocation, field: 'advertiser', wrongPhrases: ['order total', 'supplier', 'traffic'] },
    { location: agencyLocation, field: 'agency', wrongPhrases: ['order total', 'supplier', 'traffic'] },
    { location: supplierLocation, field: 'supplier', wrongPhrases: ['advertiser', 'brand', 'client'] }
  ];

  for (const check of locationChecks) {
    if (check.location) {
      const locationLower = check.location.toLowerCase();
      for (const wrongPhrase of check.wrongPhrases) {
        if (locationLower.includes(wrongPhrase)) {
          multipliers[check.field as keyof typeof multipliers] *= 0.5;
          break;
        }
      }
    }
  }

  return multipliers;
}

// R12. Confidence Aggregation with LLM Confidence Merge
function aggregateConfidence(
  field: string, 
  components: ConfidenceComponent[], 
  multiRunValues?: any[],
  llmConfidence?: { find_confidence: number; value_confidence: number }
): FieldConfidence {
  const totalScore = components.reduce((sum, comp) => sum + comp.score, 0);
  const validationScore = totalScore / components.length;

  // Merge LLM confidence with validation confidence
  let finalConfidenceScore: number;
  let confidenceMergeNotes: string;

  if (llmConfidence) {
    // Calculate average LLM confidence (find + value) and convert to 0-1 scale
    const llmScore = (llmConfidence.find_confidence + llmConfidence.value_confidence) / 200; // Convert from 0-100 to 0-1
    
    // Weighted combination: 60% validation + 40% LLM confidence
    finalConfidenceScore = (validationScore * 0.6) + (llmScore * 0.4);
    confidenceMergeNotes = `Merged: validation=${(validationScore * 100).toFixed(1)}%, LLM=${(llmScore * 100).toFixed(1)}% (find:${llmConfidence.find_confidence}, value:${llmConfidence.value_confidence})`;
  } else {
    // No LLM confidence available, use validation only
    finalConfidenceScore = validationScore;
    confidenceMergeNotes = `Validation only: ${(validationScore * 100).toFixed(1)}% (no LLM confidence available)`;
  }

  // Add confidence merge component to the components array
  const mergedComponents = [
    ...components,
    {
      name: 'confidence_merge',
      score: finalConfidenceScore,
      notes: confidenceMergeNotes
    }
  ];

  let status: 'use' | 'review' | 'reject';
  if (finalConfidenceScore >= 0.80) {
    status = 'use';
  } else if (finalConfidenceScore >= 0.55) {
    status = 'review';
  } else {
    status = 'reject';
  }

  return {
    field,
    confidence_score: finalConfidenceScore,
    status,
    components: mergedComponents,
    values_across_runs: multiRunValues || []
  };
}

// Helper function to extract LLM confidence from provenance
function getLLMConfidence(data: IOData, fieldName: string): { find_confidence: number; value_confidence: number } | undefined {
  const provenance = data.provenance?.find(p => p.field === fieldName);
  if (provenance && provenance.find_confidence !== undefined && provenance.value_confidence !== undefined) {
    return {
      find_confidence: provenance.find_confidence,
      value_confidence: provenance.value_confidence
    };
  }
  return undefined;
}

// Calculate average CPM from flights
function calculateAverageCpm(flights: FlightItem[]): number | null {
  const validFlights = flights.filter(f => f.rate_cpm && f.rate_cpm > 0);
  if (validFlights.length === 0) return null;
  
  const totalCpm = validFlights.reduce((sum, f) => sum + (f.rate_cpm || 0), 0);
  return totalCpm / validFlights.length;
}

// Main confidence calculation function
export function calculateConfidence(
  data: IOData,
  multiRunData?: IOData[], // For stability check (R7)
  cpm?: number // If not available in data
): ConfidenceReport {
  const fieldConfidences: FieldConfidence[] = [];

  // Get provenance locations for span quality checks
  const getLocation = (fieldName: string): string | null => {
    const provenance = data.provenance?.find(p => p.field === fieldName);
    if (provenance) return provenance.location_hint;
    
    // Enhanced fallback logic for fields that might not have direct provenance
    switch (fieldName) {
      case 'advertiser_name':
        return data.provenance?.find(p => p.field === 'advertiser_name')?.location_hint ||
               data.provenance?.find(p => p.field === 'brand_name')?.location_hint ||
               data.provenance?.find(p => p.field === 'client_name')?.location_hint ||
               data.provenance?.find(p => p.location_hint?.toLowerCase().includes('advertiser'))?.location_hint ||
               data.provenance?.find(p => p.location_hint?.toLowerCase().includes('brand'))?.location_hint ||
               data.provenance?.find(p => p.location_hint?.toLowerCase().includes('primary ad server'))?.location_hint ||
               'advertiser/brand section';
      case 'agency_name':
        return data.provenance?.find(p => p.field === 'agency_name')?.location_hint ||
               data.provenance?.find(p => p.field === 'agency')?.location_hint ||
               data.provenance?.find(p => p.location_hint?.toLowerCase().includes('agency'))?.location_hint ||
               data.provenance?.find(p => p.location_hint?.toLowerCase().includes('from'))?.location_hint ||
               'agency/from section';
      case 'total_campaign_spend':
        return data.provenance?.find(p => p.field === 'total_campaign_spend')?.location_hint ||
               data.provenance?.find(p => p.field === 'budget')?.location_hint ||
               data.provenance?.find(p => p.field === 'total_spend')?.location_hint ||
               data.provenance?.find(p => p.location_hint?.toLowerCase().includes('total'))?.location_hint ||
               data.provenance?.find(p => p.location_hint?.toLowerCase().includes('budget'))?.location_hint ||
               'budget/total section';
      case 'total_contracted_impressions':
        return data.provenance?.find(p => p.field === 'total_contracted_impressions')?.location_hint ||
               data.provenance?.find(p => p.field === 'impressions')?.location_hint ||
               data.provenance?.find(p => p.field === 'total_impressions')?.location_hint ||
               data.provenance?.find(p => p.location_hint?.toLowerCase().includes('impressions'))?.location_hint ||
               data.provenance?.find(p => p.location_hint?.toLowerCase().includes('total'))?.location_hint ||
               'impressions/total section';
      case 'po_number':
        return data.provenance?.find(p => p.field === 'po_number')?.location_hint ||
               data.provenance?.find(p => p.field === 'order_number')?.location_hint ||
               data.provenance?.find(p => p.location_hint?.toLowerCase().includes('po'))?.location_hint ||
               data.provenance?.find(p => p.location_hint?.toLowerCase().includes('order'))?.location_hint ||
               'order/po section';
      case 'frequency_cap':
        return data.provenance?.find(p => p.field === 'frequency_cap')?.location_hint ||
               data.provenance?.find(p => p.field === 'frequency')?.location_hint ||
               data.provenance?.find(p => p.location_hint?.toLowerCase().includes('frequency'))?.location_hint ||
               data.provenance?.find(p => p.location_hint?.toLowerCase().includes('cap'))?.location_hint ||
               'frequency/targeting section';
      case 'currency':
        // Currency often comes with budget or spend fields
        return data.provenance?.find(p => p.field === 'currency')?.location_hint ||
               data.provenance?.find(p => p.field === 'total_campaign_spend')?.location_hint || 
               data.provenance?.find(p => p.location_hint?.toLowerCase().includes('currency'))?.location_hint ||
               'derived from spend field';
      case 'start_date':
        // Look for campaign_total_flight.start specifically
        return data.provenance?.find(p => p.field === 'campaign_total_flight.start')?.location_hint ||
               data.provenance?.find(p => p.field === 'start_date')?.location_hint ||
               data.provenance?.find(p => p.field === 'start')?.location_hint ||
               data.provenance?.find(p => p.location_hint?.toLowerCase().includes('start'))?.location_hint ||
               data.provenance?.find(p => p.field.includes('flight') || p.field.includes('period'))?.location_hint ||
               'campaign dates section';
      case 'end_date':
        // Look for campaign_total_flight.end specifically  
        return data.provenance?.find(p => p.field === 'campaign_total_flight.end')?.location_hint ||
               data.provenance?.find(p => p.field === 'end_date')?.location_hint ||
               data.provenance?.find(p => p.field === 'end')?.location_hint ||
               data.provenance?.find(p => p.location_hint?.toLowerCase().includes('end'))?.location_hint ||
               data.provenance?.find(p => p.field.includes('flight') || p.field.includes('period'))?.location_hint ||
               'campaign dates section';
      case 'period_start':
        // Look for period.start specifically
        return data.provenance?.find(p => p.field === 'period.start')?.location_hint ||
               data.provenance?.find(p => p.field === 'period_start')?.location_hint ||
               data.provenance?.find(p => p.field === 'period')?.location_hint ||
               data.provenance?.find(p => p.location_hint?.toLowerCase().includes('period'))?.location_hint ||
               'inferred from flight dates';
      case 'period_end':
        // Look for period.end specifically
        return data.provenance?.find(p => p.field === 'period.end')?.location_hint ||
               data.provenance?.find(p => p.field === 'period_end')?.location_hint ||
               data.provenance?.find(p => p.field === 'period')?.location_hint ||
               data.provenance?.find(p => p.location_hint?.toLowerCase().includes('period'))?.location_hint ||
               'inferred from flight dates';
      case 'account_executive_name':
        return data.provenance?.find(p => p.field === 'account_executive_name')?.location_hint ||
               data.provenance?.find(p => p.field === 'account_executive')?.location_hint ||
               data.provenance?.find(p => p.field === 'ae_name')?.location_hint ||
               data.provenance?.find(p => p.location_hint?.toLowerCase().includes('account executive'))?.location_hint ||
               data.provenance?.find(p => p.location_hint?.toLowerCase().includes('ae'))?.location_hint ||
               'account executive section';
      default:
        // Generic fallback - try to find any provenance with similar field name
        return data.provenance?.find(p => p.field.toLowerCase().includes(fieldName.toLowerCase()))?.location_hint ||
               data.provenance?.find(p => fieldName.toLowerCase().includes(p.field.toLowerCase()))?.location_hint ||
               'document content';
    }
  };

  // Get stability values for a field across multiple runs
  const getStabilityValues = (fieldName: string): any[] => {
    if (!multiRunData || multiRunData.length === 0) return [];
    return multiRunData.map(run => {
      switch (fieldName) {
        case 'advertiser_name': return run.advertiser_name;
        case 'agency_name': return run.agency_name;
        case 'total_campaign_spend': return run.total_campaign_spend;
        case 'total_contracted_impressions': return run.total_contracted_impressions;
        case 'po_number': return run.po_number;
        case 'frequency_cap': return run.frequency_cap;
        case 'account_executive_name': return run.account_executive_name;
        case 'currency': return run.currency;
        case 'start_date': return run.start || run.campaign_total_flight?.start;
        case 'end_date': return run.end || run.campaign_total_flight?.end;
        case 'period_start': return run.period?.start;
        case 'period_end': return run.period?.end;
        default: return null;
      }
    });
  };

  // If no CPM provided, try to calculate from flights
  const effectiveCpm = cpm || calculateAverageCpm(data.flights || []);

  // Calculate confidence for each field

  // Advertiser Name
  const advertiserValues = getStabilityValues('advertiser_name');
  const advertiserComponents: ConfidenceComponent[] = [
    validateSpanQuality('advertiser_name', getLocation('advertiser_name')),
    validateStability(advertiserValues, 'string')
  ];
  fieldConfidences.push(aggregateConfidence('advertiser_name', advertiserComponents, advertiserValues, getLLMConfidence(data, 'advertiser_name')));

  // Agency Name
  const agencyValues = getStabilityValues('agency_name');
  const agencyComponents: ConfidenceComponent[] = [
    validateSpanQuality('agency_name', getLocation('agency_name')),
    validateStability(agencyValues, 'string')
  ];
  fieldConfidences.push(aggregateConfidence('agency_name', agencyComponents, agencyValues, getLLMConfidence(data, 'agency_name')));

  // Total Campaign Spend
  const budgetValues = getStabilityValues('total_campaign_spend');
  const budgetComponents: ConfidenceComponent[] = [
    validateBudgetFormat(data.total_campaign_spend),
    validateSpanQuality('total_campaign_spend', getLocation('total_campaign_spend')),
    validateStability(budgetValues)
  ];
  
  // Add cross-field validations if we have the required data
  if (cpm && data.total_contracted_impressions) {
    budgetComponents.push(validateNumericTriangle(data.total_campaign_spend, cpm, data.total_contracted_impressions));
  }
  
  if (data.flights.length > 0) {
    budgetComponents.push(validateTotalsMatchSums(data.flights, data.total_campaign_spend, data.total_contracted_impressions));
  }

  fieldConfidences.push(aggregateConfidence('total_campaign_spend', budgetComponents, budgetValues, getLLMConfidence(data, 'total_campaign_spend')));

  // Total Contracted Impressions
  const impressionsValues = getStabilityValues('total_contracted_impressions');
  const impressionsComponents: ConfidenceComponent[] = [
    validateImpressionsFormat(data.total_contracted_impressions),
    validateSpanQuality('total_contracted_impressions', getLocation('total_contracted_impressions')),
    validateStability(impressionsValues, 'number'),
    validateTotalImpressionsMatchFlights(data.total_contracted_impressions, data.flights) // New validation
  ];

  if (effectiveCpm && data.total_campaign_spend) {
    impressionsComponents.push(validateNumericTriangle(data.total_campaign_spend, effectiveCpm, data.total_contracted_impressions));
  }

  fieldConfidences.push(aggregateConfidence('total_contracted_impressions', impressionsComponents, impressionsValues, getLLMConfidence(data, 'total_contracted_impressions')));

  // PO Number
  const poValues = getStabilityValues('po_number');
  const poComponents: ConfidenceComponent[] = [
    validateSpanQuality('po_number', getLocation('po_number')),
    validateStability(poValues, 'string')
  ];
  fieldConfidences.push(aggregateConfidence('po_number', poComponents, poValues, getLLMConfidence(data, 'po_number')));

  // Frequency Cap
  const frequencyValues = getStabilityValues('frequency_cap');
  const frequencyComponents: ConfidenceComponent[] = [
    validateSpanQuality('frequency_cap', getLocation('frequency_cap')),
    validateStability(frequencyValues, 'number')
  ];
  fieldConfidences.push(aggregateConfidence('frequency_cap', frequencyComponents, frequencyValues, getLLMConfidence(data, 'frequency_cap')));

  // Individual flights - validate each flight line item against campaign period
  if (data.flights.length > 0) {
    // Get campaign period for validation
    const campaignStart = data.start || data.campaign_total_flight?.start || null;
    const campaignEnd = data.end || data.campaign_total_flight?.end || null;
    
    data.flights.forEach((flight, index) => {
      flight.index = index + 1; // Add index for identification
      const flightConfidence = validateIndividualFlight(flight, campaignStart, campaignEnd);
      fieldConfidences.push(flightConfidence);
    });
  }

  // Account Executive Name - always include in confidence analysis
  const aeValues = getStabilityValues('account_executive_name');
  if (data.account_executive_name && data.account_executive_name.trim() !== '') {
    // Has value - normal validation
    const aeComponents: ConfidenceComponent[] = [
      validateSpanQuality('account_executive_name', getLocation('account_executive_name')),
      validateStability(aeValues, 'string')
    ];
    fieldConfidences.push(aggregateConfidence('account_executive_name', aeComponents, aeValues, getLLMConfidence(data, 'account_executive_name')));
  } else {
    // Null/empty value - AUTO REJECT
    const aeComponents: ConfidenceComponent[] = [
      {
        name: 'account_executive_missing',
        score: 0.0,
        notes: 'Account Executive Name is null or empty - REQUIRED FIELD'
      }
    ];
    fieldConfidences.push(aggregateConfidence('account_executive_name', aeComponents, aeValues, getLLMConfidence(data, 'account_executive_name')));
  }

  // Currency
  if (data.currency) {
    const currencyValues = getStabilityValues('currency');
    const currencyComponents: ConfidenceComponent[] = [
      validateSpanQuality('currency', getLocation('currency')),
      validateStability(currencyValues, 'string')
    ];
    fieldConfidences.push(aggregateConfidence('currency', currencyComponents, currencyValues, getLLMConfidence(data, 'currency')));
  }

  // Start Date
  if (data.start || data.campaign_total_flight?.start) {
    const startDateValues = getStabilityValues('start_date');
    const startDateComponents: ConfidenceComponent[] = [
      validateSpanQuality('start_date', getLocation('start_date')),
      validateStability(startDateValues, 'string')
    ];
    fieldConfidences.push(aggregateConfidence('start_date', startDateComponents, startDateValues, getLLMConfidence(data, 'start_date')));
  }

  // End Date
  if (data.end || data.campaign_total_flight?.end) {
    const endDateValues = getStabilityValues('end_date');
    const endDateComponents: ConfidenceComponent[] = [
      validateSpanQuality('end_date', getLocation('end_date')),
      validateStability(endDateValues, 'string')
    ];
    fieldConfidences.push(aggregateConfidence('end_date', endDateComponents, endDateValues, getLLMConfidence(data, 'end_date')));
  }

  // Period Start
  if (data.period?.start) {
    const periodStartValues = getStabilityValues('period_start');
    const periodStartComponents: ConfidenceComponent[] = [
      validateSpanQuality('period_start', getLocation('period_start')),
      validateStability(periodStartValues, 'string')
    ];
    fieldConfidences.push(aggregateConfidence('period_start', periodStartComponents, periodStartValues, getLLMConfidence(data, 'period_start')));
  }

  // Period End
  if (data.period?.end) {
    const periodEndValues = getStabilityValues('period_end');
    const periodEndComponents: ConfidenceComponent[] = [
      validateSpanQuality('period_end', getLocation('period_end')),
      validateStability(periodEndValues, 'string')
    ];
    fieldConfidences.push(aggregateConfidence('period_end', periodEndComponents, periodEndValues, getLLMConfidence(data, 'period_end')));
  }

  // Apply identity guard multipliers
  const identityMultipliers = validateIdentityGuard(
    data.advertiser_name,
    data.agency_name,
    null, // supplier_name not in current schema
    getLocation('advertiser_name'),
    getLocation('agency_name'),
    null
  );

  // Apply multipliers to cross-field components
  for (const fieldConf of fieldConfidences) {
    if (fieldConf.field === 'advertiser_name' && identityMultipliers.advertiser !== 1.0) {
      fieldConf.components = fieldConf.components.map(comp => ({
        ...comp,
        score: comp.name.includes('cross_field') ? comp.score * identityMultipliers.advertiser : comp.score,
        notes: comp.name.includes('cross_field') ? `${comp.notes} (identity guard applied)` : comp.notes
      }));
      // Recalculate confidence score
      const totalScore = fieldConf.components.reduce((sum, comp) => sum + comp.score, 0);
      fieldConf.confidence_score = totalScore / fieldConf.components.length;
    }
    
    if (fieldConf.field === 'agency_name' && identityMultipliers.agency !== 1.0) {
      fieldConf.components = fieldConf.components.map(comp => ({
        ...comp,
        score: comp.name.includes('cross_field') ? comp.score * identityMultipliers.agency : comp.score,
        notes: comp.name.includes('cross_field') ? `${comp.notes} (identity guard applied)` : comp.notes
      }));
      // Recalculate confidence score
      const totalScore = fieldConf.components.reduce((sum, comp) => sum + comp.score, 0);
      fieldConf.confidence_score = totalScore / fieldConf.components.length;
    }
  }

  // Calculate overall statistics
  const overallScore = fieldConfidences.reduce((sum, fc) => sum + fc.confidence_score, 0) / fieldConfidences.length;
  
  const summary = {
    use_count: fieldConfidences.filter(fc => fc.status === 'use').length,
    review_count: fieldConfidences.filter(fc => fc.status === 'review').length,
    reject_count: fieldConfidences.filter(fc => fc.status === 'reject').length
  };

  return {
    overall_score: overallScore,
    field_confidences: fieldConfidences,
    summary
  };
}
