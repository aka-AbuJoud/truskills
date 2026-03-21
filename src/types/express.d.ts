// Express request type extensions — Phase A auth middleware sets these fields.

declare namespace Express {
  interface User {
    id: string;                    // user.id (all roles)
    role: 'SEEKER' | 'PROVIDER' | 'OPS';
    provider_id?: string;          // set when role = PROVIDER
    email: string;
  }

  interface Request {
    user?: User;
    providerId?: string;           // set by requireProvider middleware (dashboard routes)
  }
}
