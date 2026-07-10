import { query } from '../db/pool.js';

function isWholesaleUser(user?: any) {
  return user?.role === 'wholesale' && user?.wholesaleCustomerId;
}

export async function listInbounds(serverId?: string, user?: any) {
  if (isWholesaleUser(user)) {
    const accessRes = await query<any>(
      `SELECT allowed_server_ids, allowed_inbound_ids
       FROM wholesale_customers
       WHERE id = $1 AND is_active = true`,
      [user.wholesaleCustomerId],
    );

    const access = accessRes.rows[0];
    const allowedServerIds: string[] = access?.allowed_server_ids || [];
    const allowedInboundIds: string[] = access?.allowed_inbound_ids || [];

    const params: any[] = [allowedServerIds, allowedInboundIds];
    let serverFilter = '';

    if (serverId) {
      params.push(serverId);
      serverFilter = `AND i.server_id = $${params.length}`;
    }

    const res = await query<any>(
      `SELECT
        i.*,
        s.name AS server_name,
        s.host AS server_host
       FROM inbounds i
       JOIN servers s ON s.id = i.server_id
       WHERE i.is_active = true
         AND s.is_active = true
         AND (
           cardinality($1::uuid[]) = 0
           OR i.server_id = ANY($1::uuid[])
         )
         AND (
           cardinality($2::uuid[]) = 0
           OR i.id = ANY($2::uuid[])
         )
         ${serverFilter}
       ORDER BY s.name, i.threexui_inbound_id`,
      params,
    );

    return res.rows;
  }

  const params: any[] = [];
  const where = serverId ? 'WHERE i.server_id=$1' : '';

  if (serverId) params.push(serverId);

  const res = await query<any>(
    `SELECT
      i.*,
      s.name AS server_name,
      s.host AS server_host
     FROM inbounds i
     JOIN servers s ON s.id=i.server_id
     ${where}
     ORDER BY s.name, i.threexui_inbound_id`,
    params,
  );

  return res.rows;
}
