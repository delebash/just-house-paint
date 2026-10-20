// SPDX-License-Identifier: MIT
// Readers for Adobe swatch files — the formats Benjamin Moore and PPG/Glidden publish their
// palettes in. NOT STANDARD: no maintained npm reader exists (checked 2026-10-17: adobe-ase —
// one release, 2025-10, 1 star, 46 downloads/week; ase-utils — last release 2015, repository
// gone; ase-util — 2019; adobe_swatch_exchange_parser — 2023, 6/week; nothing for .aco), so
// these follow the published layouts:
// - .aco: Adobe Photoshop File Formats Specification, "Color Swatches"
//   (https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/#50577411_pgfId-1055819).
// - .ase: Adobe has published no specification; the layout is the long-standing community
//   description (http://www.selapa.net/swatches/colors/fileformats.php#adobe_ase), and it reads
//   Benjamin Moore's and PPG's official files byte for byte.
// Each returns { swatches: [{ name, group, model, values, hex }], warnings: [] }. Lab in both
// formats is Photoshop/Illustrator Lab (D50). CMYK and grayscale need an ICC profile to become a
// paint color, so they are skipped with a warning — paint brands publish RGB.
import { converter, formatHex } from "culori";
import { leftOut } from "./left_out.js";

const toRgb = converter("rgb");

const hexFromRgb01 = (r, g, b) => formatHex({ mode: "rgb", r, g, b });
const hexFromLab50 = (l, a, b) => formatHex(toRgb({ mode: "lab", l, a, b }));
const hexFromHsv = (h, s, v) => formatHex(toRgb({ mode: "hsv", h, s, v }));

function view(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
}

function utf16be(dv, offset, units) {
  let s = "";
  for (let i = 0; i < units; i++) {
    const c = dv.getUint16(offset + i * 2);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

export function isAse(buffer) {
  const dv = view(buffer);
  return dv.byteLength >= 12 && dv.getUint32(0) === 0x41534546; // "ASEF"
}

/** Adobe Swatch Exchange (.ase). */
export function parseAse(buffer) {
  const dv = view(buffer);
  if (!isAse(buffer)) throw new Error("not an Adobe Swatch Exchange file (no ASEF signature)");
  const blocks = dv.getUint32(8);
  const swatches = [];
  const warnings = [];
  const skipped = leftOut("swatch", "swatches");
  const odd = leftOut("block", "blocks");
  const groups = [];
  let colors = 0; // the swatches' numbers, as the file has them
  let p = 12;
  for (let i = 0; i < blocks && p + 6 <= dv.byteLength; i++) {
    const type = dv.getUint16(p);
    const len = dv.getUint32(p + 2);
    const start = p + 6;
    const end = start + len;
    if (end > dv.byteLength) {
      warnings.push(`block ${i} runs past the end of the file`);
      break;
    }
    if (type === 0xc001) {
      const n = len >= 2 ? dv.getUint16(start) : 0;
      groups.push(n ? utf16be(dv, start + 2, n) : "");
    } else if (type === 0xc002) {
      groups.pop();
    } else if (type === 0x0001) {
      const n = dv.getUint16(start);
      const name = utf16be(dv, start + 2, n);
      let q = start + 2 + n * 2;
      const model = String.fromCharCode(dv.getUint8(q), dv.getUint8(q + 1), dv.getUint8(q + 2), dv.getUint8(q + 3)).trim();
      q += 4;
      const count = { RGB: 3, LAB: 3, CMYK: 4, Gray: 1 }[model];
      const at = ++colors;
      if (!count) {
        skipped.add(`skipped — an unknown color model "${model}"`, at);
      } else {
        const values = Array.from({ length: count }, (_, k) => dv.getFloat32(q + k * 4));
        let hex = null;
        if (model === "RGB") hex = hexFromRgb01(...values);
        // Adobe writes L as 0..1; GIMP's exporter writes 0..100 — a value above 1 is the latter.
        else if (model === "LAB") hex = hexFromLab50(values[0] > 1 ? values[0] : values[0] * 100, values[1], values[2]);
        else skipped.add(`skipped — ${model} needs a color profile`, at);
        if (hex) swatches.push({ name, group: groups.at(-1) || null, model, values, hex, at });
      }
    } else {
      odd.add("of a type this reader doesn't know, skipped", i + 1);
    }
    p = end;
  }
  return { swatches, warnings: [...warnings, ...skipped.words(), ...odd.words()] };
}

export function isAco(buffer) {
  const dv = view(buffer);
  if (dv.byteLength < 4) return false;
  const version = dv.getUint16(0);
  const count = dv.getUint16(2);
  return (version === 1 || version === 2) && dv.byteLength >= 4 + count * 10;
}

function acoColor(space, w, x, y) {
  if (space === 0) return { model: "RGB", hex: hexFromRgb01(w / 65535, x / 65535, y / 65535) };
  if (space === 1) return { model: "HSB", hex: hexFromHsv((w / 65535) * 360, x / 65535, y / 65535) };
  if (space === 7) {
    const s16 = (v) => (v > 0x7fff ? v - 0x10000 : v);
    return { model: "LAB", hex: hexFromLab50(w / 100, s16(x) / 100, s16(y) / 100) };
  }
  return { model: { 2: "CMYK", 8: "Gray" }[space] ?? `space ${space}`, hex: null };
}

/** Photoshop color swatches (.aco), version 1 and/or 2 (version 2 carries the names). */
export function parseAco(buffer) {
  const dv = view(buffer);
  if (!isAco(buffer)) throw new Error("not a Photoshop swatch file (.aco)");
  const warnings = [];
  const sections = [];
  let p = 0;
  while (p + 4 <= dv.byteLength) {
    const version = dv.getUint16(p);
    const count = dv.getUint16(p + 2);
    if (version !== 1 && version !== 2) break;
    p += 4;
    const list = [];
    for (let i = 0; i < count; i++) {
      if (p + 10 > dv.byteLength) {
        warnings.push(`version ${version}: file ends at color ${i} of ${count}`);
        break;
      }
      const space = dv.getUint16(p);
      const [w, x, y] = [dv.getUint16(p + 2), dv.getUint16(p + 4), dv.getUint16(p + 6)];
      p += 10;
      let name = "";
      if (version === 2) {
        const units = dv.getUint32(p);
        name = utf16be(dv, p + 4, units);
        p += 4 + units * 2;
      }
      const c = acoColor(space, w, x, y);
      list.push({ name, group: null, model: c.model, values: [w, x, y], hex: c.hex, at: i + 1 });
    }
    sections.push({ version, list });
  }
  // Prefer the named version 2 list when the file carries both.
  const chosen = sections.find((s) => s.version === 2) ?? sections[0] ?? { list: [] };
  const swatches = [];
  const skipped = leftOut("swatch", "swatches");
  for (const s of chosen.list) {
    if (s.hex) swatches.push(s);
    else skipped.add(`skipped — ${s.model} needs a color profile`, s.at);
  }
  return { swatches, warnings: [...warnings, ...skipped.words()] };
}
