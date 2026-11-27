import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function verifyFiles(root: string, files: Record<string, string>): void {
  const base = resolve(root);
  for (const [name, expected] of Object.entries(files)) {
    const path = resolve(base, name);
    const inside = relative(base, path);
    if (
      isAbsolute(inside) ||
      inside.startsWith("..") ||
      !/^[a-f0-9]{64}$/.test(expected)
    )
      throw new Error("Invalid integrity manifest");
    const actual = createHash("sha256")
      .update(readFileSync(path))
      .digest("hex");
    if (actual !== expected)
      throw new Error(`Official dataset changed: ${name}`);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (!process.argv[2])
      throw new Error(
        "Usage: node test/eval-cases/verify-official.ts <official-dataset-folder>",
      );
    const manifest = JSON.parse(
      readFileSync(
        new URL("./official-manifest.json", import.meta.url),
        "utf8",
      ),
    ) as { commit: string; files: Record<string, string> };
    verifyFiles(process.argv[2], manifest.files);
    console.info(
      `Verified ${Object.keys(manifest.files).length} official files at ${manifest.commit}`,
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Integrity verification failed",
    );
    process.exitCode = 1;
  }
}
