import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
export const signingDirectory = path.resolve(
  process.env.PASEO_LATEX_SIGNING_DIR ?? path.join(repoRoot, "../paseo-latex-signing"),
);
const credentialsPath = path.join(signingDirectory, "credentials.json");
const keystorePath = path.join(signingDirectory, "release.keystore");

export function loadSigningEnvironment() {
  if (!fs.existsSync(keystorePath) || !fs.existsSync(credentialsPath)) {
    throw new Error("Run npm run latex:keygen once before building the LaTeX APK");
  }
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  const validCredentials =
    typeof credentials.password === "string" &&
    credentials.password.length >= 24 &&
    credentials.alias === "paseo-latex";
  if (!validCredentials) throw new Error("Invalid Paseo LaTeX signing credentials");
  return {
    PASEO_LATEX_KEYSTORE: keystorePath,
    PASEO_LATEX_STORE_PASSWORD: credentials.password,
    PASEO_LATEX_KEY_PASSWORD: credentials.password,
    PASEO_LATEX_KEY_ALIAS: credentials.alias,
  };
}

function initializeSigning() {
  if (fs.existsSync(credentialsPath) || fs.existsSync(keystorePath)) {
    loadSigningEnvironment();
    process.stdout.write(`Reusing the existing signing key in ${signingDirectory}\n`);
    return;
  }
  const password = crypto.randomBytes(32).toString("base64url");
  const alias = "paseo-latex";
  fs.mkdirSync(signingDirectory, { recursive: true });
  const executable = process.platform === "win32" ? "keytool.exe" : "keytool";
  const keytool = process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, "bin", executable)
    : executable;
  const result = spawnSync(
    keytool,
    [
      "-genkeypair",
      "-keystore",
      keystorePath,
      "-storetype",
      "PKCS12",
      "-alias",
      alias,
      "-keyalg",
      "RSA",
      "-keysize",
      "3072",
      "-validity",
      "10000",
      "-dname",
      "CN=Paseo LaTeX Personal Build",
      "-storepass:env",
      "PASEO_LATEX_STORE_PASSWORD",
      "-keypass:env",
      "PASEO_LATEX_KEY_PASSWORD",
    ],
    {
      env: {
        ...process.env,
        PASEO_LATEX_STORE_PASSWORD: password,
        PASEO_LATEX_KEY_PASSWORD: password,
      },
      encoding: "utf8",
      windowsHide: true,
    },
  );
  if (result.error)
    throw new Error("keytool could not start; set JAVA_HOME to your JDK 21 directory");
  if (result.status !== 0) throw new Error(`Signing key generation failed: ${result.stderr}`);
  fs.writeFileSync(credentialsPath, JSON.stringify({ alias, password }, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(
    `Created the personal signing key in ${signingDirectory}\nBack up both files in this directory; all future upgrades reuse this key.\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  initializeSigning();
}
