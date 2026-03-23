const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Show or set welcome message')
    .addSubcommand(sub =>
      sub.setName('show')
        .setDescription('Display current welcome message'))
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Set welcome message')
        .addStringOption(opt =>
          opt.setName('message')
            .setDescription('Message (use {user}, {server})')
            .setRequired(true))),

  async execute(interaction, db) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'show') {
      const settings = await db.getSettings();
      const msg = settings.welcomeMessage || 'No welcome message set.';
      await interaction.reply({ content: `WELCOME MESSAGE:\n${msg}`, ephemeral: true });
    } else if (sub === 'set') {
      const message = interaction.options.getString('message');
      const settings = await db.getSettings();
      settings.welcomeMessage = message;
      await db.setSettings(settings);
      await interaction.reply({ content: 'Welcome message updated.', ephemeral: true });
    }
  }
};