// LINE Pay checkout for the OAW subscription (month / year) and quota top-ups, and the daily
// renewal reminders. Same store settings as the build payment (linepay-client.ts); grants
// happen only in line_oa_kit_quota_order_settle, once, and only for production payments.
import { checkoutUrl, linePay, payConfig, verifiedPayment } from './linepay-client.ts';

export const BILLING_ACTIONS = ['sub_status', 'sub_create', 'sub_confirm'];
export const PRODUCTS: Record<string, { amount: number; name: string }> = {
  month: { amount: 370, name: 'Aprico AI 秘書月費（1 個月）' },
  year: { amount: 3870, name: 'Aprico AI 秘書年費（12 個月）' },
  topup30: { amount: 30, name: 'Aprico AI 秘書加值 NT$30' },
  topup50: { amount: 50, name: 'Aprico AI 秘書加值 NT$50' },
};
const BUILD_PAGE = 'https://ptgaminglife.github.io/Aprico-LINE-OA-KIT/build.html';
export const RENEW_URL = 'https://liff.line.me/2012197506-Vmb4O5iT/build.html?renew=1';
const table = 'line_oa_kit_quota_orders';
type Respond = (data: unknown, status?: number) => Response;

const publicOrder = (o: any) =>
  o && {
    id: o.id,
    product: o.product,
    amount: o.amount,
    status: o.status,
    paymentUrl: o.status === 'pending' ? checkoutUrl(o.payment_url, o.environment) : null,
  };

