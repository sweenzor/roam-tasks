import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const repoDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = join(repoDir, "assets");
const iconsetDir = join(assetsDir, "app-icon.iconset");
const outputIcns = join(assetsDir, "app-icon.icns");
const checkPolygon = strokePolylinePolygon(
  [
    [295, 524],
    [447, 676],
    [719, 348]
  ],
  116
);

const iconFiles = [
  ["icon_16x16.png", 16, "icp4"],
  ["icon_16x16@2x.png", 32, null],
  ["icon_32x32.png", 32, "icp5"],
  ["icon_32x32@2x.png", 64, "icp6"],
  ["icon_128x128.png", 128, "ic07"],
  ["icon_128x128@2x.png", 256, null],
  ["icon_256x256.png", 256, "ic08"],
  ["icon_256x256@2x.png", 512, null],
  ["icon_512x512.png", 512, "ic09"],
  ["icon_512x512@2x.png", 1024, "ic10"]
];

await rm(iconsetDir, { recursive: true, force: true });
await mkdir(iconsetDir, { recursive: true });

const icnsEntries = [];

for (const [filename, size, icnsType] of iconFiles) {
  const image = png(renderIcon(size), size, size);
  await writeFile(join(iconsetDir, filename), image);
  if (icnsType) icnsEntries.push([icnsType, image]);
}

await writeFile(outputIcns, icns(icnsEntries));
console.log(`Built ${outputIcns}`);

function renderIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = 1024 / size;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = (x + 0.5) * scale;
      const py = (y + 0.5) * scale;
      const color = [0, 0, 0, 0];

      composite(color, [247, 248, 244, 255], roundedRectAlpha(px, py, 64, 64, 896, 896, 210, scale));

      const tickAlpha = polygonAlpha(px, py, checkPolygon);
      composite(color, [0, 0, 0, 255], tickAlpha);

      const index = (y * size + x) * 4;
      pixels[index] = Math.round(color[0]);
      pixels[index + 1] = Math.round(color[1]);
      pixels[index + 2] = Math.round(color[2]);
      pixels[index + 3] = Math.round(color[3]);
    }
  }

  return pixels;
}

function roundedRectAlpha(px, py, x, y, width, height, radius, scale) {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const qx = Math.abs(px - cx) - (width / 2 - radius);
  const qy = Math.abs(py - cy) - (height / 2 - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return coverage(outside + inside - radius, scale);
}

function coverage(distance, scale) {
  return Math.max(0, Math.min(1, 0.5 - distance / scale));
}

function polygonAlpha(px, py, polygon) {
  return isPointInPolygon(px, py, polygon) ? 1 : 0;
}

function isPointInPolygon(px, py, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

function strokePolylinePolygon(points, width) {
  const radius = width / 2;
  const [start, join, end] = points;
  const firstDirection = unitVector(start, join);
  const secondDirection = unitVector(join, end);
  const firstNormal = [-firstDirection[1], firstDirection[0]];
  const secondNormal = [-secondDirection[1], secondDirection[0]];
  const startA = offsetPoint(start, firstNormal, radius);
  const startB = offsetPoint(start, firstNormal, -radius);
  const endA = offsetPoint(end, secondNormal, radius);
  const endB = offsetPoint(end, secondNormal, -radius);
  const joinA = lineIntersection(
    offsetPoint(join, firstNormal, radius),
    firstDirection,
    offsetPoint(join, secondNormal, radius),
    secondDirection
  );
  const joinB = lineIntersection(
    offsetPoint(join, firstNormal, -radius),
    firstDirection,
    offsetPoint(join, secondNormal, -radius),
    secondDirection
  );

  return [startA, joinA, endA, endB, joinB, startB];
}

function unitVector(start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  return [dx / length, dy / length];
}

function offsetPoint(point, normal, amount) {
  return [point[0] + normal[0] * amount, point[1] + normal[1] * amount];
}

function lineIntersection(pointA, directionA, pointB, directionB) {
  const denominator = cross(directionA, directionB);
  const delta = [pointB[0] - pointA[0], pointB[1] - pointA[1]];
  const distance = cross(delta, directionB) / denominator;
  return [pointA[0] + directionA[0] * distance, pointA[1] + directionA[1] * distance];
}

function cross(a, b) {
  return a[0] * b[1] - a[1] * b[0];
}

function composite(base, rgba, alpha) {
  if (alpha <= 0) return;
  const sourceAlpha = (rgba[3] / 255) * Math.min(1, alpha);
  const baseAlpha = base[3] / 255;
  const outputAlpha = sourceAlpha + baseAlpha * (1 - sourceAlpha);
  if (outputAlpha <= 0) return;

  base[0] = (rgba[0] * sourceAlpha + base[0] * baseAlpha * (1 - sourceAlpha)) / outputAlpha;
  base[1] = (rgba[1] * sourceAlpha + base[1] * baseAlpha * (1 - sourceAlpha)) / outputAlpha;
  base[2] = (rgba[2] * sourceAlpha + base[2] * baseAlpha * (1 - sourceAlpha)) / outputAlpha;
  base[3] = outputAlpha * 255;
}

function png(rgba, width, height) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const sourceStart = y * stride;
    const targetStart = y * (stride + 1);
    raw[targetStart] = 0;
    rgba.copy(raw, targetStart + 1, sourceStart, sourceStart + stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr(width, height)),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function icns(entries) {
  const totalLength = 8 + entries.reduce((total, [, data]) => total + 8 + data.length, 0);
  const header = Buffer.alloc(8);
  header.write("icns", 0, "ascii");
  header.writeUInt32BE(totalLength, 4);

  const chunks = entries.map(([type, data]) => {
    const chunkHeader = Buffer.alloc(8);
    chunkHeader.write(type, 0, "ascii");
    chunkHeader.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([chunkHeader, data]);
  });

  return Buffer.concat([header, ...chunks]);
}

function ihdr(width, height) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 6;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return data;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
