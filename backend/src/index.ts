// required imports
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import OpenAI from 'openai';

const app = express();
const PORT = process.env.PORT || 3001;

// Log environment variables for debugging
console.log('OPENAI_API_KEY set:', !!process.env.OPENAI_API_KEY);

// Use either OPENAI_API_KEY or REACT_APP_OPENAI_API_KEY
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error('ERROR: No OpenAI API key found!');
  console.error('Please set either OPENAI_API_KEY in your .env file');
  process.exit(1);
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: apiKey
});

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
        // Write file to temp location for OpenAI upload (like Python's open("file", "rb"))
        const tempFilePath = path.join('data/raw', `temp_${sha256}.pdf`);
        fs.writeFileSync(tempFilePath, req.file.buffer);
        
        // Upload using file path (like Python approach)
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

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
