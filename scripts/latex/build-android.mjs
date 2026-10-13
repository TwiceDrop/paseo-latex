import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadSigningEnvironment } from "./signing.mjs";

const { values } = parseArgs({
  options: {
    "prepare-only": { type: "boolean", default: false },
    revision: { type: "string", default: "1" },
    arch: { type: "string" },
    "low-memory": { type: "boolean", default: false },
  },
});
if (!/^[1-9]\d?$/.test(values.revision)) throw new Error("--revision must be 1 through 99");
const supportedArchitectures = new Set(["armeabi-v7a", "arm64-v8a", "x86", "x86_64"]);
const requestedArchitectures = values.arch?.split(",");
if (
  requestedArchitectures &&
  (requestedArchitectures.some((arch) => !supportedArchitectures.has(arch)) ||
    new Set(requestedArchitectures).size !== requestedArchitectures.length)
)
  throw new Error("Unsupported Android architecture");
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const appRoot = path.join(repoRoot, "packages/app");
const androidRoot = path.join(appRoot, "android");
if (!path.resolve(androidRoot).startsWith(path.resolve(repoRoot) + path.sep)) {
  throw new Error("The Android prebuild target must stay inside this checkout");
}
const env = {
  ...process.env,
  ...loadSigningEnvironment(),
  APP_VARIANT: "latex",
  PASEO_LATEX_REVISION: values.revision,
  CI: "1",
};

function run({ command, args, cwd }) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: "inherit",
    windowsHide: true,
    shell: process.platform === "win32" && ["npm", "npx"].includes(command),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run({
  command: "npm",
  args: ["run", "build:math-assets", "--workspace=@getpaseo/app"],
  cwd: repoRoot,
});
run({
  command: "npm",
  args: [
    "run",
    "format:files",
    "--",
    "packages/app/src/components/markdown/math/assets.gen.ts",
    "packages/app/src/components/markdown/math/katex.gen.css",
  ],
  cwd: repoRoot,
});
run({
  command: "npx",
  args: ["--no-install", "expo", "prebuild", "--platform", "android", "--no-install", "--clean"],
  cwd: appRoot,
});
if (values["prepare-only"]) {
  process.stdout.write(
    "Prepared Paseo LaTeX (sh.paseo.latex) with personal release signing. No APK was built.\n",
  );
} else {
  run({ command: "npm", args: ["run", "build:app-deps"], cwd: repoRoot });
  const gradleArgs = [
    ":app:assembleRelease",
    "--no-daemon",
    values["low-memory"] ? "--max-workers=1" : "--max-workers=2",
    "-Dorg.gradle.parallel=false",
  ];
  if (values.arch) gradleArgs.push(`-PreactNativeArchitectures=${values.arch}`);
  if (values["low-memory"]) {
    gradleArgs.push(
      "-PpaseoLatexLowMemoryBuild=true",
      "-Pkotlin.compiler.execution.strategy=in-process",
    );
  }
  if (process.platform === "win32") {
    const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin/java.exe") : "java";
    run({
      command: java,
      args: [
        "-classpath",
        path.join(androidRoot, "gradle/wrapper/gradle-wrapper.jar"),
        "org.gradle.wrapper.GradleWrapperMain",
        ...gradleArgs,
      ],
      cwd: androidRoot,
    });
  } else {
    run({ command: "./gradlew", args: gradleArgs, cwd: androidRoot });
  }
  const version = JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"), "utf8")).version;
  const artifact = path.join(
    repoRoot,
    "artifacts",
    `paseo-latex-${version}-r${values.revision}.apk`,
  );
  fs.mkdirSync(path.dirname(artifact), { recursive: true });
  fs.copyFileSync(
    path.join(androidRoot, "app/build/outputs/apk/release/app-release.apk"),
    artifact,
  );
  process.stdout.write(`Signed APK: ${artifact}\n`);
}
