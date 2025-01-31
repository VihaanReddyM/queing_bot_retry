const { SlashCommandBuilder, EmbedBuilder, embedLength } = require('discord.js');
const path = require('path');
const fs = require('fs');
const logger = require('../../utils/logger');
const config = require('../../data/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reload')
        .setDescription('Reloads a command.')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('The command to reload.')
                .setRequired(true)),
    async execute(interaction) {
        // check if the user who is running the coommand is in the developer list
        const developer_list =  config.developers;
        if (!developer_list.includes(interaction.user.id)) {
            embed = new EmbedBuilder()
                .setTitle('Error')
                .setDescription('You do not have permission to run this command!')
                .setColor(config.colours.error);

            return interaction.reply({ embeds: [embed] });
        }

        const commandName = interaction.options.getString('command').toLowerCase();
        const command = interaction.client.commands.get(commandName);

        if (!command) {
            embed = new EmbedBuilder()
                .setTitle('Error')
                .setDescription(`There is no command with name \`${commandName}\`!`)
                .setColor(config.colours.error);

            return interaction.reply({ embeds: [embed] });
            logger.error(`Command ${commandName} was not found!`);
        }

        // Correct the path to the root 'commands' folder
        const commandsPath = path.join(__dirname, '..', '..', 'commands'); // Go two levels up to the root folder

        let commandPath;
        const commandFolders = fs.readdirSync(commandsPath); // Scan the root 'commands' folder

        // Look through each folder to find the command file
        for (const folder of commandFolders) {
            const commandFilePath = path.join(commandsPath, folder, `${command.data.name}.js`);
            if (fs.existsSync(commandFilePath)) {
                commandPath = commandFilePath;
                break;
            }
        }

        if (!commandPath) {
            embed = new EmbedBuilder()
                .setTitle('Error')
                .setDescription(`Command \`${commandName}\` was not found in any folder!`)
                .setColor(config.colours.error);

            logger.error(`Command ${commandName} was not found in any folder!`);
            return interaction.reply({ embeds: [embed] });

        }

        // Delete the cached command
        delete require.cache[require.resolve(commandPath)];

        try {
            // Re-require and set the command
            const newCommand = require(commandPath);
            interaction.client.commands.set(newCommand.data.name, newCommand);
            embed = new EmbedBuilder()
                .setTitle('Success')
                .setDescription(`Command \`${newCommand.data.name}\` was reloaded!`)
                .setColor(config.colours.success);
            await interaction.reply({ embeds: [embed] });
            logger.info(`Command ${newCommand.data.name} was reloaded!`);
        } catch (error) {
            logger.error(error);
            embed = new EmbedBuilder()
                .setTitle('Error')
                .setDescription(`There was an error while reloading a command \`${command.data.name}\`:\n\`${error.message}\``)
                .setColor(config.colours.error);
            await interaction.reply({ embeds: [embed] });
        }
    },
};
