import { Router } from 'express';
import {
  createCustomer,
  deleteCustomer,
  listCustomers,
  updateCustomer,
  updateCustomerStatus,
} from '../services/customer.service.js';
import {
  createCustomerSchema,
  customerStatusSchema,
  updateCustomerSchema,
} from '../validators/customer.schema.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const customersRoutes = Router();

customersRoutes.use(authMiddleware, requireRole('super_admin', 'admin'));

customersRoutes.get('/', asyncHandler(async (_req, res) => {
  res.json({ ok: true, data: await listCustomers() });
}));

customersRoutes.post('/', asyncHandler(async (req, res) => {
  const input = createCustomerSchema.parse(req.body);
  res.status(201).json({ ok: true, data: await createCustomer(input) });
}));

customersRoutes.patch('/:id', asyncHandler(async (req, res) => {
  const input = updateCustomerSchema.parse(req.body);
  res.json({ ok: true, data: await updateCustomer(String(req.params.id), input) });
}));

customersRoutes.patch('/:id/status', asyncHandler(async (req, res) => {
  const input = customerStatusSchema.parse(req.body);
  res.json({ ok: true, data: await updateCustomerStatus(String(req.params.id), input) });
}));

customersRoutes.delete('/:id', asyncHandler(async (req, res) => {
  res.json({
    ok: true,
    data: await deleteCustomer(String(req.params.id), {
      force: String(req.query.force || '') === 'true',
    }),
  });
}));
