const express = require('express');
const multer = require('multer');
const { verifyClerkToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { UTApi } = require('uploadthing/server');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 4 * 1024 * 1024, // 4MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

// Initialize UploadThing
let utapi = null;
try {
  if (process.env.UPLOADTHING_SECRET) {
    utapi = new UTApi({
      apiKey: process.env.UPLOADTHING_SECRET
    });
  }
} catch (error) {
  console.warn('UploadThing not configured or failed to initialize:', error.message);
}

// Upload file to UploadThing and return URL
router.post('/upload', verifyClerkToken, upload.single('file'), asyncHandler(async (req, res) => {
  if (!utapi) {
    return res.status(500).json({
      success: false,
      error: 'UploadThing not configured'
    });
  }

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file provided'
    });
  }

  try {
    console.log('📤 Starting UploadThing upload for file:', req.file.originalname, 'Size:', req.file.size, 'Type:', req.file.mimetype);
    
    let file;
    // Check if File is available (Node.js 18+)
    if (typeof File === 'undefined') {
      // Use Blob as fallback for older Node.js versions
      const { Blob } = require('buffer');
      const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
      // Create a File-like object
      file = Object.assign(blob, {
        name: req.file.originalname,
        lastModified: Date.now()
      });
    } else {
      // Use File constructor (Node.js 18+)
      file = new File([req.file.buffer], req.file.originalname, {
        type: req.file.mimetype,
      });
    }
    
    console.log('📤 Uploading file to UploadThing...');
    const uploadResponse = await utapi.uploadFiles([file]);
    
    console.log('📥 UploadThing response type:', typeof uploadResponse);
    console.log('📥 UploadThing response:', JSON.stringify(uploadResponse, null, 2));

    // Handle different response structures from UploadThing
    const uploadedFile = Array.isArray(uploadResponse)
      ? uploadResponse[0]
      : uploadResponse;

    // Try multiple paths to get the URL
    const remoteUrl =
      uploadedFile?.data?.url ||
      uploadedFile?.url ||
      uploadedFile?.data?.[0]?.url ||
      (Array.isArray(uploadedFile?.data) && uploadedFile?.data[0]?.url) ||
      null;

    if (!remoteUrl) {
      console.error('❌ No URL found in UploadThing response structure');
      console.error('Response keys:', Object.keys(uploadedFile || {}));
      console.error('Full response:', JSON.stringify(uploadResponse, null, 2));
      throw new Error('UploadThing did not return a valid URL. Response structure: ' + JSON.stringify(uploadResponse));
    }

    console.log('✅ UploadThing upload successful, URL:', remoteUrl);

    res.json({
      success: true,
      url: remoteUrl,
      name: uploadedFile?.name || req.file.originalname,
      size: uploadedFile?.size || req.file.size
    });
  } catch (error) {
    console.error('❌ UploadThing upload error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload file',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

module.exports = router;

