import { Router, Request, Response } from 'express';

import { requireAuth } from '../../middleware/auth';
import { requireOpsToken } from '../../middleware/ops';
import { BlogClassification, BlogService } from './blog.service';

export function buildBlogRouter(blogService: BlogService): Router {
  const router = Router();

  // ── Provider routes ─────────────────────────────────────────────────────────

  // POST /blog/posts — create draft
  router.post('/posts', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id ?? null;
      const { title, bodyMarkdown, excerpt, classification, tagIds } = req.body;
      const post = await blogService.createPost({
        providerId,
        title,
        bodyMarkdown,
        excerpt,
        classification,
        tagIds,
      });
      res.status(201).json(post);
    } catch (e: any) {
      const status = e.message.startsWith('INVALID')
        ? 422
        : e.message.startsWith('FORBIDDEN')
          ? 403
          : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // PATCH /blog/posts/:id — update draft or rejected post
  router.patch('/posts/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id ?? null;
      const { title, bodyMarkdown, excerpt, tagIds } = req.body;
      const post = await blogService.updateDraft(req.params.id, providerId, {
        title,
        bodyMarkdown,
        excerpt,
        tagIds,
      });
      res.json(post);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND')
        ? 404
        : e.message.startsWith('FORBIDDEN')
          ? 403
          : e.message.startsWith('INVALID')
            ? 422
            : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // POST /blog/posts/:id/submit — submit for ops review
  router.post('/posts/:id/submit', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id ?? null;
      const post = await blogService.submitForReview(req.params.id, providerId);
      res.json(post);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND')
        ? 404
        : e.message.startsWith('FORBIDDEN')
          ? 403
          : e.message.startsWith('INVALID')
            ? 422
            : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // GET /blog/posts/mine — provider's own posts (all statuses)
  router.get('/posts/mine', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id;
      if (!providerId) return res.status(403).json({ error: 'FORBIDDEN: Provider account required' });
      const posts = await blogService.listProviderPosts(providerId);
      res.json(posts);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Public routes ───────────────────────────────────────────────────────────

  // GET /blog/public/posts — published posts (all seekers and guests)
  router.get('/public/posts', async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      const classification = req.query.classification as BlogClassification | undefined;
      const posts = await blogService.listPublished({ limit, offset, classification });
      res.json(posts);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /blog/public/posts/:id — single published post
  router.get('/public/posts/:id', async (req: Request, res: Response) => {
    try {
      const post = await blogService.findById(req.params.id);
      if (!post || post.status !== 'PUBLISHED') {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }
      res.json(post);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Ops routes ──────────────────────────────────────────────────────────────

  // GET /blog/ops/review-queue — posts awaiting ops review
  router.get('/ops/review-queue', requireOpsToken, async (_req: Request, res: Response) => {
    try {
      const posts = await blogService.listReviewQueue();
      res.json(posts);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /blog/ops/posts/:id/review — approve or reject a submitted post
  router.post('/ops/posts/:id/review', requireOpsToken, async (req: Request, res: Response) => {
    try {
      const { decision, reviewNotes } = req.body;
      const reviewedBy = (req.headers['x-ops-actor'] as string) ?? 'ops';
      const post = await blogService.reviewPost(req.params.id, {
        reviewedBy,
        decision,
        reviewNotes,
      });
      res.json(post);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND')
        ? 404
        : e.message.startsWith('INVALID')
          ? 422
          : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // POST /blog/ops/posts/:id/publish — publish APPROVED post; fires G5 thread creation
  router.post('/ops/posts/:id/publish', requireOpsToken, async (req: Request, res: Response) => {
    try {
      const publishedBy = (req.headers['x-ops-actor'] as string) ?? 'ops';
      const post = await blogService.publishPost(req.params.id, publishedBy);
      res.json(post);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND')
        ? 404
        : e.message.startsWith('INVALID')
          ? 422
          : 500;
      res.status(status).json({ error: e.message });
    }
  });

  return router;
}
