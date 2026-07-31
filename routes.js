const express = require('express');
const pool = require('./db');
const { sendMail } = require('./mailer');
const router = express.Router();

function getCycleDates(now = new Date()) {
  let start, end;
  if (now.getDate() >= 25) {
    start = new Date(now.getFullYear(), now.getMonth(), 25, 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 24, 23, 59, 59, 999);
  } else {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 25, 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth(), 24, 23, 59, 59, 999);
  }
  return { start, end };
}

router.get('/transactions', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ error: 'user_id es requerido' });
  }
  try {
    const { rows } = await pool.query(
      "SELECT id, user_id, type, amount, description, category, date::date::text AS date, created_at FROM transactions WHERE user_id = $1 ORDER BY date DESC",
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
      RETURNING id, user_id, type, amount, description, category, date::date::text AS date, created_at`;
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
      RETURNING id, user_id, type, amount, description, category, date::date::text AS date, created_at`;
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

// --- BUDGETS ---

router.get('/budgets', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ error: 'user_id es requerido' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT id, category, limit_amount FROM budgets WHERE user_id = $1 ORDER BY category',
      [user_id]
    );
    res.json({ data: rows });
  } catch (error) {
    console.error('Error en GET /budgets:', error.message);
    res.status(500).json({ error: 'Error al obtener presupuestos', details: error.message });
  }
});

router.post('/budgets', async (req, res) => {
  const { user_id, category, limit_amount } = req.body;
  if (!user_id || !category || limit_amount === undefined) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO budgets (user_id, category, limit_amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, category)
       DO UPDATE SET limit_amount = $3
       RETURNING id, category, limit_amount`,
      [user_id, category, limit_amount]
    );
    res.status(201).json({ data: rows[0] });
  } catch (error) {
    console.error('Error en POST /budgets:', error.message);
    res.status(500).json({ error: 'Error al guardar presupuesto', details: error.message });
  }
});

router.delete('/budgets/:category', async (req, res) => {
  const { user_id } = req.query;
  const { category } = req.params;
  if (!user_id || !category) {
    return res.status(400).json({ error: 'user_id y category son requeridos' });
  }
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM budgets WHERE user_id = $1 AND category = $2',
      [user_id, category]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Presupuesto no encontrado' });
    }
    res.json({ message: 'Presupuesto eliminado' });
  } catch (error) {
    console.error('Error en DELETE /budgets/:category:', error.message);
    res.status(500).json({ error: 'Error al eliminar presupuesto', details: error.message });
  }
});

// --- ALERTAS DE PRESUPUESTO ---

router.post('/alerts/check-budgets', async (req, res) => {
  const { user_id, email } = req.body;
  if (!user_id || !email) {
    return res.status(400).json({ error: 'user_id y email son requeridos' });
  }
  try {
    const { start } = getCycleDates();
    const { rows: budgets } = await pool.query(
      'SELECT id, category, limit_amount, alert_sent_at FROM budgets WHERE user_id = $1',
      [user_id]
    );
    const { rows: tx } = await pool.query(
      "SELECT category, amount FROM transactions WHERE user_id = $1 AND type = 'expense' AND date >= $2",
      [user_id, start]
    );

    const spentByCategory = {};
    tx.forEach(t => {
      const cat = t.category || 'Sin categoría';
      spentByCategory[cat] = (spentByCategory[cat] || 0) + Number(t.amount);
    });

    const alerts = [];
    for (const b of budgets) {
      const limit = Number(b.limit_amount);
      const spent = spentByCategory[b.category] || 0;
      const pct = limit > 0 ? (spent / limit) * 100 : 0;

      const level = pct >= 100 ? 'exceeded' : pct >= 80 ? 'warning' : null;
      if (!level) continue;

      const alreadySent = b.alert_sent_at && new Date(b.alert_sent_at) >= start;
      if (alreadySent) continue;

      const pctText = Math.round(pct);
      const subject = level === 'exceeded'
        ? `⚠️ Presupuesto excedido: ${b.category}`
        : `⚠️ Presupuesto al ${pctText}%: ${b.category}`;
      const html = level === 'exceeded'
        ? `<h2>Presupuesto excedido</h2><p>Has gastado <strong>${formatCOP(spent)}</strong> de <strong>${formatCOP(limit)}</strong> en <strong>${b.category}</strong> (${pctText}%).</p>`
        : `<h2>Presupuesto casi al límite</h2><p>Has gastado <strong>${formatCOP(spent)}</strong> de <strong>${formatCOP(limit)}</strong> en <strong>${b.category}</strong> (${pctText}%).</p>`;

      await sendMail(email, subject, html);
      await pool.query(
        'UPDATE budgets SET alert_sent_at = NOW() WHERE id = $1',
        [b.id]
      );
      alerts.push({ category: b.category, level, pct, spent, limit });
    }

    res.json({ alerts });
  } catch (error) {
    console.error('Error en POST /alerts/check-budgets:', error.message);
    res.status(500).json({ error: 'Error al verificar alertas', details: error.message });
  }
});

function formatCOP(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

// --- CATEGORÍAS ---

router.get('/categories', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id es requerido' });
  try {
    const { rows } = await pool.query(
      'SELECT id, name, color FROM categories WHERE user_id = $1 ORDER BY name',
      [user_id]
    );
    res.json({ data: rows });
  } catch (error) {
    console.error('Error en GET /categories:', error.message);
    res.status(500).json({ error: 'Error al obtener categorías', details: error.message });
  }
});

router.post('/categories', async (req, res) => {
  const { user_id, name, color } = req.body;
  if (!user_id || !name) return res.status(400).json({ error: 'user_id y name son requeridos' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO categories (user_id, name, color)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, name)
       DO UPDATE SET color = $3
       RETURNING id, name, color`,
      [user_id, name, color || null]
    );
    res.status(201).json({ data: rows[0] });
  } catch (error) {
    console.error('Error en POST /categories:', error.message);
    res.status(500).json({ error: 'Error al guardar categoría', details: error.message });
  }
});

router.delete('/categories/:name', async (req, res) => {
  const { user_id } = req.query;
  const { name } = req.params;
  if (!user_id || !name) return res.status(400).json({ error: 'user_id y name son requeridos' });
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM categories WHERE user_id = $1 AND name = $2',
      [user_id, name]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Categoría no encontrada' });
    res.json({ message: 'Categoría eliminada' });
  } catch (error) {
    console.error('Error en DELETE /categories/:name:', error.message);
    res.status(500).json({ error: 'Error al eliminar categoría', details: error.message });
  }
});

module.exports = router;
