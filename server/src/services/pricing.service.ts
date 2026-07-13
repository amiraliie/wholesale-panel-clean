import { query, transaction } from '../db/pool.js';
import { AppError } from '../middleware/error.middleware.js';

type PricingMode = 'global' | 'server';

function optionalNumber(value: any) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return undefined;
  }

  return Number(value);
}

function uniqueStrings(
  values: unknown,
): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return [
    ...new Set<string>(
      values
        .map((value: unknown) =>
          String(value).trim(),
        )
        .filter(
          (value: string) =>
            value.length > 0,
        ),
    ),
  ];
}

async function validatePlanInboundIds(
  client: any,
  inboundIds: string[],
  serverId?: string,
) {
  if (!inboundIds.length) {
    return;
  }

  const result = await client.query(
    `SELECT id, server_id
     FROM inbounds
     WHERE id = ANY($1::uuid[])`,
    [inboundIds],
  );

  if (
    result.rows.length !==
    inboundIds.length
  ) {
    throw new AppError(
      400,
      'یکی از اینباندهای انتخاب‌شده معتبر نیست',
      'PLAN_INBOUND_NOT_FOUND',
    );
  }

  if (
    serverId &&
    result.rows.some(
      (row: any) =>
        String(row.server_id) !==
        String(serverId),
    )
  ) {
    throw new AppError(
      400,
      'اینباندهای پلن اختصاصی باید متعلق به همان سرور باشند',
      'PLAN_INBOUND_SERVER_MISMATCH',
    );
  }
}

const planSelect = `
  SELECT
    p.*,

    COALESCE(
      (
        SELECT COUNT(*)::int
        FROM end_users eu
        WHERE eu.plan_id = p.id
          AND eu.deleted_at IS NULL
      ),
      0
    ) AS end_users_count,

    COALESCE(
      (
        SELECT COUNT(*)::int
        FROM orders o
        WHERE o.plan_id = p.id
      ),
      0
    ) AS orders_count,

    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',
            spo.id,

            'serverId',
            spo.server_id,

            'serverName',
            s.name,

            'serverHost',
            s.host,

            'serviceType',
            s.service_type,

            'healthStatus',
            s.health_status,

            'flatPrice',
            spo.flat_price,

            'pricePerGB',
            spo.price_per_gb,

            'trafficGBOverride',
            spo.traffic_gb_override,

            'durationDaysOverride',
            spo.duration_days_override,

            'ipLimitOverride',
            spo.ip_limit_override,

            'isActive',
            spo.is_active,

            'availableFrom',
            spo.available_from,

            'availableUntil',
            spo.available_until
          )
          ORDER BY s.name
        )
        FROM server_plan_offers spo
        JOIN servers s
          ON s.id = spo.server_id
        WHERE spo.plan_id = p.id
      ),
      '[]'::jsonb
    ) AS server_offers

  FROM plans p
`;


export async function listPlans(
  activeOnly = false,
) {
  const result = await query<any>(
    `${planSelect}
     ${
       activeOnly
         ? 'WHERE p.is_active = true'
         : ''
     }
     ORDER BY
       COALESCE(p.scope, 'global'),
       p.traffic_gb ASC`,
  );

  return result.rows;
}


export async function getPlanById(
  planId: string,
) {
  const result = await query<any>(
    `${planSelect}
     WHERE p.id = $1`,
    [planId],
  );

  const plan = result.rows[0];

  if (!plan) {
    throw new AppError(
      404,
      'پلن یافت نشد',
      'PLAN_NOT_FOUND',
    );
  }

  return plan;
}


