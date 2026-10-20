// SPDX-License-Identifier: MIT
// Save image (services/fullSizeImage.js and its worker): the size it is saved at — the original's, at
// most the `photos.fullSizeMaxMegapixels` setting —, the worker it is painted in (the page's outlines
// copied, the copies moved, never the page's own), and what the worker does with OffscreenCanvas:
// the original decoded at that size, the outlines scaled to it, the screen's paint, a JPEG. Node has
// no canvas or Worker: the stand-ins below keep pixels as plain arrays.
import { afterEach, expect, test, vi } from "vitest";
import { exportSize, paintFullSize } from "./fullSizeImage.js";
import { onPaintMessage, paintImage } from "./fullSizeImage.worker.js";

afterEach(() => vi.unstubAllGlobals());

test("the saved size: the original's up to the limit, else scaled down to it, the same shape", () => {
  expect(exportSize(4000, 3000, 16)).toEqual({ width: 4000, height: 3000 });
  // 48 MP and a 192 MP panorama: down to at most 16 MP
  for (const [w, h] of [
    [8000, 6000],
    [24000, 8000],
  ]) {
    const s = exportSize(w, h, 16);
    expect(s.width * s.height).toBeLessThanOrEqual(16e6);
    expect(s.width * s.height).toBeGreaterThan(15.99e6);
    expect(s.width / s.height).toBeCloseTo(w / h, 3);
  }
  expect(exportSize(8000, 6000, 1)).toEqual({ width: 1154, height: 866 });
  // no limit set (an older server): the original's size
  expect(exportSize(8000, 6000, undefined)).toEqual({ width: 8000, height: 6000 });
});

test("the painting runs in a module worker: the outlines are copies (moved there), the answer is the JPEG", async () => {
  const made = [];
  class FakeWorker {
    constructor(url, options) {
      Object.assign(this, { url: String(url), options, terminated: false });
      made.push(this);
    }
    postMessage(message, transfer) {
      Object.assign(this, { message, transfer });
      queueMicrotask(() => this.onmessage({ data: message.fail ? { error: { message: "no canvas" } } : { blob: "the jpeg" } }));
    }
    terminate() {
      this.terminated = true;
    }
  }
  vi.stubGlobal("Worker", FakeWorker);
  const mine = Uint8Array.from([0, 255, 255, 0]);
  const blob = await paintFullSize({ photo: "original", width: 4, height: 2, masks: [{ key: "body", mask: mine }], maskWidth: 2, maskHeight: 2, colors: { body: "#ffffff" } });
  expect(blob).toBe("the jpeg");
  const [w] = made;
  expect(w.url).toMatch(/fullSizeImage\.worker\.js$/);
  expect(w.options).toEqual({ type: "module" });
  expect(w.message.masks[0].mask).toEqual(mine);
  expect(w.message.masks[0].mask).not.toBe(mine);
  expect(w.transfer).toEqual([w.message.masks[0].mask.buffer]);
  expect(w.terminated).toBe(true);
  // a failure in the worker is the page's error to show
  await expect(paintFullSize({ masks: [], fail: true })).rejects.toThrow("no canvas");
});

// ── OffscreenCanvas, ImageData and createImageBitmap, as plain arrays ─────────
class FakeImageData {
  constructor(a, b, c) {
    if (typeof a === "number") Object.assign(this, { width: a, height: b, data: new Uint8ClampedArray(a * b * 4) });
    else Object.assign(this, { data: a, width: b, height: c });
  }
}
class FakeCanvas {
  constructor(width, height) {
    Object.assign(this, { width, height, pixels: new Uint8ClampedArray(width * height * 4) });
  }
  getContext() {
    const canvas = this;
    return {
      putImageData: (img) => canvas.pixels.set(img.data),
      // nearest-neighbour scaling (the browser's is smoothed)
      drawImage(src, x, y, w = src.width, h = src.height) {
        for (let yy = 0; yy < h; yy++)
          for (let xx = 0; xx < w; xx++) {
            const s = (Math.floor((yy * src.height) / h) * src.width + Math.floor((xx * src.width) / w)) * 4;
            canvas.pixels.set(src.pixels.subarray(s, s + 4), ((y + yy) * canvas.width + x + xx) * 4);
          }
      },
      getImageData: () => ({ data: Uint8ClampedArray.from(canvas.pixels) }),
    };
  }
  async convertToBlob(options) {
    return { options, pixels: this.pixels, width: this.width, height: this.height };
  }
}

test("the worker decodes the original at the saved size, scales the outlines to it and paints them as the screen does", async () => {
  const decoded = [];
  vi.stubGlobal("ImageData", FakeImageData);
  vi.stubGlobal("OffscreenCanvas", FakeCanvas);
  vi.stubGlobal("createImageBitmap", async (photo, options) => {
    decoded.push({ photo, options });
    // a light grey photo, decoded at the size asked for
    const bitmap = new FakeCanvas(options.resizeWidth, options.resizeHeight);
    bitmap.pixels.fill(200);
    return Object.assign(bitmap, { close() {} });
  });
  // the display outlines are 4 × 3: the body is the top row; painted at 8 × 6
  const body = Uint8Array.from({ length: 12 }, (_, i) => (i < 4 ? 255 : 0));
  const out = await paintImage({ photo: "original", width: 8, height: 6, masks: [{ key: "body", mask: body }], maskWidth: 4, maskHeight: 3, colors: { body: "#3366aa" }, order: ["body"], quality: 0.92 });
  expect(decoded).toEqual([{ photo: "original", options: { resizeWidth: 8, resizeHeight: 6, resizeQuality: "high" } }]);
  expect(out.options).toEqual({ type: "image/jpeg", quality: 0.92 });
  expect([out.width, out.height]).toEqual([8, 6]);
  const at = (x, y) => [...out.pixels.subarray((y * 8 + x) * 4, (y * 8 + x) * 4 + 3)];
  // an evenly lit wall shows the chip exactly; the rest is the photo
  expect(at(0, 0)).toEqual([0x33, 0x66, 0xaa]);
  expect(at(7, 1)).toEqual([0x33, 0x66, 0xaa]);
  expect(at(0, 2)).toEqual([200, 200, 200]);
  expect(at(7, 5)).toEqual([200, 200, 200]);
  // the worker's one answer: the JPEG, or the failure's words
  const answers = [];
  await onPaintMessage({ data: { photo: "original", width: 2, height: 2, masks: [], maskWidth: 2, maskHeight: 2, colors: {}, order: [] } }, (m) => answers.push(m));
  vi.stubGlobal("createImageBitmap", async () => {
    throw new Error("The source image could not be decoded.");
  });
  await onPaintMessage({ data: { photo: "broken", width: 2, height: 2, masks: [] } }, (m) => answers.push(m));
  expect(answers[0].blob.options.type).toBe("image/jpeg");
  expect(answers[1]).toEqual({ error: { message: "The source image could not be decoded." } });
});
