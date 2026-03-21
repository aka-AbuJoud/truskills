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
      res.json(summary);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /finance/bookings/:bookingId/transactions — seeker or provider views booking transactions
  router.get('/bookings/:bookingId/transactions', requireAuth, async (req: Request, res: Response) => {
    try {
      const transactions = await financeService.getBookingTransactions(req.params.bookingId);
      res.json(transactions);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
