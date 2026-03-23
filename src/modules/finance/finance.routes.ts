import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { FinanceService } from './finance.service';

export function buildFinanceRouter(financeService: FinanceService): Router {
  const router = Router();

  // GET /finance/provider/summary — provider finance summary
  router.get('/provider/summary', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id;
      if (!providerId) return res.status(403).json({ error: 'FORBIDDEN: Provider only' });
      const summary = await financeService.getProviderFinanceSummary(providerId);
      // Strip ops_note — internal field not for provider consumption
      const sanitizedTransactions = summary.transactions.map(({ ops_note: _n, ...rest }) => rest);
      res.json({ ...summary, transactions: sanitizedTransactions });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /finance/bookings/:bookingId/transactions — seeker or provider on that booking only
  router.get('/bookings/:bookingId/transactions', requireAuth, async (req: Request, res: Response) => {
    try {
      const transactions = await financeService.getBookingTransactions(
        req.params.bookingId,
        req.user!.id,
        req.user!.provider_id,
      );
      // Strip ops_note — internal field not for seeker/provider consumption
      const sanitized = transactions.map(({ ops_note: _n, ...rest }) => rest);
      res.json(sanitized);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND') ? 404
        : e.message.startsWith('FORBIDDEN') ? 403
        : 500;
      res.status(status).json({ error: e.message });
    }
  });

  return router;
}
