import { Knex } from 'knex';

import { CommunityService } from '../community/community.service';
import { MeritEngineService } from '../merit/merit.service';
import { BlogRepository } from './blog.repository';

export type BlogClassification = 'EDUCATIONAL' | 'COMMUNITY' | 'EDITORIAL' | 'PROMOTIONAL';
export type BlogStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'REJECTED';

export interface BlogPostRecord {
  id: string;
  provider_id: string | null; // null = TruSkills editorial
  title: string;
  body_markdown: string;
  excerpt: string | null;
  cover_image_reference: string | null;
  classification: BlogClassification;
  status: BlogStatus;
  fee_applies: boolean;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  published_at: Date | null;
  community_thread_id: string | null; // set after G5 publish
  created_at: Date;
  updated_at: Date;
}

export interface CreateBlogPostParams {
  providerId: string | null; // null = TruSkills-authored editorial
  title: string;
  bodyMarkdown: string;
  excerpt?: string;
  classification: BlogClassification;
  tagIds?: string[];
}

export interface UpdateBlogPostParams {
  title?: string;
  bodyMarkdown?: string;
  excerpt?: string;
  tagIds?: string[];
}

export interface OpsReviewParams {
  reviewedBy: string;
  decision: 'APPROVED' | 'REJECTED';
  reviewNotes?: string;
}

export class BlogService {
  constructor(
    private readonly db: Knex,
    private readonly repo: BlogRepository,
    private readonly communityService: CommunityService,
    private readonly meritService: MeritEngineService, // Phase K: Signal 6 wiring
  ) {}

  async createPost(params: CreateBlogPostParams): Promise<BlogPostRecord> {
    const { providerId, title, bodyMarkdown, excerpt, classification, tagIds = [] } = params;

    // EDITORIAL is TruSkills-only — providers may not self-classify as EDITORIAL
    if (classification === 'EDITORIAL' && providerId !== null) {
      throw new Error('INVALID_CLASSIFICATION: Providers cannot self-classify posts as EDITORIAL');
    }

    // Fee rule (locked):
    //   provider-requested + PROMOTIONAL → fee_applies = true
    //   TruSkills editorial (no provider) → fee_applies = false regardless of classification
    const feeApplies = providerId !== null && classification === 'PROMOTIONAL';

    return this.db.transaction(async (trx) => {
      const post = await this.repo.insert(
        {
          provider_id: providerId,
          title,
          body_markdown: bodyMarkdown,
          excerpt: excerpt ?? null,
          cover_image_reference: null,
          classification,
          status: 'DRAFT',
          fee_applies: feeApplies,
          review_notes: null,
        },
        trx,
      );

      await this.repo.insertTags(post.id, tagIds, trx);
      return post;
    });
  }

  async updateDraft(
    postId: string,
    requestingProviderId: string | null,
    params: UpdateBlogPostParams,
  ): Promise<BlogPostRecord> {
    const post = await this.findByIdOrThrow(postId);
    this.assertOwnership(post, requestingProviderId);

    if (!['DRAFT', 'REJECTED'].includes(post.status)) {
      throw new Error(`INVALID_STATE: Can only edit posts in DRAFT or REJECTED state`);
    }

    return this.db.transaction(async (trx) => {
      const updates: Partial<BlogPostRecord> = {};
      if (params.title !== undefined) updates.title = params.title;
      if (params.bodyMarkdown !== undefined) updates.body_markdown = params.bodyMarkdown;
      if (params.excerpt !== undefined) updates.excerpt = params.excerpt;

      const updated = await this.repo.update(postId, updates, trx);

      if (params.tagIds !== undefined) {
        await this.repo.replaceTags(postId, params.tagIds, trx);
      }

      return updated;
    });
  }

