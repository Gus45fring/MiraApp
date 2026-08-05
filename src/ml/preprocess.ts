import { Buffer } from 'buffer';
// @ts-ignore - jpeg-js ships no types
import jpeg from 'jpeg-js';

export type Letterbox = {
  scale: number;
  padX: number;
  padY: number;
  origW: number;
  origH: number;
};

export type PreprocessResult = {
  tensorData: Float32Array;
  dims: number[];
  letterbox: Letterbox;
};

/**
 * Resizes `srcW`x`srcH` RGBA pixel data onto a `size`x`size` canvas, keeping
 * aspect ratio and padding with YOLO's standard grey (114,114,114) - this is
 * the same "letterbox" preprocessing Ultralytics uses during training/export,
 * so it has to match here for the model to see what it expects.
 */
function letterboxToTensor(
  rgba: Uint8Array,
  srcW: number,
  srcH: number,
  size: number,
): { data: Float32Array; scale: number; padX: number; padY: number } {
  const scale = Math.min(size / srcW, size / srcH);
  const newW = Math.max(1, Math.round(srcW * scale));
  const newH = Math.max(1, Math.round(srcH * scale));
  const padX = Math.floor((size - newW) / 2);
  const padY = Math.floor((size - newH) / 2);

  const plane = size * size;
  const data = new Float32Array(plane * 3);
  data.fill(114 / 255);

  for (let y = 0; y < newH; y++) {
    const srcY = Math.min(srcH - 1, Math.floor(y / scale));
    const dstY = y + padY;
    for (let x = 0; x < newW; x++) {
      const srcX = Math.min(srcW - 1, Math.floor(x / scale));
      const srcIdx = (srcY * srcW + srcX) * 4;
      const dstX = x + padX;
      const dstIdx = dstY * size + dstX;

      data[dstIdx] = rgba[srcIdx] / 255; // R plane
      data[plane + dstIdx] = rgba[srcIdx + 1] / 255; // G plane
      data[2 * plane + dstIdx] = rgba[srcIdx + 2] / 255; // B plane
    }
  }

  return { data, scale, padX, padY };
}

export function preprocessJpegBase64(
  base64: string,
  inputSize: number,
): PreprocessResult {
  const bytes = Buffer.from(base64, 'base64');

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!isJpeg) {
    throw new Error(
      'Only JPEG photos are supported by this template. Pick/take a JPEG photo (the default for most cameras), or extend src/ml/preprocess.ts with a PNG decoder.',
    );
  }

  const raw = jpeg.decode(bytes, { useTArray: true }) as {
    width: number;
    height: number;
    data: Uint8Array;
  };

  const { data, scale, padX, padY } = letterboxToTensor(
    raw.data,
    raw.width,
    raw.height,
    inputSize,
  );

  return {
    tensorData: data,
    dims: [1, 3, inputSize, inputSize],
    letterbox: {
      scale,
      padX,
      padY,
      origW: raw.width,
      origH: raw.height,
    },
  };
}
