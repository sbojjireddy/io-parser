import { useState } from 'react';
import MainPage from './components/MainPage';
import ResultsDisplay from './components/ResultsDisplay';
import type { IOData } from './types';
import './App.css';

function App() {
  const [extractedData, setExtractedData] = useState<IOData | null>(null);

  const handleExtractionComplete = (data: IOData) => {
    setExtractedData(data);
  };

  const handleExtractionError = (error: string) => {
    console.error('Extraction error:', error);
    setExtractedData(null);
  };

  return (
    <div className="app">
      <MainPage 
        onExtractionComplete={handleExtractionComplete}
        onExtractionError={handleExtractionError}
      />
      
      {extractedData && (
        <ResultsDisplay data={extractedData} />
      )}
    </div>
  );
}

export default App;