export async function createPlan(
  input: any,
) {
  const planId = await transaction(
    async (client) => {
      const scope: PricingMode =
        input.scope === 'server'
          ? 'server'
          : 'global';

      const allowedInboundIds =
        uniqueStrings(
          input.allowedInboundIds,
        );

      if (
        scope === 'server' &&
        !input.serverId
      ) {
        throw new AppError(
          400,
          'برای پلن اختصاصی باید سرور انتخاب شود',
          'SERVER_REQUIRED_FOR_PLAN',
        );
      }

      if (scope === 'server') {
        const serverResult =
          await client.query<any>(
            `SELECT id
             FROM servers
             WHERE id = $1`,
            [input.serverId],
          );

        if (!serverResult.rows[0]) {
          throw new AppError(
            404,
            'سرور یافت نشد',
            'SERVER_NOT_FOUND',
          );
        }
      }

      await validatePlanInboundIds(
        client,
        allowedInboundIds,
        scope === 'server'
          ? input.serverId
          : undefined,
      );

      const planResult =
        await client.query<any>(
          `INSERT INTO plans (
            name,
            description,
            traffic_gb,
            duration_days,
            base_price,
            price_per_gb,
            ip_limit,
            is_active,
            scope,
            allowed_inbound_ids
          )
          VALUES (
            $1,$2,$3,$4,$5,
            $6,$7,$8,$9,$10::uuid[]
          )
          RETURNING id`,
          [
            input.name,
            input.description ?? null,
            input.trafficGB,
            input.durationDays,
            input.basePrice,
            input.pricePerGB,
            input.ipLimit ?? 1,
            input.isActive ?? true,
            scope,
            allowedInboundIds,
          ],
        );

      const id =
        planResult.rows[0].id;

      if (scope === 'server') {
        await client.query(
          `INSERT INTO server_plan_offers (
            server_id,
            plan_id,
            flat_price,
            price_per_gb,
            traffic_gb_override,
            duration_days_override,
            ip_limit_override,
            is_active,
            available_from,
            available_until
          )
          VALUES (
            $1,$2,$3,$4,$5,
            $6,$7,$8,$9,$10
          )`,
          [
            input.serverId,
            id,
            input.flatPrice ?? null,
            input.offerPricePerGB ?? null,
            input.trafficGBOverride ??
              null,
            input.durationDaysOverride ??
              null,
            input.ipLimitOverride ??
              null,
            input.isOfferActive ?? true,
            input.availableFrom ?? null,
            input.availableUntil ?? null,
          ],
        );
      }

      return id;
    },
  );

  return getPlanById(planId);
}


