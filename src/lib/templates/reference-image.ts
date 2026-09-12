export const REFERENCE_IMAGE_TOKEN = "__TEMPLATE_REFERENCE_IMAGE__";
export const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;

export type DecodedReferenceImage = {
  bytes: Buffer;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  extension: "png" | "jpg" | "webp";
};

const TYPE_INFO = {
  "image/png": { extension: "png", magic: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  "image/jpeg": { extension: "jpg", magic: (b: Buffer) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/webp": { extension: "webp", magic: (b: Buffer) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
} as const;

export class ReferenceImageError extends Error {
  constructor(
    public readonly code: "invalid_image" | "image_too_large" | "unsupported_image",
    message: string,
  ) {
    super(message);
  }
}

export function decodeReferenceImageDataUrl(dataUrl: string): DecodedReferenceImage {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\r\n]+)$/i.exec(dataUrl.trim());
  if (!match) {
    throw new ReferenceImageError("unsupported_image", "只支持 PNG、JPEG 或 WebP 图片");
  }

  const contentType = match[1].toLowerCase() as keyof typeof TYPE_INFO;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(match[2], "base64");
  } catch {
    throw new ReferenceImageError("invalid_image", "图片数据无法解析");
  }
  if (!bytes.length || !TYPE_INFO[contentType].magic(bytes)) {
    throw new ReferenceImageError("invalid_image", "图片内容与文件类型不匹配");
  }
  if (bytes.byteLength > MAX_REFERENCE_IMAGE_BYTES) {
    throw new ReferenceImageError("image_too_large", "图片不能超过 10 MB");
  }

  return {
    bytes,
    contentType,
    extension: TYPE_INFO[contentType].extension,
  };
}
