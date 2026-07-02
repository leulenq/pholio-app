let sharpModule = null;
let sharpLoadFailed = false;

/** Best-effort sharp loader; returns null when native binaries are unavailable. */
function getSharp() {
  if (sharpModule) return sharpModule;
  if (sharpLoadFailed) return null;
  try {
    sharpModule = require("sharp");
    return sharpModule;
  } catch (_err) {
    sharpLoadFailed = true;
    return null;
  }
}

/** Like getSharp but throws when sharp cannot be loaded (upload/PDF paths). */
function requireSharp() {
  const sharp = getSharp();
  if (!sharp) {
    throw new Error(
      'Could not load the "sharp" module for this runtime. Image processing is unavailable.',
    );
  }
  return sharp;
}

module.exports = { getSharp, requireSharp };
