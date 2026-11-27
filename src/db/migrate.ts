import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";

export function applyMigrations(db: DatabaseSync): void {
  for (const [version, file] of [
    [1, "001_pa3.sql"],
    [2, "002_persistence.sql"],
  ] as const)
    applyMigration(db, version, file);
}

function applyMigration(db: DatabaseSync, version: number, file: string): void {
  const sql = readFileSync(
    new URL(`./migrations/${file}`, import.meta.url),
    "utf8",
  );
  const checksum = createHash("sha256").update(sql).digest("hex");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL) STRICT",
    );
    const applied = db
      .prepare("SELECT checksum FROM schema_migrations WHERE version = ?")
      .get(version);
    if (applied && applied.checksum !== checksum)
      throw new Error(
        "Migration checksum changed; add a new migration instead.",
      );
    if (!applied) {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations VALUES (?, ?)").run(
        version,
        checksum,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}
