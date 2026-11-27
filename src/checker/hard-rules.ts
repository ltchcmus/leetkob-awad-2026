export type ConstraintVerdict = "pass" | "violation" | "unsure";

export type CheckerConstraint = {
  id: string;
  text: string;
  deductionTenths: number;
};

export type CheckerInput = {
  solution: string;
  statement: string;
  source: string;
  constraints: CheckerConstraint[];
};

export type EvidenceLine = {
  line: number;
  text: string;
};

export type ConstraintEvaluation = {
  constraintId: string;
  verdict: ConstraintVerdict;
  source: "hard-rule";
  evidence: EvidenceLine[];
};

export type CheckerOutput = {
  solution: string;
  evaluations: ConstraintEvaluation[];
};

export type HardRuleRoute =
  | { kind: "semantic"; constraintId: string }
  | ({ kind: "hard-rule" } & Omit<ConstraintEvaluation, "source">);

type Token = {
  value: string;
  line: number;
};

function isIdentifierStart(character: string): boolean {
  const code = character.charCodeAt(0);
  return (
    character === "_" ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  );
}

function isIdentifierPart(character: string): boolean {
  const code = character.charCodeAt(0);
  return isIdentifierStart(character) || (code >= 48 && code <= 57);
}

function countLines(text: string): number {
  let count = 0;
  for (const character of text) {
    if (character === "\n") {
      count += 1;
    }
  }
  return count;
}

function skipQuoted(source: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
    } else if (source[index] === quote) {
      return index + 1;
    } else {
      index += 1;
    }
  }
  return source.length;
}

function skipRawString(source: string, start: number): number | undefined {
  const opening = source.indexOf("(", start + 2);
  if (opening === -1) {
    return undefined;
  }
  const delimiter = source.slice(start + 2, opening);
  if (delimiter.length > 16) {
    return undefined;
  }
  for (const character of delimiter) {
    if (
      character === " " ||
      character === "\\" ||
      character === "(" ||
      character === ")" ||
      character === "\t" ||
      character === "\r" ||
      character === "\n"
    ) {
      return undefined;
    }
  }
  const closing = `)${delimiter}"`;
  const closeAt = source.indexOf(closing, opening + 1);
  return closeAt === -1 ? source.length : closeAt + closing.length;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;

  while (index < source.length) {
    const character = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (character === "\n") {
      line += 1;
      index += 1;
      continue;
    }
    if (character === "\r" || character === " " || character === "\t") {
      index += 1;
      continue;
    }
    if (character === "/" && next === "/") {
      const end = source.indexOf("\n", index + 2);
      index = end === -1 ? source.length : end;
      continue;
    }
    if (character === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      const after = end === -1 ? source.length : end + 2;
      line += countLines(source.slice(index, after));
      index = after;
      continue;
    }
    if (character === "R" && next === '"') {
      const after = skipRawString(source, index);
      if (after !== undefined) {
        line += countLines(source.slice(index, after));
        index = after;
        continue;
      }
    }
    if (character === '"' || character === "'") {
      const after = skipQuoted(source, index, character);
      line += countLines(source.slice(index, after));
      index = after;
      continue;
    }
    if (isIdentifierStart(character)) {
      const tokenLine = line;
      const start = index;
      index += 1;
      while (index < source.length && isIdentifierPart(source[index] ?? "")) {
        index += 1;
      }
      tokens.push({ value: source.slice(start, index), line: tokenLine });
      continue;
    }
    if (character === ":" && next === ":") {
      tokens.push({ value: "::", line });
      index += 2;
      continue;
    }
    tokens.push({ value: character, line });
    index += 1;
  }

  return tokens;
}

function parseBanNames(text: string): string[] | undefined {
  if (!text.startsWith("Do not use ") && !text.startsWith("Do not call ")) {
    return undefined;
  }
  const names: string[] = [];
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf("`", index);
    if (open === -1) {
      break;
    }
    const close = text.indexOf("`", open + 1);
    if (close === -1) {
      return undefined;
    }
    const name = text.slice(open + 1, close);
    if (name.length === 0) {
      return undefined;
    }
    names.push(name);
    index = close + 1;
  }
  return names.length === 0 ? undefined : names;
}

