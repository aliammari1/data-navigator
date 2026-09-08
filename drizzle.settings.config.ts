/**
 * Drizzle Kit config for the per-domain settings + analytics databases
 * (`settings.db`, `analytics.db` under <userData>/databases).
 *
 * One of three SQLite databases owned by this project — see
 * `drizzle.config.ts` and `drizzle.chat.config.ts` for the others. Each
 * lives in its own SQLite file, needs its own migration journal, and
 * therefore its own config (Drizzle Kit's `Config` shape is flat — no
 * `projects: [...]` array exists). See:
 * https://orm.drizzle.team/docs/drizzle-config-file
 *   > "You can have multiple config files in the project, it's very useful
 *   >  when you have multiple database stages or multiple databases or
 *   >  different databases on the same project"
 *
 * Note: `analytics.db` is a separate runtime file but shares these tables
 * (the namespace→file split lives in `electron/settings-store.ts`), so a
 * single Drizzle config and one migration journal cover both.
 */

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle/settings",
  schema: "./src/db/schema-settings.ts",
  dialect: "sqlite",
});
