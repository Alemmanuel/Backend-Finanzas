const webpush = require('web-push');

function isConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configure() {
  if (!isConfigured()) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

async function sendPush(subscription, title, body, url) {
  if (!isConfigured()) return { skipped: true };
  const payload = JSON.stringify({ title, body, url: url || '/#transactions' });
  try {
    await webpush.sendNotification(subscription, payload);
    return { sent: true };
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      return { expired: true, statusCode: err.statusCode };
    }
    console.error('Error enviando push:', err.message);
    return { error: err.message };
  }
}

module.exports = { configure, sendPush, isConfigured };
