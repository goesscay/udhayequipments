import type { DocumentType } from '@udhay/shared';
import { api } from './api';

const MAX_EDGE = 1600;
const QUALITY = 0.8;

/**
 * Shrinks phone photos before upload (a 12 MP photo becomes ~300 KB) to save server disk space
 * and mobile data. Non-images, HEIC (which browsers can't decode) and small files pass through.
 */
export async function compressImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 400_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // JPEG has no transparency: paint white first so PNG screenshots don't turn black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export interface UploadedDocument {
  id: string;
  type: DocumentType;
  version: number;
  fileName: string;
}

export async function uploadDocument(projectId: string, type: DocumentType, file: File): Promise<UploadedDocument> {
  const fd = new FormData();
  fd.append('type', type);
  fd.append('file', await compressImage(file));
  return api<UploadedDocument>(`/projects/${projectId}/documents`, { method: 'POST', body: fd });
}

/** Downloads a stored document through the authenticated API and returns an object URL. */
export async function documentObjectUrl(documentId: string): Promise<string> {
  const blob = await api<Blob>(`/documents/${documentId}/download`);
  return URL.createObjectURL(blob);
}
