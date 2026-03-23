import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import knex from 'knex';
import knexConfig from '../knexfile';
import { wireRoutes } from './routes';
import { buildAdapters } from './adapters/adapter-registry';
import { runProductionSafetyValidatorsOrExit } from './startup/production-safety-validator';

const app = express();
const port = Number(process.env.PORT ?? 3000);
const nodeEnv = (process.env.NODE_ENV ?? 'development') as 'development' | 'staging' | 'production';

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Static file serving for LocalStorageAdapter (staging only)
if (nodeEnv === 'staging') {
  const path = require('path');
  const storageDir = process.env.LOCAL_STORAGE_DIR ?? path.resolve(process.cwd(), 'tmp', 'storage');
  app.use('/static/storage', express.static(storageDir));
}

// ── Database ──────────────────────────────────────────────────────────────────
const db = knex(knexConfig[nodeEnv] ?? knexConfig['development']);

// ── Health check ──────────────────────────────────────────────────────────────
let adapters: ReturnType<typeof buildAdapters> | null = null;

app.get('/health', async (_req, res) => {
  const [payment, storage, notification, video, db_ok] = await Promise.all([
    adapters?.payment.ping().catch(() => false) ?? false,
    adapters?.storage.ping().catch(() => false) ?? false,
    adapters?.notification.ping().catch(() => false) ?? false,
    adapters?.video.ping().catch(() => false) ?? false,
    db.raw('SELECT 1').then(() => true).catch(() => false),
  ]);
  const allOk = payment && storage && notification && video && db_ok;
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    env: nodeEnv,
    adapters: { payment, storage, notification, video },
    database: db_ok,
  });
});

// ── Application routes ────────────────────────────────────────────────────────
wireRoutes(app, db);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND' });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : 'Unknown error';
  // eslint-disable-next-line no-console
  console.error('[TruSkills Error]', message);
  res.status(500).json({ error: 'INTERNAL_ERROR' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(port, async () => {
  // eslint-disable-next-line no-console
  console.log(`TruSkills API — port ${port} [${nodeEnv}]`);
  try {
    adapters = buildAdapters();
    await runProductionSafetyValidatorsOrExit(adapters.validationTargets());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Startup validation failed:', err);
  }
});

export default app;
