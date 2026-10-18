import "server-only";

/**
 * Environment access. Values are read lazily so `next build` does not need
 * production secrets; anything missing fails loudly on first use at runtime.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const env = {
  get mongoUri() {
    return required("MONGODB_URI");
  },
  get mongoDb() {
    return process.env.MONGODB_DB || "chasis_erp";
  },
  get authSecret() {
    const secret = required("AUTH_SECRET");
    if (secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
    return secret;
  },
  get adminUsername() {
    return (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
  },
  get adminInitialPassword() {
    return process.env.ADMIN_INITIAL_PASSWORD || "chasis";
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
};
