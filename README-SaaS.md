# Creator Bot SaaS — Multi-Tenant Edition

> Turn-key Discord bot for OnlyFans/creator communities. Host yourself or ship as SaaS.

## Features

- **Role-gated tiers**: Free / Pro / Agency with price-based roles
- **Welcome messages**: Customizable per-server welcome
- **Scheduled posts**: Automated content drops with minute precision
- ** Stripe billing**: Built-in subscription management (checkout + portal)
- **Admin dashboard**: Web UI to manage guilds, view members, edit config
- **Multi-tenant**: Single codebase, secure data isolation

## Quick Start (Docker Compose)

1. Clone and enter project:
   ```bash
   cd ~/creator-bot
   ```

2. Copy `.env.example` to `.env` and fill in all keys:
   - `BOT_TOKEN` and `CLIENT_ID` from Discord Developer Portal
   - `DATABASE_URL` (Postgres url if using external DB; otherwise Docker creates local)
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PRICE_PRO`, `PRICE_AGENCY`
   - `JWT_SECRET` (random string), `ADMIN_PASSWORD` (for dashboard)
   - `APP_URL` (your public domain, optional for Docker)

3. Bring up stack:
   ```bash
   docker-compose up -d
   ```
   This starts Postgres, the bot, and the dashboard on port 3000.

4. Register slash commands:
   ```bash
   docker-compose exec bot npx --yes cli/deploy-commands.js
   ```
   (or run `node scripts/deploy-commands.js` locally)

5. Invite bot to your Discord server:
   ```
   https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot%20applications.commands&permissions=268435456
   ```

6. Access dashboard at `http://your-server:3000/admin/login` with your admin password.

7. Initial Stripe setup: run `node scripts/stripe-init.js` to create products/prices and get `PRICE_PRO` & `PRICE_AGENCY`. Add these to `.env`.

8. Set up Discord webhook for Stripe → `https://yourdomain.com/webhooks/stripe` (use ngrok for dev). Add the secret to `.env`.

Done.

## Manual Installation (VPS)

See `DEPLOYMENT_PLAN.md` for step-by-step VPS hardening, PM2, Nginx, SSL.

## Architecture

- **Bot** (`bot.js`): Discord.js events, slash commands, scheduled post poller.
- **DB** (`src/db.js`): Guild-scoped Postgres wrapper.
- **Dashboard** (`dashboard/`): Express + EJS admin panel.
- **Migrations** (`migrations/`): SQL to set up schema.

## Database Schema

- `guilds` (tenant records, plan, Stripe customer)
- `tiers` (per-guild subscription tiers)
- `members` (per-guild member tier assignments)
- `scheduled_posts` (queue of pending posts)
- `config` (per-guild settings JSON)

 Run `migrations/001_initial_schema.sql` on your database.

## Env Vars

| Variable | Purpose |
|----------|---------|
| `BOT_TOKEN` | Discord bot token |
| `CLIENT_ID` | Discord application ID (for slash commands) |
| `DATABASE_URL` | Postgres connection string |
| `STRIPE_SECRET_KEY` | Stripe secret API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `PRICE_PRO` | Stripe price ID for Pro tier |
| `PRICE_AGENCY` | Stripe price ID for Agency tier |
| `JWT_SECRET` | Secret for admin dashboard JWT |
| `ADMIN_PASSWORD` | Dashboard login password |
| `APP_URL` | Public URL for Stripe callbacks |
| `PORT` | Dashboard port (default 3000) |

## Commands

- `/setup welcome message:<text>` — Set server welcome message
- `/setup tiers name:<name> role:<role_id> price:<amount> desc:<text>` — Create a tier
- `/tier list` — Show tiers
- `/tier assign user:<@user> tier:<name>` — Assign tier
- `/tier info` — Show your current tier
- `/schedule message:<text> delay:<minutes> [channel]` — Schedule a message (0-60 min)
- `/welcome show` — Display current welcome message
- `/welcome set message:<text>` — Alias for `/setup welcome`

## Monetization

- **Free**: Basic features, limited scheduling
- **Pro**: $15/mo — unlimited scheduling,priority support
- **Agency**: $30/mo — multi-guild management, API access

Stripe handles subscription lifecycle; dashboard shows billing status and provides portal link.

## Contributing

Fork and PR. Keep changes scoped to relevant folders.

## License

MIT.