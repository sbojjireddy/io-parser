// Types for the IO Parser frontend

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
  provenance: ProvenanceItem[];
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
    find_confidence_interval: [number, number];
    value_confidence_interval: [number, number];
    rationale: string;
  };
  segment_days?: number;
  proration_factor?: number;
}

export interface ProvenanceItem {
  field: string;
  quote: string;
  location_hint: string;
  find_confidence_interval: [number, number];
  value_confidence_interval: [number, number];
  rationale: string;
}

export interface ConfidenceReport {
  overall_score: number;
  summary: {
    use_count: number;
    review_count: number;
    reject_count: number;
  };
  field_confidences: FieldConfidence[];
}

export interface FieldConfidence {
  field: string;
  confidence_score: number;
  status: 'use' | 'review' | 'reject';
  components: ConfidenceComponent[];
  values_across_runs?: any[];
}

export interface ConfidenceComponent {
  name: string;
  score: number;
  notes?: string;
}

export interface PipelineResult {
  success: boolean;
  sha256: string;
  filename: string;
  openaiFileId: string;
  pipeline: {
    stage1: {
      openai: { textLength: number };
      pymupdf: { 
        textLength: number;
        orderNumber?: string;
      };
    };
    stage4: {
      overallScore: number;
      useCount: number;
      reviewCount: number;
      rejectCount: number;
      advertiser: string;
      agency: string;
      flights: number;
    };
  };
  finalData: IOData;
}
