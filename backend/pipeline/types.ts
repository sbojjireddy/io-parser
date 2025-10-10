export interface IOData {
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
  flights: FlightItem[];
  explanation: {
    summary: string;
    assumptions: string[];
    omissions: string[];
  };
  provenance: Array<{
    field: string;
    quote: string;
    location_hint: string;
    find_confidence: number;
    value_confidence: number;
    rationale: string;
  }>;
  confidence?: ConfidenceReport;
  // Add these properties for compatibility
  start?: string | null;
  end?: string | null;
}

export interface FlightItem {
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
  provenance: {
    quote: string;
    location_hint: string;
    find_confidence: number;
    value_confidence: number;
    rationale: string;
  };
  segment_days?: number;
  proration_factor?: number;
}

export interface ConfidenceComponent {
  name: string;
  score: number; // 0.0 to 1.0
  notes: string;
}

export interface FieldConfidence {
  field: string;
  confidence_score: number; // 0.0 to 1.0
  status: 'use' | 'review' | 'reject';
  components: ConfidenceComponent[];
  values_across_runs: any[];
}

export interface ConfidenceReport {
  overall_score: number; // 0.0 to 1.0
  field_confidences: FieldConfidence[];
  summary: {
    use_count: number;
    review_count: number;
    reject_count: number;
  };
}
