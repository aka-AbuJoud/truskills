import { IStorageAdapter, UploadResult } from './IStorageAdapter';

// RealStorageAdapter — production implementation.
// Reads credentials from: STORAGE_BUCKET_NAME, STORAGE_ACCESS_KEY.
// [VENDOR_IMPL]: wire to S3-compatible SDK (AWS S3, Cloudflare R2, etc.) once vendor confirmed.

export class RealStorageAdapter implements IStorageAdapter {
  readonly isMock = false as const;

  private readonly bucketName: string;
  private readonly accessKey: string;

  constructor() {
    const bucket = process.env.STORAGE_BUCKET_NAME;
    const key = process.env.STORAGE_ACCESS_KEY;
    if (!bucket || !key) {
      throw new Error('RealStorageAdapter: STORAGE_BUCKET_NAME and STORAGE_ACCESS_KEY are required.');
    }
    this.bucketName = bucket;
    this.accessKey = key;
  }

  async upload(_params: { key: string; buffer: Buffer; contentType: string; isPublic?: boolean }): Promise<UploadResult> {
    // [VENDOR_IMPL] s3Client.putObject(...)
    throw new Error('RealStorageAdapter.upload: [VENDOR_IMPL] not yet wired.');
  }

  async getUrl(_key: string, _expiresInSeconds?: number): Promise<string> {
    // [VENDOR_IMPL] s3Client.getSignedUrl(...) or public URL construction
    throw new Error('RealStorageAdapter.getUrl: [VENDOR_IMPL] not yet wired.');
  }

  async delete(_key: string): Promise<void> {
    // [VENDOR_IMPL] s3Client.deleteObject(...)
    throw new Error('RealStorageAdapter.delete: [VENDOR_IMPL] not yet wired.');
  }

  async ping(): Promise<boolean> {
    return !!(this.bucketName && this.accessKey);
  }
}
