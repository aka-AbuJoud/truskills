import { Knex } from 'knex';

// Phase D — Courses
// Delivery channels (LOCKED): IN_PERSON | ONLINE_LIVE | SELF_PACED | HYBRID
// Online Live = external-link-only at Phase 1 (no integrated room model)
// Self-Paced = platform-hosted video required at launch
// Location privacy: city/district stored on listing; exact address in separate column,
//   revealed only post-CONFIRMED booking via bookings module.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('courses', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('provider_id').notNullable().references('id').inTable('providers').onDelete('RESTRICT');
    t.string('title', 500).notNullable();
    t.text('description').nullable();
    t.string('delivery_channel', 20).notNullable(); // IN_PERSON | ONLINE_LIVE | SELF_PACED | HYBRID
    t.bigint('price_halalas').notNullable();
    t.string('currency', 3).notNullable().defaultTo('SAR');

    // Location privacy: city/district public; exact address gated post-booking
    t.string('city', 100).nullable();
    t.string('district', 100).nullable();
    t.text('location_exact').nullable(); // revealed post-CONFIRMED booking only

    // Online Live: external meeting link (provider-managed, revealed post-CONFIRMED booking)
    t.text('meeting_link').nullable();

    t.integer('max_capacity').nullable(); // null = unlimited
    t.boolean('certificate_availability').notNullable().defaultTo(false);
    t.boolean('group_enabled').notNullable().defaultTo(false); // triggers community group on booking

    // status: DRAFT → PUBLISHED | ARCHIVED
    // Providers may draft before activation; publish requires ACTIVATED state
    t.string('status', 15).notNullable().defaultTo('DRAFT');

    t.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE courses ADD CONSTRAINT courses_delivery_channel_check
    CHECK (delivery_channel IN ('IN_PERSON','ONLINE_LIVE','SELF_PACED','HYBRID'))
  `);
  await knex.raw(`
    ALTER TABLE courses ADD CONSTRAINT courses_status_check
    CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED'))
  `);
  await knex.raw(`
    ALTER TABLE courses ADD CONSTRAINT courses_price_non_negative
    CHECK (price_halalas >= 0)
  `);

  await knex.raw(`CREATE INDEX courses_provider_id_idx ON courses(provider_id)`);
  await knex.raw(`CREATE INDEX courses_status_idx ON courses(status)`);
  await knex.raw(`CREATE INDEX courses_provider_status_idx ON courses(provider_id, status)`);

  // Course tags join table
  await knex.schema.createTable('course_tags', (t) => {
    t.uuid('course_id').notNullable().references('id').inTable('courses').onDelete('CASCADE');
    t.uuid('tag_id').notNullable().references('id').inTable('taxonomy_tags').onDelete('CASCADE');
    t.primary(['course_id', 'tag_id']);
  });

  // Scheduled sessions for IN_PERSON / ONLINE_LIVE / HYBRID courses
  await knex.schema.createTable('course_sessions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('course_id').notNullable().references('id').inTable('courses').onDelete('CASCADE');
    t.timestamp('session_date', { useTz: true }).notNullable();
    t.integer('duration_minutes').nullable();
    t.integer('capacity_override').nullable(); // overrides course max_capacity for this session
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX course_sessions_course_id_idx ON course_sessions(course_id)`);
  await knex.raw(`CREATE INDEX course_sessions_date_idx ON course_sessions(session_date)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('course_sessions');
  await knex.schema.dropTableIfExists('course_tags');
  await knex.schema.dropTableIfExists('courses');
}
