const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
require('dotenv').config();

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'creator-bot.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS guilds (
    guild_id TEXT PRIMARY KEY,
    plan TEXT DEFAULT 'free',
    stripe_customer_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tiers (
    guild_id TEXT,
    tier_name TEXT,
    role_id TEXT,
    price REAL,
    description TEXT,
    PRIMARY KEY (guild_id, tier_name)
  );

  CREATE TABLE IF NOT EXISTS members (
    guild_id TEXT,
    user_id TEXT,
    tier TEXT,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS config (
    guild_id TEXT,
    key TEXT,
    value TEXT,
    PRIMARY KEY (guild_id, key)
  );

  CREATE TABLE IF NOT EXISTS scheduled_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT,
    channel_id TEXT,
    content TEXT,
    post_at DATETIME,
    sent INTEGER DEFAULT 0,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

/**
 * Guild-scoped database wrapper.
 * All queries are automatically filtered by guild_id.
 */
class GuildDB {
  constructor(guildId) {
    this.guildId = guildId;
  }

  // Guild settings
  getGuild() {
    const stmt = db.prepare('SELECT * FROM guilds WHERE guild_id = ?');
    return stmt.get(this.guildId);
  }

  setPlan(plan) {
    const stmt = db.prepare(
      'INSERT INTO guilds (guild_id, plan) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET plan = ?'
    );
    return stmt.run(this.guildId, plan, plan);
  }

  setStripeCustomerId(customerId) {
    const stmt = db.prepare(
      'INSERT INTO guilds (guild_id, stripe_customer_id) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET stripe_customer_id = ?'
    );
    return stmt.run(this.guildId, customerId, customerId);
  }

  getSettings() {
    const stmt = db.prepare('SELECT value FROM config WHERE guild_id = ? AND key = ?');
    const row = stmt.get(this.guildId, 'settings');
    return row ? JSON.parse(row.value) : {};
  }

  setSettings(settings) {
    const stmt = db.prepare(
      'INSERT INTO config (guild_id, key, value) VALUES (?, ?, ?) ON CONFLICT(guild_id, key) DO UPDATE SET value = ?'
    );
    return stmt.run(this.guildId, 'settings', JSON.stringify(settings), JSON.stringify(settings));
  }

  // Tiers
  listTiers() {
    const stmt = db.prepare(
      'SELECT tier_name, role_id, price, description FROM tiers WHERE guild_id = ?'
    );
    return stmt.all(this.guildId);
  }

  upsertTier(tier) {
    const { tier_name, role_id, price, description } = tier;
    const stmt = db.prepare(
      `INSERT INTO tiers (guild_id, tier_name, role_id, price, description)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(guild_id, tier_name) DO UPDATE SET
         role_id = excluded.role_id,
         price = excluded.price,
         description = excluded.description`
    );
    return stmt.run(this.guildId, tier_name, role_id, price, description);
  }

  deleteTier(tierName) {
    const stmt = db.prepare(
      'DELETE FROM tiers WHERE guild_id = ? AND tier_name = ?'
    );
    return stmt.run(this.guildId, tierName);
  }

  // Members
  setMemberTier(userId, tier) {
    const stmt = db.prepare(
      `INSERT INTO members (guild_id, user_id, tier) VALUES (?, ?, ?)
       ON CONFLICT(guild_id, user_id) DO UPDATE SET tier = ?`
    );
    return stmt.run(this.guildId, userId, tier, tier);
  }

  getMember(userId) {
    const stmt = db.prepare(
      'SELECT * FROM members WHERE guild_id = ? AND user_id = ?'
    );
    return stmt.get(this.guildId, userId);
  }

  listMembers() {
    const stmt = db.prepare(
      'SELECT user_id, tier, joined_at FROM members WHERE guild_id = ?'
    );
    return stmt.all(this.guildId);
  }

  // Scheduled posts
  addScheduledPost({ channelId, content, postAt, createdBy }) {
    const stmt = db.prepare(
      `INSERT INTO scheduled_posts (guild_id, channel_id, content, post_at, created_by)
       VALUES (?, ?, ?, ?, ?)`
    );
    const result = stmt.run(this.guildId, channelId, content, postAt, createdBy);
    return result.lastInsertRowid;
  }

  getPendingPosts() {
    const stmt = db.prepare(
      `SELECT id, channel_id, content, post_at, created_by
       FROM scheduled_posts
       WHERE guild_id = ? AND sent = 0 AND post_at <= datetime('now')
       ORDER BY post_at ASC`
    );
    return stmt.all(this.guildId);
  }

  markPostSent(postId) {
    const stmt = db.prepare(
      'UPDATE scheduled_posts SET sent = 1 WHERE guild_id = ? AND id = ?'
    );
    return stmt.run(this.guildId, postId);
  }
}

// Helper: get DB instance for a guild
function forGuild(guildId) {
  return new GuildDB(guildId);
}

console.log('SQLite connected:', DB_PATH);

module.exports = { db, GuildDB, forGuild };
