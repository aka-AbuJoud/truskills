import { Knex } from 'knex';

// Phase I — Seeker Experience
// New table: booking_reviews
// Closes the Signal 2 (Review Quality) loop in the Merit Engine.
// Reviews are submitted by seekers after confirmed bookings.
// Published immediately on submission; ops can remove for policy violation.

export async function up(knex: Knex): Promise<void> {
  // ── Booking Reviews ─────────────────────────────────────────────────────────
  await knex.schema.createTable('booking_reviews', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // One review per booking — enforced at DB level
    t.uuid('booking_id')
      .notNullable()
      .unique()
      .references('id')
      .inTable('bookings')
      .onDelete('RESTRICT');

    t.uuid('seeker_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');

    // Denormalized for efficient Signal 2 aggregate queries (avoids JOIN to bookings)
    t.uuid('provider_id').notNullable().references('id').inTable('providers').onDelete('RESTRICT');
    t.uuid('listing_id').notNullable();        // course_id | trip_id | product_id
    t.string('listing_type', 10).notNullable(); // COURSE | TRIP | PRODUCT

    // Rating: 1–5 integer scale
    t.smallint('rating').notNullable();
    t.text('review_text').nullable();

    // Status: PUBLISHED (live) | REMOVED (ops action for policy violation)
    t.string('status', 15).notNullable().defaultTo('PUBLISHED');

    t.timestamp('published_at', { useTz: true }).notNullable();
    t.timestamp('removed_at', { useTz: true }).nullable();
    t.text('removal_reason').nullable();
    t.uuid('removed_by').nullable(); // ops actor

    t.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE booking_reviews
    ADD CONSTRAINT booking_reviews_rating_check
    CHECK (rating BETWEEN 1 AND 5)
  `);
  await knex.raw(`
    ALTER TABLE booking_reviews
    ADD CONSTRAINT booking_reviews_listing_type_check
    CHECK (listing_type IN ('COURSE','TRIP','PRODUCT'))
  `);
  await knex.raw(`
    ALTER TABLE booking_reviews
    ADD CONSTRAINT booking_reviews_status_check
    CHECK (status IN ('PUBLISHED','REMOVED'))
  `);

  // Index for Signal 2 aggregate query: provider + published reviews
  await knex.raw(`
    CREATE INDEX booking_reviews_provider_status_idx
    ON booking_reviews(provider_id, status)
    WHERE status = 'PUBLISHED'
  `);
  // Index for listing-level review listing (detail pages)
  await knex.raw(`
    CREATE INDEX booking_reviews_listing_idx
    ON booking_reviews(listing_id, listing_type, status)
    WHERE status = 'PUBLISHED'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('booking_reviews');
}
