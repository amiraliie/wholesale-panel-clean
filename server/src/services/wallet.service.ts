import { query, transaction } from '../db/pool.js';
import { AppError } from '../middleware/error.middleware.js';

export async function getWallet(customerId: string) {
  const res = await query<any>(
    `SELECT
      w.*,
      wc.company_name,
      wc.telegram_id,
      wc.min_balance,
      wc.credit_limit,
      wc.is_active AS customer_is_active,
      u.username,
      u.email
    FROM wallets w
    JOIN wholesale_customers wc ON wc.id = w.wholesale_customer_id
    JOIN users u ON u.id = wc.user_id
    WHERE w.wholesale_customer_id = $1`,
    [customerId],
  );

  if (!res.rows[0]) throw new AppError(404, 'کیف پول یافت نشد', 'WALLET_NOT_FOUND');

  return res.rows[0];
}

export async function listWalletTransactions(customerId: string) {
  const wallet = await getWallet(customerId);
  const res = await query<any>('SELECT * FROM wallet_transactions WHERE wallet_id=$1 ORDER BY created_at DESC LIMIT 200', [wallet.id]);
  return res.rows;
}

export async function creditWallet(customerId: string, amount: number, description: string, createdBy: string) {
  if (amount <= 0) throw new AppError(400, 'مبلغ باید مثبت باشد', 'BAD_AMOUNT');
  return transaction(async (client) => {
    const w = await client.query<any>('SELECT * FROM wallets WHERE wholesale_customer_id=$1 FOR UPDATE', [customerId]);
    const wallet = w.rows[0];
    if (!wallet) throw new AppError(404, 'کیف پول یافت نشد', 'WALLET_NOT_FOUND');
    const before = Number(wallet.balance);
    const after = before + amount;
    await client.query('UPDATE wallets SET balance=$1 WHERE id=$2', [after, wallet.id]);
    const tx = await client.query<any>(`INSERT INTO wallet_transactions (wallet_id,type,amount,balance_before,balance_after,description,created_by,status,idempotency_key)
      VALUES ($1,'credit',$2,$3,$4,$5,$6,'completed',$7) RETURNING *`, [wallet.id, amount, before, after, description, createdBy, `credit:${customerId}:${Date.now()}`]);
    return tx.rows[0];
  });
}


export async function debitWallet(customerId: string, amount: number, description: string, createdBy: string) {
  if (amount <= 0) throw new AppError(400, 'مبلغ باید مثبت باشد', 'BAD_AMOUNT');

  return transaction(async (client) => {
    const w = await client.query<any>('SELECT * FROM wallets WHERE wholesale_customer_id=$1 FOR UPDATE', [customerId]);
    const wallet = w.rows[0];

    if (!wallet) throw new AppError(404, 'کیف پول یافت نشد', 'WALLET_NOT_FOUND');

    const before = Number(wallet.balance);

    if (amount > before) {
      throw new AppError(400, 'مبلغ کاهش نمی‌تواند بیشتر از موجودی فعلی باشد', 'INSUFFICIENT_WALLET_BALANCE');
    }

    const after = before - amount;

    await client.query('UPDATE wallets SET balance=$1 WHERE id=$2', [after, wallet.id]);

    const tx = await client.query<any>(
      `INSERT INTO wallet_transactions
        (wallet_id,type,amount,balance_before,balance_after,description,created_by,status,idempotency_key)
       VALUES ($1,'debit',$2,$3,$4,$5,$6,'completed',$7)
       RETURNING *`,
      [wallet.id, amount, before, after, description, createdBy, `debit:${customerId}:${Date.now()}`],
    );

    return tx.rows[0];
  });
}
