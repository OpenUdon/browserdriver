'use strict';

function xauthority(hostname, displayNumber, cookie) {
  if (typeof hostname !== 'string' || !hostname || hostname.includes('\0') || !/^\d+$/.test(displayNumber) ||
      !Buffer.isBuffer(cookie) || cookie.length !== 16) throw new Error('invalid private display authority');
  const family = Buffer.alloc(2); family.writeUInt16BE(256); // X11/Xauth.h FamilyLocal.
  const fields = [Buffer.from(hostname), Buffer.from(displayNumber), Buffer.from('MIT-MAGIC-COOKIE-1'), cookie];
  return Buffer.concat([family, ...fields.flatMap(value => {
    if (value.length > 65535) throw new Error('invalid private display authority');
    const length = Buffer.alloc(2); length.writeUInt16BE(value.length); return [length, value];
  })]);
}

function isPlannedDisplayStop(record, display) {
  return !!display && record.pid === display.pid && record.start === display.start && record.uid === display.uid &&
    record.purpose === 'normal-display-stop' && record.signal === 'SIGTERM' && record.state === 'sent' && !record.controllerSignal;
}

function assertChromiumTmpdirBound(tmpdir) {
  // Reserve more than the pinned singleton directory/socket suffix. Linux
  // sun_path needs its terminating NUL, so equality at108 also refuses.
  if (typeof tmpdir !== 'string' || Buffer.byteLength(tmpdir, 'utf8') + 64 >= 108) {
    throw new Error('M16 private temporary directory exceeds socket budget');
  }
}

module.exports = { xauthority, isPlannedDisplayStop, assertChromiumTmpdirBound };
