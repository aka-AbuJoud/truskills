import { Knex } from 'knex';

import { BlogClassification, BlogPostRecord, BlogStatus } from './blog.service';

export class BlogRepository {
  constructor(private readonly db: Knex) {}

  async insert(
    data: Omit<BlogPostRecord, 'id' | 'reviewed_by' | 'reviewed_at' | 'published_at' | 'community_thread_id' | 'created_at' | 'updated_at'> & {
      reviewed_by?: string | null;
      reviewed_at?: Date | null;
      published_at?: Date | null;
      community_thread_id?: string | null;
    },
    trx?: Knex.Transaction,
  ): Promise<BlogPostRecord> {
    const [row] = await (trx ?? this.db)('blog_posts').insert(data).returning('*');
    return row as BlogPostRecord;
  }

  async update(
    id: string,
    data: Partial<Omit<BlogPostRecord, 'id' | 'created_at'>>,
    trx?: Knex.Transaction,
  ): Promise<BlogPostRecord> {
    const [row] = await (trx ?? this.db)('blog_posts')
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return row as BlogPostRecord;
  }

  async findById(id: string): Promise<BlogPostRecord | null> {
    const row = await this.db('blog_posts').where({ id }).first();
    return row ? (row as BlogPostRecord) : null;
  }

  async findByProvider(providerId: string, statuses?: BlogStatus[]): Promise<BlogPostRecord[]> {
    let q = this.db('blog_posts')
      .where({ provider_id: providerId })
      .orderBy('created_at', 'desc');
    if (statuses?.length) q = q.whereIn('status', statuses);
    return q as unknown as BlogPostRecord[];
  }

  async findPublished(params: {
    limit: number;
    offset: number;
    classification?: BlogClassification;
  }): Promise<BlogPostRecord[]> {
    let q = this.db('blog_posts')
      .where({ status: 'PUBLISHED' })
      .orderBy('published_at', 'desc')
      .limit(params.limit)
      .offset(params.offset);
    if (params.classification) q = q.where({ classification: params.classification });
    return q as unknown as BlogPostRecord[];
  }

  async findReviewQueue(): Promise<BlogPostRecord[]> {
    return this.db('blog_posts')
      .where({ status: 'IN_REVIEW' })
      .orderBy('updated_at', 'asc') as unknown as BlogPostRecord[];
  }

  async insertTags(blogPostId: string, tagIds: string[], trx?: Knex.Transaction): Promise<void> {
    if (!tagIds.length) return;
    await (trx ?? this.db)('blog_post_tags')
      .insert(tagIds.map((tag_id) => ({ blog_post_id: blogPostId, tag_id })))
      .onConflict(['blog_post_id', 'tag_id'])
      .ignore();
  }

  async replaceTags(blogPostId: string, tagIds: string[], trx?: Knex.Transaction): Promise<void> {
    await (trx ?? this.db)('blog_post_tags').where({ blog_post_id: blogPostId }).delete();
    if (tagIds.length) await this.insertTags(blogPostId, tagIds, trx);
  }
}
