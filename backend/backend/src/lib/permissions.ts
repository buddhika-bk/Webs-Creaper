export type Role = 'owner' | 'admin' | 'analyst' | 'viewer';

const all: Role[] = ['owner', 'admin', 'analyst', 'viewer'];
const writers: Role[] = ['owner', 'admin', 'analyst'];
const admins: Role[] = ['owner', 'admin'];

export const PERMISSIONS = {
  'search:create': writers,
  'search:read': all,
  'business:read': all,
  'business:write': writers,
  'lists:read': all,
  'lists:write': writers,
  'export:create': writers,
  'export:read': all,
  'users:manage': admins,
  'audit:read': admins,
  'sources:manage': admins,
  'admin:overview': admins,
  'workspace:manage': ['owner'] as Role[],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const can = (role: Role, perm: Permission) => (PERMISSIONS[perm] as readonly Role[]).includes(role);
