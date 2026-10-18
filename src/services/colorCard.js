// SPDX-License-Identifier: MIT
// The color card — one picture to take to the store: the painted photo on top, then a title, one
// row per painted part (its paint's swatch, the part, the paint's brand number and name, its hex)
// and the color disclaimer. Drawn with the browser's Canvas 2D; the layout is a pure function of
// the photo's width, so it is tested without a canvas.

/**
 * Where everything goes. Sizes follow the photo's width (a card from a 2048 px photo is drawn at
 * 2048 px wide): the text is 1/56 of the width, never under 14 px.
 */
export function colorCardLayout({ width, height, rows }) {
  const font = Math.max(14, Math.round(width / 56));
  const pad = Math.round(font * 1.2);
  const rowH = Math.round(font * 2.2);
  const swatch = Math.round(rowH * 0.8);
  const titleY = height + pad + font;
  const subtitleY = titleY + Math.round(font * 1.5);
  const rowsTop = subtitleY + pad;
  const rowBoxes = rows.map((_, i) => ({ y: rowsTop + i * rowH, swatchY: rowsTop + i * rowH + Math.round((rowH - swatch) / 2) }));
  const noteY = rowsTop + rows.length * rowH + pad;
  return { width, height: noteY + font + pad, photoHeight: height, font, pad, rowH, swatch, titleY, subtitleY, rowBoxes, noteY };
}

/** `text` cut to `max` pixels with an ellipsis (measureText). */
function clipText(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

/**
 * The card on a new canvas. `image`: the painted photo (a canvas or an image) at its own size;
 * `rows`: [{ part, paint, hex }] (words already in the app's language); `title`, `subtitle`, `note`.
 */
export function drawColorCard({ image, title, subtitle, rows, note }) {
  const width = image.width;
  const L = colorCardLayout({ width, height: image.height, rows });
  const canvas = document.createElement("canvas");
  canvas.width = L.width;
  canvas.height = L.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, L.width, L.height);
  ctx.drawImage(image, 0, 0);
  ctx.fillStyle = "#1d1d1d";
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 ${Math.round(L.font * 1.3)}px system-ui, sans-serif`;
  ctx.fillText(clipText(ctx, title, L.width - 2 * L.pad), L.pad, L.titleY);
  ctx.font = `${L.font}px system-ui, sans-serif`;
  ctx.fillStyle = "#555555";
  ctx.fillText(clipText(ctx, subtitle, L.width - 2 * L.pad), L.pad, L.subtitleY);
  const textX = L.pad + L.swatch + L.pad;
  const partW = Math.round((L.width - textX - L.pad) * 0.3);
  rows.forEach((row, i) => {
    const box = L.rowBoxes[i];
    ctx.fillStyle = row.hex;
    ctx.fillRect(L.pad, box.swatchY, L.swatch, L.swatch);
    ctx.strokeStyle = "#999999";
    ctx.strokeRect(L.pad + 0.5, box.swatchY + 0.5, L.swatch - 1, L.swatch - 1);
    const baseline = box.y + Math.round(L.rowH / 2 + L.font / 3);
    ctx.fillStyle = "#1d1d1d";
    ctx.font = `600 ${L.font}px system-ui, sans-serif`;
    ctx.fillText(clipText(ctx, row.part, partW - L.pad), textX, baseline);
    ctx.font = `${L.font}px system-ui, sans-serif`;
    ctx.fillText(clipText(ctx, `${row.paint} · ${row.hex}`, L.width - textX - partW - L.pad), textX + partW, baseline);
  });
  ctx.fillStyle = "#777777";
  ctx.font = `${Math.round(L.font * 0.85)}px system-ui, sans-serif`;
  ctx.fillText(clipText(ctx, note, L.width - 2 * L.pad), L.pad, L.noteY);
  return canvas;
}
