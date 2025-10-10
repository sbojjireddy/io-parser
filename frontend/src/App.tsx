import { useState } from 'react'
import './App.css'

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setResult(null)
      setError(null)
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('http://localhost:3001/api/process-pipeline', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="app">
      <h1>PDF IO Parser</h1>
      <p>Upload a PDF to run through the parsing pipeline (Text Extraction + Complete Processing)</p>
      
      <div className="upload-section">
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          disabled={uploading}
        />
        <button 
          onClick={handleUpload} 
          disabled={!file || uploading}
          className="upload-button"
        >
          {uploading ? 'Processing...' : 'Process PDF'}
        </button>
      </div>

      {error && (
        <div className="error">
          <h3>Error:</h3>
          <p>{error}</p>
        </div>
      )}

      {result && (
        <div className="result">
          <h2>Pipeline Results</h2>
          
          <div className="pipeline-summary">
            <h3>Pipeline Summary</h3>
            <div className="summary-grid">
              <div className="summary-item">
                <strong>File:</strong> {result.filename}
              </div>
              <div className="summary-item">
                <strong>SHA256:</strong> {result.sha256}
              </div>
              <div className="summary-item">
                <strong>Stage 1:</strong> OpenAI ({result.pipeline.stage1.openai.textLength} chars), PyMuPDF ({result.pipeline.stage1.pymupdf.textLength} chars)
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
                <strong>Flights:</strong> {result.pipeline.stage4.flights} flight segments
              </div>
              <div className="summary-item">
                <strong>Overall Score:</strong> {(result.pipeline.stage4.overallScore * 100).toFixed(1)}%
              </div>
              <div className="summary-item">
                <strong>Confidence:</strong> Use: {result.pipeline.stage4.useCount}, Review: {result.pipeline.stage4.reviewCount}, Reject: {result.pipeline.stage4.rejectCount}
              </div>
            </div>
          </div>

          <div className="json-output">
            <h3>Final JSON Output</h3>
            <pre>{JSON.stringify(result.finalData, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
