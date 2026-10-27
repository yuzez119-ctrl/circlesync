import { appParams } from "@/lib/app-params";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const COMPRESS_OVER_BYTES = 1.2 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2200;
const JPEG_QUALITY = 0.82;

export function isImageFile(file) {
  return !!file && (file.type || "").startsWith("image/");
}

export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function newItemId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image could not be read"));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob || null), type, quality);
  });
}

function jpegName(name) {
  return (name || "photo").replace(/\.[^.]+$/, "") + ".jpg";
}

// Big photos are shrunk so they stay quick to open for everyone.
export async function compressImage(file) {
  if (!isImageFile(file) || file.type === "image/gif") return { file, compressed: false };

  let image;
  try {
    image = await loadImageElement(file);
  } catch {
    return { file, compressed: false };
  }

  const { naturalWidth, naturalHeight } = image;
  const overEdge = Math.max(naturalWidth, naturalHeight) > MAX_IMAGE_EDGE;
  if (file.size <= COMPRESS_OVER_BYTES && !overEdge) return { file, compressed: false };

  const scale = overEdge ? MAX_IMAGE_EDGE / Math.max(naturalWidth, naturalHeight) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(naturalHeight * scale));
  const context = canvas.getContext("2d");
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
  if (!blob || blob.size >= file.size) return { file, compressed: false };

  return {
    file: new File([blob], jpegName(file.name), { type: "image/jpeg" }),
    compressed: true,
  };
}

// rect is in the image's own pixels: { x, y, width, height }
export async function cropImage(file, rect) {
  const image = await loadImageElement(file);
  const x = Math.max(0, Math.round(rect.x));
  const y = Math.max(0, Math.round(rect.y));
  const width = Math.max(1, Math.min(Math.round(rect.width), image.naturalWidth - x));
  const height = Math.max(1, Math.min(Math.round(rect.height), image.naturalHeight - y));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(image, x, y, width, height, 0, 0, width, height);

  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await canvasToBlob(canvas, type, JPEG_QUALITY);
  if (!blob) throw new Error("That crop could not be saved");

  return new File([blob], file.name, { type });
}

// Uploads privately (no public URL — only people in the chat can open the file),
// reporting progress and stopping the moment the upload is cancelled.
export function uploadPrivateFileWithProgress(file, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (!appParams?.appId) {
      reject(new Error("Uploads are unavailable right now"));
      return;
    }

    const request = new XMLHttpRequest();
    request.open("POST", `/api/apps/${appParams.appId}/integration-endpoints/Core/UploadPrivateFile`);
    request.setRequestHeader("Accept", "application/json");
    if (appParams.token) request.setRequestHeader("Authorization", `Bearer ${appParams.token}`);
    if (typeof window !== "undefined") request.setRequestHeader("X-Origin-URL", window.location.href);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };

    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error("Upload failed — please try again"));
        return;
      }
      let payload = null;
      try {
        payload = JSON.parse(request.responseText || "{}");
      } catch {
        payload = null;
      }
      const fileUri = payload?.file_uri || payload?.data?.file_uri;
      if (!fileUri) {
        reject(new Error("Upload failed — please try again"));
        return;
      }
      if (onProgress) onProgress(100);
      resolve(fileUri);
    };

    request.onerror = () => reject(new Error("Upload failed — check your connection"));
    request.onabort = () => {
      const error = new Error("Upload cancelled");
      error.cancelled = true;
      reject(error);
    };

    if (signal) {
      if (signal.aborted) request.abort();
      else signal.addEventListener("abort", () => request.abort(), { once: true });
    }

    const form = new FormData();
    form.append("file", file, file.name);
    request.send(form);
  });
}