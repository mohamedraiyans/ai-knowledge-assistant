import { AuthService } from './auth.service';

// The generated Prisma client sits outside jest's rootDir; only the DI token is needed.
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

interface Fixture {
  users?: { id: string; email: string; role: 'ADMIN' | 'USER' }[];
  invites?: { email: string; role: 'ADMIN' | 'USER' }[];
  registration?: 'open' | 'invite-only';
  adminEmails?: string;
}

function createService({
  users = [],
  invites = [],
  registration = 'invite-only',
  adminEmails = '',
}: Fixture = {}) {
  const userTable = [...users];
  const inviteTable = [...invites];
  const prisma = {
    user: {
      findUnique: jest.fn(({ where }: { where: { email: string } }) =>
        Promise.resolve(userTable.find((u) => u.email === where.email) ?? null),
      ),
      count: jest.fn(() => Promise.resolve(userTable.length)),
      create: jest.fn(({ data }: { data: { email: string; role: 'ADMIN' | 'USER' } }) => {
        const user = { id: `id-${userTable.length + 1}`, ...data };
        userTable.push(user);
        return Promise.resolve(user);
      }),
      update: jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({ ...userTable.find((u) => u.id === where.id), ...data }),
      ),
    },
    allowedEmail: {
      findUnique: jest.fn(({ where }: { where: { email: string } }) =>
        Promise.resolve(inviteTable.find((i) => i.email === where.email) ?? null),
      ),
      deleteMany: jest.fn(({ where }: { where: { email: string } }) => {
        const index = inviteTable.findIndex((i) => i.email === where.email);
        if (index >= 0) inviteTable.splice(index, 1);
        return Promise.resolve();
      }),
    },
  };
  const config = { get: jest.fn((key: string) => (key === 'ADMIN_EMAILS' ? adminEmails : undefined)) };
  const settings = { getString: jest.fn().mockResolvedValue(registration) };
  const service = new AuthService(prisma as never, {} as never, config as never, settings as never);
  return { service, prisma, inviteTable };
}

const profile = (email: string) => ({ email, name: 'Someone', avatarUrl: null });

describe('AuthService.upsertFromGoogleProfile — who gets in', () => {
  it('makes the very first person to sign in an admin, like a fresh WordPress install', async () => {
    const { service } = createService();
    const user = await service.upsertFromGoogleProfile(profile('first@example.com'));
    expect(user?.role).toBe('ADMIN');
  });

  it('does not make the second person an admin', async () => {
    const { service } = createService({
      users: [{ id: 'u1', email: 'first@example.com', role: 'ADMIN' }],
      registration: 'open',
    });
    const user = await service.upsertFromGoogleProfile(profile('second@example.com'));
    expect(user?.role).toBe('USER');
  });

  it('turns away an uninvited stranger when registration is invite-only', async () => {
    const { service, prisma } = createService({
      users: [{ id: 'u1', email: 'first@example.com', role: 'ADMIN' }],
    });
    await expect(service.upsertFromGoogleProfile(profile('stranger@example.com'))).resolves.toBeNull();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('admits an invited email with the role it was invited as', async () => {
    const { service } = createService({
      users: [{ id: 'u1', email: 'first@example.com', role: 'ADMIN' }],
      invites: [{ email: 'guest@example.com', role: 'ADMIN' }],
    });
    const user = await service.upsertFromGoogleProfile(profile('guest@example.com'));
    expect(user?.role).toBe('ADMIN');
  });

  it('matches invites case-insensitively', async () => {
    const { service } = createService({
      users: [{ id: 'u1', email: 'first@example.com', role: 'ADMIN' }],
      invites: [{ email: 'guest@example.com', role: 'USER' }],
    });
    const user = await service.upsertFromGoogleProfile(profile('Guest@Example.com'));
    expect(user).not.toBeNull();
  });

  it('uses up the invite once the person has signed in', async () => {
    const { service, inviteTable } = createService({
      users: [{ id: 'u1', email: 'first@example.com', role: 'ADMIN' }],
      invites: [{ email: 'guest@example.com', role: 'USER' }],
    });
    await service.upsertFromGoogleProfile(profile('guest@example.com'));
    expect(inviteTable).toHaveLength(0);
  });

  it('lets anyone in as a user when an admin opens registration', async () => {
    const { service } = createService({
      users: [{ id: 'u1', email: 'first@example.com', role: 'ADMIN' }],
      registration: 'open',
    });
    const user = await service.upsertFromGoogleProfile(profile('anyone@example.com'));
    expect(user?.role).toBe('USER');
  });

  it('still honours ADMIN_EMAILS for a new account on an invite-only site', async () => {
    const { service } = createService({
      users: [{ id: 'u1', email: 'first@example.com', role: 'ADMIN' }],
      adminEmails: 'boss@example.com',
    });
    const user = await service.upsertFromGoogleProfile(profile('boss@example.com'));
    expect(user?.role).toBe('ADMIN');
  });

  it('never locks out someone who already has an account', async () => {
    const { service } = createService({
      users: [
        { id: 'u1', email: 'first@example.com', role: 'ADMIN' },
        { id: 'u2', email: 'member@example.com', role: 'USER' },
      ],
    });
    const user = await service.upsertFromGoogleProfile(profile('member@example.com'));
    expect(user?.role).toBe('USER');
  });
});
