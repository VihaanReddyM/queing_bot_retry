const mongoose = require('mongoose');
const ServerQueue = require('./serverQueue');
const logger = require('./logger');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

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

        function getBracket(statNumber) {
            if (statNumber <= 3) return 1;
            if (statNumber <= 8) return 2;
            return 3;
        }

        for (const mode of gameModes) {
            const queue = serverQueue.queue[mode];
            if (queue.length >= parseInt(mode)) {
                const teamSize = parseInt(mode);
                const teams = [];
                const brackets = { 1: [], 2: [], 3: [] };

                queue.forEach(user => {
                    const bracket = getBracket(user.statNumber);
                    brackets[bracket].push(user);
                });

                for (const bracket in brackets) {
                    const usersInBracket = brackets[bracket];
                    usersInBracket.sort((a, b) => a.statNumber - b.statNumber);

                    while (usersInBracket.length >= teamSize) {
                        const team = usersInBracket.splice(0, teamSize);
                        teams.push(team);
                    }
                }

                if (mode !== '4') {
                    const oldestTimestamp = Math.min(...queue.map(user => user.timestamp));
                    const timeElapsed = currentTime - oldestTimestamp;
                    const dynamicDelay = Math.max(30000 - (queue.length * 5000), 5000);
                    
                    if (timeElapsed < dynamicDelay) {
                        logger.info(`Delaying ${mode}v${mode} matchmaking for ${dynamicDelay - timeElapsed}ms`);
                        continue;
                    }
                }

                matchedTeams.push({ mode, teams });
                logger.info(`Matched teams for ${mode}v${mode}: ${teams.map(t => t.map(u => u.userId))}`);

                matchedTeams.forEach(({ teams }) => {
                    teams.forEach(team => {
                        team.forEach(user => {
                            for (const mode of gameModes) {
                                const modeQueue = serverQueue.queue[mode];
                                const index = modeQueue.findIndex(u => u.userId === user.userId);
                                if (index !== -1) {
                                    modeQueue.splice(index, 1);
                                }
                                logger.info(`Removed user ${user.userId} from all queues`);
                            }
                        });
                    });
                });

                await ServerQueue.findByIdAndUpdate(serverId, { queue: serverQueue.queue });
                logger.info(`Updated queue in database after matchmaking for ${mode}v${mode}`);

                for (const team of teams) {
                    const channelName = `Queue ${mode}v${mode}`;
                    const newChannel = await guild.channels.create({
                        name: channelName,
                        type: 2,
                        parent: categoryId,
                        userlimit: mode,
                        PermissionFlagsBits: [
                            { id: guild.roles.everyone.id, deny: ['VIEW_CHANNEL'] },
                            ...team.map(user => ({
                                id: user.userId,
                                allow: ['VIEW_CHANNEL', 'CONNECT', 'SPEAK'],
                            }))
                        ]
                    });

                    for (const user of team) {
                        const member = guild.members.cache.get(user.userId);
                        if (member && member.voice.channel) {
                            await member.voice.setChannel(newChannel);
                        }
                    }
                }
            }
        }
    } catch (error) {
        logger.error(`Error matching users: ${error.message}`);
        console.error(error);
    }
}

module.exports = matchmaking;
