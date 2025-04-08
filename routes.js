// routes.js
const express = require('express');
const pool = require('./db');
const router = express.Router();

// Endpoint GET: Obtener todas las transacciones
router.get('/transactions', async (req, res) => {
  try {
    console.log('GET /transactions - Intentando obtener transacciones');
    const { rows } = await pool.query('SELECT * FROM transactions ORDER BY date DESC');
    console.log('Transacciones recuperadas:', rows.length);
    res.json({
      data: rows,
      source: 'db' // Indica que los datos provienen de la base de datos
    });
  } catch (error) {
    console.error('Error detallado en GET /transactions:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    res.status(500).json({
      error: 'Error al obtener transacciones',
      details: error.message,
      code: error.code
    });
  }
});

router.post('/transactions', async (req, res) => {
  const client = await pool.connect();
  try {
    const { tipo, monto, descripcion, fecha } = req.body;
    console.log('Datos recibidos:', { tipo, monto, descripcion, fecha });
    if (!tipo || !monto || !descripcion || !fecha) {
      return res.status(400).json({
        error: 'Faltan datos requeridos',
        received: req.body
      });
    }

    const type = tipo === 'Ingreso' ? 'income' : 'expense';
    const newTransaction = {
      type,
      amount: monto,
      description,
      date: fecha,
      id: Date.now() // Genera un ID único para la transacción
    };

    // Opcional: Guarda la transacción en la base de datos
    // const query = `
    //   INSERT INTO transactions (type, amount, description, date)
    //   VALUES ($1, $2, $3, $4)
    //   RETURNING *`;
    // const values = [type, monto, descripcion, fecha];
    // const { rows } = await client.query(query, values);

    res.status(201).json({
      message: 'Transacción agregada',
      transaction: newTransaction,
      source: 'api' // Indica que la transacción fue creada a través de la API
    });
  } catch (error) {
    console.error('Error en POST /transactions:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    res.status(500).json({
      error: 'Error al agregar transacción',
      details: error.message,
      code: error.code
    });
  } finally {
    client.release();
  }
});

// Endpoint DELETE: Eliminar una transacción por ID
router.delete('/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM transactions WHERE id = $1', [id]);
    res.json({ message: 'Transacción eliminada', id });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    res.status(500).json({ error: 'Error al eliminar transacción', details: error.message });
  }
});

// Nuevo endpoint para eliminar todos los datos
router.delete('/transactions/all', async (req, res) => {
  try {
    await pool.query('TRUNCATE TABLE transactions');
    res.json({ message: 'Todos los datos han sido eliminados' });
  } catch (error) {
    console.error('Error clearing transactions:', error);
    res.status(500).json({ error: 'Error al limpiar la base de datos', details: error.message });
  }
});

module.exports = router;
