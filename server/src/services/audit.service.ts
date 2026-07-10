import { query } from '../db/pool.js';

export async function audit(
  userId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  newValue?: unknown,
) {
  if (!userId) return;

  await query(
    'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value) VALUES ($1,$2,$3,$4,$5)',
    [userId, action, entityType, entityId, newValue ? JSON.stringify(newValue) : null],
  );
}

export async function listAuditLogs(filters: {
  search?: string;
  action?: string;
  entityType?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: string | number;
}) {
  const where: string[] = [];
  const params: any[] = [];

  function addParam(value: any) {
    params.push(value);
    return `$${params.length}`;
  }

  if (filters.userId) {
    where.push(`al.user_id = ${addParam(filters.userId)}`);
  }

  if (filters.action) {
    where.push(`al.action ILIKE ${addParam(`%${filters.action}%`)}`);
  }

  if (filters.entityType) {
    where.push(`al.entity_type ILIKE ${addParam(`%${filters.entityType}%`)}`);
  }

  if (filters.dateFrom) {
    where.push(`al.created_at >= ${addParam(filters.dateFrom)}::date`);
  }

  if (filters.dateTo) {
    where.push(`al.created_at < (${addParam(filters.dateTo)}::date + INTERVAL '1 day')`);
  }

  if (filters.search) {
    const q = addParam(`%${filters.search}%`);
    where.push(`(
      al.action ILIKE ${q}
      OR al.entity_type ILIKE ${q}
      OR al.entity_id ILIKE ${q}
      OR COALESCE(u.username,'') ILIKE ${q}
      OR COALESCE(u.email,'') ILIKE ${q}
      OR COALESCE(al.ip_address::text,'') ILIKE ${q}
    )`);
  }

  const safeLimit = Math.max(1, Math.min(500, Number(filters.limit || 300)));
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const result = await query<any>(
    `SELECT
      al.*,
      u.username,
      u.email,
      u.role
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    ${whereSql}
    ORDER BY al.created_at DESC
    LIMIT ${safeLimit}`,
    params,
  );

  return result.rows;
}
