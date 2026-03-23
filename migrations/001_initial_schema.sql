-- Multi-tenant schema for Creator Bot SaaS
-- Run this on your Postgres database

BEGIN;

-- Guilds (tenants)
CREATE TABLE IF NOT EXISTS guilds (
    guild_id BIGINT PRIMARY KEY,
    plan TEXT NOT NULL DEFAULT 'free',
    stripe_customer_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    settings_json JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_guilds_plan ON guilds(plan);

-- Tiers (per-guild)
CREATE TABLE IF NOT EXISTS tiers (
    guild_id BIGINT NOT NULL,
    tier_name TEXT NOT NULL,
    role_id BIGINT,
    price DECIMAL(10,2) DEFAULT 0,
    description TEXT,
    PRIMARY KEY (guild_id, tier_name),
    FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
);

-- Members (per-guild)
CREATE TABLE IF NOT EXISTS members (
    guild_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    tier TEXT,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    total_tips DECIMAL(10,2) DEFAULT 0,
    PRIMARY KEY (guild_id, user_id),
    FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_members_guild ON members(guild_id);

-- Scheduled posts
CREATE TABLE IF NOT EXISTS scheduled_posts (
    guild_id BIGINT NOT NULL,
    id SERIAL,
    channel_id BIGINT NOT NULL,
    content TEXT NOT NULL,
    post_at TIMESTAMPTZ NOT NULL,
    created_by BIGINT NOT NULL,
    sent BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (guild_id, id),
    FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_guild ON scheduled_posts(guild_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_post_at ON scheduled_posts(post_at);

-- Config (per-guild key-value)
CREATE TABLE IF NOT EXISTS config (
    guild_id BIGINT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (guild_id, key),
    FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
);

COMMIT;

-- Sample: Insert a test guild only if you need it
-- INSERT INTO guilds (guild_id, plan) VALUES (123456789012345678, 'free');