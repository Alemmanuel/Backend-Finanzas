const express = require('express');
const pool = require('./db');
const { sendMail } = require('./mailer');
const push = require('./push');
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

function formatCOP(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

const DAILY_REMINDER_TITLE = '¿Ya registraste tus gastos de hoy?';
const DAILY_REMINDER_BODY = 'No dejes que se te escapen 💸';
const WEEKLY_REMINDER_TITLE = (total) => `Esta semana gastaste ${formatCOP(total)}`;
const WEEKLY_REMINDER_BODY = 'El próximo domingo te reto a gastar menos';
const INACTIVITY_REMINDER_TITLE = 'Los gastos están de vacaciones';
const INACTIVITY_REMINDER_BODY = '¡Regístralos antes de que se escondan! 😄';
const INACTIVITY_DAYS = 2;

const DAILY_HOUR = 20;
const WEEKLY_WEEKDAY = 'Sun';

async function getSubscriptions(userId) {
  const { rows } = await pool.query(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId]
  );
  return rows.map(r => ({
    endpoint: r.endpoint,
    keys: { p256dh: r.p256dh, auth: r.auth }
  }));
}

async function pushToUser(userId, title, body, url) {
  const subscriptions = await getSubscriptions(userId);
  for (const sub of subscriptions) {
    const result = await push.sendPush(sub, title, body, url);
    if (result && result.expired) {
      try {
        await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
      } catch (e) {
        console.error('Error limpiando suscripción expirada:', e.message);
      }
    }
  }
}

async function logNotification(userId, type, period) {
  await pool.query(
    `INSERT INTO notification_log (user_id, type, period)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, type, period) DO NOTHING`,
    [userId, type, period]
  );
}

async function hasSentNotification(userId, type, period) {
  const { rows } = await pool.query(
    'SELECT 1 FROM notification_log WHERE user_id = $1 AND type = $2 AND period = $3',
    [userId, type, period]
  );
  return rows.length > 0;
}

function getColombiaParts() {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    hour12: false,
    hour: '2-digit',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = {};
  fmt.formatToParts(new Date()).forEach(p => { parts[p.type] = p.value; });
  return {
    hour: Number(parts.hour),
    weekday: parts.weekday,
    date: `${parts.year}-${parts.month}-${parts.day}`
  };
}

function daysSince(dateStr) {
  const today = getColombiaParts().date;
  const last = new Date(dateStr);
  const current = new Date(today + 'T00:00:00');
  return Math.floor((current - last) / 86400000);
}

async function getNotificationSettings(userId) {
  const { rows } = await pool.query(
    'SELECT daily_enabled, weekly_enabled, inactivity_enabled FROM notification_settings WHERE user_id = $1',
    [userId]
  );
  if (rows.length > 0) {
    return { daily_enabled: rows[0].daily_enabled, weekly_enabled: rows[0].weekly_enabled, inactivity_enabled: rows[0].inactivity_enabled };
  }
  const defaults = { daily_enabled: true, weekly_enabled: true, inactivity_enabled: true };
  try {
    await pool.query(
      'INSERT INTO notification_settings (user_id) VALUES ($1)',
      [userId]
    );
  } catch (e) {
    console.error('Error creando settings de notificaciones:', e.message);
  }
  return defaults;
}

async function checkReminders(userId) {
  const settings = await getNotificationSettings(userId);
  const parts = getColombiaParts();
  const sent = [];

  if (settings.daily_enabled && parts.hour === DAILY_HOUR && !(await hasSentNotification(userId, 'daily', parts.date))) {
    const { rows } = await pool.query(
      "SELECT 1 FROM transactions WHERE user_id = $1 AND type = 'expense' AND date = $2 LIMIT 1",
      [userId, parts.date]
    );
    if (rows.length === 0) {
      await pushToUser(userId, DAILY_REMINDER_TITLE, DAILY_REMINDER_BODY, '/#transactions');
      await logNotification(userId, 'daily', parts.date);
      sent.push('daily');
    }
  }

  if (settings.weekly_enabled && parts.weekday === WEEKLY_WEEKDAY && parts.hour === DAILY_HOUR && !(await hasSentNotification(userId, 'weekly', parts.date))) {
    const weekAgo = new Date();
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
    const { rows } = await pool.query(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE user_id = $1 AND type = 'expense' AND date >= $2",
      [userId, weekAgo]
    );
    const total = Number(rows[0].total);
    if (total > 0) {
      await pushToUser(userId, WEEKLY_REMINDER_TITLE(total), WEEKLY_REMINDER_BODY, '/#transactions');
      await logNotification(userId, 'weekly', parts.date);
      sent.push('weekly');
    }
  }

  if (settings.inactivity_enabled && !(await hasSentNotification(userId, 'inactivity', parts.date))) {
    const { rows } = await pool.query(
      "SELECT MAX(date::date::text) AS last FROM transactions WHERE user_id = $1 AND type = 'expense'",
      [userId]
    );
    if (rows[0].last && daysSince(rows[0].last) >= INACTIVITY_DAYS) {
      await pushToUser(userId, INACTIVITY_REMINDER_TITLE, INACTIVITY_REMINDER_BODY, '/#transactions');
      await logNotification(userId, 'inactivity', parts.date);
      sent.push('inactivity');
    }
  }

  return { sent };
}

