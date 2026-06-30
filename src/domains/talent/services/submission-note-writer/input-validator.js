"use strict";

const { MAX_CHARS } = require("./quality-rubric");

function validateSubmissionNoteInput(
  value,
  { minLength = 0, minLengthMessage = "Note is too short" } = {},
) {
  const note = typeof value === "string" ? value.trim() : "";

  if (note.length < minLength) {
    return { valid: false, error: minLengthMessage, note };
  }

  if (note.length > MAX_CHARS) {
    return {
      valid: false,
      error: `Note must be ${MAX_CHARS} characters or fewer`,
      note,
    };
  }

  return { valid: true, note };
}

module.exports = { validateSubmissionNoteInput };
