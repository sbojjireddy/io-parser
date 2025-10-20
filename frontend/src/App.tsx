import { useState } from 'react';
import MainPage from './components/MainPage';
import ResultsDisplay from './components/ResultsDisplay';
import PushToSystemsTab from './components/PushToSystemsTab';
import type { IOData, SimplifiedData } from './types';
import './App.css';

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
                    Results & Confidence
                  </button>
                  <button 
                    className={`tab ${activeTab === 'push' ? 'active' : ''}`}
                    onClick={() => setActiveTab('push')}
                  >
                    Push to Systems
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
