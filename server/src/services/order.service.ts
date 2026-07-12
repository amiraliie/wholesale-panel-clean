import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { transaction, query } from '../db/pool.js';
import { calculatePrice } from './pricing.service.js';
import { threeXUIService } from './threexui.service.js';
import { assertCustomerCanUseServerAndInbound, getServer } from './server.service.js';
import { AppError } from '../middleware/error.middleware.js';
import { buildConfigLink, buildSubscriptionLink } from '../utils/link-builder.js';
import { env } from '../config/env.js';

function gbToBytes(gb: number) { return gb * 1024 * 1024 * 1024; }
function clientId() { return crypto.randomUUID(); }

function liveNumber(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizeTrafficEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function trafficMapKey(inboundId: unknown, email: unknown) {
  return `${Number(inboundId)}:${normalizeTrafficEmail(email)}`;
}

export async function listOrders(customerId?: string) {
  const res = await query<any>(`SELECT o.*, p.name AS plan_name, eu.email AS end_user_email FROM orders o
    LEFT JOIN plans p ON p.id=o.plan_id LEFT JOIN end_users eu ON eu.id=o.end_user_id
    ${customerId ? 'WHERE o.wholesale_customer_id=$1' : ''} ORDER BY o.created_at DESC LIMIT 300`, customerId ? [customerId] : []);
  return res.rows;
}

export async function listEndUsers(customerId?: string) {
  const where = customerId
    ? 'WHERE eu.wholesale_customer_id=$1 AND eu.deleted_at IS NULL'
    : 'WHERE eu.deleted_at IS NULL';

  const res = await query<any>(`SELECT
      eu.*,
      eu.customer_paid AS "customerPaid",
      eu.customer_paid_at AS "customerPaidAt",
      eu.customer_paid_note AS "customerPaidNote",
      p.name AS plan_name,
      i.name AS inbound_name,
      i.threexui_inbound_id,
      s.name AS server_name,
      s.host AS server_host,
      s.subscription_url AS server_subscription_url
    FROM end_users eu
    JOIN plans p ON p.id=eu.plan_id
    JOIN inbounds i ON i.id=eu.inbound_id
    JOIN servers s ON s.id=eu.server_id
    ${where}
    ORDER BY eu.created_at DESC
    LIMIT 300`, customerId ? [customerId] : []);

  const rows = res.rows;
  const serverIds = [
    ...new Set(
      rows
        .map((row: any) => String(row.server_id || ''))
        .filter(Boolean),
    ),
  ];

  const trafficByServer = new Map<string, Map<string, any>>();
  const failedServers = new Set<string>();

  await Promise.all(
    serverIds.map(async (serverId) => {
      try {
        const server = await getServer(serverId);
        const inbounds =
          await threeXUIService.listInboundsWithTraffic(server);

        const trafficMap = new Map<string, any>();

        for (const inbound of inbounds) {
          const stats = Array.isArray(inbound.clientStats)
            ? inbound.clientStats
            : [];

          for (const stat of stats) {
            const email = normalizeTrafficEmail(stat.email);

            if (!email) continue;

            const inboundId =
              stat.inboundId !== undefined
                ? Number(stat.inboundId)
                : Number(inbound.id);

            trafficMap.set(
              trafficMapKey(inboundId, email),
              stat,
            );
          }
        }

        trafficByServer.set(serverId, trafficMap);
      } catch (error) {
        failedServers.add(serverId);

        console.error({
          scope: 'listEndUsers.liveTraffic',
          serverId,
          error:
            error instanceof Error
              ? error.message
              : String(error),
        });
      }
    }),
  );

  const checkedAt = new Date().toISOString();

  return rows.map((row: any) => {
    row.subscription_link = buildSubscriptionLink(row.sub_id, row.server_subscription_url);
    const serverId = String(row.server_id || '');
    const inboundId = Number(row.threexui_inbound_id);
    const trafficMap = trafficByServer.get(serverId);

    const stat = trafficMap?.get(
      trafficMapKey(inboundId, row.email),
    );

    if (!stat) {
      return {
        ...row,
        trafficStatsAvailable: false,
        liveTrafficCheckedAt: checkedAt,
        liveTrafficError: failedServers.has(serverId)
          ? 'THREEXUI_UNAVAILABLE'
          : 'CLIENT_TRAFFIC_NOT_FOUND',
      };
    }

    const up = Math.max(0, liveNumber(stat.up));
    const down = Math.max(0, liveNumber(stat.down));
    const used = up + down;
    const total = Math.max(0, liveNumber(stat.total));
    const expiryTimestamp = Math.max(
      0,
      liveNumber(stat.expiryTime),
    );
    const enabled = stat.enable !== false;

    const trafficFinished =
      total > 0 && used >= total;

    const expiryFinished =
      expiryTimestamp > 0 &&
      expiryTimestamp <= Date.now();

    let liveStatus:
      | 'active'
      | 'disabled'
      | 'expired'
      | 'limited' = 'active';

    let liveFinishedReason:
      | 'disabled'
      | 'expiry'
      | 'traffic'
      | null = null;

    if (!enabled) {
      liveStatus = 'disabled';
      liveFinishedReason = 'disabled';
    } else if (expiryFinished) {
      liveStatus = 'expired';
      liveFinishedReason = 'expiry';
    } else if (trafficFinished) {
      liveStatus = 'limited';
      liveFinishedReason = 'traffic';
    }

    return {
      ...row,
      trafficStatsAvailable: true,
      liveTrafficSource: '3x-ui',
      liveTrafficCheckedAt: checkedAt,
      liveTrafficUp: up,
      liveTrafficDown: down,
      liveTrafficUsed: used,
      liveTrafficLimit: total,
      liveExpiryTime:
        expiryTimestamp > 0
          ? new Date(expiryTimestamp).toISOString()
          : null,
      liveEnabled: enabled,
      liveStatus,
      liveFinishedReason,
    };
  });
}

export async function createConfig(customerId: string, input: { planId: string; serverId: string; inboundId: string; email: string; idempotencyKey?: string }) {
  const idempotencyKey = input.idempotencyKey || `order:${customerId}:${input.email}:${Date.now()}`;

  await assertCustomerCanUseServerAndInbound(customerId, input.serverId, input.inboundId);

  const price = await calculatePrice(input.planId, customerId);
  const inboundRes = await query<any>('SELECT * FROM inbounds WHERE id=$1 AND server_id=$2 AND is_active=true', [input.inboundId, input.serverId]);
  const inbound = inboundRes.rows[0];
  if (!inbound) throw new AppError(404, 'اینباند فعال یافت نشد', 'INBOUND_NOT_FOUND');
  const server = await getServer(input.serverId);
  const xuiClientId = clientId();
  const subId = nanoid(16);
  const expiry = new Date(Date.now() + Number(price.plan.duration_days) * 86400_000);
  const trafficBytes = gbToBytes(Number(price.plan.traffic_gb));

  const orderAndClient = await transaction(async (client) => {
    const existing = await client.query('SELECT id FROM orders WHERE idempotency_key=$1', [idempotencyKey]);
    if (existing.rows[0]) throw new AppError(409, 'این سفارش قبلاً ثبت شده است', 'IDEMPOTENCY_CONFLICT');

    const walletRes = await client.query<any>('SELECT * FROM wallets WHERE wholesale_customer_id=$1 FOR UPDATE', [customerId]);
    const wallet = walletRes.rows[0];
    if (!wallet) throw new AppError(404, 'کیف پول یافت نشد', 'WALLET_NOT_FOUND');
    const before = Number(wallet.balance);
    if (before < price.finalPrice) throw new AppError(400, 'موجودی کیف پول کافی نیست', 'INSUFFICIENT_BALANCE');

    const orderRes = await client.query<any>(`INSERT INTO orders (wholesale_customer_id,type,plan_id,server_id,inbound_id,traffic_gb,duration_days,price_per_gb,total_price,status,idempotency_key)
      VALUES ($1,'new',$2,$3,$4,$5,$6,$7,$8,'processing',$9) RETURNING *`, [customerId, input.planId, input.serverId, input.inboundId, price.plan.traffic_gb, price.plan.duration_days, price.pricePerGb, price.finalPrice, idempotencyKey]);
    const order = orderRes.rows[0];

    await client.query('UPDATE wallets SET balance=$1 WHERE id=$2', [before - price.finalPrice, wallet.id]);
    await client.query(`INSERT INTO wallet_transactions (wallet_id,type,amount,balance_before,balance_after,description,order_id,created_by,status,idempotency_key)
      VALUES ($1,'debit',$2,$3,$4,$5,$6,NULL,'completed',$7)`, [wallet.id, price.finalPrice, before, before - price.finalPrice, `سفارش ساخت کانفیگ ${input.email}`, order.id, `debit:${order.id}`]);

    return { order };
  });

  try {
    const xuiClient = {
      id: xuiClientId,
      email: input.email,
      enable: true,
      totalGB: trafficBytes,
      expiryTime: expiry.getTime(),
      limitIp: Number(price.plan.ip_limit || 0),
      subId,
      tgId: '',
      flow: inbound.protocol === 'vless' ? '' : undefined,
    };
    const xuiResponse = await threeXUIService.addClient(server, Number(inbound.threexui_inbound_id), xuiClient);
    return transaction(async (client) => {
      const endUserRes = await client.query<any>(`INSERT INTO end_users (wholesale_customer_id,server_id,inbound_id,threexui_client_id,email,sub_id,plan_id,traffic_limit,expiry_time,ip_limit,is_active,status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,'active') RETURNING *`, [customerId, input.serverId, input.inboundId, xuiClientId, input.email, subId, input.planId, trafficBytes, expiry, price.plan.ip_limit || 0]);
      const endUser = endUserRes.rows[0];
      const orderRes = await client.query<any>('UPDATE orders SET status=$1, end_user_id=$2, threexui_response=$3 WHERE id=$4 RETURNING *', ['completed', endUser.id, JSON.stringify(xuiResponse), orderAndClient.order.id]);
      const link = buildConfigLink({ protocol: inbound.protocol, clientId: xuiClientId, email: input.email, host: server.host.replace(/^https?:\/\//, ''), port: Number(inbound.port), streamSettings: inbound.stream_settings });
      return { order: orderRes.rows[0], endUser, configLink: link, subscriptionLink: buildSubscriptionLink(subId, server.subscription_url) };
    });
  } catch (error: any) {
    await transaction(async (client) => {
      const orderRes = await client.query<any>('SELECT * FROM orders WHERE id=$1', [orderAndClient.order.id]);
      const order = orderRes.rows[0];
      if (!order || order.status !== 'processing') return;
      const walletRes = await client.query<any>('SELECT * FROM wallets WHERE wholesale_customer_id=$1 FOR UPDATE', [customerId]);
      const wallet = walletRes.rows[0];
      const before = Number(wallet.balance);
      await client.query('UPDATE wallets SET balance=$1 WHERE id=$2', [before + Number(order.total_price), wallet.id]);
      await client.query(`INSERT INTO wallet_transactions (wallet_id,type,amount,balance_before,balance_after,description,order_id,created_by,status,idempotency_key)
        VALUES ($1,'refund',$2,$3,$4,$5,$6,NULL,'completed',$7)`, [wallet.id, order.total_price, before, before + Number(order.total_price), 'بازگشت وجه به دلیل خطای 3x-ui', order.id, `refund:${order.id}`]);
      await client.query('UPDATE orders SET status=$1, error_message=$2 WHERE id=$3', ['failed', error?.message || 'خطای نامشخص', order.id]);
    });
    throw error;
  }
}
