import { runNpm } from "./run-npm.mjs";

// A clean clone has neither workspace dist declarations nor generated protocol validators.
// Use the packages' own build hooks and keep the compilers sequential.
for (const workspace of ["highlight", "client", "plugin", "expo-two-way-audio"]) {
  runNpm(["run", "build", `--workspace=@getpaseo/${workspace}`]);
}
runNpm(["run", "build:mermaid-runtime", "--workspace=@getpaseo/app"]);
runNpm(["run", "build:document-preview", "--workspace=@getpaseo/app"]);
