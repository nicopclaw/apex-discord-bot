const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tier')
    .setDescription('Manage subscription tiers')
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Show available tiers'))
    .addSubcommand(sub =>
      sub.setName('assign')
        .setDescription('Assign a tier to a member')
        .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
        .addStringOption(opt => opt.setName('tier').setDescription('Tier name').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('info')
        .setDescription('Show your current tier')),

  async execute(interaction, db) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const tiers = await db.listTiers();
      const embed = new EmbedBuilder()
        .setTitle('Available Tiers')
        .setColor('#0099ff');
      for (const t of tiers) {
        embed.addFields({
          name: `${t.tier_name} ($${t.price}/mo)`,
          value: t.description || 'No description',
          inline: false
        });
      }
      await interaction.reply({ embeds: [embed] });
    } else if (sub === 'assign') {
      const user = interaction.options.getUser('user');
      const tierName = interaction.options.getString('tier');
      await db.setMemberTier(user.id, tierName);
      // Optionally assign role: await interaction.guild.members.cache.get(user.id).roles.add(tierRoleId);
      await interaction.reply({ content: `Assigned tier "${tierName}" to ${user.tag}.`, ephemeral: true });
    } else if (sub === 'info') {
      const member = await db.getMember(interaction.user.id);
      if (!member) {
        await interaction.reply({ content: 'You are not assigned to any tier.', ephemeral: true });
      } else {
        await interaction.reply({ content: `Your current tier: ${member.tier}`, ephemeral: true });
      }
    }
  }
};