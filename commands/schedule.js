const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Schedule a message')
    .addStringOption(opt =>
      opt.setName('message')
        .setDescription('Message content')
        .setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('delay')
        .setDescription('Minutes from now to send (max 60)')
        .setRequired(true))
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Channel to send to (defaults to current)')),

  async execute(interaction, db) {
    const content = interaction.options.getString('message');
    const delayMin = interaction.options.getInteger('delay');
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    if (delayMin < 0 || delayMin > 60) {
      await interaction.reply({ content: 'Delay must be between 0 and 60 minutes.', ephemeral: true });
      return;
    }

    const postAt = new Date(Date.now() + delayMin * 60 * 1000);
    await db.addScheduledPost({
      channelId: channel.id,
      content,
      postAt,
      createdBy: interaction.user.id
    });

    const embed = new EmbedBuilder()
      .setTitle('Message Scheduled')
      .setColor('#00ff00')
      .addFields(
        { name: 'When', value: postAt.toLocaleString(), inline: true },
        { name: 'Channel', value: channel.name, inline: true },
        { name: 'Content', value: content.slice(0, 200) + (content.length > 200 ? '...' : ''), inline: false }
      );
    await interaction.reply({ embeds: [embed] });
  }
};
