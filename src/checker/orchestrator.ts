import { unsure } from "../ai/router.ts";
import type { ModelRouter } from "../ai/router.ts";
import type { ConstraintResult, SemanticInput } from "../ai/types.ts";

/** Explicit routing boundary for the future G5 adapter. Hard-rule unsure remains final. */
type Routing =
  | { kind: "semantic"; constraintId: string }
  | ({ kind: "hard-rule" } & Pick<
      ConstraintResult,
      "constraintId" | "evidence" | "verdict"
    >);

export async function orchestrate(
  input: SemanticInput,
  router: Pick<ModelRouter, "evaluate">,
  routes: readonly Routing[],
  signal?: AbortSignal,
): Promise<ConstraintResult[]> {
  const byId = new Map<string, Routing>();
  const duplicate = new Set<string>();
  for (const route of routes) {
    if (byId.has(route.constraintId)) duplicate.add(route.constraintId);
    byId.set(route.constraintId, route);
  }
  const semantic = input.constraints.filter(
    ({ id }) => byId.get(id)?.kind === "semantic" && !duplicate.has(id),
  );
  const model = semantic.length
    ? await router.evaluate({ ...input, constraints: semantic }, signal)
    : [];
  const evaluated = new Map(model.map((r) => [r.constraintId, r]));
  return input.constraints.map(({ id }) => {
    const decision = byId.get(id);
    if (duplicate.has(id) || !decision) return unsure(id, "unconfigured");
    if (decision.kind === "semantic")
      return evaluated.get(id) ?? unsure(id, "invalid_schema");
    return {
      constraintId: id,
      verdict: decision.verdict,
      evidence: decision.evidence,
      source: "hard-rule",
    };
  });
}
