const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const connectionString = process.env.DATABASE_URL;
console.log('Intentando conectar a:', connectionString?.replace(/:.*@/, ':****@'));

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Test de conexión inicial
pool.query('SELECT NOW()')
  .then(result => {
    console.log('✅ Conexión a base de datos exitosa:', result.rows[0].now);
  })
  .catch(err => {
    console.error('❌ Error de conexión:', err.message);
    console.error('Detalles de configuración:', {
      host: pool.options.host,
      database: pool.options.database,
      user: pool.options.user,
      port: pool.options.port,
      ssl: pool.options.ssl
    });
  });

module.exports = pool;
