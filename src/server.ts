import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createApp } from "./app.ts";
import { demoAuthenticator } from "./auth.ts";
import { WorkflowRepository } from "./db/workflow-repository.ts";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import type { AppOptions } from "./app.ts";

const token = process.env.DEMO_AUTH_TOKEN ?? "";
const adapterPath = process.env.AUTH_ADAPTER_MODULE;
if (adapterPath && !isAbsolute(adapterPath))
  throw new Error("Trusted auth adapter must use an absolute path");
const authenticate: AppOptions["authenticate"] = adapterPath
  ? (await import(pathToFileURL(adapterPath).href)).authenticate
  : demoAuthenticator(token);
if (typeof authenticate !== "function")
  throw new Error("Invalid trusted authentication adapter");
const databasePath = process.env.DATABASE_PATH ?? "data/leetkob.db";
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? "3000");
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be 1 through 65535.");
mkdirSync(dirname(databasePath), { recursive: true });
const repository = new WorkflowRepository(databasePath);
const server = createApp({ repository, authenticate });
server.listen(port, host, () => {
  console.info(
    `LeeTKOB demo listening on ${host}:${port}; model spending disabled.`,
  );
});
function shutdown(): void {
  server.close(() => {
    repository.close();
  });
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
