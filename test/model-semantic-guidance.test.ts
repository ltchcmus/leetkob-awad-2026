import assert from "node:assert/strict";
import { test } from "node:test";
import { makePrompt } from "../src/ai/prompt.ts";
for (const source of [
  "void f(){ char a[4]; auto p=a; p[0]=1; }",
  "void f(){ char a[4]; char b[4]; b[0]=a[0]; }",
  "void f(){ char a[4]; if(false){char b[4]; b[0]=a[0];} }",
]) {
  test("semantic prompt retains storage/data-flow evidence: " + source, () => {
    const prepared = makePrompt(
      {
        labId: "synthetic",
        statement: "Transform in place.",
        source,
        constraints: [
          { id: "C", text: "Do not build an independent output buffer." },
        ],
      },
      [],
    );
    assert.ok(prepared);
    assert.ok(
      prepared.prompt.includes("Trace storage, aliases and actual data flow"),
    );
    assert.ok(prepared.prompt.includes("return unsure"));
    assert.equal(
      JSON.parse(prepared.prompt.split("\n").at(-1)!).sourceLines[0].text,
      source,
    );
  });
}
