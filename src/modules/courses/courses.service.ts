import { Knex } from 'knex';
import { CoursesRepository, CourseRecord } from './courses.repository';

export interface CreateCourseParams {
  providerId: string;
  title: string;
  description?: string;
  deliveryChannel: 'IN_PERSON' | 'ONLINE_LIVE' | 'SELF_PACED' | 'HYBRID';
  priceHalalas: number;
  city?: string;
  district?: string;
  locationExact?: string;
  meetingLink?: string;
  maxCapacity?: number;
  certificateAvailability?: boolean;
  groupEnabled?: boolean;
}

export class CoursesService {
  constructor(
    private readonly db: Knex,
    private readonly repo: CoursesRepository,
  ) {}

  async createCourse(params: CreateCourseParams): Promise<CourseRecord> {
    await this._assertProviderActivated(params.providerId);
    return this.repo.insert({
      provider_id: params.providerId,
      title: params.title,
      description: params.description ?? null,
      delivery_channel: params.deliveryChannel,
      price_halalas: params.priceHalalas,
      currency: 'SAR',
      city: params.city ?? null,
      district: params.district ?? null,
      location_exact: params.locationExact ?? null,
      meeting_link: params.meetingLink ?? null,
      max_capacity: params.maxCapacity ?? null,
      certificate_availability: params.certificateAvailability ?? false,
      group_enabled: params.groupEnabled ?? false,
      status: 'DRAFT',
    });
  }

  async publishCourse(courseId: string, providerId: string): Promise<CourseRecord> {
    const course = await this._getOwnedOrThrow(courseId, providerId);
    if (course.status !== 'DRAFT') throw new Error(`INVALID_STATE: Cannot publish from ${course.status}`);
    await this._assertProviderActivated(providerId);
    return this.repo.update(courseId, { status: 'PUBLISHED' });
  }

  async archiveCourse(courseId: string, providerId: string): Promise<CourseRecord> {
    await this._getOwnedOrThrow(courseId, providerId);
    return this.repo.update(courseId, { status: 'ARCHIVED' });
  }

  async updateCourse(courseId: string, providerId: string, data: Partial<CreateCourseParams>): Promise<CourseRecord> {
    const course = await this._getOwnedOrThrow(courseId, providerId);
    if (course.status === 'ARCHIVED') throw new Error('INVALID_STATE: Cannot edit archived course');
    return this.repo.update(courseId, {
      title: data.title,
      description: data.description,
      delivery_channel: data.deliveryChannel,
      price_halalas: data.priceHalalas,
      city: data.city,
      district: data.district,
      location_exact: data.locationExact,
      meeting_link: data.meetingLink,
      max_capacity: data.maxCapacity,
      certificate_availability: data.certificateAvailability,
      group_enabled: data.groupEnabled,
    });
  }

  async getProviderCourses(providerId: string): Promise<CourseRecord[]> {
    return this.repo.findByProvider(providerId);
  }

  async getCourse(courseId: string): Promise<CourseRecord | null> {
    return this.repo.findById(courseId);
  }

  async listPublished(opts: { limit?: number; offset?: number } = {}): Promise<CourseRecord[]> {
    return this.repo.findPublished(opts);
  }

  // ── Dashboard-facing aliases (names expected by dashboard.routes.ts) ─────────
  listByProvider = this.getProviderCourses.bind(this);
  getByIdForProvider = (id: string, providerId: string) =>
    this._getOwnedOrThrow(id, providerId).catch(() => null);
  create = this.createCourse.bind(this);
  update = this.updateCourse.bind(this);
  publish = this.publishCourse.bind(this);
  unpublish = (id: string, providerId: string) => this.archiveCourse(id, providerId);

  private async _getOwnedOrThrow(courseId: string, providerId: string): Promise<CourseRecord> {
    const course = await this.repo.findById(courseId);
    if (!course) throw new Error('NOT_FOUND: Course not found');
    if (course.provider_id !== providerId) throw new Error('FORBIDDEN');
    return course;
  }

  private async _assertProviderActivated(providerId: string): Promise<void> {
    const provider = await this.db('providers').where({ id: providerId }).first();
    if (!provider || provider.activation_status !== 'ACTIVATED') {
      throw new Error('PROVIDER_NOT_ACTIVATED: Provider must be ACTIVATED to publish courses');
    }
  }
}
