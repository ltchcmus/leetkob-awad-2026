function mask(text: string) {
  return text.replace(/[^\r\n]/gu, " ");
}

/** Preserve physical lines and leave C++ string, character and raw literals intact. */
export function stripComments(source: string): string | undefined {
  // Reject phase-1/2 rewrites that can turn an apparent token into a comment.
  if (/\\[\t ]*\r?\n|\?\?\/|\r(?!\n)/u.test(source)) return;
  const parts: string[] = [];
  const token =
    /\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|(?:u8|u|U|L)?R"([^\s()\\]{0,16})\(|"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'|[0-9][\w.]*(?:'[0-9A-Za-z_]+)*|[A-Za-z_]\w*/y;
  let offset = 0;
  while (offset < source.length) {
    token.lastIndex = offset;
    const matched = token.exec(source);
    if (!matched) {
      if (
        source.startsWith("/*", offset) ||
        source[offset] === '"' ||
        source[offset] === "'"
      )
        return;
      parts.push(source[offset]!);
      offset++;
      continue;
    }
    const value = matched[0];
    offset = token.lastIndex;
    if (matched[1] !== undefined) {
      const delimiter = ")" + matched[1] + '"';
      const end = source.indexOf(delimiter, offset);
      if (end < 0) return;
      parts.push(value + source.slice(offset, end + delimiter.length));
      offset = end + delimiter.length;
    } else {
      parts.push(value.startsWith("/") ? mask(value) : value);
    }
  }
  return parts.join("");
}

export function redactIdentity(value: string, identities: readonly string[]) {
  let text = value;
  for (const identity of identities) {
    if (identity.trim()) {
      const literal = identity.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&");
      text = text.replace(new RegExp(literal, "giu"), mask);
    }
  }
  return text.replace(
    /[\w.!#$%&'*+/=?^\x60{|}~-]+@[\w.-]+\.[a-z]{2,}/giu,
    mask,
  );
}
