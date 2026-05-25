// server/config/swaggerConfig.js
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Task Management API',
      version: '1.0.0',
      description:
        'A simple CRUD API for managing tasks, built with Node.js, Express, and MongoDB.',
      contact: {
        name: 'Task Management Dev Team',
      },
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 5000}`,
        description: 'Local development server',
      },
    ],
    components: {
      schemas: {
        Task: {
          type: 'object',
          required: ['title', 'status'],
          properties: {
            _id: {
              type: 'string',
              description: 'Auto-generated MongoDB ObjectId',
              example: '6629f3a2b4e2c10012345abc',
            },
            title: {
              type: 'string',
              description: 'Title of the task',
              example: 'Design database schema',
            },
            description: {
              type: 'string',
              description: 'Optional longer description',
              example: 'Create ERD and define all collection fields',
            },
            status: {
              type: 'string',
              enum: ['Pending', 'In Progress', 'Completed'],
              default: 'Pending',
              description: 'Current status of the task',
              example: 'In Progress',
            },
            dueDate: {
              type: 'string',
              format: 'date-time',
              description: 'Optional due date (ISO 8601)',
              example: '2025-12-31T23:59:59.000Z',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Timestamp when the task was created (auto-set)',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Timestamp when the task was last updated (auto-set)',
            },
          },
        },
        TaskInput: {
          type: 'object',
          required: ['title'],
          properties: {
            title: {
              type: 'string',
              example: 'Design database schema',
            },
            description: {
              type: 'string',
              example: 'Create ERD and define all collection fields',
            },
            status: {
              type: 'string',
              enum: ['Pending', 'In Progress', 'Completed'],
              default: 'Pending',
              example: 'Pending',
            },
            dueDate: {
              type: 'string',
              format: 'date-time',
              example: '2025-12-31T23:59:59.000Z',
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Task not found',
            },
          },
        },
      },
    },
  },
  // Paths that swagger-jsdoc should scan for @openapi / @swagger comments
  apis: ['./controllers/*.js', './routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
