// Netlify serverless wrapper (conventional directory).
// This file is required so Netlify exposes `/.netlify/functions/server`.
// Preload EJS (listed in netlify.toml external_node_modules) so Express view engine resolves at runtime.
require("ejs");
require("express-ejs-layouts");

const serverless = require("serverless-http");
const app = require("../../src/app");

exports.handler = serverless(app);
