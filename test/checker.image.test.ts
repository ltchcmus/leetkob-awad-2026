import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("checker image ships only source and runs the same CLI as an unprivileged user", () => {
  const file = readFileSync("Dockerfile.checker", "utf8");
  assert.match(file, /FROM node:24\.11\.0-bookworm-slim/u);
  assert.match(file, /COPY --chown=node:node src \.\/src/u);
  assert.match(file, /USER node/u);
  assert.match(file, /ENV MODEL_OFF=1/u);
  assert.match(file, /src\/checker\/cli.ts/u);
  assert.doesNotMatch(file, /COPY \. |API_KEY|\.env/u);
});