export async function updatePlan(
  planId: string,
  input: any,
) {
  await transaction(async (client) => {
    const planResult =
      await client.query<any>(
        `SELECT *
         FROM plans
         WHERE id = $1
         FOR UPDATE`,
        [planId],
      );

    const currentPlan =
      planResult.rows[0];

    if (!currentPlan) {
      throw new AppError(
        404,
        'پلن یافت نشد',
        'PLAN_NOT_FOUND',
      );
    }

    const offerResult =
      await client.query<any>(
        `SELECT *
         FROM server_plan_offers
         WHERE plan_id = $1
         ORDER BY created_at
         LIMIT 1`,
        [planId],
      );

    const currentOffer =
      offerResult.rows[0];

    const scope: PricingMode =
      input.scope === 'server'
        ? 'server'
        : input.scope === 'global'
          ? 'global'
          : currentPlan.scope ===
              'server'
            ? 'server'
            : 'global';

    const serverId =
      input.serverId !== undefined
        ? input.serverId
        : currentOffer?.server_id;

    if (
      scope === 'server' &&
      !serverId
    ) {
      throw new AppError(
        400,
        'برای پلن اختصاصی باید سرور انتخاب شود',
        'SERVER_REQUIRED_FOR_PLAN',
      );
    }

    if (scope === 'server') {
      const serverResult =
        await client.query<any>(
          `SELECT id
           FROM servers
           WHERE id = $1`,
          [serverId],
        );

      if (!serverResult.rows[0]) {
        throw new AppError(
          404,
          'سرور یافت نشد',
          'SERVER_NOT_FOUND',
        );
      }
    }

    const allowedInboundIds =
      input.allowedInboundIds !==
      undefined
        ? uniqueStrings(
            input.allowedInboundIds,
          )
        : uniqueStrings(
            currentPlan
              .allowed_inbound_ids,
          );

    await validatePlanInboundIds(
      client,
      allowedInboundIds,
      scope === 'server'
        ? serverId
        : undefined,
    );

    await client.query(
      `UPDATE plans
       SET
         name =
           COALESCE($2, name),

         description =
           COALESCE(
             $3,
             description
           ),

         traffic_gb =
           COALESCE(
             $4,
             traffic_gb
           ),

         duration_days =
           COALESCE(
             $5,
             duration_days
           ),

         base_price =
           COALESCE(
             $6,
             base_price
           ),

         price_per_gb =
           COALESCE(
             $7,
             price_per_gb
           ),

         ip_limit =
           COALESCE(
             $8,
             ip_limit
           ),

         is_active =
           COALESCE(
             $9,
             is_active
           ),

         scope = $10,

         allowed_inbound_ids =
           $11::uuid[],

         updated_at = NOW()

       WHERE id = $1`,
      [
        planId,
        input.name ?? null,
        input.description ?? null,

        optionalNumber(
          input.trafficGB,
        ) ?? null,

        optionalNumber(
          input.durationDays,
        ) ?? null,

        optionalNumber(
          input.basePrice,
        ) ?? null,

        optionalNumber(
          input.pricePerGB,
        ) ?? null,

        optionalNumber(
          input.ipLimit,
        ) ?? null,

        input.isActive ?? null,
        scope,
        allowedInboundIds,
      ],
    );

    if (scope === 'global') {
      await client.query(
        `DELETE FROM server_plan_offers
         WHERE plan_id = $1`,
        [planId],
      );

      return;
    }

    const offerValue = (
      inputKey: string,
      databaseKey: string,
    ) => {
      if (
        Object.prototype
          .hasOwnProperty.call(
            input,
            inputKey,
          )
      ) {
        return input[inputKey];
      }

      return (
        currentOffer?.[databaseKey] ??
        null
      );
    };

    await client.query(
      `DELETE FROM server_plan_offers
       WHERE plan_id = $1
         AND server_id <> $2`,
      [planId, serverId],
    );

    await client.query(
      `INSERT INTO server_plan_offers (
        server_id,
        plan_id,
        flat_price,
        price_per_gb,
        traffic_gb_override,
        duration_days_override,
        ip_limit_override,
        is_active,
        available_from,
        available_until
      )
      VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10
      )
      ON CONFLICT (
        server_id,
        plan_id
      )
      DO UPDATE SET
        flat_price =
          EXCLUDED.flat_price,

        price_per_gb =
          EXCLUDED.price_per_gb,

        traffic_gb_override =
          EXCLUDED
            .traffic_gb_override,

        duration_days_override =
          EXCLUDED
            .duration_days_override,

        ip_limit_override =
          EXCLUDED.ip_limit_override,

        is_active =
          EXCLUDED.is_active,

        available_from =
          EXCLUDED.available_from,

        available_until =
          EXCLUDED.available_until,

        updated_at = NOW()`,
      [
        serverId,
        planId,

        offerValue(
          'flatPrice',
          'flat_price',
        ),

        offerValue(
          'offerPricePerGB',
          'price_per_gb',
        ),

        offerValue(
          'trafficGBOverride',
          'traffic_gb_override',
        ),

        offerValue(
          'durationDaysOverride',
          'duration_days_override',
        ),

        offerValue(
          'ipLimitOverride',
          'ip_limit_override',
        ),

        Object.prototype
          .hasOwnProperty.call(
            input,
            'isOfferActive',
          )
          ? input.isOfferActive
          : currentOffer?.is_active ??
            true,

        offerValue(
          'availableFrom',
          'available_from',
        ),

        offerValue(
          'availableUntil',
          'available_until',
        ),
      ],
    );
  });

  return getPlanById(planId);
}

