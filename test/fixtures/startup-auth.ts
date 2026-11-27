import { syntheticAuthenticator } from "../../src/auth.ts";
export const authenticate = syntheticAuthenticator([
  { token: "public-synthetic-ta", principal: { id: "ta-product", role: "ta" } },
  {
    token: "public-synthetic-student",
    principal: { id: "student-product", role: "student" },
  },
]);
