import { Knex } from 'knex';

// Merit Engine — Phase H
//
// Locked architecture (DO NOT REOPEN):
//   8-signal hierarchy: Signals 1–4 Heavy, Signal 5 Medium, Signals 6–7 Light, Signal 8 Capped
//   Signals 1–4 cannot be outweighed by 5–8 (enforced via weight distribution: 80% vs 20%)
//   Listing score ceiling: provider_composite × 1.25 max uplift
//   Hard tier boundary: listing tier ≤ provider tier
//   Discovery allocation: 60% merit / 25% boost / 15% strategic (enforced at feed build)
//   Merit tier output required at launch — even if Analytics UI is deferred

export async function up(knex: Knex): Promise<void> {
  // ── Provider Merit Profiles ─────────────────────────────────────────────────
  // One row per provider. Upserted on each score recomputation.
  await knex.schema.createTable('provider_merit_profiles', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('provider_id')
      .notNullable()
      .unique()
      .references('id')
      .inTable('providers')
      .onDelete('CASCADE');

    // Individual signal scores — all normalized to 0.0000–1.0000
    // Signals 1–4: Heavy (each × 0.20 in composite = 80% total)
    t.decimal('signal_1_score', 5, 4).notNullable().defaultTo(0); // Verification & Compliance
    t.decimal('signal_2_score', 5, 4).notNullable().defaultTo(0); // Review Quality
    t.decimal('signal_3_score', 5, 4).notNullable().defaultTo(0); // Operational Reliability
    t.decimal('signal_4_score', 5, 4).notNullable().defaultTo(0); // Trust Standing
    // Signal 5: Medium (× 0.10 = 10% total)
    t.decimal('signal_5_score', 5, 4).notNullable().defaultTo(0); // Relevance
    // Signals 6–7: Light (each × 0.03 = 6% total)
    t.decimal('signal_6_score', 5, 4).notNullable().defaultTo(0); // Blog
    t.decimal('signal_7_score', 5, 4).notNullable().defaultTo(0); // Activity
    // Signal 8: Capped boost contribution (max × 0.04 cap = 4% max)
    t.decimal('signal_8_raw', 5, 4).notNullable().defaultTo(0);   // Boost (raw, before cap)

    // Composite score = weighted sum of all signals (0.0000–1.0000)
    // The weight distribution structurally enforces: signals 1–4 cannot be outweighed by 5–8
    t.decimal('composite_score', 5, 4).notNullable().defaultTo(0);

    // Provider tier — derived from composite_score thresholds
    // STANDARD < 0.40 | RISING 0.40–0.60 | ESTABLISHED 0.60–0.80 | PREMIER >= 0.80
    t.string('tier', 20).notNullable().defaultTo('STANDARD');

    t.timestamp('last_computed_at', { useTz: true }).notNullable();
    t.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE provider_merit_profiles
    ADD CONSTRAINT provider_merit_profiles_tier_check
    CHECK (tier IN ('STANDARD','RISING','ESTABLISHED','PREMIER'))
  `);
  await knex.raw(`
    ALTER TABLE provider_merit_profiles
    ADD CONSTRAINT provider_merit_profiles_composite_range
    CHECK (composite_score >= 0 AND composite_score <= 1)
  `);

  // ── Listing Merit Scores ────────────────────────────────────────────────────
  // One row per listing (COURSE / TRIP / PRODUCT). Upserted on recomputation.
  await knex.schema.createTable('listing_merit_scores', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('listing_id').notNullable();         // course_id | trip_id | product_id
    t.string('listing_type', 10).notNullable(); // COURSE | TRIP | PRODUCT
    t.uuid('provider_id').notNullable().references('id').inTable('providers').onDelete('CASCADE');

    // Snapshot of provider state at compute time (avoids JOIN on hot path)
    t.decimal('provider_composite_snapshot', 5, 4).notNullable();
    t.string('provider_tier_snapshot', 20).notNullable();

    // Raw listing-level score before ceiling enforcement
    t.decimal('raw_listing_score', 5, 4).notNullable().defaultTo(0);

    // Final score after ceiling: final ≤ provider_composite × 1.25
    t.decimal('final_listing_score', 5, 4).notNullable().defaultTo(0);

    // Listing tier — enforced to not exceed provider_tier_snapshot (hard tier boundary)
    t.string('listing_tier', 20).notNullable().defaultTo('STANDARD');

    // Active boost for this listing (in halalas — snapshot from Marketing module)
    t.bigint('active_boost_halalas').notNullable().defaultTo(0);

    // Which discovery slot type this listing is currently assigned to
    t.string('discovery_slot_type', 12).notNullable().defaultTo('MERIT');

    t.timestamp('last_computed_at', { useTz: true }).notNullable();
    t.timestamps(true, true);
  });

  await knex.raw(`
    CREATE UNIQUE INDEX listing_merit_scores_listing_unique
    ON listing_merit_scores(listing_id, listing_type)
  `);
  await knex.raw(`
    ALTER TABLE listing_merit_scores
    ADD CONSTRAINT listing_merit_scores_listing_type_check
    CHECK (listing_type IN ('COURSE','TRIP','PRODUCT'))
  `);
  await knex.raw(`
    ALTER TABLE listing_merit_scores
    ADD CONSTRAINT listing_merit_scores_tier_check
    CHECK (listing_tier IN ('STANDARD','RISING','ESTABLISHED','PREMIER'))
  `);
  await knex.raw(`
    ALTER TABLE listing_merit_scores
    ADD CONSTRAINT listing_merit_scores_slot_type_check
    CHECK (discovery_slot_type IN ('MERIT','BOOST','STRATEGIC'))
  `);
  await knex.raw(`
    ALTER TABLE listing_merit_scores
    ADD CONSTRAINT listing_merit_scores_final_ceiling
    CHECK (final_listing_score >= 0 AND final_listing_score <= 1)
  `);
  await knex.raw(`
    ALTER TABLE listing_merit_scores
    ADD CONSTRAINT listing_merit_scores_boost_non_negative
    CHECK (active_boost_halalas >= 0)
  `);
  await knex.raw(
    `CREATE INDEX listing_merit_scores_provider_id_idx ON listing_merit_scores(provider_id)`,
  );
  await knex.raw(
    `CREATE INDEX listing_merit_scores_discovery_idx ON listing_merit_scores(listing_type, discovery_slot_type, final_listing_score DESC)`,
  );

  // ── Merit Signal Events ─────────────────────────────────────────────────────
  // Append-only audit trail of signal-affecting events.
  // Consumed by score recomputation jobs.
  await knex.schema.createTable('merit_signal_events', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('provider_id').notNullable().references('id').inTable('providers').onDelete('CASCADE');
    t.smallint('signal_number').notNullable(); // 1–8
    t.string('event_type', 60).notNullable();  // e.g. REVIEW_RECEIVED, BOOKING_COMPLETED, DOC_EXPIRED
    t.decimal('value_delta', 6, 4).nullable(); // magnitude of change, nullable for qualitative events
    t.timestamp('occurred_at', { useTz: true }).notNullable();
    t.jsonb('metadata').notNullable().defaultTo('{}');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE merit_signal_events
    ADD CONSTRAINT merit_signal_events_signal_number_check
    CHECK (signal_number BETWEEN 1 AND 8)
  `);
  await knex.raw(
    `CREATE INDEX merit_signal_events_provider_id_idx ON merit_signal_events(provider_id, occurred_at DESC)`,
  );
  await knex.raw(
    `CREATE INDEX merit_signal_events_signal_number_idx ON merit_signal_events(signal_number, occurred_at DESC)`,
  );

  // ── Discovery Slots Config ──────────────────────────────────────────────────
  // Stores the locked 60/25/15 allocation as configurable platform config.
  // Values are percentages (stored as integers: 60, 25, 15).
  // This table exists so allocation can be audited; the values must not change
  // without Director approval (they are locked architectural constants).
  await knex.schema.createTable('discovery_allocation_config', (t) => {
    t.string('slot_type', 12).primary();
    t.integer('allocation_percent').notNullable();
    t.string('description', 255).nullable();
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE discovery_allocation_config
    ADD CONSTRAINT discovery_allocation_config_slot_type_check
    CHECK (slot_type IN ('MERIT','BOOST','STRATEGIC'))
  `);

  // Seed locked allocation values — 60/25/15 (LOCKED — DO NOT REOPEN)
  await knex('discovery_allocation_config').insert([
    { slot_type: 'MERIT',     allocation_percent: 60, description: 'Merit-based discovery (locked: 60%)' },
    { slot_type: 'BOOST',     allocation_percent: 25, description: 'Boost-based discovery (locked: 25%)' },
    { slot_type: 'STRATEGIC', allocation_percent: 15, description: 'Strategic alignment discovery (locked: 15%)' },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('discovery_allocation_config');
  await knex.schema.dropTableIfExists('merit_signal_events');
  await knex.schema.dropTableIfExists('listing_merit_scores');
  await knex.schema.dropTableIfExists('provider_merit_profiles');
}
