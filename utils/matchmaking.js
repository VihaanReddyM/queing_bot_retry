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
        async function isEligibleFor3(player) {
            const preferences = serverQueue.preferences || {};
            logger.info(Array.from(preferences.entries())); // if preferences is a Map
        
            // Await the DB call to actually get the document.
            const serverQueueDoc = await ServerQueue.findById(serverId);
            if (!serverQueueDoc) {
                logger.error(`Server queue not found for serverId: ${serverId}`);
                return false;
            }
            const userPreferences = serverQueueDoc.preferences ? serverQueueDoc.preferences[player.userId] || [] : [];
            logger.info(userPreferences);
            return userPreferences.includes("3");
        }
        
        function isEligibleFor4(player) {
            // get preferenvces from serverQueue
            const preferences = serverQueue.preferences || {};
            // get user preferences
            const userPreferences = preferences[player.userId] || [];
            // check if user has 4s preference
            if (userPreferences.includes("4")) {
                return true;
            } else {
                return false;
            }
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
            // Initially set up the in-memory queue for mode3.
            serverQueue.queue["3"] = serverQueue.queue["3"] || [];
            serverQueue.queue["3"].forEach(player => {
                player.bracket = getBracket(player.statNumber, player.stars);
            });

            // Process each bracket concurrently.
            async function processMode3Group(bracket) {
                // Instead of using a cached group, use a while loop that
                // repeatedly filters the updated in-memory mode3 queue.
                while (true) {
                    let group = (serverQueue.queue["3"] || []).filter(p => {
                        p.bracket = getBracket(p.statNumber, p.stars);
                        return p.bracket === bracket;
                    });
                    if (group.length < 3) break;

                    const initialTeam = group.splice(0, 3);
                    logger.info(
                        `[MODE 3][BRACKET ${bracket}] Selected initial team: ${initialTeam.map(p => p.userId).join(', ')}`
                    );
                    // Remove these players from the main mode3 queue.
                    initialTeam.forEach(player => {
                        serverQueue.queue["3"] = serverQueue.queue["3"].filter(p => p.userId !== player.userId);
                    });

                    const waitTime = randomBetween(10, 20) * 1000;
                    logger.info(`[MODE 3][BRACKET ${bracket}] Waiting ${waitTime / 1000} seconds for promotion.`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));

                    const updatedQueueDoc = await ServerQueue.findById(serverId);
                    serverQueue.queue["3"] = updatedQueueDoc.queue["3"] || [];
                    logger.info(
                        `[MODE 3][BRACKET ${bracket}] After wait, updated mode3 queue length: ${serverQueue.queue["3"].length}`
                    );

                    let currentGroup = (serverQueue.queue["3"] || []).filter(p => {
                        p.bracket = getBracket(p.statNumber, p.stars);
                        // Exclude players already in the initial team.
                        return p.bracket === bracket && !initialTeam.some(q => q.userId === p.userId);
                    });
                    logger.info(`[MODE 3][BRACKET ${bracket}] Found ${currentGroup.length} candidate(s) for promotion.`);

                    if (currentGroup.length >= 1) {
                        const candidate = currentGroup[0];
                        logger.info(
                            `[MODE 3][BRACKET ${bracket}] Checking eligibility for promotion: initial team: ${initialTeam.map(p => p.userId).join(', ')} candidate: ${candidate.userId}`
                        );
                        if (initialTeam.every(p => isEligibleFor4(p)) && isEligibleFor4(candidate.userId)) {
                            serverQueue.queue["3"] = serverQueue.queue["3"].filter(p => p.userId !== candidate.userId);
                            logger.info(`[MODE 3][BRACKET ${bracket}] Promoting team to 4s by adding candidate ${candidate.userId}.`);
                            initialTeam.push(candidate);
                            initialTeam.forEach(player => removePlayerFromAllQueues(player.userId));
                            const team = {
                                mode: "4", // promoted to a 4s team
                                bracket,
                                players: initialTeam,
                                matchedAt: Date.now()
                            };
                            const channel = await createVoiceChannel(guild, team);
                            if (channel) team.channel = channel;
                            matchedTeams.push(team);
                            logger.info(`[MODE 3][BRACKET ${bracket}] Promoted team from 3s to 4s: ${team.players.map(p => p.userId).join(', ')}`);
                            continue;
                        } else {
                            logger.info(`[MODE 3][BRACKET ${bracket}] Candidate ${candidate.userId} did not pass eligibility.`);
                        }
                    }
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
                    logger.info(`[MODE 3][BRACKET ${bracket}] Finalized team for 3s: ${team.players.map(p => p.userId).join(', ')}`);
                }

            }

            // Process each bracket concurrently.
            const brackets = new Set((serverQueue.queue["3"] || []).map(p => getBracket(p.statNumber, p.stars)));
            await Promise.all(Array.from(brackets).map(bracket => processMode3Group(bracket)));
        }


        // === MODE 2 (2s) – Waiting and Promotion Logic ===
        {
            // Ensure the mode2 queue is set.
            serverQueue.queue["2"] = serverQueue.queue["2"] || [];
            serverQueue.queue["2"].forEach(player => {
                player.bracket = getBracket(player.statNumber, player.stars);
            });

            async function processMode2Group(bracket) {
                // ... inside your processMode2Group(bracket) function:
                while (true) {
                    let group = (serverQueue.queue["2"] || []).filter(p => {
                        p.bracket = getBracket(p.statNumber, p.stars);
                        return p.bracket === bracket;
                    });
                    if (group.length < 2) break;

                    const initialTeam = group.splice(0, 2);
                    logger.info(
                        `[MODE 2][BRACKET ${bracket}] Selected initial team: ${initialTeam.map(p => p.userId).join(', ')}`
                    );
                    initialTeam.forEach(player => {
                        serverQueue.queue["2"] = serverQueue.queue["2"].filter(p => p.userId !== player.userId);
                    });

                    const waitTime = randomBetween(10, 20) * 1000;
                    logger.info(`[MODE 2][BRACKET ${bracket}] Waiting ${waitTime / 1000} seconds for promotion.`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));

                    const updatedQueueDoc = await ServerQueue.findById(serverId);
                    serverQueue.queue["2"] = updatedQueueDoc.queue["2"] || [];
                    logger.info(
                        `[MODE 2][BRACKET ${bracket}] After wait, updated mode2 queue length: ${serverQueue.queue["2"].length}`
                    );

                    let currentGroup = (serverQueue.queue["2"] || []).filter(p => {
                        p.bracket = getBracket(p.statNumber, p.stars);
                        return p.bracket === bracket && !initialTeam.some(q => q.userId === p.userId);
                    });
                    logger.info(`[MODE 2][BRACKET ${bracket}] Found ${currentGroup.length} candidate(s) for promotion.`);
                    
                    if (currentGroup.length >= 1) {
                        const candidate = currentGroup[0];
                        // Log detailed eligibility
                        initialTeam.forEach(p => {
                            logger.info(`[MODE 2][BRACKET ${bracket}] Player ${p.userId} eligibility for 3s: ${isEligibleFor3(p)}`);
                        });
                        logger.info(`[MODE 2][BRACKET ${bracket}] Candidate ${candidate.userId} eligibility for 3s: ${isEligibleFor3(candidate.userId)}`);
                        
                        if (initialTeam.every(p => isEligibleFor3(p)) && isEligibleFor3(candidate.userId)) {
                            // Remove candidate from the in-memory mode 2 queue.
                            serverQueue.queue["2"] = serverQueue.queue["2"].filter(p => p.userId !== candidate.userId);
                            logger.info(`[MODE 2][BRACKET ${bracket}] Promoting team to 3s by adding candidate ${candidate.userId}.`);
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
                            logger.info(`[MODE 2][BRACKET ${bracket}] Promoted team from 2s to 3s: ${team.players.map(p => p.userId).join(', ')}`);
                            continue;
                        } else {
                            logger.info(`[MODE 2][BRACKET ${bracket}] Candidate ${candidate.userId} did not pass eligibility.`);
                        }
                    }
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
                    logger.info(`[MODE 2][BRACKET ${bracket}] Finalized team for 2s: ${team.players.map(p => p.userId).join(', ')}`);
                }

            }

            const brackets2 = new Set((serverQueue.queue["2"] || []).map(p => getBracket(p.statNumber, p.stars)));
            await Promise.all(Array.from(brackets2).map(bracket => processMode2Group(bracket)));
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
