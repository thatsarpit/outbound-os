import prisma from '../utils/prismaClient.js';
import emailService from './emailService.js';
import whatsappManager from './whatsapp.js';
import logger from '../utils/logger.js';

/**
 * Order updates to customers.
 *
 * Two channels, and they are not symmetric:
 *
 *  - Email goes through sendSystemEmail, which sends to an arbitrary address.
 *    The lead-based send path cannot be used here: Message.leadId is required
 *    and a repeat customer's order often has no lead behind it.
 *
 *  - WhatsApp goes out as an approved *utility* template. Free-text is only
 *    deliverable inside the 24-hour service window, and an order confirmation
 *    usually falls outside it, so a plain message would silently not arrive.
 *
 * Every send is recorded in OrderNotification, which carries a unique
 * (orderId, event, channel). That is what stops a customer being told twice
 * that the same order shipped when a status is toggled back and forth.
 */

const EVENTS = {
  order_confirmed: {
    subject: (o) => `Order ${o.orderNumber} confirmed`,
    template: 'order_confirmed',
    campaign: () => process.env.WA_CAMPAIGN_ORDER_CONFIRMED || 'Order Confirmed',
    params: (o) => [firstName(o), o.orderNumber, money(o.total, o.currency)],
    text: (o) =>
      `Hi ${firstName(o)},\n\n` +
      `Your order ${o.orderNumber} is confirmed.\n\n` +
      `${itemLines(o)}\n` +
      `Total: ${money(o.total, o.currency)}\n\n` +
      `We will let you know as soon as it ships.`,
  },
  order_shipped: {
    subject: (o) => `Order ${o.orderNumber} has shipped`,
    template: 'order_shipped',
    campaign: () => process.env.WA_CAMPAIGN_ORDER_SHIPPED || 'Order Shipped',
    // Must match docs/whatsapp-templates/order_shipped.md exactly: WhatsApp
    // rejects a send whose parameter count differs from the approved template.
    params: (o, ctx) => [
      firstName(o),
      o.orderNumber,
      ctx?.carrier ? String(ctx.carrier).toUpperCase() : 'our courier partner',
      ctx?.trackingNumber || '',
      ctx?.estimatedDelivery ? asDate(ctx.estimatedDelivery) : 'to be confirmed',
    ],
    text: (o, ctx) =>
      `Hi ${firstName(o)},\n\n` +
      `Your order ${o.orderNumber} is on its way.\n\n` +
      (ctx?.carrier ? `Carrier: ${String(ctx.carrier).toUpperCase()}\n` : '') +
      (ctx?.trackingNumber ? `Tracking number: ${ctx.trackingNumber}\n` : '') +
      (ctx?.trackingUrl ? `Track it here: ${ctx.trackingUrl}\n` : '') +
      (ctx?.estimatedDelivery ? `Estimated delivery: ${asDate(ctx.estimatedDelivery)}\n` : '') +
      `\nReply to this message if anything looks wrong.`,
  },
  order_delivered: {
    subject: (o) => `Order ${o.orderNumber} delivered`,
    template: 'order_delivered',
    campaign: () => process.env.WA_CAMPAIGN_ORDER_DELIVERED || 'Order Delivered',
    params: (o) => [firstName(o), o.orderNumber],
    text: (o) =>
      `Hi ${firstName(o)},\n\n` +
      `Order ${o.orderNumber} has been delivered.\n\n` +
      `If anything is missing or damaged, reply here and we will sort it out.`,
  },
};

export const EVENT_NAMES = Object.keys(EVENTS);

