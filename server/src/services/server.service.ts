import { z } from 'zod';
import { query, transaction } from '../db/pool.js';
import { encryptText } from '../utils/crypto.js';
import { createServerSchema } from '../validators/server.schema.js';
import { threeXUIService } from './threexui.service.js';
import { AppError } from '../middleware/error.middleware.js';
import type { ThreeXUIServerRow } from '../types/index.js';

function isWholesaleUser(user?: any) {
  return user?.role === 'wholesale' && user?.wholesaleCustomerId;
}

export async function listServers(user?: any) {
  if (isWholesaleUser(user)) {
    const accessRes = await query<any>(
      `SELECT allowed_server_ids
       FROM wholesale_customers
       WHERE id = $1 AND is_active = true`,
      [user.wholesaleCustomerId],
    );

    const access = accessRes.rows[0];
    const allowedServerIds: string[] = access?.allowed_server_ids || [];

    const res = await query<any>(
      `SELECT
        s.id,
        s.name,
        s.host,
        s.port,
        s.base_path,
        s.is_active,
        s.location,
        s.description,
        s.last_health_check,
        s.health_status,
        s.subscription_url,
        s.created_at,
        s.updated_at,
        COALESCE((SELECT COUNT(*)::int FROM inbounds i WHERE i.server_id = s.id), 0) AS inbounds_count
       FROM servers s
       WHERE s.is_active = true
         AND (
           cardinality($1::uuid[]) = 0
           OR s.id = ANY($1::uuid[])
         )
       ORDER BY s.created_at DESC`,
      [allowedServerIds],
    );

    return res.rows;
  }

  const res = await query<any>(
    `SELECT
      s.id,
      s.name,
      s.host,
      s.port,
      s.base_path,
      s.is_active,
      s.location,
      s.description,
      s.last_health_check,
      s.health_status,
      s.subscription_url,
      s.created_at,
      s.updated_at,
      COALESCE((SELECT COUNT(*)::int FROM inbounds i WHERE i.server_id = s.id), 0) AS inbounds_count
     FROM servers s
     ORDER BY s.created_at DESC`,
  );

  return res.rows;
}

export async function getServer(id: string): Promise<ThreeXUIServerRow> {
  const res = await query<ThreeXUIServerRow>('SELECT * FROM servers WHERE id=$1', [id]);
  if (!res.rows[0]) throw new AppError(404, 'سرور یافت نشد', 'SERVER_NOT_FOUND');
  return res.rows[0];
}

export async function assertCustomerCanUseServerAndInbound(customerId: string, serverId: string, inboundId: string) {
  const customerRes = await query<any>(
    `SELECT allowed_server_ids, allowed_inbound_ids, is_active
     FROM wholesale_customers
     WHERE id = $1`,
    [customerId],
  );

  const customer = customerRes.rows[0];

  if (!customer) {
    throw new AppError(404, 'مشتری یافت نشد', 'CUSTOMER_NOT_FOUND');
  }

  if (!customer.is_active) {
    throw new AppError(403, 'حساب مشتری غیرفعال است', 'CUSTOMER_DISABLED');
  }

  const allowedServerIds: string[] = customer.allowed_server_ids || [];
  const allowedInboundIds: string[] = customer.allowed_inbound_ids || [];

  if (allowedServerIds.length > 0 && !allowedServerIds.includes(serverId)) {
    throw new AppError(403, 'این مشتری اجازه استفاده از این سرور را ندارد', 'SERVER_ACCESS_DENIED');
  }

  if (allowedInboundIds.length > 0 && !allowedInboundIds.includes(inboundId)) {
    throw new AppError(403, 'این مشتری اجازه استفاده از این اینباند را ندارد', 'INBOUND_ACCESS_DENIED');
  }

  return true;
}

export async function createServer(input: unknown) {
  const data = createServerSchema.parse(input);

  const res = await query<any>(
    `INSERT INTO servers (
      name,
      host,
      port,
      base_path,
      username_encrypted,
      password_encrypted,
      is_active,
      location,
      description,
      subscription_url
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING id,name,host,port,base_path,is_active,location,description,subscription_url,created_at,updated_at`,
    [
      data.name,
      data.host,
      data.port,
      data.basePath,
      encryptText(data.username),
      encryptText(data.password),
      data.isActive ?? true,
      data.location ?? null,
      data.description ?? null,
      data.subscriptionUrl?.trim() ? data.subscriptionUrl.trim() : null,
    ],
  );

  return res.rows[0];
}

const updateServerSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  host: z.string().min(1).max(500).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  basePath: z.string().min(1).max(200).optional(),
  username: z.string().min(1).max(200).optional(),
  password: z.string().min(1).max(500).optional(),
  isActive: z.boolean().optional(),
  location: z.string().max(120).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  subscriptionUrl: z.string().url().optional().or(z.literal('')).nullable(),
}).strict();