export async function billingAction(
  b: any,
  db: any,
  subject: string,
  respond: Respond,
  env: (k: string) => string | undefined,
  fetcher: typeof fetch = fetch,
) {
  const config = payConfig(env);
  const { data: quota } = await db.rpc('line_oa_kit_quota_status', { p_subject: subject });
  const status = quota?.paid === true ? quota : { paid: false };
  if (b.action === 'sub_status') {
    const { data: last } = await db
      .from(table)
      .select('*')
      .eq('line_subject', subject)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return respond({
      quota: status,
      available: config.enabled,
      mode: config.mode,
      order: publicOrder(last),
      products: PRODUCTS,
    });
  }
  if (!config.enabled) return respond({ error: 'LINE Pay 尚未開放，請聯絡 Aprico' }, 503);

  if (b.action === 'sub_create') {
    const product = PRODUCTS[b.product];
    if (!product) return respond({ error: '方案不存在' }, 400);
    if (b.product.startsWith('topup') && !status.paid)
      return respond({ error: '加值需要先有訂閱', code: 'subscription_required' }, 409);
    const { data: order, error } = await db
      .from(table)
      .insert({
        line_subject: subject,
        product: b.product,
        amount: product.amount,
        environment: config.mode,
      })
      .select('*')
      .single();
    if (error) return respond({ error: '無法建立訂單，請稍後再試' }, 503);
    const back = new URL(BUILD_PAGE);
    back.searchParams.set('pay', 'sub');
    back.searchParams.set('order', order.id);
    const cancel = new URL(back);
    cancel.searchParams.set('pay', 'sub-cancel');
    try {
      const r = await linePay(
        config,
        '/v4/payments/request',
        {
          amount: product.amount,
          currency: 'TWD',
          orderId: order.id,
          packages: [
            {
              id: 'subscription',
              amount: product.amount,
              products: [{ id: b.product, name: product.name, quantity: 1, price: product.amount }],
            },
          ],
          options: { payment: { capture: true } },
          redirectUrls: { confirmUrl: back.href, cancelUrl: cancel.href },
        },
        '',
        fetcher,
      );
      const url = checkoutUrl(r.info?.paymentUrl?.web, config.mode),
        tx = String(r.info?.transactionId || '');
      if (r.returnCode !== '0000' || !url || !/^\d{16,20}$/.test(tx)) throw Error('request_failed');
      const saved = await db
        .from(table)
        .update({
          status: 'pending',
          transaction_id: tx,
          payment_url: url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id)
        .eq('status', 'requesting')
        .select('*')
        .single();
      if (saved.error) throw Error('audit_failed');
      return respond({ order: publicOrder(saved.data) });
    } catch {
      await db
        .from(table)
        .update({ status: 'unknown' })
        .eq('id', order.id)
        .eq('status', 'requesting');
      return respond(
        { error: '建立付款失敗，請勿重複付款；若已扣款請聯絡 Aprico，訂單 ' + order.id },
        503,
      );
    }
  }

  if (b.action === 'sub_confirm') {
    if (typeof b.orderId !== 'string' || !/^[0-9a-f-]{36}$/.test(b.orderId))
      return respond({ error: '訂單不存在' }, 400);
    const { data: order } = await db
      .from(table)
      .select('*')
      .eq('id', b.orderId)
      .eq('line_subject', subject)
      .maybeSingle();
    if (!order) return respond({ error: '訂單不存在' }, 404);
    if (['paid', 'test_paid', 'cancelled'].includes(order.status))
      return respond({ order: publicOrder(order), quota: status });
    if (!order.transaction_id)
      return respond({ error: '訂單需由 Aprico 核對，訂單 ' + order.id }, 409);
    try {
      const claimed = await db
        .from(table)
        .update({ status: 'confirming', updated_at: new Date().toISOString() })
        .eq('id', order.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
      if (claimed.data) {
        const check = await linePay(
          config,
          `/v4/payments/requests/${order.transaction_id}/check`,
          null,
          '',
          fetcher,
        );
        if (check.returnCode === '0121') {
          await db
            .from(table)
            .update({ status: 'cancelled' })
            .eq('id', order.id)
            .eq('status', 'confirming');
          return respond({ order: publicOrder({ ...order, status: 'cancelled' }), quota: status });
        }
        if (check.returnCode === '0110')
          await linePay(
            config,
            `/v4/payments/${order.transaction_id}/confirm`,
            { amount: order.amount, currency: 'TWD' },
            '',
            fetcher,
          );
        else if (check.returnCode !== '0123') {
          await db
            .from(table)
            .update({ status: 'pending' })
            .eq('id', order.id)
            .eq('status', 'confirming');
          return respond({ error: 'LINE Pay 尚未完成付款，請先在付款頁完成' }, 409);
        }
      }
      // Grant only after LINE Pay itself reports a completed payment for this order.
      const r = await linePay(
        config,
        '/v4/payments',
        null,
        'transactionId=' + encodeURIComponent(order.transaction_id),
        fetcher,
      );
      const ok =
        r.returnCode === '0000' &&
        Array.isArray(r.info) &&
        r.info.some((d: any) => verifiedPayment(d, order));
      if (!ok)
        return respond(
          { error: '還沒核對到成功的付款，請勿重複付款，稍後再按一次「核對付款」' },
          409,
        );
      const settled = await db.rpc('line_oa_kit_quota_order_settle', {
        p_order: order.id,
        p_subject: subject,
        p_transaction: order.transaction_id,
      });
      if (settled.error || settled.data?.error)
        return respond(
          { error: '已付款，開通待同步；請勿重付，聯絡 Aprico 並提供訂單 ' + order.id },
          503,
        );
      const { data: fresh } = await db.rpc('line_oa_kit_quota_status', { p_subject: subject });
      return respond({
        order: publicOrder({ ...order, status: settled.data.status }),
        quota: fresh,
      });
    } catch {
      return respond({ error: '付款結果待核對，請勿重複付款，稍後再按一次「核對付款」' }, 503);
    }
  }
  return respond({ error: '不支援的操作' }, 400);
}

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function reminderCard(kind: 'soon' | 'due', paidUntil: string) {
  const title = kind === 'soon' ? '月費即將到期' : '月費今天到期';
  const body =
    kind === 'soon'
      ? `你的 AI 秘書訂閱到 ${paidUntil}。續訂後，官方帳號的 AI 秘書與每日整理會繼續運作。`
      : `你的 AI 秘書訂閱今天（${paidUntil}）到期。續訂後就能繼續使用，年繳 NT$3,870 可省 NT$570。`;
  return {
    type: 'flex',
    altText: `${title}：${body}`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#E7C5A8',
        contents: [{ type: 'text', text: title, weight: 'bold', color: '#4A3B32' }],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FAF7F2',
        contents: [{ type: 'text', text: body, wrap: true, size: 'sm', color: '#4A3B32' }],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#4A3B32',
            action: { type: 'uri', label: '續訂', uri: RENEW_URL },
          },
        ],
      },
    },
  };
}

/** POST /billing-reminders from pg_cron with a one-use tick token. */
export async function billingReminders(
  req: Request,
  db: any,
  push: (to: string, messages: any[]) => Promise<unknown>,
) {
  const tick = req.headers.get('x-billing-tick') ?? '';
  if (!/^[a-f0-9]{64}$/.test(tick))
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { data: used } = await db
    .from('line_oa_kit_billing_ticks')
    .delete()
    .eq('token_hash', await sha256(tick))
    .gt('expires_at', new Date().toISOString())
    .select('token_hash');
  if (!used?.length) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { data: due, error } = await db.rpc('line_oa_kit_billing_due');
  if (error) return Response.json({ error: 'unavailable' }, { status: 503 });
  let sent = 0;
  for (const row of due ?? []) {
    // Record first, so a retry never sends the same reminder twice.
    const { error: dup } = await db.from('line_oa_kit_billing_reminders').insert(row);
    if (dup) continue;
    await push(row.line_subject, [reminderCard(row.kind, row.paid_until)]).catch(() => {});
    sent++;
  }
  return Response.json({ ok: true, sent });
}
