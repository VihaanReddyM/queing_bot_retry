const mongoose = require('mongoose');
const ServerQueue = require('./serverQueue');
const logger = require('./logger');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

/**
 * Main matchmaking function.
 * Processes mode "4" (4s) instantly,
 * then processes mode "3" (3s) and "2" (2s) with a waiting/promoting period.
 */
async function matchmaking(serverId, client) {
    try {
        // Retrieve the server queue and guild
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

        if (!serverQueue.category) {
            logger.error(`No category set for serverId: ${serverId}`);
            return;
        }

        // === HELPER FUNCTIONS ===

        // Converts stars to a stat value.
        function convertStarsToStat(stars) {
            if (stars < 100) return 2;   // low experience
            if (stars < 400) return 6;   // mid-tier
            return 10;                   // high experience
        }

        // Hybrid bracket calculation based on statNumber and stars.
        function getBracket(statNumber, stars) {
            logger.info(`Calculating bracket for statNumber ${statNumber} and stars ${stars}`);
            if (statNumber === 1000) {
                const converted = convertStarsToStat(stars);
                if (converted <= 3) return 1;
                if (converted <= 8) return 2;
                return 3;
            } else {
                const weighted = (statNumber * 0.7) + (convertStarsToStat(stars) * 0.3);
                if (weighted <= 3) return 1;
                if (weighted <= 8) return 2;
                return 3;
            }
        }

        // Random integer between min and max (inclusive)
        function randomBetween(min, max) {
            logger.info(`Generating random number between ${min} and ${max}`);
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }

        // Eligibility functions – if not set, assume eligible.
        function isEligibleFor3(player) {
            return (player.eligibility3 === undefined) ? true : player.eligibility3;
        }
        function isEligibleFor4(player) {
            return (player.eligibility4 === undefined) ? true : player.eligibility4;
        }

        // Remove a player from all queues (so they cannot be matched twice).
        function removePlayerFromAllQueues(playerId) {
            logger.info(`Removing player ${playerId} from all queues`);
            ["2", "3", "4"].forEach(mode => {
                if (serverQueue.queue[mode]) {
                    serverQueue.queue[mode] = serverQueue.queue[mode].filter(p => p.userId !== playerId);
                }
            });
        }

        // Create a voice channel for a matched team and return it.
        async function createVoiceChannel(guild, team) {
            const categoryId = serverQueue.category;
            const channelName = `Team-${team.players.map(p => p.userId).join('-')}`;
            try {
                const channel = await guild.channels.create({
                    name: channelName,
                    type: 2, // Discord voice channel type
                    parent: categoryId,
                });
                logger.info(`Created voice channel ${channel.name} for team.`);
                return channel;
            } catch (err) {
                logger.error(`Error creating voice channel: ${err.message}`);
                return null;
            }
        }

        // === MATCHED TEAMS COLLECTION ===
        const matchedTeams = [];

        // === MODE 4 (4s) – Highest Priority, Instant Matching ===
        {
            // Ensure we have a valid array
            let mode4Queue = serverQueue.queue["4"] || [];
            // Recalculate bracket for each player in mode4 queue
            mode4Queue.forEach(player => {
                player.bracket = getBracket(player.statNumber, player.stars);
            });
            // Group players by bracket
            const groups4 = {};
            mode4Queue.forEach(player => {
                if (!groups4[player.bracket]) groups4[player.bracket] = [];
                groups4[player.bracket].push(player);
            });

            // For each bracket, instantly match teams of 4.
            for (const bracket in groups4) {
                while (groups4[bracket].length >= 4) {
                    const teamPlayers = groups4[bracket].splice(0, 4);
                    // Remove these players from all queues.
                    teamPlayers.forEach(player => removePlayerFromAllQueues(player.userId));
                    const team = {
                        mode: "4",
                        bracket,
                        players: teamPlayers,
                        matchedAt: Date.now()
                    };
                    // Create a voice channel and store it in the team object.
                    const channel = await createVoiceChannel(guild, team);
                    if (channel) team.channel = channel;
                    matchedTeams.push(team);
                    logger.info(`Matched team for 4s in bracket ${bracket}: ${team.players.map(p => p.userId).join(', ')}`);
                }
            }
        }

        // === MODE 3 (3s) – Waiting and Promotion Logic ===
        {
            let mode3Queue = serverQueue.queue["3"] || [];
            mode3Queue.forEach(player => {
                player.bracket = getBracket(player.statNumber, player.stars);
            });
            // Group by bracket.
            const groups3 = {};
            mode3Queue.forEach(player => {
                if (!groups3[player.bracket]) groups3[player.bracket] = [];
                groups3[player.bracket].push(player);
            });

            // Process each bracket group in mode 3.
            async function processMode3Group(bracket) {
                let group = groups3[bracket];
                while (group && group.length >= 3) {
                    // Take an initial team of 3.
                    const initialTeam = group.splice(0, 3);
                    // Also remove these players from the main mode 3 queue.
                    initialTeam.forEach(player => {
                        serverQueue.queue["3"] = serverQueue.queue["3"].filter(p => p.userId !== player.userId);
                    });

                    // Wait for 10-20 seconds for possible promotion.
                    const waitTime = randomBetween(10, 20) * 1000;
                    logger.info(`Mode 3: Waiting ${waitTime / 1000} seconds for promotion in bracket ${bracket}.`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));

                    // Re-check the current mode 3 queue for players in this bracket.
                    let currentGroup = (serverQueue.queue["3"] || []).filter(p => {
                        p.bracket = getBracket(p.statNumber, p.stars);
                        return p.bracket === bracket;
                    });

                    // If at least one extra player is available and all are eligible for promotion to 4s...
                    if (currentGroup.length >= 1) {
                        const candidate = currentGroup[0];
                        if (initialTeam.every(p => isEligibleFor4(p)) && isEligibleFor4(candidate)) {
                            // Remove candidate from mode 3.
                            serverQueue.queue["3"] = serverQueue.queue["3"].filter(p => p.userId !== candidate.userId);
                            initialTeam.push(candidate);
                            // Remove all matched players from any queue.
                            initialTeam.forEach(player => removePlayerFromAllQueues(player.userId));
                            const team = {
                                mode: "4", // promoted to 4s team
                                bracket,
                                players: initialTeam,
                                matchedAt: Date.now()
                            };
                            const channel = await createVoiceChannel(guild, team);
                            if (channel) team.channel = channel;
                            matchedTeams.push(team);
                            logger.info(`Promoted team from 3s to 4s in bracket ${bracket}: ${team.players.map(p => p.userId).join(', ')}`);
                            continue;
                        }
                    }
                    // Otherwise, finalize the team as a 3s team.
                    initialTeam.forEach(player => removePlayerFromAllQueues(player.userId));
                    const team = {
                        mode: "3",
                        bracket,
                        players: initialTeam,
                        matchedAt: Date.now()
                    };
                    const channel = await createVoiceChannel(guild, team);
                    if (channel) team.channel = channel;
                    matchedTeams.push(team);
                    logger.info(`Matched team for 3s in bracket ${bracket}: ${team.players.map(p => p.userId).join(', ')}`);
                }
            }

            // Process each bracket concurrently.
            await Promise.all(Object.keys(groups3).map(bracket => processMode3Group(bracket)));
        }

        // === MODE 2 (2s) – Waiting and Promotion Logic ===
        {
            let mode2Queue = serverQueue.queue["2"] || [];
            mode2Queue.forEach(player => {
                player.bracket = getBracket(player.statNumber, player.stars);
            });
            // Group by bracket.
            const groups2 = {};
            mode2Queue.forEach(player => {
                if (!groups2[player.bracket]) groups2[player.bracket] = [];
                groups2[player.bracket].push(player);
            });

            async function processMode2Group(bracket) {
                let group = groups2[bracket];
                while (group && group.length >= 2) {
                    // Take an initial team of 2.
                    const initialTeam = group.splice(0, 2);
                    // Also remove these players from the main mode 2 queue.
                    initialTeam.forEach(player => {
                        serverQueue.queue["2"] = serverQueue.queue["2"].filter(p => p.userId !== player.userId);
                    });

                    // Wait for 10-20 seconds for possible promotion.
                    const waitTime = randomBetween(10, 20) * 1000;
                    logger.info(`Mode 2: Waiting ${waitTime / 1000} seconds for promotion in bracket ${bracket}.`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));

                    // Re-check the current mode 2 queue for players in this bracket.
                    let currentGroup = (serverQueue.queue["2"] || []).filter(p => {
                        p.bracket = getBracket(p.statNumber, p.stars);
                        return p.bracket === bracket;
                    });

                    // If at least one extra player is available and all are eligible for promotion to 3s...
                    if (currentGroup.length >= 1) {
                        const candidate = currentGroup[0];
                        if (initialTeam.every(p => isEligibleFor3(p)) && isEligibleFor3(candidate)) {
                            // Remove candidate from mode 2.
                            serverQueue.queue["2"] = serverQueue.queue["2"].filter(p => p.userId !== candidate.userId);
                            initialTeam.push(candidate);
                            initialTeam.forEach(player => removePlayerFromAllQueues(player.userId));
                            const team = {
                                mode: "3", // promoted to a 3s team
                                bracket,
                                players: initialTeam,
                                matchedAt: Date.now()
                            };
                            const channel = await createVoiceChannel(guild, team);
                            if (channel) team.channel = channel;
                            matchedTeams.push(team);
                            logger.info(`Promoted team from 2s to 3s in bracket ${bracket}: ${team.players.map(p => p.userId).join(', ')}`);
                            continue;
                        }
                    }
                    // Otherwise, finalize the team as a 2s team.
                    initialTeam.forEach(player => removePlayerFromAllQueues(player.userId));
                    const team = {
                        mode: "2",
                        bracket,
                        players: initialTeam,
                        matchedAt: Date.now()
                    };
                    const channel = await createVoiceChannel(guild, team);
                    if (channel) team.channel = channel;
                    matchedTeams.push(team);
                    logger.info(`Matched team for 2s in bracket ${bracket}: ${team.players.map(p => p.userId).join(', ')}`);
                }
            }

            // Process each bracket concurrently.
            await Promise.all(Object.keys(groups2).map(bracket => processMode2Group(bracket)));
        }

        // Log all matched teams.
        matchedTeams.forEach(team => {
            logger.info(`Final matched team for mode ${team.mode} in bracket ${team.bracket}: ${team.players.map(p => p.userId).join(', ')}`);
        });

        // Save the updated queue using updateOne()
        await ServerQueue.updateOne({ _id: serverId }, { queue: serverQueue.queue });

        // ----- AFTER THE QUEUE IS SAVED, MOVE MATCHED USERS INTO THEIR VOICE CHANNELS -----

        // Iterate over each team and move each member into the team's voice channel.
        for (const team of matchedTeams) {
            if (team.channel) {
                for (const player of team.players) {
                    try {
                        // Get the guild member (fetching if not cached)
                        let member = guild.members.cache.get(player.userId);
                        if (!member) {
                            member = await guild.members.fetch(player.userId);
                        }

                        // Check if the member is connected to a voice channel;
                        // only then can we move them.
                        if (member.voice.channel) {
                            await member.voice.setChannel(team.channel.id);
                            logger.info(`Moved ${member.user.tag} to ${team.channel.name}`);
                        } else {
                            // Optionally, you could send them a DM or a notification asking them to join.
                            logger.info(`Member ${member.user.tag} is not in a voice channel and cannot be moved automatically.`);
                        }
                    } catch (err) {
                        logger.error(`Failed to move member ${player.userId}: ${err.message}`);
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
