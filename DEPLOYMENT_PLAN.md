# Creator Bot SaaS — Deployment & Hosting Plan

## Overview
Transform the single-tenant `creator-bot` into a multi-tenant SaaS serving OnlyFans/creator Discord communities. Target: $10–30/mo per guild, 50–100 customers → $600–3,600 MRR within 12 months.

---

## Architecture Changes (v2 Multi-Tenant)

### Database: SQLite → Postgres
- **Why**: SQLite file-based doesn't scale for concurrent SaaS; Postgres provides row-level isolation, backups, connection pooling.
- **Schema changes**: Add `guild_id` (Discord guild ID) as tenant identifier to all tables.
- **Tables**:
  - `guilds` (guild_id, plan, stripe_customer_id, created_at, settings_json)
  - `tiers` (guild_id, tier_name, role_id, price, description) — composite PK (guild_id, tier_name)
  - `members` (guild_id, user_id, tier, joined_at, total_tips) — composite PK (guild_id, user_id)
  - `scheduled_posts` (guild_id, id, channel_id, content, post_at, created_by, sent)
  - `config` (guild_id, key, value) — per-guild config (welcome message, etc.)
- **Tool**: Use Kestrel (https://kestrel.rs) as embedded Postgres for cheap VPS deployments, or Supabase/Neon for managed.

### Bot Instance: Single Bot, Multi-Guild
- Keep single Node.js process; use `guild_id` to scope all operations.
- On `guildCreate` event: auto-create entry in `guilds` table with default plan (Free tier).
- Commands now operate per-guild automatically (no cross-guild leakage).

### Tenant Isolation
- All queries must include `WHERE guild_id = ?` (parameterized).
- Use a wrapper: `db.guild(guildId).tiers.find(...)` to enforce scoping.
- Validate guild membership before processing commands (Discord.js provides guild context).

### Configuration
- Replace `config.json` with environment variables for global defaults:
  - `BOT_TOKEN` (Discord bot token)
  - `DATABASE_URL` (Postgres connection)
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
  - `JWT_SECRET` (for admin portal auth)
  - `PORT` (for admin dashboard)
- Per-guild settings stored in DB `config` table.

---

## Hosting & Infrastructure Options

### Option 1: VPS (Cheapest, ~$5–10/mo)
- **Provider**: Hetzner, Vultr, DigitalOcean
- **Stack**:
  - Ubuntu 24.04
  - Node.js 20 + PM2 (process manager)
  - Postgres 16 (install from apt or Docker)
  - Nginx reverse proxy (for admin dashboard + webhooks)
  - Let's Encrypt SSL (certbot)
- **Cost**: $5/mo (VPS) + $0 (Postgres) = ~$5/mo for first 10–20 tenants.
- **Pros**: Full control, low cost, simple.
- **Cons**: Manual ops (backups, updates), single point of failure (mitigate with backups + easy redeploy).

### Option 2: Platform-as-a-Service (Easier, ~$20–50/mo)
- **Render.com** or **Railway.app**:
  - Deploy Node.js bot as background worker.
  - Postgres as managed add-on.
  - Automatic HTTPS, zero-downtime deploys.
- **Cost**: $7–25/mo for bot instance + $7–25/mo for Postgres = ~$20–50/mo.
- **Pros**: Git push deploy, managed DB, easy scaling.
- **Cons**: More expensive, vendor lock-in.

### Option 3: Container-Based (Docker + Kubernetes)
- Dockerize app; deploy to DigitalOcean App Platform or Fly.io.
- Good for scaling to 100+ tenants but overkill for v1 SaaS.
- **Cost**: ~$10–30/mo for small scale.
- **Recommendation**: Start with Option 1 (VPS) to keep costs minimal; migrate to Option 2 if ops become burdensome.

---

## Deployment Steps (VPS Option)

1. **Provision server** (Ubuntu 24.04, 2 GB RAM, 40 GB SSD).
2. **Security hardening**:
   - Create non-root user `creatorbot`.
   - SSH key-only auth, disable password.
   - UFW firewall: allow 22 (SSH), 80/443 (HTTP/HTTPS), 3000 (dashboard).
3. **Install dependencies**:
   - Node.js 20 (nvm or NodeSource).
   - Postgres 16 (`apt install postgresql postgresql-contrib`).
   - Nginx (`apt install nginx`).
   - Certbot (`apt install certbot python3-certbot-nginx`).
4. **Database setup**:
   - `sudo -u postgres createuser creatorbot`
   - `sudo -u postgres createdb creatorbot_prod`
   - Grant privileges, set password in `.env`.
5. **Bot deployment**:
   - Clone repo to `/opt/creator-bot`.
   - `npm ci --only=production`.
   - Copy `.env` from secrets manager (or use Ansible/Vault).
   - `pm2 start bot.js --name creator-bot`.
   - `pm2 save && pm2 startup`.
6. **Admin dashboard** (optional, but recommended for customer self-serve):
   - Build simple Express.js app (port 3000) for:
     - Tenant billing status (Stripe integration)
     - Config editor (welcome message, tier management)
     - Stats overview
   - Nginx proxy: `location /admin` → localhost:3000 with basic auth or JWT.
7. **Webhooks**:
   - Stripe webhook endpoint: `/webhooks/stripe` (verify signature, update guild plan).
   - Discord OAuth2 redirect (if adding login for dashboard).
8. **SSL**:
   - Domain A record → VPS IP.
   - `certbot --nginx -d creator-bot.yourdomain.com`.
9. **Monitoring**:
   - PM2 logs: `pm2 logs creator-bot`.
   - Set up logrotate for `/var/log/nginx/access.log`.
   - Uptime monitor (UptimeRobot or health check endpoint).
10. **Backups**:
    - Daily Postgres dump: `pg_dump creatorbot_prod > /backups/creatorbot-$(date +%F).sql`.
    - Upload to S3/Backblaze B2 (optional).
    - Retain 7 days.

---

## Billing & Payments (Stripe)

### Pricing Tiers
- **Free**: 100 members, 3 scheduled posts, basic commands.
- **Pro**: $15/mo — unlimited members, unlimited posts, priority support.
- **Agency**: $30/mo — multi-guild management, API access, custom branding.

### Stripe Setup
1. Create Stripe account, get `STRIPE_SECRET_KEY` and `STRIPE_PUBLIC_KEY`.
2. Products & Prices in Stripe Dashboard:
   - `price_pro_monthly` (recurring)
   - `price_agency_monthly` (recurring)
3. Checkout flow:
   - Customer clicks "Upgrade" in dashboard → Stripe Checkout Session.
   - Webhook `checkout.session.completed` → update guild plan in DB.
4. Subscription management:
   - Handle `customer.subscription.updated`, `customer.subscription.deleted` to downgrade/cancel.
5. invoicing: automatic receipts, dunning management handled by Stripe.

### Implementation (quick)
- Stripe Checkout Server-Side: create session → redirect to Stripe-hosted page.
- Stripe customer portal: allow self-service plan changes.
- Minimal integration: ~200 lines of Express.js code.

---

## Customer Onboarding Flow

1. **Invite bot** to Discord server via OAuth2 link:
   - `https://discord.com/api/oauth2/authorize?client_id=BOT_CLIENT_ID&scope=bot%20applications.commands&permissions=268435456` (Manage Roles, Send Messages, Manage Channels, Use Slash Commands).
2. Bot joins → auto-creates guild record in DB (Free plan).
3. Admin runs `/setup` wizard (slash command) to:
   - Set subscription tiers (Free/Silver/Gold roles)
   - Configure welcome message
   - Set up role-gated channels
4. Admin accesses dashboard at `https://creator-bot.yourdomain.com/admin?guild_id=XXX` (simple auth: Discord OAuth2 or shared secret).
5. Upgrade to Pro/Agency via Stripe Checkout.

---

## DevOps & Scaling

### Scaling to 50–100 Tenants
- Single VPS (2 GB RAM) can handle ~100–200 guilds with moderate activity.
- Monitor Node.js memory; if > 1 GB, upgrade to 4 GB.
- Postgres: 1 GB RAM enough for < 100k rows; add indexes on `guild_id`.
- PM2 cluster mode (`pm2 start bot.js -i max`) to use all CPU cores.

### Observability
- PM2 metrics: `pm2 monit`.
- Simple health endpoint: `GET /health` returns `{status: "ok", guilds: count, uptime: seconds}`.
- Log aggregation: ship PM2 logs to Papertrail or Logtail (optional).

### Updates
- Deployment script: `git pull && npm ci && pm2 reload creator-bot`.
- Zero-downtime: PM2 reload maintains connections; Discord.js reconnects automatically.
- Database migrations: use `node_modules/.bin/knex` or simple SQL scripts in `migrations/` folder; run on deploy if pending.

---

## Security Considerations

- **Bot token**: Store in env `BOT_TOKEN`; never commit.
- **Database credentials**: env `DATABASE_URL` (use Postgres password).
- **Stripe keys**: env vars; restrict API keys to necessary webhooks.
- **Admin dashboard**: protect with JWT or basic auth; rate-limit login attempts.
- **Discord intents**: only request necessary (Guilds, GuildMembers, GuildMessages, MessageContent, DirectMessages).
- **SQL injection prevention**: use parameterized queries (`db.prepare('... WHERE guild_id = ?').get(guildId)`).
- **Data isolation**: enforce `guild_id` in every query; code review to catch missing filters.

---

## Roadmap to MVP (SaaS Launch)

Week 1:
- [ ] Refactor DB to Postgres, add `guild_id` scoping.
- [ ] Implement per-guild config (welcome message, tiers).
- [ ] Deploy to VPS, basic monitoring.

Week 2:
- [ ] Build admin dashboard (Express + EJS or React SPA).
- [ ] Stripe integration (products, checkout, webhook).
- [ ] Test full flow: invite bot → setup → upgrade → downgrade.

Week 3:
- [ ] Polish: error handling, logging, support email.
- [ ] Documentation: installation guide, FAQ.
- [ ] Pricing page (static site or Carrd).

Week 4:
- [ ] Soft launch to 2–3 creator friends (free beta).
- [ ] Collect feedback, fix bugs.
- [ ] Public launch: post on r/onlyfans, Discord bot lists, creator forums.

---

## Cost Breakdown (Initial)

| Item                      | Monthly Cost |
|---------------------------|--------------|
| VPS (Hetzner CX11)        | $5           |
| Domain (creator-bot.tools)| $10/year (~$0.83/mo) |
| Stripe fees               | 2.9% + $0.30 per transaction |
| **Total fixed**           | **~$6/mo**   |

Variable costs: PM2 memory upgrade if needed ($10–20/mo), managed Postgres ($7–25/mo) if self-hosted becomes too much.

---

## Risks & Mitigations

- **Discord rate limits**: Discord.js handles reconnection; ensure proper intents (use GuildMembers intent only if needed). Mitigate with sharding at > 250 guilds (not needed initially).
- **OnlyFans TOS**: Bot doesn't interact with OnlyFans API, so low risk. But advise customers to comply with OnlyFans' Discord promotion guidelines (include clear disclaimer).
- **Support burden**: Start with email only; limit support hours; create knowledge base from SPEC.md.
- **Churn**: Keep features simple, focus on reliability; add sticky features (scheduled posts, stats) to increase perceived value.

---

## Next Steps

1. Get your approval to proceed with multi-tenant refactor.
2. Choose hosting option (VPS recommended for bootstrapping).
3. I can generate the database migration scripts and dashboard skeleton code.
4. You provision server and provide env vars (bot token, domain).
5. I deploy and test; you review and provide feedback.

Ready to spin this up? This could be your fastest path to MRR.