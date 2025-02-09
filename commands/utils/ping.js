const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { logger } = require("../../utils/logger");
const config = require("../../data/config.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong!"),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle("Pong! 🏓")
      .setDescription("Pong! Your ping is lightning fast! ⚡")
      .setColor(config.colours.success)
      .setFooter({ text: "Ping command executed successfully! 😊" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
