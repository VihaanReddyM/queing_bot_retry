const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../data/config.json");
module.exports = {
  data: new SlashCommandBuilder()
    .setName("user")
    .setDescription("Provides information about the user."),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle("User Information 😀")
      .setDescription(
        `This user is ${interaction.user.username} and joined on ${interaction.member.joinedAt}.`
      )
      .setColor(config.colours.success)
      .setFooter("Powered by ChatGPT 🤖 (it is coming to take my job lmao!!!)")
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
