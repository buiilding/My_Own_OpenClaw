const fs = require('fs');
const path = require('path');

const writeQueues = new Map();
let tempFileCounter = 0;

function makeTempPath(targetPath) {
  tempFileCounter += 1;
  return `${targetPath}.${process.pid}.${Date.now()}.${tempFileCounter}.tmp`;
}

async function writeFileAtomic(targetPath, data, options) {
  const tempPath = makeTempPath(targetPath);
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  try {
    await fs.promises.writeFile(tempPath, data, options);
    await fs.promises.rename(tempPath, targetPath);
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

function enqueueAtomicWrite(targetPath, data, options = 'utf-8') {
  const previous = writeQueues.get(targetPath) || Promise.resolve();
  const write = previous
    .catch(() => undefined)
    .then(() => writeFileAtomic(targetPath, data, options));
  const queued = write.finally(() => {
    if (writeQueues.get(targetPath) === queued) {
      writeQueues.delete(targetPath);
    }
  });
  writeQueues.set(targetPath, queued);
  return write;
}

module.exports = {
  enqueueAtomicWrite,
};
