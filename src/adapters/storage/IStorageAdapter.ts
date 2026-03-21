// Storage adapter interface — provider-agnostic (LOCKED).

export interface UploadResult {
  key: string;            // storage object key / path
  url: string;            // public or signed URL
  size_bytes: number;
  content_type: string;
  uploaded_at: Date;
}

export interface IStorageAdapter {
  readonly isMock: boolean;

  upload(params: {
    key: string;
    buffer: Buffer;
    contentType: string;
    isPublic?: boolean;
  }): Promise<UploadResult>;

  getUrl(key: string, expiresInSeconds?: number): Promise<string>;

  delete(key: string): Promise<void>;

  ping(): Promise<boolean>;
}
