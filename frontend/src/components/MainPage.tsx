import { useState } from 'react';
import type { IOData } from '../types';
import './MainPage.css';

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

interface MainPageProps {
  onExtractionComplete: (fullData: IOData, simplified: SimplifiedData) => void;
  onExtractionError: (error: string) => void;
}

const MainPage: React.FC<MainPageProps> = ({ onExtractionComplete, onExtractionError }) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFileChange = (selectedFile: File) => {
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setResult(null);
      setError(null);
    } else {
      setError('Please select a valid PDF file.');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileChange(selectedFile);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:3001/api/process-pipeline', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setResult(data);
      onExtractionComplete(data.fullData, data.data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setError(errorMessage);
      onExtractionError(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="main-page">
      <div className="header">
        <div className="logo">Tubi IO Parser</div>
      </div>

      <div className="main-content">
        <div className="content-card">
          <h1>Prompt-Engineered Parser</h1>
          <p>Uses advanced prompt engineering with structured outputs for high-quality extraction.</p>
          
          <div 
            className={`upload-area ${dragActive ? 'drag-active' : ''} ${file ? 'has-file' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="upload-icon">📁</div>
            <h3>Upload I/O Documents</h3>
            <p>Drag and drop files here, or click to select files.</p>
            <p className="supported-formats">Supported formats: PDF</p>
            
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileInputChange}
              className="file-input"
              id="file-input"
            />
            <label htmlFor="file-input" className="select-files-btn">
              Select Files
            </label>
          </div>

          {file && (
            <div className="file-info">
              <div className="file-details">
                <span className="file-name">📄 {file.name}</span>
                <span className="file-size">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
              </div>
              <button onClick={clearFile} className="clear-file-btn">
                ✕
              </button>
            </div>
          )}

          {file && (
            <div className="process-section">
              <button 
                onClick={handleUpload} 
                disabled={uploading}
                className="process-btn"
              >
                {uploading ? (
                  <>
                    <span className="spinner"></span>
                    Processing...
                  </>
                ) : (
                  'Process Document'
                )}
              </button>
            </div>
          )}

          {error && (
            <div className="error-message">
              <h4>Error:</h4>
              <p>{error}</p>
            </div>
          )}

          {result && (
            <div className="pipeline-summary">
              <h3>Processing Complete!</h3>
              <div className="summary-grid">
                <div className="summary-item">
                  <strong>File:</strong> {result.filename}
                </div>
                <div className="summary-item">
                  <strong>Order Number:</strong> {result.pipeline.stage1.pymupdf.orderNumber || 'Not found'}
                </div>
                <div className="summary-item">
                  <strong>Advertiser:</strong> {result.pipeline.stage4.advertiser}
                </div>
                <div className="summary-item">
                  <strong>Agency:</strong> {result.pipeline.stage4.agency}
                </div>
                <div className="summary-item">
                  <strong>Flights:</strong> {result.pipeline.stage4.flights} segments
                </div>
                <div className="summary-item">
                  <strong>Confidence:</strong> {(result.pipeline.stage4.overallScore * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="footer">
        <p>© 2024 Tubi Prompt-Engineered IO Parser.</p>
      </div>
    </div>
  );
};

export default MainPage;