function qualifiedNameParts(name: string): string[] | undefined {
  const parts = name.split("::");
  if (
    parts.length === 0 ||
    parts.some(
      (part) =>
        !isIdentifierStart(part[0] ?? "") ||
        [...part].some((character) => !isIdentifierPart(character)),
    )
  ) {
    return undefined;
  }
  return parts;
}

function matchesQualifiedCall(
  tokens: Token[],
  index: number,
  parts: string[],
): Token | undefined {
  let cursor = index;
  for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
    if (tokens[cursor]?.value !== parts[partIndex]) {
      return undefined;
    }
    cursor += 1;
    if (partIndex < parts.length - 1) {
      if (tokens[cursor]?.value !== "::") {
        return undefined;
      }
      cursor += 1;
    }
  }
  if (tokens[cursor]?.value !== "(") {
    return undefined;
  }

  const previous = tokens[index - 1]?.value;
  if (
    previous === "using" ||
    previous === "typedef" ||
    previous === "void" ||
    previous === "int" ||
    previous === "auto" ||
    previous === "class" ||
    previous === "struct"
  ) {
    return undefined;
  }
  return tokens[cursor - 1];
}

function hasAmbiguousAlias(tokens: Token[], parts: string[]): boolean {
  const terminal = parts.at(-1);
  const root = parts[0];
  if (terminal === undefined || root === undefined) {
    return true;
  }

  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index]?.value === "using") {
      if (
        tokens[index + 1]?.value === "namespace" &&
        tokens[index + 2]?.value === root
      ) {
        return true;
      }
      if (
        tokens[index + 1]?.value === root &&
        tokens[index + 2]?.value === "::" &&
        tokens[index + 3]?.value === terminal
      ) {
        return true;
      }
    }
    if (
      tokens[index]?.value === "namespace" &&
      tokens[index + 2]?.value === "=" &&
      tokens[index + 3]?.value === root
    ) {
      return true;
    }
    if (tokens[index]?.value === "#" && tokens[index + 1]?.value === "define") {
      return true;
    }
  }
  return false;
}

function evaluateBanList(
  tokens: Token[],
  sourceLines: string[],
  names: string[],
): Pick<ConstraintEvaluation, "verdict" | "evidence"> {
  let uncertain = false;
  for (const name of names) {
    const parts = qualifiedNameParts(name);
    if (parts === undefined) {
      uncertain = true;
      continue;
    }
    for (let index = 0; index < tokens.length; index += 1) {
      const call = matchesQualifiedCall(tokens, index, parts);
      if (call !== undefined) {
        return {
          verdict: "violation",
          evidence: [
            { line: call.line, text: sourceLines[call.line - 1] ?? "" },
          ],
        };
      }
    }
    if (hasAmbiguousAlias(tokens, parts)) {
      uncertain = true;
    }
  }
  return uncertain
    ? { verdict: "unsure", evidence: [] }
    : { verdict: "pass", evidence: [] };
}

export function routeHardRules(input: CheckerInput): HardRuleRoute[] {
  const tokens = tokenize(input.source);
  const sourceLines = input.source
    .split("\n")
    .map((line) => line.replace(/\r$/, ""));
  return input.constraints.map((constraint) => {
    const names = parseBanNames(constraint.text);
    if (names === undefined) {
      if (!/^Do not (use|call)\b/u.test(constraint.text)) {
        return { kind: "semantic", constraintId: constraint.id };
      }
      return {
        kind: "hard-rule",
        constraintId: constraint.id,
        verdict: "unsure",
        evidence: [],
      };
    }
    return {
      kind: "hard-rule",
      constraintId: constraint.id,
      ...evaluateBanList(tokens, sourceLines, names),
    };
  });
}

export function evaluateHardRules(input: CheckerInput): CheckerOutput {
  return {
    solution: input.solution,
    evaluations: routeHardRules(input).map((route) => ({
      constraintId: route.constraintId,
      verdict: route.kind === "hard-rule" ? route.verdict : "unsure",
      evidence: route.kind === "hard-rule" ? route.evidence : [],
      source: "hard-rule",
    })),
  };
}
