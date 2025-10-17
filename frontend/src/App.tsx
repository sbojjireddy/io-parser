import { useState } from 'react';
import MainPage from './components/MainPage';
import ResultsDisplay from './components/ResultsDisplay';
import PushToSystemsTab from './components/PushToSystemsTab';
import type { IOData } from './types';
import './App.css';

// Simplified data types
interface SimplifiedData {
  fields: Array<{
    field: string;
    value: any;
    confidence: number;
    status: 'use' | 'review' | 'reject';
    needs_review: boolean;
    reason?: string;
  }>;
  flights: Array<{
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
  }>;
  overall_confidence: number;
  needs_review: boolean;
  summary: {
    total_fields: number;
    use_count: number;
    review_count: number;
    reject_count: number;
  };
}

function App() {
  const [extractedData, setExtractedData] = useState<IOData | null>(null);
  const [simplifiedData, setSimplifiedData] = useState<SimplifiedData | null>(null);
  const [activeTab, setActiveTab] = useState<'results' | 'push'>('results');

  const handleExtractionComplete = (fullData: IOData, simplified: SimplifiedData) => {
    setExtractedData(fullData);
    setSimplifiedData(simplified);
  };

  const handleExtractionError = (error: string) => {
    console.error('Extraction error:', error);
    setExtractedData(null);
    setSimplifiedData(null);
  };

  return (
    <div className="app">
      <MainPage 
        onExtractionComplete={handleExtractionComplete}
        onExtractionError={handleExtractionError}
      />
      
      {extractedData && simplifiedData && (
        <div className="results-container">
          <div className="tabs">
            <button 
              className={`tab ${activeTab === 'results' ? 'active' : ''}`}
              onClick={() => setActiveTab('results')}
            >
              📊 Results & Confidence
            </button>
            <button 
              className={`tab ${activeTab === 'push' ? 'active' : ''}`}
              onClick={() => setActiveTab('push')}
            >
              🚀 Push to Systems
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'results' && (
              <ResultsDisplay data={extractedData} />
            )}
            {activeTab === 'push' && (
              <PushToSystemsTab simplifiedData={simplifiedData} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
