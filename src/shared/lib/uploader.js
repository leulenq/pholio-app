const path = require("path");
const fs = require("fs");
const multer = require("multer");
const multerS3 = require("multer-s3");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { requireSharp } = require("./lazy-sharp");
const config = require("../../config");
const { v4: uuidv4 } = require("uuid");

// Initialize S3 Client for Cloudflare R2
const s3 = new S3Client({
  region: "auto",
  endpoint: config.r2.endpoint,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
});

// Helper to get R2 path prefix
const getR2Prefix = (id, type = "profiles") => {
  const env = config.nodeEnv === "production" ? "prod" : "dev";
  return `pholio-media/${env}/${type}/${id}`;
};

/** Build public CDN URL for an object key (R2_PUBLIC_URL must be the r2.dev or custom domain). */
function r2PublicUrlForKey(key) {
  const base = (config.r2.publicUrl || "").replace(/\/$/, "");
  return `${base}/${key}`;
}

async function readR2ObjectBuffer(key) {
  const response = await s3.send(
    new GetObjectCommand({ Bucket: config.r2.bucket, Key: key }),
  );
  const body = response.Body;
  if (!body) {
    throw new Error(`R2 object empty: ${key}`);
  }
  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function contentTypeForExt(ext) {
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
  };
  return map[ext] || "application/octet-stream";
}

function resolveImageBuffer(file, isR2Key) {
  if (file.buffer && file.buffer.length) {
    return file.buffer;
  }
  if (isR2Key) {
    return readR2ObjectBuffer(file.key);
  }
  return fs.readFileSync(file.path);
}

// Storage configuration
let storage;

const useR2 =
  (config.nodeEnv === "production" || process.env.USE_R2 === "true") &&
  config.r2.bucket;

// Serverless: buffer in memory, then Sharp + PutObject (avoids multer-s3 + fetch/XML issues).
const useMemoryForR2 = useR2 && config.isServerless;

if (useMemoryForR2) {
  storage = multer.memoryStorage();
} else if (useR2) {
  storage = multerS3({
    s3: s3,
    bucket: config.r2.bucket,
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      // In production, we need profileId for the path.
      // We expect req.profile to be attached by a middleware or we use userId as fallback
      const profileId = req.profile?.id || req.body.profileId || "unknown";
      const uuid = uuidv4();
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `${getR2Prefix(profileId)}/originals/${uuid}${ext}`);
    },
  });
} else {
  // Local dev or production without R2 configured — use disk storage (/tmp in Lambda)
  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        fs.mkdirSync(config.uploadsDir, { recursive: true });
      } catch (err) {
        if (err.code !== "EEXIST") return cb(err);
      }
      cb(null, config.uploadsDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  });
}

const fileFilter = (req, file, cb) => {
  const allowedMime = new Set(["image/jpeg", "image/png", "image/webp"]);
  const ok = allowedMime.has(file.mimetype);
  cb(
    ok ? null : new Error("Unsupported file type — only JPG/PNG/WEBP allowed"),
    ok,
  );
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.maxUploadBytes },
});

/** Agency workspace logos — PNG or SVG to preserve transparency in the rail lockup. */
const AGENCY_LOGO_MIMES = new Set(["image/png", "image/svg+xml"]);
const AGENCY_LOGO_EXTS = new Set([".png", ".svg"]);

const agencyLogoFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const ok = AGENCY_LOGO_MIMES.has(file.mimetype) && AGENCY_LOGO_EXTS.has(ext);
  cb(ok ? null : new Error("Agency logo must be a PNG or SVG file"), ok);
};

