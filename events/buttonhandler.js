const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ComponentBuilder } = require('discord.js');
const ServerQueue = require('../utils/serverQueue');
const logger = require('../utils/logger');
const { getUsername, getstars } = require('../utils/username');
const getUUID = require('../utils/uuid');
const getBedwarsStats = require('../utils/stats');
const matchmaking = require('../utils/matchmaking');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        if (!interaction.isButton()) return;

        const { customId, user, guild } = interaction;

        if (customId === 'join_queue') {
            const serverName = guild.name;
            const serverId = guild.id;
            let serverQueue = await ServerQueue.findById(serverId);

            if (!serverQueue) {
                serverQueue = new ServerQueue({
                    _id: serverId,
                    serverName,
                    category: "",
                    preferences: {},
                    usedStats: [],
                    queue: { "2": [], "3": [], "4": [] },
                });

                // Save the new document
                await serverQueue.save();
                await interaction.reply('Please set up a category before joining the queue.');
                return; // Exit early after replying
            }

            const gameMode = serverQueue.preferences.get(user.id) || ["2", "3", "4"];
            try {
                if (!interaction.member.voice.channel) {
                    const embed = new EmbedBuilder()
                        .setTitle('Error')
                        .setDescription('You must be in a voice channel to join the queue!')
                        .setColor('#FF0000');

                    return await interaction.reply({ embeds: [embed], flags: 64 });
                }

                // Defer the interaction to allow time for processing
                await interaction.deferReply({ flags: 64 });

                const member = await guild.members.fetch(user.id);

                if (!member.nickname) {
                    const embed = new EmbedBuilder()
                        .setTitle('Error')
                        .setDescription('Unable to fetch your username. Please set a nickname and try again.')
                        .setColor('#FF0000');

                    await interaction.editReply({ embeds: [embed] });
                    return;
                }

                const nickname = member.nickname;
                const username = getUsername(nickname);
                const UUID = await getUUID(username);

                if (!serverQueue.category) {
                    const embed = new EmbedBuilder()
                        .setTitle('Error')
                        .setDescription('Please set up a category before joining the queue.')
                        .setColor('#FF0000');

                    await interaction.editReply({ embeds: [embed] });
                    return;
                }

                let userStat = serverQueue.usedStats.find(
                    (entry) => entry.userId === UUID
                );

                if (!userStat) {
                    const statNumber = await getBedwarsStats(nickname);
                    const stars = await getstars(nickname); // Fetch stars data
                    logger.info(`Fetched stat number for ${nickname}: ${statNumber}`);
                    logger.info(`Fetched stars for ${nickname}: ${stars}`);

                    // Check if statNumber and stars are valid (i.e., not 0 or NaN)
                    if (statNumber <= 0 || isNaN(statNumber) || stars <= 0 || isNaN(stars)) {
                        const embed = new EmbedBuilder()
                            .setTitle('Error')
                            .setDescription(`Unable to fetch valid stats for ${user.username}. Please try again later.`)
                            .setColor('#FF0000');

                        await interaction.editReply({ embeds: [embed] });
                        return;
                    }

                    serverQueue.usedStats.push({
                        userId: UUID,
                        statNumber,
                        stars, // Save stars data
                    });

                    userStat = { userId: UUID, statNumber, stars }; // Set the fetched statNumber and stars for the user
                    logger.info("New user and his stats are: ", userStat);
                }

                let wasInQueue = false;
                for (const mode of gameMode) {
                    const userIndex = serverQueue.queue[mode].findIndex(
                        (entry) => entry.userId === user.id
                    );

                    if (userIndex !== -1) {
                        serverQueue.queue[mode].splice(userIndex, 1);
                        wasInQueue = true;
                    }
                }

                if (wasInQueue) {
                    await serverQueue.save();

                    const embed = new EmbedBuilder()
                        .setTitle('Success')
                        .setDescription(`You've successfully left all selected queues!`)
                        .setColor('#00FF00');

                    await interaction.editReply({ embeds: [embed] });
                    return;
                }

                // Removed manual matchmaking call from here:
                // for (const mode of gameMode) {
                //     if (serverQueue.queue[mode] && Array.isArray(serverQueue.queue[mode]) && serverQueue.queue[mode].length >= 2) {
                //         logger.info("Matchmaking started for server: ", serverId);
                //         await matchmaking(serverId, interaction.client);
                //         break; // Exit loop after starting matchmaking
                //     }
                // }

                for (const mode of gameMode) {
                    serverQueue.queue[mode].push({
                        userId: user.id,
                        timestamp: new Date(),
                        statNumber: userStat.statNumber,
                        stars: userStat.stars, // Include stars in the queue entry
                    });
                }

                await serverQueue.save();

                const embed = new EmbedBuilder()
                    .setTitle('Success')
                    .setDescription(`You have joined the **${gameMode}** queue!`)
                    .setColor('#00FF00');

                await interaction.editReply({ embeds: [embed] });

                // Removed second manual matchmaking call from here:
                // for (const mode of gameMode) {
                //     if (serverQueue.queue[mode] && Array.isArray(serverQueue.queue[mode]) && serverQueue.queue[mode].length >= 2) {
                //         logger.info("Matchmaking started for server: ", serverId);
                //         const matchedTeams = await matchmaking(serverId, interaction.client);
                //         break; // Exit loop after starting matchmaking
                //     }
                // }

            } catch (error) {
                logger.error(error);

                await interaction.editReply({
                    content: 'There was an error processing your request. Please try again later.',
                });
            }
        } else if (customId === 'set_preferences') {
            const serverId = guild.id;
            let serverQueue = await ServerQueue.findById(serverId);

            if (!serverQueue) {
                const embed = new EmbedBuilder()
                    .setTitle('Error')
                    .setDescription('Server configuration not found. Please use /setup again.')
                    .setColor('#FF0000');

                return await interaction.reply({ embeds: [embed], flags: 64 });
            }

            if (!serverQueue.preferences) {
                serverQueue.preferences = new Map();
            }

            let wasInQueue = false;
            const gameMode = serverQueue.preferences.get(user.id) || ["2", "3", "4"];
            for (const mode of gameMode) {
                const userIndex = serverQueue.queue[mode].findIndex(
                    (entry) => entry.userId === user.id
                );

                if (userIndex !== -1) {
                    serverQueue.queue[mode].splice(userIndex, 1);
                    wasInQueue = true;
                }
            }

            if (wasInQueue) {
                const embed = new EmbedBuilder()
                    .setTitle('Error')
                    .setDescription(`You can't edit your preferences while in queue.`)
                    .setColor('#FF0000');

                logger.info(`User ${user.username} tried to edit preferences while in queue.`);
                return await interaction.reply({ embeds: [embed], flags: 64 });
            }

            let userPreferences = serverQueue.preferences.get(user.id) || ["2", "3", "4"];
            const member = await guild.members.fetch(user.id);

            console.log(`${member} preferences`, userPreferences);

            const embed = new EmbedBuilder()
                .setTitle('Preferences')
                .setDescription('Please select your preferred game mode. These game modes will be saved when you join the queue again.')
                .setColor('#00FF00');

            const buttons = ["2", "3", "4"].map(m => {
                return new ButtonBuilder()
                    .setCustomId(`pref_${m}`)
                    .setLabel(`${m}v${m}`)
                    .setStyle(userPreferences.includes(m) ? ButtonStyle.Success : ButtonStyle.Secondary);
            });

            const actionRow = new ActionRowBuilder().addComponents(buttons);

            await interaction.reply({ embeds: [embed], components: [actionRow], flags: 64 });
        }
    },
};
