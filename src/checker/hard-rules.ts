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

type LexicalFacts = {
  namespaceAliases: Map<string, string>;
  usingNamespaces: Set<string>;
  usingNames: Map<string, string[]>;
  macros: Map<string, Token[]>;
  namespaces: Array<string | undefined>;
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

function matchesName(
  tokens: Token[],
  index: number,
  parts: string[],
  aliases: Map<string, string>,
): { terminal: Token; next: number } | undefined {
  let cursor = index;
  for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
    const actual = tokens[cursor]?.value;
    const expected = parts[partIndex];
    if (
      actual !== expected &&
      !(partIndex === 0 && aliases.get(actual ?? "") === expected)
    ) {
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
  return { terminal: tokens[cursor - 1]!, next: cursor };
}

function lexicalFacts(tokens: Token[]): LexicalFacts {
  const namespaceAliases = new Map<string, string>();
  const usingNamespaces = new Set<string>();
  const usingNames = new Map<string, string[]>();
  const macros = new Map<string, Token[]>();
  const namespaces: Array<string | undefined> = [];
  const scopes: Array<string | undefined> = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    namespaces.push([...scopes].reverse().find((scope) => scope !== undefined));
    if (
      token.value === "using" &&
      tokens[index + 1]?.value === "namespace" &&
      tokens[index + 2] !== undefined
    ) {
      usingNamespaces.add(tokens[index + 2]!.value);
    }
    if (
      token.value === "using" &&
      tokens[index + 1] !== undefined &&
      tokens[index + 2]?.value === "::" &&
      tokens[index + 3] !== undefined
    ) {
      usingNames.set(tokens[index + 3]!.value, [
        tokens[index + 1]!.value,
        tokens[index + 3]!.value,
      ]);
    }
    if (
      token.value === "namespace" &&
      tokens[index + 1] !== undefined &&
      tokens[index + 2]?.value === "=" &&
      tokens[index + 3] !== undefined
    ) {
      namespaceAliases.set(tokens[index + 1]!.value, tokens[index + 3]!.value);
    }
    if (
      token.value === "#" &&
      tokens[index + 1]?.value === "define" &&
      tokens[index + 2] !== undefined
    ) {
      const name = tokens[index + 2]!;
      const replacement: Token[] = [];
      for (
        let cursor = index + 3;
        tokens[cursor]?.line === token.line;
        cursor += 1
      ) {
        replacement.push(tokens[cursor]!);
      }
      macros.set(name.value, replacement);
    }
    if (token.value === "{") {
      scopes.push(
        tokens[index - 2]?.value === "namespace"
          ? tokens[index - 1]?.value
          : undefined,
      );
    }
    if (token.value === "}") {
      scopes.pop();
    }
  }
  return { namespaceAliases, usingNamespaces, usingNames, macros, namespaces };
}

function isBannedUse(
  tokens: Token[],
  index: number,
  match: { terminal: Token; next: number },
): boolean {
  const next = tokens[match.next]?.value;
  if (next === "(" || next === "<") return true;
  return ["for", "while", "do", "goto"].includes(tokens[index]!.value);
}

function isPreprocessorToken(tokens: Token[], index: number): boolean {
  const line = tokens[index]!.line;
  for (
    let cursor = index;
    cursor >= 0 && tokens[cursor]!.line === line;
    cursor -= 1
  ) {
    if (tokens[cursor]!.value === "#") return true;
  }
  return false;
}

function isDeclaredFunction(
  tokens: Token[],
  facts: LexicalFacts,
  index: number,
  terminal: string,
): boolean {
  const namespace = facts.namespaces[index];
  for (let cursor = 0; cursor < tokens.length; cursor += 1) {
    if (
      tokens[cursor]?.value === terminal &&
      tokens[cursor + 1]?.value === "(" &&
      facts.namespaces[cursor] === namespace &&
      ["void", "int", "auto", "long", "char", "bool"].includes(
        tokens[cursor - 1]?.value ?? "",
      )
    ) {
      return true;
    }
  }
  return false;
}

function hasRelevantMacro(
  tokens: Token[],
  facts: LexicalFacts,
  parts: string[],
): boolean {
  for (const [name, replacement] of facts.macros) {
    const match = replacement.findIndex((_, index) =>
      matchesName(replacement, index, parts, facts.namespaceAliases),
    );
    if (
      match !== -1 &&
      tokens.some(
        (token, index) =>
          token.value === name &&
          tokens[index + 1]?.value === "(" &&
          !isPreprocessorToken(tokens, index),
      )
    ) {
      return true;
    }
  }
  return false;
}

function macroViolation(
  tokens: Token[],
  facts: LexicalFacts,
  parts: string[],
): Token | undefined {
  for (const [name, replacement] of facts.macros) {
    const invoked = tokens.some(
      (token, index) =>
        token.value === name &&
        tokens[index + 1]?.value === "(" &&
        !isPreprocessorToken(tokens, index),
    );
    if (!invoked) continue;

    for (let index = 0; index < replacement.length; index += 1) {
      const match = matchesName(
        replacement,
        index,
        parts,
        facts.namespaceAliases,
      );
      if (match !== undefined && isBannedUse(replacement, index, match)) {
        return tokens.find(
          (token, tokenIndex) =>
            token.value === name && isPreprocessorToken(tokens, tokenIndex),
        );
      }
    }
  }
  return undefined;
}

function evaluateBanList(
  tokens: Token[],
  sourceLines: string[],
  names: string[],
): Pick<ConstraintEvaluation, "verdict" | "evidence"> {
  const facts = lexicalFacts(tokens);
  let uncertain = false;
  for (const name of names) {
    const parts = qualifiedNameParts(name);
    if (parts === undefined) {
      uncertain = true;
      continue;
    }
    for (let index = 0; index < tokens.length; index += 1) {
      if (isPreprocessorToken(tokens, index)) continue;
      const match = matchesName(tokens, index, parts, facts.namespaceAliases);
      if (match !== undefined && isBannedUse(tokens, index, match)) {
        return {
          verdict: "violation",
          evidence: [
            {
              line: match.terminal.line,
              text: sourceLines[match.terminal.line - 1] ?? "",
            },
          ],
        };
      }
    }
    const root = parts[0]!;
    const terminal = parts.at(-1)!;
    const imported =
      parts.length > 1 &&
      (facts.usingNamespaces.has(root) ||
        facts.usingNames.get(terminal)?.join("::") === parts.join("::"));
    if (imported || parts.length === 1) {
      for (let index = 0; index < tokens.length; index += 1) {
        if (
          isPreprocessorToken(tokens, index) ||
          tokens[index]?.value !== terminal ||
          tokens[index - 1]?.value === "::"
        ) {
          continue;
        }
        const match = { terminal: tokens[index]!, next: index + 1 };
        if (!isBannedUse(tokens, index, match)) continue;
        if (
          facts.namespaces[index] !== undefined &&
          facts.namespaces[index] !== root
        ) {
          if (isDeclaredFunction(tokens, facts, index, terminal)) continue;
          uncertain = true;
          continue;
        }
        if (isDeclaredFunction(tokens, facts, index, terminal)) {
          uncertain = true;
          continue;
        }
        return {
          verdict: "violation",
          evidence: [
            {
              line: match.terminal.line,
              text: sourceLines[match.terminal.line - 1] ?? "",
            },
          ],
        };
      }
    }
    const macroEvidence = macroViolation(tokens, facts, parts);
    if (macroEvidence !== undefined) {
      return {
        verdict: "violation",
        evidence: [
          {
            line: macroEvidence.line,
            text: sourceLines[macroEvidence.line - 1] ?? "",
          },
        ],
      };
    }
    if (hasRelevantMacro(tokens, facts, parts)) {
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
