import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { env } from "../../config/env.js";

/**
 * Simplified KYC storage.
 *
 * HACKATHON SHORTCUT: this stores an ID photo and a selfie and (when
 * KYC_AUTO_VERIFY is on) marks the user verified. There is NO biometric
 * face match and NO document OCR — nothing here proves the selfie and the
 * ID belong to the same person. The UI must present this as "documents
 * received", never as a passed identity check. Swap `storeKycImage` for
 * Supabase Storage plus a real verification vendor to make it genuine.
 */

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class KycUploadError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function uploadRoot() {
  return path.resolve(process.cwd(), env.KYC_UPLOAD_DIR);
}

interface DecodedImage {
  buffer: Buffer;
  extension: string;
}

/** Accepts a bare base64 string or a full `data:image/png;base64,...` URL. */
function decodeImage(
  input: unknown,
  declaredMime: string | undefined,
  field: string,
): DecodedImage {
  if (typeof input !== "string" || input.trim() === "") {
    throw new KycUploadError(`${field}_required`);
  }

  let mime = declaredMime;
  let payload = input.trim();

  const dataUrl = /^data:([\w/+.-]+);base64,(.*)$/s.exec(payload);
  if (dataUrl) {
    mime = dataUrl[1];
    payload = dataUrl[2] ?? "";
  }

  const extension = ALLOWED_MIME[(mime ?? "image/jpeg").toLowerCase()];
  if (!extension) {
    throw new KycUploadError(`${field}_unsupported_type`);
  }

  const buffer = Buffer.from(payload, "base64");
  if (buffer.length === 0) {
    throw new KycUploadError(`${field}_not_base64`);
  }
  if (buffer.length > env.KYC_MAX_UPLOAD_BYTES) {
    throw new KycUploadError(`${field}_too_large`, 413);
  }

  return { buffer, extension };
}

/**
 * Writes one image under `<uploadDir>/<userId>/` and returns the API path the
 * frontend can render. The random filename means the path is unguessable even
 * before the per-user auth check in the file route.
 */
async function storeKycImage(
  userId: string,
  kind: "id" | "selfie",
  image: DecodedImage,
): Promise<string> {
  const dir = path.join(uploadRoot(), userId);
  await fs.mkdir(dir, { recursive: true });

  const filename = `${kind}-${crypto.randomBytes(8).toString("hex")}.${image.extension}`;
  await fs.writeFile(path.join(dir, filename), image.buffer, { mode: 0o600 });

  return `/api/auth/kyc/file/${userId}/${filename}`;
}

export interface StoredKycUpload {
  idDocUrl: string;
  selfieUrl: string;
}

export async function storeKycUpload(
  userId: string,
  body: {
    idDocBase64?: unknown;
    selfieBase64?: unknown;
    idDocMimeType?: string;
    selfieMimeType?: string;
  },
): Promise<StoredKycUpload> {
  const idDoc = decodeImage(body.idDocBase64, body.idDocMimeType, "id_doc");
  const selfie = decodeImage(body.selfieBase64, body.selfieMimeType, "selfie");

  return {
    idDocUrl: await storeKycImage(userId, "id", idDoc),
    selfieUrl: await storeKycImage(userId, "selfie", selfie),
  };
}

/** Resolves a stored file, refusing anything that escapes the user's folder. */
export async function resolveKycFile(
  userId: string,
  filename: string,
): Promise<string | null> {
  if (!/^[a-zA-Z0-9._-]+$/.test(filename) || filename.includes("..")) {
    return null;
  }

  const userDir = path.join(uploadRoot(), userId);
  const target = path.resolve(userDir, filename);
  if (target !== path.join(userDir, filename)) return null;

  try {
    await fs.access(target);
    return target;
  } catch {
    return null;
  }
}
