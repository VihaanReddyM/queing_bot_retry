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

        // Prioritize game modes: 4s over 3s and 2s.
        // Our custom staged algorithm will only affect mode "2".
        const gameModes = ['4', '3', '2'];
        const matchedTeams = [];
        const currentTime = Date.now();

        // Helper: Convert stars into an equivalent stat value.
        function convertStarsToStat(stars) {
            if (stars < 100) return 2;   // low experience
            if (stars < 400) return 6;   // mid-tier
            return 10;                   // high experience
        }

        // Hybrid bracket function: uses statNumber (if available) and stars.
        function getBracket(statNumber, stars) {
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

        // Helper: random integer between min and max (inclusive)
        function randomBetween(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }

        // For eligibility: if not set, assume eligible.
        function isEligibleFor3(player) {
            return (player.eligibility3 === undefined) ? true : player.eligibility3;
        }
        function isEligibleFor4(player) {
            return (player.eligibility4 === undefined) ? true : player.eligibility4;
        }

        // Helper: Process matches for a given mode by grouping players by bracket.
        function processMatchForMode(mode, players) {
            // First, assign bracket for each player.
            players.forEach(player => {
                player.bracket = getBracket(player.statNumber, player.stars);
            });
            // Group players by bracket.
            const groups = {};
            players.forEach(player => {
                if (!groups[player.bracket]) groups[player.bracket] = [];
                groups[player.bracket].push(player);
            });
            // Determine the number of players per match from the mode string.
            const playersPerMatch = parseInt(mode);
            for (const bracket in groups) {
                const groupPlayers = groups[bracket];
                while (groupPlayers.length >= playersPerMatch) {
                    const matchedPlayers = groupPlayers.splice(0, playersPerMatch);
                    matchedTeams.push({
                        mode,
                        bracket: bracket,
                        players: matchedPlayers,
                        matchedAt: Date.now()
                    });
                }
            }
        }

        // Helper: Process the "2s" queue with custom waiting and promotion logic.
        async function processModeQueue(mode) {
            // Custom logic applies only to mode "2"
            if (mode === "2") {
                // Re-read the current queue state from serverQueue.queue["2"]
                let currentQueue = serverQueue.queue["2"] || [];
                if (currentQueue.length === 2) {
                    const waitTime = randomBetween(14, 24) * 1000;
                    logger.info(`Mode 2: Waiting ${waitTime / 1000} seconds for additional players.`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    // After waiting, re-read the queue state.
                    currentQueue = serverQueue.queue["2"] || [];
                    if (currentQueue.length !== 2) {
                        logger.info("Queue size changed during wait, processing in 2s mode immediately.");
                        processMatchForMode("2", currentQueue);
                        return;
                    }
                    // Check if all players are eligible for promotion to 3s.
                    const allEligibleFor3 = currentQueue.every(player => isEligibleFor3(player));
                    if (allEligibleFor3) {
                        // Promote: clear the 2s queue and add these players to the 3s queue.
                        serverQueue.queue["2"] = [];
                        if (!serverQueue.queue["3"]) serverQueue.queue["3"] = [];
                        // Use a copy of currentQueue to avoid reference issues.
                        const promotedPlayers = currentQueue.slice();
                        serverQueue.queue["3"] = serverQueue.queue["3"].concat(promotedPlayers);
                        logger.info("Promoted players from 2s to 3s queue.");

                        // Wait again before promoting from 3s to 4s.
                        const waitTime3 = randomBetween(14, 24) * 1000;
                        logger.info(`Mode 3: Waiting ${waitTime3 / 1000} seconds for further players.`);
                        await new Promise(resolve => setTimeout(resolve, waitTime3));
                        let queue3 = serverQueue.queue["3"] || [];
                        if (queue3.length === 0) {
                            logger.info("No players in 3s queue after wait.");
                            return;
                        }
                        const allEligibleFor4 = queue3.every(player => isEligibleFor4(player));
                        if (allEligibleFor4) {
                            // Promote to mode 4 instantly.
                            serverQueue.queue["3"] = [];
                            if (!serverQueue.queue["4"]) serverQueue.queue["4"] = [];
                            const promotedPlayers4 = queue3.slice();
                            serverQueue.queue["4"] = serverQueue.queue["4"].concat(promotedPlayers4);
                            logger.info("Promoted players from 3s to 4s queue instantly.");
                            processMatchForMode("4", serverQueue.queue["4"]);
                        } else {
                            // Not all players can go to 4s; process them as a 3s match.
                            processMatchForMode("3", queue3);
                        }
                    } else {
                        // Some players are ineligible for promotion; process in 2s mode immediately.
                        processMatchForMode("2", currentQueue);
                    }
                } else {
                    // If queue length is not exactly 2, process immediately.
                    processMatchForMode("2", currentQueue);
                }
            } else {
                // For mode "3" or "4", simply process the matches.
                processMatchForMode(mode, serverQueue.queue[mode] || []);
            }
        }

        // Main processing loop for each game mode.
        for (const mode of gameModes) {
            let queue = serverQueue.queue[mode];
            if (!queue) {
                logger.error(`No queue found for game mode ${mode}`);
                continue;
            }
            // For each player in the current queue, recalculate their bracket.
            queue.forEach(player => {
                player.bracket = getBracket(player.statNumber, player.stars);
            });

            if (mode === "2") {
                // Use our custom waiting/promoting function for mode "2".
                await processModeQueue("2");
            } else {
                // For modes "3" and "4", group players by bracket and form matches immediately.
                const groups = {};
                queue.forEach(player => {
                    if (!groups[player.bracket]) groups[player.bracket] = [];
                    groups[player.bracket].push(player);
                });
                const playersPerMatch = parseInt(mode);
                for (const bracket in groups) {
                    const players = groups[bracket];
                    while (players.length >= playersPerMatch) {
                        const matchedPlayers = players.splice(0, playersPerMatch);
                        matchedTeams.push({
                            mode,
                            bracket,
                            players: matchedPlayers,
                            matchedAt: Date.now()
                        });
                    }
                }
            }
        }

        // Log the matched teams.
        matchedTeams.forEach(team => {
            logger.info(`Matched team for mode ${team.mode} in bracket ${team.bracket}: ${team.players.map(p => p.userId).join(', ')}`);
            // Here you can create voice channels or send match notifications as needed.
        });

    } catch (error) {
        logger.error(`Error matching users: ${error.message}`);
        console.error(error);
    }
}

module.exports = matchmaking;
