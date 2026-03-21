import * as fs from 'fs';
import * as path from 'path';
import { IStorageAdapter, UploadResult } from './IStorageAdapter';

// LocalStorageAdapter — non-production, staging/dev only.
// Writes files to LOCAL_STORAGE_DIR (defaults to ./tmp/storage).
// Swap-ready: replace with RealStorageAdapter when vendor confirmed.
// DO NOT use in production — isMock flag triggers safety validator rejection.

export class LocalStorageAdapter implements IStorageAdapter {
  readonly isMock = true as const; // intentional: blocks production boot

  private readonly baseDir: string;
  private readonly baseUrl: string;

  constructor() {
    this.baseDir = process.env.LOCAL_STORAGE_DIR ?? path.resolve(process.cwd(), 'tmp', 'storage');
    this.baseUrl = process.env.LOCAL_STORAGE_BASE_URL ?? 'http://localhost:3000/static/storage';
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  async upload(params: { key: string; buffer: Buffer; contentType: string; isPublic?: boolean }): Promise<UploadResult> {
    const filePath = path.join(this.baseDir, params.key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, params.buffer);
    return {
      key: params.key,
      url: `${this.baseUrl}/${params.key}`,
      size_bytes: params.buffer.length,
      content_type: params.contentType,
      uploaded_at: new Date(),
    };
  }

  async getUrl(key: string, _expiresInSeconds?: number): Promise<string> {
    return `${this.baseUrl}/${key}`;
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.baseDir, key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  async ping(): Promise<boolean> {
    try {
      fs.accessSync(this.baseDir, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }
}
