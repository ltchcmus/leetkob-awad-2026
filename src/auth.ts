import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Principal } from "./repository.ts";

export interface SyntheticAccount {
  token: string;
  principal: Principal;
}

/**
 * Builds a test/development-only bearer-token authenticator from caller-owned
 * synthetic accounts. It deliberately has no default credentials: deployment
 * configuration must provide the accounts it wants to accept.
 */
export function syntheticAuthenticator(
  accounts: readonly SyntheticAccount[],
): (request: IncomingMessage) => Principal | undefined {
  const seenTokens = new Set<string>();
  const preparedAccounts = accounts.map((account) => {
    if (account.token.length === 0) {
      throw new Error("synthetic account token must not be empty");
    }
    if (seenTokens.has(account.token)) {
      throw new Error("synthetic account tokens must be unique");
    }
    seenTokens.add(account.token);

    return {
      tokenHash: createHash("sha256").update(account.token).digest(),
      principal: account.principal,
    };
  });

  return (request) => {
    const header = request.headers.authorization;
    if (!header || !/^Bearer [^\s]+$/.test(header)) {
      return undefined;
    }

    const suppliedHash = createHash("sha256")
      .update(header.slice("Bearer ".length))
      .digest();
    let authenticated: Principal | undefined;

    for (const account of preparedAccounts) {
      if (timingSafeEqual(account.tokenHash, suppliedHash)) {
        authenticated = account.principal;
      }
    }

    return authenticated;
  };
}

export function demoAuthenticator(
  token: string,
): (request: IncomingMessage) => Principal | undefined {
  if (token.length < 32)
    throw new Error("DEMO_AUTH_TOKEN must have at least 32 characters.");
  const expected = createHash("sha256").update(token).digest();
  return (request) => {
    const header = request.headers.authorization;
    if (!header || !/^Bearer [^\s]+$/.test(header)) return undefined;
    const supplied = createHash("sha256").update(header.slice(7)).digest();
    return timingSafeEqual(expected, supplied)
      ? { id: "ta-demo", role: "ta" }
      : undefined;
  };
}
