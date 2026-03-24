const express = require("express");
const router = express.Router();
const Groq = require("groq-sdk");
const { requireRole } = require("../../auth/middleware/require-auth");
const config = require("../../../config");

router.post("/refine", requireRole("TALENT"), async (req, res) => {
  try {
    const apiKey = process.env.GROQ_API_KEY || config.groq?.apiKey;
    if (!apiKey) {
      console.error("[Bio Refine] Missing GROQ_API_KEY");
      return res
        .status(503)
        .json({ error: "AI service unavailable (configuration error)" });
    }

    const groq = new Groq({ apiKey });

    const { bio, firstName, lastName } = req.body;

    if (!bio || bio.trim().length < 10) {
      return res.status(400).json({
        error: "Bio must be at least 10 characters",
      });
    }

    const wordCount = bio.split(/\s+/).length;

    const prompt = `You are a professional bio editor for talent portfolios in the entertainment industry.

Refine this bio following these strict rules:
1. Length: 50-150 words (current: ${wordCount} words)
2. Voice: First-person active voice only ("I", "my", "me")
3. Style: Professional, concise, casting-ready
4. Tone: Confident but authentic
5. Structure: Lead with strengths, then experience/training, close with unique qualities

Original bio:
"${bio}"

Talent name: ${firstName} ${lastName}

Return ONLY the refined bio text. No explanations, no meta-commentary, no quotation marks around the response.`;

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are an expert bio editor for talent in the entertainment industry. You refine bios to be concise, professional, and casting-ready. Always write in first-person active voice.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "meta-llama/llama-3.1-8b-instant",
      temperature: 0.7,
      max_completion_tokens: 300,
      top_p: 0.9,
    });

    const refinedBio = completion.choices[0]?.message?.content?.trim();

    if (!refinedBio) {
      throw new Error("No response from AI model");
    }

    // Validate word count
    const refinedWordCount = refinedBio.split(/\s+/).length;
    if (refinedWordCount < 50 || refinedWordCount > 150) {
      console.warn(`[Bio Refine] Word count out of range: ${refinedWordCount}`);
    }

    return res.json({
      original: bio,
      refined: refinedBio,
      wordCount: refinedWordCount,
      improvements: {
        lengthAdjusted: Math.abs(wordCount - refinedWordCount) > 10,
        voiceImproved: true,
        styleConsistent: true,
      },
    });
  } catch (error) {
    console.error("[Bio Refine] Error:", error);
    return res.status(500).json({
      error: "Failed to refine bio. Please try again.",
    });
  }
});

module.exports = router;
