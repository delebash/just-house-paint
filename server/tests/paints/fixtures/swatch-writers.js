// SPDX-License-Identifier: MIT
// Test-only writers for SYNTHETIC swatch files, laid out as the formats are published (see
// src/paints/swatches.js), so the readers are checked against bytes built independently.

function utf16(name) {
  const units = [...name].map((c) => c.charCodeAt(0));
  units.push(0);
  return units;
}

/**
 * Adobe Swatch Exchange. `entries`: { group?: string, swatches: [{ name, model, values, type? }] }[]
 * A missing group writes the swatches at the top level.
 */
export function writeAse(entries, { emptyGroupHeader = false } = {}) {
  const blocks = [];
  const block = (type, body) => blocks.push({ type, body });
  for (const e of entries) {
    if (e.group !== undefined || emptyGroupHeader) {
      const name = utf16(e.group ?? ""); // an unnamed group is just the terminator, as in Benjamin Moore's files
      const body = Buffer.alloc(2 + name.length * 2);
      body.writeUInt16BE(name.length, 0);
      for (const [i, u] of name.entries()) body.writeUInt16BE(u, 2 + i * 2);
      block(0xc001, body);
    }
    for (const s of e.swatches) {
      const name = utf16(s.name);
      const body = Buffer.alloc(2 + name.length * 2 + 4 + s.values.length * 4 + 2);
      let p = body.writeUInt16BE(name.length, 0);
      for (const u of name) p = body.writeUInt16BE(u, p);
      p += body.write(s.model.padEnd(4, " "), p, "ascii");
      for (const v of s.values) p = body.writeFloatBE(v, p);
      body.writeUInt16BE(s.type ?? 2, p);
      block(0x0001, body);
    }
    if (e.group !== undefined || emptyGroupHeader) block(0xc002, Buffer.alloc(0));
  }
  const head = Buffer.alloc(12);
  head.write("ASEF", 0, "ascii");
  head.writeUInt16BE(1, 4);
  head.writeUInt16BE(0, 6);
  head.writeUInt32BE(blocks.length, 8);
  const parts = [head];
  for (const b of blocks) {
    const h = Buffer.alloc(6);
    h.writeUInt16BE(b.type, 0);
    h.writeUInt32BE(b.body.length, 2);
    parts.push(h, b.body);
  }
  return Buffer.concat(parts);
}

/** Photoshop .aco: a version 1 section, then (if `v2`) a version 2 section with names. */
export function writeAco(colors, { v2 = true } = {}) {
  const parts = [];
  const color = (c) => {
    const b = Buffer.alloc(10);
    b.writeUInt16BE(c.space, 0);
    for (const [i, v] of c.values.entries()) {
      if (v < 0) b.writeInt16BE(v, 2 + i * 2);
      else b.writeUInt16BE(v, 2 + i * 2);
    }
    return b;
  };
  const header = (version) => {
    const b = Buffer.alloc(4);
    b.writeUInt16BE(version, 0);
    b.writeUInt16BE(colors.length, 2);
    return b;
  };
  parts.push(header(1), ...colors.map(color));
  if (v2) {
    parts.push(header(2));
    for (const c of colors) {
      const name = utf16(c.name);
      const n = Buffer.alloc(4 + name.length * 2);
      n.writeUInt32BE(name.length, 0);
      for (const [i, u] of name.entries()) n.writeUInt16BE(u, 4 + i * 2);
      parts.push(color(c), n);
    }
  }
  return Buffer.concat(parts);
}
