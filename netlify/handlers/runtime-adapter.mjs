import { withLambda } from "@netlify/aws-lambda-compat";

// Express/serverless-http can return body: "" for statuses that forbid bodies.
// Web Response rejects even an empty string for these statuses.
export default function adaptHandler(handler) {
  return withLambda(async (event, context) => {
    const result = await handler(event, context);
    if ([204, 205, 304].includes(result.statusCode)) {
      const { body, ...withoutBody } = result;
      return withoutBody;
    }
    return result;
  });
}
