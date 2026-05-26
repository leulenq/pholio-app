// Netlify serverless wrapper (conventional directory).
// This file is required so Netlify exposes `/.netlify/functions/server`.
const serverless = require("serverless-http");
const app = require("../../src/app");

exports.handler = serverless(app);
