const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const config = require('../../data/config.json');
const logger = require('../../utils/logger');
const mongoose = require('mongoose');
const ServerQueue = require('../../utils/serverQueue');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set')
        .setDescription('Set a category for VCs')
        .addChannelOption(options => 
            options.setName('category')
                .setDescription('Add the category in which the game VC will be created')
                .setRequired(true)),
        
    async execute(interaction) {
        const channel = interaction.options.getChannel('category');
        // Check if the channel is a category
        if (channel.type !== 4) {
            embed = new EmbedBuilder()
                .setTitle('Error')
                .setDescription('Please select a category!')
                .setColor('#FF0000');

            return await interaction.reply({ embeds: [embed], Flags: 64 });
        }

        const serverId = interaction.guild.id;
        let serverQueue = await ServerQueue.findById(serverId);

        if (!serverQueue) {
            serverQueue = new ServerQueue({
                _id: serverId,
                serverName: interaction.guild.name,
                category: channel.id,
                preferences: {},
                usedStats: [],
                queue: { "2": [], "3": [], "4": [] },
            });

            await serverQueue.save();
            embed = new EmbedBuilder()
                .setTitle('Success')
                .setDescription('Category set successfully!')
                .setColor('#00FF00');
            
            return await interaction.reply({ embeds: [embed], flags: 64 });
        }

        serverQueue.category = channel.id;
        await serverQueue.save();
        embed = new EmbedBuilder()
            .setTitle('Success')
            .setDescription('Category updated successfully!')
            .setColor('#00FF00');
        
        return await interaction.reply({ embeds: [embed], flags: 64 });
    }
};