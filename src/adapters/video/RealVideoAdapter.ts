import { IVideoAdapter, VideoSession, VideoRecording } from './IVideoAdapter';

// RealVideoAdapter — production implementation.
// Reads credentials from: VIDEO_CDN_ENDPOINT, VIDEO_API_KEY.
// [VENDOR_IMPL]: wire to video conferencing provider (Zoom, Daily.co, etc.) once vendor confirmed.

export class RealVideoAdapter implements IVideoAdapter {
  readonly isMock = false as const;

  private readonly endpoint: string;
  private readonly apiKey: string;

  constructor() {
    const endpoint = process.env.VIDEO_CDN_ENDPOINT;
    const key = process.env.VIDEO_API_KEY;
    if (!endpoint || !key) {
      throw new Error('RealVideoAdapter: VIDEO_CDN_ENDPOINT and VIDEO_API_KEY are required.');
    }
    this.endpoint = endpoint;
    this.apiKey = key;
  }

  async createSession(_params: {
    hostId: string;
    topic: string;
    startTime: Date;
    durationMinutes: number;
  }): Promise<VideoSession> {
    // [VENDOR_IMPL] POST to vendor API to create meeting/room
    throw new Error('RealVideoAdapter.createSession: [VENDOR_IMPL] not yet wired.');
  }

  async getSession(_sessionId: string): Promise<VideoSession | null> {
    // [VENDOR_IMPL] GET meeting/room details from vendor API
    throw new Error('RealVideoAdapter.getSession: [VENDOR_IMPL] not yet wired.');
  }

  async endSession(_sessionId: string): Promise<void> {
    // [VENDOR_IMPL] DELETE or end meeting via vendor API
    throw new Error('RealVideoAdapter.endSession: [VENDOR_IMPL] not yet wired.');
  }

  async getRecording(_sessionId: string): Promise<VideoRecording | null> {
    // [VENDOR_IMPL] GET recording URL from vendor API or CDN
    throw new Error('RealVideoAdapter.getRecording: [VENDOR_IMPL] not yet wired.');
  }

  async ping(): Promise<boolean> {
    // [VENDOR_IMPL] lightweight health check against VIDEO_CDN_ENDPOINT
    return !!(this.endpoint && this.apiKey);
  }
}
