const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const path = require("path");
const fs = require("fs");
const logger = require("../../utils/logger");
const config = require("../../data/config.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reload")
    .setDescription("Reloads a command.")
    .addStringOption((option) =>
      option
        .setName("command")
        .setDescription("The command to reload.")
        .setRequired(true)
    ),
  async execute(interaction) {
    // Check if the user is a developer
    const developerList = config.developers;
    if (!developerList.includes(interaction.user.id)) {
      const embed = new EmbedBuilder()
        .setTitle("Error 🚫")
        .setDescription("You do not have permission to run this command!")
        .setColor(config.colours.error)
        .setFooter({ text: "Developer only command. 😕" })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    const commandName = interaction.options.getString("command").toLowerCase();
    const command = interaction.client.commands.get(commandName);

    if (!command) {
      const embed = new EmbedBuilder()
        .setTitle("Error 🚫")
        .setDescription(`There is no command with the name \`${commandName}\`!`)
        .setColor(config.colours.error)
        .setFooter({ text: "Double-check the command name and try again. 😕" })
        .setTimestamp();
      logger.error(`Command ${commandName} was not found!`);
      return interaction.reply({ embeds: [embed] });
    }

    // Correct the path to the root 'commands' folder (two levels up)
    const commandsPath = path.join(__dirname, "..", "..", "commands");

    let commandPath;
    const commandFolders = fs.readdirSync(commandsPath);

    // Look through each folder to find the command file
    for (const folder of commandFolders) {
      const commandFilePath = path.join(
        commandsPath,
        folder,
        `${command.data.name}.js`
      );
      if (fs.existsSync(commandFilePath)) {
        commandPath = commandFilePath;
        break;
      }
    }

    if (!commandPath) {
      const embed = new EmbedBuilder()
        .setTitle("Error 🚫")
        .setDescription(
          `Command \`${commandName}\` was not found in any folder!`
        )
        .setColor(config.colours.error)
        .setFooter({
          text: "Ensure the command exists in the proper folder structure. 😕",
        })
        .setTimestamp();
      logger.error(`Command ${commandName} was not found in any folder!`);
      return interaction.reply({ embeds: [embed] });
    }

    // Delete the cached command
    delete require.cache[require.resolve(commandPath)];

    try {
      // Re-require and update the command
      const newCommand = require(commandPath);
      interaction.client.commands.set(newCommand.data.name, newCommand);

      const embed = new EmbedBuilder()
        .setTitle("Success ✅")
        .setDescription(
          `Command \`${newCommand.data.name}\` was reloaded successfully!`
        )
        .setColor(config.colours.success)
        .setFooter({ text: "Command reloaded. All set! 🎉" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      logger.info(`Command ${newCommand.data.name} was reloaded!`);
    } catch (error) {
      logger.error(error);
      const embed = new EmbedBuilder()
        .setTitle("Error 🚫")
        .setDescription(
          `There was an error while reloading command \`${command.data.name}\`:\n\`${error.message}\``
        )
        .setColor(config.colours.error)
        .setFooter({ text: "Please check your command code. 😕" })
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    }
  },
};
