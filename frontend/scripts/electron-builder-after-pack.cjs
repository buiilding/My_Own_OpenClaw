/**
 * Runs the electron builder after pack workflow for the frontend tooling.
 */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { findIdentity } = require("app-builder-lib/out/codeSign/macCodeSign");

const MACHO_MAGICS = new Set([
  "feedface",
  "cefaedfe",
  "feedfacf",
  "cffaedfe",
  "cafebabe",
  "bebafeca",
  "cafebabf",
  "bfbafeca",
]);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
  if (result.status === 0) {
    return result;
  }

  const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  throw new Error(`Command failed: ${command} ${args.join(" ")}\n${details}`);
}

function isMachO(targetPath) {
  const fd = fs.openSync(targetPath, "r");
  try {
    const magic = Buffer.alloc(4);
    const bytesRead = fs.readSync(fd, magic, 0, 4, 0);
    return bytesRead === 4 && MACHO_MAGICS.has(magic.toString("hex"));
  } finally {
    fs.closeSync(fd);
  }
}

function collectFiles(rootDir) {
  const entries = [];
  const pending = [rootDir];

  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
        continue;
      }
      if (entry.isFile()) {
        entries.push(fullPath);
      }
    }
  }

  return entries.sort((left, right) => right.split(path.sep).length - left.split(path.sep).length);
}

async function resolveRuntimeSigningContext(context) {
  const keychainFile = (await context.packager.codeSigningInfo.value)?.keychainFile ?? null;
  const identity = await findIdentity(
    "Developer ID Application",
    context.packager.platformSpecificBuildOptions.identity,
    keychainFile,
  );

  if (!identity) {
    return {
      binaryArgsPrefix: ["--force", "--sign", "-"],
      label: "ad-hoc",
    };
  }

  const signValue = identity.hash || identity.name;

  return {
    binaryArgsPrefix: ["--force", "--sign", signValue, "--timestamp"],
    label: `Developer ID (${identity.name})`,
  };
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  const runtimeRoot = path.join(appPath, "Contents", "Resources", "python-runtime");

  if (!fs.existsSync(runtimeRoot)) {
    return;
  }

  const signingContext = await resolveRuntimeSigningContext(context);
  console.log(
    `[afterPack] re-signing bundled Python runtime Mach-O files using ${signingContext.label} identity before electron-builder signing/notarization`,
  );

  let signedCount = 0;
  for (const filePath of collectFiles(runtimeRoot)) {
    if (!isMachO(filePath)) {
      continue;
    }

    run("codesign", [...signingContext.binaryArgsPrefix, filePath]);
    signedCount += 1;
  }

  console.log(
    `[afterPack] re-signed ${signedCount} bundled Python Mach-O files before outer app signing`,
  );
};
