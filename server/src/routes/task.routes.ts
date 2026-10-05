import { Request, Response, Router } from 'express';
import { z } from 'zod';
import {
  authenticate,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { enforceApiUsageLimit } from '../middleware/usage.middleware';
import {
  assignTask,
  createTask,
  getTaskById,
  listOrganizationTasks,
  updateTask,
  updateTaskStatus,
} from '../services/task.service';

const router = Router();

const taskIdParamSchema = z.object({
  taskId: z.string().uuid(),
});

const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED']).optional(),
});

const listTasksQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED']).optional(),
});

const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED']).optional(),
    assigneeId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (data) =>
      data.title !== undefined ||
      data.description !== undefined ||
      data.status !== undefined ||
      data.assigneeId !== undefined,
    {
      message: 'At least one field must be provided for update',
    },
  );

const updateTaskStatusSchema = z.object({
  status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED']),
});

const assignTaskSchema = z.object({
  assigneeId: z.string().uuid().nullable(),
});

router.get(
  '/',
  authenticate,
  enforceApiUsageLimit,
  requireRole('OWNER', 'ADMIN', 'MANAGER', 'MEMBER'),
  async (req: AuthenticatedRequest, res: Response) => {
    const queryValidation = listTasksQuerySchema.safeParse(req.query);

    if (!queryValidation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid task query parameters',
        errors: queryValidation.error.flatten(),
      });
    }

    if (!req.user || !req.userRole) {
      return res.status(401).json({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }

    try {
      const tasks = await listOrganizationTasks({
        organizationId: req.user.organizationId,
        userId: req.user.userId,
        userRole: req.userRole,
        projectId: queryValidation.data.projectId,
        assigneeId: queryValidation.data.assigneeId,
        status: queryValidation.data.status,
      });

      return res.status(200).json({
        code: 'TASKS_RETRIEVED',
        tasks,
      });
    } catch {
      return res.status(500).json({
        code: 'TASKS_RETRIEVAL_FAILED',
        message: 'Unable to retrieve tasks',
      });
    }
  },
);

