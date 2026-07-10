import { nanoid } from 'nanoid';
import { query, transaction } from '../db/pool.js';
import { AppError } from '../middleware/error.middleware.js';
import { calculatePrice } from './pricing.service.js';
import { getServer } from './server.service.js';
import { threeXUIService } from './threexui.service.js';

const DAY_PRICE = 1000;
const GB_PRICE = 20000;
const DAY_MS = 86400_000;

function gbToBytes(gb: number) {
  return Math.round(Number(gb || 0) * 1024 * 1024 * 1024);
}

function bytesToGB(bytes: number) {
  return Number(bytes || 0) / 1024 / 1024 / 1024;
}

function futureExpiry(currentExpiry: Date, addDays: number) {
  const base = currentExpiry.getTime() > Date.now() ? currentExpiry.getTime() : Date.now();
  return new Date(base + addDays * DAY_MS);
}

async function getOwnedEndUser(customerId: string, endUserId: string) {
  const res = await query<any>(
    `SELECT eu.*, i.threexui_inbound_id, i.protocol, s.id AS real_server_id
     FROM end_users eu
     JOIN inbounds i ON i.id = eu.inbound_id
     JOIN servers s ON s.id = eu.server_id
     WHERE eu.id=$1
       AND eu.wholesale_customer_id=$2
       AND eu.deleted_at IS NULL`,
    [endUserId, customerId],
  );

  const endUser = res.rows[0];

  if (!endUser) {
    throw new AppError(404, 'کاربر پیدا نشد', 'END_USER_NOT_FOUND');
  }

  return endUser;
}

async function debitWallet(client: any, customerId: string, amount: number, description: string, orderId?: string | null) {
  if (amount <= 0) return null;

  const walletRes = await client.query(
    'SELECT * FROM wallets WHERE wholesale_customer_id=$1 FOR UPDATE',
    [customerId],
  );

  const wallet = walletRes.rows[0];

  if (!wallet) {
    throw new AppError(404, 'کیف پول یافت نشد', 'WALLET_NOT_FOUND');
  }

  const before = Number(wallet.balance);

  if (before < amount) {
    throw new AppError(400, 'موجودی کیف پول کافی نیست', 'INSUFFICIENT_BALANCE');
  }

  const after = before - amount;

  await client.query('UPDATE wallets SET balance=$1 WHERE id=$2', [after, wallet.id]);

  const tx = await client.query(
    `INSERT INTO wallet_transactions
      (wallet_id,type,amount,balance_before,balance_after,description,order_id,created_by,status,idempotency_key,metadata)
     VALUES
      ($1,'debit',$2,$3,$4,$5,$6,NULL,'completed',$7,$8)
     RETURNING *`,
    [
      wallet.id,
      amount,
      before,
      after,
      description,
      orderId || null,
      `debit:end-user:${nanoid(18)}`,
      JSON.stringify({ source: 'end_user_action' }),
    ],
  );

  return tx.rows[0];
}

export async function renewEndUser(
  customerId: string,
  endUserId: string,
  input: { planId?: string; customDays?: number; customGB?: number },
) {
  const endUser = await getOwnedEndUser(customerId, endUserId);

  let planId = input.planId || endUser.plan_id;
  let addDays = 0;
  let addGB = 0;
  let pricePerGb = GB_PRICE;
  let totalPrice = 0;

  if (input.planId) {
    const price = await calculatePrice(input.planId, customerId);
    addDays = Number(price.plan.duration_days);
    addGB = Number(price.plan.traffic_gb);
    pricePerGb = Number(price.pricePerGb || GB_PRICE);
    totalPrice = Number(price.finalPrice);
    planId = input.planId;
  } else {
    addDays = Number(input.customDays || 0);
    addGB = Number(input.customGB || 0);

    if (addDays <= 0 && addGB <= 0) {
      throw new AppError(400, 'حداقل روز یا حجم برای تمدید وارد کنید', 'BAD_RENEW_INPUT');
    }

    totalPrice = addDays * DAY_PRICE + addGB * GB_PRICE;
  }

  const currentExpiry = new Date(endUser.expiry_time);
  const newExpiry = futureExpiry(currentExpiry, addDays);
  const newTrafficLimit = Number(endUser.traffic_limit) + gbToBytes(addGB);

  const server = await getServer(endUser.server_id);

  const xuiResponse = await threeXUIService.updateClient(
    server,
    Number(endUser.threexui_inbound_id),
    endUser.threexui_client_id,
    {
      enable: true,
      totalGB: newTrafficLimit,
      expiryTime: newExpiry.getTime(),
    },
  );

  return transaction(async (client) => {
    const orderRes = await client.query(
      `INSERT INTO orders
        (wholesale_customer_id,type,end_user_id,plan_id,server_id,inbound_id,traffic_gb,duration_days,price_per_gb,total_price,status,threexui_response,idempotency_key)
       VALUES
        ($1,'renew',$2,$3,$4,$5,$6,$7,$8,$9,'completed',$10,$11)
       RETURNING *`,
      [
        customerId,
        endUser.id,
        planId,
        endUser.server_id,
        endUser.inbound_id,
        addGB,
        addDays,
        pricePerGb,
        totalPrice,
        JSON.stringify(xuiResponse),
        `renew:${endUser.id}:${nanoid(16)}`,
      ],
    );

    const order = orderRes.rows[0];

    await debitWallet(client, customerId, totalPrice, `تمدید کاربر ${endUser.email}`, order.id);

    const updated = await client.query(
      `UPDATE end_users
       SET traffic_limit=$1,
           expiry_time=$2,
           plan_id=$3,
           is_active=true,
           status='active',
           updated_at=now()
       WHERE id=$4
       RETURNING *`,
      [newTrafficLimit, newExpiry, planId, endUser.id],
    );

    return {
      order,
      endUser: updated.rows[0],
      chargedAmount: totalPrice,
    };
  });
}

