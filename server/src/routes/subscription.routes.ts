import { Router } from 'express';
import { query } from '../db/pool.js';
import { buildConfigLink } from '../utils/link-builder.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../middleware/error.middleware.js';

export const subscriptionRoutes = Router();
subscriptionRoutes.get('/:subId', asyncHandler(async (req, res) => {
  const r = await query<any>(`SELECT eu.*, i.protocol, i.port, i.stream_settings, s.host FROM end_users eu JOIN inbounds i ON i.id=eu.inbound_id JOIN servers s ON s.id=eu.server_id WHERE eu.sub_id=$1 AND eu.is_active=true`, [req.params.subId]);
  const row = r.rows[0];
  if (!row) throw new AppError(404, 'سابسکریپشن یافت نشد', 'SUB_NOT_FOUND');
  const link = buildConfigLink({ protocol: row.protocol, clientId: row.threexui_client_id, email: row.email, host: row.host.replace(/^https?:\/\//, ''), port: Number(row.port), streamSettings: row.stream_settings });
  res.type('text/plain').send(link + '\n');
}));
