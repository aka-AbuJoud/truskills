import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── Blog Posts ──────────────────────────────────────────────────────────────
  await knex.schema.createTable('blog_posts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    // null = TruSkills editorial; non-null = provider-authored
    t.uuid('provider_id').nullable().references('id').inTable('providers').onDelete('SET NULL');
    t.string('title', 500).notNullable();
    t.text('body_markdown').notNullable();
    t.text('excerpt').nullable();
    t.text('cover_image_reference').nullable();
    // classification: EDUCATIONAL | COMMUNITY | EDITORIAL | PROMOTIONAL
    // EDITORIAL is TruSkills-only. Providers cannot self-classify as EDITORIAL.
    t.string('classification', 20).notNullable();
    // status: DRAFT → IN_REVIEW → APPROVED → PUBLISHED
    //                           → REJECTED → (back to DRAFT)
    t.string('status', 20).notNullable().defaultTo('DRAFT');
    // fee_applies: true only when provider_id IS NOT NULL AND classification = PROMOTIONAL
    // TruSkills editorial selections never carry a provider fee
    t.boolean('fee_applies').notNullable().defaultTo(false);
    t.text('review_notes').nullable();
    t.uuid('reviewed_by').nullable();
    t.timestamp('reviewed_at', { useTz: true }).nullable();
    t.timestamp('published_at', { useTz: true }).nullable();
    // set after G5 publish triggers community thread creation
    t.uuid('community_thread_id')
      .nullable()
      .references('id')
      .inTable('community_threads')
      .onDelete('SET NULL');
    t.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE blog_posts
    ADD CONSTRAINT blog_posts_classification_check
    CHECK (classification IN ('EDUCATIONAL','COMMUNITY','EDITORIAL','PROMOTIONAL'))
  `);
  await knex.raw(`
    ALTER TABLE blog_posts
    ADD CONSTRAINT blog_posts_status_check
    CHECK (status IN ('DRAFT','IN_REVIEW','APPROVED','PUBLISHED','REJECTED'))
  `);

  await knex.raw(`CREATE INDEX blog_posts_status_idx ON blog_posts(status)`);
  await knex.raw(
    `CREATE INDEX blog_posts_provider_id_idx ON blog_posts(provider_id) WHERE provider_id IS NOT NULL`,
  );
  await knex.raw(
    `CREATE INDEX blog_posts_published_at_idx ON blog_posts(published_at DESC) WHERE status = 'PUBLISHED'`,
  );

  // ── Blog Post Tags ──────────────────────────────────────────────────────────
  await knex.schema.createTable('blog_post_tags', (t) => {
    t.uuid('blog_post_id')
      .notNullable()
      .references('id')
      .inTable('blog_posts')
      .onDelete('CASCADE');
    t.uuid('tag_id')
      .notNullable()
      .references('id')
      .inTable('taxonomy_tags')
      .onDelete('CASCADE');
    t.primary(['blog_post_id', 'tag_id']);
  });

  // ── Legacy Entries ──────────────────────────────────────────────────────────
  // Qualification-unlocked, on-platform lineage only.
  // No external credential import — enforced by: no import endpoint exists.
  // Triggered by certificate issuance events from eligible course completions.
  await knex.schema.createTable('legacy_entries', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('provider_id')
      .notNullable()
      .references('id')
      .inTable('providers')
      .onDelete('RESTRICT');
    t.uuid('seeker_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.string('entry_type', 30).notNullable();  // CERTIFICATE_ISSUED
    t.string('source_type', 30).notNullable(); // COURSE_COMPLETION
    t.uuid('source_id').notNullable();          // booking_id of the completed enrollment
    t.string('qualification_name', 500).notNullable(); // course title snapshot at issuance time
    t.timestamp('issued_at', { useTz: true }).notNullable();
    t.uuid('verified_by').nullable();
    t.timestamp('verified_at', { useTz: true }).nullable();
    t.jsonb('metadata').notNullable().defaultTo('{}');
    t.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE legacy_entries
    ADD CONSTRAINT legacy_entries_entry_type_check
    CHECK (entry_type IN ('CERTIFICATE_ISSUED'))
  `);
  await knex.raw(`
    ALTER TABLE legacy_entries
    ADD CONSTRAINT legacy_entries_source_type_check
    CHECK (source_type IN ('COURSE_COMPLETION'))
  `);

  // One legacy entry per source event — idempotent issuance guaranteed at DB level
  await knex.raw(
    `CREATE UNIQUE INDEX legacy_entries_source_unique ON legacy_entries(source_type, source_id)`,
  );
  await knex.raw(`CREATE INDEX legacy_entries_provider_id_idx ON legacy_entries(provider_id)`);
  await knex.raw(`CREATE INDEX legacy_entries_seeker_id_idx ON legacy_entries(seeker_id)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('legacy_entries');
  await knex.schema.dropTableIfExists('blog_post_tags');
  await knex.schema.dropTableIfExists('blog_posts');
}
