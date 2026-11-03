const { round } = require('./money');

/**
 * Calculates GST breakdown for an individual line item.
 *
 * @param {Object} params
 * @param {number} params.rate - GST exclusive unit price
 * @param {number} params.quantity - Entered unit quantity
 * @param {number} params.gstRate - GST rate % (e.g. 0, 5, 12, 18, 28)
 * @param {boolean} params.isInterState - True if inter-state (IGST), false if intra-state (CGST+SGST)
 * @returns {Object} { taxableAmount, gstAmount, cgst, sgst, igst, amount }
 */
const calculateLineGst = ({ rate, quantity, gstRate, isInterState }) => {
  const taxableAmount = round(Number(rate) * Number(quantity), 2);
  const gstRateNum = Number(gstRate) || 0;
  const gstAmount = round((taxableAmount * gstRateNum) / 100, 2);

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (isInterState) {
    igst = gstAmount;
  } else {
    cgst = round(gstAmount / 2, 2);
    sgst = round(gstAmount - cgst, 2); // ensures cgst + sgst === gstAmount exactly
  }

  const amount = round(taxableAmount + gstAmount, 2);

  return {
    taxableAmount,
    gstAmount,
    cgst,
    sgst,
    igst,
    amount,
  };
};

/**
 * Calculates complete GST totals across all items.
 * If customer state is missing or equal to business state, treats as intra-state (CGST + SGST).
 * Otherwise treats as inter-state (IGST).
 *
 * @param {Object} params
 * @param {Array} params.items - array of { rate, quantity, gstRate }
 * @param {string} [params.customerState]
 * @param {string} [params.businessState]
 * @returns {Object}
 */
const calculateGstTotals = ({ items, customerState = '', businessState = '' }) => {
  const normCustomer = (customerState || '').trim().toLowerCase();
  const normBusiness = (businessState || '').trim().toLowerCase();

  // If customer has no state, treat as same state as the business
  const isInterState = normCustomer !== '' && normBusiness !== '' && normCustomer !== normBusiness;

  let subtotal = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  const processedItems = items.map((item) => {
    const calc = calculateLineGst({
      rate: item.rate,
      quantity: item.quantity,
      gstRate: item.gstRate,
      isInterState,
    });

    subtotal = round(subtotal + calc.taxableAmount, 2);
    totalCgst = round(totalCgst + calc.cgst, 2);
    totalSgst = round(totalSgst + calc.sgst, 2);
    totalIgst = round(totalIgst + calc.igst, 2);

    return {
      ...item,
      ...calc,
    };
  });

  const totalGst = round(totalCgst + totalSgst + totalIgst, 2);
  const grandTotal = round(subtotal + totalGst, 2);

  return {
    isInterState,
    subtotal,
    cgst: totalCgst,
    sgst: totalSgst,
    igst: totalIgst,
    totalGst,
    grandTotal,
    items: processedItems,
  };
};

module.exports = {
  calculateLineGst,
  calculateGstTotals,
};

