const path = require('path');
const fs = require('fs');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const config = require('../../config');
const { v4: uuidv4 } = require('uuid');

// Initialize S3 Client for Cloudflare R2
const s3 = new S3Client({
  region: 'auto',
  endpoint: config.r2.endpoint,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
});

// Helper to get R2 path prefix
const getR2Prefix = (id, type = 'profiles') => {
  const env = config.nodeEnv === 'production' ? 'prod' : 'dev';
  return `pholio-media/${env}/${type}/${id}`;
};

// Storage configuration
let storage;

const useR2 = (config.nodeEnv === 'production' || process.env.USE_R2 === 'true') && config.r2.bucket;

if (useR2) {
  storage = multerS3({
    s3: s3,
    bucket: config.r2.bucket,
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      // In production, we need profileId for the path.
      // We expect req.profile to be attached by a middleware or we use userId as fallback
      const profileId = req.profile?.id || req.body.profileId || 'unknown';
      const uuid = uuidv4();
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${getR2Prefix(profileId)}/originals/${uuid}${ext}`);
    }
  });
} else {
  // Local dev or production without R2 configured — use disk storage (/tmp in Lambda)
  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        fs.mkdirSync(config.uploadsDir, { recursive: true });
      } catch (err) {
        if (err.code !== 'EEXIST') return cb(err);
      }
      cb(null, config.uploadsDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
  });
}

const fileFilter = (req, file, cb) => {
  const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const ok = allowedMime.has(file.mimetype);
  cb(ok ? null : new Error('Unsupported file type — only JPG/PNG/WEBP allowed'), ok);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.maxUploadBytes }
});

/**
 * Process image and return metadata for DB persistence
 * Handles WebP conversion and thumbnail generation, uploading to R2 if needed.
 * 
 * @param {Object} file - The file object from multer (Express.MulterS3.File | Express.Multer.File)
 * @param {string|Object} identifierOrOptions - Profile ID or Options object
 * @param {Object} [passedOptions] - Optional options if identifier is string
 * @returns {Promise<{path: string, storageKey: string, publicUrl: string, absolutePath: string|null}>}
 */
async function processImage(file, identifierOrOptions, passedOptions = {}) {
  let id = 'unknown';
  let type = 'profiles';
  let options = passedOptions;

  if (typeof identifierOrOptions === 'string') {
    id = identifierOrOptions;
  } else if (typeof identifierOrOptions === 'object' && identifierOrOptions !== null) {
    options = identifierOrOptions;
    id = options.id || options.profileId || options.agencyId || 'unknown';
    if (options.agencyId) type = 'agencies';
  }

  const isS3 = !!file.key;
  const originalPath = isS3 ? file.location : file.path;
  const originalKey = isS3 ? file.key : file.filename;
  const uuid = isS3 ? path.basename(file.key, path.extname(file.key)) : path.basename(file.filename, path.extname(file.filename));
  const prefix = getR2Prefix(id, type);

  // Extract options with defaults
  const { 
    maxWidth = 2000, 
    quality = 85,
    thumbWidth = 400,
    thumbQuality = 80
  } = options;

  // If not an image (should be caught by filter but being defensive)
  if (!file.mimetype.startsWith('image/')) {
    return {
      path: isS3 ? file.key : `/uploads/${file.filename}`,
      storageKey: isS3 ? file.key : null,
      publicUrl: isS3 ? `${config.r2.publicUrl}/${file.key}` : `/uploads/${file.filename}`,
      absolutePath: isS3 ? null : file.path
    };
  }

  try {
    // 1. Prepare Sharp instances
    const imageBuffer = isS3 
      ? await fetch(file.location).then(res => res.arrayBuffer()).then(ab => Buffer.from(ab))
      : fs.readFileSync(file.path);

    const processedKey = `${prefix}/processed/${uuid}.webp`;
    const thumbKey = `${prefix}/thumbnails/${uuid}_400w.webp`;

    // 2. Generate variants
    const processedBuffer = await sharp(imageBuffer)
      .resize({ width: maxWidth, withoutEnlargement: true })
      .webp({ quality: quality })
      .toBuffer();

    const thumbBuffer = await sharp(imageBuffer)
      .resize({ width: thumbWidth, withoutEnlargement: true })
      .webp({ quality: thumbQuality })
      .toBuffer();

    let storageKey = processedKey;
    let publicUrl = `${config.r2.publicUrl}/${processedKey}`;
    let absolutePath = null;

    if (isS3) {
      // Upload variants to R2
      await Promise.all([
        s3.send(new PutObjectCommand({
          Bucket: config.r2.bucket,
          Key: processedKey,
          Body: processedBuffer,
          ContentType: 'image/webp'
        })),
        s3.send(new PutObjectCommand({
          Bucket: config.r2.bucket,
          Key: thumbKey,
          Body: thumbBuffer,
          ContentType: 'image/webp'
        }))
      ]);
    } else {
      // Local development: save files to disk
      const processedPath = path.join(config.uploadsDir, `${uuid}.webp`);
      const thumbPath = path.join(config.uploadsDir, `${uuid}_400w.webp`);
      
      fs.writeFileSync(processedPath, processedBuffer);
      fs.writeFileSync(thumbPath, thumbBuffer);
      
      storageKey = null; // Local dev doesn't use R2 key
      publicUrl = `/uploads/${uuid}.webp`;
      absolutePath = processedPath;

      // Cleanup original local file
      try { fs.unlinkSync(file.path); } catch (e) {}
    }

    return {
      path: publicUrl, // Keep 'path' for legacy support or set to publicUrl
      storageKey: storageKey,
      publicUrl: publicUrl,
      absolutePath: absolutePath
    };

  } catch (err) {
    console.error('[Uploader] Error processing image:', err);
    // Fallback to original
    return {
      path: isS3 ? file.location : `/uploads/${file.filename}`,
      storageKey: isS3 ? file.key : null,
      publicUrl: isS3 ? `${config.r2.publicUrl}/${file.key}` : `/uploads/${file.filename}`,
      absolutePath: isS3 ? null : file.path
    };
  }
}

module.exports = { upload, processImage, s3 };
