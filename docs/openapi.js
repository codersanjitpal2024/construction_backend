const idParam = {
  name: 'id', in: 'path', required: true, description: 'MongoDB document ID',
  schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
};

const productIdParam = {
  name: 'productId', in: 'path', required: true, description: 'MongoDB product ID',
  schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
};

const pageParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
];

const jsonBody = (schema, required = true) => ({
  required,
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${schema}` } } },
});

const response = (description, schema = 'ApiResponse') => ({
  description,
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${schema}` } } },
});

const operation = (summary, tag, successDescription, options = {}) => ({
  summary,
  tags: [tag],
  ...(options.description ? { description: options.description } : {}),
  ...(options.parameters ? { parameters: options.parameters } : {}),
  ...(options.requestBody ? { requestBody: options.requestBody } : {}),
  ...(options.public ? { security: [] } : {}),
  responses: {
    [options.status || 200]: response(successDescription, options.responseSchema || 'ApiResponse'),
    ...(options.errors || { 400: response('Invalid input', 'ErrorResponse'), 401: response('Missing or invalid authentication', 'ErrorResponse') }),
  },
});

const itemListParams = (extras = []) => [...pageParams, ...extras];

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Construction Inventory & Billing API',
    version: '1.0.0',
    description: 'API reference for authentication, inventory, purchasing, sales, quotations, customers, suppliers, and settings. Protected routes use the httpOnly `token` cookie set by `/api/auth/login`.',
  },
  servers: [{ url: '/api', description: 'Current server' }],
  tags: [
    { name: 'Health' }, { name: 'Authentication' }, { name: 'Dashboard' }, { name: 'Metadata' },
    { name: 'Products' }, { name: 'Inventory' }, { name: 'Suppliers' }, { name: 'Purchases' },
    { name: 'Customers' }, { name: 'Quotations' }, { name: 'Sales' }, { name: 'Settings' },
  ],
  security: [{ cookieAuth: [] }],
  paths: {
    '/health': {
      get: operation('Check API health', 'Health', 'API status', { public: true, errors: { 500: response('Server error', 'ErrorResponse') } }),
    },
    '/dashboard': {
      get: operation('Get dashboard summary', 'Dashboard', 'Dashboard statistics'),
    },
    '/meta/units': {
      get: operation('List supported measurement units', 'Metadata', 'Available units'),
    },
    '/products': {
      get: operation('List products', 'Products', 'Paginated product list', { parameters: itemListParams([{ name: 'search', in: 'query', schema: { type: 'string' } }, { name: 'category', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }]) }),
      post: operation('Create a product', 'Products', 'Product created', { status: 201, requestBody: jsonBody('ProductInput') }),
    },
    '/products/search': {
      get: operation('Search products for selection', 'Products', 'Matching products', { parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }] }),
    },
    '/products/{id}': {
      get: operation('Get a product', 'Products', 'Product details', { parameters: [idParam] }),
      put: operation('Update a product', 'Products', 'Product updated', { parameters: [idParam], requestBody: jsonBody('ProductInput') }),
    },
    '/products/{id}/status': {
      patch: operation('Set product active status', 'Products', 'Product status updated', { parameters: [idParam], requestBody: jsonBody('ActiveStatusInput') }),
    },
    '/products/{id}/units': {
      patch: operation('Update product units and conversion factors', 'Products', 'Product units updated', { parameters: [idParam], requestBody: jsonBody('ProductUnitsInput') }),
    },
    '/inventory': {
      get: operation('Get inventory balances', 'Inventory', 'Inventory list', { parameters: itemListParams([{ name: 'search', in: 'query', schema: { type: 'string' } }, { name: 'category', in: 'query', schema: { type: 'string' } }]) }),
    },
    '/inventory/{productId}/movements': {
      get: operation('Get stock movements for a product', 'Inventory', 'Paginated stock movements', { parameters: [productIdParam, ...pageParams] }),
    },
    '/inventory/{productId}/adjust': {
      post: operation('Adjust product stock', 'Inventory', 'Stock adjusted', { parameters: [productIdParam], requestBody: jsonBody('StockAdjustmentInput') }),
    },
    '/suppliers': {
      get: operation('List suppliers', 'Suppliers', 'Supplier list', { parameters: itemListParams([{ name: 'search', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }]) }),
      post: operation('Create a supplier', 'Suppliers', 'Supplier created', { status: 201, requestBody: jsonBody('SupplierInput') }),
    },
    '/suppliers/{id}': {
      get: operation('Get a supplier', 'Suppliers', 'Supplier details', { parameters: [idParam] }),
      put: operation('Update a supplier', 'Suppliers', 'Supplier updated', { parameters: [idParam], requestBody: jsonBody('SupplierInput') }),
    },
    '/suppliers/{id}/status': {
      patch: operation('Set supplier active status', 'Suppliers', 'Supplier status updated', { parameters: [idParam], requestBody: jsonBody('ActiveStatusInput') }),
    },
    '/suppliers/{id}/payments': {
      post: operation('Record a supplier payment', 'Suppliers', 'Supplier payment recorded', { parameters: [idParam], requestBody: jsonBody('SupplierPaymentInput'), status: 201 }),
    },
    '/suppliers/{id}/ledger': {
      get: operation('Get supplier ledger', 'Suppliers', 'Supplier ledger entries', { parameters: [idParam, ...pageParams, { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } }, { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } }] }),
    },
    '/purchases': {
      get: operation('List purchases', 'Purchases', 'Purchase list', { parameters: itemListParams([{ name: 'search', in: 'query', schema: { type: 'string' } }, { name: 'supplierId', in: 'query', schema: { type: 'string' } }, { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } }, { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } }]) }),
      post: operation('Create a purchase', 'Purchases', 'Purchase created', { status: 201, requestBody: jsonBody('PurchaseInput') }),
    },
    '/purchases/{id}': {
      get: operation('Get a purchase', 'Purchases', 'Purchase details', { parameters: [idParam] }),
    },
    '/purchases/{id}/cancel': {
      post: operation('Cancel a purchase', 'Purchases', 'Purchase cancelled', { parameters: [idParam], requestBody: jsonBody('CancelPurchaseInput') }),
    },
    '/customers': {
      get: operation('List customers', 'Customers', 'Customer list', { parameters: itemListParams([{ name: 'search', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }]) }),
      post: operation('Create a customer', 'Customers', 'Customer created', { status: 201, requestBody: jsonBody('CustomerInput') }),
    },
    '/customers/{id}': {
      get: operation('Get a customer', 'Customers', 'Customer details', { parameters: [idParam] }),
      put: operation('Update a customer', 'Customers', 'Customer updated', { parameters: [idParam], requestBody: jsonBody('CustomerInput') }),
    },
    '/customers/{id}/payments': {
      post: operation('Record a customer payment', 'Customers', 'Customer payment recorded', { parameters: [idParam], requestBody: jsonBody('CustomerPaymentInput'), status: 201 }),
    },
    '/customers/{id}/ledger': {
      get: operation('Get customer ledger', 'Customers', 'Customer ledger entries', { parameters: [idParam, ...pageParams] }),
    },
    '/quotations': {
      get: operation('List quotations', 'Quotations', 'Quotation list', { parameters: itemListParams([{ name: 'search', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }]) }),
      post: operation('Create a quotation', 'Quotations', 'Quotation created', { status: 201, requestBody: jsonBody('QuotationInput') }),
    },
    '/quotations/{id}': {
      get: operation('Get a quotation', 'Quotations', 'Quotation details', { parameters: [idParam] }),
      put: operation('Update a quotation', 'Quotations', 'Quotation updated', { parameters: [idParam], requestBody: jsonBody('QuotationInput') }),
    },
    '/quotations/{id}/status': {
      patch: operation('Update quotation status', 'Quotations', 'Quotation status updated', { parameters: [idParam], requestBody: jsonBody('QuotationStatusInput') }),
    },
    '/sales': {
      get: operation('List sales', 'Sales', 'Sales list', { parameters: itemListParams([{ name: 'search', in: 'query', schema: { type: 'string' } }]) }),
      post: operation('Create a sale / invoice', 'Sales', 'Sale created', { status: 201, requestBody: jsonBody('SaleInput') }),
    },
    '/sales/{id}': {
      get: operation('Get a sale / invoice', 'Sales', 'Sale details', { parameters: [idParam] }),
    },
    '/settings': {
      get: operation('Get business settings', 'Settings', 'Business settings'),
      put: operation('Update business settings', 'Settings', 'Business settings updated', { requestBody: jsonBody('SettingsInput') }),
    },
  },
  components: {
    securitySchemes: {
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'token', description: 'Sign in through `/auth/login`; the server sets this httpOnly cookie.' },
    },
    schemas: {
      ApiResponse: { type: 'object', description: 'Successful JSON response; fields vary by operation.', additionalProperties: true },
      ErrorResponse: { type: 'object', properties: { success: { type: 'boolean', example: false }, message: { type: 'string' } } },
      AuthResponse: { type: 'object', properties: { success: { type: 'boolean', example: true }, message: { type: 'string', example: 'Logged in successfully' }, user: { $ref: '#/components/schemas/UserSummary' } }, description: 'Login and signup return a user object. Login also sets the httpOnly token cookie.' },
      UserSummary: { type: 'object', properties: { id: { type: 'string', example: '65f01234567890abcdef1234' }, name: { type: 'string', example: 'Super Admin' }, email: { type: 'string', format: 'email', example: 'admin@example.com' } } },
      CurrentUserResponse: { type: 'object', properties: { success: { type: 'boolean', example: true }, user: { allOf: [{ $ref: '#/components/schemas/UserSummary' }, { type: 'object', properties: { createdAt: { type: 'string', format: 'date-time' } } }] } } },
      MessageResponse: { type: 'object', properties: { success: { type: 'boolean', example: true }, message: { type: 'string', example: 'Logged out successfully' } } },
      LoginInput: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password' } }, example: { email: 'admin@example.com', password: 'your-password' } },
      SignupInput: { type: 'object', required: ['name', 'email', 'password'], properties: { name: { type: 'string' }, email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password', minLength: 6 } } },
      ChangePasswordInput: { type: 'object', required: ['currentPassword', 'newPassword'], properties: { currentPassword: { type: 'string', format: 'password' }, newPassword: { type: 'string', format: 'password', minLength: 6 } } },
      ActiveStatusInput: { type: 'object', properties: { isActive: { type: 'boolean' } } },
      ProductUnit: { type: 'object', required: ['name', 'factor'], properties: { name: { type: 'string' }, factor: { type: 'number', exclusiveMinimum: 0 }, sellingPrice: { type: 'number', minimum: 0, default: 0 } } },
      ProductInput: { type: 'object', required: ['name', 'gstRate', 'baseUnit', 'units'], properties: { name: { type: 'string' }, category: { type: 'string', default: 'General' }, hsn: { type: 'string' }, gstRate: { type: 'number', enum: [0, 5, 12, 18, 28] }, baseUnit: { type: 'string' }, units: { type: 'array', items: { $ref: '#/components/schemas/ProductUnit' } }, minStock: { type: 'number', minimum: 0 }, isActive: { type: 'boolean', default: true } } },
      ProductUnitsInput: { oneOf: [{ type: 'object', required: ['units'], properties: { units: { type: 'array', items: { $ref: '#/components/schemas/ProductUnit' } } } }, { type: 'array', items: { $ref: '#/components/schemas/ProductUnit' } }] },
      StockAdjustmentInput: { type: 'object', required: ['reason'], properties: { newQty: { type: 'number' }, delta: { type: 'number' }, reason: { type: 'string', minLength: 1 } }, description: 'Provide either newQty or delta, along with a reason.' },
      SupplierInput: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string', format: 'email' }, address: { type: 'string' }, state: { type: 'string' }, gstin: { type: 'string' }, openingBalance: { type: 'number', default: 0 }, isActive: { type: 'boolean', default: true } } },
      CustomerInput: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, phone: { type: 'string' }, address: { type: 'string' }, state: { type: 'string' }, gstin: { type: 'string' }, openingBalance: { type: 'number', default: 0 }, isActive: { type: 'boolean', default: true } } },
      SupplierPaymentInput: { type: 'object', required: ['amount', 'paymentMode'], properties: { amount: { type: 'number', exclusiveMinimum: 0 }, paymentMode: { type: 'string' }, date: { type: 'string', format: 'date-time' }, note: { type: 'string' } } },
      CustomerPaymentInput: { type: 'object', required: ['amount'], properties: { amount: { type: 'number', exclusiveMinimum: 0 }, paymentMode: { type: 'string', default: 'Cash' }, date: { type: 'string', format: 'date-time' }, note: { type: 'string' } } },
      LineItemInput: { type: 'object', required: ['productId', 'unit', 'quantity', 'rate'], properties: { productId: { type: 'string' }, unit: { type: 'string' }, quantity: { type: 'number', exclusiveMinimum: 0 }, rate: { type: 'number', minimum: 0 }, gstRate: { type: 'number' } } },
      PurchaseInput: { type: 'object', required: ['supplierId', 'items'], properties: { supplierId: { type: 'string' }, date: { type: 'string', format: 'date-time' }, supplierInvoiceNo: { type: 'string' }, items: { type: 'array', minItems: 1, items: { $ref: '#/components/schemas/LineItemInput' } }, paidAmount: { type: 'number', minimum: 0 }, paymentMode: { type: 'string', description: 'Required when paidAmount is greater than zero.' }, notes: { type: 'string' } } },
      CancelPurchaseInput: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', minLength: 1 } } },
      QuotationInput: { type: 'object', required: ['customerId', 'items'], properties: { customerId: { type: 'string' }, date: { type: 'string', format: 'date-time' }, validUntil: { type: 'string', format: 'date-time', nullable: true }, items: { type: 'array', minItems: 1, items: { $ref: '#/components/schemas/LineItemInput' } }, notes: { type: 'string' } } },
      QuotationStatusInput: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['open', 'rejected'] } } },
      SaleInput: { type: 'object', required: ['customerId', 'items'], properties: { customerId: { type: 'string' }, date: { type: 'string', format: 'date-time' }, items: { type: 'array', minItems: 1, items: { $ref: '#/components/schemas/LineItemInput' } }, paidAmount: { type: 'number', minimum: 0 }, paymentMode: { type: 'string', default: 'Cash' }, notes: { type: 'string' }, quotationId: { type: 'string', nullable: true } } },
      SettingsInput: { type: 'object', required: ['businessName'], properties: { businessName: { type: 'string' }, gstin: { type: 'string' }, state: { type: 'string' }, address: { type: 'string' }, phone: { type: 'string' } } },
    },
  },
};
