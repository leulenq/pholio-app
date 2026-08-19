"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const { PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { v4: uuidv4 } = require("uuid");
const config = require("../../../config");
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const apiResponse = require("../../../shared/lib/api-response");

const router = express.Router();
const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const r2Enabled = Boolean((config.nodeEnv === "production" || process.env.USE_R2 === "true") && config.r2.bucket);
const s3 = new S3Client({ region: "auto", endpoint: config.r2.endpoint, credentials: { accessKeyId: config.r2.accessKeyId, secretAccessKey: config.r2.secretAccessKey } });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 1 }, fileFilter: (_req, file, cb) => cb(ALLOWED.has(file.mimetype) ? null : new Error("Upload a PDF, JPEG, PNG, or WebP comp card."), ALLOWED.has(file.mimetype)) });

function serialise(row) {
  return { id: row.id, filename: row.filename, mimeType: row.mime_type, sizeBytes: row.size_bytes, url: row.public_url, createdAt: row.created_at };
}

function hasExpectedMagic(buffer, mime) {
  if (!buffer || buffer.length < 12) return false;
  if (mime === "application/pdf") return buffer.subarray(0, 5).toString() === "%PDF-";
  if (mime === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return mime === "image/webp" && buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP";
}

router.get("/", requireRole("TALENT"), asyncHandler(async (req, res) => {
  const profile = await knex("profiles").where({ user_id: req.session.userId }).first("id");
  if (!profile) return apiResponse.success(res, { cards: [] });
  const cards = await knex("external_comp_cards").where({ profile_id: profile.id }).whereNull("deleted_at").orderBy("created_at", "desc");
  return apiResponse.success(res, { cards: cards.map(serialise) });
}));

router.post("/", requireRole("TALENT"), (req, res, next) => upload.single("card")(req, res, (error) => error ? apiResponse.error(res, error.code === "LIMIT_FILE_SIZE" ? "That file is too large." : error.message, 400) : next()), asyncHandler(async (req, res) => {
  if (!req.file || !hasExpectedMagic(req.file.buffer, req.file.mimetype)) return apiResponse.error(res, "The file contents do not match a supported comp-card format.", 400);
  const profile = await knex("profiles").where({ user_id: req.session.userId }).first("id");
  if (!profile) return apiResponse.notFound(res, "Profile not found");
  const ext = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }[req.file.mimetype];
  const token = crypto.randomUUID();
  let storageKey = null;
  let publicUrl;
  if (r2Enabled) {
    storageKey = `pholio-media/${config.nodeEnv === "production" ? "prod" : "dev"}/comp-cards/${profile.id}/${token}${ext}`;
    await s3.send(new PutObjectCommand({ Bucket: config.r2.bucket, Key: storageKey, Body: req.file.buffer, ContentType: req.file.mimetype }));
    publicUrl = `${String(config.r2.publicUrl || "").replace(/\/$/, "")}/${storageKey}`;
  } else {
    const directory = path.join(config.uploadsDir, "comp-cards");
    fs.mkdirSync(directory, { recursive: true });
    const name = `${token}${ext}`;
    fs.writeFileSync(path.join(directory, name), req.file.buffer, { flag: "wx" });
    publicUrl = `/uploads/comp-cards/${name}`;
  }
  const row = { id: uuidv4(), user_id: req.session.userId, profile_id: profile.id, filename: path.basename(req.file.originalname).slice(0, 255), mime_type: req.file.mimetype, size_bytes: req.file.size, storage_key: storageKey, public_url: publicUrl, created_at: new Date() };
  await knex("external_comp_cards").insert(row);
  return apiResponse.success(res, serialise(row), 201);
}));

router.delete("/:id", requireRole("TALENT"), asyncHandler(async (req, res) => {
  const updated = await knex("external_comp_cards").where({ id: req.params.id, user_id: req.session.userId }).whereNull("deleted_at").update({ deleted_at: new Date() });
  if (updated !== 1) return apiResponse.notFound(res, "Comp card not found");
  return apiResponse.success(res, { deleted: true });
}));

module.exports = router;
