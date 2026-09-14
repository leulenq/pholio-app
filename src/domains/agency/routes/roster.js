"use strict";

const express = require("express");

// The page-form application decision and Discover invitation routes that used
// to live here duplicated the canonical /api/agency handlers without their
// membership, legal, RBAC, and transition guards. They are intentionally not
// retained as aliases: callers must use the canonical guarded API routes.
module.exports = express.Router();
