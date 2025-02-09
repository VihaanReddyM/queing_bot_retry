const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const logger = require("../../utils/logger");
const config = require("../../data/config.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("server")
    .setDescription("Provides information about the server."),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle("Server Information 🌐")
      .setDescription(
        `This server is **${interaction.guild.name}** and has **${interaction.guild.memberCount}** members.`
      )
      .setColor(config.colours.success)
      .setFooter({ text: "Server info retrieved successfully! 😊" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
