'use strict';
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const { randomBytes } = require('node:crypto');
const { dirname, basename, isAbsolute, resolve } = require('node:path');
const same = (left, right) => left.dev === right.dev && left.ino === right.ino;
const absent = error => error && error.code === 'ENOENT';
const refused = () => { throw new Error('private qualification packet publication failed'); };

async function publishPacket(path, value, ownedRoot) {
  const bytes = Buffer.from(JSON.stringify(value));
  if (bytes.length < 2 || bytes.length > 4096 || !isAbsolute(path) || resolve(path) !== path || !/^(start|reuse)\.json$/.test(basename(path))) refused();
  const root = dirname(path), uid = process.getuid?.();
  if (uid === undefined) refused();
  if (ownedRoot) {
    await ownedRoot.verifyHeld();
    if (root !== `${ownedRoot.anchor}/tmp/sandbox-proofs/acks`) refused();
  } else if (await fs.realpath(root) !== root) refused();
  const rootInfo = await fs.lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.uid !== uid || (rootInfo.mode & 0o777) !== 0o700) refused();
  const directory = await fs.open(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  let file, identity, temporary, final, linked = false, temporaryRemoved = false, settled = false;
  let failed = false;
  const regularOwned = info => info.isFile() && info.uid === uid && (info.mode & 0o777) === 0o600;
  const stableRoot = async () => {
    const current = await fs.lstat(root), opened = await directory.stat();
    if (!current.isDirectory() || current.uid !== uid || (current.mode & 0o777) !== 0o700 || !same(rootInfo, current) ||
        !same(rootInfo, opened)) refused();
    if (ownedRoot) await ownedRoot.verifyHeld();
    else if (await fs.realpath(root) !== root) refused();
  };
  const removeOwned = async (target, missingOK = false) => {
    try {
      const current = await fs.lstat(target);
      if (!identity || !regularOwned(current) || !same(identity, current)) refused();
      await fs.unlink(target);
    } catch (error) { if (!(missingOK && absent(error))) throw error; }
  };
  try {
    await stableRoot();
    const anchored = `/proc/self/fd/${directory.fd}`;
    temporary = `${anchored}/.packet-${randomBytes(16).toString('hex')}.tmp`;
    final = `${anchored}/${basename(path)}`;
    file = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    // Failed exclusive open owns nothing. Immediate descriptor identity binds
    // every later publication/removal, including failed writes.
    identity = await file.stat();
    if (!regularOwned(identity) || identity.nlink !== 1) refused();
    await file.writeFile(bytes); await file.sync();
    const opened = await file.stat(), current = await fs.lstat(temporary);
    if (!regularOwned(opened) || !regularOwned(current) || !same(identity, opened) || !same(identity, current) ||
        opened.nlink !== 1 || current.nlink !== 1 || opened.size !== bytes.length || current.size !== bytes.length) refused();
    await stableRoot();
    // The final name first becomes visible with the complete fsynced JSON.
    await fs.link(temporary, final); linked = true;
    const published = await fs.lstat(final);
    if (!same(identity, published)) refused();
    await removeOwned(temporary); temporaryRemoved = true;
    await directory.sync(); await stableRoot();
    const finalInfo = await fs.lstat(final);
    if (!regularOwned(finalInfo) || !same(identity, finalInfo) || finalInfo.nlink !== 1 || finalInfo.size !== bytes.length) refused();
    settled = true;
  } catch { failed = true; }
  finally {
    if (!settled && file) {
      try { await file.truncate(0); await file.sync(); } catch { failed = true; }
      if (!identity) failed = true;
      else {
        if (linked) try { await removeOwned(final, true); } catch { failed = true; }
        if (!temporaryRemoved) try { await removeOwned(temporary, true); } catch { failed = true; }
      }
      try { await directory.sync(); } catch { failed = true; }
    }
    try { await file?.close(); } catch { failed = true; }
    try { await directory.close(); } catch { failed = true; }
  }
  if (failed) refused();
}

module.exports = { publishPacket };
