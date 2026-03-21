import { Knex } from 'knex';
import { BookingRecord } from './bookings.service';

export class BookingsRepository {
  constructor(private readonly db: Knex) {}

  async findById(bookingId: string): Promise<BookingRecord | null> {
    const row = await this.db('bookings').where({ id: bookingId }).first();
    return row ? (row as BookingRecord) : null;
  }

  async findByIdOrThrow(bookingId: string): Promise<BookingRecord> {
    const booking = await this.findById(bookingId);
    if (!booking) throw new Error(`NOT_FOUND: Booking ${bookingId} not found`);
    return booking;
  }

  async findBySeekerAllStatuses(seekerId: string): Promise<BookingRecord[]> {
    return this.db('bookings')
      .where({ seeker_id: seekerId })
      .orderBy('created_at', 'desc') as unknown as BookingRecord[];
  }

  async findByProviderAllStatuses(providerId: string): Promise<BookingRecord[]> {
    return this.db('bookings')
      .where({ provider_id: providerId })
      .orderBy('created_at', 'desc') as unknown as BookingRecord[];
  }

  async findByProviderAndStatus(providerId: string, status: string): Promise<BookingRecord[]> {
    return this.db('bookings')
      .where({ provider_id: providerId, status })
      .orderBy('session_date', 'asc') as unknown as BookingRecord[];
  }
}
