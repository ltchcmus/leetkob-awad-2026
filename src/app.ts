import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { WorkflowRepository } from "./db/workflow-repository.ts";
import { WorkflowError } from "./queue/types.ts";
import type { ReviewDecision } from "./queue/types.ts";
import { Problem, problems } from "./problem.ts";
import type { FieldError } from "./problem.ts";
import type { Principal, PublicationRepository } from "./repository.ts";

export interface AppOptions {
  repository: PublicationRepository;
  authenticate: (request: IncomingMessage) => Principal | undefined;
  clock?: () => Date;
}

const securityHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function sendProblem(
  res: ServerResponse,
  problem: Problem,
  instance: string,
  allowedMethod = "POST",
): void {
  const [status, title, detail] = problems[problem.kind];
  const extra: Record<string, string> = {};
  if (status === 401) extra["WWW-Authenticate"] = 'Bearer realm="leetkob"';
  if (status === 405) extra.Allow = allowedMethod;
  if (status === 503) extra["Retry-After"] = "1";
  res.writeHead(status, {
    ...securityHeaders,
    ...extra,
    "Content-Type": "application/problem+json",
  });
  res.end(
    JSON.stringify({
      type: `https://leetkob.example/problems/${problem.kind}`,
      title,
      status,
      detail,
      instance,
      ...(problem.errors ? { errors: problem.errors } : {}),
    }),
  );
}

async function readObject(
  request: IncomingMessage,
  url: URL,
): Promise<Record<string, unknown>> {
  const contentType = request.headers["content-type"] ?? "";
  const encoding = request.headers["content-encoding"];
  if (
    !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(
      contentType,
    ) ||
    (encoding !== undefined && encoding.toLowerCase() !== "identity")
  ) {
    throw new Problem("unsupported-media-type");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += bytes.byteLength;
    if (size > 4096) throw new Problem("payload-too-large");
    chunks.push(bytes);
  }
  let body: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
    body = JSON.parse(text);
  } catch {
    throw new Problem("invalid-json");
  }
  const errors: FieldError[] = [];
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    errors.push({ pointer: "", detail: "must be a JSON object" });
  }
  for (const parameter of new Set(url.searchParams.keys())) {
    errors.push({ parameter, detail: "query parameters are not supported" });
  }
  if (errors.length) throw new Problem("validation", errors);
  return body as Record<string, unknown>;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    ...securityHeaders,
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(body));
}

function workflow(repository: PublicationRepository): WorkflowRepository {
  if (!(repository instanceof WorkflowRepository))
    throw new Problem("not-found");
  return repository;
}

function labInput(body: Record<string, unknown>) {
  const errors: FieldError[] = [];
  const classId = body.classId;
  const statement = body.statement;
  const deadline = body.deadline;
  const tests = body.tests;
  const constraints = body.constraints;
  if (!Number.isSafeInteger(classId) || (classId as number) < 1)
    errors.push({ pointer: "/classId", detail: "must be a positive integer" });
  if (typeof statement !== "string")
    errors.push({ pointer: "/statement", detail: "must be a string" });
  if (typeof deadline !== "string")
    errors.push({ pointer: "/deadline", detail: "must be an ISO timestamp" });
  if (!Array.isArray(tests))
    errors.push({ pointer: "/tests", detail: "must be an array" });
  if (!Array.isArray(constraints))
    errors.push({ pointer: "/constraints", detail: "must be an array" });
  if (errors.length || !Array.isArray(tests) || !Array.isArray(constraints))
    throw new Problem("validation", errors);

  const parsedTests = tests.map((item, index) => {
    if (
      item === null ||
      typeof item !== "object" ||
      typeof item.input !== "string" ||
      typeof item.expectedOutput !== "string"
    )
      throw new Problem("validation", [
        {
          pointer: `/tests/${index}`,
          detail: "must contain string input and expectedOutput",
        },
      ]);
    return { input: item.input, expectedOutput: item.expectedOutput };
  });
  const parsedConstraints = constraints.map((item, index) => {
    if (
      item === null ||
      typeof item !== "object" ||
      typeof item.id !== "string" ||
      typeof item.text !== "string" ||
      !Number.isInteger(item.deductionTenths)
    )
      throw new Problem("validation", [
        {
          pointer: `/constraints/${index}`,
          detail: "must contain id, text and integer deductionTenths",
        },
      ]);
    return {
      id: item.id,
      text: item.text,
      deductionTenths: item.deductionTenths,
    };
  });
  return {
    classId: classId as number,
    statement: statement as string,
    deadline: deadline as string,
    tests: parsedTests,
    constraints: parsedConstraints,
  };
}

function submissionInput(
  request: IncomingMessage,
  body: Record<string, unknown>,
) {
  if (typeof body.source !== "string")
    throw new Problem("validation", [
      { pointer: "/source", detail: "must be a string" },
    ]);
  const header = request.headers["idempotency-key"];
  if (Array.isArray(header))
    throw new Problem("validation", [
      { parameter: "Idempotency-Key", detail: "must occur once" },
    ]);
  return { source: body.source, ...(header ? { idempotencyKey: header } : {}) };
}