const uploadAgencyLogo = multer({
  storage,
  fileFilter: agencyLogoFileFilter,
  limits: { fileSize: config.maxUploadBytes },
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
  let id = "unknown";
  let type = "profiles";
  let options = passedOptions;

  if (typeof identifierOrOptions === "string") {
    id = identifierOrOptions;
  } else if (
    typeof identifierOrOptions === "object" &&
    identifierOrOptions !== null
  ) {
    options = identifierOrOptions;
    id = options.id || options.profileId || options.agencyId || "unknown";
    if (options.agencyId) type = "agencies";
  }

  const isR2Key = !!file.key;
  const isR2 = isR2Key || (useR2 && !!file.buffer);
  const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
  const uuid = isR2Key
    ? path.basename(file.key, path.extname(file.key))
    : uuidv4();
  const prefix = getR2Prefix(id, type);
  const originalKey = isR2Key ? file.key : `${prefix}/originals/${uuid}${ext}`;

  // Extract options with defaults
  const {
    maxWidth = 2000,
    quality = 85,
    thumbWidth = 400,
    thumbQuality = 80,
  } = options;

  // If not an image (should be caught by filter but being defensive)
  if (!file.mimetype.startsWith("image/")) {
    return {
      path: isR2 ? originalKey : `/uploads/${file.filename}`,
      storageKey: isR2 ? originalKey : null,
      publicUrl: isR2
        ? r2PublicUrlForKey(originalKey)
        : `/uploads/${file.filename}`,
      absolutePath: isR2 ? null : file.path,
    };
  }

  try {
    const sharp = requireSharp();
    const imageBuffer = await resolveImageBuffer(file, isR2Key);
    if (!imageBuffer?.length) {
      throw new Error("Empty image buffer");
    }

    const processedKey = `${prefix}/processed/${uuid}.webp`;
    const thumbKey = `${prefix}/thumbnails/${uuid}_400w.webp`;

    const processedBuffer = await sharp(imageBuffer)
      .rotate() // auto-orient from EXIF before any resize (webp drops the tag)
      .resize({ width: maxWidth, withoutEnlargement: true })
      .webp({ quality: quality })
      .toBuffer();

    // Comp card intelligence: measure dimensions + forensics at upload time
    // so the composition engine never has to fetch pixels in the render
    // path. Best-effort — failures never block the upload.
    let imageIntel = null;
    try {
      const meta = await sharp(processedBuffer).metadata();
      const { measureImage } = require("../../domains/pdf/composition/image-forensics");
      const forensics = await measureImage(processedBuffer);
      // Subject matte (P1) — best-effort; null unless the matte dep is
      // installed and runnable. Flows to the front engine's cutout /
      // negative-space layers when present.
      let matte = null;
      try {
        // best available: real alpha matte when @imgly is installed, else
        // the sharp-only studio estimate for clean-backdrop photography
        const { computeBestMatte } = require("../../domains/pdf/composition/perception/matte");
        matte = await computeBestMatte(processedBuffer);
      } catch {
        matte = null;
      }
      imageIntel = {
        width: meta.width || null,
        height: meta.height || null,
        ...(forensics ? { forensics } : {}),
        ...(matte ? { matte } : {}),
      };
    } catch (intelErr) {
      imageIntel = null;
    }

    const thumbBuffer = await sharp(imageBuffer)
      .rotate() // auto-orient from EXIF before any resize (webp drops the tag)
      .resize({ width: thumbWidth, withoutEnlargement: true })
      .webp({ quality: thumbQuality })
      .toBuffer();

    let storageKey = processedKey;
    let publicUrl = r2PublicUrlForKey(processedKey);
    let absolutePath = null;

    if (isR2) {
      const uploads = [
        s3.send(
          new PutObjectCommand({
            Bucket: config.r2.bucket,
            Key: processedKey,
            Body: processedBuffer,
            ContentType: "image/webp",
          }),
        ),
        s3.send(
          new PutObjectCommand({
            Bucket: config.r2.bucket,
            Key: thumbKey,
            Body: thumbBuffer,
            ContentType: "image/webp",
          }),
        ),
      ];
      if (file.buffer?.length) {
        uploads.push(
          s3.send(
            new PutObjectCommand({
              Bucket: config.r2.bucket,
              Key: originalKey,
              Body: file.buffer,
              ContentType: file.mimetype || contentTypeForExt(ext),
            }),
          ),
        );
      }
      await Promise.all(uploads);
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
      try {
        fs.unlinkSync(file.path);
      } catch (e) {}
    }

    return {
      path: publicUrl, // Keep 'path' for legacy support or set to publicUrl
      storageKey: storageKey,
      publicUrl: publicUrl,
      absolutePath: absolutePath,
      imageIntel,
      // Processed bytes are exposed so callers (e.g. content moderation) can
      // analyze the exact image we persisted without re-fetching from storage.
      processedBuffer,
    };
  } catch (err) {
    console.error("[Uploader] Error processing image:", err.message, {
      key: file.key,
      hasBuffer: Boolean(file.buffer?.length),
      mimetype: file.mimetype,
    });
    const fallbackUrl = isR2
      ? r2PublicUrlForKey(originalKey)
      : `/uploads/${file.filename}`;
    return {
      path: fallbackUrl,
      storageKey: isR2 ? originalKey : null,
      publicUrl: fallbackUrl,
      absolutePath: isR2 ? null : file.path,
    };
  }
}

/**
 * Process agency logo — PNG (raster) or SVG (vector), preserving transparency.
 */
async function processAgencyLogo(
  file,
  { agencyId, maxWidth = 400, maxHeight = 400 } = {},
) {
  const ext = path.extname(file.originalname).toLowerCase();
  const isSvg = file.mimetype === "image/svg+xml" || ext === ".svg";
  const isPng = file.mimetype === "image/png" || ext === ".png";

  if (!isSvg && !isPng) {
    throw new Error("Agency logo must be a PNG or SVG file");
  }

  const id = agencyId || "unknown";
  const type = "agencies";
  const isR2Key = !!file.key;
  const isR2 = isR2Key || (useR2 && !!file.buffer);
  const uuid = isR2Key
    ? path.basename(file.key, path.extname(file.key))
    : uuidv4();
  const prefix = getR2Prefix(id, type);
  const logoExt = isSvg ? ".svg" : ".png";
  const logoKey = `${prefix}/logos/${uuid}${logoExt}`;
  const contentType = isSvg ? "image/svg+xml" : "image/png";

  const imageBuffer = await resolveImageBuffer(file, isR2Key);
  if (!imageBuffer?.length) {
    throw new Error("Empty image buffer");
  }

  const sharp = isSvg ? null : requireSharp();
  const processedBuffer = isSvg
    ? imageBuffer
    : await sharp(imageBuffer)
        .rotate() // auto-orient from EXIF metadata when present
        .resize({
          width: maxWidth,
          height: maxHeight,
          fit: "inside",
          withoutEnlargement: true,
        })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();

  if (isR2) {
    await s3.send(
      new PutObjectCommand({
        Bucket: config.r2.bucket,
        Key: logoKey,
        Body: processedBuffer,
        ContentType: contentType,
      }),
    );
    const publicUrl = r2PublicUrlForKey(logoKey);
    return {
      path: publicUrl,
      storageKey: logoKey,
      publicUrl,
      absolutePath: null,
    };
  }

  const processedPath = path.join(config.uploadsDir, `${uuid}${logoExt}`);
  fs.writeFileSync(processedPath, processedBuffer);

  try {
    if (file.path) fs.unlinkSync(file.path);
  } catch (e) {}

  const publicUrl = `/uploads/${uuid}${logoExt}`;
  return {
    path: publicUrl,
    storageKey: null,
    publicUrl,
    absolutePath: processedPath,
  };
}

module.exports = {
  upload,
  uploadAgencyLogo,
  processImage,
  processAgencyLogo,
  s3,
};
