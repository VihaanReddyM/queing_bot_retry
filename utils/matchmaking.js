const mongoose = require('mongoose');
const ServerQueue = require('./serverQueue');
const logger = require('./logger');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getstars } = require('./username');

async function matchmaking(serverId, client) {
    try {
        const serverQueue = await ServerQueue.findById(serverId);
        if (!serverQueue) {
            logger.error('Server queue not found');
            return;
        }

        const guild = client.guilds.cache.get(serverId);
        if (!guild) {
            logger.error(`Guild not found for serverId: ${serverId}`);
            return;
        }

        const categoryId = serverQueue.category;
        if (!categoryId) {
            logger.error(`No category set for serverId: ${serverId}`);
            return;
        }

        const gameModes = ['4', '3', '2']; // Prioritize 4s over 3s and 2s
        const matchedTeams = [];
        const currentTime = Date.now();
        const user = client.user;
        const nickname = user.nickname

        const stars = getstars(nickname);
        logger.info(`Stars: ${stars}`);


        function getBracket(statNumber) {
            if (statNumber <= 3) return 1;
            if (statNumber <= 8) return 2;
            return 3;
        }

        
    } catch (error) {
        logger.error(`Error matching users: ${error.message}`);
        console.error(error);
    }
}

module.exports = matchmaking;
