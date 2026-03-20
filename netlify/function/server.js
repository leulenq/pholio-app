// bundler: esbuild
const serverless = require('serverless-http');
const app = require('../../src/app');

exports.handler = serverless(app);
