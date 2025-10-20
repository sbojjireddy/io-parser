import { useState, useMemo } from 'react';
import type { SimplifiedData, EditedField, EditedFlight } from '../types';
import './PushToSystemsTab.css';

interface PushToSystemsTabProps {
  simplifiedData: SimplifiedData;
  onSave?: (editedData: SimplifiedData) => void;
  onPush?: (payload: any) => Promise<void>;
}

export default function PushToSystemsTab({ 
  simplifiedData, 
  onSave, 
  onPush 
}: PushToSystemsTabProps) {
  const [editedFields, setEditedFields] = useState<EditedField[]>(
    simplifiedData.fields.map(f => ({ ...f }))
  );
  const [editedFlights, setEditedFlights] = useState<EditedFlight[]>(
    simplifiedData.flights.map(f => ({ ...f, product: 'Choose Product' }))
  );
  const [showDebug, setShowDebug] = useState(false);
  const [pushStatus, setPushStatus] = useState<'idle' | 'pushing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isPushed, setIsPushed] = useState(false);
  const [selectedFlights, setSelectedFlights] = useState<Set<number>>(new Set());
  const [bulkProduct, setBulkProduct] = useState('Choose Product');

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
    if (!aosConfig.dealId) errors.push('Deal ID is required');

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
    } else {
      setSelectedFlights(new Set(editedFlights.map((_, i) => i)));
    }
  };

  const handleSelectFlight = (index: number) => {
    setSelectedFlights(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
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
      const name = flight.name || `Auto Line ${flight.start} to ${flight.end}`;
      const externalLineId = `line-${flight.start}${i ? `-${i+1}` : ''}`;

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
            productId: aosConfig.productId,
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
        const response = await fetch('http://localhost:3001/api/aos/push-workspace', {
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
            <label>Deal ID *</label>
            <input
              type="text"
              value={aosConfig.dealId}
              onChange={(e) => setAosConfig({ ...aosConfig, dealId: e.target.value })}
              placeholder="Enter Deal ID"
              className="config-input"
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
            <div className="bulk-actions">
              <select
                value={bulkProduct}
                onChange={(e) => setBulkProduct(e.target.value)}
                className="bulk-product-select"
              >
                <option value="Choose Product">Choose Product</option>
                <option value="DIO - 1A Targeted Takeover">DR Targeted Video</option>
              </select>
              <button onClick={handleBulkAssignProduct} className="btn btn-secondary btn-small">
                Assign Product
              </button>
              <button onClick={handleBulkDelete} className="btn btn-secondary btn-small delete-btn">
                Delete Selected
              </button>
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
                <th>Placement ID</th>
                <th>Name</th>
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
                      onChange={() => handleSelectFlight(index)}
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
                  <td>
                    <input
                      type="text"
                      value={flight.placement_id || ''}
                      onChange={(e) => handleFlightChange(index, 'placement_id', e.target.value)}
                      className="flight-input"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={flight.name || ''}
                      onChange={(e) => handleFlightChange(index, 'name', e.target.value)}
                      className="flight-input"
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
                    <select
                      value={flight.product || 'Choose Product'}
                      onChange={(e) => handleFlightChange(index, 'product', e.target.value)}
                      className="flight-select"
                    >
                      <option value="Choose Product">Choose Product</option>
                      <option value="DIO - 1A Targeted Takeover">DR Targeted Video</option>
                    </select>
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

