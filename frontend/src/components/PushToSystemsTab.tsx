import { useState, useMemo, useRef, useEffect } from 'react';
import type { SimplifiedData, EditedField, EditedFlight } from '../types';
import './PushToSystemsTab.css';
import productsData from '../data/products.json';

interface PushToSystemsTabProps {
  simplifiedData: SimplifiedData;
  onSave?: (editedData: SimplifiedData) => void;
  onPush?: (payload: any) => Promise<void>;
}

interface Product {
  productId: string;
  productName: string;
}

// Load and prepare products
const PRODUCTS: Product[] = productsData as Product[];
const PRODUCT_OPTIONS = ['Choose Product', ...PRODUCTS.map(p => p.productName)];
const PRODUCT_MAP = new Map(PRODUCTS.map(p => [p.productName, p.productId]));

// Flight name generation helper (outside component for reuse in initialization)
const generateFlightName = (
  agency: string,
  advertiser: string,
  flightName: string,
  targeting: string,
  startDate: string | null,
  endDate: string | null
): string => {
  const parts: string[] = [];
  
  // Add agency (remove spaces and special chars)
  if (agency) parts.push(agency.replace(/[^a-zA-Z0-9]/g, ''));
  
  // Add advertiser (remove spaces and special chars)
  if (advertiser) parts.push(advertiser.replace(/[^a-zA-Z0-9]/g, ''));
  
  // Add flight name (optional)
  if (flightName) parts.push(flightName.replace(/[^a-zA-Z0-9]/g, ''));
  
  // Add targeting (optional)
  if (targeting) parts.push(targeting.replace(/[^a-zA-Z0-9]/g, ''));
  
  // Add date range (M.DD-M.DD.YY format)
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const startMonth = start.getMonth() + 1; // 1-12
    const startDay = start.getDate();
    const endMonth = end.getMonth() + 1; // 1-12
    const endDay = end.getDate();
    const year = end.getFullYear().toString().slice(-2); // Last 2 digits
    
    parts.push(`${startMonth}.${startDay}-${endMonth}.${endDay}.${year}`);
  }
  
  // Join with underscores, removing any empty parts
  return parts.filter(p => p).join('_');
};

