// Notification adapter interface — provider-agnostic (LOCKED).

export type NotificationType =
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_COMPLETED'
  | 'REVIEW_RECEIVED'
  | 'PAYOUT_PROCESSED'
  | 'ACTIVATION_STATUS_CHANGED'
  | 'BLOG_POST_REVIEWED'
  | 'DM_RECEIVED';

export interface NotificationPayload {
  type: NotificationType;
  recipientId: string;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationResult {
  id: string;
  status: 'SENT' | 'QUEUED';
  sent_at: Date;
}

export interface INotificationAdapter {
  readonly isMock: boolean;
  send(notification: NotificationPayload): Promise<NotificationResult>;
  ping(): Promise<boolean>;
}
