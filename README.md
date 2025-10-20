# Tubi IO Parser

PDF insertion order parser with confidence scoring and flight logic processing.

## Setup

1. **Backend**
   ```bash
   cd backend
   npm install
   touch .env  # Add OPENAI_API_KEY=key
   npm run dev
   ```

2. **Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Python Dependencies**
   ```bash
   # Virtual environment (recommended)
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

## Usage

1. Start backend: `cd backend && npm run dev`
2. Start frontend: `cd frontend && npm run dev`
3. Open http://localhost:5173
4. Upload PDF and process
5. Review parsed results with confidence analysis
6. Edit fields and flights as needed
7. Generate standardized flight names
8. Push to AOS Unified Planner

## Pipeline Stages

- **Stage 1**: Text extraction (OpenAI + PyMuPDF)
- **Stage 2**: JSON parsing with structured outputs
- **Stage 3**: Flight logic and month boundary processing
- **Stage 4**: Confidence scoring and final output

## Environment Variables

- `OPENAI_API_KEY`: Required for text extraction and parsing
- `PYTHON_PATH`: Optional, defaults to system python3
- `AOS_API_KEY`: Required for AOS integration
- `PITCH_USER_ID`: Required for AOS token minting
- `PITCH_PASS`: Required for AOS token minting

## Output

Final results saved to `backend/data/combined/{sha}.json` with confidence scores and field-level analysis.
