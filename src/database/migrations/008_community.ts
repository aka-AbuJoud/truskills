import { Knex } from 'knex';

// Phase F — Community
// System-triggered shared infrastructure (LOCKED — not a self-initiating social layer).
// Triggered by:
//   - Bookings: group creation on confirmation
//   - Blog: thread creation on publish
// No self-initiated community features at launch.

export async function up(knex: Knex): Promise<void> {
  // ── Threads (Blog-triggered) ────────────────────────────────────────────────
  // trigger_type: BLOG_POST
  // trigger_id: blog_post.id (unique — one thread per published post)
  await knex.schema.createTable('community_threads', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('trigger_type', 30).notNullable(); // BLOG_POST
    t.uuid('trigger_id').notNullable();
    t.string('title', 500).nullable();
    t.uuid('created_by').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX community_threads_trigger_unique
    ON community_threads(trigger_type, trigger_id)
  `);

  await knex.schema.createTable('community_thread_replies', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('thread_id').notNullable().references('id').inTable('community_threads').onDelete('CASCADE');
    t.uuid('author_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.text('body').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX community_thread_replies_thread_id_idx ON community_thread_replies(thread_id, created_at)`);

  // ── Direct Messages ─────────────────────────────────────────────────────────
  // participant_a < participant_b (canonical ordering — enforced in service layer)
  await knex.schema.createTable('community_dms', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('participant_a').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.uuid('participant_b').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX community_dms_participants_unique
    ON community_dms(participant_a, participant_b)
  `);

  await knex.schema.createTable('community_dm_messages', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dm_id').notNullable().references('id').inTable('community_dms').onDelete('CASCADE');
    t.uuid('sender_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.text('body').notNullable();
    t.boolean('is_read').notNullable().defaultTo(false);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX community_dm_messages_dm_id_idx ON community_dm_messages(dm_id, created_at)`);

  // ── Groups (Booking-triggered) ──────────────────────────────────────────────
  // trigger_type: BOOKING_GROUP
  // trigger_id: booking.id (unique — one group per group-enabled booking)
  await knex.schema.createTable('community_groups', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('trigger_type', 30).notNullable(); // BOOKING_GROUP
    t.uuid('trigger_id').notNullable();
    t.string('name', 500).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX community_groups_trigger_unique
    ON community_groups(trigger_type, trigger_id)
  `);

  await knex.schema.createTable('community_group_members', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('group_id').notNullable().references('id').inTable('community_groups').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.timestamp('joined_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX community_group_members_unique ON community_group_members(group_id, user_id)
  `);

  await knex.schema.createTable('community_group_messages', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('group_id').notNullable().references('id').inTable('community_groups').onDelete('CASCADE');
    t.uuid('sender_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.text('body').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX community_group_messages_group_id_idx ON community_group_messages(group_id, created_at)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('community_group_messages');
  await knex.schema.dropTableIfExists('community_group_members');
  await knex.schema.dropTableIfExists('community_groups');
  await knex.schema.dropTableIfExists('community_dm_messages');
  await knex.schema.dropTableIfExists('community_dms');
  await knex.schema.dropTableIfExists('community_thread_replies');
  await knex.schema.dropTableIfExists('community_threads');
}
