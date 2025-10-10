import fs from "node:fs/promises";
import { openai } from '../lib/openai.js';

const JSON_SCHEMA = {
  type: "object",
  required: [
    "advertiser_name",
    "agency_name", 
    "campaign_total_flight",
    "total_contracted_impressions",
    "total_campaign_spend",
    "currency",
    "po_number",
    "account_executive_name",
    "frequency_cap",
    "period",
    "flights",
    "explanation",
    "provenance"
  ],
  additionalProperties: false,
  properties: {
    advertiser_name: { 
      type: ["string", "null"],
      description: "The advertiser/client company name"
    },
    agency_name: { 
      type: ["string", "null"],
      description: "The agency company name handling this campaign"
    },
    campaign_total_flight: {
      type: ["object", "null"],
      required: ["start", "end"],
      additionalProperties: false,
      properties: {
        start: { 
          type: ["string", "null"],
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Campaign start date in YYYY-MM-DD format"
        },
        end: { 
          type: ["string", "null"],
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Campaign end date in YYYY-MM-DD format"
        }
      }
    },
    total_contracted_impressions: { 
      type: ["integer", "null"],
      minimum: 0,
      description: "Total number of contracted impressions"
    },
    total_campaign_spend: { 
      type: ["number", "null"],
      minimum: 0,
      description: "Total campaign spend amount"
    },
    currency: { 
      type: ["string", "null"],
      pattern: "^[A-Z]{3}$",
      description: "Currency code (e.g., USD)"
    },
    po_number: { 
      type: ["string", "null"],
      description: "Purchase order number or external PO number"
    },
    account_executive_name: { 
      type: ["string", "null"],
      description: "Tubi account executive name (must be from Tubi, not agency)"
    },
    frequency_cap: { 
      type: "integer",
      minimum: 1,
      default: 2,
      description: "Frequency cap for the campaign (defaults to 2 if not found)"
    },
    period: {
      type: ["object", "null"],
      required: ["start", "end"],
      additionalProperties: false,
      properties: {
        start: { 
          type: ["string", "null"],
          description: "Period start (e.g., 'Apr'25')"
        },
        end: { 
          type: ["string", "null"],
          description: "Period end (e.g., 'Jun'25')"
        }
      }
    },
    flights: {
      type: "array",
      minItems: 0,
      description: "Per-flight / per-line-item breakdown (e.g. from Flighting details or Buy Type tables).",
      items: {
        type: "object",
        required: ["index", "placement_id", "name", "start", "end", "units", "unit_type", "rate_cpm", "cost_method", "cost", "currency", "provenance"],
        additionalProperties: false,
        properties: {
          index: {
            type: ["integer", "null"],
            minimum: 1,
            description: "1-based order of the flight within the document/table"
          },
          placement_id: {
            type: ["string", "null"],
            description: "Placement or line-item identifier if present (e.g., GLD000XV6P...)"
          },
          name: {
            type: ["string", "null"],
            description: "Flight or placement name/label (e.g., 'Holiday Push')"
          },
          start: {
            type: ["string", "null"],
            pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            description: "Flight start date in YYYY-MM-DD format"
          },
          end: {
            type: ["string", "null"],
            pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            description: "Flight end date in YYYY-MM-DD format"
          },
          units: {
            type: ["integer", "null"],
            minimum: 0,
            description: "Total impressions for this flight"
          },
          unit_type: {
            type: ["string", "null"],
            description: "Unit type label (e.g., 'Viewed Impressions')"
          },
          rate_cpm: {
            type: ["number", "null"],
            minimum: 0,
            description: "CPM rate for this flight (e.g., 13.5100)"
          },
          cost_method: {
            type: ["string", "null"],
            description: "Cost method (e.g., CPM, CPMV)"
          },
          cost: {
            type: ["number", "null"],
            minimum: 0,
            description: "Cost for this flight (decimal, no commas or currency symbol)"
          },
          currency: {
            type: ["string", "null"],
            pattern: "^[A-Z]{3}$",
            description: "Currency code for this flight (e.g., USD)"
          },
          provenance: {
            type: "object",
            required: ["quote", "location_hint", "find_confidence", "value_confidence", "rationale"],
            additionalProperties: false,
            properties: {
              quote: {
                type: "string",
                description: "Exact quote/snippet for this flight from the table"
              },
              location_hint: {
                type: "string",
                description: "Where in the document this flight info was found (e.g., 'page 5, Flighting details table, OCT 2025 column')"
              },
              find_confidence: {
                type: "integer",
                minimum: 0,
                maximum: 100,
                description: "Likelihood the quoted span truly appears in TEXT and belongs to this field (0–100)"
              },
              value_confidence: {
                type: "integer",
                minimum: 0,
                maximum: 100,
                description: "Likelihood the normalized value you output is correct (0–100)"
              },
              rationale: {
                type: "string",
                description: "Short reason tied to the evidence (max ~20 words)"
              }
            }
          }
        }
      }
    },
    explanation: {
      type: "object",
      required: ["summary", "assumptions", "omissions"],
      additionalProperties: false,
      properties: {
        summary: { 
          type: "string",
          description: "Summary of how the document was parsed",
          minLength: 1
        },
        assumptions: { 
          type: "array",
          items: { type: "string" },
          description: "List of assumptions made during parsing"
        },
        omissions: { 
          type: "array",
          items: { type: "string" },
          description: "List of fields that could not be found"
        }
      }
    },
    provenance: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["field", "quote", "location_hint", "find_confidence", "value_confidence", "rationale"],
        additionalProperties: false,
        properties: {
          field: { 
            type: "string",
            description: "The field name this provenance refers to"
          },
          quote: { 
            type: "string",
            description: "Exact quote from the document"
          },
          location_hint: { 
            type: "string",
            description: "Where in the document this was found"
          },
          find_confidence: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description: "Likelihood the quoted span truly appears in TEXT and belongs to this field (0–100)"
          },
          value_confidence: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description: "Likelihood the normalized value you output is correct (0–100)"
          },
          rationale: {
            type: "string",
            description: "Short reason tied to the evidence (max ~20 words)"
          }
        }
      }
    }
  }
};

