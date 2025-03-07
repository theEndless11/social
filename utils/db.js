// utils/db.js
require('dotenv').config(); // Load environment variables from .env file
const { Pool } = require('pg');

// Create a PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST, // Aiven host URL
  port: process.env.DB_PORT, // Port number
  user: process.env.DB_USER, // Database username
  password: process.env.DB_PASSWORD, // Database password
  database: process.env.DB_DATABASE, // Database name
  ssl: { rejectUnauthorized: false }, // SSL configuration (required for Aiven and cloud providers)
});

module.exports = pool;
