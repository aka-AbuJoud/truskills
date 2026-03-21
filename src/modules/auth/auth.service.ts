import { Knex } from 'knex';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export interface RegisterParams {
  email: string;
  password: string;
  fullName: string;
  role: 'SEEKER' | 'PROVIDER';
  phone?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface UserRecord {
  id: string;
  email: string;
  role: 'SEEKER' | 'PROVIDER' | 'OPS';
  full_name: string;
  is_active: boolean;
  provider_id?: string;
}

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export class AuthService {
  constructor(private readonly db: Knex) {}

  async register(params: RegisterParams): Promise<{ user: UserRecord; tokens: AuthTokens }> {
    const { email, password, fullName, role, phone } = params;

    const existing = await this.db('users').where({ email: email.toLowerCase() }).first();
    if (existing) throw new Error('CONFLICT: Email already registered');

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const [user] = await this.db('users')
      .insert({
        email: email.toLowerCase(),
        password_hash,
        full_name: fullName,
        role,
        phone: phone ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    // Auto-create provider record for PROVIDER role
    let providerId: string | undefined;
    if (role === 'PROVIDER') {
      const [provider] = await this.db('providers')
        .insert({
          user_id: user.id,
          provider_type: 'INSTRUCTOR', // default; can change during activation
          display_name: fullName,
          activation_status: 'NOT_STARTED',
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('id');
      providerId = provider.id;
    }

    const tokens = await this._issueTokens(user.id, user.email, role, providerId);

    return {
      user: { ...user, provider_id: providerId } as UserRecord,
      tokens,
    };
  }

  async login(email: string, password: string): Promise<{ user: UserRecord; tokens: AuthTokens }> {
    const user = await this.db('users').where({ email: email.toLowerCase() }).first();
    if (!user) throw new Error('INVALID_CREDENTIALS');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new Error('INVALID_CREDENTIALS');

    if (!user.is_active) throw new Error('ACCOUNT_INACTIVE');

    // Resolve provider_id if PROVIDER
    let providerId: string | undefined;
    if (user.role === 'PROVIDER') {
      const provider = await this.db('providers').where({ user_id: user.id }).first();
      providerId = provider?.id;
    }

    const tokens = await this._issueTokens(user.id, user.email, user.role, providerId);
    return { user: { ...user, provider_id: providerId } as UserRecord, tokens };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = this._hashToken(refreshToken);
    const record = await this.db('refresh_tokens')
      .where({ token_hash: tokenHash })
      .whereNull('revoked_at')
      .where('expires_at', '>', new Date())
      .first();

    if (!record) throw new Error('INVALID_TOKEN');

    const user = await this.db('users').where({ id: record.user_id }).first();
    if (!user || !user.is_active) throw new Error('INVALID_TOKEN');

    let providerId: string | undefined;
    if (user.role === 'PROVIDER') {
      const provider = await this.db('providers').where({ user_id: user.id }).first();
      providerId = provider?.id;
    }

    // Revoke used token (rotation)
    await this.db('refresh_tokens')
      .where({ id: record.id })
      .update({ revoked_at: new Date() });

    return this._issueTokens(user.id, user.email, user.role, providerId);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this._hashToken(refreshToken);
    await this.db('refresh_tokens')
      .where({ token_hash: tokenHash })
      .update({ revoked_at: new Date() });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async _issueTokens(
    userId: string,
    email: string,
    role: string,
    providerId?: string,
  ): Promise<AuthTokens> {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET not configured');

    const payload: Record<string, unknown> = { sub: userId, email, role };
    if (providerId) payload.provider_id = providerId;

    const accessToken = jwt.sign(payload, secret, { expiresIn: ACCESS_TOKEN_TTL });

    const rawToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = this._hashToken(rawToken);

    await this.db('refresh_tokens').insert({
      user_id: userId,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      created_at: new Date(),
    });

    return { accessToken, refreshToken: rawToken };
  }

  private _hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
