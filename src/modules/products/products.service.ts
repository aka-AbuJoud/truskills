import { Knex } from 'knex';
import { ProductsRepository, ProductRecord } from './products.repository';

export class ProductsService {
  constructor(
    private readonly db: Knex,
    private readonly repo: ProductsRepository,
  ) {}

  async createProduct(params: {
    providerId: string;
    title: string;
    description?: string;
    priceHalalas: number;
    stockQuantity?: number;
    isDigital?: boolean;
  }): Promise<ProductRecord> {
    return this.repo.insert({
      provider_id: params.providerId,
      title: params.title,
      description: params.description ?? null,
      price_halalas: params.priceHalalas,
      currency: 'SAR',
      stock_quantity: params.stockQuantity ?? null,
      is_digital: params.isDigital ?? false,
      status: 'DRAFT',
    });
  }

  async publishProduct(productId: string, providerId: string): Promise<ProductRecord> {
    const product = await this._getOwnedOrThrow(productId, providerId);
    if (product.status !== 'DRAFT') throw new Error(`INVALID_STATE: Cannot publish from ${product.status}`);
    await this._assertProviderActivated(providerId);
    return this.repo.update(productId, { status: 'PUBLISHED' });
  }

  async archiveProduct(productId: string, providerId: string): Promise<ProductRecord> {
    await this._getOwnedOrThrow(productId, providerId);
    return this.repo.update(productId, { status: 'ARCHIVED' });
  }

  async updateProduct(productId: string, providerId: string, data: {
    title?: string;
    description?: string;
    priceHalalas?: number;
    stockQuantity?: number;
    isDigital?: boolean;
  }): Promise<ProductRecord> {
    await this._getOwnedOrThrow(productId, providerId);
    return this.repo.update(productId, {
      title: data.title,
      description: data.description,
      price_halalas: data.priceHalalas,
      stock_quantity: data.stockQuantity,
      is_digital: data.isDigital,
    });
  }

  async getProviderProducts(providerId: string): Promise<ProductRecord[]> {
    return this.repo.findByProvider(providerId);
  }

  async getProduct(productId: string): Promise<ProductRecord | null> {
    return this.repo.findById(productId);
  }

  async listPublished(opts: { limit?: number; offset?: number } = {}): Promise<ProductRecord[]> {
    return this.repo.findPublished(opts);
  }

  // ── Dashboard-facing aliases (names expected by dashboard.routes.ts) ─────────
  listByProvider = this.getProviderProducts.bind(this);
  getByIdForProvider = (id: string, providerId: string) =>
    this._getOwnedOrThrow(id, providerId).catch(() => null);
  create = this.createProduct.bind(this);
  update = this.updateProduct.bind(this);
  publish = this.publishProduct.bind(this);
  unpublish = (id: string, providerId: string) => this.archiveProduct(id, providerId);

  private async _getOwnedOrThrow(productId: string, providerId: string): Promise<ProductRecord> {
    const product = await this.repo.findById(productId);
    if (!product) throw new Error('NOT_FOUND: Product not found');
    if (product.provider_id !== providerId) throw new Error('FORBIDDEN');
    return product;
  }

  private async _assertProviderActivated(providerId: string): Promise<void> {
    const provider = await this.db('providers').where({ id: providerId }).first();
    if (!provider || provider.activation_status !== 'ACTIVATED') {
      throw new Error('PROVIDER_NOT_ACTIVATED: Provider must be ACTIVATED to publish products');
    }
  }
}
