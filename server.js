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
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migration.sql'), 'utf8');
    await pool.query(sql);
    console.log('✅ Migraciones ejecutadas correctamente');
  } catch (err) {
    console.error('❌ Error ejecutando migraciones:', err.message);
  }
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
  res.send('Servidor corriendo correctamente');
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
