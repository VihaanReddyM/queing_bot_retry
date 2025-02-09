const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const logger = require("../../utils/logger");
const getUsername = require("../../utils/username");
const config = require("../../data/config.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("username")
    .setDescription("Gets the Minecraft username of the user."),
  async execute(interaction) {
    const member = interaction.member;
    const nickname = member.nickname;
    const minecraftUsername = getUsername(nickname);

    const embed = new EmbedBuilder()
      .setTitle("Minecraft Username 🎮")
      .setDescription(`Your Minecraft username is **${minecraftUsername}**.`)
      .setColor(config.colours.success)
      .setFooter({ text: "Username retrieved successfully! 😊" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
