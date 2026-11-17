// Rasterizes the CARRY mark into PNG app icons without external dependencies.
// Usage: npm run icons
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const FOREST = [0x16, 0x3a, 0x35];
const TEAL = [0x2a, 0xa5, 0x8f];
const PAPER = [0xf4, 0xf2, 0xea];

// Mark geometry in a 64-unit box (matches public/icons/carry-mark.svg).
const C = 32, R = 20, RING_W = 5, NODE_R = 6, NODE_STROKE = 3;
const toRad = (d) => (d * Math.PI) / 180;
const ARC_START = -10, ARC_END = 280; // clockwise, gap centred at -45°
const NODES = [ARC_START, 135, ARC_END].map((a) => [C + R * Math.cos(toRad(a)), C + R * Math.sin(toRad(a))]);

function inArc(x, y) {
  let a = (Math.atan2(y - C, x - C) * 180) / Math.PI; // -180..180, clockwise positive
  if (a < ARC_START) a += 360;
  return a >= ARC_START && a <= ARC_END;
}

function sample(u, v, { rounded }) {
  // Background (optionally a rounded square).
  if (rounded) {
    const rad = 14, inset = (p) => Math.max(rad - p, 0, p - (64 - rad));
    const dx = inset(u), dy = inset(v);
    if (dx * dx + dy * dy > rad * rad) return null;
  }
  let color = FOREST;
  const d = Math.hypot(u - C, v - C);
  if (Math.abs(d - R) <= RING_W / 2 && inArc(u, v)) color = TEAL;
  for (const [nx, ny] of NODES) {
    const nd = Math.hypot(u - nx, v - ny);
    if (nd <= NODE_R + NODE_STROKE / 2) color = nd <= NODE_R - NODE_STROKE / 2 ? PAPER : TEAL;
  }
  return color;
}

function render(size, { scale, rounded }) {
  const SS = 4;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = ((x + (sx + 0.5) / SS) / size) * 64;
          const fy = ((y + (sy + 0.5) / SS) / size) * 64;
          // Scale the mark around the centre; background stays full-bleed.
          const u = C + (fx - C) / scale, v = C + (fy - C) / scale;
          const bg = rounded ? sample(fx, fy, { rounded }) : FOREST;
          if (!bg) continue;
          const c = sample(u, v, { rounded: false });
          const col = c === FOREST ? FOREST : c;
          r += col[0]; g += col[1]; b += col[2]; a += 255;
        }
      }
      const n = SS * SS, i = (y * size + x) * 4;
      px[i] = a ? Math.round(r / (a / 255)) : 0;
      px[i + 1] = a ? Math.round(g / (a / 255)) : 0;
      px[i + 2] = a ? Math.round(b / (a / 255)) : 0;
      px[i + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, size, px);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", render(192, { scale: 1, rounded: true }));
writeFileSync("public/icons/icon-512.png", render(512, { scale: 1, rounded: true }));
// Maskable: full-bleed background, mark inside the 80% safe zone.
writeFileSync("public/icons/icon-maskable-512.png", render(512, { scale: 0.72, rounded: false }));
// iOS fills transparent pixels with black and applies its own corner mask, so
// the Home Screen icon is full-bleed and opaque.
writeFileSync("public/icons/apple-touch-icon.png", render(180, { scale: 0.85, rounded: false }));
console.log("Wrote public/icons/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png");
