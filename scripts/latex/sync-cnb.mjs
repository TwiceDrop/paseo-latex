import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const githubRepo = "TwiceDrop/paseo-latex";
const cnbRepo = "twicedrop/paseo-latex";
const apiBase = `https://api.cnb.cool/${cnbRepo}/-/releases`;
const tagPattern = /^latex-v\d+\.\d+\.\d+-r[1-9]\d?$/;

export function releaseFiles(release) {
  if (!tagPattern.test(release.tag_name) || release.draft || release.prerelease) {
    throw new Error("Expected a published stable personal release");
  }
  const version = release.tag_name.slice("latex-v".length);
  const names = [
    `paseo-latex-${version}.apk`,
    `Paseo-LaTeX-Setup-${version}-x64.exe`,
    "SHA256SUMS.txt",
  ];
  if (release.assets.length !== names.length) {
    throw new Error("Release must contain exactly the APK, EXE and SHA256SUMS.txt");
  }
  return names.map((name) => {
    const asset = release.assets.find((candidate) => candidate.name === name);
    if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest) || !(asset.size > 0)) {
      throw new Error(`Missing release asset or SHA-256 digest: ${name}`);
    }
    return asset;
  });
}

export function verifySums(text, assets) {
  const lines = text.trim().split(/\r?\n/);
  const installers = assets.filter((asset) => asset.name !== "SHA256SUMS.txt");
  if (
    lines.length !== installers.length ||
    installers.some((asset) => !lines.includes(`${asset.digest.slice(7)}  ${asset.name}`))
  ) {
    throw new Error("Installer checksum manifest disagrees with GitHub asset digests");
  }
}

export async function verifyContent(stream, expected) {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > expected.size) throw new Error(`Size mismatch: ${expected.name}`);
    hash.update(chunk);
  }
  if (size !== expected.size || `sha256:${hash.digest("hex")}` !== expected.digest) {
    throw new Error(`Size or SHA-256 mismatch: ${expected.name}`);
  }
}

export function publicationPatch(source, target, commit, latestTag) {
  if (target.tag_name !== source.tag_name || target.tag_commitish !== commit) {
    throw new Error("CNB release tag does not match the GitHub source commit");
  }
  return {
    name: source.name || source.tag_name,
    body: `${source.body || ""}\n\nGitHub: https://github.com/${githubRepo}/releases/tag/${source.tag_name}\nSource: ${commit}\n`,
    draft: false,
    prerelease: false,
    make_latest: source.tag_name === latestTag ? "true" : "false",
  };
}

function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    // Do not print commands, environment, or Git HTTP tracing with CI credentials.
    const operation = program === "git" && args.includes("push") ? "git push to CNB" : program;
    throw new Error(
      `${operation} failed (exit ${result.status}); check repository access and permissions`,
    );
  }
  return result.stdout?.trim() || "";
}

function githubRelease(tag = "latest") {
  if (tag !== "latest" && !tagPattern.test(tag)) throw new Error("Invalid personal release tag");
  const suffix = tag === "latest" ? "latest" : `tags/${tag}`;
  return JSON.parse(command("gh", ["api", `repos/${githubRepo}/releases/${suffix}`]));
}

async function request(url, options, label) {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(10 * 60 * 1000), ...options });
  } catch (cause) {
    throw new Error(`${label}: network request failed`, { cause });
  }
}

function apiURL(path) {
  const url = new URL(path.startsWith("/") ? `${apiBase}${path}` : path);
  if (
    url.origin !== "https://api.cnb.cool" ||
    !url.pathname.startsWith(`/${cnbRepo}/-/releases/`)
  ) {
    if (url.href !== apiBase) throw new Error("Unexpected CNB API destination");
  }
  return url;
}

