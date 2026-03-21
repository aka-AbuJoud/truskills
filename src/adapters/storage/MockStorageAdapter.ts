import { IStorageAdapter, UploadResult } from './IStorageAdapter';

export class MockStorageAdapter implements IStorageAdapter {
  readonly isMock = true as const;
  private readonly store = new Map<string, { buffer: Buffer; contentType: string }>();

  async upload(params: { key: string; buffer: Buffer; contentType: string; isPublic?: boolean }): Promise<UploadResult> {
    this.store.set(params.key, { buffer: params.buffer, contentType: params.contentType });
    return {
      key: params.key,
      url: `http://mock-storage.local/${params.key}`,
      size_bytes: params.buffer.length,
      content_type: params.contentType,
      uploaded_at: new Date(),
    };
  }

  async getUrl(key: string, _expiresInSeconds?: number): Promise<string> {
    return `http://mock-storage.local/${key}`;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async ping(): Promise<boolean> { return true; }
}
