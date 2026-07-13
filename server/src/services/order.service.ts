import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { transaction, query } from '../db/pool.js';
import { calculatePrice } from './pricing.service.js';
import { threeXUIService } from './threexui.service.js';
import {
  assertCustomerCanUseServerAndInbounds,
  getServer,
} from './server.service.js';
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

  type ServerTrafficLookup = {
    mode: 'legacy' | 'clients_v3';
    stats: Map<string, any>;
  };

  const trafficByServer =
    new Map<string, ServerTrafficLookup>();

  const failedServers = new Set<string>();

  await Promise.all(
    serverIds.map(async (serverId) => {
      try {
        const server = await getServer(serverId);

        const mode =
          await threeXUIService.getClientApiMode(
            server,
          );

        const trafficMap =
          new Map<string, any>();

        if (mode === 'clients_v3') {
          const clients =
            await threeXUIService
              .listClientsWithTraffic(server);

          for (const client of clients) {
            const email =
              normalizeTrafficEmail(
                client?.email,
              );

            if (!email) continue;

            const traffic =
              client?.traffic &&
              typeof client.traffic === 'object'
                ? client.traffic
                : {};

            const inboundIds: number[] =
              Array.isArray(client?.inboundIds)
                ? [
                    ...new Set<number>(
                      client.inboundIds
                        .map(
                          (value: unknown) =>
                            Number(value),
                        )
                        .filter(
                          (value: number) =>
                            Number.isInteger(value) &&
                            value > 0,
                        ),
                    ),
                  ]
                : [];

            trafficMap.set(email, {
              ...traffic,
              email: client.email,
              up: liveNumber(traffic.up),
              down: liveNumber(traffic.down),

              // در نسخه ۳ سهمیه و انقضا
              // متعلق به خود Client است.
              total: liveNumber(
                client.totalGB,
              ),
              expiryTime: liveNumber(
                client.expiryTime,
              ),

              enable:
                client.enable !== false &&
                traffic.enable !== false,

              inboundIds,
              lastOnline: liveNumber(
                traffic.lastOnline,
              ),
            });
          }
        } else {
          const inbounds =
            await threeXUIService
              .listInboundsWithTraffic(server);

          for (const inbound of inbounds) {
            const stats = Array.isArray(
              inbound.clientStats,
            )
              ? inbound.clientStats
              : [];

            for (const stat of stats) {
              const email =
                normalizeTrafficEmail(
                  stat.email,
                );

              if (!email) continue;

              const inboundId =
                stat.inboundId !== undefined
                  ? Number(stat.inboundId)
                  : Number(inbound.id);

              trafficMap.set(
                trafficMapKey(
                  inboundId,
                  email,
                ),
                stat,
              );
            }
          }
        }

        trafficByServer.set(serverId, {
          mode,
          stats: trafficMap,
        });
      } catch (error) {
        failedServers.add(serverId);

        console.error({
          scope:
            'listEndUsers.liveTraffic',
          serverId,
          error:
            error instanceof Error
              ? error.message
              : String(error),
        });
      }
    }),
  );

  const checkedAt =
    new Date().toISOString();

  return rows.map((row: any) => {
    row.subscription_link = buildSubscriptionLink(row.sub_id, row.server_subscription_url);
    const serverId = String(row.server_id || '');
    const inboundId = Number(row.threexui_inbound_id);
    const trafficLookup =
      trafficByServer.get(serverId);

    const stat = trafficLookup
      ? trafficLookup.stats.get(
          trafficLookup.mode === 'clients_v3'
            ? normalizeTrafficEmail(row.email)
            : trafficMapKey(
                inboundId,
                row.email,
              ),
        )
      : undefined;

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
      liveTrafficApiMode:
        trafficLookup?.mode,
      liveTrafficCheckedAt: checkedAt,
      liveInboundIds:
        Array.isArray(stat.inboundIds)
          ? stat.inboundIds
          : undefined,
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

export async function createConfig(
  customerId: string,
  input: {
    planId: string;
    serverId: string;
    inboundId?: string;
    inboundIds: string[];
    email: string;
    idempotencyKey?: string;
  },
) {
  const inboundIds = [
    ...new Set(
      (
        input.inboundIds?.length
          ? input.inboundIds
          : input.inboundId
            ? [input.inboundId]
            : []
      )
        .map(String)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];

  if (!inboundIds.length) {
    throw new AppError(
      400,
      'حداقل یک اینباند باید انتخاب شود',
      'INBOUND_REQUIRED',
    );
  }

  const email = input.email.trim();

  const idempotencyKey =
    input.idempotencyKey ||
    `order:${customerId}:${email}:${Date.now()}`;

  await assertCustomerCanUseServerAndInbounds(
    customerId,
    input.serverId,
    inboundIds,
  );

  const price = await calculatePrice(
    input.planId,
    customerId,
  );

  const inboundRes = await query<any>(
    `SELECT *
     FROM inbounds
     WHERE server_id = $1
       AND id = ANY($2::uuid[])
       AND is_active = true`,
    [input.serverId, inboundIds],
  );

  const inboundById = new Map(
    inboundRes.rows.map((inbound: any) => [
      String(inbound.id),
      inbound,
    ]),
  );

  const selectedInbounds = inboundIds
    .map((id) => inboundById.get(id))
    .filter(Boolean);

  if (selectedInbounds.length !== inboundIds.length) {
    throw new AppError(
      404,
      'یکی از اینباندهای انتخاب‌شده فعال نیست یا متعلق به این سرور نیست',
      'INBOUND_NOT_FOUND',
    );
  }

  const primaryInbound = selectedInbounds[0];
  const server = await getServer(input.serverId);

  const clientApiMode =
    await threeXUIService.getClientApiMode(server);

  if (
    clientApiMode === 'legacy' &&
    selectedInbounds.length > 1
  ) {
    throw new AppError(
      400,
      'این نسخه 3x-ui فقط از یک اینباند برای هر کاربر پشتیبانی می‌کند',
      'LEGACY_SINGLE_INBOUND',
    );
  }

  const duplicate =
    clientApiMode === 'clients_v3'
      ? await query(
          `SELECT id
           FROM end_users
           WHERE server_id = $1
             AND LOWER(email) = LOWER($2)
             AND deleted_at IS NULL
           LIMIT 1`,
          [input.serverId, email],
        )
      : await query(
          `SELECT id
           FROM end_users
           WHERE server_id = $1
             AND inbound_id = $2
             AND LOWER(email) = LOWER($3)
             AND deleted_at IS NULL
           LIMIT 1`,
          [
            input.serverId,
            primaryInbound.id,
            email,
          ],
        );

  if (duplicate.rows[0]) {
    throw new AppError(
      409,
      'کاربری با این شناسه روی سرور ثبت شده است',
      'END_USER_EMAIL_EXISTS',
    );
  }

  const xuiClientId = clientId();
  const subId = nanoid(16);

  const expiry = new Date(
    Date.now() +
      Number(price.plan.duration_days) * 86400_000,
  );

  const trafficBytes = gbToBytes(
    Number(price.plan.traffic_gb),
  );

  const xuiInboundIds = selectedInbounds.map(
    (inbound: any) =>
      Number(inbound.threexui_inbound_id),
  );

  let configLinks: string[] = [];

  if (clientApiMode === 'legacy') {
    try {
      configLinks = selectedInbounds.map(
        (inbound: any) =>
          buildConfigLink({
            protocol: inbound.protocol,
            clientId: xuiClientId,
            email,
            remark: `${email} - ${inbound.name}`,
            host: server.host.replace(
              /^https?:\/\//,
              '',
            ),
            port: Number(inbound.port),
            streamSettings:
              inbound.stream_settings,
          }),
      );
    } catch {
      throw new AppError(
        400,
        'یکی از پروتکل‌های انتخاب‌شده برای ساخت لینک پشتیبانی نمی‌شود',
        'UNSUPPORTED_INBOUND_PROTOCOL',
      );
    }
  }

  const orderAndClient = await transaction(
    async (client) => {
      const existing = await client.query(
        `SELECT id
         FROM orders
         WHERE idempotency_key = $1`,
        [idempotencyKey],
      );

      if (existing.rows[0]) {
        throw new AppError(
          409,
          'این سفارش قبلاً ثبت شده است',
          'IDEMPOTENCY_CONFLICT',
        );
      }

      const walletRes = await client.query<any>(
        `SELECT *
         FROM wallets
         WHERE wholesale_customer_id = $1
         FOR UPDATE`,
        [customerId],
      );

      const wallet = walletRes.rows[0];

      if (!wallet) {
        throw new AppError(
          404,
          'کیف پول یافت نشد',
          'WALLET_NOT_FOUND',
        );
      }

      const before = Number(wallet.balance);

      if (before < price.finalPrice) {
        throw new AppError(
          400,
          'موجودی کیف پول کافی نیست',
          'INSUFFICIENT_BALANCE',
        );
      }

      const orderRes = await client.query<any>(
        `INSERT INTO orders (
          wholesale_customer_id,
          type,
          plan_id,
          server_id,
          inbound_id,
          traffic_gb,
          duration_days,
          price_per_gb,
          total_price,
          status,
          idempotency_key
        )
        VALUES (
          $1,'new',$2,$3,$4,$5,$6,$7,$8,
          'processing',$9
        )
        RETURNING *`,
        [
          customerId,
          input.planId,
          input.serverId,
          primaryInbound.id,
          price.plan.traffic_gb,
          price.plan.duration_days,
          price.pricePerGb,
          price.finalPrice,
          idempotencyKey,
        ],
      );

      const order = orderRes.rows[0];

      await client.query(
        `INSERT INTO order_inbounds (
          order_id,
          inbound_id
        )
        SELECT $1, UNNEST($2::uuid[])
        ON CONFLICT DO NOTHING`,
        [order.id, inboundIds],
      );

      await client.query(
        `UPDATE wallets
         SET balance = $1
         WHERE id = $2`,
        [
          before - price.finalPrice,
          wallet.id,
        ],
      );

      await client.query(
        `INSERT INTO wallet_transactions (
          wallet_id,
          type,
          amount,
          balance_before,
          balance_after,
          description,
          order_id,
          created_by,
          status,
          idempotency_key
        )
        VALUES (
          $1,'debit',$2,$3,$4,$5,$6,
          NULL,'completed',$7
        )`,
        [
          wallet.id,
          price.finalPrice,
          before,
          before - price.finalPrice,
          `سفارش ساخت کانفیگ ${email}`,
          order.id,
          `debit:${order.id}`,
        ],
      );

      return { order };
    },
  );

  const xuiClient = {
    id: xuiClientId,
    password: xuiClientId,
    email,
    enable: true,
    totalGB: trafficBytes,
    expiryTime: expiry.getTime(),
    limitIp: Number(
      price.plan.ip_limit || 0,
    ),
    subId,
    tgId: 0,
    security: 'auto',
    flow: '',
    comment: '',
    reset: 0,
  };

  let remoteCreated = false;

  try {
    const xuiResponse =
      await threeXUIService.addClient(
        server,
        xuiInboundIds,
        xuiClient,
      );

    remoteCreated = true;

    if (clientApiMode === 'clients_v3') {
      configLinks =
        await threeXUIService.getClientLinks(
          server,
          email,
        );
    }

    return transaction(async (client) => {
      const endUserRes =
        await client.query<any>(
          `INSERT INTO end_users (
            wholesale_customer_id,
            server_id,
            inbound_id,
            threexui_client_id,
            email,
            sub_id,
            plan_id,
            traffic_limit,
            expiry_time,
            ip_limit,
            is_active,
            status
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            true,'active'
          )
          RETURNING *`,
          [
            customerId,
            input.serverId,
            primaryInbound.id,
            xuiClientId,
            email,
            subId,
            input.planId,
            trafficBytes,
            expiry,
            price.plan.ip_limit || 0,
          ],
        );

      const endUser = endUserRes.rows[0];

      await client.query(
        `INSERT INTO end_user_inbounds (
          end_user_id,
          inbound_id
        )
        SELECT $1, UNNEST($2::uuid[])
        ON CONFLICT DO NOTHING`,
        [endUser.id, inboundIds],
      );

      const orderRes =
        await client.query<any>(
          `UPDATE orders
           SET status = 'completed',
               end_user_id = $1,
               threexui_response = $2
           WHERE id = $3
           RETURNING *`,
          [
            endUser.id,
            JSON.stringify(xuiResponse),
            orderAndClient.order.id,
          ],
        );

      return {
        order: orderRes.rows[0],
        endUser: {
          ...endUser,
          inboundIds,
        },
        configLink: configLinks[0] || '',
        configLinks,
        subscriptionLink:
          buildSubscriptionLink(
            subId,
            server.subscription_url,
          ),
      };
    });
  } catch (error: any) {
    if (remoteCreated) {
      try {
        await threeXUIService.deleteClient(
          server,
          {
            email,
            clientId: xuiClientId,
            inboundIds: xuiInboundIds,
          },
        );
      } catch (cleanupError) {
        console.error({
          scope: 'createConfig.remoteCleanup',
          email,
          serverId: server.id,
          error:
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
        });
      }
    }

    await transaction(async (client) => {
      const orderRes =
        await client.query<any>(
          `SELECT *
           FROM orders
           WHERE id = $1`,
          [orderAndClient.order.id],
        );

      const order = orderRes.rows[0];

      if (
        !order ||
        order.status !== 'processing'
      ) {
        return;
      }

      const walletRes =
        await client.query<any>(
          `SELECT *
           FROM wallets
           WHERE wholesale_customer_id = $1
           FOR UPDATE`,
          [customerId],
        );

      const wallet = walletRes.rows[0];
      const before = Number(wallet.balance);

      await client.query(
        `UPDATE wallets
         SET balance = $1
         WHERE id = $2`,
        [
          before + Number(order.total_price),
          wallet.id,
        ],
      );

      await client.query(
        `INSERT INTO wallet_transactions (
          wallet_id,
          type,
          amount,
          balance_before,
          balance_after,
          description,
          order_id,
          created_by,
          status,
          idempotency_key
        )
        VALUES (
          $1,'refund',$2,$3,$4,$5,$6,
          NULL,'completed',$7
        )`,
        [
          wallet.id,
          order.total_price,
          before,
          before + Number(order.total_price),
          'بازگشت وجه به دلیل خطای 3x-ui',
          order.id,
          `refund:${order.id}`,
        ],
      );

      await client.query(
        `UPDATE orders
         SET status = 'failed',
             error_message = $1
         WHERE id = $2`,
        [
          error?.message || 'خطای نامشخص',
          order.id,
        ],
      );
    });

    throw error;
  }
}
