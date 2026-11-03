const Counter = require('../models/Counter');

/**
 * Atomically increments and retrieves the next sequence number for a counter name.
 *
 * @param {string} name - e.g. "PUR-2026", "INV"
 * @param {import('mongoose').ClientSession} session - Mongoose transaction session
 * @returns {Promise<number>}
 */
const getNextSequence = async (name, session) => {
  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session }
  );
  return counter.seq;
};

/**
 * Generates document numbers in format PUR-YYYY-0001
 *
 * @param {import('mongoose').ClientSession} session
 * @param {Date|string} date
 * @returns {Promise<string>}
 */
const generatePurchaseNo = async (session, date = new Date()) => {
  const year = new Date(date).getFullYear();
  const seq = await getNextSequence(`PUR-${year}`, session);
  return `PUR-${year}-${String(seq).padStart(4, '0')}`;
};

/**
 * Generates invoice numbers in format INV-0001
 *
 * @param {import('mongoose').ClientSession} session
 * @returns {Promise<string>}
 */
const generateInvoiceNo = async (session) => {
  const seq = await getNextSequence('INV', session);
  return `INV-${String(seq).padStart(4, '0')}`;
};

/**
 * Generates quotation numbers in format QUO-0001
 *
 * @param {import('mongoose').ClientSession} [session]
 * @returns {Promise<string>}
 */
const generateQuotationNo = async (session) => {
  const seq = await getNextSequence('QUO', session);
  return `QUO-${String(seq).padStart(4, '0')}`;
};

module.exports = {
  getNextSequence,
  generatePurchaseNo,
  generateInvoiceNo,
  generateQuotationNo,
};
