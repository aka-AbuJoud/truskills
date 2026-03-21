import { INotificationAdapter, NotificationPayload, NotificationResult } from './INotificationAdapter';

export class MockNotificationAdapter implements INotificationAdapter {
  readonly isMock = true as const;
  readonly sent: NotificationPayload[] = []; // inspectable in tests

  async send(notification: NotificationPayload): Promise<NotificationResult> {
    this.sent.push(notification);
    return { id: `mock_notif_${Date.now()}`, status: 'SENT', sent_at: new Date() };
  }

  async ping(): Promise<boolean> { return true; }
}
