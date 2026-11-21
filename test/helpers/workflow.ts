import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { WorkflowRepository } from "../../src/db/workflow-repository.ts";
import type { Principal } from "../../src/repository.ts";

export const people = {
  admin: { id: "admin-fixture", role: "admin" },
  ta: { id: "ta-fixture", role: "ta" },
  foreign: { id: "foreign-fixture", role: "ta" },
  student: { id: "student-fixture", role: "student" },
  other: { id: "other-fixture", role: "student" },
} satisfies Record<string, Principal>;

export function workflowFixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "leetkob-worker-"));
  const path = join(directory, "app.db");
  const repo = new WorkflowRepository(path);
  for (const person of Object.values(people)) repo.provisionUser(person);
  const classId = repo.createClass(people.admin, "Synthetic A");
  const otherClass = repo.createClass(people.admin, "Synthetic B");
  repo.assignTa(people.admin, classId, people.ta.id);
  repo.assignTa(people.admin, otherClass, people.foreign.id);
  repo.enrollStudent(people.ta, classId, people.student.id);
  repo.enrollStudent(people.ta, classId, people.other.id);
  const now = Date.now();
  const labId = repo.createLab(people.ta, {
    classId,
    statement: "Return normally.",
    deadline: new Date(now + 60_000).toISOString(),
    tests: [{ input: "", expectedOutput: "" }],
    constraints: [
      { id: "C1", text: "Do not use `goto`.", deductionTenths: 30 },
      { id: "C2", text: "Return normally.", deductionTenths: 20 },
    ],
  });
  const enqueue = () =>
    repo.submit(
      people.student,
      labId,
      { source: "int main() { return 0; }\n" },
      now,
    );
  t.after(() => {
    repo.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { repo, path, now, labId, enqueue };
}
