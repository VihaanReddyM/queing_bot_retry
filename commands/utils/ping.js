const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { logger } = require('../../utils/logger');
const config = require('../../data/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),
    async execute(interaction) {
        Embed = new EmbedBuilder()
            .setTitle('Pong!')
            .setDescription('Pong!')
            .setColor(config.colours.success);
        await interaction.reply({ embeds: [Embed] });
    }
}