  // Provider submits their own post for ops review
  async submitForReview(
    postId: string,
    requestingProviderId: string | null,
  ): Promise<BlogPostRecord> {
    const post = await this.findByIdOrThrow(postId);
    this.assertOwnership(post, requestingProviderId);

    if (!['DRAFT', 'REJECTED'].includes(post.status)) {
      throw new Error(`INVALID_TRANSITION: Cannot submit from ${post.status}`);
    }

    return this.repo.update(postId, { status: 'IN_REVIEW', review_notes: null });
  }

  // Ops-only: approve or reject a submitted post
  async reviewPost(postId: string, params: OpsReviewParams): Promise<BlogPostRecord> {
    const post = await this.findByIdOrThrow(postId);

    if (post.status !== 'IN_REVIEW') {
      throw new Error(`INVALID_TRANSITION: Cannot review from ${post.status}`);
    }

    const newStatus: BlogStatus = params.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';

    return this.repo.update(postId, {
      status: newStatus,
      review_notes: params.reviewNotes ?? null,
      reviewed_by: params.reviewedBy,
      reviewed_at: new Date(),
    });
  }

  // Ops-only: publish an APPROVED post
  // [G5] Blog thread bridge — fires communityService.createThread() on publish
  async publishPost(postId: string, publishedBy: string): Promise<BlogPostRecord> {
    const post = await this.findByIdOrThrow(postId);

    if (post.status !== 'APPROVED') {
      throw new Error(
        `INVALID_TRANSITION: Cannot publish from ${post.status}. Post must be APPROVED first.`,
      );
    }

    // Step 1: commit publish state — post is PUBLISHED from this point forward
    await this.repo.update(postId, { status: 'PUBLISHED', published_at: new Date() });

    // Step 2: [G5] Blog thread bridge — F3 contract established in Phase F.
    // createThread() is idempotent: safe on retry if this step was interrupted.
    // Cross-service operation: intentionally NOT inside a DB transaction to avoid
    // coupling two service connection pools. If this fails, post is already PUBLISHED
    // (correct state); ops retries the publish endpoint — idempotency ensures no duplicate thread.
    const thread = await this.communityService.createThread({
      triggerType: 'BLOG_POST',
      triggerId: postId,
      createdBy: publishedBy,
      title: post.title,
    });

    // Step 3: link thread reference — separate update, eventual consistency
    const finalPost = await this.repo.update(postId, { community_thread_id: thread.id });

    // Step 4: [Phase K — Signal 6] Fire merit refresh for provider blog signal.
    // Provider-authored only (editorial posts have no provider_id).
    // Non-blocking: merit refresh failure does not roll back publish.
    // Idempotent: recordSignalEventAndRefresh appends event log + recomputes composite.
    if (post.provider_id) {
      this.meritService.recordSignalEventAndRefresh({
        providerId: post.provider_id,
        signalNumber: 6,
        eventType: 'BLOG_POST_PUBLISHED',
        valueDelta: 1,
        metadata: { post_id: postId },
      }).catch(() => {
        // Merit refresh is best-effort at publish time. Ops can trigger manual refresh.
        // Post is already PUBLISHED — this failure must not affect publish state.
      });
    }

    return finalPost;
  }

  async findById(postId: string): Promise<BlogPostRecord | null> {
    return this.repo.findById(postId);
  }

  async listPublished(params: {
    limit?: number;
    offset?: number;
    classification?: BlogClassification;
  }): Promise<BlogPostRecord[]> {
    return this.repo.findPublished({
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
      classification: params.classification,
    });
  }

  async listProviderPosts(providerId: string): Promise<BlogPostRecord[]> {
    return this.repo.findByProvider(providerId);
  }

  async listReviewQueue(): Promise<BlogPostRecord[]> {
    return this.repo.findReviewQueue();
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private assertOwnership(post: BlogPostRecord, requestingProviderId: string | null): void {
    if (post.provider_id !== requestingProviderId) {
      throw new Error('FORBIDDEN: Not the post owner');
    }
  }

  private async findByIdOrThrow(postId: string): Promise<BlogPostRecord> {
    const post = await this.repo.findById(postId);
    if (!post) throw new Error('NOT_FOUND: Blog post not found');
    return post;
  }
}
