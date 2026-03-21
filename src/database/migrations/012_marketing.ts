import { Knex } from 'knex';

// Phase J — Marketing: boost campaigns + listing merit overrides
// Boost campaigns: self-serve only at launch. Providers cannot configure arbitrary promotions.
// boost status state machine: ACTIVE → PAUSED ↔ ACTIVE → CANCELLED | COMPLETED

export async function up(knex: Knex): Promise<void> {
  // ── Boost Campaigns ─────────────────────────────────────────────────────────
  await knex.schema.createTable('boost_campaigns', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('provider_id').notNullable().references('id').inTable('providers').onDelete('RESTRICT');
    t.uuid('listing_id').notNullable();
    t.string('listing_type', 10).notNullable(); // COURSE | TRIP | PRODUCT
    t.string('status', 15).notNullable().defaultTo('ACTIVE');
    t.bigint('daily_budget_halalas').notNullable(); // max: BOOST_DAILY_SPEND_CAP env var
    t.timestamp('started_at', { useTz: true }).nullable();
    t.timestamp('paused_at', { useTz: true }).nullable();
    t.timestamp('cancelled_at', { useTz: true }).nullable();
    t.timestamp('completed_at', { useTz: true }).nullable();
    t.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE boost_campaigns ADD CONSTRAINT boost_campaigns_status_check
    CHECK (status IN ('ACTIVE','PAUSED','CANCELLED','COMPLETED'))
  `);
  await knex.raw(`
    ALTER TABLE boost_campaigns ADD CONSTRAINT boost_campaigns_listing_type_check
    CHECK (listing_type IN ('COURSE','TRIP','PRODUCT'))
  `);
  await knex.raw(`
    ALTER TABLE boost_campaigns ADD CONSTRAINT boost_campaigns_budget_positive
    CHECK (daily_budget_halalas > 0)
  `);

  await knex.raw(`CREATE INDEX boost_campaigns_provider_status_idx ON boost_campaigns(provider_id, status)`);
  await knex.raw(`CREATE INDEX boost_campaigns_listing_idx ON boost_campaigns(listing_id, listing_type, status)`);

  // ── Listing Merit Overrides (Strategic slot assignment — ops-only) ───────────
  // Requires Director approval before any insert (see ops-runbook.md Section 4).
  // All overrides must have expires_at — no permanent overrides at launch.
  await knex.schema.createTable('listing_merit_overrides', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('listing_id').notNullable();
    t.string('listing_type', 10).notNullable();
    t.string('override_type', 15).notNullable().defaultTo('STRATEGIC'); // STRATEGIC only at launch
    t.text('override_reason').notNullable();
    t.uuid('approved_by').notNullable(); // ops actor who has Director approval
    t.timestamp('expires_at', { useTz: true }).notNullable(); // mandatory — no permanent overrides
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE listing_merit_overrides ADD CONSTRAINT listing_merit_overrides_type_check
    CHECK (override_type IN ('STRATEGIC'))
  `);
  await knex.raw(`CREATE INDEX listing_merit_overrides_listing_idx ON listing_merit_overrides(listing_id, is_active)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('listing_merit_overrides');
  await knex.schema.dropTableIfExists('boost_campaigns');
}
