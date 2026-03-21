import { Knex } from 'knex';

// Phase A — Identity + Auth
// Roles: SEEKER (buyer), PROVIDER (instructor/center), OPS (platform staff)

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('email', 320).notNullable().unique();
    t.string('password_hash', 255).notNullable();
    t.string('role', 10).notNullable(); // SEEKER | PROVIDER | OPS
    t.string('full_name', 255).notNullable();
    t.string('phone', 30).nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('email_verified_at', { useTz: true }).nullable();
    t.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('SEEKER','PROVIDER','OPS'))
  `);
  await knex.raw(`CREATE INDEX users_email_idx ON users(email)`);
  await knex.raw(`CREATE INDEX users_role_idx ON users(role)`);

  await knex.schema.createTable('refresh_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('token_hash', 255).notNullable().unique();
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.timestamp('revoked_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens(user_id)`);
  await knex.raw(`CREATE INDEX refresh_tokens_token_hash_idx ON refresh_tokens(token_hash)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('refresh_tokens');
  await knex.schema.dropTableIfExists('users');
}
