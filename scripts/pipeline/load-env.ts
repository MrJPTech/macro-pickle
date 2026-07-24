/**
 * Side-effect module: load environment for pipeline scripts.
 * Imported first so GOOGLE_API_KEY (and friends) are available before any
 * client is constructed. Loads .env.local then .env (existing vars win, so the
 * an already-exported shell variable still takes precedence).
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();
