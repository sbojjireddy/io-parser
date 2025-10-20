// required imports
import path from 'path';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import { openai } from '../lib/openai.js';

// Import pipeline functions
import { runStage1 } from '../pipeline/run_stage1.js';
import { runStage4 } from '../pipeline/run_stage4.js';


const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 8080;

// Log environment variables for debugging
console.log('OPENAI_API_KEY set:', !!process.env.OPENAI_API_KEY);

// Serve static frontend files (for Docker/production)
const frontendPath = path.join(process.cwd(), '..', 'frontend', 'dist');
if (fs.existsSync(frontendPath)) {
  console.log('Serving frontend from:', frontendPath);
  app.use(express.static(frontendPath));
} else {
  console.log('Frontend build not found at:', frontendPath);
}

// Configure multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed') as any, false);
    }
  }
});

// Ensure directories exist
const ensureDirectories = () => {
  const dirs = ['data/raw', 'data/logs'];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

// Load cache
const loadCache = () => {
  const cachePath = 'data/logs/uploaded_files_cache.json';
  if (fs.existsSync(cachePath)) {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  }
  return {};
};

// Save cache
const saveCache = (cache: any) => {
  const cachePath = 'data/logs/uploaded_files_cache.json';
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
};

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'ok' });
});

// File upload route
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Compute SHA256
    const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    
    // Ensure directories exist
    ensureDirectories();
    
    // Write file to disk
    const filePath = path.join('data/raw', `${sha256}.pdf`);
    fs.writeFileSync(filePath, req.file.buffer);
    
    // Load cache and check if file already exists
    const cache = loadCache();
    let openaiFileId = cache[sha256]?.openaiFileId;
    
    console.log('Cache loaded:', Object.keys(cache).length, 'entries');
    console.log('File SHA256:', sha256);
    console.log('Already cached:', !!openaiFileId);
    
    // Upload to OpenAI if not cached
    if (!openaiFileId) {
      try {
        // Write file to temp location for OpenAI upload
        const tempFilePath = path.join('data/raw', `temp_${sha256}.pdf`);
        fs.writeFileSync(tempFilePath, req.file.buffer);
        
        // Upload using file path
        const file_obj = await openai.files.create({
          file: fs.createReadStream(tempFilePath) as any,
          purpose: "user_data"
        });
        
        // Clean up temp file
        fs.unlinkSync(tempFilePath);
        openaiFileId = file_obj.id;
        console.log('Successfully uploaded to OpenAI:', openaiFileId);
      } catch (openaiError) {
        console.error('OpenAI upload error:', (openaiError as Error).message);
        openaiFileId = null; // Mark as failed to upload
      }
      
      // Always save cache entry (even if OpenAI upload failed)
      cache[sha256] = {
        openaiFileId,
        filename: req.file.originalname,
        uploadedAt: new Date().toISOString(),
        uploadStatus: openaiFileId ? 'success' : 'failed'
      };
      console.log('Saving cache with new file...');
      saveCache(cache);
    } else {
      // File already cached, update the cache entry with current upload info
      cache[sha256] = {
        ...cache[sha256],
        filename: req.file.originalname,
        lastAccessed: new Date().toISOString()
      };
      console.log('Saving cache with existing file...');
      saveCache(cache);
    }
    
    res.json({
      ok: true,
      sha256,
      path: filePath,
      openaiFileId: openaiFileId || null,
      filename: req.file.originalname
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Full pipeline processing route
app.post('/api/process-pipeline', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('Starting full pipeline processing...');
    
    // Compute SHA256
    const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    
    // Ensure directories exist
    ensureDirectories();
    
    // Write file to disk
    const filePath = path.join('data/raw', `${sha256}.pdf`);
    fs.writeFileSync(filePath, req.file.buffer);
    
    // Load cache and check if file already exists
    const cache = loadCache();
    let openaiFileId = cache[sha256]?.openaiFileId;
    
    console.log('Cache loaded:', Object.keys(cache).length, 'entries');
    console.log('File SHA256:', sha256);
    console.log('Already cached:', !!openaiFileId);
    
    // Upload to OpenAI if not cached
    if (!openaiFileId) {
      try {
        // Write file to temp location for OpenAI upload
        const tempFilePath = path.join('data/raw', `temp_${sha256}.pdf`);
        fs.writeFileSync(tempFilePath, req.file.buffer);
        
        // Upload using file path
        const file_obj = await openai.files.create({
          file: fs.createReadStream(tempFilePath) as any,
          purpose: "user_data"
        });
        
        // Clean up temp file
        fs.unlinkSync(tempFilePath);
        openaiFileId = file_obj.id;
        console.log('Successfully uploaded to OpenAI:', openaiFileId);
      } catch (openaiError) {
        console.error('OpenAI upload error:', (openaiError as Error).message);
        return res.status(500).json({ error: 'Failed to upload to OpenAI' });
      }
      
      // Save cache entry
      cache[sha256] = {
        openaiFileId,
        filename: req.file.originalname,
        uploadedAt: new Date().toISOString(),
        uploadStatus: 'success'
      };
      saveCache(cache);
    }
    
    // Run Stage 1: Text Extraction
    console.log('\n========================================');
    console.log('STAGE 1: TEXT EXTRACTION');
    console.log('========================================');
    const stage1StartTime = Date.now();
    const stage1Result = await runStage1(sha256, filePath, openaiFileId);
    const stage1Time = ((Date.now() - stage1StartTime) / 1000).toFixed(2);
    console.log('\nSTAGE 1 COMPLETE');
    console.log(`   Time: ${stage1Time}s`);
    console.log(`   OpenAI text: ${stage1Result.openai.text.length} characters`);
    console.log(`   PyMuPDF text: ${stage1Result.pymupdf.text.length} characters`);
    console.log(`   Order number: ${stage1Result.pymupdf.orderNumber?.order_number || 'Not found'}`);
    
    // Run Stage 4: Complete Pipeline (includes Stage 2 + Stage 3 + Confidence)
    console.log('\n========================================');
    console.log('STAGE 4: PARSING & CONFIDENCE');
    console.log('   (includes Stage 2: Parse, Stage 3: Flight Logic)');
    console.log('========================================');
    const stage4StartTime = Date.now();
    const stage4Result = await runStage4(
      sha256,
      stage1Result.openai.filePath,
      stage1Result.pymupdf.orderNumber?.order_number
    );
    const stage4Time = ((Date.now() - stage4StartTime) / 1000).toFixed(2);
    console.log('\nSTAGE 4 COMPLETE');
    console.log(`   Time: ${stage4Time}s`);
    console.log(`   Overall confidence: ${(stage4Result.confidenceReport.overall_score * 100).toFixed(1)}%`);
    console.log(`   Fields: ${stage4Result.confidenceReport.summary.use_count} use, ${stage4Result.confidenceReport.summary.review_count} review, ${stage4Result.confidenceReport.summary.reject_count} reject`);
    
    console.log('\n========================================');
    console.log('PIPELINE COMPLETE');
    console.log('========================================');
    
    res.json({
      success: true,
      sha256,
      filename: req.file.originalname,
      openaiFileId,
      pipeline: {
        stage1: {
          openai: { textLength: stage1Result.openai.text.length },
          pymupdf: { 
            textLength: stage1Result.pymupdf.text.length,
            orderNumber: stage1Result.pymupdf.orderNumber?.order_number
          }
        },
        stage4: {
          overallScore: stage4Result.confidenceReport.overall_score,
          useCount: stage4Result.confidenceReport.summary.use_count,
          reviewCount: stage4Result.confidenceReport.summary.review_count,
          rejectCount: stage4Result.confidenceReport.summary.reject_count,
          advertiser: stage4Result.finalData.advertiser_name,
          agency: stage4Result.finalData.agency_name,
          flights: stage4Result.finalData.flights?.length || 0
        }
      },
      // Simplified format (recommended for most use cases)
      data: stage4Result.simplifiedData,
      // Full format with all details (for debugging/advanced use)
      fullData: stage4Result.finalData
    });
    
  } catch (error) {
    console.error('Pipeline processing error:', (error as Error).message);
    res.status(500).json({ 
      error: 'Pipeline processing failed', 
      details: (error as Error).message 
    });
  }
});

