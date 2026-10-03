import { prisma } from '../config/db';

type CreateCustomerInput = {
  organizationId: string;
  actorId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
};

type ListCustomersInput = {
  organizationId: string;
};

type GetCustomerInput = {
  organizationId: string;
  customerId: string;
};

type UpdateCustomerInput = {
  organizationId: string;
  actorId: string;
  customerId: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
};

type DeleteCustomerInput = {
  organizationId: string;
  actorId: string;
  customerId: string;
};

export const createCustomer = async ({
  organizationId,
  actorId,
  name,
  email,
  phone,
}: CreateCustomerInput) => {
  const formattedEmail = email?.trim().toLowerCase() || null;
  const formattedPhone = phone?.trim() || null;

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        organizationId,
        name: name.trim(),
        email: formattedEmail,
        phone: formattedPhone,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'CUSTOMER_CREATED',
        entityType: 'Customer',
        entityId: customer.id,
        metadata: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
        },
      },
    });

    return customer;
  });
};

export const listOrganizationCustomers = async ({
  organizationId,
}: ListCustomersInput) => {
  return prisma.customer.findMany({
    where: {
      organizationId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
};

export const getCustomerById = async ({
  organizationId,
  customerId,
}: GetCustomerInput) => {
  const customer = await prisma.customer.findFirst({
    where: {
      id: customerId,
      organizationId,
    },
  });

  if (!customer) {
    throw new Error('Customer not found');
  }

  return customer;
};

export const updateCustomer = async ({
  organizationId,
  actorId,
  customerId,
  name,
  email,
  phone,
}: UpdateCustomerInput) => {
  const customer = await prisma.customer.findFirst({
    where: {
      id: customerId,
      organizationId,
    },
  });

  if (!customer) {
    throw new Error('Customer not found');
  }

  const formattedEmail =
    email !== undefined
      ? email === null || email.trim() === ''
        ? null
        : email.trim().toLowerCase()
      : undefined;

  const formattedPhone =
    phone !== undefined
      ? phone === null || phone.trim() === ''
        ? null
        : phone.trim()
      : undefined;

  return prisma.$transaction(async (tx) => {
    const updatedCustomer = await tx.customer.update({
      where: {
        id: customer.id,
      },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(formattedEmail !== undefined && { email: formattedEmail }),
        ...(formattedPhone !== undefined && { phone: formattedPhone }),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'CUSTOMER_UPDATED',
        entityType: 'Customer',
        entityId: customer.id,
        metadata: {
          updatedFields: {
            ...(name !== undefined && { name: updatedCustomer.name }),
            ...(formattedEmail !== undefined && { email: updatedCustomer.email }),
            ...(formattedPhone !== undefined && { phone: updatedCustomer.phone }),
          },
        },
      },
    });

    return updatedCustomer;
  });
};

export const deleteCustomer = async ({
  organizationId,
  actorId,
  customerId,
}: DeleteCustomerInput) => {
  const customer = await prisma.customer.findFirst({
    where: {
      id: customerId,
      organizationId,
    },
  });

  if (!customer) {
    throw new Error('Customer not found');
  }

  return prisma.$transaction(async (tx) => {
    const deletedCustomer = await tx.customer.delete({
      where: {
        id: customer.id,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'CUSTOMER_DELETED',
        entityType: 'Customer',
        entityId: customer.id,
        metadata: {
          name: customer.name,
          email: customer.email,
        },
      },
    });

    return deletedCustomer;
  });
};
