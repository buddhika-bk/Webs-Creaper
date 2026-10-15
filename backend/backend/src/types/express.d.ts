import 'express';

export type Role = 'owner' | 'admin' | 'analyst' | 'viewer';

export interface AuthContext {
  userId: string;
  workspaceId: string;
  role: Role;
  email: string;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
