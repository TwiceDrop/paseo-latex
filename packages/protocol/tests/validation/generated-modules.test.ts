import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("bounds generated validator modules so bundlers do not parse the whole protocol at once", async () => {
  const directory = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../src/generated/validation",
  );
  const files = (await readdir(directory)).filter((name) =>
    /^ws-outbound(?:\.part-\d+)?\.aot\.ts$/.test(name),
  );
  const sizes = await Promise.all(
    files.map(async (name) => (await readFile(resolve(directory, name))).byteLength),
  );
  expect(files.length).toBeGreaterThan(1);
  expect(Math.max(...sizes)).toBeLessThan(1_000_000);
});
