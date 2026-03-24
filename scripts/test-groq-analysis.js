require("dotenv").config();
const { analyzePhoto } = require("../src/domains/ai/photo-analysis");
const path = require("path");
const fs = require("fs");

async function testAnalysis() {
  const imagePath = process.argv[2];

  if (!imagePath) {
    console.error("Usage: node scripts/test-groq-analysis.js <path-to-image>");
    process.exit(1);
  }

  const absolutePath = path.resolve(process.cwd(), imagePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`File not found: ${absolutePath}`);
    process.exit(1);
  }

  console.log(`Analyzing: ${absolutePath}`);
  console.log(
    `Using GROQ_API_KEY: ${process.env.GROQ_API_KEY ? "Set" : "Not Set"}`,
  );

  try {
    const result = await analyzePhoto(absolutePath);
    console.log("--- Analysis Result ---");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Analysis failed:", error);
  }
}

testAnalysis();