// AOS Unified Planner Workspace endpoint
app.post('/api/aos/push-workspace', express.json(), async (req, res) => {
  try {
    const { dealId, operations } = req.body as {
      dealId: string;
      operations: any[];
    };

    console.log('\n========================================');
    console.log('AOS UNIFIED PLANNER PUSH');
    console.log('========================================');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Deal ID:', dealId);
    console.log('Operations count:', operations?.length || 0);

    // Validation
    if (!dealId || !Array.isArray(operations)) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'dealId and operations[] are required'
      });
    }

    // Get credentials from environment (server-side only)
    const apiKey = process.env.AOS_API_KEY;
    const pitchUserId = process.env.PITCH_USER_ID;
    const pitchPassword = process.env.PITCH_PASS;

    if (!apiKey || !pitchUserId || !pitchPassword) {
      console.error('Missing AOS credentials in environment variables');
      return res.status(500).json({ 
        error: 'Server configuration error',
        details: 'AOS credentials not configured (AOS_API_KEY, PITCH_USER_ID, PITCH_PASS required)'
      });
    }

    console.log('\nOperations to create:');
    operations.forEach((op, i) => {
      console.log(`  ${i + 1}. ${op.planDigitalLineRequest?.name || 'Unnamed'}`);
      console.log(`     Period: ${op.planDigitalLineRequest?.period?.startDate} to ${op.planDigitalLineRequest?.period?.endDate}`);
      console.log(`     Units: ${op.planDigitalLineRequest?.rates?.quantity?.toLocaleString()}`);
      console.log(`     CPM: $${op.planDigitalLineRequest?.rates?.netUnitCost}`);
    });

    // Step 1: Mint short-lived token
    console.log('\nStep 1: Minting short-lived token...');
    const tokenResp = await fetch(
      'https://aos-stg-gw.operativeone.com/mayiservice/tenant/foxsandbox',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          userId: pitchUserId,
          password: pitchPassword,
          expiration: 5 // 5 minutes
        })
      }
    );

    if (!tokenResp.ok) {
      const errText = await tokenResp.text();
      console.error('Token minting failed:', errText);
      return res.status(tokenResp.status).json({
        error: 'Failed to mint AOS token',
        details: errText
      });
    }

    const tokenData = await tokenResp.json();
    const token = tokenData.token;
    console.log('Token minted successfully');

    // Step 2: Push operations to Unified Planner Workspace
    console.log('\nStep 2: Pushing to Unified Planner Workspace...');
    const workspaceUrl = `https://aos-stg-gw.operativeone.com/unifiedplanner/v1/${apiKey}/plans/${dealId}/workspace/digital?version=1`;
    
    const upResp = await fetch(workspaceUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'allowSpecifyId': 'false'
      },
      body: JSON.stringify(operations)
    });

    const bodyText = await upResp.text();
    
    if (!upResp.ok) {
      console.error('AOS Unified Planner error:', bodyText);
      return res.status(upResp.status).json({
        error: 'AOS Unified Planner request failed',
        details: bodyText
      });
    }

    console.log('Successfully pushed to AOS');
    console.log('Response:', bodyText);
    console.log('========================================\n');

    // Success - relay AOS response back to client
    res.status(200).json({
      success: true,
      message: 'Successfully pushed to AOS Unified Planner',
      aosResponse: bodyText,
      timestamp: new Date().toISOString(),
      operationsProcessed: operations.length
    });

  } catch (error) {
    console.error('AOS push error:', (error as Error).message);
    console.error('Stack:', (error as Error).stack);
    res.status(500).json({ 
      error: 'AOS push failed', 
      details: (error as Error).message 
    });
  }
});

// Health check endpoint for Cloud Run
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Catch-all route to serve frontend for client-side routing (must be last)
app.use((req, res) => {
  const indexPath = path.join(process.cwd(), '..', 'frontend', 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend not found. Make sure to build the frontend first.');
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
