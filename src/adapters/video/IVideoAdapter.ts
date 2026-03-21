// Video adapter interface — provider-agnostic (LOCKED).

export interface VideoSession {
  id: string;
  joinUrl: string;       // for participants
  hostUrl: string;       // for provider only
  startTime: Date;
  expiresAt: Date;
}

export interface VideoRecording {
  id: string;
  sessionId: string;
  playbackUrl: string;
  durationSeconds: number;
  recordedAt: Date;
}

export interface IVideoAdapter {
  readonly isMock: boolean;

  createSession(params: {
    hostId: string;
    topic: string;
    startTime: Date;
    durationMinutes: number;
  }): Promise<VideoSession>;

  getSession(sessionId: string): Promise<VideoSession | null>;

  endSession(sessionId: string): Promise<void>;

  getRecording(sessionId: string): Promise<VideoRecording | null>;

  ping(): Promise<boolean>;
}
