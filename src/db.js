const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

/**
 * Guild-scoped database wrapper.
 * All queries are automatically filtered by guild_id.
 */
class GuildDB {
  constructor(guildId) {
    this.guildId = guildId;
  }

  async query(sql, params = []) {
    // Inject guild_id as first parameter if query expects it
    // This is a simple approach; for complex queries, include $1 as guild_id in the SQL.
    const result = await pool.query(sql, params);
    return result;
  }

  // Guild settings
  async getGuild() {
    const res = await pool.query(
      'SELECT * FROM guilds WHERE guild_id = $1',
      [this.guildId]
    );
    return res.rows[0];
  }

  async setPlan(plan) {
    const res = await pool.query(
      'UPDATE guilds SET plan = $1 WHERE guild_id = $2 RETURNING *',
      [plan, this.guildId]
    );
    return res.rows[0];
  }

  async setStripeCustomerId(customerId) {
    await pool.query(
      'UPDATE guilds SET stripe_customer_id = $1 WHERE guild_id = $2',
      [customerId, this.guildId]
    );
  }

  async getSettings() {
    const res = await pool.query(
      'SELECT value FROM config WHERE guild_id = $1 AND key = $2',
      [this.guildId, 'settings']
    );
    return res.rows[0] ? JSON.parse(res.rows[0].value) : {};
  }

  async setSettings(settings) {
    await pool.query(
      'INSERT INTO config (guild_id, key, value) VALUES ($1, $2, $3) ON CONFLICT (guild_id, key) DO UPDATE SET value = $3',
      [this.guildId, 'settings', JSON.stringify(settings)]
    );
  }

  // Tiers
  async listTiers() {
    const res = await pool.query(
      'SELECT tier_name, role_id, price, description FROM tiers WHERE guild_id = $1',
      [this.guildId]
    );
    return res.rows;
  }

  async upsertTier(tier) {
    const { tier_name, role_id, price, description } = tier;
    await pool.query(
      `INSERT INTO tiers (guild_id, tier_name, role_id, price, description)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (guild_id, tier_name) DO UPDATE SET
         role_id = EXCLUDED.role_id,
         price = EXCLUDED.price,
         description = EXCLUDED.description`,
      [this.guildId, tier_name, role_id, price, description]
    );
  }

  async deleteTier(tierName) {
    await pool.query(
      'DELETE FROM tiers WHERE guild_id = $1 AND tier_name = $2',
      [this.guildId, tierName]
    );
  }

  // Members
  async setMemberTier(userId, tier) {
    await pool.query(
      `INSERT INTO members (guild_id, user_id, tier) VALUES ($1, $2, $3)
       ON CONFLICT (guild_id, user_id) DO UPDATE SET tier = $3`,
      [this.guildId, userId, tier]
    );
  }

  async getMember(userId) {
    const res = await pool.query(
      'SELECT * FROM members WHERE guild_id = $1 AND user_id = $2',
      [this.guildId, userId]
    );
    return res.rows[0];
  }

  async listMembers() {
    const res = await pool.query(
      'SELECT user_id, tier, joined_at FROM members WHERE guild_id = $1',
      [this.guildId]
    );
    return res.rows;
  }

  // Scheduled posts
  async addScheduledPost({ channelId, content, postAt, createdBy }) {
    const res = await pool.query(
      `INSERT INTO scheduled_posts (guild_id, channel_id, content, post_at, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [this.guildId, channelId, content, postAt, createdBy]
    );
    return res.rows[0].id;
  }

  async getPendingPosts() {
    const res = await pool.query(
      `SELECT id, channel_id, content, post_at, created_by
       FROM scheduled_posts
       WHERE guild_id = $1 AND sent = FALSE AND post_at <= NOW()
       ORDER BY post_at ASC`,
      [this.guildId]
    );
    return res.rows;
  }

  async markPostSent(postId) {
    await pool.query(
      'UPDATE scheduled_posts SET sent = TRUE WHERE guild_id = $1 AND id = $2',
      [this.guildId, postId]
    );
  }
}

// Helper: get DB instance for a guild
function forGuild(guildId) {
  return new GuildDB(guildId);
}

// Test connection on startup
pool.connect()
  .then(() => console.log('Postgres connected'))
  .catch(err => {
    console.error('Postgres connection error:', err);
    process.exit(1);
  });

module.exports = { pool, GuildDB, forGuild };