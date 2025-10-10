import { useState } from 'react';
import type { IOData } from '../types';
import './ResultsDisplay.css';

// Detailed confidence display component
const ConfidenceDisplay: React.FC<{ confidence: any }> = ({ confidence }) => {
  const [expandedField, setExpandedField] = useState<string | null>(null);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'use': return '#22c55e';
      case 'review': return '#f59e0b';
      case 'reject': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'use': return '✅';
      case 'review': return '⚠️';
      case 'reject': return '❌';
      default: return '❓';
    }
  };

  const formatFieldName = (fieldName: string) => {
    return fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className="confidence-display">
      <div className="confidence-header">
        <h5>🎯 Field Confidence Analysis</h5>
        <div className="overall-score">
          <span>Overall: </span>
          <span style={{ color: getStatusColor(confidence.overall_score >= 0.85 ? 'use' : confidence.overall_score >= 0.55 ? 'review' : 'reject') }}>
            {(confidence.overall_score * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="confidence-summary">
        <div className="summary-stats">
          <span className="stat-item use">✅ {confidence.summary.use_count} Use</span>
          <span className="stat-item review">⚠️ {confidence.summary.review_count} Review</span>
          <span className="stat-item reject">❌ {confidence.summary.reject_count} Reject</span>
        </div>
      </div>

      <div className="field-confidences">
        {confidence.field_confidences.map((fieldConf: any) => (
          <div key={fieldConf.field} className="field-confidence-item">
            <div 
              className="field-confidence-header"
              onClick={() => setExpandedField(expandedField === fieldConf.field ? null : fieldConf.field)}
            >
              <div>
                <span>{getStatusIcon(fieldConf.status)}</span>
                <span style={{ fontWeight: 'bold' }}>{formatFieldName(fieldConf.field)}</span>
                <span style={{ color: getStatusColor(fieldConf.status), fontSize: '0.8em', fontWeight: 'bold' }}>
                  {fieldConf.status.toUpperCase()}
                </span>
              </div>
              <div>
                <div className="confidence-progress-bar">
                  <div 
                    className="confidence-progress-fill"
                    style={{ 
                      width: `${fieldConf.confidence_score * 100}%`,
                      backgroundColor: getStatusColor(fieldConf.status)
                    }}
                  ></div>
                </div>
                <span className="confidence-percentage">
                  {(fieldConf.confidence_score * 100).toFixed(1)}%
                </span>
                <span className="expand-icon">{expandedField === fieldConf.field ? '▼' : '▶'}</span>
              </div>
            </div>

            {expandedField === fieldConf.field && (
              <div className="field-confidence-details">
                <div className="component-scores">
                  <div className="component-scores-header">Component Scores:</div>
                  {fieldConf.components.map((component: any, index: number) => (
                    <div key={index} className="component-item">
                      <div className="component-header">
                        <span>{component.name.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</span>
                        <span>{(component.score * 100).toFixed(1)}%</span>
                      </div>
                      {component.notes && (
                        <div className="component-notes">
                          {component.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                {fieldConf.values_across_runs && fieldConf.values_across_runs.length > 0 && (
                  <div className="multi-run-analysis">
                    <div className="multi-run-header">
                      🔍 Values Across {fieldConf.values_across_runs.length} Runs:
                    </div>
                    {fieldConf.values_across_runs.map((value: any, runIndex: number) => (
                      <div key={runIndex} className="run-value">
                        <strong>Run {runIndex + 1}:</strong> {
                          value === null || value === undefined 
                            ? <span className="null-value">null</span>
                            : <span className="value-content">{JSON.stringify(value)}</span>
                        }
                      </div>
                    ))}
                    <div className="consistency-indicator">
                      {fieldConf.values_across_runs.filter((v: any) => v !== null && v !== undefined).length === fieldConf.values_across_runs.length 
                        ? new Set(fieldConf.values_across_runs.map((v: any) => JSON.stringify(v))).size === 1
                          ? '✅ All runs consistent'
                          : '⚠️ Values differ across runs'
                        : '❓ Some runs returned null'
                      }
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

interface ResultsDisplayProps {
  data: IOData;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ data }) => {
  const [viewMode, setViewMode] = useState<'formatted' | 'json'>('formatted');
  const [copied, setCopied] = useState(false);

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Not specified';
    
    try {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        const [year, month, day] = dateString.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }
      
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const downloadJSON = () => {
    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'io-data.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="results-display">
      <div className="results-header">
        <h3>Extracted I/O Information</h3>
        <div className="view-controls">
          <button
            className={`view-btn ${viewMode === 'formatted' ? 'active' : ''}`}
            onClick={() => setViewMode('formatted')}
          >
            Formatted View
          </button>
          <button
            className={`view-btn ${viewMode === 'json' ? 'active' : ''}`}
            onClick={() => setViewMode('json')}
          >
            JSON View
          </button>
        </div>
        <div className="export-controls">
          <button
            className="copy-btn"
            onClick={copyToClipboard}
            title="Copy to clipboard"
          >
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
          <button
            className="download-btn"
            onClick={downloadJSON}
            title="Download as JSON file"
          >
            💾 Download
          </button>
        </div>
      </div>

      {viewMode === 'formatted' ? (
        <div className="formatted-results">
          <div className="io-card">
            <div className="io-header">
              <h4>{data.advertiser_name || 'Unnamed Advertiser'}</h4>
              {data.agency_name && (
                <span className="account-badge">{data.agency_name}</span>
              )}
            </div>

            <div className="io-details">
              <div className="detail-section">
                <h5>📅 Campaign Flight</h5>
                <div className="flight-dates">
                  <div className="date-item">
                    <strong>Start:</strong> {formatDate((data.campaign_total_flight?.start || data.start) ?? null)}
                  </div>
                  <div className="date-item">
                    <strong>End:</strong> {formatDate((data.campaign_total_flight?.end || data.end) ?? null)}
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h5>🏢 Account Information</h5>
                <div className="account-info">
                  <div className="info-item">
                    <strong>Advertiser:</strong> {data.advertiser_name || 'Not specified'}
                  </div>
                  <div className="info-item">
                    <strong>Agency:</strong> {data.agency_name || 'Not specified'}
                  </div>
                  <div className="info-item">
                    <strong>Account Executive:</strong> {data.account_executive_name || 'Not specified'}
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h5>💰 Financial Information</h5>
                <div className="financial-info">
                  <div className="amount-item">
                    <strong>Total Campaign Spend:</strong> {data.total_campaign_spend ? `${data.currency === 'USD' ? '$' : data.currency || '$'}${data.total_campaign_spend.toLocaleString()}` : 'Not specified'}
                  </div>
                  <div className="amount-item">
                    <strong>Total Impressions:</strong> {data.total_contracted_impressions ? data.total_contracted_impressions.toLocaleString() : 'Not specified'}
                  </div>
                  <div className="amount-item">
                    <strong>Currency:</strong> {data.currency || 'Not specified'}
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h5>📋 Order Information</h5>
                <div className="order-info">
                  <div className="info-item">
                    <strong>PO Number:</strong> {data.po_number || 'Not specified'}
                  </div>
                  <div className="info-item">
                    <strong>Frequency Cap:</strong> {data.frequency_cap}
                  </div>
                  <div className="info-item">
                    <strong>Period:</strong> {data.period?.start && data.period?.end ? `${data.period.start} - ${data.period.end}` : 'Not specified'}
                  </div>
                </div>
              </div>

              {data.flights && data.flights.length > 0 && (
                <div className="detail-section">
                  <h5>🛫 Flight Line Items</h5>
                  <div className="flights-info">
                    <div className="flights-table-container">
                      <table className="flights-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Placement ID</th>
                            <th>Name</th>
                            <th>Flight Dates</th>
                            <th>Units</th>
                            <th>Rate (CPM)</th>
                            <th>Cost</th>
                            <th>Currency</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.flights.map((flight, idx) => (
                            <tr key={idx} className="flight-row">
                              <td className="flight-index">{flight.index || idx + 1}</td>
                              <td className="placement-id">
                                {flight.placement_id ? (
                                  <code>{flight.placement_id}</code>
                                ) : (
                                  <span className="not-specified">N/A</span>
                                )}
                              </td>
                              <td className="flight-name">
                                {flight.name || <span className="not-specified">Unnamed Flight</span>}
                              </td>
                              <td className="flight-dates">
                                {flight.start && flight.end ? (
                                  <div className="date-range">
                                    <div className="start-date">{formatDate(flight.start)}</div>
                                    <div className="date-separator">→</div>
                                    <div className="end-date">{formatDate(flight.end)}</div>
                                  </div>
                                ) : (
                                  <span className="not-specified">Not specified</span>
                                )}
                              </td>
                              <td className="flight-units">
                                {flight.units ? (
                                  <div>
                                    <div className="units-number">{flight.units.toLocaleString()}</div>
                                    <div className="units-type">{flight.unit_type || 'Impressions'}</div>
                                  </div>
                                ) : (
                                  <span className="not-specified">N/A</span>
                                )}
                              </td>
                              <td className="flight-rate">
                                {flight.rate_cpm ? (
                                  <div>
                                    <div className="rate-amount">${flight.rate_cpm.toFixed(2)}</div>
                                    <div className="rate-method">{flight.cost_method || 'CPM'}</div>
                                  </div>
                                ) : (
                                  <span className="not-specified">N/A</span>
                                )}
                              </td>
                              <td className="flight-cost">
                                {flight.cost ? (
                                  <div className="cost-amount">
                                    {flight.currency === 'USD' ? '$' : flight.currency || '$'}
                                    {flight.cost.toLocaleString()}
                                  </div>
                                ) : (
                                  <span className="not-specified">N/A</span>
                                )}
                              </td>
                              <td className="flight-currency">
                                {flight.currency || <span className="not-specified">N/A</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    <div className="flights-summary">
                      <div className="summary-stats">
                        <div className="stat-item">
                          <strong>Total Flights:</strong> {data.flights.length}
                        </div>
                        <div className="stat-item">
                          <strong>Total Flight Cost:</strong> {
                            data.flights.reduce((total, flight) => total + (flight.cost || 0), 0) > 0 
                              ? `$${data.flights.reduce((total, flight) => total + (flight.cost || 0), 0).toLocaleString()}`
                              : 'Not calculated'
                          }
                        </div>
                        <div className="stat-item">
                          <strong>Total Flight Units:</strong> {
                            data.flights.reduce((total, flight) => total + (flight.units || 0), 0) > 0 
                              ? data.flights.reduce((total, flight) => total + (flight.units || 0), 0).toLocaleString()
                              : 'Not calculated'
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {data.explanation && (
                <div className="detail-section">
                  <h5>📝 Extraction Explanation</h5>
                  <div className="explanation-info">
                    <div className="info-item">
                      <strong>Summary:</strong> {data.explanation.summary || 'No summary provided'}
                    </div>
                    {data.explanation.assumptions && data.explanation.assumptions.length > 0 && (
                      <div className="info-item">
                        <strong>Assumptions:</strong>
                        <ul>
                          {data.explanation.assumptions.map((assumption, idx) => (
                            <li key={idx}>{assumption}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {data.explanation.omissions && data.explanation.omissions.length > 0 && (
                      <div className="info-item">
                        <strong>Omissions:</strong>
                        <ul>
                          {data.explanation.omissions.map((omission, idx) => (
                            <li key={idx}>{omission}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {data.provenance && data.provenance.length > 0 && (
                <div className="detail-section">
                  <h5>🔍 Data Provenance</h5>
                  <div className="provenance-info">
                    {data.provenance.map((prov, idx) => (
                      <div key={idx} className="provenance-item">
                        <div><strong>Field:</strong> {prov.field}</div>
                        <div><strong>Quote:</strong> "{prov.quote}"</div>
                        <div><strong>Location:</strong> {prov.location_hint}</div>
                        {prov.find_confidence_interval && (
                          <div><strong>Find Confidence:</strong> {prov.find_confidence_interval[0]}-{prov.find_confidence_interval[1]}%</div>
                        )}
                        {prov.value_confidence_interval && (
                          <div><strong>Value Confidence:</strong> {prov.value_confidence_interval[0]}-{prov.value_confidence_interval[1]}%</div>
                        )}
                        {prov.rationale && (
                          <div><strong>Rationale:</strong> {prov.rationale}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.confidence && (
                <div className="detail-section">
                  <ConfidenceDisplay confidence={data.confidence} />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="json-results">
          <pre className="json-content">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default ResultsDisplay;