router.get(
  '/:taskId',
  authenticate,
  enforceApiUsageLimit,
  requireRole('OWNER', 'ADMIN', 'MANAGER', 'MEMBER'),
  async (req: AuthenticatedRequest, res: Response) => {
    const paramValidation = taskIdParamSchema.safeParse(req.params);

    if (!paramValidation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid task ID format',
        errors: paramValidation.error.flatten(),
      });
    }

    if (!req.user || !req.userRole) {
      return res.status(401).json({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }

    try {
      const task = await getTaskById({
        organizationId: req.user.organizationId,
        userId: req.user.userId,
        userRole: req.userRole,
        taskId: paramValidation.data.taskId,
      });

      return res.status(200).json({
        code: 'TASK_RETRIEVED',
        task,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to retrieve task';

      if (message === 'Task not found') {
        return res.status(404).json({
          code: 'TASK_NOT_FOUND',
          message,
        });
      }

      return res.status(500).json({
        code: 'TASK_RETRIEVAL_FAILED',
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
    const validation = createTaskSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid task creation data',
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
      const task = await createTask({
        organizationId: req.user.organizationId,
        actorId: req.user.userId,
        projectId: validation.data.projectId,
        title: validation.data.title,
        description: validation.data.description,
        assigneeId: validation.data.assigneeId,
        status: validation.data.status,
      });

      return res.status(201).json({
        code: 'TASK_CREATED',
        message: 'Task created successfully',
        task,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to create task';

      if (message === 'Project not found') {
        return res.status(404).json({
          code: 'PROJECT_NOT_FOUND',
          message,
        });
      }

      return res.status(400).json({
        code: 'TASK_CREATION_FAILED',
        message,
      });
    }
  },
);

router.patch(
  '/:taskId',
  authenticate,
  enforceApiUsageLimit,
  requireRole('OWNER', 'ADMIN'),
  async (req: AuthenticatedRequest, res: Response) => {
    const paramValidation = taskIdParamSchema.safeParse(req.params);

    if (!paramValidation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid task ID format',
        errors: paramValidation.error.flatten(),
      });
    }

    const bodyValidation = updateTaskSchema.safeParse(req.body);

    if (!bodyValidation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid task update data',
        errors: bodyValidation.error.flatten(),
      });
    }

    if (!req.user || !req.userRole) {
      return res.status(401).json({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }

    try {
      const task = await updateTask({
        organizationId: req.user.organizationId,
        actorId: req.user.userId,
        userRole: req.userRole,
        taskId: paramValidation.data.taskId,
        title: bodyValidation.data.title,
        description: bodyValidation.data.description,
        status: bodyValidation.data.status,
        assigneeId: bodyValidation.data.assigneeId,
      });

      return res.status(200).json({
        code: 'TASK_UPDATED',
        message: 'Task updated successfully',
        task,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to update task';

      if (message === 'Task not found') {
        return res.status(404).json({
          code: 'TASK_NOT_FOUND',
          message,
        });
      }

      return res.status(400).json({
        code: 'TASK_UPDATE_FAILED',
        message,
      });
    }
  },
);

router.patch(
  '/:taskId/status',
  authenticate,
  enforceApiUsageLimit,
  requireRole('OWNER', 'ADMIN', 'MANAGER', 'MEMBER'),
  async (req: AuthenticatedRequest, res: Response) => {
    const paramValidation = taskIdParamSchema.safeParse(req.params);

    if (!paramValidation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid task ID format',
        errors: paramValidation.error.flatten(),
      });
    }

    const bodyValidation = updateTaskStatusSchema.safeParse(req.body);

    if (!bodyValidation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid task status update data',
        errors: bodyValidation.error.flatten(),
      });
    }

    if (!req.user || !req.userRole) {
      return res.status(401).json({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }

    try {
      const task = await updateTaskStatus({
        organizationId: req.user.organizationId,
        actorId: req.user.userId,
        userId: req.user.userId,
        userRole: req.userRole,
        taskId: paramValidation.data.taskId,
        status: bodyValidation.data.status,
      });

      return res.status(200).json({
        code: 'TASK_STATUS_UPDATED',
        message: 'Task status updated successfully',
        task,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to update task status';

      if (message === 'Task not found') {
        return res.status(404).json({
          code: 'TASK_NOT_FOUND',
          message,
        });
      }

      return res.status(400).json({
        code: 'TASK_STATUS_UPDATE_FAILED',
        message,
      });
    }
  },
);

router.patch(
  '/:taskId/assign',
  authenticate,
  enforceApiUsageLimit,
  requireRole('OWNER', 'ADMIN', 'MANAGER'),
  async (req: AuthenticatedRequest, res: Response) => {
    const paramValidation = taskIdParamSchema.safeParse(req.params);

    if (!paramValidation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid task ID format',
        errors: paramValidation.error.flatten(),
      });
    }

    const bodyValidation = assignTaskSchema.safeParse(req.body);

    if (!bodyValidation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid task assignment data',
        errors: bodyValidation.error.flatten(),
      });
    }

    if (!req.user || !req.userRole) {
      return res.status(401).json({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }

    try {
      const task = await assignTask({
        organizationId: req.user.organizationId,
        actorId: req.user.userId,
        userRole: req.userRole,
        taskId: paramValidation.data.taskId,
        assigneeId: bodyValidation.data.assigneeId,
      });

      return res.status(200).json({
        code: 'TASK_ASSIGNED',
        message: 'Task assigned successfully',
        task,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to assign task';

      if (message === 'Task not found') {
        return res.status(404).json({
          code: 'TASK_NOT_FOUND',
          message,
        });
      }

      return res.status(400).json({
        code: 'TASK_ASSIGNMENT_FAILED',
        message,
      });
    }
  },
);

export default router;
