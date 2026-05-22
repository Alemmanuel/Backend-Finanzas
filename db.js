const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const connectionString = process.env.DATABASE_URL;
console.log('Intentando conectar a:', connectionString?.replace(/:.*@/, ':****@'));

function shouldUseSsl(connectionString) {
  // Permite forzar SSL con PGSSL=true|1 (útil en cloud)
  const forced = (process.env.PGSSL || '').toLowerCase();
  if (forced === 'true' || forced === '1') return true;
  if (forced === 'false' || forced === '0') return false;

  // En localhost normalmente NO hay SSL
  const cs = (connectionString || '').toLowerCase();
  if (cs.includes('localhost') || cs.includes('127.0.0.1')) return false;
  return true;
}

const pool = new Pool({
  connectionString,
  ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : false,
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
