// required imports
import path from 'path';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import { openai } from '../lib/openai.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Log environment variables for debugging
console.log('OPENAI_API_KEY set:', !!process.env.OPENAI_API_KEY);

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

// Import pipeline functions
import { runStage1 } from '../pipeline/run_stage1.js';
import { runStage4 } from '../pipeline/run_stage4.js';

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

// Push to AOS endpoint (super chill - just logs and returns success)
app.post('/api/push-to-aos', express.json(), (req, res) => {
  try {
    console.log('\n========================================');
    console.log('🚀 PUSH TO AOS REQUEST');
    console.log('========================================');
    console.log('Timestamp:', new Date().toISOString());
    console.log('\nPayload received:');
    console.log(JSON.stringify(req.body, null, 2));
    console.log('\n========================================');
    
    // Simulate processing time
    setTimeout(() => {
      res.json({
        success: true,
        message: 'Successfully pushed to AOS',
        timestamp: new Date().toISOString(),
        recordsProcessed: {
          campaign: 1,
          flights: req.body.flights?.length || 0
        }
      });
    }, 500);
    
  } catch (error) {
    console.error('Push to AOS error:', (error as Error).message);
    res.status(500).json({ 
      error: 'Push to AOS failed', 
      details: (error as Error).message 
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
