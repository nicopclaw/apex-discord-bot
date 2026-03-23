const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Initialize this server for Creator Bot')
    .addSubcommand(sub =>
      sub.setName('welcome')
        .setDescription('Set the welcome message')
        .addStringOption(opt =>
          opt.setName('message')
            .setDescription('Welcome message (use {user}, {server})')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('tiers')
        .setDescription('Define a subscription tier')
        .addStringOption(opt => opt.setName('name').setDescription('Tier name').setRequired(true))
        .addStringOption(opt => opt.setName('role').setDescription('Role ID to assign').setRequired(true))
        .addNumberOption(opt => opt.setName('price').setDescription('Monthly price (0 for free)').setRequired(true))
        .addStringOption(opt => opt.setName('desc').setDescription('Description'))),

  async execute(interaction, db) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'welcome') {
      const message = interaction.options.getString('message');
      const settings = await db.getSettings();
      settings.welcomeMessage = message;
      await db.setSettings(settings);
      await interaction.reply({ content: 'Welcome message updated.', ephemeral: true });
    } else if (sub === 'tiers') {
      const name = interaction.options.getString('name');
      const role = interaction.options.getString('role');
      const price = interaction.options.getNumber('price');
      const desc = interaction.options.getString('desc') || '';
      await db.upsertTier({ tier_name: name, role_id: role, price, description: desc });
      await interaction.reply({ content: `Tier "${name}" saved.`, ephemeral: true });
    }
  }
};