export async function updateServer(id: string, input: unknown) {
  await getServer(id);

  const data = updateServerSchema.parse(input);
  const sets: string[] = [];
  const values: any[] = [];

  function setColumn(column: string, value: any) {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }

  if (data.name !== undefined) setColumn('name', data.name);
  if (data.host !== undefined) setColumn('host', data.host);
  if (data.port !== undefined) setColumn('port', data.port);
  if (data.basePath !== undefined) setColumn('base_path', data.basePath);
  if (data.username !== undefined) setColumn('username_encrypted', encryptText(data.username));
  if (data.password !== undefined) setColumn('password_encrypted', encryptText(data.password));
  if (data.isActive !== undefined) setColumn('is_active', data.isActive);
  if (data.location !== undefined) setColumn('location', data.location?.trim() ? data.location.trim() : null);
  if (data.description !== undefined) setColumn('description', data.description?.trim() ? data.description.trim() : null);
  if (data.subscriptionUrl !== undefined) setColumn('subscription_url', data.subscriptionUrl?.trim() ? data.subscriptionUrl.trim() : null);

  if (sets.length === 0) {
    const current = await query<any>(
      `SELECT id,name,host,port,base_path,is_active,location,description,last_health_check,health_status,created_at,updated_at
       FROM servers WHERE id = $1`,
      [id],
    );

    return current.rows[0];
  }

  values.push(id);

  const res = await query<any>(
    `UPDATE servers
     SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length}
     RETURNING id,name,host,port,base_path,is_active,location,description,last_health_check,health_status,created_at,updated_at`,
    values,
  );

  return res.rows[0];
}

export async function testServerConnection(id: string) {
  const server = await getServer(id);
  const result = await threeXUIService.testConnection(server);

  await query(
    'UPDATE servers SET last_health_check=NOW(), health_status=$2 WHERE id=$1',
    [id, 'healthy'],
  );

  return result;
}

export async function syncInbounds(serverId: string) {
  const server = await getServer(serverId);
  const inbounds = await threeXUIService.listInbounds(server);

  return transaction(async (client) => {
    const rows = [];

    for (const inbound of inbounds) {
      const r = await client.query<any>(
        `INSERT INTO inbounds (
          server_id,
          threexui_inbound_id,
          name,
          protocol,
          port,
          is_active,
          tag,
          settings,
          stream_settings
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (server_id, threexui_inbound_id)
        DO UPDATE SET
          name = EXCLUDED.name,
          protocol = EXCLUDED.protocol,
          port = EXCLUDED.port,
          tag = EXCLUDED.tag,
          settings = EXCLUDED.settings,
          stream_settings = EXCLUDED.stream_settings,
          updated_at = NOW()
        RETURNING *`,
        [
          serverId,
          inbound.id,
          inbound.remark || inbound.tag || `Inbound ${inbound.id}`,
          inbound.protocol,
          inbound.port,
          inbound.enable ?? true,
          inbound.tag || null,
          inbound.settings || null,
          inbound.streamSettings || null,
        ],
      );

      rows.push(r.rows[0]);
    }

    return rows;
  });
}

export async function removeServer(id: string) {
  const server = await getServer(id);

  const dependencyRes = await query<any>(
    `SELECT
      COALESCE((SELECT COUNT(*)::int FROM end_users WHERE server_id = $1), 0) AS end_users_count,
      COALESCE((SELECT COUNT(*)::int FROM orders WHERE server_id = $1), 0) AS orders_count,
      COALESCE((SELECT COUNT(*)::int FROM inbounds WHERE server_id = $1), 0) AS inbounds_count`,
    [id],
  );

  const deps = dependencyRes.rows[0] || {};
  const endUsersCount = Number(deps.end_users_count || 0);
  const ordersCount = Number(deps.orders_count || 0);
  const inboundsCount = Number(deps.inbounds_count || 0);

  if (endUsersCount > 0 || ordersCount > 0) {
    throw new AppError(
      409,
      `این سرور قابل حذف نیست چون ${endUsersCount} کاربر نهایی و ${ordersCount} سفارش وابسته دارد. برای حفظ تاریخچه و جلوگیری از خرابی کانفیگ‌ها حذف مستقیم انجام نشد.`,
      'SERVER_HAS_DEPENDENCIES',
    );
  }

  const inboundRes = await query<any>(
    'SELECT id FROM inbounds WHERE server_id = $1',
    [id],
  );

  const inboundIds = inboundRes.rows.map((row) => row.id);

  return transaction(async (client) => {
    await client.query(
      `UPDATE wholesale_customers
       SET
         allowed_server_ids = array_remove(allowed_server_ids, $1::uuid),
         allowed_inbound_ids = COALESCE(
           ARRAY(
             SELECT item
             FROM unnest(allowed_inbound_ids) AS item
             WHERE NOT (item = ANY($2::uuid[]))
           ),
           '{}'::uuid[]
         ),
         updated_at = NOW()
       WHERE $1::uuid = ANY(allowed_server_ids)
          OR allowed_inbound_ids && $2::uuid[]`,
      [id, inboundIds],
    );

    await client.query('DELETE FROM servers WHERE id = $1', [id]);

    return {
      deleted: true,
      serverId: id,
      serverName: server.name,
      deletedInbounds: inboundsCount,
      cleanedCustomerAccess: true,
    };
  });
}
