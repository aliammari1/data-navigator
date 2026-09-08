/**
 * Drizzle Kit config for the Moudir chat history database (`chat.db` under
 * <userData>/databases).
 *
 * One of three SQLite databases owned by this project — see
 * `drizzle.config.ts` and `drizzle.settings.config.ts` for the others.
 * Each lives in its own SQLite file, needs its own migration journal, and
 * therefore its own config (Drizzle Kit's `Config` shape is flat — no
 * `projects: [...]` array exists). See:
 * https://orm.drizzle.team/docs/drizzle-config-file
 *   > "You can have multiple config files in the project, it's very useful
 *   >  when you have multiple database stages or multiple databases or
 *   >  different databases on the same project"
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle/chat",
  schema: "./src/db/schema-chat.ts",
  dialect: "sqlite",
});
