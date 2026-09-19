import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// The connection string comes strictly from the environment (loaded from the
// root .env by dotenv) - no credentials live in this repository.
// See .env.example for the expected variables.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
