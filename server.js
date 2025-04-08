const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Importa el pool para la prueba de conexión a la DB
const pool = require('./db');

// Importa las rutas principales
const routes = require('./routes');

dotenv.config();

const app = express();

// Configuración CORS más permisiva para desarrollo
app.use(cors({
  origin: '*', // Permite todas las conexiones en desarrollo
  methods: ['GET', 'POST', 'DELETE'],
  credentials: true
}));

// Middlewares para parsear JSON y URL-encoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});
