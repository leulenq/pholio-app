"use strict";

/**
 * A minimal ZIP writer, stored entries only.
 *
 * The export is a bag of JPEG/WebP files plus one short text manifest. Those
 * image bytes are already entropy-coded, so deflating them buys nothing and
 * costs CPU on a serverless request — `store` is the correct method here, not a
 * shortcut. That removes the only genuinely tricky part of the format and, with
 * it, the case for adding a production dependency to a bundle that is already
 * externalizing native modules by hand in `build:function`.
 *
 * Deliberately limited: no ZIP64, no encryption, no data descriptors. The
 * archive is a handful of images a phone produced, and `buildZip` refuses
 * anything that would need a format feature it does not implement rather than
 * writing a header it cannot honour.
 */

const MAX_ENTRIES = 0xffff;
const MAX_ZIP32_BYTES = 0xffffffff;

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;

// Version 2.0 / "made by" UNIX. 2.0 is the floor for the fields written here.
const VERSION_NEEDED = 20;
const VERSION_MADE_BY = (3 << 8) | VERSION_NEEDED;
// Bit 11: file name is UTF-8. Names are ASCII-slugged before they reach here,
// but the flag is correct regardless and costs nothing.
const FLAG_UTF8 = 0x0800;
const METHOD_STORE = 0;

const CRC32_TABLE = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC32_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

/**
 * MS-DOS date/time. The format has no timezone and two-second resolution, and
 * its epoch starts in 1980, so anything earlier is clamped rather than wrapped
 * into a date that would read as the future.
 */
function dosDateTime(date) {
  const year = Math.max(date.getUTCFullYear(), 1980);
  return {
    time:
      (date.getUTCHours() << 11) |
      (date.getUTCMinutes() << 5) |
      Math.floor(date.getUTCSeconds() / 2),
    date:
      ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

function localHeader(entry) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(LOCAL_FILE_HEADER, 0);
  header.writeUInt16LE(VERSION_NEEDED, 4);
  header.writeUInt16LE(FLAG_UTF8, 6);
  header.writeUInt16LE(METHOD_STORE, 8);
  header.writeUInt16LE(entry.time, 10);
  header.writeUInt16LE(entry.date, 12);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(entry.size, 18);
  header.writeUInt32LE(entry.size, 22);
  header.writeUInt16LE(entry.name.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function centralHeader(entry) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(CENTRAL_DIRECTORY_HEADER, 0);
  header.writeUInt16LE(VERSION_MADE_BY, 4);
  header.writeUInt16LE(VERSION_NEEDED, 6);
  header.writeUInt16LE(FLAG_UTF8, 8);
  header.writeUInt16LE(METHOD_STORE, 10);
  header.writeUInt16LE(entry.time, 12);
  header.writeUInt16LE(entry.date, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.size, 20);
  header.writeUInt32LE(entry.size, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt16LE(0, 30); // extra field length
  header.writeUInt16LE(0, 32); // comment length
  header.writeUInt16LE(0, 34); // disk number
  header.writeUInt16LE(0, 36); // internal attributes
  // 0o644 in the high word; the low word stays clear (no MS-DOS attributes).
  header.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  header.writeUInt32LE(entry.offset, 42);
  return header;
}

function endOfCentralDirectory(count, size, offset) {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0);
  record.writeUInt16LE(0, 4); // this disk
  record.writeUInt16LE(0, 6); // disk with central directory
  record.writeUInt16LE(count, 8);
  record.writeUInt16LE(count, 10);
  record.writeUInt32LE(size, 12);
  record.writeUInt32LE(offset, 16);
  record.writeUInt16LE(0, 20); // comment length
  return record;
}

/**
 * @param {Array<{ name: string, data: Buffer }>} files
 * @param {{ modifiedAt?: Date }} [options]
 * @returns {Buffer}
 */
function buildZip(files, { modifiedAt = new Date(0) } = {}) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new TypeError("buildZip requires at least one file");
  }
  if (files.length > MAX_ENTRIES) {
    throw new RangeError("buildZip cannot write more than 65535 entries");
  }

  const { time, date } = dosDateTime(modifiedAt);
  const chunks = [];
  const central = [];
  const seen = new Set();
  let offset = 0;

  for (const file of files) {
    const name = String(file?.name || "");
    // Two entries with one name is a valid archive that extracts to a silently
    // truncated set — exactly the failure this export exists to prevent.
    if (!name || seen.has(name)) {
      throw new TypeError(`buildZip requires a unique, non-empty name (got "${name}")`);
    }
    seen.add(name);

    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data || []);
    const nameBuffer = Buffer.from(name, "utf8");
    const entry = {
      name: nameBuffer,
      crc: crc32(data),
      size: data.length,
      offset,
      time,
      date,
    };

    const header = localHeader(entry);
    chunks.push(header, nameBuffer, data);
    offset += header.length + nameBuffer.length + data.length;
    if (offset > MAX_ZIP32_BYTES) {
      throw new RangeError("buildZip cannot write an archive larger than 4 GiB");
    }
    // A central directory entry is its fixed header followed by the name; the
    // header only records the name's length.
    central.push(centralHeader(entry), nameBuffer);
  }

  const directory = Buffer.concat(central);
  return Buffer.concat([
    ...chunks,
    directory,
    endOfCentralDirectory(files.length, directory.length, offset),
  ]);
}

module.exports = { buildZip, crc32 };
