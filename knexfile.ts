import type { Knex } from 'knex';

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/truskills_dev',
    migrations: {
      directory: './src/database/migrations',
      extension: 'ts',
    },
    pool: { min: 1, max: 5 },
  },

  staging: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: './dist/src/database/migrations',
      extension: 'js',
    },
    pool: { min: 2, max: 10 },
  },

  production: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: './dist/src/database/migrations',
      extension: 'js',
    },
    pool: { min: 2, max: 20 },
    acquireConnectionTimeout: 10000,
  },
};

export default config;
