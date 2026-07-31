const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const pool = require('./db');
dotenv.config();

const routes = require('./routes');
const authRoutes = require('./auth');

const app = express();

app.use(cors());
app.options('*', cors());

// Middlewares para parsear JSON y URL-encoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// **Auto-migración al iniciar**
async function runMigrations() {
  const sql = fs.readFileSync(path.join(__dirname, 'migration.sql'), 'utf8');
  const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    try {
      await pool.query(stmt);
      console.log(`✅ ${stmt.slice(0, 60)}...`);
    } catch (err) {
      console.error(`❌ Error en sentencia: ${stmt.slice(0, 80)}`);
      console.error(`   Detalle: ${err.message}`);
    }
  }
  console.log('🏁 Migraciones finalizadas');
}

// **Endpoint de prueba de conexión a la base de datos**
app.get('/api/test-db', async (req, res, next) => {
  try {
    // Consulta simple para verificar que la DB responda
    const result = await pool.query('SELECT 1 AS test');
    res.json({
      message: 'Conexión exitosa a la DB',
      rows: result.rows
    });
  } catch (error) {
    // En caso de error, pasa el error al middleware global
    next(error);
  }
});

// **Depuración: mostrar esquema de tablas**
app.get('/api/debug/schema', async (req, res) => {
  try {
    const tables = ['transactions', 'budgets'];
    const result = {};
    for (const table of tables) {
      const { rows } = await pool.query(
        "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position",
        [table]
      );
      result[table] = rows;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// **Endpoint para forzar migración manual (vía HTTP)**
app.get('/api/migrate', async (req, res) => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migration.sql'), 'utf8');
    await pool.query(sql);
    res.json({ message: 'Migraciones ejecutadas correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error ejecutando migraciones', details: error.message });
  }
});

// Monta rutas de autenticación
app.use('/api/auth', authRoutes);

// Monta las rutas de la API en el path '/api'
app.use('/api', routes);

// Ruta de prueba para confirmar que el servidor funciona
app.get('/', (req, res) => {
  res.send('API de Finanzas en funcionamiento');
});

// **Middleware de manejo de errores global**
app.use((err, req, res, next) => {
  console.error('Global Error Handler:', err);
  res.status(500).json({
    error: 'Error interno del servidor',
    details: err.message
  });
});

const port = process.env.PORT || 3000;
runMigrations().then(() => {
  app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
  });
});
