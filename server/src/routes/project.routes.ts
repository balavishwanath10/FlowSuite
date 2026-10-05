import { Request, Response, Router } from 'express';
import { z } from 'zod';
import {
  authenticate,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { enforceApiUsageLimit } from '../middleware/usage.middleware';
import {
  archiveProject,
  createProject,
  getProjectById,
  listOrganizationProjects,
  updateProject,
} from '../services/project.service';

const router = Router();

const projectIdParamSchema = z.object({
  projectId: z.string().uuid(),
});

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
});

const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.description !== undefined ||
      data.status !== undefined,
    {
      message: 'At least one field must be provided for update',
    },
  );

router.get(
  '/',
  authenticate,
  enforceApiUsageLimit,
  requireRole('OWNER', 'ADMIN', 'MANAGER', 'MEMBER'),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }

    try {
      const projects = await listOrganizationProjects({
        organizationId: req.user.organizationId,
        userId: req.user.userId,
        userRole: req.userRole,
      });

      return res.status(200).json({
        code: 'PROJECTS_RETRIEVED',
        projects,
      });
    } catch {
      return res.status(500).json({
        code: 'PROJECTS_RETRIEVAL_FAILED',
        message: 'Unable to retrieve projects',
      });
    }
  },
);

router.get(
  '/:projectId',
  authenticate,
  enforceApiUsageLimit,
  requireRole('OWNER', 'ADMIN', 'MANAGER', 'MEMBER'),
  async (req: AuthenticatedRequest, res: Response) => {
    const paramValidation = projectIdParamSchema.safeParse(req.params);

    if (!paramValidation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid project ID format',
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
      const project = await getProjectById({
        organizationId: req.user.organizationId,
        projectId: paramValidation.data.projectId,
        userId: req.user.userId,
        userRole: req.userRole,
      });

      return res.status(200).json({
        code: 'PROJECT_RETRIEVED',
        project,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to retrieve project';

      if (message === 'Project not found') {
        return res.status(404).json({
          code: 'PROJECT_NOT_FOUND',
          message,
        });
      }

      return res.status(500).json({
        code: 'PROJECT_RETRIEVAL_FAILED',
        message,
      });
    }
  },
);

router.post(
  '/',
  authenticate,
  enforceApiUsageLimit,
  requireRole('OWNER', 'ADMIN', 'MANAGER'),
  async (req: AuthenticatedRequest, res: Response) => {
    const validation = createProjectSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid project creation data',
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
      const project = await createProject({
        organizationId: req.user.organizationId,
        actorId: req.user.userId,
        name: validation.data.name,
        description: validation.data.description,
      });

      return res.status(201).json({
        code: 'PROJECT_CREATED',
        message: 'Project created successfully',
        project,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to create project';

      return res.status(400).json({
        code: 'PROJECT_CREATION_FAILED',
        message,
      });
    }
  },
);

router.patch(
  '/:projectId',
  authenticate,
  enforceApiUsageLimit,
  requireRole('OWNER', 'ADMIN', 'MANAGER'),
  async (req: AuthenticatedRequest, res: Response) => {
    const paramValidation = projectIdParamSchema.safeParse(req.params);

    if (!paramValidation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid project ID format',
        errors: paramValidation.error.flatten(),
      });
    }

    const bodyValidation = updateProjectSchema.safeParse(req.body);

    if (!bodyValidation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid project update data',
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
      const project = await updateProject({
        organizationId: req.user.organizationId,
        actorId: req.user.userId,
        projectId: paramValidation.data.projectId,
        name: bodyValidation.data.name,
        description: bodyValidation.data.description,
        status: bodyValidation.data.status,
      });

      return res.status(200).json({
        code: 'PROJECT_UPDATED',
        message: 'Project updated successfully',
        project,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to update project';

      if (message === 'Project not found') {
        return res.status(404).json({
          code: 'PROJECT_NOT_FOUND',
          message,
        });
      }

      return res.status(400).json({
        code: 'PROJECT_UPDATE_FAILED',
        message,
      });
    }
  },
);

router.post(
  '/:projectId/archive',
  authenticate,
  enforceApiUsageLimit,
  requireRole('OWNER', 'ADMIN', 'MANAGER'),
  async (req: AuthenticatedRequest, res: Response) => {
    const paramValidation = projectIdParamSchema.safeParse(req.params);

    if (!paramValidation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid project ID format',
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
      const project = await archiveProject({
        organizationId: req.user.organizationId,
        actorId: req.user.userId,
        projectId: paramValidation.data.projectId,
      });

      return res.status(200).json({
        code: 'PROJECT_ARCHIVED',
        message: 'Project archived successfully',
        project,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to archive project';

      if (message === 'Project not found') {
        return res.status(404).json({
          code: 'PROJECT_NOT_FOUND',
          message,
        });
      }

      return res.status(400).json({
        code: 'PROJECT_ARCHIVE_FAILED',
        message,
      });
    }
  },
);

export default router;
