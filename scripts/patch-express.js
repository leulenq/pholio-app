const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const files = [
  'node_modules/express/lib/application.js',
  'node_modules/express/lib/express.js',
];

files.forEach(filePath => {
  const abs = path.resolve(__dirname, '..', filePath);
  if (!fs.existsSync(abs)) return;
  let src = fs.readFileSync(abs, 'utf8');
  let originalSrc = src;

  // Replace exact occurrences to avoid .js.js issues across cached environments
  src = src.replace(/require\(['"]\.\/router['"]\)/g, "require('./router/index.js')");
  src = src.replace(/require\(['"]\.\/router\/index['"]\)/g, "require('./router/index.js')");
  src = src.replace(/require\(['"]\.\/middleware\/init['"]\)/g, "require('./middleware/init.js')");
  src = src.replace(/require\(['"]\.\/middleware\/query['"]\)/g, "require('./middleware/query.js')");

  if (src !== originalSrc) {
    fs.writeFileSync(abs, src);
    console.log(`patched: ${filePath}`);
  }
});

// Patch validator: add .js extensions to all extensionless relative requires so esbuild
// can resolve them on Netlify's build server (same issue as express directory requires).
const validatorDir = path.resolve(__dirname, '..', 'node_modules/validator');
if (fs.existsSync(validatorDir)) {
  const libDir = path.join(validatorDir, 'lib');
  const utilDir = path.join(validatorDir, 'lib', 'util');
  const filesToPatch = [
    path.join(validatorDir, 'index.js'),
    ...(fs.existsSync(libDir) ? fs.readdirSync(libDir).map(f => path.join(libDir, f)) : []),
    ...(fs.existsSync(utilDir) ? fs.readdirSync(utilDir).map(f => path.join(utilDir, f)) : []),
  ].filter(f => f.endsWith('.js'));

  filesToPatch.forEach(absFile => {
    if (!fs.existsSync(absFile)) return;
    let src = fs.readFileSync(absFile, 'utf8');
    const original = src;
    // Add .js to relative requires that don't already end in .js
    src = src.replace(/require\(['"](\.[^'"]+)(?<!\.js)['"]\)/g, "require('$1.js')");
    if (src !== original) {
      fs.writeFileSync(absFile, src);
      console.log(`patched validator requires: ${path.relative(path.resolve(__dirname, '..'), absFile)}`);
    }
  });
}

// Replace ALL readable-stream entry points (root + nested) with a shim that delegates
// to Node.js 20's built-in stream module. Node 20 exports all the same symbols
// (Readable, Writable, Duplex, Transform, PassThrough, finished, pipeline), so this
// is fully compatible. This eliminates the missing lib/internal/streams/ files entirely
// regardless of whether nft, esbuild, or any external package loads readable-stream.
const rsShim = `'use strict';
const stream = require('stream');
module.exports = stream;
module.exports.Stream = stream;
module.exports.Readable = stream.Readable;
module.exports.Writable = stream.Writable;
module.exports.Duplex = stream.Duplex;
module.exports.Transform = stream.Transform;
module.exports.PassThrough = stream.PassThrough;
module.exports.finished = stream.finished;
module.exports.pipeline = stream.pipeline;
`;
try {
  const rsCmd = `find "${path.resolve(__dirname, '..', 'node_modules')}" -type f -name "readable.js" -path "*/readable-stream/readable.js"`;
  const rsEntries = execSync(rsCmd, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  rsEntries.forEach(entryFile => {
    const current = fs.readFileSync(entryFile, 'utf8');
    if (current !== rsShim) {
      fs.writeFileSync(entryFile, rsShim);
      console.log(`shimmed readable-stream: ${path.relative(path.resolve(__dirname, '..'), entryFile)}`);
    }
  });
} catch (err) {
  console.log('Error shimming readable-stream:', err.message);
}

// Netlify's Linux environment fundamentally physically rejects parsing extend-node.js.
const iconvFile = path.resolve(__dirname, '..', 'node_modules/iconv-lite/lib/index.js');
if (fs.existsSync(iconvFile)) {
    let code = fs.readFileSync(iconvFile, 'utf8');
    let ocode = code;
    code = code.replace(/require\(['"]\.\/streams['"]\)\(iconv\);/g, '// require("./streams")(iconv);');
    code = code.replace(/require\(['"]\.\/extend-node['"]\)\(iconv\);/g, '// require("./extend-node")(iconv);');
    if (code !== ocode) {
        fs.writeFileSync(iconvFile, code);
        console.log('Disabled optional esoteric Next/Netlify crashing extends inside iconv-lite.');
    }
}

// Fix Netlify esbuild dropping server files due to 'browser' field confusion on nested versions
try {
  // Use find to locate all package.json files for iconv-lite and readable-stream
  const cmd = `find "${path.resolve(__dirname, '..', 'node_modules')}" -type f -path "*/iconv-lite/package.json"`;
  const result = execSync(cmd, { encoding: 'utf8' }).trim();
  
  if (result) {
    const pkgFiles = result.split('\n').filter(Boolean);
    pkgFiles.forEach(absPkg => {
      try {
        let pkg = JSON.parse(fs.readFileSync(absPkg, 'utf8'));
        if (pkg.browser) {
          delete pkg.browser;
          fs.writeFileSync(absPkg, JSON.stringify(pkg, null, 2));
          console.log(`Stripped browser field from nested package: ${absPkg}`);
        }
      } catch (e) {
        console.log(`Could not strip ${absPkg}: ${e.message}`);
      }
    });
  }
} catch (err) {
  console.log('Error finding nested packages:', err.message);
}
