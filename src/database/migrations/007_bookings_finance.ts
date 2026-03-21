import { Knex } from 'knex';

// Phase E+C — Bookings + Finance
// Finance is the SINGLE authoritative money source of truth (LOCKED).
// Booking state machine (LOCKED):
//   PENDING_PAYMENT → PENDING_CONFIRMATION → CONFIRMED → IN_PROGRESS → COMPLETED
//                                          ↓
//                              CANCELLED_BY_SEEKER | CANCELLED_BY_PROVIDER | CANCELLED_BY_OPS
//                                          ↓
//                              REFUND_REQUESTED → REFUNDED

export async function up(knex: Knex): Promise<void> {
  // ── Bookings ────────────────────────────────────────────────────────────────
  await knex.schema.createTable('bookings', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('seeker_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.uuid('provider_id').notNullable().references('id').inTable('providers').onDelete('RESTRICT');
    t.uuid('listing_id').notNullable();            // course_id | trip_id | product_id
    t.string('listing_type', 10).notNullable();    // COURSE | TRIP | PRODUCT
    t.string('listing_title_snapshot', 500).notNullable(); // title at booking time
    t.bigint('price_halalas').notNullable();
    t.string('currency', 3).notNullable().defaultTo('SAR');
    t.string('status', 30).notNullable().defaultTo('PENDING_PAYMENT');
    t.timestamp('session_date', { useTz: true }).nullable();
    t.uuid('course_id').nullable(); // denormalized for enrollment tracking
    t.text('notes').nullable();
    t.string('payment_hold_id', 255).nullable(); // adapter-layer hold reference
    t.text('cancelled_reason').nullable();
    t.timestamp('cancelled_at', { useTz: true }).nullable();
    t.timestamp('confirmed_at', { useTz: true }).nullable();
    t.timestamp('completed_at', { useTz: true }).nullable();
    t.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE bookings ADD CONSTRAINT bookings_listing_type_check
    CHECK (listing_type IN ('COURSE','TRIP','PRODUCT'))
  `);
  await knex.raw(`
    ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
    CHECK (status IN (
      'PENDING_PAYMENT','PENDING_CONFIRMATION','CONFIRMED','IN_PROGRESS','COMPLETED',
      'CANCELLED_BY_SEEKER','CANCELLED_BY_PROVIDER','CANCELLED_BY_OPS',
      'REFUND_REQUESTED','REFUNDED'
    ))
  `);

  await knex.raw(`CREATE INDEX bookings_seeker_id_idx ON bookings(seeker_id)`);
  await knex.raw(`CREATE INDEX bookings_provider_id_idx ON bookings(provider_id)`);
  await knex.raw(`CREATE INDEX bookings_listing_id_idx ON bookings(listing_id, listing_type)`);
  await knex.raw(`CREATE INDEX bookings_status_idx ON bookings(status)`);

  // Post-confirmation access details (location privacy enforcement)
  // Exact address / meeting link revealed only for CONFIRMED / IN_PROGRESS / COMPLETED bookings
  await knex.schema.createTable('booking_access_details', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('booking_id').notNullable().unique().references('id').inTable('bookings').onDelete('CASCADE');
    t.text('exact_address').nullable();
    t.text('meeting_link').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Course-specific enrollment tracking
  await knex.schema.createTable('course_enrollment_details', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('booking_id').notNullable().unique().references('id').inTable('bookings').onDelete('CASCADE');
    t.uuid('course_id').notNullable();
    // completion_status: ENROLLED → COMPLETED | DROPPED
    t.string('completion_status', 15).notNullable().defaultTo('ENROLLED');
    t.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE course_enrollment_details ADD CONSTRAINT course_enrollment_status_check
    CHECK (completion_status IN ('ENROLLED','COMPLETED','DROPPED'))
  `);

  // ── Finance Transactions ────────────────────────────────────────────────────
  // Single authoritative record for all money movement.
  // transaction_type: PAYMENT_HOLD | PAYMENT_CAPTURE | PAYMENT_RELEASE | REFUND | PAYOUT
  await knex.schema.createTable('finance_transactions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('booking_id').nullable().references('id').inTable('bookings').onDelete('RESTRICT');
    t.uuid('seeker_id').nullable().references('id').inTable('users').onDelete('RESTRICT');
    t.uuid('provider_id').nullable().references('id').inTable('providers').onDelete('RESTRICT');
    t.bigint('amount_halalas').notNullable();
    t.string('currency', 3).notNullable().defaultTo('SAR');
    t.string('transaction_type', 25).notNullable();
    t.string('status', 20).notNullable().defaultTo('PENDING');
    t.string('payment_hold_id', 255).nullable();
    t.string('gateway_transaction_id', 255).nullable();
    t.text('ops_note').nullable();
    t.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE finance_transactions ADD CONSTRAINT finance_transactions_type_check
    CHECK (transaction_type IN ('PAYMENT_HOLD','PAYMENT_CAPTURE','PAYMENT_RELEASE','REFUND','PAYOUT'))
  `);
  await knex.raw(`
    ALTER TABLE finance_transactions ADD CONSTRAINT finance_transactions_status_check
    CHECK (status IN ('PENDING','COMPLETED','FAILED','REFUNDED'))
  `);
  await knex.raw(`CREATE INDEX finance_transactions_booking_id_idx ON finance_transactions(booking_id)`);
  await knex.raw(`CREATE INDEX finance_transactions_provider_id_idx ON finance_transactions(provider_id)`);
  await knex.raw(`CREATE INDEX finance_transactions_seeker_id_idx ON finance_transactions(seeker_id)`);

  // Payout batches (provider payouts — scheduled, minimum-threshold-gated)
  await knex.schema.createTable('payout_batches', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('provider_id').notNullable().references('id').inTable('providers').onDelete('RESTRICT');
    t.bigint('total_halalas').notNullable();
    t.string('currency', 3).notNullable().defaultTo('SAR');
    t.string('status', 15).notNullable().defaultTo('PENDING');
    t.string('payout_reference', 255).nullable();
    t.timestamp('scheduled_at', { useTz: true }).nullable();
    t.timestamp('processed_at', { useTz: true }).nullable();
    t.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE payout_batches ADD CONSTRAINT payout_batches_status_check
    CHECK (status IN ('PENDING','QUEUED','PROCESSED','FAILED'))
  `);
  await knex.raw(`CREATE INDEX payout_batches_provider_id_idx ON payout_batches(provider_id)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('payout_batches');
  await knex.schema.dropTableIfExists('finance_transactions');
  await knex.schema.dropTableIfExists('course_enrollment_details');
  await knex.schema.dropTableIfExists('booking_access_details');
  await knex.schema.dropTableIfExists('bookings');
}
