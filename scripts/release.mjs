#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const bump = process.argv[2] || "patch";
const message = process.argv.slice(3).join(" ").trim();
const allowedBumps = new Set(["patch", "minor", "major"]);

if (!allowedBumps.has(bump)) {
  console.error("Usage: npm run release:patch -- [commit message]");
  console.error("       npm run release:minor -- [commit message]");
  console.error("       npm run release:major -- [commit message]");
  process.exit(1);
}

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
}

function capture(command, args) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(root, fileName), "utf8"));
}

function writeJson(fileName, value) {
  fs.writeFileSync(
    path.join(root, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

function bumpVersion(version, bumpType) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }

  const parts = match.slice(1).map(Number);
  if (bumpType === "major") {
    parts[0] += 1;
    parts[1] = 0;
    parts[2] = 0;
  } else if (bumpType === "minor") {
    parts[1] += 1;
    parts[2] = 0;
  } else {
    parts[2] += 1;
  }

  return parts.join(".");
}

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const nextVersion = bumpVersion(packageJson.version, bump);

packageJson.version = nextVersion;
if (packageLock.version) {
  packageLock.version = nextVersion;
}
if (packageLock.packages?.[""]?.version) {
  packageLock.packages[""].version = nextVersion;
}

writeJson("package.json", packageJson);
writeJson("package-lock.json", packageLock);

console.log(`Version bumped to ${nextVersion}`);
run("npm", ["run", "build"]);
run("npm", ["run", "validate"]);
run("git", ["add", "-A"]);

try {
  run("git", ["diff", "--cached", "--quiet"], { stdio: "ignore" });
  console.log("No changes to commit.");
  process.exit(0);
} catch {
  // git diff --quiet exits with 1 when staged changes exist.
}

run("git", ["commit", "-m", message || `Release v${nextVersion}`]);

const branch = capture("git", ["branch", "--show-current"]);
if (!branch) {
  throw new Error("Cannot push from a detached HEAD.");
}

let hasUpstream = true;
try {
  capture("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
} catch {
  hasUpstream = false;
}

if (hasUpstream) {
  run("git", ["push"]);
} else {
  run("git", ["push", "-u", "origin", branch]);
}
