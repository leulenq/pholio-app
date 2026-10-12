import adaptHandler from "../handlers/runtime-adapter.js";
import legacy from "../handlers/server.js";

// Preserve the existing handler contract on Netlify’s modern runtime.
export default adaptHandler(legacy.handler);