function reviewDecisionInput(body: Record<string, unknown>): ReviewDecision {
  const errors: FieldError[] = [];
  const decision = body.decision;
  const evidence = body.evidence;
  const reason = body.reason;
  const expectedVersion = body.expectedVersion;
  if (decision !== "pass" && decision !== "violation")
    errors.push({ pointer: "/decision", detail: "must be pass or violation" });
  if (!Array.isArray(evidence))
    errors.push({ pointer: "/evidence", detail: "must be an array" });
  if (typeof reason !== "string")
    errors.push({ pointer: "/reason", detail: "must be a string" });
  if (!Number.isSafeInteger(expectedVersion) || (expectedVersion as number) < 0)
    errors.push({
      pointer: "/expectedVersion",
      detail: "must be a nonnegative integer",
    });
  if (errors.length || !Array.isArray(evidence))
    throw new Problem("validation", errors);
  const parsedEvidence = evidence.map((line, index) => {
    if (
      line === null ||
      typeof line !== "object" ||
      !Number.isSafeInteger(line.line) ||
      line.line < 1 ||
      typeof line.text !== "string"
    )
      throw new Problem("validation", [
        {
          pointer: `/evidence/${index}`,
          detail: "must contain a positive line number and text",
        },
      ]);
    return { line: line.line, text: line.text };
  });
  return {
    decision: decision as ReviewDecision["decision"],
    evidence: parsedEvidence,
    reason: reason as string,
    expectedVersion: expectedVersion as number,
  };
}

function asProblem(error: unknown): Problem {
  if (error instanceof Problem) return error;
  if (error instanceof WorkflowError)
    return error.code === "invalid-input"
      ? new Problem("validation")
      : new Problem("workflow-conflict");
  return new Problem("internal");
}

export function createApp(options: AppOptions): Server {
  return createServer((request, response) => {
    let instance = "/v1";
    let allowedMethod = "POST";
    async function handle(): Promise<void> {
      const target = request.url ?? "/";
      const queryStart = target.indexOf("?");
      const rawPath = queryStart === -1 ? target : target.slice(0, queryStart);
      const publish = /^\/v1\/labs\/([1-9][0-9]*)\/publish$/.exec(rawPath);
      const submission = /^\/v1\/labs\/([1-9][0-9]*)\/submissions$/.exec(
        rawPath,
      );
      const reviews = /^\/v1\/labs\/([1-9][0-9]*)\/reviews$/.exec(rawPath);
      const lab = /^\/v1\/labs\/([1-9][0-9]*)$/.exec(rawPath);
      const status = /^\/v1\/submissions\/([0-9a-f-]{36})$/.exec(rawPath);
      const reviewDecision = /^\/v1\/reviews\/([0-9a-f-]{36})\/decision$/.exec(
        rawPath,
      );
      const isCreateLab = rawPath === "/v1/labs";
      const route = publish ?? submission ?? reviews ?? lab;
      const labId = Number(route?.[1]);
      if (
        (!route && !status && !reviewDecision && !isCreateLab) ||
        (route && !Number.isSafeInteger(labId))
      )
        throw new Problem("not-found");
      const expectedMethod =
        publish || submission || reviewDecision || isCreateLab ? "POST" : "GET";
      allowedMethod = expectedMethod;
      instance = publish
        ? `/v1/labs/${labId}/publish`
        : submission
          ? `/v1/labs/${labId}/submissions`
          : reviews
            ? `/v1/labs/${labId}/reviews`
            : lab
              ? `/v1/labs/${labId}`
              : reviewDecision
                ? `/v1/reviews/${reviewDecision[1]}/decision`
                : status
                  ? `/v1/submissions/${status[1]}`
                  : "/v1/labs";
      const url = new URL(target, "http://localhost");
      if (request.method !== expectedMethod)
        throw new Problem("method-not-allowed");
      const principal = options.authenticate(request);
      if (!principal) throw new Problem("authentication-required");
      if (publish) {
        if (principal.role !== "ta") throw new Problem("forbidden");
        options.repository.assertAccess(labId, principal);
        await readObject(request, url);
        const result = options.repository.publish(
          labId,
          principal,
          (options.clock ?? (() => new Date()))(),
        );
        response.writeHead(200, {
          ...securityHeaders,
          "Content-Type": "application/json",
          ...(result.replayed ? { "Idempotent-Replayed": "true" } : {}),
        });
        response.end(result.receipt);
        return;
      }

      const repository = workflow(options.repository);
      if (reviewDecision) {
        repository.reviewConstraint(
          principal,
          reviewDecision[1]!,
          reviewDecisionInput(await readObject(request, url)),
          (options.clock ?? (() => new Date()))().getTime(),
        );
        response.writeHead(204, securityHeaders);
        response.end();
        return;
      }
      if (isCreateLab) {
        const created = repository.createLab(
          principal,
          labInput(await readObject(request, url)),
        );
        sendJson(response, 201, { labId: created });
        return;
      }
      if (submission) {
        const receipt = repository.submit(
          principal,
          labId,
          submissionInput(request, await readObject(request, url)),
          (options.clock ?? (() => new Date()))().getTime(),
        );
        sendJson(response, 202, receipt);
        return;
      }
      if (status) {
        const result = repository.getSubmissionForStudent(
          principal,
          status[1]!,
        );
        sendJson(response, 200, {
          submissionId: result.submissionId,
          judgeVerdict: result.judgeVerdict,
        });
        return;
      }
      if (lab) {
        sendJson(response, 200, repository.getLabForTa(principal, labId));
        return;
      }
      sendJson(response, 200, repository.getReviewQueue(principal, labId));
    }
    void handle().catch((error: unknown) => {
      sendProblem(response, asProblem(error), instance, allowedMethod);
    });
  });
}
