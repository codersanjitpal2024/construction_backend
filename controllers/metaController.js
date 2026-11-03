const { MASTER_UNITS } = require('../constants/units');

const getUnits = (req, res) => {
  res.status(200).json({
    success: true,
    units: MASTER_UNITS,
  });
};

module.exports = {
  getUnits,
};

