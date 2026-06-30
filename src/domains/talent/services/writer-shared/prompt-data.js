"use strict";

/**
 * Encode user-authored text as one JSON string before placing it in a prompt.
 *
 * JSON serialization gives the model an explicit data boundary and escapes
 * quotes, newlines, and control characters without altering the underlying
 * text. Prompt builders should label the result as data and must not place the
 * same value elsewhere in the prompt unencoded.
 */
function encodePromptData(value) {
  return JSON.stringify(String(value ?? ""));
}

module.exports = { encodePromptData };
