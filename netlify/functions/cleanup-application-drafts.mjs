import adaptHandler from "../handlers/runtime-adapter.js";
import legacy from "../handlers/cleanup-application-drafts.js";

// Preserve the existing handler contract on Netlify’s modern runtime.
export default adaptHandler(legacy.handler);
