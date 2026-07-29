const express = require('express');
const pool = require('./db');
const router = express.Router();

router.get('/transactions', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ error: 'user_id es requerido' });
  }
  try {
    const { rows } = await pool.query(
      "SELECT id, user_id, type, amount, description, category, date::text, created_at FROM transactions WHERE user_id = $1 ORDER BY date DESC",
      [user_id]
    );
    res.json({ data: rows, source: 'db' });
  } catch (error) {
    console.error('Error en GET /transactions:', error.message);
    res.status(500).json({ error: 'Error al obtener transacciones', details: error.message });
  }
});

router.post('/transactions', async (req, res) => {
  const client = await pool.connect();
  try {
    const { type, amount, description, date, category, user_id } = req.body;
    if (!type || amount === undefined || !description || !date || !user_id) {
      return res.status(400).json({ error: 'Faltan datos requeridos', received: req.body });
    }
    const query = `
      INSERT INTO transactions (type, amount, description, date, category, user_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, user_id, type, amount, description, category, date::text, created_at`;
    const values = [type, amount, description, date, category || null, user_id];
    const { rows } = await client.query(query, values);
    res.status(201).json({ message: 'Transacción agregada', transaction: rows[0] });
  } catch (error) {
    console.error('Error en POST /transactions:', error.message);
    res.status(500).json({ error: 'Error al agregar transacción', details: error.message });
  } finally {
    client.release();
  }
});

router.put('/transactions/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { type, amount, description, date, category, user_id } = req.body;
    if (user_id === undefined || user_id === null) {
      return res.status(400).json({ error: 'user_id es requerido' });
    }
    const query = `
      UPDATE transactions
      SET type = $1, amount = $2, description = $3, date = $4, category = $5
      WHERE id = $6 AND user_id = $7
      RETURNING id, user_id, type, amount, description, category, date::text, created_at`;
    const values = [type, amount, description, date, category || null, id, user_id];
    const { rows } = await client.query(query, values);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Transacción no encontrada' });
    }
    res.json({ message: 'Transacción actualizada', transaction: rows[0] });
  } catch (error) {
    console.error('Error en PUT /transactions/:id:', error.message);
    res.status(500).json({ error: 'Error al actualizar transacción', details: error.message });
  } finally {
    client.release();
  }
});

router.delete('/transactions/all', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return res.status(400).json({ error: 'user_id es requerido' });
    }
    await pool.query('DELETE FROM transactions WHERE user_id = $1', [user_id]);
    res.json({ message: 'Todos los datos han sido eliminados' });
  } catch (error) {
    console.error('Error en DELETE /transactions/all:', error.message);
    res.status(500).json({ error: 'Error al limpiar la base de datos', details: error.message });
  }
});

router.delete('/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;
    if (!user_id) {
      return res.status(400).json({ error: 'user_id es requerido' });
    }
    const { rowCount } = await pool.query(
      'DELETE FROM transactions WHERE id = $1 AND user_id = $2',
      [id, user_id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Transacción no encontrada' });
    }
    res.json({ message: 'Transacción eliminada', id });
  } catch (error) {
    console.error('Error en DELETE /transactions/:id:', error.message);
    res.status(500).json({ error: 'Error al eliminar transacción', details: error.message });
  }
});

module.exports = router;
