import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? "" : process.env.VITE_API_URL || "http://localhost:3000",
});

export const {
  signIn,
  signUp,
  signOut,
  getSession,
  useSession,
} = authClient;
