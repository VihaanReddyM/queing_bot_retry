const { Events, MessageFlags, EmbedBuilder } = require("discord.js");
const logger = require("../utils/logger");

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      logger.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
      logger.info(
        `Command ${interaction.commandName} executed by ${interaction.user.tag}`
      );
    } catch (error) {
      logger.error(error);
      const errorEmbed = new EmbedBuilder()
        .setTitle("Error")
        .setDescription("There was an error while executing this command!")
        .setColor("#FF0000")
        .setTimestamp();

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          embeds: [errorEmbed],
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          embeds: [errorEmbed],
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};
