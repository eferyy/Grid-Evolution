// Loads the base64-encoded Grid Evolution HTML from a JSON asset.
// Metro has native JSON support, so large string payloads bypass Babel's
// parser-stack limits that would choke on equivalently large .ts literals.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const payload = require('./gameHtml.json') as { b64: string };
export const GAME_HTML_B64: string = payload.b64;
