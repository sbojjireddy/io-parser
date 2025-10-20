# Tubi IO Parser

PDF insertion order parser with confidence scoring and flight logic processing.

## Setup

### Option 1: Docker (Recommended)

```bash
# 1. Set environment variables
export OPENAI_API_KEY=your_key
export AOS_API_KEY=your_key
export PITCH_USER_ID=your_user
export PITCH_PASS=your_pass

# 2. Build and run
docker-compose up -d

# 3. Access at http://localhost:8080
```

### Option 2: Local Development

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

### Docker
- Access at http://localhost:8080
- View logs: `docker-compose logs -f`
- Stop: `docker-compose down`

### Local Development
1. Start backend: `cd backend && npm run dev`
2. Start frontend: `cd frontend && npm run dev`
3. Open http://localhost:5173

### Workflow
1. Upload PDF and process
2. Review parsed results with confidence analysis
3. Edit fields and flights as needed
4. Generate standardized flight names
5. Push to AOS Unified Planner

## Pipeline Stages

- **Stage 1**: Text extraction (OpenAI + PyMuPDF)
- **Stage 2**: JSON parsing with structured outputs
- **Stage 3**: Flight logic and month boundary processing
- **Stage 4**: Confidence scoring and final output

## Cloud Run Deployment

```bash
# 1. Set your GCP project
gcloud config set project YOUR_PROJECT_ID

# 2. Build and deploy
gcloud run deploy tubi-io-parser \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars OPENAI_API_KEY=$OPENAI_API_KEY,AOS_API_KEY=$AOS_API_KEY,PITCH_USER_ID=$PITCH_USER_ID,PITCH_PASS=$PITCH_PASS \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --max-instances 10

# 3. View service URL
gcloud run services describe tubi-io-parser --region us-central1 --format 'value(status.url)'
```

**Important Notes for Cloud Run:**
- Data is ephemeral (written to `/tmp`)
- For production, integrate with Google Cloud Storage for persistence
- Health check endpoint: `/api/health`
- Port 8080 is required (configured in Dockerfile)

## Environment Variables

- `OPENAI_API_KEY`: Required for text extraction and parsing
- `PYTHON_PATH`: Optional, defaults to /usr/bin/python3
- `AOS_API_KEY`: Required for AOS integration
- `PITCH_USER_ID`: Required for AOS token minting
- `PITCH_PASS`: Required for AOS token minting
- `PORT`: Port to run on (default 8080 for Cloud Run)

## Output

**Local/Docker:** Results saved to `backend/data/combined/{sha}.json`  
**Cloud Run:** Results are ephemeral in `/tmp` - integrate with Cloud Storage for persistence
