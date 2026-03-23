require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { Pool } = require('pg');
const Stripe = require('stripe');
const jwt = require('jsonwebtoken');

const app = express();
app.set('view engine', 'ejs');
app.use(cookieParser());
app.use(express.json());
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const JWT_SECRET = process.env.JWT_SECRET || 'change-me';

// Middleware: simple JWT auth
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    res.status(403).json({ error: 'Invalid token' });
  }
}

// Admin login page
app.get('/admin/login', (req, res) => {
  res.render('login');
});

app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) return res.status(403).send('Invalid password');
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
  res.redirect('/admin/guilds?token=' + token);
});

// Admin: list all guilds
app.get('/admin/guilds', auth, async (req, res) => {
  const result = await pool.query(`
    SELECT g.guild_id, g.plan, g.created_at, COUNT(m.user_id) as member_count
    FROM guilds g
    LEFT JOIN members m ON g.guild_id = m.guild_id
    GROUP BY g.guild_id
    ORDER BY g.created_at DESC
    LIMIT 100
  `);
  res.render('index', { guilds: result.rows });
});

// Admin: get guild details (render page)
app.get('/admin/guild/:guildId', auth, async (req, res) => {
  const { guildId } = req.params;
  const guildRes = await pool.query('SELECT * FROM guilds WHERE guild_id = $1', [guildId]);
  const tiersRes = await pool.query('SELECT * FROM tiers WHERE guild_id = $1', [guildId]);
  const settingsRes = await pool.query('SELECT value FROM config WHERE guild_id = $1 AND key = $2', [guildId, 'settings']);
  const settings = settingsRes.rows[0] ? JSON.parse(settingsRes.rows[0].value) : {};
  const guild = guildRes.rows[0];
  if (!guild) return res.status(404).send('Guild not found');
  res.render('guild', { guild, tiers: tiersRes.rows, settings });
});

// Admin: update guild plan (after Stripe webhook or manual)
app.post('/admin/guild/:guildId/plan', auth, async (req, res) => {
  const { guildId } = req.params;
  const { plan } = req.body;
  await pool.query('UPDATE guilds SET plan = $1 WHERE guild_id = $2', [plan, guildId]);
  res.redirect('back');
});

// Admin: save guild config (welcome message, etc.)
app.post('/admin/guild/:guildId/config', auth, async (req, res) => {
  const { guildId } = req.params;
  const { welcomeMessage } = req.body;
  const settings = { welcomeMessage };
  await pool.query(
    'INSERT INTO config (guild_id, key, value) VALUES ($1, $2, $3) ON CONFLICT (guild_id, key) DO UPDATE SET value = $3',
    [guildId, 'settings', JSON.stringify(settings)]
  );
  res.redirect('back');
});

// Admin: add tier
app.post('/admin/guild/:guildId/tiers', auth, async (req, res) => {
  const { guildId } = req.params;
  const { tier_name, role_id, price, description } = req.body;
  await pool.query(
    `INSERT INTO tiers (guild_id, tier_name, role_id, price, description)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (guild_id, tier_name) DO UPDATE SET
       role_id = EXCLUDED.role_id,
       price = EXCLUDED.price,
       description = EXCLUDED.description`,
    [guildId, tier_name, role_id, price, description]
  );
  res.redirect('back');
});

// Admin: delete tier
app.delete('/admin/guild/:guildId/tiers/:tierName', auth, async (req, res) => {
  const { guildId, tierName } = req.params;
  await pool.query('DELETE FROM tiers WHERE guild_id = $1 AND tier_name = $2', [guildId, tierName]);
  res.json({ ok: true });
});

// Stripe: create checkout session
app.post('/stripe/checkout', auth, async (req, res) => {
  const { guildId, priceId } = req.body;
  const guild = await pool.query('SELECT stripe_customer_id FROM guilds WHERE guild_id = $1', [guildId]);
  const customerId = guild.rows[0]?.stripe_customer_id;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${process.env.APP_URL}/admin?guild_id=${guildId}&success=1`,
    cancel_url: `${process.env.APP_URL}/admin?guild_id=${guildId}&cancel=1`,
    metadata: { guild_id: guildId }
  });

  res.json({ url: session.url });
});

// Stripe: customer portal (manage subscription)
app.post('/stripe/portal', auth, async (req, res) => {
  const { customerId } = req.body;
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: process.env.APP_URL
  });
  res.json({ url: session.url });
});

// Stripe webhook endpoint
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  const { type, data } = event;
  if (type === 'checkout.session.completed') {
    const { guild_id, customer } = data.object;
    const subscription = data.object.subscription;
    // Map Stripe priceId to plan tier
    const priceId = data.object.display_items[0].price.id;
    const plan = priceId === process.env.PRICE_PRO ? 'pro' : priceId === process.env.PRICE_AGENCY ? 'agency' : 'free';
    await pool.query('UPDATE guilds SET plan = $1, stripe_customer_id = $2 WHERE guild_id = $3', [plan, customer, guild_id]);
  } else if (type === 'customer.subscription.deleted' || type === 'customer.subscription.updated') {
    const { customer } = data.object;
    await pool.query('UPDATE guilds SET plan = $1 WHERE stripe_customer_id = $2', ['free', customer]);
  }

  res.json({ received: true });
});

// Simple login endpoint (for demo; use Discord OAuth2 in production)
app.get('/admin/login', (req, res) => {
  res.render('login');
});

app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) return res.status(403).send('Invalid password');
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('admin_token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.redirect('/admin/guilds');
});

function auth(req, res, next) {
  const token = req.cookies.admin_token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.redirect('/admin/login');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    res.clearCookie('admin_token');
    res.redirect('/admin/login');
  }
}

app.get('/admin/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.redirect('/admin/login');
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Landing page (public)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Admin dashboard listening on ${PORT}`);
});