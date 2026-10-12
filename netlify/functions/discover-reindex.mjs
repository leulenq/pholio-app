import { createRequire } from "node:module";
import adaptHandler from "../handlers/runtime-adapter.mjs";

// Keep CommonJS imports visible to Netlify’s dependency tracer.
const legacyRequire = createRequire(import.meta.url);
const legacy = legacyRequire("../handlers/discover-reindex.js");

export default adaptHandler(legacy.handler);
