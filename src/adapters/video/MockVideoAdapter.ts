import { IVideoAdapter, VideoSession, VideoRecording } from './IVideoAdapter';

export class MockVideoAdapter implements IVideoAdapter {
  readonly isMock = true as const;
  private readonly sessions = new Map<string, VideoSession>();

  async createSession(params: {
    hostId: string;
    topic: string;
    startTime: Date;
    durationMinutes: number;
  }): Promise<VideoSession> {
    const id = `mock_session_${Date.now()}`;
    const session: VideoSession = {
      id,
      joinUrl: `http://mock-video.local/join/${id}`,
      hostUrl: `http://mock-video.local/host/${id}?hostId=${params.hostId}`,
      startTime: params.startTime,
      expiresAt: new Date(params.startTime.getTime() + params.durationMinutes * 60_000),
    };
    this.sessions.set(id, session);
    return session;
  }

  async getSession(sessionId: string): Promise<VideoSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async endSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async getRecording(sessionId: string): Promise<VideoRecording | null> {
    return {
      id: `mock_rec_${sessionId}`,
      sessionId,
      playbackUrl: `http://mock-video.local/recordings/${sessionId}`,
      durationSeconds: 3600,
      recordedAt: new Date(),
    };
  }

  async ping(): Promise<boolean> { return true; }
}
