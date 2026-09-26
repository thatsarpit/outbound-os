/**
 * Order settlement: what the customer pays, what lands in rupees, what is left.
 *
 * All money is integer minor units of its own currency — cents for a USD
 * order, paise for the INR columns. Rates are integers too: fee rates in basis
 * points (10% = 1000), FX in 1/10,000 rupee per unit (83.4567 = 834567).
 * Nothing here touches a float, because a float total is a rounding bug that
 * only shows up once the numbers are real.
 *
 * The chain:
 *
 *   subtotal (order currency)
 *     → fee applied, either absorbed or passed on
 *     → net receivable (order currency)
 *     → × FX rate
 *     → landed INR
 *     − procurement cost (INR)
 *     = profit (INR)
 *
 * Where an actual bank credit has been recorded it replaces the computed
 * landed figure, because correspondent bank charges mean the two rarely agree
 * and the real one is what the books need.
 */

/** Integer division that rounds half away from zero, so money never drifts down. */
function divRound(numerator, denominator) {
  if (denominator === 0) return 0;
  const sign = Math.sign(numerator) * Math.sign(denominator);
  const n = Math.abs(numerator);
  const d = Math.abs(denominator);
  return sign * Math.floor((n + Math.floor(d / 2)) / d);
}

const BPS_DIVISOR = 10000;   // basis points
const FX_DIVISOR = 10000;    // 1/10,000 rupee per currency unit

/**
 * @param {object} input
 * @param {number} input.subtotal            line total in the order's currency
 * @param {number} [input.discountTotal]     in the order's currency
 * @param {number} [input.taxTotal]          in the order's currency
 * @param {number} [input.feeBps]            payment method percentage, basis points
 * @param {number} [input.feeFixed]          payment method flat fee, order currency
 * @param {'absorb'|'pass_on'} [input.feeMode]
 * @param {number|null} [input.fxRateToInr]  1/10,000 rupee per unit of currency
 * @param {number} [input.procurementCostInr] paise
 * @param {number|null} [input.amountReceivedInr] actual bank credit, paise
 */
export function computeSettlement({
  subtotal = 0,
  discountTotal = 0,
  taxTotal = 0,
  feeBps = 0,
  feeFixed = 0,
  feeMode = 'absorb',
  fxRateToInr = null,
  procurementCostInr = 0,
  amountReceivedInr = null,
} = {}) {
  // What the order is worth before any payment cost.
  const goodsTotal = Math.max(0, subtotal - discountTotal + taxTotal);

  const passOn = feeMode === 'pass_on';

  // Absorbing: the fee is taken out of the goods total.
  // Passing on: the customer is charged enough that the goods total survives
  // the fee. That needs a gross-up — adding the same percentage back leaves a
  // shortfall, because the processor charges its cut on the larger amount too.
  //   invoice = (goods + fixed) / (1 - rate)
  let fee;
  let invoiceTotal;
  if (passOn) {
    const denominator = BPS_DIVISOR - feeBps;
    if (denominator <= 0) {
      // A fee of 100% or more cannot be passed on: there is no invoice amount
      // that survives it. Fall back to absorbing so the figures stay finite.
      fee = goodsTotal + feeFixed;
      invoiceTotal = goodsTotal;
    } else {
      invoiceTotal = divRound((goodsTotal + feeFixed) * BPS_DIVISOR, denominator);
      fee = invoiceTotal - goodsTotal;
    }
  } else {
    fee = divRound(goodsTotal * feeBps, BPS_DIVISOR) + feeFixed;
    invoiceTotal = goodsTotal;
  }

  // What we expect to receive, in the order's currency.
  const netReceivable = passOn ? goodsTotal : Math.max(0, goodsTotal - fee);

  // Converted, unless no rate is known yet.
  const computedInr =
    fxRateToInr && fxRateToInr > 0
      ? divRound(netReceivable * fxRateToInr, FX_DIVISOR)
      : null;

  // The real credit wins where it exists.
  const landedInr = amountReceivedInr ?? computedInr;

  const profitInr = landedInr === null ? null : landedInr - procurementCostInr;
  const marginPct =
    landedInr && landedInr > 0 && profitInr !== null
      ? divRound(profitInr * BPS_DIVISOR, landedInr) / 100
      : null;

  return {
    goodsTotal,
    fee,
    /// What the customer is asked to pay.
    invoiceTotal,
    /// What we expect after the processor takes its cut.
    netReceivable,
    /// Converted at the recorded rate; null until a rate is set.
    computedInr,
    /// Actual credit where recorded, else the computed figure.
    landedInr,
    procurementCostInr,
    profitInr,
    /// Percent, one decimal. Null while the landed amount is unknown.
    marginPct,
    usingActual: amountReceivedInr !== null && amountReceivedInr !== undefined,
  };
}

/**
 * Suppliers whose matchTag appears in a lead's tags, best first.
 *
 * Returns every match, not just one, because leads legitimately carry more
 * than one supplier's tag — an account-level tag applied to everything from
 * one lead source sits alongside the tag from the sheet a lead also came
 * in on. Picking silently by array order made that an alphabetical accident,
 * so ordering is explicit (matchPriority, then name) and the caller can see
 * that the answer was ambiguous.
 */
export function suppliersForLeadTags(tags, suppliers) {
  if (!tags) return [];
  const list = String(tags).split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return [];
  return suppliers
    .filter((s) => s.enabled && s.matchTag && list.includes(String(s.matchTag).trim().toLowerCase()))
    .sort(
      (a, b) =>
        (a.matchPriority ?? 100) - (b.matchPriority ?? 100) ||
        String(a.name).localeCompare(String(b.name)),
    );
}

/** The best match, or null. Prefer suppliersForLeadTags when ambiguity matters. */
export function supplierForLeadTags(tags, suppliers) {
  return suppliersForLeadTags(tags, suppliers)[0] || null;
}

export default { computeSettlement, supplierForLeadTags, suppliersForLeadTags };
