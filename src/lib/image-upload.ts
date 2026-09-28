// Client-side image validation + compression for admin uploads.
// Converts to WebP, scales down to a max width, and validates type/size.

const MAX_SIZE_MB = 5;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export const validateImage = (file: File) => {
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    throw new Error(`File too large. Max ${MAX_SIZE_MB}MB allowed.`);
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Only JPEG, PNG, WebP, or GIF images allowed.");
  }
};

export const compressImage = (
  file: File,
  maxWidth = 1200,
  quality = 0.85
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          return reject(new Error("Canvas not supported"));
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (!blob) return reject(new Error("Compression failed"));
            resolve(blob);
          },
          "image/webp",
          quality
        );
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image"));
    };
    img.src = url;
  });

export const toWebpPath = (path: string) => path.replace(/\.[^.]+$/, ".webp");

export const prepareUpload = async (file: File) => {
  validateImage(file);
  const blob = await compressImage(file);
  return { blob, contentType: "image/webp" as const };
};

/**
 * Like prepareUpload, with a larger max width (e.g. 1920 for hero banners) and
 * the final pixel size, which the storefront uses as width / height (no layout shift).
 */
export const prepareUploadSized = async (file: File, maxWidth: number) => {
  validateImage(file);
  const blob = await compressImage(file, maxWidth);
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return { blob, contentType: "image/webp" as const, ...size };
};
