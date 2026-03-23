# Creator Bot — SPEC.md

## What It Does
A Discord bot that helps OnlyFans/creator accounts manage their community, automate engagement, and monetize their Discord.

## Target Users
- OnlyFans creators who use Discord for their community
- Content creators who want to automate their Discord membership management

## Core Features (v1)

### 1. Subscription Tier Roles
- Assign roles based on subscription tier (Free, Silver, Gold, Platinum)
- Auto-role on join based on invite or manual command
- Role-gated channels (only tier X can see channel Y)

### 2. Auto-Welcome DM
- When new member joins, bot DMs them a welcome message
- Message includes: your OnlyFans link, what tiers are available, Discord community rules

### 3. Content Unlocks
- Creator posts a content link in a locked channel
- Fans with correct role can see it
- Command to manually unlock content for specific users

### 4. Tip Alerts
- When someone sends a tip (simulated via bot command), post an alert in #celebrations
- High-tip notifications for big amounts

### 5. Scheduling System
- Schedule messages to post at specific times
- Used for: new content announcements, countdown posts, reminders

### 6. Stats Dashboard (channel-based)
- `/stats` — shows member count, role breakdown, engagement
- Posts weekly summary to a stats channel

### 7. Mass DM (admin only)
- Owner can send a DM to all members with a specific role
- Used for: announcements, exclusive content drops

## Tech Stack
- Node.js + discord.js v14
- SQLite for data persistence (roles, scheduled posts, user tiers)
- JSON config for easy setup

## Setup Requirements
- Discord bot token (from Discord Developer Portal)
- Bot needs: Manage Roles, Send Messages, Manage Channels, Manage Threads, Use Slash Commands

## v1 Scope (build first)
1. Bot joins server and responds to `/` commands
2. Subscription tier role system
3. Auto-welcome DM on member join
4. Role-gated channels
5. Basic stats command

## Non-Goals (for now)
- OnlyFans API integration (they don't have a public API)
- Payment processing
- Content hosting
