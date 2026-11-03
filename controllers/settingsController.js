const Settings = require('../models/Settings');
const { settingsInputSchema } = require('../validators/settingsValidator');

// @desc    Get system & business settings
// @route   GET /api/settings
// @access  Protected
const getSettings = async (req, res, next) => {
  try {
    let settings = await Settings.findOne().lean();
    if (!settings) {
      settings = await Settings.create({
        businessName: 'Construction Store',
        gstin: '',
        state: '',
        address: '',
        phone: '',
      });
    }

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update business settings
// @route   PUT /api/settings
// @access  Protected
const updateSettings = async (req, res, next) => {
  try {
    const parsed = settingsInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.errors[0]?.message || 'Validation error',
        errors: parsed.error.errors,
      });
    }

    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings(parsed.data);
    } else {
      settings.businessName = parsed.data.businessName;
      settings.gstin = parsed.data.gstin ? parsed.data.gstin.toUpperCase() : '';
      settings.state = parsed.data.state || '';
      settings.address = parsed.data.address || '';
      settings.phone = parsed.data.phone || '';
    }

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSettings,
  updateSettings,
};

