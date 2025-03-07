// utils/db.js
require('dotenv').config(); // Load environment variables from .env file
const { Pool } = require('pg');

// Create a PostgreSQL connection pool
const pool = new Pool({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: 18395,
});

module.exports = pool;
