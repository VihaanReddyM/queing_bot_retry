const { EmbedBuilder } = require('discord.js');
const ServerQueue = require('../utils/serverQueue');
const logger = require('../utils/logger');

module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState) {
        const { member, guild } = newState;
        if (!member) return;

        const user = member.user;
        const serverId = guild.id;

        if (oldState.channelId && oldState.channelId !== newState.channelId) {
            // User left or switched channels
            logger.debug(`User ${user.tag} left channel ${oldState.channelId}`);
            let serverQueue = await ServerQueue.findById(serverId);

            if (!serverQueue) {
                logger.debug('No serverQueue found, creating a new one');
                serverQueue = new ServerQueue({
                    _id: serverId,
                    serverName: guild.name,
                    preferences: {},
                    queue: { "2": [], "3": [], "4": [] },
                });

                await serverQueue.save();
            }

            if (!serverQueue.category) {
                const embed = new EmbedBuilder()
                    .setTitle('Error')
                    .setDescription('No category set for server.')
                    .setColor('#FF0000');

                await member.send({ embeds: [embed] }).catch(() => {});
                logger.error('No category set for server');
                return;
            }

            const oldChannel = guild.channels.cache.get(oldState.channelId);
            if (oldChannel && oldChannel.parentId === serverQueue.category) {
                if (oldChannel.members.size === 0) {
                    logger.debug(`Deleting empty voice channel: ${oldChannel.name}`);
                    await oldChannel.delete().catch(err => logger.error(`Error deleting channel: ${err}`));
                }
            }
        }
    }
};
