import crypto from 'crypto';

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY || '';
  if (!raw) throw new Error('ENCRYPTION_KEY is not set');
  // Accept base64 or hex for 32-byte key
  try {
    if (/^[A-Fa-f0-9]{64}$/.test(raw)) {
      return Buffer.from(raw, 'hex');
    }
    const b64 = Buffer.from(raw, 'base64');
    if (b64.length === 32) return b64;
    // Fallback: direct utf-8 (not recommended)
    const utf = Buffer.from(raw, 'utf-8');
    if (utf.length === 32) return utf;
  } catch {}
  throw new Error('ENCRYPTION_KEY must be 32 bytes in base64 or hex');
}

const KEY = getKey();

export function encryptString(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ciphertext.toString('base64'),
  };
  return Buffer.from(JSON.stringify(blob)).toString('base64');
}

export function decryptString(enc: string): string {
  try {
    const json = Buffer.from(enc, 'base64').toString('utf8');
    const blob = JSON.parse(json) as { iv: string; tag: string; ct: string };
    const iv = Buffer.from(blob.iv, 'base64');
    const tag = Buffer.from(blob.tag, 'base64');
    const ct = Buffer.from(blob.ct, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    return plain.toString('utf8');
  } catch (err) {
    throw new Error('Failed to decrypt value');
  }
}

export function isEncryptedString(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const json = Buffer.from(value, 'base64').toString('utf8');
    const blob = JSON.parse(json);
    return typeof blob?.iv === 'string' && typeof blob?.tag === 'string' && typeof blob?.ct === 'string';
  } catch {
    return false;
  }
}
