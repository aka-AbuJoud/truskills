import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { ProductsService } from './products.service';

export function buildProductsRouter(productsService: ProductsService): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const products = await productsService.listPublished({
        limit: Number(req.query.limit ?? 20),
        offset: Number(req.query.offset ?? 0),
      });
      res.json(products);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const product = await productsService.getProduct(req.params.id);
      if (!product || product.status !== 'PUBLISHED') return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(product);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id;
      if (!providerId) return res.status(403).json({ error: 'FORBIDDEN: Provider only' });
      const product = await productsService.createProduct({ ...req.body, providerId });
      res.status(201).json(product);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id;
      if (!providerId) return res.status(403).json({ error: 'FORBIDDEN: Provider only' });
      const product = await productsService.updateProduct(req.params.id, providerId, req.body);
      res.json(product);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('FORBIDDEN') ? 403 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  router.post('/:id/publish', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id;
      if (!providerId) return res.status(403).json({ error: 'FORBIDDEN: Provider only' });
      const product = await productsService.publishProduct(req.params.id, providerId);
      res.json(product);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('FORBIDDEN') ? 403 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  router.post('/:id/archive', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id;
      if (!providerId) return res.status(403).json({ error: 'FORBIDDEN: Provider only' });
      const product = await productsService.archiveProduct(req.params.id, providerId);
      res.json(product);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('FORBIDDEN') ? 403 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  return router;
}
