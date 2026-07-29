const express = require('express');
const nodemailer = require('nodemailer');
const router = express.Router();

const codes = new Map();

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SMTP_HOST,
  port: parseInt(process.env.EMAIL_SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.EMAIL_ADDRESS,
    pass: process.env.EMAIL_PASSWORD
  }
});

router.post('/send-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requerido' });

    const code = generateCode();
    codes.set(email.toLowerCase(), { code, expires: Date.now() + 300000 });

    await transporter.sendMail({
      from: process.env.EMAIL_ADDRESS,
      to: email,
      subject: 'Tu código de acceso - Control de Finanzas',
      text: `Tu código de acceso es: ${code}\nVálido por 5 minutos.`
    });

    res.json({ message: 'Código enviado' });
  } catch (error) {
    console.error('Error enviando código:', error.message);
    res.status(500).json({ error: 'Error al enviar código' });
  }
});

router.post('/verify-code', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Email y código requeridos' });

  const entry = codes.get(email.toLowerCase());
  if (!entry) return res.status(400).json({ error: 'Solicita un código primero' });
  if (Date.now() > entry.expires) {
    codes.delete(email.toLowerCase());
    return res.status(400).json({ error: 'Código expirado' });
  }
  if (entry.code !== code) return res.status(400).json({ error: 'Código incorrecto' });

  codes.delete(email.toLowerCase());
  res.json({
    user_id: email.toLowerCase().replace(/[@.]/g, '_'),
    name: email.split('@')[0],
    email
  });
});

module.exports = router;
