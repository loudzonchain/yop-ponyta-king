import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import crypto from "node:crypto";

const DEFAULT_UPLOAD_DIR = "./public/uploads/cards";

function getExtension(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    default:
      return "";
  }
}

export async function saveCardImage(file: File) {
  const uploadDir = process.env.LOCAL_UPLOAD_DIR || DEFAULT_UPLOAD_DIR;
  const absoluteUploadDir = path.resolve(process.cwd(), uploadDir);
  const extension = getExtension(file.type);

  if (!extension) {
    throw new Error("Unsupported image type.");
  }

  await mkdir(absoluteUploadDir, { recursive: true });

  const filename = `${crypto.randomUUID()}${extension}`;
  const destination = path.join(absoluteUploadDir, filename);
  const bytes = await file.arrayBuffer();

  await writeFile(destination, Buffer.from(bytes));

  return {
    filename,
    publicUrl: `/uploads/cards/${filename}`,
  };
}