export default function PushToSystemsTab({ 
  simplifiedData, 
  onSave, 
  onPush 
}: PushToSystemsTabProps) {
  const [editedFields, setEditedFields] = useState<EditedField[]>(
    simplifiedData.fields.map(f => ({ ...f }))
  );
  // Campaign-level naming fields (for name generation only, separate from parsed fields)
  const [campaignAgency, setCampaignAgency] = useState(
    simplifiedData.fields.find(f => f.field === 'agency_name')?.value || ''
  );
  const [campaignAdvertiser, setCampaignAdvertiser] = useState(
    simplifiedData.fields.find(f => f.field === 'advertiser_name')?.value || ''
  );

  const [editedFlights, setEditedFlights] = useState<EditedFlight[]>(() => {
    return simplifiedData.flights.map(f => {
      const flightName = f.name || '';
      const targeting = '';
      const generatedName = generateFlightName(campaignAgency, campaignAdvertiser, flightName, targeting, f.start, f.end);
      
      return {
        ...f,
        product: 'Choose Product',
        flightName,
        targeting,
        generatedName
      };
    });
  });
  const [showDebug, setShowDebug] = useState(false);
  const [pushStatus, setPushStatus] = useState<'idle' | 'pushing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isPushed, setIsPushed] = useState(false);
  const [selectedFlights, setSelectedFlights] = useState<Set<number>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [bulkProduct, setBulkProduct] = useState('Choose Product');
  
  // Bulk editing for line-item level fields
  const [bulkFlightName, setBulkFlightName] = useState('');
  const [bulkTargeting, setBulkTargeting] = useState('');

  // AOS Configuration
  const [aosConfig, setAosConfig] = useState({
    dealId: '',
    timeZone: 'America/New_York',
    distribution: 'Pro-rate by Day',
    lineType: 'STANDARD',
    planProductId: '68e44077d3e663b9264a7011',
    productId: '6408d925e026aa3b863ff8eb',
    lineClassId: 'JHHPLIuxRpKxrl-b776nJA',
    costMethodId: 'FNbz9RlSRk2Kp7tABGQZkg',
    unitTypeId: 'Nj9QzU8zTHKFCThdlN-8YA'
  });

  // Field name formatting
  const formatFieldName = (field: string): string => {
    return field
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Validation
  const requiredFields = [
    'advertiser_name',
    'agency_name',
    'total_campaign_spend',
    'total_contracted_impressions',
    'po_number'
  ];

  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    // Check AOS configuration
    if (!aosConfig.dealId) {
      errors.push('Deal ID is required');
    } else if (aosConfig.dealId.length !== 6) {
      errors.push('Deal ID must be exactly 6 characters');
    }

    // Check required fields
    requiredFields.forEach(fieldName => {
      const field = editedFields.find(f => f.field === fieldName);
      if (!field || !field.value) {
        errors.push(`${formatFieldName(fieldName)} is required`);
      }
    });

    // Check reject status fields (must be edited)
    editedFields.forEach(field => {
      if (field.status === 'reject' && !field.isEdited) {
        errors.push(`${formatFieldName(field.field)} (rejected) must be edited`);
      }
    });

    // Check needs_review items (must be edited or reviewed)
    editedFields.forEach(field => {
      if (field.needs_review && !field.isEdited && !field.isReviewed) {
        errors.push(`${formatFieldName(field.field)} needs review`);
      }
    });

    editedFlights.forEach(flight => {
      if (flight.needs_review && !flight.isEdited && !flight.isReviewed) {
        errors.push(`Flight ${flight.name || flight.index} needs review`);
      }
    });

    return errors;
  }, [editedFields, editedFlights, aosConfig]);

  const canPush = validationErrors.length === 0;

  // Handlers
  const handleFieldChange = (fieldName: string, newValue: any) => {
    setEditedFields(fields =>
      fields.map(f =>
        f.field === fieldName
          ? { ...f, value: newValue, isEdited: true }
          : f
      )
    );
  };

  const handleFieldReview = (fieldName: string) => {
    setEditedFields(fields =>
      fields.map(f =>
        f.field === fieldName
          ? { ...f, isReviewed: true }
          : f
      )
    );
  };

  const handleFlightChange = (index: number, key: keyof EditedFlight, newValue: any) => {
    setEditedFlights(flights =>
      flights.map((f, i) =>
        i === index
          ? { ...f, [key]: newValue, isEdited: true }
          : f
      )
    );
  };

  const handleFlightReview = (index: number) => {
    setEditedFlights(flights =>
      flights.map((f, i) =>
        i === index
          ? { ...f, isReviewed: true }
          : f
      )
    );
  };

  const handleAddFlight = () => {
    const newFlight: EditedFlight = {
      index: editedFlights.length + 1,
      placement_id: null,
      name: null,
      start: null,
      end: null,
      units: null,
      unit_type: null,
      rate_cpm: null,
      cost_method: null,
      cost: null,
      currency: 'USD',
      confidence: 1.0,
      status: 'use',
      needs_review: false,
      product: 'Choose Product',
      flightName: '',
      targeting: '',
      generatedName: '',
      isEdited: true
    };
    setEditedFlights([...editedFlights, newFlight]);
  };

  const handleDeleteFlight = (index: number) => {
    if (confirm('Are you sure you want to delete this flight?')) {
      setEditedFlights(flights => flights.filter((_, i) => i !== index));
      setSelectedFlights(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    }
  };

  const handleSelectAll = () => {
    if (selectedFlights.size === editedFlights.length) {
      setSelectedFlights(new Set());
      setLastSelectedIndex(null);
    } else {
      setSelectedFlights(new Set(editedFlights.map((_, i) => i)));
      setLastSelectedIndex(null);
    }
  };

  const handleSelectFlight = (index: number, shiftKey: boolean = false) => {
    setSelectedFlights(prev => {
      const newSet = new Set(prev);
      
      // Shift-click: select range (always add to selection)
      if (shiftKey && lastSelectedIndex !== null) {
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        // Include both start and end in the range
        for (let i = start; i <= end; i++) {
          newSet.add(i);
        }
        // Don't update lastSelectedIndex on shift-click, keep it for next range
        return newSet;
      } else {
        // Regular click: toggle
        if (newSet.has(index)) {
          newSet.delete(index);
        } else {
          newSet.add(index);
        }
        // Update last selected index for regular clicks
        setLastSelectedIndex(index);
        return newSet;
      }
    });
  };

  const handleBulkAssignProduct = () => {
    if (selectedFlights.size === 0 || bulkProduct === 'Choose Product') {
      alert('Please select flights and choose a product');
      return;
    }

    setEditedFlights(flights =>
      flights.map((f, i) =>
        selectedFlights.has(i)
          ? { ...f, product: bulkProduct, isEdited: true }
          : f
      )
    );
    alert(`Product assigned to ${selectedFlights.size} flight(s)`);
  };

  const handleBulkDelete = () => {
    if (selectedFlights.size === 0) {
      alert('Please select flights to delete');
      return;
    }

    if (confirm(`Are you sure you want to delete ${selectedFlights.size} flight(s)?`)) {
      setEditedFlights(flights => flights.filter((_, i) => !selectedFlights.has(i)));
      setSelectedFlights(new Set());
    }
  };

  const handleBulkAssignFlightNameOnly = () => {
    if (selectedFlights.size === 0) {
      alert('Please select flights');
      return;
    }

    setEditedFlights(flights =>
      flights.map((f, i) => {
        if (!selectedFlights.has(i)) return f;
        
        const updatedFlight = { ...f, flightName: bulkFlightName, isEdited: true };
        
        // Regenerate name with updated flight name
        const generatedName = generateFlightName(
          campaignAgency,
          campaignAdvertiser,
          updatedFlight.flightName || '',
          updatedFlight.targeting || '',
          updatedFlight.start,
          updatedFlight.end
        );
        
        return { ...updatedFlight, generatedName };
      })
    );
    
    const action = bulkFlightName.trim() ? 'assigned' : 'cleared';
    alert(`Flight name ${action} and names regenerated for ${selectedFlights.size} flight(s)`);
  };

  const handleBulkAssignTargetingOnly = () => {
    if (selectedFlights.size === 0) {
      alert('Please select flights');
      return;
    }

    setEditedFlights(flights =>
      flights.map((f, i) => {
        if (!selectedFlights.has(i)) return f;
        
        const updatedFlight = { ...f, targeting: bulkTargeting, isEdited: true };
        
        // Regenerate name with updated targeting
        const generatedName = generateFlightName(
          campaignAgency,
          campaignAdvertiser,
          updatedFlight.flightName || '',
          updatedFlight.targeting || '',
          updatedFlight.start,
          updatedFlight.end
        );
        
        return { ...updatedFlight, generatedName };
      })
    );
    
    const action = bulkTargeting.trim() ? 'assigned' : 'cleared';
    alert(`Targeting ${action} and names regenerated for ${selectedFlights.size} flight(s)`);
  };

  const handleGenerateFlightNames = () => {
    if (selectedFlights.size === 0) {
      alert('Please select flights');
      return;
    }

    // First, assign bulk values to selected flights, then generate names
    setEditedFlights(flights =>
      flights.map((f, i) => {
        if (!selectedFlights.has(i)) {
          return f;
        }

        // Apply bulk values - use the bulk input if it has a value (even if empty string to clear)
        const updatedFlight = {
          ...f,
          flightName: bulkFlightName !== undefined && bulkFlightName !== null ? bulkFlightName : (f.flightName || ''),
          targeting: bulkTargeting !== undefined && bulkTargeting !== null ? bulkTargeting : (f.targeting || ''),
          isEdited: true
        };

        // Generate name with updated values
        const generatedName = generateFlightName(
          campaignAgency,
          campaignAdvertiser,
          updatedFlight.flightName,
          updatedFlight.targeting,
          updatedFlight.start,
          updatedFlight.end
        );

        return { ...updatedFlight, generatedName };
      })
    );

    alert(`Generated ${selectedFlights.size} flight name(s)`);
  };

  const handleUpdateCampaignInfo = () => {
    // Only regenerate flight names with new campaign info
    // Do NOT update the actual agency/advertiser fields (those remain editable independently)
    setEditedFlights(flights =>
      flights.map(f => {
        const generatedName = generateFlightName(
          campaignAgency,
          campaignAdvertiser,
          f.flightName || '',
          f.targeting || '',
          f.start,
          f.end
        );
        return { ...f, generatedName, isEdited: true };
      })
    );

    alert('All flight names regenerated with updated campaign naming settings');
  };

  const handleSave = () => {
    const updatedData: SimplifiedData = {
      ...simplifiedData,
      fields: editedFields,
      flights: editedFlights
    };

    // Save to localStorage
    localStorage.setItem('tubi_io_draft', JSON.stringify({
      data: updatedData,
      timestamp: new Date().toISOString()
    }));

    if (onSave) {
      onSave(updatedData);
    }

    alert('Draft saved successfully!');
  };

  // Build Unified Planner operations from flights
  const buildOperations = () => {
    return editedFlights.map((flight, i) => {
      // Use generatedName, fallback to name or auto-generated
      const name = flight.generatedName || flight.name || `Auto Line ${flight.start} to ${flight.end}`;
      const externalLineId = `line-${flight.start}${i ? `-${i+1}` : ''}`;

      // Get product ID from product name
      const productId = flight.product && flight.product !== 'Choose Product' 
        ? PRODUCT_MAP.get(flight.product) 
        : aosConfig.productId;

      return {
        externalLineId,
        operation: 'CREATE',
        planDigitalLineRequest: {
          name,
          distribution: aosConfig.distribution,
          period: {
            startDate: flight.start,
            endDate: flight.end,
            timeZone: aosConfig.timeZone
          },
          planWorkspaceProduct: {
            planProductId: aosConfig.planProductId,
            productId: productId,
            lineClassId: aosConfig.lineClassId,
            lineType: aosConfig.lineType
          },
          rates: {
            costMethodId: aosConfig.costMethodId,
            unitTypeId: aosConfig.unitTypeId,
            quantity: flight.units || 0,
            netUnitCost: flight.rate_cpm || 0
          },
          targets: [
            {
              id: 6,
              groupedTargets: [
                {
                  childTargets: [
                    { id: 3, targetOptions: [ { id: 85 } ] }
                  ]
                }
              ]
            }
          ]
        }
      };
    });
  };

  const handlePush = async () => {
    if (!canPush) return;

    setPushStatus('pushing');
    setErrorMessage('');

    try {
      // Build operations array for Unified Planner
      const operations = buildOperations();

      if (onPush) {
        // Custom push handler provided
        await onPush({ dealId: aosConfig.dealId, operations });
      } else {
        // Default: send to AOS Unified Planner endpoint
        const response = await fetch('/api/aos/push-workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dealId: aosConfig.dealId,
            operations
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.details || data.error || 'Push failed');
        }

        console.log('AOS Response:', data);
      }

      setPushStatus('success');
      setIsPushed(true);
      setTimeout(() => setPushStatus('idle'), 5000);
    } catch (error) {
      setPushStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Push failed');
    }
  };

  // Group fields by status
  const rejectFields = editedFields.filter(f => f.status === 'reject');
  const reviewFields = editedFields.filter(f => f.status === 'review');
  const useFields = editedFields.filter(f => f.status === 'use');

  return (
    <div className="push-to-systems-tab">
      {/* Summary Section */}
      <div className="summary-section">
        <div className="summary-card">
          <div className="summary-header">
            <h2>Campaign Summary</h2>
            <div className="confidence-badge large">
              {(simplifiedData.overall_confidence * 100).toFixed(1)}%
            </div>
          </div>
          <div className="summary-stats">
            <div className="stat use">
              <span className="stat-value">{simplifiedData.summary.use_count}</span>
              <span className="stat-label">Use</span>
            </div>
            <div className="stat review">
              <span className="stat-value">{simplifiedData.summary.review_count}</span>
              <span className="stat-label">Review</span>
            </div>
            <div className="stat reject">
              <span className="stat-value">{simplifiedData.summary.reject_count}</span>
              <span className="stat-label">Reject</span>
            </div>
          </div>
          <div className={`validation-status ${canPush ? 'valid' : 'invalid'}`}>
            {canPush ? (
              <span>Ready to push</span>
            ) : (
              <span>{validationErrors.length} items need attention</span>
            )}
          </div>
        </div>
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="validation-errors">
          <h3>Issues to Resolve:</h3>
          <ul>
            {validationErrors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* AOS Configuration Section */}
      <div className="aos-config-section">
        <h2>AOS Configuration</h2>
        <div className="config-grid">
          <div className="config-item">
            <label>Deal ID * (6 chars)</label>
            <input
              type="text"
              value={aosConfig.dealId}
              onChange={(e) => setAosConfig({ ...aosConfig, dealId: e.target.value })}
              placeholder="6 digits"
              className="config-input"
              minLength={6}
              maxLength={6}
              pattern="\d{6}"
            />
          </div>
          <div className="config-item">
            <label>Time Zone</label>
            <select
              value={aosConfig.timeZone}
              onChange={(e) => setAosConfig({ ...aosConfig, timeZone: e.target.value })}
              className="config-input"
            >
              <option value="America/New_York">America/New_York</option>
              <option value="America/Chicago">America/Chicago</option>
              <option value="America/Denver">America/Denver</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
            </select>
          </div>
          <div className="config-item">
            <label>Distribution</label>
            <input
              type="text"
              value={aosConfig.distribution}
              onChange={(e) => setAosConfig({ ...aosConfig, distribution: e.target.value })}
              className="config-input"
            />
          </div>
        </div>
      </div>

      {/* Fields Section */}
      <div className="fields-section">
        <h2>Campaign Fields</h2>

        {/* Reject Fields */}
        {rejectFields.length > 0 && (
          <div className="field-group reject-group">
            <h3>Rejected Fields (Must Edit)</h3>
            {rejectFields.map(field => (
              <FieldEditor
                key={field.field}
                field={field}
                onChange={handleFieldChange}
                onReview={handleFieldReview}
                formatFieldName={formatFieldName}
              />
            ))}
          </div>
        )}

        {/* Review Fields */}
        {reviewFields.length > 0 && (
          <div className="field-group review-group">
            <h3>Review Required</h3>
            {reviewFields.map(field => (
              <FieldEditor
                key={field.field}
                field={field}
                onChange={handleFieldChange}
                onReview={handleFieldReview}
                formatFieldName={formatFieldName}
              />
            ))}
          </div>
        )}

        {/* Use Fields */}
        {useFields.length > 0 && (
          <div className="field-group use-group">
            <h3>Ready to Use</h3>
            {useFields.map(field => (
              <FieldEditor
                key={field.field}
                field={field}
                onChange={handleFieldChange}
                onReview={handleFieldReview}
                formatFieldName={formatFieldName}
              />
            ))}
          </div>
        )}
      </div>

      {/* Campaign Settings for Flight Name Generation */}
      <div className="campaign-settings-section">
        <h2>Flight Name Generation Settings</h2>
        <p style={{ fontSize: '13px', color: '#666', margin: '0 0 16px 0' }}>
          These values are used ONLY for generating flight names. They don't affect the parsed Agency/Advertiser fields above.
        </p>
        <div className="campaign-settings-grid">
          <div className="config-item">
            <label>Agency</label>
            <input
              type="text"
              value={campaignAgency}
              onChange={(e) => setCampaignAgency(e.target.value)}
              placeholder="e.g., OMD"
              className="config-input"
            />
          </div>
          <div className="config-item">
            <label>Advertiser</label>
            <input
              type="text"
              value={campaignAdvertiser}
              onChange={(e) => setCampaignAdvertiser(e.target.value)}
              placeholder="e.g., TacoBell"
              className="config-input"
            />
          </div>
          <div className="config-item">
            <button onClick={handleUpdateCampaignInfo} className="btn btn-secondary">
              Update & Regenerate All Names
            </button>
          </div>
        </div>
      </div>

      {/* Flights Table */}
      <div className="flights-section">
        <div className="flights-header">
          <h2>Flights ({editedFlights.length})</h2>
          <button onClick={handleAddFlight} className="btn btn-secondary btn-small">
            + Add Flight
          </button>
        </div>

        {/* Bulk Actions Toolbar */}
        {selectedFlights.size > 0 && (
          <div className="bulk-actions-toolbar">
            <div className="bulk-selection-info">
              {selectedFlights.size} flight(s) selected
            </div>
            <div className="bulk-actions-grid">
              <div className="bulk-action-row">
                <input
                  type="text"
                  value={bulkFlightName}
                  onChange={(e) => setBulkFlightName(e.target.value)}
                  placeholder="Flight Name (e.g., SummerLaunch) - leave blank to clear"
                  className="bulk-input"
                />
                <button onClick={handleBulkAssignFlightNameOnly} className="btn btn-secondary btn-small">
                  Assign Flight Name
                </button>
              </div>
              <div className="bulk-action-row">
                <input
                  type="text"
                  value={bulkTargeting}
                  onChange={(e) => setBulkTargeting(e.target.value)}
                  placeholder="Targeting (e.g., National) - leave blank to clear"
                  className="bulk-input"
                />
                <button onClick={handleBulkAssignTargetingOnly} className="btn btn-secondary btn-small">
                  Assign Targeting
                </button>
              </div>
              <div className="bulk-action-row">
                <SearchableSelect
                  value={bulkProduct}
                  onChange={setBulkProduct}
                  options={PRODUCT_OPTIONS}
                  placeholder="Choose Product"
                  className="bulk-product-select"
                />
                <button onClick={handleBulkAssignProduct} className="btn btn-secondary btn-small">
                  Assign Product
                </button>
              </div>
              <div className="bulk-action-row bulk-action-buttons">
                <button onClick={handleGenerateFlightNames} className="btn btn-primary btn-small">
                  Generate Names
                </button>
                <button onClick={handleBulkDelete} className="btn btn-secondary btn-small delete-btn">
                  Delete Selected
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flights-table-container">
          <table className="flights-table">
            <thead>
              <tr>
                <th className="checkbox-column">
                  <input
                    type="checkbox"
                    checked={selectedFlights.size === editedFlights.length && editedFlights.length > 0}
                    onChange={handleSelectAll}
                    title="Select all"
                  />
                </th>
                <th>Status</th>
                <th>Generated Flight Name</th>
                <th>Flight Name</th>
                <th>Targeting</th>
                <th>Start</th>
                <th>End</th>
                <th>Units</th>
                <th>Rate (CPM)</th>
                <th>Cost</th>
                <th>Currency</th>
                <th>Product</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {editedFlights.map((flight, index) => (
                <tr 
                  key={index} 
                  className={`
                    ${flight.needs_review ? 'needs-review' : ''} 
                    ${flight.isEdited ? 'edited' : ''}
                    ${flight.isReviewed ? 'reviewed' : ''}
                    ${selectedFlights.has(index) ? 'selected' : ''}
                  `}
                >
                  <td className="checkbox-column">
                    <input
                      type="checkbox"
                      checked={selectedFlights.has(index)}
                      onChange={(e) => {
                        handleSelectFlight(index, (e.nativeEvent as MouseEvent).shiftKey);
                      }}
                    />
                  </td>
                  <td>
                    <div className="status-cell">
                      <span className={`status-badge ${flight.status}`}>
                        {flight.status}
                      </span>
                      <span className="confidence-badge small">
                        {(flight.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="generated-name-cell">
                    <div className="generated-name-display">
                      {flight.generatedName || 'N/A'}
                    </div>
                  </td>
                  <td>
                    <input
                      type="text"
                      value={flight.flightName || ''}
                      onChange={(e) => handleFlightChange(index, 'flightName', e.target.value)}
                      className="flight-input"
                      placeholder="e.g., SummerLaunch"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={flight.targeting || ''}
                      onChange={(e) => handleFlightChange(index, 'targeting', e.target.value)}
                      className="flight-input"
                      placeholder="e.g., National"
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={flight.start || ''}
                      onChange={(e) => handleFlightChange(index, 'start', e.target.value)}
                      className="flight-input"
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={flight.end || ''}
                      onChange={(e) => handleFlightChange(index, 'end', e.target.value)}
                      className="flight-input"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={flight.units || ''}
                      onChange={(e) => handleFlightChange(index, 'units', parseInt(e.target.value))}
                      className="flight-input"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      value={flight.rate_cpm || ''}
                      onChange={(e) => handleFlightChange(index, 'rate_cpm', parseFloat(e.target.value))}
                      className="flight-input"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      value={flight.cost || ''}
                      onChange={(e) => handleFlightChange(index, 'cost', parseFloat(e.target.value))}
                      className="flight-input"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={flight.currency || ''}
                      onChange={(e) => handleFlightChange(index, 'currency', e.target.value)}
                      className="flight-input"
                      maxLength={3}
                    />
                  </td>
                  <td>
                    <SearchableSelect
                      value={flight.product || 'Choose Product'}
                      onChange={(value) => handleFlightChange(index, 'product', value)}
                      options={PRODUCT_OPTIONS}
                      placeholder="Choose Product"
                      className="flight-select"
                    />
                  </td>
                  <td>
                    <div className="flight-actions">
                      {flight.needs_review && !flight.isReviewed && !flight.isEdited && (
                        <button
                          onClick={() => handleFlightReview(index)}
                          className="review-btn"
                          title={flight.reason || 'Mark as reviewed'}
                        >
                          Review
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteFlight(index)}
                        className="delete-btn"
                        title="Delete flight"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      <div className="actions-section">
        <button onClick={handleSave} className="btn btn-secondary">
          Save Draft
        </button>
        <button
          onClick={handlePush}
          disabled={!canPush || pushStatus === 'pushing' || isPushed}
          className="btn btn-primary"
        >
          {isPushed ? 'Already Pushed to AOS' : pushStatus === 'pushing' ? 'Pushing...' : 'Push to AOS'}
        </button>
      </div>

      {/* Push Status Messages */}
      {pushStatus === 'success' && (
        <div className="status-message success">
          Successfully pushed to AOS!
        </div>
      )}
      {pushStatus === 'error' && (
        <div className="status-message error">
          ✗ Push failed: {errorMessage}
        </div>
      )}

      {/* Debug Section */}
      <div className="debug-section">
        <button onClick={() => setShowDebug(!showDebug)} className="debug-toggle">
          {showDebug ? '▼' : '▶'} Debug Info
        </button>
        {showDebug && (
          <pre className="debug-output">
            {JSON.stringify({ fields: editedFields, flights: editedFlights }, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// Field Editor Component
interface FieldEditorProps {
  field: EditedField;
  onChange: (fieldName: string, newValue: any) => void;
  onReview: (fieldName: string) => void;
  formatFieldName: (field: string) => string;
}

function FieldEditor({ field, onChange, onReview, formatFieldName }: FieldEditorProps) {
  const getInputType = (fieldName: string) => {
    if (fieldName.includes('date')) return 'date';
    if (fieldName.includes('spend') || fieldName.includes('impressions') || fieldName.includes('cap')) {
      return 'number';
    }
    return 'text';
  };

  return (
    <div className={`field-item ${field.isEdited ? 'edited' : ''} ${field.isReviewed ? 'reviewed' : ''}`}>
      <div className="field-header">
        <label className="field-label">
          {formatFieldName(field.field)}
          {requiredFields.includes(field.field) && <span className="required">*</span>}
        </label>
        <div className="field-badges">
          <span className={`status-badge ${field.status}`}>{field.status}</span>
          <span className="confidence-badge">{(field.confidence * 100).toFixed(0)}%</span>
        </div>
      </div>
      <input
        type={getInputType(field.field)}
        value={field.value ?? ''}
        onChange={(e) => onChange(field.field, e.target.value)}
        className="field-input"
      />
      {field.reason && (
        <div className="field-reason">
          {field.reason}
        </div>
      )}
      {field.needs_review && !field.isReviewed && !field.isEdited && (
        <button onClick={() => onReview(field.field)} className="review-btn">
          Mark as Reviewed
        </button>
      )}
    </div>
  );
}

const requiredFields = [
  'advertiser_name',
  'agency_name',
  'total_campaign_spend',
  'total_contracted_impressions',
  'po_number'
];

// Searchable Select Component
interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

function SearchableSelect({ value, onChange, options, placeholder = 'Choose...', className = '' }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter(option =>
    option.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (option: string) => {
    onChange(option);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className={`searchable-select ${className}`} ref={wrapperRef}>
      <div className="searchable-select-control" onClick={() => setIsOpen(!isOpen)}>
        <span className={value === placeholder ? 'placeholder' : ''}>
          {value || placeholder}
        </span>
        <span className="dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
      </div>
      {isOpen && (
        <div className="searchable-select-dropdown">
          <input
            type="text"
            className="searchable-select-search"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
          <div className="searchable-select-options">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => (
                <div
                  key={index}
                  className={`searchable-select-option ${option === value ? 'selected' : ''}`}
                  onClick={() => handleSelect(option)}
                >
                  {option}
                </div>
              ))
            ) : (
              <div className="searchable-select-no-results">No results found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

