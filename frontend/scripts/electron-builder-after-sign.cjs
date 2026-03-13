const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

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

function isAdHocSignature(targetPath) {
  const result = run("codesign", ["-dv", "--verbose=4", targetPath]);
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return output.includes("Signature=adhoc");
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

module.exports = async function afterSign(context) {
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

  if (!isAdHocSignature(appPath)) {
    console.log("[afterSign] macOS build uses a real signing identity; skipping ad-hoc runtime re-sign");
    return;
  }

  console.log("[afterSign] ad-hoc macOS build detected; re-signing bundled Python runtime Mach-O files");

  let signedCount = 0;
  for (const filePath of collectFiles(runtimeRoot)) {
    if (!isMachO(filePath)) {
      continue;
    }

    run("codesign", ["--force", "--sign", "-", filePath]);
    signedCount += 1;
  }

  run("codesign", ["--force", "--deep", "--sign", "-", appPath]);
  console.log(`[afterSign] re-signed ${signedCount} bundled Python Mach-O files and refreshed app signature`);
};
