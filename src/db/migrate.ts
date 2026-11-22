import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";

export function applyMigrations(db: DatabaseSync): void {
  const sql = readFileSync(
    new URL("./migrations/001_pa3.sql", import.meta.url),
    "utf8",
  );
  const checksum = createHash("sha256").update(sql).digest("hex");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL) STRICT",
    );
    const applied = db
      .prepare("SELECT checksum FROM schema_migrations WHERE version = 1")
      .get();
    if (applied && applied.checksum !== checksum)
      throw new Error(
        "Migration checksum changed; add a new migration instead.",
      );
    if (!applied) {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations VALUES (1, ?)").run(checksum);
    }
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}
