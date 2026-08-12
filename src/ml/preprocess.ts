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

export type RawPixelFormat =
  | 'ARGB'
  | 'BGRA'
  | 'ABGR'
  | 'RGBA'
  | 'XRGB'
  | 'BGRX'
  | 'XBGR'
  | 'RGBX'
  | 'RGB'
  | 'BGR'
  | 'unknown';

export type RawPixelData = {
  buffer: ArrayBuffer;
  width: number;
  height: number;
  pixelFormat: RawPixelFormat | string;
};

type ChannelLayout = {
  bytesPerPixel: 3 | 4;
  red: number;
  green: number;
  blue: number;
};

function getChannelLayout(pixelFormat: string): ChannelLayout {
  switch (pixelFormat.toUpperCase()) {
    case 'ARGB':
    case 'XRGB':
      return { bytesPerPixel: 4, red: 1, green: 2, blue: 3 };
    case 'BGRA':
    case 'BGRX':
      return { bytesPerPixel: 4, red: 2, green: 1, blue: 0 };
    case 'ABGR':
    case 'XBGR':
      return { bytesPerPixel: 4, red: 3, green: 2, blue: 1 };
    case 'RGBA':
    case 'RGBX':
      return { bytesPerPixel: 4, red: 0, green: 1, blue: 2 };
    case 'RGB':
      return { bytesPerPixel: 3, red: 0, green: 1, blue: 2 };
    case 'BGR':
      return { bytesPerPixel: 3, red: 2, green: 1, blue: 0 };
    default:
      throw new Error(`Unsupported raw camera pixel format: ${pixelFormat}`);
  }
}

/**
 * Resizes packed camera pixels onto a square CHW tensor, keeping aspect ratio
 * and padding with YOLO's standard grey (114, 114, 114).
 */
function letterboxRawToTensor(
  pixels: Uint8Array,
  srcW: number,
  srcH: number,
  pixelFormat: string,
  size: number,
): { data: Float32Array; scale: number; padX: number; padY: number } {
  if (srcW <= 0 || srcH <= 0) {
    throw new Error(`Invalid raw camera dimensions: ${srcW}x${srcH}`);
  }

  const layout = getChannelLayout(pixelFormat);
  const expectedBytes = srcW * srcH * layout.bytesPerPixel;
  if (pixels.byteLength < expectedBytes) {
    throw new Error(
      `Raw camera buffer is too small for ${srcW}x${srcH} ${pixelFormat}: ` +
        `${pixels.byteLength} bytes received, ${expectedBytes} required.`,
    );
  }

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
      const srcIdx =
        (srcY * srcW + srcX) * layout.bytesPerPixel;
      const dstIdx = dstY * size + x + padX;

      data[dstIdx] = pixels[srcIdx + layout.red] / 255;
      data[plane + dstIdx] = pixels[srcIdx + layout.green] / 255;
      data[2 * plane + dstIdx] = pixels[srcIdx + layout.blue] / 255;
    }
  }

  return { data, scale, padX, padY };
}

/**
 * Preferred live-camera path. It consumes Nitro Image's raw pixel buffer
 * directly, so no JPEG/PNG encoding or JS image decoding is performed.
 */
export function preprocessRawPixelData(
  raw: RawPixelData,
  inputSize: number,
): PreprocessResult {
  const bytes = new Uint8Array(raw.buffer);
  const { data, scale, padX, padY } = letterboxRawToTensor(
    bytes,
    raw.width,
    raw.height,
    raw.pixelFormat,
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

/**
 * Compatibility path for callers that already have encoded JPEG bytes.
 */
export function preprocessJpegBytes(
  input: Uint8Array | ArrayBuffer,
  inputSize: number,
): PreprocessResult {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!isJpeg) {
    throw new Error('The provided image bytes are not a JPEG image.');
  }

  const raw = jpeg.decode(bytes, { useTArray: true }) as {
    width: number;
    height: number;
    data: Uint8Array;
  };

  return preprocessRawPixelData(
    {
      buffer: raw.data.buffer as ArrayBuffer,
      width: raw.width,
      height: raw.height,
      pixelFormat: 'RGBA',
    },
    inputSize,
  );
}

/** Kept for callers that already have Base64 JPEG data. */
export function preprocessJpegBase64(
  base64: string,
  inputSize: number,
): PreprocessResult {
  return preprocessJpegBytes(Buffer.from(base64, 'base64'), inputSize);
}
