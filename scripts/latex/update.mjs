import { parseArgs } from "node:util";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const { values } = parseArgs({
  options: {
    ref: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});
const ref = values.ref;
const validRef = ref === "upstream/main" || /^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(ref ?? "");
if (!validRef) throw new Error("Specify --ref v0.x.y or --ref upstream/main");
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", windowsHide: true }).trim();
}
function run({ command, args, cwd = repoRoot }) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    windowsHide: true,
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (git(["branch", "--show-current"]) !== "paseo-latex") {
  throw new Error("Switch to the paseo-latex maintenance branch before updating");
}
if (git(["status", "--porcelain"])) throw new Error("Commit your local changes before updating");
const upstream = git(["remote", "get-url", "upstream"]);
if (upstream !== "https://github.com/getpaseo/paseo.git") {
  throw new Error("The upstream remote must point to the official getpaseo/paseo repository");
}
if (!values["dry-run"]) run({ command: "git", args: ["fetch", "upstream", "--tags"] });
const target = git(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]);
process.stdout.write(
  `LaTeX maintenance branch: ${git(["rev-parse", "--short", "HEAD"])}\nUpstream target: ${ref} (${target})\n`,
);
if (!values["dry-run"]) {
  run({ command: "git", args: ["merge", "--no-edit", target] });
  run({ command: "npm", args: ["ci", "--ignore-scripts", "--no-audit", "--no-fund"] });
  run({ command: "npm", args: ["run", "postinstall"] });
  run({ command: "npm", args: ["run", "build:app-deps"] });
  run({ command: "npm", args: ["run", "build:math-assets", "--workspace=@getpaseo/app"] });
  run({
    command: "npm",
    args: [
      "run",
      "format:files",
      "--",
      "packages/app/src/components/markdown/math/assets.gen.ts",
      "packages/app/src/components/markdown/math/katex.gen.css",
    ],
  });
  run({ command: "npm", args: ["run", "typecheck", "--workspace=@getpaseo/app"] });
  run({ command: "npm", args: ["run", "lint"] });
  const tests = [
    "app.config.test.ts",
    "src/polyfills/initialize-navigator.test.ts",
    "src/utils/assistant-markdown-parser.test.ts",
    "src/utils/__tests__/split-markdown-blocks.test.ts",
    "src/components/markdown/html-ish.test.ts",
    "src/components/markdown/math/render.test.ts",
    "src/components/markdown/math/text-group.test.ts",
  ];
  run({
    command: "npm",
    args: ["run", "test", "--workspace=@getpaseo/app", "--", ...tests, "--bail=1"],
  });
  run({ command: "git", args: ["diff", "--check"] });
  process.stdout.write(
    "Upstream merge and client checks completed. Build and test your APK before installing it.\n",
  );
}