export async function updateEndUser(
  customerId: string,
  endUserId: string,
  input: { addDays?: number; addTrafficGB?: number; isActive?: boolean },
) {
  const endUser = await getOwnedEndUser(customerId, endUserId);

  const addDays = Math.max(0, Number(input.addDays || 0));
  const addGB = Math.max(0, Number(input.addTrafficGB || 0));
  const extraPrice = addDays * DAY_PRICE + addGB * GB_PRICE;

  const currentExpiry = new Date(endUser.expiry_time);
  const newExpiry = addDays > 0 ? futureExpiry(currentExpiry, addDays) : currentExpiry;
  const newTrafficLimit = Number(endUser.traffic_limit) + gbToBytes(addGB);
  const isActive = input.isActive === undefined ? Boolean(endUser.is_active) : Boolean(input.isActive);

  const server = await getServer(endUser.server_id);

  const xuiResponse = await threeXUIService.updateClient(
    server,
    Number(endUser.threexui_inbound_id),
    endUser.threexui_client_id,
    {
      enable: isActive,
      totalGB: newTrafficLimit,
      expiryTime: newExpiry.getTime(),
    },
  );

  return transaction(async (client) => {
    let order = null;

    if (extraPrice > 0) {
      const orderRes = await client.query(
        `INSERT INTO orders
          (wholesale_customer_id,type,end_user_id,plan_id,server_id,inbound_id,traffic_gb,duration_days,price_per_gb,total_price,status,threexui_response,idempotency_key)
         VALUES
          ($1,'upgrade',$2,$3,$4,$5,$6,$7,$8,$9,'completed',$10,$11)
         RETURNING *`,
        [
          customerId,
          endUser.id,
          endUser.plan_id,
          endUser.server_id,
          endUser.inbound_id,
          addGB,
          addDays,
          GB_PRICE,
          extraPrice,
          JSON.stringify(xuiResponse),
          `edit:${endUser.id}:${nanoid(16)}`,
        ],
      );

      order = orderRes.rows[0];
      await debitWallet(client, customerId, extraPrice, `ویرایش کاربر ${endUser.email}`, order.id);
    }

    const updated = await client.query(
      `UPDATE end_users
       SET traffic_limit=$1,
           expiry_time=$2,
           is_active=$3,
           status=$4,
           updated_at=now()
       WHERE id=$5
       RETURNING *`,
      [newTrafficLimit, newExpiry, isActive, isActive ? 'active' : 'disabled', endUser.id],
    );

    return {
      order,
      endUser: updated.rows[0],
      chargedAmount: extraPrice,
    };
  });
}

export async function deleteEndUser(customerId: string, endUserId: string) {
  const endUser = await getOwnedEndUser(customerId, endUserId);
  const server = await getServer(endUser.server_id);

  const xuiResponse = await threeXUIService.deleteClient(
    server,
    Number(endUser.threexui_inbound_id),
    endUser.threexui_client_id,
  );

  const updated = await query<any>(
    `UPDATE end_users
     SET is_active=false,
         status='disabled',
         deleted_at=now(),
         updated_at=now()
     WHERE id=$1
     RETURNING *`,
    [endUser.id],
  );

  return {
    endUser: updated.rows[0],
    threexuiResponse: xuiResponse,
  };
}

export async function setEndUserPayment(
  customerId: string,
  endUserId: string,
  input: { paid: boolean; note?: string },
) {
  const endUser = await getOwnedEndUser(customerId, endUserId);

  const updated = await query<any>(
    `UPDATE end_users
     SET customer_paid=$1,
         customer_paid_at=CASE WHEN $1 THEN now() ELSE NULL END,
         customer_paid_note=$2,
         updated_at=now()
     WHERE id=$3
     RETURNING *`,
    [Boolean(input.paid), input.note || null, endUser.id],
  );

  return updated.rows[0];
}
