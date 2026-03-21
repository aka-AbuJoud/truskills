import * as fs from 'fs';
import * as path from 'path';
import { INotificationAdapter, NotificationPayload, NotificationResult } from './INotificationAdapter';

// ConsoleNotificationAdapter — non-production, staging/dev only.
// Writes notifications to stdout and optionally to NOTIFICATION_LOG_FILE.
// Swap-ready: replace with RealNotificationAdapter when vendor confirmed.
// DO NOT use in production — isMock flag triggers safety validator rejection.

export class ConsoleNotificationAdapter implements INotificationAdapter {
  readonly isMock = true as const; // intentional: blocks production boot

  private readonly logFile: string | null;

  constructor() {
    const logDir = process.env.NOTIFICATION_LOG_FILE
      ? path.dirname(process.env.NOTIFICATION_LOG_FILE)
      : null;
    this.logFile = process.env.NOTIFICATION_LOG_FILE ?? null;
    if (logDir) fs.mkdirSync(logDir, { recursive: true });
  }

  async send(notification: NotificationPayload): Promise<NotificationResult> {
    const id = `console_notif_${Date.now()}`;
    const entry = {
      id,
      timestamp: new Date().toISOString(),
      type: notification.type,
      recipientId: notification.recipientId,
      recipientEmail: notification.recipientEmail,
      subject: notification.subject,
      bodyText: notification.bodyText,
    };

    // eslint-disable-next-line no-console
    console.log(`[ConsoleNotificationAdapter] ${JSON.stringify(entry, null, 2)}`);

    if (this.logFile) {
      fs.appendFileSync(this.logFile, JSON.stringify(entry) + '\n');
    }

    return { id, status: 'SENT', sent_at: new Date() };
  }

  async ping(): Promise<boolean> { return true; }
}
