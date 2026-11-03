/**
 * Round a monetary value or rate to 2 decimal places.
 * Avoids floating-point inaccuracies like 0.1 + 0.2 !== 0.3.
 *
 * @param {number|string} amount
 * @param {number} decimals
 * @returns {number}
 */
const round = (amount, decimals = 2) => {
  const num = Number(amount);
  if (isNaN(num)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((num + Number.EPSILON) * factor) / factor;
};

/**
 * Format currency with Indian grouping (₹)
 * @param {number} amount
 * @returns {string}
 */
const formatINR = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(round(amount));
};

/**
 * Round base quantity to 4 decimal places consistently across the app.
 *
 * @param {number|string} qty
 * @returns {number}
 */
const roundBaseQty = (qty) => round(qty, 4);

module.exports = {
  round,
  roundBaseQty,
  formatINR,
};

