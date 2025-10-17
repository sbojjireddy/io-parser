import { useState, useMemo } from 'react';
import './PushToSystemsTab.css';

// Types matching the simplified output format
interface SimplifiedField {
  field: string;
  value: any;
  confidence: number;
  status: 'use' | 'review' | 'reject';
  needs_review: boolean;
  reason?: string;
}

interface SimplifiedFlight {
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

interface SimplifiedData {
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

interface PushToSystemsTabProps {
  simplifiedData: SimplifiedData;
  onSave?: (editedData: SimplifiedData) => void;
  onPush?: (payload: any) => Promise<void>;
}

interface EditedField extends SimplifiedField {
  isEdited?: boolean;
  isReviewed?: boolean;
}

interface EditedFlight extends SimplifiedFlight {
  isEdited?: boolean;
  isReviewed?: boolean;
  product?: string;
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
  }, [editedFields, editedFlights]);

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

  const handlePush = async () => {
    if (!canPush) return;

    setPushStatus('pushing');
    setErrorMessage('');

    // Build payload
    const campaignFields: any = {};
    editedFields.forEach(field => {
      campaignFields[field.field] = field.value;
    });

    const payload = {
      meta: {
        timestamp: new Date().toISOString(),
        source: 'tubi_io_parser',
        overall_confidence: simplifiedData.overall_confidence
      },
      campaign: campaignFields,
      flights: editedFlights.map(f => ({
        placement_id: f.placement_id,
        name: f.name,
        start: f.start,
        end: f.end,
        units: f.units,
        unit_type: f.unit_type,
        rate_cpm: f.rate_cpm,
        cost_method: f.cost_method,
        cost: f.cost,
        currency: f.currency,
        product: f.product
      }))
    };

    try {
      if (onPush) {
        await onPush(payload);
      } else {
        // Default: send to AOS endpoint
        const response = await fetch('http://localhost:3001/api/push-to-aos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error('Push failed: bad response');
        }
      }

      setPushStatus('success');
      setTimeout(() => setPushStatus('idle'), 3000);
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
              <span>✓ Ready to push</span>
            ) : (
              <span>⚠ {validationErrors.length} items need attention</span>
            )}
          </div>
        </div>
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="validation-errors">
          <h3>⚠ Issues to Resolve:</h3>
          <ul>
            {validationErrors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Fields Section */}
      <div className="fields-section">
        <h2>Campaign Fields</h2>

        {/* Reject Fields */}
        {rejectFields.length > 0 && (
          <div className="field-group reject-group">
            <h3>🚫 Rejected Fields (Must Edit)</h3>
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
            <h3>⚠ Review Required</h3>
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
            <h3>✓ Ready to Use</h3>
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
        <h2>Flights ({editedFlights.length})</h2>
        <div className="flights-table-container">
          <table className="flights-table">
            <thead>
              <tr>
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
                  `}
                >
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
                      <option value="Product A">Product A</option>
                      <option value="Product B">Product B</option>
                    </select>
                  </td>
                  <td>
                    {flight.needs_review && !flight.isReviewed && !flight.isEdited && (
                      <button
                        onClick={() => handleFlightReview(index)}
                        className="review-btn"
                        title={flight.reason || 'Mark as reviewed'}
                      >
                        ✓ Review
                      </button>
                    )}
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
          💾 Save Draft
        </button>
        <button
          onClick={handlePush}
          disabled={!canPush || pushStatus === 'pushing'}
          className="btn btn-primary"
        >
          {pushStatus === 'pushing' ? '⏳ Pushing...' : '🚀 Push to AOS'}
        </button>
      </div>

      {/* Push Status Messages */}
      {pushStatus === 'success' && (
        <div className="status-message success">
          ✓ Successfully pushed to AOS!
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
          ℹ️ {field.reason}
        </div>
      )}
      {field.needs_review && !field.isReviewed && !field.isEdited && (
        <button onClick={() => onReview(field.field)} className="review-btn">
          ✓ Mark as Reviewed
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

