require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events, REST, Routes } = require('discord.js');
const { forGuild } = require('./src/db');
const pool = require('./src/db').pool;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

client.commands = new Collection();
const commands = [];

// Register slash commands
const commandFiles = ['setup.js', 'tier.js', 'schedule.js', 'welcome.js'];
for (const file of commandFiles) {
  try {
    const command = require(`./commands/${file}`);
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
  } catch (e) {
    console.error(`Failed to load command ${file}:`, e);
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('Commands registered.');
  } catch (e) {
    console.error('Command registration failed:', e);
  }
})();

// Bot ready
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Start scheduled posts poller (global, not per-guild)
  setInterval(async () => {
    try {
      const result = await pool.query(`
        SELECT s.guild_id, s.id, s.channel_id, s.content, s.created_by
        FROM scheduled_posts s
        WHERE s.sent = FALSE AND s.post_at <= NOW()
      `);
      for (const row of result.rows) {
        const guild = client.guilds.cache.get(row.guild_id);
        if (guild) {
          const channel = guild.channels.cache.get(row.channel_id);
          if (channel) {
            await channel.send(row.content);
            await pool.query(
              'UPDATE scheduled_posts SET sent = TRUE WHERE guild_id = $1 AND id = $2',
              [row.guild_id, row.id]
            );
            console.log(`Sent scheduled post ${row.id} to guild ${row.guild_id}`);
          } else {
            console.warn(`Channel ${row.channel_id} not found in guild ${row.guild_id}`);
          }
        } else {
          console.warn(`Guild ${row.guild_id} not in cache; skipping post`);
        }
      }
    } catch (e) {
      console.error('Scheduler error:', e);
    }
  }, 60 * 1000); // every minute
});

// Guild join: auto-create guild record
client.on(Events.GuildCreate, async (guild) => {
  try {
    const existing = await pool.query('SELECT 1 FROM guilds WHERE guild_id = $1', [guild.id]);
    if (existing.rows.length === 0) {
      await pool.query(
        'INSERT INTO guilds (guild_id, plan) VALUES ($1, $2)',
        [guild.id, 'free']
      );
      console.log(`New guild joined: ${guild.id} (free plan)`);
    }
  } catch (e) {
    console.error('GuildCreate error:', e);
  }
});

// Interaction handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: 'This command only works in a server.', ephemeral: true });
    return;
  }

  try {
    await command.execute(interaction, forGuild(guildId));
  } catch (e) {
    console.error(`Command error: ${interaction.commandName}`, e);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'An error occurred.', ephemeral: true });
    } else {
      await interaction.reply({ content: 'An error occurred.', ephemeral: true });
    }
  }
});

client.login(process.env.BOT_TOKEN);