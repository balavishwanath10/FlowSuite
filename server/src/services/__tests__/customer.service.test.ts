import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    customer: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../config/db', () => ({
  prisma: mockPrisma,
}));

import {
  createCustomer,
  deleteCustomer,
  getCustomerById,
  listOrganizationCustomers,
  updateCustomer,
} from '../customer.service';

describe('Customer Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCustomer', () => {
    it('creates a new customer and writes CUSTOMER_CREATED audit log transactionally', async () => {
      const mockCustomer = {
        id: 'cust-1',
        organizationId: 'org-1',
        name: 'Acme Corp',
        email: 'contact@acme.com',
        phone: '+1-555-0199',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.customer.create.mockResolvedValue(mockCustomer);
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));

      const result = await createCustomer({
        organizationId: 'org-1',
        actorId: 'user-1',
        name: '  Acme Corp  ',
        email: '  CONTACT@ACME.COM  ',
        phone: '  +1-555-0199  ',
      });

      expect(mockPrisma.customer.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          name: 'Acme Corp',
          email: 'contact@acme.com',
          phone: '+1-555-0199',
        },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          actorId: 'user-1',
          action: 'CUSTOMER_CREATED',
          entityType: 'Customer',
          entityId: 'cust-1',
          metadata: {
            name: 'Acme Corp',
            email: 'contact@acme.com',
            phone: '+1-555-0199',
          },
        },
      });
      expect(result).toBe(mockCustomer);
    });
  });

  describe('listOrganizationCustomers', () => {
    it('returns customers scoped strictly by organizationId', async () => {
      const mockCustomers = [
        {
          id: 'cust-1',
          organizationId: 'org-1',
          name: 'Acme Corp',
        },
      ];

      mockPrisma.customer.findMany.mockResolvedValue(mockCustomers);

      const result = await listOrganizationCustomers({
        organizationId: 'org-1',
      });

      expect(mockPrisma.customer.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toBe(mockCustomers);
    });

    it('explicit cross-tenant isolation: queries only the requested organization context', async () => {
      mockPrisma.customer.findMany.mockResolvedValue([]);

      await listOrganizationCustomers({
        organizationId: 'org-a',
      });

      expect(mockPrisma.customer.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-a' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getCustomerById', () => {
    it('returns customer details when found within authenticated organization', async () => {
      const mockCustomer = {
        id: 'cust-1',
        organizationId: 'org-1',
        name: 'Acme Corp',
      };

      mockPrisma.customer.findFirst.mockResolvedValue(mockCustomer);

      const result = await getCustomerById({
        organizationId: 'org-1',
        customerId: 'cust-1',
      });

      expect(mockPrisma.customer.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'cust-1',
          organizationId: 'org-1',
        },
      });
      expect(result).toBe(mockCustomer);
    });

    it('rejects with "Customer not found" when customer does not exist', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue(null);

      await expect(
        getCustomerById({
          organizationId: 'org-1',
          customerId: 'missing-cust',
        }),
      ).rejects.toThrow('Customer not found');
    });

    it('explicit cross-tenant isolation: rejects read attempt when Org A tries to access Org B customer', async () => {
      mockPrisma.customer.findFirst.mockImplementation(
        async ({ where }: { where: { id: string; organizationId: string } }) => {
          if (where.id === 'org-b-cust' && where.organizationId === 'org-a') {
            return null;
          }
          return null;
        },
      );

      await expect(
        getCustomerById({
          organizationId: 'org-a',
          customerId: 'org-b-cust',
        }),
      ).rejects.toThrow('Customer not found');

      expect(mockPrisma.customer.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'org-b-cust',
          organizationId: 'org-a',
        },
      });
    });
  });

  describe('updateCustomer', () => {
    it('updates customer fields transactionally and writes CUSTOMER_UPDATED audit log', async () => {
      const existingCustomer = {
        id: 'cust-1',
        organizationId: 'org-1',
        name: 'Old Name',
        email: 'old@acme.com',
        phone: null,
      };

      const updatedCustomer = {
        id: 'cust-1',
        organizationId: 'org-1',
        name: 'New Name',
        email: 'new@acme.com',
        phone: '+1-555-0100',
      };

      mockPrisma.customer.findFirst.mockResolvedValue(existingCustomer);
      mockPrisma.customer.update.mockResolvedValue(updatedCustomer);
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-2' });
      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));

      const result = await updateCustomer({
        organizationId: 'org-1',
        actorId: 'user-1',
        customerId: 'cust-1',
        name: 'New Name',
        email: 'new@acme.com',
        phone: '+1-555-0100',
      });

      expect(mockPrisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: {
          name: 'New Name',
          email: 'new@acme.com',
          phone: '+1-555-0100',
        },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          actorId: 'user-1',
          action: 'CUSTOMER_UPDATED',
          entityType: 'Customer',
          entityId: 'cust-1',
          metadata: {
            updatedFields: {
              name: 'New Name',
              email: 'new@acme.com',
              phone: '+1-555-0100',
            },
          },
        },
      });
      expect(result).toBe(updatedCustomer);
    });

    it('rejects update when customer is missing', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue(null);

      await expect(
        updateCustomer({
          organizationId: 'org-1',
          actorId: 'user-1',
          customerId: 'missing-cust',
          name: 'New Name',
        }),
      ).rejects.toThrow('Customer not found');
    });

    it('explicit cross-tenant isolation: rejects update attempt when Org A tries to modify Org B customer', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue(null);

      await expect(
        updateCustomer({
          organizationId: 'org-a',
          actorId: 'user-a',
          customerId: 'org-b-cust',
          name: 'Hacked Name',
        }),
      ).rejects.toThrow('Customer not found');
    });
  });

  describe('deleteCustomer', () => {
    it('deletes customer transactionally and creates CUSTOMER_DELETED audit log', async () => {
      const existingCustomer = {
        id: 'cust-1',
        organizationId: 'org-1',
        name: 'Acme Corp',
        email: 'contact@acme.com',
      };

      mockPrisma.customer.findFirst.mockResolvedValue(existingCustomer);
      mockPrisma.customer.delete.mockResolvedValue(existingCustomer);
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-3' });
      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));

      const result = await deleteCustomer({
        organizationId: 'org-1',
        actorId: 'user-1',
        customerId: 'cust-1',
      });

      expect(mockPrisma.customer.delete).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          actorId: 'user-1',
          action: 'CUSTOMER_DELETED',
          entityType: 'Customer',
          entityId: 'cust-1',
          metadata: {
            name: 'Acme Corp',
            email: 'contact@acme.com',
          },
        },
      });
      expect(result).toBe(existingCustomer);
    });

    it('rejects deletion when customer is missing', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue(null);

      await expect(
        deleteCustomer({
          organizationId: 'org-1',
          actorId: 'user-1',
          customerId: 'missing-cust',
        }),
      ).rejects.toThrow('Customer not found');
    });

    it('explicit cross-tenant isolation: rejects deletion attempt when Org A tries to delete Org B customer', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue(null);

      await expect(
        deleteCustomer({
          organizationId: 'org-a',
          actorId: 'user-a',
          customerId: 'org-b-cust',
        }),
      ).rejects.toThrow('Customer not found');
    });
  });
});
