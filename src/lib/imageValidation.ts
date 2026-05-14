/**
 * Client-side validation for user-uploaded photos before they hit the canvas
 * or the wire. Enforces:
 *  - max input size 25 MB
 *  - mime/extension limited to PNG/JPG
 *  - magic-byte signature check so a renamed file can't slip through
 */

export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
export const ALLOWED_INPUT_MIME = ['image/png', 'image/jpeg'] as const;
export const ALLOWED_INPUT_EXTENSIONS = ['.png', '.jpg', '.jpeg'] as const;
export const INPUT_ACCEPT = '.png,.jpg,.jpeg,image/png,image/jpeg';

export type ImageValidationError = {
  code: 'type' | 'size' | 'empty' | 'corrupt';
  message: string;
};

export type ImageValidationResult =
  | { ok: true }
  | { ok: false; error: ImageValidationError };

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export async function validateUploadedImage(file: File): Promise<ImageValidationResult> {
  if (!file) {
    return { ok: false, error: { code: 'empty', message: 'No file selected.' } };
  }
  if (file.size === 0) {
    return { ok: false, error: { code: 'empty', message: 'File is empty.' } };
  }
  if (file.size > MAX_INPUT_BYTES) {
    return {
      ok: false,
      error: {
        code: 'size',
        message: `File is ${formatBytes(file.size)}. Maximum is ${formatBytes(MAX_INPUT_BYTES)}.`,
      },
    };
  }

  const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
  const mimeOk = (ALLOWED_INPUT_MIME as readonly string[]).includes(file.type);
  const extOk = (ALLOWED_INPUT_EXTENSIONS as readonly string[]).includes(ext);
  if (!mimeOk && !extOk) {
    return {
      ok: false,
      error: {
        code: 'type',
        message: 'Only PNG and JPG images are allowed.',
      },
    };
  }

  const head = await readHead(file, 12);
  if (!isPNG(head) && !isJPG(head)) {
    return {
      ok: false,
      error: {
        code: 'corrupt',
        message: 'File is not a valid PNG or JPG.',
      },
    };
  }

  return { ok: true };
}

function readHead(file: File, bytes: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const slice = file.slice(0, bytes);
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(slice);
  });
}

function isPNG(b: Uint8Array): boolean {
  return (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  );
}

function isJPG(b: Uint8Array): boolean {
  return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}