async function cnb(path, { method = "GET", body, allowMissing = false } = {}) {
  const response = await request(
    apiURL(path),
    {
      method,
      redirect: "error",
      headers: {
        Authorization: `Bearer ${process.env.CNB_TOKEN}`,
        Accept: "application/vnd.cnb.api+json",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    `CNB ${method}`,
  );
  if (response.status === 404 && allowMissing) return null;
  if (!response.ok)
    throw new Error(
      `CNB ${method} failed: HTTP ${response.status} (check CNB_TOKEN repository scope and repo-code/repo-release permissions)`,
    );
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function httpsURL(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("CNB asset transport must use HTTPS without embedded credentials");
  }
  return url;
}

async function verifyRemote(tag, asset, authenticated) {
  const path = `/download/${encodeURIComponent(tag)}/${encodeURIComponent(asset.name)}`;
  let response;
  if (authenticated) {
    response = await request(
      apiURL(path),
      {
        redirect: "manual",
        headers: { Authorization: `Bearer ${process.env.CNB_TOKEN}` },
      },
      "CNB download authorization",
    );
    if (response.status === 302) {
      // Signed object storage URLs never receive the CNB access token.
      response = await request(
        httpsURL(response.headers.get("location")),
        { redirect: "error" },
        "CNB asset download",
      );
    }
  } else {
    response = await request(
      `https://cnb.cool/${cnbRepo}/-/releases${path}`,
      { redirect: "follow" },
      "Public CNB download",
    );
  }
  if (response.status !== 200 || !response.body) {
    throw new Error(`CNB download failed: ${asset.name}, HTTP ${response.status}`);
  }
  await verifyContent(response.body, asset);
  console.log(`Verified ${authenticated ? "uploaded" : "public"} ${asset.name}: ${asset.digest}`);
}

function syncSource() {
  command("git", [
    "fetch",
    "origin",
    "+refs/heads/main:refs/remotes/origin/main",
    "+refs/heads/paseo-latex:refs/remotes/origin/paseo-latex",
    "--tags",
  ]);
  const tags = command("git", ["tag", "--list", "latex-v*"])
    .split("\n")
    .filter((tag) => tagPattern.test(tag));
  const refs = ["main", "paseo-latex"].map(
    (branch) => `refs/remotes/origin/${branch}:refs/heads/${branch}`,
  );
  refs.push(...tags.map((tag) => `refs/tags/${tag}:refs/tags/${tag}`));
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  for (const key of Object.keys(env)) {
    if (key.startsWith("GIT_TRACE") || key === "GIT_CURL_VERBOSE") delete env[key];
  }
  // Read the token only inside Git's credential helper, never from command arguments.
  const helper =
    '!f() { if [ "$1" = get ]; then printf "%s\\n" "username=cnb" "password=$CNB_TOKEN"; fi; }; f';
  command(
    "git",
    [
      "-c",
      "credential.helper=",
      "-c",
      `credential.helper=${helper}`,
      "push",
      "--atomic",
      `https://cnb.cool/${cnbRepo}.git`,
      ...refs,
    ],
    { env },
  );
  console.log(
    `Synchronized main, paseo-latex and ${tags.length} personal release tags without force or deletions`,
  );
}

async function uploadAsset(releasePath, asset, directory) {
  const upload = await cnb(`${releasePath}/asset-upload-url`, {
    method: "POST",
    body: {
      asset_name: asset.name,
      size: asset.size,
      overwrite: false,
      ttl: 0,
    },
  });
  const response = await request(
    httpsURL(upload.upload_url),
    {
      method: "PUT",
      redirect: "error",
      duplex: "half",
      headers: {
        "Content-Length": String(asset.size),
        "Content-Type": "application/octet-stream",
      },
      body: createReadStream(join(directory, asset.name)),
    },
    "CNB upload",
  );
  if (!response.ok) throw new Error(`Upload failed: ${asset.name}, HTTP ${response.status}`);
  await response.arrayBuffer();
  const confirmation = apiURL(new URL(upload.verify_url, apiBase).href);
  if (
    !confirmation.pathname.startsWith(
      `/${cnbRepo}/-/releases${releasePath}/asset-upload-confirmation/`,
    )
  ) {
    throw new Error("Unexpected upload confirmation destination");
  }
  confirmation.searchParams.set("ttl", "0");
  await cnb(confirmation.href, { method: "POST" });
}

async function mirrorRelease(source, directory) {
  const assets = releaseFiles(source);
  const tag = source.tag_name;
  const commit = command("git", ["rev-parse", `refs/tags/${tag}^{commit}`]);
  command("gh", ["release", "download", tag, "--repo", githubRepo, "--dir", directory]);
  for (const asset of assets)
    await verifyContent(createReadStream(join(directory, asset.name)), asset);
  verifySums(await readFile(join(directory, "SHA256SUMS.txt"), "utf8"), assets);
  console.log(`GitHub assets verified for ${tag}, source ${commit}`);

  let target = await cnb(`/tags/${tag}`, { allowMissing: true });
  if (!target) {
    target = await cnb(apiBase, {
      method: "POST",
      body: {
        tag_name: tag,
        target_commitish: commit,
        name: source.name || tag,
        body: source.body || "",
        draft: true,
        prerelease: false,
        make_latest: "false",
      },
    });
  }
  publicationPatch(source, target, commit, tag);
  if (
    (target.assets || []).some((asset) => !assets.some((expected) => expected.name === asset.name))
  ) {
    throw new Error("CNB release contains unexpected assets; refusing to change it");
  }
  const releasePath = `/${encodeURIComponent(target.id)}`;
  for (const asset of assets) {
    const existing = (target.assets || []).find((candidate) => candidate.name === asset.name);
    if (existing) {
      if (existing.size !== asset.size)
        throw new Error(`Existing CNB asset size mismatch: ${asset.name}`);
    } else {
      if (!target.draft)
        throw new Error(
          `Published CNB release is incomplete: ${asset.name}; refusing to change its files`,
        );
      await uploadAsset(releasePath, asset, directory);
    }
    await verifyRemote(tag, asset, true);
  }
  // Re-read latest before promotion; manually mirroring an old release must not roll it back.
  const latest = githubRelease();
  target = await cnb(`/tags/${tag}`);
  if (
    target.assets.length !== assets.length ||
    assets.some(
      (asset) =>
        !target.assets.some(
          (candidate) => candidate.name === asset.name && candidate.size === asset.size,
        ),
    )
  ) {
    throw new Error("CNB release is incomplete; keeping the draft unpublished");
  }
  await cnb(releasePath, {
    method: "PATCH",
    body: publicationPatch(source, target, commit, latest.tag_name),
  });
  target = await cnb(`/tags/${tag}`);
  if (target.draft || target.prerelease || target.assets.length !== assets.length) {
    throw new Error("CNB publication verification failed");
  }
  for (const asset of assets) await verifyRemote(tag, asset, false);
  const url = `https://cnb.cool/${cnbRepo}/-/releases/tag/${tag}`;
  console.log(`Published and verified ${url}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `CNB: [${tag}](${url})\n\nSource: \`${commit}\`\n\nAll three public downloads match GitHub SHA-256 digests.\n`,
    );
  }
}

async function main() {
  if (!process.env.CNB_TOKEN) throw new Error("Set the repository Actions secret CNB_TOKEN first");
  const source = githubRelease(process.env.RELEASE_TAG || "latest");
  releaseFiles(source);
  syncSource();
  const directory = await mkdtemp(join(tmpdir(), "paseo-cnb-"));
  try {
    await mirrorRelease(source, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // Fetch causes can contain signed URLs; print only our sanitized top-level message.
    console.error(error.message);
    process.exitCode = 1;
  });
}
