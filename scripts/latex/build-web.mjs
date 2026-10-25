import path from "node:path";
import { repoRoot, runNpm } from "./run-npm.mjs";

runNpm(["run", "latex:prepare"]);
runNpm(["exec", "--", "expo", "export", "--platform", "web"], {
  cwd: path.join(repoRoot, "packages/app"),
  env: { ...process.env, APP_VARIANT: "latex", CI: "1", EXPO_NO_TELEMETRY: "1" },
});
