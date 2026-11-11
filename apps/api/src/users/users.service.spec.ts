import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

// The generated Prisma client sits outside jest's rootDir; only the DI token is needed.
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

type Row = { id: string; email: string; role: 'ADMIN' | 'USER' };

function createService(users: Row[] = [], existingInvites: string[] = []) {
  const prisma = {
    user: {
      findUnique: jest.fn(({ where }: { where: { id?: string; email?: string } }) =>
        Promise.resolve(
          users.find((u) => u.id === where.id || u.email === where.email) ?? null,
        ),
      ),
      count: jest.fn(({ where }: { where?: { role: string } } = {}) =>
        Promise.resolve(where ? users.filter((u) => u.role === where.role).length : users.length),
      ),
      update: jest.fn(({ where, data }: { where: { id: string }; data: { role: 'ADMIN' | 'USER' } }) => {
        const user = users.find((u) => u.id === where.id) as Row;
        user.role = data.role;
        return Promise.resolve({ ...user, name: null, avatarUrl: null, createdAt: new Date(0) });
      }),
    },
    allowedEmail: {
      upsert: jest.fn(({ create }: { create: { email: string; role: string } }) =>
        Promise.resolve({ ...create, createdAt: new Date(0) }),
      ),
      deleteMany: jest.fn(),
      findMany: jest.fn(() =>
        Promise.resolve(existingInvites.map((email) => ({ email, role: 'USER', createdAt: new Date(0) }))),
      ),
    },
  };
  return { prisma, service: new UsersService(prisma as never) };
}

describe('UsersService.setRole', () => {
  it('promotes a user to admin', async () => {
    const { service } = createService([
      { id: 'a', email: 'a@x.com', role: 'ADMIN' },
      { id: 'b', email: 'b@x.com', role: 'USER' },
    ]);
    await expect(service.setRole('b', 'ADMIN')).resolves.toMatchObject({ role: 'ADMIN' });
  });

  it('refuses to demote the last admin, so the app cannot lock itself out', async () => {
    const { service, prisma } = createService([{ id: 'a', email: 'a@x.com', role: 'ADMIN' }]);
    await expect(service.setRole('a', 'USER')).rejects.toThrow(/at least one admin/);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('allows demoting an admin when another remains', async () => {
    const { service } = createService([
      { id: 'a', email: 'a@x.com', role: 'ADMIN' },
      { id: 'b', email: 'b@x.com', role: 'ADMIN' },
    ]);
    await expect(service.setRole('a', 'USER')).resolves.toMatchObject({ role: 'USER' });
  });

  it.each(['SUPERUSER', '', null, undefined, 1])('rejects the role %p', async (role) => {
    const { service } = createService([{ id: 'a', email: 'a@x.com', role: 'ADMIN' }]);
    await expect(service.setRole('a', role)).rejects.toThrow(BadRequestException);
  });

  it('answers 404 for an unknown user', async () => {
    const { service } = createService();
    await expect(service.setRole('ghost', 'ADMIN')).rejects.toThrow(NotFoundException);
  });
});

describe('UsersService.invite', () => {
  it('stores the email lower-cased with the chosen role', async () => {
    const { service, prisma } = createService();
    await service.invite('  New@Example.COM ', 'ADMIN', 'admin-1');
    expect(prisma.allowedEmail.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { email: 'new@example.com', role: 'ADMIN', invitedBy: 'admin-1' },
      }),
    );
  });

  it('defaults to the user role', async () => {
    const { service, prisma } = createService();
    await service.invite('new@example.com', undefined, 'admin-1');
    expect(prisma.allowedEmail.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ role: 'USER' }) as unknown }),
    );
  });

  it.each(['', 'not-an-email', 'a@b', 5, null])('rejects the address %p', async (email) => {
    const { service } = createService();
    await expect(service.invite(email, 'USER', 'admin-1')).rejects.toThrow(BadRequestException);
  });

  it('rejects a role that is neither ADMIN nor USER', async () => {
    const { service } = createService();
    await expect(service.invite('a@b.co', 'OWNER', 'admin-1')).rejects.toThrow(BadRequestException);
  });

  it('refuses to invite someone who already has an account', async () => {
    const { service, prisma } = createService([{ id: 'a', email: 'a@x.com', role: 'USER' }]);
    await expect(service.invite('a@x.com', 'USER', 'admin-1')).rejects.toThrow(/already has an account/);
    expect(prisma.allowedEmail.upsert).not.toHaveBeenCalled();
  });
});