async function checkBudgetAlerts(userId, email) {
  const { start } = getCycleDates();
  const { rows: budgets } = await pool.query(
    'SELECT id, category, limit_amount, email_alert_sent_at, push_alert_sent_at FROM budgets WHERE user_id = $1',
    [userId]
  );
  const { rows: tx } = await pool.query(
    "SELECT category, amount FROM transactions WHERE user_id = $1 AND type = 'expense' AND date >= $2",
    [userId, start]
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

    const pctText = Math.round(pct);
    const sentChannels = [];

    if (email && !(b.email_alert_sent_at && new Date(b.email_alert_sent_at) >= start)) {
      const subject = level === 'exceeded'
        ? `${b.category} pasó el límite`
        : `¡Cuidado! ${b.category} va en ${pctText}%`;
      const html = level === 'exceeded'
        ? `<h2>¡La billetera llora! 😭</h2><p><strong>${b.category}</strong> pasó el límite: has gastado <strong>${formatCOP(spent)}</strong> de <strong>${formatCOP(limit)}</strong>.</p>`
        : `<h2>¡Frena un poquito! 🛑</h2><p><strong>${b.category}</strong> va en <strong>${pctText}%</strong> (<strong>${formatCOP(spent)}</strong> de <strong>${formatCOP(limit)}</strong>).</p>`;
      try {
        await sendMail(email, subject, html);
        await pool.query('UPDATE budgets SET email_alert_sent_at = NOW() WHERE id = $1', [b.id]);
        sentChannels.push('email');
      } catch (e) {
        console.error('Error enviando email de alerta:', e.message);
      }
    }

    if (!(b.push_alert_sent_at && new Date(b.push_alert_sent_at) >= start)) {
      const title = level === 'exceeded'
        ? `${b.category} pasó el límite`
        : `¡Cuidado! ${b.category} va en ${pctText}%`;
      const body = level === 'exceeded'
        ? `${formatCOP(spent)} de ${formatCOP(limit)}. ¡La billetera llora! 😭`
        : `${formatCOP(spent)} de ${formatCOP(limit)}. Frena un poquito 🛑`;
      await pushToUser(userId, title, body, '/#transactions');
      await pool.query('UPDATE budgets SET push_alert_sent_at = NOW() WHERE id = $1', [b.id]);
      sentChannels.push('push');
    }

    alerts.push({ category: b.category, level, pct, spent, limit, channels: sentChannels });
  }

  return { alerts };
}

router.post('/alerts/check-budgets', async (req, res) => {
  const { user_id, email } = req.body;
  if (!user_id) {
    return res.status(400).json({ error: 'user_id es requerido' });
  }
  try {
    const { alerts } = await checkBudgetAlerts(user_id, email || null);
    res.json({ alerts });
  } catch (error) {
    console.error('Error en POST /alerts/check-budgets:', error.message);
    res.status(500).json({ error: 'Error al verificar alertas', details: error.message });
  }
});

// --- SUSCRIPCIONES PUSH ---

router.get('/push/vapid-public-key', (req, res) => {
  if (!push.isConfigured()) {
    return res.status(500).json({ error: 'VAPID no configurado en el servidor' });
  }
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

router.post('/push/subscribe', async (req, res) => {
  const { user_id, subscription } = req.body;
  if (!user_id || !subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
    return res.status(400).json({ error: 'user_id y subscription son requeridos' });
  }
  try {
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint)
       DO UPDATE SET user_id = $1, p256dh = $3, auth = $4`,
      [user_id, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
    );
    res.status(201).json({ message: 'Suscripción guardada' });
  } catch (error) {
    console.error('Error en POST /push/subscribe:', error.message);
    res.status(500).json({ error: 'Error al guardar suscripción', details: error.message });
  }
});

router.delete('/push/subscribe', async (req, res) => {
  const { user_id, endpoint } = req.body;
  if (!user_id || !endpoint) {
    return res.status(400).json({ error: 'user_id y endpoint son requeridos' });
  }
  try {
    await pool.query(
      'DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2',
      [endpoint, user_id]
    );
    res.json({ message: 'Suscripción eliminada' });
  } catch (error) {
    console.error('Error en DELETE /push/subscribe:', error.message);
    res.status(500).json({ error: 'Error al eliminar suscripción', details: error.message });
  }
});

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

// --- AJUSTES DE NOTIFICACIONES ---

router.get('/notification-settings', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id es requerido' });
  try {
    const settings = await getNotificationSettings(user_id);
    res.json({ data: settings });
  } catch (error) {
    console.error('Error en GET /notification-settings:', error.message);
    res.status(500).json({ error: 'Error al obtener ajustes', details: error.message });
  }
});

router.put('/notification-settings', async (req, res) => {
  const { user_id } = req.body;
  const { daily_enabled, weekly_enabled, inactivity_enabled } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id es requerido' });
  try {
    await pool.query(
      `INSERT INTO notification_settings (user_id, daily_enabled, weekly_enabled, inactivity_enabled)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id)
       DO UPDATE SET daily_enabled = $2, weekly_enabled = $3, inactivity_enabled = $4`,
      [user_id, Boolean(daily_enabled), Boolean(weekly_enabled), Boolean(inactivity_enabled)]
    );
    res.json({ message: 'Ajustes guardados' });
  } catch (error) {
    console.error('Error en PUT /notification-settings:', error.message);
    res.status(500).json({ error: 'Error al guardar ajustes', details: error.message });
  }
});

module.exports = router;
module.exports.checkBudgetAlerts = checkBudgetAlerts;
module.exports.checkReminders = checkReminders;
