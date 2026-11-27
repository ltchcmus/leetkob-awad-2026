import { readFileSync } from "node:fs";
import type { SandboxPolicy } from "../sandbox/contract.ts";
import { createExecutionAdapters } from "./execution.ts";

const image = process.env.SANDBOX_JUDGE_IMAGE;
if (!image || !/^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$/u.test(image)) {
  throw new Error("An approved judge manifest digest is required");
}
if (process.env.MODEL_OFF === "0") {
  throw new Error("Worker model dispatch requires a durable quota ledger");
}
const reference = JSON.parse(
  readFileSync(new URL("../../judge/policy.json", import.meta.url), "utf8"),
) as Omit<SandboxPolicy, "image">;
export const adapters = createExecutionAdapters({ ...reference, image });
