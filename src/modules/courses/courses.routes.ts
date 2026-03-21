import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { CoursesService } from './courses.service';

export function buildCoursesRouter(coursesService: CoursesService): Router {
  const router = Router();

  // GET /courses — public listing
  router.get('/', async (req: Request, res: Response) => {
    try {
      const limit = Number(req.query.limit ?? 20);
      const offset = Number(req.query.offset ?? 0);
      const courses = await coursesService.listPublished({ limit, offset });
      res.json(courses);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /courses/:id — public detail
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const course = await coursesService.getCourse(req.params.id);
      if (!course || course.status !== 'PUBLISHED') return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(course);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /courses — provider creates course (draft)
  router.post('/', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id;
      if (!providerId) return res.status(403).json({ error: 'FORBIDDEN: Provider only' });
      const course = await coursesService.createCourse({ ...req.body, providerId });
      res.status(201).json(course);
    } catch (e: any) {
      res.status(e.message.startsWith('PROVIDER_NOT_ACTIVATED') ? 403 : 500).json({ error: e.message });
    }
  });

  // PATCH /courses/:id — provider updates course
  router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id;
      if (!providerId) return res.status(403).json({ error: 'FORBIDDEN: Provider only' });
      const course = await coursesService.updateCourse(req.params.id, providerId, req.body);
      res.json(course);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('FORBIDDEN') ? 403 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // POST /courses/:id/publish — provider publishes course
  router.post('/:id/publish', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id;
      if (!providerId) return res.status(403).json({ error: 'FORBIDDEN: Provider only' });
      const course = await coursesService.publishCourse(req.params.id, providerId);
      res.json(course);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('FORBIDDEN') ? 403 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // POST /courses/:id/archive — provider archives course
  router.post('/:id/archive', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id;
      if (!providerId) return res.status(403).json({ error: 'FORBIDDEN: Provider only' });
      const course = await coursesService.archiveCourse(req.params.id, providerId);
      res.json(course);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('FORBIDDEN') ? 403 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  return router;
}
