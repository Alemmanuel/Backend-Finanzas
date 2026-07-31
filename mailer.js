const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SMTP_HOST,
  port: parseInt(process.env.EMAIL_SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.EMAIL_ADDRESS,
    pass: process.env.EMAIL_PASSWORD
  }
});

async function sendMail(to, subject, html) {
  return transporter.sendMail({
    from: process.env.EMAIL_ADDRESS,
    to,
    subject,
    html
  });
}

module.exports = { sendMail, transporter };
