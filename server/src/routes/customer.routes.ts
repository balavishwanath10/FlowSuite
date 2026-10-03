import { Response, Router } from 'express';
import { z } from 'zod';
import {
  authenticate,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import {
  createCustomer,
  deleteCustomer,
  getCustomerById,
  listOrganizationCustomers,
  updateCustomer,
} from '../services/customer.service';

const router = Router();

const customerIdParamSchema = z.object({
  customerId: z.string().uuid(),
});

const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().optional().or(z.literal('')).nullable(),
  phone: z.string().trim().max(30).optional().or(z.literal('')).nullable(),
});

const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    email: z.string().trim().email().optional().or(z.literal('')).nullable(),
    phone: z.string().trim().max(30).optional().or(z.literal('')).nullable(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.email !== undefined ||
      data.phone !== undefined,
    {
      message: 'At least one field must be provided for update',
    },
  );

router.get(
  '/',
  authenticate,
  requireRole('OWNER', 'ADMIN', 'MANAGER'),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }

    try {
      const customers = await listOrganizationCustomers({
        organizationId: req.user.organizationId,
      });

      return res.status(200).json({
        code: 'CUSTOMERS_RETRIEVED',
        customers,
      });
    } catch {
      return res.status(500).json({
        code: 'CUSTOMERS_RETRIEVAL_FAILED',
        message: 'Unable to retrieve customers',
      });
    }
  },
);

router.get(
  '/:customerId',
  authenticate,
  requireRole('OWNER', 'ADMIN', 'MANAGER'),
  async (req: AuthenticatedRequest, res: Response) => {
    const paramValidation = customerIdParamSchema.safeParse(req.params);

    if (!paramValidation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid customer ID format',
        errors: paramValidation.error.flatten(),
      });
    }

    if (!req.user) {
      return res.status(401).json({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }

    try {
      const customer = await getCustomerById({
        organizationId: req.user.organizationId,
        customerId: paramValidation.data.customerId,
      });

      return res.status(200).json({
        code: 'CUSTOMER_RETRIEVED',
        customer,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to retrieve customer';

      if (message === 'Customer not found') {
        return res.status(404).json({
          code: 'CUSTOMER_NOT_FOUND',
          message,
        });
      }

      return res.status(500).json({
        code: 'CUSTOMER_RETRIEVAL_FAILED',
        message,
      });
    }
  },
);

router.post(
  '/',
  authenticate,
  requireRole('OWNER', 'ADMIN', 'MANAGER'),
  async (req: AuthenticatedRequest, res: Response) => {
    const validation = createCustomerSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid customer creation data',
        errors: validation.error.flatten(),
      });
    }

    if (!req.user) {
      return res.status(401).json({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }

    try {
      const customer = await createCustomer({
        organizationId: req.user.organizationId,
        actorId: req.user.userId,
        name: validation.data.name,
        email: validation.data.email,
        phone: validation.data.phone,
      });

      return res.status(201).json({
        code: 'CUSTOMER_CREATED',
        message: 'Customer created successfully',
        customer,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to create customer';

      return res.status(400).json({
        code: 'CUSTOMER_CREATION_FAILED',
        message,
      });
    }
  },
);

router.patch(
  '/:customerId',
  authenticate,
  requireRole('OWNER', 'ADMIN', 'MANAGER'),
  async (req: AuthenticatedRequest, res: Response) => {
    const paramValidation = customerIdParamSchema.safeParse(req.params);

    if (!paramValidation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid customer ID format',
        errors: paramValidation.error.flatten(),
      });
    }

    const bodyValidation = updateCustomerSchema.safeParse(req.body);

    if (!bodyValidation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid customer update data',
        errors: bodyValidation.error.flatten(),
      });
    }

    if (!req.user) {
      return res.status(401).json({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }

    try {
      const customer = await updateCustomer({
        organizationId: req.user.organizationId,
        actorId: req.user.userId,
        customerId: paramValidation.data.customerId,
        name: bodyValidation.data.name,
        email: bodyValidation.data.email,
        phone: bodyValidation.data.phone,
      });

      return res.status(200).json({
        code: 'CUSTOMER_UPDATED',
        message: 'Customer updated successfully',
        customer,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to update customer';

      if (message === 'Customer not found') {
        return res.status(404).json({
          code: 'CUSTOMER_NOT_FOUND',
          message,
        });
      }

      return res.status(400).json({
        code: 'CUSTOMER_UPDATE_FAILED',
        message,
      });
    }
  },
);

router.delete(
  '/:customerId',
  authenticate,
  requireRole('OWNER', 'ADMIN', 'MANAGER'),
  async (req: AuthenticatedRequest, res: Response) => {
    const paramValidation = customerIdParamSchema.safeParse(req.params);

    if (!paramValidation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid customer ID format',
        errors: paramValidation.error.flatten(),
      });
    }

    if (!req.user) {
      return res.status(401).json({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }

    try {
      await deleteCustomer({
        organizationId: req.user.organizationId,
        actorId: req.user.userId,
        customerId: paramValidation.data.customerId,
      });

      return res.status(200).json({
        code: 'CUSTOMER_DELETED',
        message: 'Customer deleted successfully',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to delete customer';

      if (message === 'Customer not found') {
        return res.status(404).json({
          code: 'CUSTOMER_NOT_FOUND',
          message,
        });
      }

      return res.status(400).json({
        code: 'CUSTOMER_DELETION_FAILED',
        message,
      });
    }
  },
);

export default router;
