require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const swaggerJSDoc = require('swagger-jsdoc');

const connectDB = require('./config/db');
const routes = require('./routes');
const baseOpenapiSpec = require('./docs/openapi');
const routeOpenapiSpec = swaggerJSDoc({
  definition: {
    openapi: baseOpenapiSpec.openapi,
    info: baseOpenapiSpec.info,
    servers: baseOpenapiSpec.servers,
    tags: baseOpenapiSpec.tags,
    security: baseOpenapiSpec.security,
    components: baseOpenapiSpec.components,
  },
  apis: [`${path.join(__dirname, 'routes').replace(/\\/g, '/') }/*.js`],
});
const openapiSpec = {
  ...baseOpenapiSpec,
  paths: { ...baseOpenapiSpec.paths, ...routeOpenapiSpec.paths },
};
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Connect to Database
connectDB();

// Security HTTP headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);

// HTTP request logger
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Cookie parsing
app.use(cookieParser());

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Interactive API documentation and the raw OpenAPI document
app.get('/api-docs.json', (req, res) => res.json(openapiSpec));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, {
  explorer: true,
  swaggerOptions: { persistAuthorization: true },
}));

// API Base Routes
app.use('/api', routes);

// Fallback route for root API check
app.get('/', (req, res) => {
  res.json({
    name: 'Construction Inventory & Billing API',
    status: 'online',
    healthCheck: '/api/health',
  });
});

// 404 & Central Error Handling
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`[Server] Running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;

