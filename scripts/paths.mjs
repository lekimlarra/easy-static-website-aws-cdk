// Where things are. Nothing else.
//
// This module exists so that "npm run setup" can find the .env template on a
// clone that has no node_modules yet. Everything else about the environment
// lives in env.mjs, which needs dotenv, which is precisely what is not
// installed at that point.
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const envFile = path.join(repoRoot, ".env");
export const envTemplateFile = path.join(repoRoot, ".env.template");
