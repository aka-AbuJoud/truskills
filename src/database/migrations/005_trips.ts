import { Knex } from 'knex';

// Phase D — Trips
// Location privacy: city/district on listing; exact location gated post-CONFIRMED booking.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('trips', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('provider_id').notNullable().references('id').inTable('providers').onDelete('RESTRICT');
    t.string('title', 500).notNullable();
    t.text('description').nullable();
    t.bigint('price_halalas').notNullable();
    t.string('currency', 3).notNullable().defaultTo('SAR');

    t.string('city', 100).nullable();
    t.string('district', 100).nullable();
    t.text('location_exact').nullable(); // revealed post-CONFIRMED booking only

    t.integer('max_capacity').nullable();
    t.boolean('group_enabled').notNullable().defaultTo(true); // trips default to group

    t.timestamp('departure_date', { useTz: true }).nullable();
    t.timestamp('return_date', { useTz: true }).nullable();
    t.integer('duration_days').nullable();

    // Waiver: Legal sign-off required before launch (see ops-runbook.md)
    t.boolean('waiver_required').notNullable().defaultTo(false);
    t.text('waiver_template').nullable();

    t.string('status', 15).notNullable().defaultTo('DRAFT');

    t.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE trips ADD CONSTRAINT trips_status_check
    CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED'))
  `);
  await knex.raw(`
    ALTER TABLE trips ADD CONSTRAINT trips_price_non_negative
    CHECK (price_halalas >= 0)
  `);

  await knex.raw(`CREATE INDEX trips_provider_id_idx ON trips(provider_id)`);
  await knex.raw(`CREATE INDEX trips_provider_status_idx ON trips(provider_id, status)`);
  await knex.raw(`CREATE INDEX trips_departure_date_idx ON trips(departure_date)`);

  await knex.schema.createTable('trip_tags', (t) => {
    t.uuid('trip_id').notNullable().references('id').inTable('trips').onDelete('CASCADE');
    t.uuid('tag_id').notNullable().references('id').inTable('taxonomy_tags').onDelete('CASCADE');
    t.primary(['trip_id', 'tag_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('trip_tags');
  await knex.schema.dropTableIfExists('trips');
}
