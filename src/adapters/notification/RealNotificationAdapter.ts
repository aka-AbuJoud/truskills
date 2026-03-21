import { INotificationAdapter, NotificationPayload, NotificationResult } from './INotificationAdapter';

// RealNotificationAdapter — production implementation.
// Reads credentials from: NOTIFICATION_API_KEY.
// [VENDOR_IMPL]: wire to transactional email provider (SendGrid, Postmark, etc.) once vendor confirmed.

export class RealNotificationAdapter implements INotificationAdapter {
  readonly isMock = false as const;

  private readonly apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.NOTIFICATION_API_KEY;
  }

  async send(_notification: NotificationPayload): Promise<NotificationResult> {
    // [VENDOR_IMPL] e.g. sendgridClient.send({ to, subject, text, html })
    throw new Error('RealNotificationAdapter.send: [VENDOR_IMPL] not yet wired.');
  }

  async ping(): Promise<boolean> {
    // [VENDOR_IMPL] lightweight API health check
    return !!this.apiKey;
  }
}