const PARSING_PROMPT = `Parse Tubi IO (Insertion Order) contract → JSON (use provided schema; return JSON only)

Task
- Extract top-level campaign fields and per-flight line items from one Tubi IO (PDF/text). No guessing. If a field isn't present, use null (except frequency_cap default=2).

Core rules
- Advertiser: The client company (not agency/supplier). Extract from: "Advertiser/Brand" labels, placement taxonomy ".../BRAND/..." (normalize case), "Primary ad server" (strip suffixes).
  * DO NOT use supplier/publisher names (TO, Supplier/Traffic, Financial Supplier, domains like tubi.tv).
  * Explicitly NEVER set advertiser to "Tubi" or any publisher/vendor name, even if shown prominently.
  * Examples: "TACO BELL" → "Taco Bell"; exclude "Tubi" if it appears as supplier.

- Dates: Convert literal calendar dates you see to YYYY-MM-DD. Do not shift dates.
  * Accept separators ".", "/", "–", "-" and compact tokens; normalize before parsing.
  * Assume US format (MM/DD/YY) unless the day > 12 (then interpret as DD/MM/YY). If year is two digits, infer century from context.
  * Normalize odd tokens like "01.02/2025" → "01/02/2025" per the above rule.
  * Example: "4/20/25 - 6/25/25" → start "2025-04-20", end "2025-06-25".
  * In explanation.summary include: "Found '4/20/25 - 6/25/25' → start 2025-04-20, end 2025-06-25 (preserved exact dates)."
  * start flight = start date, end flight = end date (no implicit shifting).

- Numbers: impressions as integer; spend as decimal; strip commas.
  * Currency: If a "$" appears ANYWHERE in the document, set currency="USD". Otherwise extract a 3-letter currency code if present, else null.
  * PO Number: Look for "PO Number", "Purchase Order", "Order Number", "External PO". This is not an internal campaign ID.
  * Parse spend from cells like "$90,189.47" → 90189.47.
  * Do NOT scale or divide spend by 1,000. Scaling applies only in CPM math checks, never when extracting displayed totals.

**Order totals precedence (HARD GATE)**
  * If an "Order totals" / "Order total(s)" table is present, treat it as the **single source of truth** for campaign totals.
  * Set \`total_contracted_impressions\` to the literal Impressions (strip commas) and \`total_campaign_spend\` to the literal Cost (strip "$" and commas).
  * Do **not** compute totals from flights when an Order totals table exists; only compute when no Order totals are present.
  * Provenance for these fields must quote the exact Order totals line (e.g., "Impressions 86,011,110"; "Cost $1,284,836.20").

**Totals reconciliation with Added Value**
  * AV units must be included in the campaign impression total.
  * After extracting flights, compute sum_all_units = sum(paid.units + av.units). If sum_all_units ≠ Order totals Impressions, keep the Order totals value for \`total_contracted_impressions\` and add a note in \`explanation.assumptions\`.
  * Added Value lines have CPM = 0 and Cost = 0.00, units > 0

// --- MONTH BOUNDARY HARD GATE (strong) ---
**UNIVERSAL MONTH BOUNDARY (HARD GATE)**
  * A flight **must never** cross a calendar month.
  * If any candidate flight spans two months (e.g., 9/29–10/05), you MUST split it:
    - Part 1: 9/29–9/30
    - Part 2: 10/01–10/05
  * **Prorate** cost and units by active days within each split segment.
    - units_segment = round(total_units * (days_segment / total_active_days))
    - cost_segment  = round_to_cents(total_cost * (days_segment / total_active_days))
  * After splitting, ensure sum(units_segment) == original units (adjust ±1 on the largest segment if needed); and sum(cost_segment) == original cost (cent-rounding on the largest segment if needed).

**MONTH BOUNDARY SELF-CHECK (MANDATORY)**
  * Before returning JSON, scan every flight:
    - If start.month != end.month → **reject this draft**, split + prorate as above, and only then return.
  * Include in explanation.summary: "Month boundary check: no flight crosses months; splits applied where needed."

**Dark Weeks / Blackouts (HARD GATE)**
  * If the IO specifies "Dark Weeks"/"Blackout dates", split affected spans to exclude dark days and **prorate by active-day proportion** (same prorating rule as above).
  * Example (Oct budget 13,840.80; active days 1–5 and 20–31 → 17 days): per-day = 13,840.80/17; Oct 1–5 cost = per-day*5; Oct 20–31 cost = per-day*12.
  * Provenance for each prorated flight must cite the dark-week note and specify "prorated by active days" in location_hint.

**NEVER EMIT SPAN FLIGHTS WHEN MONTHLY COLUMNS EXIST (HARD GATE)**
  * If a placement row (e.g., P375Z4Z) has monthly headers (Sep 25, Oct 25, …), emit **one flight per month** clipped to that month and campaign window.
  * \`flights[].name\` must equal the month token (e.g., "Oct 25").
  * Reject and retry if you produce only one span flight when month columns are visible.

Example (monthly)
❌ Incorrect: P375Z4Z → one flight 2025-09-29 to 2025-12-07, Units 7,509,551, Cost $157,250.00  
✅ Correct: four flights  
- Sep 25 → 214,559 / $4,492.87  
- Oct 25 → 3,325,658 / $69,639.28  
- Nov 25 → 3,218,379 / $67,392.86  
- Dec 25 → 750,955 / $15,724.99

✅ Correct (monthly added value)  
P375Z48 → four flights with Units [6,437; 99,770; 96,552; 22,528], Rate 0.0, Cost 0.00 each.

**Weekly / Booking-Week precedence (HARD GATE)**
  * If a section/table labeled "Booking Week", "Week of …", etc. exists with ≥2 rows, emit **one flight per week row** and NEVER a single combined span flight.
  * Dates: If a full date is shown, start = that date; end = start + 6 days, clipped to campaign end. If only month/day (e.g., "Sep 1"), assume the campaign's year.
  * Apply the universal **Month boundaries** rule if a booking week crosses a month (split + prorate).
  * Numbers when week rows omit impressions: if Allocation and CPM exist, compute \`units = round((allocation / cpm) * 1000)\`. Cost = Allocation; \`cost_method = "CPM"\`; \`rate_cpm\` = shown CPM.
  * Added-value weeks: if $0 allocation and rate=0, set cost=0.00, rate_cpm=0.0, units=row's value if present; otherwise 0.
  * Placement ID on weekly rows: if none shown, set \`placement_id = null\`.
  * Provenance per week flight: quote the **week token** (e.g., "Sep 1 $5,000") and CPM; location_hint mentions "Booking Week" or "Airing Days".
  * Anti-merge: if only one span flight is produced while a Booking-Week table has N≥2 rows, discard the span and emit **N weekly flights**.

Few-shot (weekly)
- Incorrect: one flight 2025-09-01 to 2025-09-14, 1,250,000 units, $10,000, CPM $8.
- Correct: two flights:
  - Week of Sep 1, 2025 → 2025-09-01 to 2025-09-07, units 625,000, cost 5000.00, rate_cpm 8.
  - Week of Sep 8, 2025 → 2025-09-08 to 2025-09-14, units 625,000, cost 5000.00, rate_cpm 8.
  Provenance must quote "Sep 1 $5,000", "Sep 8 $5,000", and "$8 CPM", with location_hint mentioning "Booking Week".

**DR Flight Items Handling (HARD GATE)**
  * If there are flight items broken out weekly, output weekly flights.
  * Flights must not cross months (use the universal split + prorate rule).
  * Example: 9/25–10/03 → split into 9/25–9/30 and 10/01–10/03, prorating costs/units by active days.

**Flight Item Rules: Row-aligned Units Only (HARD GATE)**
  * Units must come from the same row as the placement_id AND the same month/week column.
  * Do not use summary percentages/totals (e.g., "220,996 (3%)").
  * Only emit flights as the IO presents them. Do not guess, merge, or split beyond mandatory dark-week/month-boundary rules.
  * If a month contains both a paid line AND an added-value line, emit two separate flights for that month (one paid, one AV). Do NOT merge paid + AV.
  * If multiple paid and AV lines exist for the same month, keep paid vs AV separated.

**CPM consistency check (HARD GATE)**
  * Require cost ≈ (units / 1000) * rate_cpm within ±0.5.
  * If units don't satisfy the equation with the row's rate and cost, re-read Units from the placement row and prefer the value that satisfies CPM math.
  * Example: rate_cpm = 15.86 and cost = 141,666.66 → units ≈ 8,932,324 (not 13,932,324).

**Ignore summary roll-ups (HARD GATE)**
  * Do NOT emit flights from "Flighting summary" tables or "Total" rows with no placement ID, or any roll-up rows/columns.
  * Use the "Flighting details" section as the authoritative source for flights.
  * Totals with percentages in parentheses next to numbers are roll-ups—ignore.

**Package/header span suppression (HARD GATE)**
  * If a placement row has a header span like "..._09-29-2025_12-28-2025_Package" AND a monthly/weekly breakdown exists, DO NOT emit a separate package-span flight. Use the month/week columns only.
  * Emit either the set of months/weeks OR a single span flight—never both. Prefer months/weeks when present.

**Detail-row requirement (HARD GATE)**
  * A valid flight MUST come from a detail row that contains a **placement ID token** (e.g., P375Z4Z, P375Z48, P2Z2B6T). For weekly tables without explicit IDs, set \`placement_id = null\`.
  * \`provenance.quote\` must include BOTH the placement ID (when present) and the **month/week token** (e.g., "P375Z4Z … Oct 25 … 3,325,658 … $69,639.28" OR "Week of Sep 1, 2025 … $5,000 … $8 CPM").
  * \`provenance.location_hint\` must include "Flighting details" (monthly) or "Booking Week/Airing Days" (weekly).
  * Reject any candidate flight whose snippet lacks a placement ID when one is visible, or whose location refers to a summary.

**Monthly breakdowns (preferred when present)**
  * If a table has monthly headers (JAN 25, FEB 25, …), emit one flight per month column, dates clipped to that month and campaign window.
  * If Units are missing but Allocation+CPM appear in a month cell, compute Units as: \`round((allocation / cpm) * 1000)\`.
  * Do not use summary-format numbers (e.g., "220,996 (3%)"). Prefer detail-row values.
  * Provenance for each monthly flight must quote the **month token** and that month's Units/Cost, or the Allocation+CPM used to compute Units.
  * Quarterly or multi-month rows: only emit as-written if the row explicitly lists a spanning range (e.g., "Q1'25 (1/2/25–3/31/25)"). Do not split unless a separate monthly breakdown also exists.
  * When both quarter notes and monthly tables exist, use the monthly table for flights; treat quarter labels as context only.
  * \`unit_type\` is "Impressions" unless explicitly different; if different, quote it exactly.

**Added Value / Bonus / Makegood**
  * Treat rows labeled "Added Value", "Value Add", "Bonus", "Makegood", "AV", "N/C", "No charge", or with Cost = $0.00 (and rate_cpm = 0) as valid AV flights.
  * Emit normal flights with cost=0.00; cost_method per table (usually CPM); currency as per global currency rule.
  * Provenance must include the snippet indicating AV ("0.0000", "$0.00", "Added Value").

**Account Executive (HARD GATE)**
  * Only populate \`account_executive_name\` when the person is explicitly labeled as Tubi staff ("Tubi Account Executive", "Tubi Sales", appears under a Tubi/Supplier contact block).
  * The account executive can also be labeled as "AE", if there is a name next to "AE", then this person is the account executive
  * DO NOT use client or agency contacts.
  * If unsure or unlabeled, set to null.
  * Provenance for AE must quote the label proving Tubi affiliation; otherwise return null and add \`account_executive_name\` to omissions only if absent.

**Frequency Cap (selection rule)**
  * If multiple caps exist (e.g., "Hourly 2", "Daily 6", "Booking 20"), set \`frequency_cap\` to the **Daily** value.
  * Preference order: **Daily** > Hourly > Weekly/Booking. If none present, default to **2**.
  * Provenance must include the line proving the chosen cap (e.g., "Daily 6").

**Period**
  * If explicit period labels exist, extract as-is (e.g., "Apr'25").
  * Otherwise, **infer from flight dates**:
    - Format = \`Mon'YY\` (e.g., start 2025-04-20 → "Apr'25"; end 2025-06-25 → "Jun'25").
    - If either flight date is null, set period.start/end to null.
    - In explanation.summary, state that period was inferred from flight dates.

**Provenance (MANDATORY for EVERY non-null top-level field)**
  * Include exact quote + location_hint for ALL non-null top-level fields.
  * Individual flight items do NOT need separate provenance entries—only the overall flight structure needs provenance.
  * For exact fields (advertiser_name, agency_name, etc.): include the exact text and where found.
  * For derived/computed fields (e.g., units from Allocation & CPM; prorated splits due to dark weeks or month boundary): include the source snippet(s) and note "computed/prorated" in location_hint.
  * For inferred fields (period from flight dates): cite flight dates and mark "inferred" in location_hint.
  * Quality check: Count your non-null top-level fields vs provenance entries—they must match (excluding individual flight details).

**Omissions**
  * ONLY add field names to explanation.omissions if they are null (not found).
  * ALWAYS explain why/why not these fields exist: po_number, account_executive_name.
  * If a field has a value, do NOT include it in omissions.

**Validation (soft gates)**
  * \`flights.length\` should equal the count of populated month columns or the number of booking-week rows with values (after any required splits).
  * Sum of each placement's monthly units should be ≤ that placement's detail-row total (and must never equal the global summary total).
  * Verify sum(all flights' units) == \`total_contracted_impressions\` (± small epsilon). If not, re-check AV inclusion and that no summary numbers were used.
  * If sums of flights.units or flights.cost don't match top-level totals, still return flights and add a note in \`explanation.assumptions\`.

**Confidence rules (embedded in provenance):**
- For every field you extract, include in its provenance:
  - find_confidence (0–100): likelihood the quoted span truly appears in TEXT and belongs to this field (based only on exact match + nearby labels/headers + location specificity).
  - value_confidence (0–100): likelihood the normalized value you output is correct (formatting, unit interpretation, context alignment).
  - rationale: a short reason tied to the evidence (max ~20 words).
- Calibration:
  - 100 only with exact quote + unambiguous label.
  - 80–95 for strong evidence with minor ambiguity.
  - 50–70 if label is weak or requires interpretation.
  - ≤40 if partial, fuzzy, or speculative.

Output
- Return JSON only.
- Must exactly match the provided JSON schema.
- Use Structured Outputs/JSON Schema mode to validate the response.

**FINAL VALIDATION CHECKLIST**
✅ Every non-null top-level field has a provenance entry  
✅ Provenance count matches extracted field count (excluding individual flight details)  
✅ All quotes are exact text from the document  
✅ All location_hints are descriptive and helpful

**PROVENANCE EXAMPLE**
If you extract: advertiser_name="Taco Bell", total_campaign_spend=50000, po_number="12345"
You MUST have exactly 3 provenance entries:
[
  {"field": "advertiser_name", "quote": "Advertiser: Taco Bell", "location_hint": "contract header section"},
  {"field": "total_campaign_spend", "quote": "Total Budget: $50,000", "location_hint": "budget summary table"},
  {"field": "po_number", "quote": "PO Number: 12345", "location_hint": "order details section"}
]

Few-shot clarification
- ❌ Incorrect: "Jan 25, Feb 25, Mar 25 …" → one flight with start 2025-01-02, end 2025-03-31.
- ✅ Correct: three flights:
  - Jan 25: 2025-01-02 to 2025-01-31
  - Feb 25: 2025-02-01 to 2025-02-28
  - Mar 25: 2025-03-01 to 2025-03-31
  Each with its own Units/Cost and provenance that includes the month token.

- ✅ Correct (weekly): If a "Booking Week" table shows "Sep 1 $5,000" and "Sep 8 $5,000" with CPM $8, emit two weekly flights with units 625,000 each, cost $5,000 each, rate_cpm 8, with provenance quoting the week tokens and CPM.`;

/**
 * Parse extracted text using OpenAI with structured output
 * - Promise-based (await only)
 * - Uses JSON schema validation
 * - Returns validated parsed object
 */
export async function parseTextToJSON(
  text: string,
  orderNumber?: string
): Promise<any> {
  try {
    // Use OpenAI with structured output
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: PARSING_PROMPT
        },
        {
          role: "user",
          content: `Parse this Tubi IO document. ${orderNumber ? `The order number is: ${orderNumber}` : ''}

Here is the IO Document text:
${text}`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "tubi_io_parser",
          schema: JSON_SCHEMA,
          strict: true
        }
      },
      temperature: 0
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content returned from OpenAI");
    }

    const parsed = JSON.parse(content);
    
    // Override po_number with order number from PyMuPDF if available
    if (orderNumber) {
      parsed.po_number = orderNumber;
      // Add provenance entry for the order number override
      parsed.provenance.push({
        field: "po_number",
        quote: `Order Number: ${orderNumber}`,
        location_hint: "extracted from PyMuPDF text extraction (override)"
      });
    }

    return parsed;
  } catch (error) {
    throw new Error(`Text parsing failed: ${(error as Error).message}`);
  }
}