export async function setPlanStatus(planId: string, isActive: boolean) {
  await query(
    `UPDATE plans
     SET is_active = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [planId, isActive],
  );

  return getPlanById(planId);
}

export async function deletePlan(planId: string) {
  return transaction(async (client) => {
    const planRes = await client.query('SELECT * FROM plans WHERE id=$1', [planId]);
    const plan = planRes.rows[0];

    if (!plan) throw new AppError(404, 'پلن یافت نشد', 'PLAN_NOT_FOUND');

    const usage = await client.query(
      `SELECT
        (SELECT COUNT(*)::int FROM end_users WHERE plan_id=$1) AS end_users_count,
        (SELECT COUNT(*)::int FROM orders WHERE plan_id=$1) AS orders_count,
        (SELECT COUNT(*)::int FROM customer_specific_prices WHERE plan_id=$1) AS custom_prices_count`,
      [planId],
    );

    const endUsersCount = Number(usage.rows[0]?.end_users_count || 0);
    const ordersCount = Number(usage.rows[0]?.orders_count || 0);
    const customPricesCount = Number(usage.rows[0]?.custom_prices_count || 0);

    if (endUsersCount > 0 || ordersCount > 0 || customPricesCount > 0) {
      throw new AppError(
        400,
        'این پلن در سفارش‌ها، کاربران یا قیمت‌گذاری اختصاصی استفاده شده و قابل حذف کامل نیست. می‌توانید آن را غیرفعال کنید.',
        'PLAN_HAS_HISTORY',
      );
    }

    await client.query('DELETE FROM plans WHERE id=$1', [planId]);

    return { deleted: true };
  });
}

export async function calculatePrice(
  planId: string,
  customerId: string,
  serverId?: string,
  requestedMode?: PricingMode,
) {
  const planRes = await query<any>(
    `SELECT *
     FROM plans
     WHERE id = $1
       AND is_active = true`,
    [planId],
  );

  const plan = planRes.rows[0];

  if (!plan) {
    throw new AppError(
      404,
      'پلن یافت نشد',
      'PLAN_NOT_FOUND',
    );
  }

  const customerRes = await query<any>(
    `SELECT
       allowed_server_ids,
       allowed_inbound_ids,
       allowed_plan_ids,
       is_active
     FROM wholesale_customers
     WHERE id = $1`,
    [customerId],
  );

  const customer = customerRes.rows[0];

  if (!customer) {
    throw new AppError(
      404,
      'مشتری یافت نشد',
      'CUSTOMER_NOT_FOUND',
    );
  }

  if (!customer.is_active) {
    throw new AppError(
      403,
      'حساب مشتری غیرفعال است',
      'CUSTOMER_DISABLED',
    );
  }

  const allowedPlanIds =
    uniqueStrings(
      customer.allowed_plan_ids,
    );

  if (
    allowedPlanIds.length > 0 &&
    !allowedPlanIds.includes(planId)
  ) {
    throw new AppError(
      403,
      'این پلن برای حساب شما مجاز نیست',
      'PLAN_ACCESS_DENIED',
    );
  }

  const planScope: PricingMode =
    plan.scope === 'server'
      ? 'server'
      : 'global';

  const mode: PricingMode =
    requestedMode === 'server'
      ? 'server'
      : requestedMode === 'global'
        ? 'global'
        : planScope;

  if (planScope !== mode) {
    throw new AppError(
      400,
      mode === 'server'
        ? 'پلن انتخاب‌شده اختصاصی این سرور نیست'
        : 'پلن اختصاصی سرور را نمی‌توان به‌عنوان پلن عادی استفاده کرد',
      'PLAN_PRICING_MODE_MISMATCH',
    );
  }

  let server: any = null;

  if (serverId) {
    const serverRes = await query<any>(
      `SELECT *
       FROM servers
       WHERE id = $1`,
      [serverId],
    );

    server = serverRes.rows[0];

    if (!server) {
      throw new AppError(
        404,
        'سرور یافت نشد',
        'SERVER_NOT_FOUND',
      );
    }

    if (server.is_active === false) {
      throw new AppError(
        403,
        'این سرور غیرفعال است',
        'SERVER_DISABLED',
      );
    }

    if (
      server.health_status ===
      'unhealthy'
    ) {
      throw new AppError(
        503,
        'این سرور در حال حاضر آماده ساخت کانفیگ نیست',
        'SERVER_UNHEALTHY',
      );
    }

    const allowedServerIds =
      uniqueStrings(
        customer.allowed_server_ids,
      );

    if (
      allowedServerIds.length > 0 &&
      !allowedServerIds.includes(serverId)
    ) {
      throw new AppError(
        403,
        'این سرور برای حساب شما مجاز نیست',
        'SERVER_ACCESS_DENIED',
      );
    }
  }

  let offer: any = null;

  if (mode === 'server') {
    if (!serverId) {
      throw new AppError(
        400,
        'برای پلن اختصاصی، انتخاب سرور لازم است',
        'SERVER_REQUIRED_FOR_PLAN',
      );
    }

    const offerRes = await query<any>(
      `SELECT *
       FROM server_plan_offers
       WHERE plan_id = $1
         AND server_id = $2
         AND is_active = true
         AND (
           available_from IS NULL
           OR available_from <= NOW()
         )
         AND (
           available_until IS NULL
           OR available_until > NOW()
         )
       LIMIT 1`,
      [planId, serverId],
    );

    offer = offerRes.rows[0];

    if (!offer) {
      throw new AppError(
        400,
        'پلن انتخاب‌شده برای این سرور معتبر نیست',
        'PLAN_NOT_ALLOWED_FOR_SERVER',
      );
    }
  }

  const customRes = await query<any>(
    `SELECT *
     FROM customer_specific_prices
     WHERE wholesale_customer_id = $1
       AND plan_id = $2`,
    [customerId, planId],
  );

  const customPrice =
    customRes.rows[0];

  const trafficGB = Number(
    offer?.traffic_gb_override ??
      plan.traffic_gb,
  );

  const durationDays = Number(
    offer?.duration_days_override ??
      plan.duration_days,
  );

  const ipLimit = Number(
    offer?.ip_limit_override ??
      plan.ip_limit ??
      0,
  );

  let pricePerGb = Number(
    offer?.price_per_gb ??
      plan.price_per_gb,
  );

  let finalPrice: number;
  let pricingSource: string;

  if (offer?.flat_price != null) {
    finalPrice =
      Number(offer.flat_price);

    pricingSource =
      'server_plan_offer';
  } else if (
    offer?.price_per_gb != null
  ) {
    finalPrice =
      trafficGB * pricePerGb;

    pricingSource =
      'server_plan_offer';
  } else {
    finalPrice =
      Number(plan.base_price);

    pricingSource = 'plan';
  }

  if (customPrice?.flat_price != null) {
    finalPrice =
      Number(customPrice.flat_price);

    pricingSource =
      'customer_specific_price';
  } else if (
    customPrice?.price_per_gb != null
  ) {
    pricePerGb =
      Number(
        customPrice.price_per_gb,
      );

    finalPrice =
      trafficGB * pricePerGb;

    pricingSource =
      'customer_specific_price';
  }

  if (
    customPrice?.discount_percent !=
    null
  ) {
    finalPrice = Math.round(
      finalPrice *
        (
          1 -
          Number(
            customPrice.discount_percent,
          ) /
            100
        ),
    );

    pricingSource =
      'customer_specific_price';
  }

  return {
    plan: {
      ...plan,
      traffic_gb: trafficGB,
      duration_days: durationDays,
      ip_limit: ipLimit,
      base_price: finalPrice,
      price_per_gb: pricePerGb,
      server_plan_offer_id:
        offer?.id ?? null,
    },

    finalPrice,
    pricePerGb,

    pricingMode: mode,
    pricingSource,

    serverPlanOfferId:
      offer?.id ?? null,

    offer,
    server,
  };
}

export async function listAvailablePlans(
  customerId: string,
  options: {
    serverId?: string;
    pricingMode?: PricingMode;
  } = {},
) {
  const pricingMode: PricingMode =
    options.pricingMode === 'server'
      ? 'server'
      : 'global';

  if (
    pricingMode === 'server' &&
    !options.serverId
  ) {
    return [];
  }

  const customerRes = await query<any>(
    `SELECT
       allowed_plan_ids,
       is_active
     FROM wholesale_customers
     WHERE id = $1`,
    [customerId],
  );

  const customer = customerRes.rows[0];

  if (!customer?.is_active) {
    return [];
  }

  const allowedPlanIds =
    uniqueStrings(
      customer.allowed_plan_ids,
    );

  let planIds: string[] = [];

  if (pricingMode === 'server') {
    const result = await query<any>(
      `SELECT p.id
       FROM plans p
       JOIN server_plan_offers spo
         ON spo.plan_id = p.id
       WHERE p.scope = 'server'
         AND p.is_active = true
         AND spo.server_id = $1
         AND spo.is_active = true
         AND (
           spo.available_from IS NULL
           OR spo.available_from <= NOW()
         )
         AND (
           spo.available_until IS NULL
           OR spo.available_until > NOW()
         )
       ORDER BY p.traffic_gb`,
      [options.serverId],
    );

    planIds = result.rows.map(
      (row: any) =>
        String(row.id),
    );
  } else {
    const result = await query<any>(
      `SELECT id
       FROM plans
       WHERE COALESCE(scope, 'global') =
             'global'
         AND is_active = true
       ORDER BY traffic_gb`,
    );

    planIds = result.rows.map(
      (row: any) =>
        String(row.id),
    );
  }

  if (allowedPlanIds.length > 0) {
    planIds = planIds.filter(
      (id) =>
        allowedPlanIds.includes(id),
    );
  }

  const result = [];

  for (const id of planIds) {
    const quote = await calculatePrice(
      id,
      customerId,
      options.serverId,
      pricingMode,
    );

    result.push({
      ...quote.plan,

      final_price:
        quote.finalPrice,

      final_price_per_gb:
        quote.pricePerGb,

      pricing_mode:
        quote.pricingMode,

      pricing_source:
        quote.pricingSource,

      server_plan_offer_id:
        quote.serverPlanOfferId,
    });
  }

  return result;
}

export async function previewPlanAccess(
  input: {
    planId?: string;
    scope: PricingMode;
    serverId?: string;
    allowedInboundIds?: string[];
  },
) {
  let allowedInboundIds =
    uniqueStrings(
      input.allowedInboundIds,
    );

  if (
    input.planId &&
    input.allowedInboundIds === undefined
  ) {
    const planRes = await query<any>(
      `SELECT allowed_inbound_ids
       FROM plans
       WHERE id = $1`,
      [input.planId],
    );

    allowedInboundIds =
      uniqueStrings(
        planRes.rows[0]
          ?.allowed_inbound_ids,
      );
  }

  const serverRes =
    input.scope === 'server'
      ? await query<any>(
          `SELECT
             id,
             name,
             host,
             service_type,
             is_active,
             health_status
           FROM servers
           WHERE id = $1
           ORDER BY name`,
          [input.serverId],
        )
      : await query<any>(
          `SELECT
             id,
             name,
             host,
             service_type,
             is_active,
             health_status
           FROM servers
           ORDER BY name`,
        );

  const servers = serverRes.rows;

  const serverIds = servers.map(
    (server: any) =>
      String(server.id),
  );

  const inboundRes =
    serverIds.length > 0
      ? await query<any>(
          `SELECT
             id,
             server_id,
             name,
             protocol,
             port,
             is_active
           FROM inbounds
           WHERE server_id =
             ANY($1::uuid[])
           ORDER BY server_id, name`,
          [serverIds],
        )
      : { rows: [] };

  const inbounds =
    inboundRes.rows.filter(
      (inbound: any) =>
        allowedInboundIds.length === 0 ||
        allowedInboundIds.includes(
          String(inbound.id),
        ),
    );

  const customerRes = await query<any>(
    `SELECT
       wc.id,
       wc.company_name,
       wc.is_active,
       wc.allowed_server_ids,
       wc.allowed_inbound_ids,
       wc.allowed_plan_ids,
       u.username,
       u.email
     FROM wholesale_customers wc
     JOIN users u
       ON u.id = wc.user_id
     ORDER BY
       wc.company_name NULLS LAST,
       u.username`,
  );

  const customers =
    customerRes.rows.map(
      (customer: any) => {
        const reasons: string[] = [];

        const customerServerIds =
          uniqueStrings(
            customer.allowed_server_ids,
          );

        const customerInboundIds =
          uniqueStrings(
            customer.allowed_inbound_ids,
          );

        const customerPlanIds =
          uniqueStrings(
            customer.allowed_plan_ids,
          );

        const planAllowed =
          customerPlanIds.length === 0 ||
          (
            Boolean(input.planId) &&
            customerPlanIds.includes(
              String(input.planId),
            )
          );

        if (!customer.is_active) {
          reasons.push(
            'CUSTOMER_DISABLED',
          );
        }

        if (!planAllowed) {
          reasons.push(
            'PLAN_NOT_ALLOWED',
          );
        }

        const visibleServers =
          servers.filter(
            (server: any) => {
              if (
                server.is_active === false ||
                server.health_status ===
                  'unhealthy'
              ) {
                return false;
              }

              if (
                customerServerIds.length >
                  0 &&
                !customerServerIds.includes(
                  String(server.id),
                )
              ) {
                return false;
              }

              return inbounds.some(
                (inbound: any) =>
                  String(
                    inbound.server_id,
                  ) ===
                    String(server.id) &&
                  inbound.is_active !==
                    false &&
                  (
                    customerInboundIds
                      .length === 0 ||
                    customerInboundIds
                      .includes(
                        String(
                          inbound.id,
                        ),
                      )
                  ),
              );
            },
          );

        if (!visibleServers.length) {
          reasons.push(
            'NO_ACCESSIBLE_SERVER_OR_INBOUND',
          );
        }

        return {
          id: customer.id,
          companyName:
            customer.company_name,
          username:
            customer.username,
          email: customer.email,

          visible:
            customer.is_active &&
            planAllowed &&
            visibleServers.length > 0,

          visibleServers:
            visibleServers.map(
              (server: any) => ({
                id: server.id,
                name: server.name,
                serviceType:
                  server.service_type,
              }),
            ),

          reasons,
        };
      },
    );

  return {
    scope: input.scope,
    servers: servers.map(
      (server: any) => ({
        ...server,
        availableForNewOrders:
          server.is_active !== false &&
          server.health_status !==
            'unhealthy',
      }),
    ),
    inbounds,
    customers,
    summary: {
      servers: servers.length,
      inbounds: inbounds.length,
      visibleCustomers:
        customers.filter(
          (customer: any) =>
            customer.visible,
        ).length,
      blockedCustomers:
        customers.filter(
          (customer: any) =>
            !customer.visible,
        ).length,
    },
  };
}

export async function listCustomerPrices(customerId: string) {
  const customerRes = await query<any>(
    `SELECT wc.*, u.username, u.email
     FROM wholesale_customers wc
     JOIN users u ON u.id = wc.user_id
     WHERE wc.id = $1`,
    [customerId],
  );

  const customer = customerRes.rows[0];

  if (!customer) {
    throw new AppError(404, 'مشتری یافت نشد', 'CUSTOMER_NOT_FOUND');
  }

  const plansRes = await query<any>(
    `SELECT
      p.*,
      cp.id AS customer_price_id,
      cp.price_per_gb AS custom_price_per_gb,
      cp.flat_price AS custom_flat_price,
      cp.discount_percent AS custom_discount_percent
    FROM plans p
    LEFT JOIN customer_specific_prices cp
      ON cp.plan_id = p.id
     AND cp.wholesale_customer_id = $1
    ORDER BY p.traffic_gb ASC`,
    [customerId],
  );

  const rows = plansRes.rows.map((row: any) => {
    let finalPrice = Number(row.base_price);
    let pricePerGb = Number(row.price_per_gb);

    if (row.custom_flat_price != null) {
      finalPrice = Number(row.custom_flat_price);
    } else if (row.custom_price_per_gb != null) {
      pricePerGb = Number(row.custom_price_per_gb);
      finalPrice = Number(row.traffic_gb) * pricePerGb;
    }

    if (row.custom_discount_percent != null) {
      finalPrice = Math.round(finalPrice * (1 - Number(row.custom_discount_percent) / 100));
    }

    return {
      ...row,
      final_price: finalPrice,
      final_price_per_gb: pricePerGb,
      has_custom_price: row.customer_price_id != null,
    };
  });

  return { customer, plans: rows };
}

export async function upsertCustomerPrice(customerId: string, planId: string, input: any) {
  const customerRes = await query<any>('SELECT id FROM wholesale_customers WHERE id=$1', [customerId]);
  if (!customerRes.rows[0]) {
    throw new AppError(404, 'مشتری یافت نشد', 'CUSTOMER_NOT_FOUND');
  }

  const planRes = await query<any>('SELECT id FROM plans WHERE id=$1', [planId]);
  if (!planRes.rows[0]) {
    throw new AppError(404, 'پلن یافت نشد', 'PLAN_NOT_FOUND');
  }

  const pricePerGB = input.pricePerGB ?? null;
  const flatPrice = input.flatPrice ?? null;
  const discountPercent = input.discountPercent ?? null;

  if (pricePerGB == null && flatPrice == null && discountPercent == null) {
    await query(
      'DELETE FROM customer_specific_prices WHERE wholesale_customer_id=$1 AND plan_id=$2',
      [customerId, planId],
    );

    return { deleted: true };
  }

  const res = await query<any>(
    `INSERT INTO customer_specific_prices (
      wholesale_customer_id,
      plan_id,
      price_per_gb,
      flat_price,
      discount_percent
    )
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (wholesale_customer_id, plan_id)
    DO UPDATE SET
      price_per_gb = EXCLUDED.price_per_gb,
      flat_price = EXCLUDED.flat_price,
      discount_percent = EXCLUDED.discount_percent,
      updated_at = NOW()
    RETURNING *`,
    [customerId, planId, pricePerGB, flatPrice, discountPercent],
  );

  return res.rows[0];
}

export async function deleteCustomerPrice(customerId: string, planId: string) {
  await query(
    'DELETE FROM customer_specific_prices WHERE wholesale_customer_id=$1 AND plan_id=$2',
    [customerId, planId],
  );

  return { deleted: true };
}