const firstName = (o) => (o.customerName || 'there').split(' ')[0];
const asDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function money(minorUnits, currency = 'USD') {
  const value = (minorUnits || 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function itemLines(order) {
  if (!order.items?.length) return '';
  return order.items
    .map((i) => `  • ${i.productName}${i.strength ? ` (${i.strength})` : ''} — ${i.quantity} ${i.unit}`)
    .join('\n');
}

const textToHtml = (text) =>
  `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6">${
    String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')
  }</div>`;

/** Which channels this customer actually wants, given the order's contacts. */
function resolveChannels(order, customer) {
  const pref = customer?.notifyChannel || 'both';
  if (pref === 'none') return [];
  const wanted = pref === 'both' ? ['email', 'whatsapp'] : [pref];
  return wanted.filter((c) =>
    c === 'email' ? Boolean(order.customerEmail) : Boolean(order.customerPhone));
}

class OrderNotifier {
  /**
   * Send an order update.
   *
   * @param {number} orderId
   * @param {string} event  one of EVENTS
   * @param {object} ctx    event extras (tracking details, invoice figures)
   * @param {object} opts   { force } to re-send an event already recorded
   */
  async notify(orderId, event, ctx = {}, { force = false, only = null } = {}) {
    const spec = EVENTS[event];
    if (!spec) throw new Error(`Unknown order event: ${event}`);

    const order = await prisma.salesOrder.findUnique({
      where: { id: orderId },
      include: { items: { orderBy: { sortOrder: 'asc' } }, customer: true },
    });
    if (!order) throw new Error('Order not found');

    let channels = resolveChannels(order, order.customer);
    if (only) channels = channels.filter((c) => only.includes(c));
    if (channels.length === 0) {
      logger.info(`Order ${order.orderNumber}: no notification channel available or customer opted out`);
      return { sent: [], skipped: ['no_channel'] };
    }

    const results = [];
    for (const channel of channels) {
      // The unique (orderId, event, channel) is what makes this idempotent.
      const existing = await prisma.orderNotification.findFirst({
        where: { orderId, event, channel },
      });
      if (existing && existing.status === 'sent' && !force) {
        results.push({ channel, status: 'skipped', reason: 'already_sent' });
        continue;
      }

      const recipient = channel === 'email' ? order.customerEmail : order.customerPhone;
      const body = spec.text(order, ctx);
      const subject = spec.subject(order, ctx);

      const record = existing
        ? await prisma.orderNotification.update({
            where: { id: existing.id },
            data: { status: 'pending', recipient, subject, body, error: null },
          })
        : await prisma.orderNotification.create({
            data: {
              tenantId: order.tenantId,
              orderId,
              customerId: order.customerId,
              event,
              channel,
              status: 'pending',
              recipient,
              subject,
              body,
              templateName: channel === 'whatsapp' ? spec.template : null,
            },
          });

      try {
        if (channel === 'email') {
          await emailService.sendSystemEmail({
            to: recipient,
            subject,
            textBody: body,
            htmlBody: textToHtml(body),
            tag: `order:${event}`,
          });
        } else {
          // Utility template — free text would not deliver outside the 24h window.
          // On Meta this is the approved template's name; on AiSensy it must be
          // the *campaign* that wraps the template (a template name there
          // returns "Campaign does not exist").
          const res = await whatsappManager.sendCampaignTemplate(
            recipient,
            spec.campaign(),
            spec.params(order, ctx),
            null,
            { source: 'order-update', userName: order.customerName || '' },
          );
          if (!res?.success) {
            throw new Error(res?.reason || res?.error || 'WhatsApp template send failed');
          }
        }

        await prisma.orderNotification.update({
          where: { id: record.id },
          data: { status: 'sent', sentAt: new Date(), error: null },
        });
        results.push({ channel, status: 'sent' });
        logger.info(`Order ${order.orderNumber}: ${event} sent via ${channel} to ${recipient}`);
      } catch (err) {
        await prisma.orderNotification.update({
          where: { id: record.id },
          data: { status: 'failed', error: String(err.message).slice(0, 500) },
        });
        results.push({ channel, status: 'failed', error: err.message });
        // One channel failing must not stop the other from being tried.
        logger.warn(`Order ${order.orderNumber}: ${event} via ${channel} failed — ${err.message}`);
      }
    }
    return { results };
  }

  /** Recompute a customer's rollups from their orders. Never edited by hand. */
  async refreshCustomerRollups(customerId) {
    if (!customerId) return null;
    const agg = await prisma.salesOrder.aggregate({
      where: { customerId, status: { notIn: ['draft', 'cancelled'] } },
      _sum: { total: true },
      _count: { id: true },
      _max: { createdAt: true },
    });
    return prisma.customer.update({
      where: { id: customerId },
      data: {
        totalOrders: agg._count.id || 0,
        lifetimeValue: agg._sum.total || 0,
        lastOrderAt: agg._max.createdAt || null,
      },
    });
  }

  /**
   * Re-send notifications that failed.
   *
   * Without this a transient outage — WhatsApp unreachable, a template not yet
   * approved — leaves the row at 'failed' forever and the customer is simply
   * never told. A success flips the row to 'sent', so a recovered notification
   * stops retrying by itself.
   *
   * The 48-hour window is what stops a permanently broken template from
   * retrying until the end of time; past that it needs a human.
   */
  async retryFailedNotifications({ withinHours = 48, limit = 50 } = {}) {
    const since = new Date(Date.now() - withinHours * 3600 * 1000);
    const failed = await prisma.orderNotification.findMany({
      where: { status: 'failed', createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    if (failed.length === 0) return { retried: 0, recovered: 0 };

    let recovered = 0;
    for (const row of failed) {
      try {
        // force, because the row exists; only, so the sibling channel that
        // already succeeded is not messaged a second time.
        const res = await this.notify(row.orderId, row.event, {}, { force: true, only: [row.channel] });
        if (res?.results?.some?.((r) => r.channel === row.channel && r.status === 'sent')) recovered += 1;
      } catch (err) {
        logger.warn(`retry failed for notification ${row.id}: ${err.message}`);
      }
    }
    logger.info(`Order notifications: retried ${failed.length}, recovered ${recovered}`);
    return { retried: failed.length, recovered };
  }
}

const orderNotifier = new OrderNotifier();
orderNotifier.EVENT_NAMES = EVENT_NAMES;
export default orderNotifier;
export { EVENTS };
