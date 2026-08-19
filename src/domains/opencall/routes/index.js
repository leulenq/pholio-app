"use strict";

/**
 * The anonymous open-call applicant router, mounted at `/api/public/opencall`
 * (`docs/open-call-applicant-flow-design-2026-08.md` §5).
 *
 * Separate from `src/routes/api/public.js` on purpose: that file serves the
 * *account-required* open-call surface (`/open-call/:code` arrival and claims),
 * and this one serves the identity ladder — pre-account drafts, submits, claims
 * and disowns. Two mounts, one prefix family, and no shared file for parallel
 * lanes to collide in.
 *
 * Composition only. Each sub-router owns its own posture notes.
 */

const express = require("express");

const router = express.Router();

// Claim / disown magic links (§5.2, §5.5).
router.use("/", require("./claim"));

module.exports = router;
