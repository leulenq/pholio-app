import adaptHandler from "../handlers/runtime-adapter.mjs";
import legacy from "../handlers/recover-provider-work.js";

// Preserve the existing handler contract on Netlify’s modern runtime.
export default adaptHandler(legacy.handler);
