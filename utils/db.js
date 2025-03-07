import { Pool } from 'pg';  // Importing the Pool class from the pg package

// Create a connection pool to your PostgreSQL database
const pool = new Pool({
  host: 'theendless-abcdefgh1234.i.aivencloud.com',  // e.g. localhost or a remote PostgreSQL server
  user: 'avnadmin',                 // Your PostgreSQL username
  password: 'AVNS_CY12earc6ibkmy8ZT0t',             // Your PostgreSQL password
  database: 'defaultdb',             // Your PostgreSQL database name
  port: 18395,               // Default PostgreSQL port is 5432
  max: 100,                 // Max number of connections in the pool
  idleTimeoutMillis: 300000, // How long to wait before closing an idle client
  connectionTimeoutMillis: 20000, // How long to wait for a connection before timing out
});

// Wrap the pool to return promises (using async/await)
export const promisePool = {
  query: async (text, params) => {
    const client = await pool.connect();
    try {
      const res = await client.query(text, params);
      return res;
    } finally {
      client.release();
    }
  }
};
