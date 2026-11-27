import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInSandbox } from "./runner.ts";
import type { SandboxPolicy } from "./contract.ts";

const image = process.env.SANDBOX_JUDGE_IMAGE;
if (!image)
  throw new Error("Set SANDBOX_JUDGE_IMAGE to the approved built digest");
const reference = JSON.parse(
  readFileSync(new URL("../../judge/policy.json", import.meta.url), "utf8"),
) as Omit<SandboxPolicy, "image">;
const source =
  '#include <iostream>\nint main(){long a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}\n';
const result = await runInSandbox(
  {
    submissionId: "worker-example",
    source: {
      text: source,
      sha256: createHash("sha256").update(source).digest("hex"),
    },
    tests: [{ id: "sum-1", input: "2 3\n", expectedOutput: "5\n" }],
  },
  { ...reference, image },
  { runId: randomUUID(), signal: AbortSignal.timeout(25_000) },
);
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
process.exitCode =
  result.kind === "completed" && result.judgeStatus === "AC" ? 0 : 1;
