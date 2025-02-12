/**
 * Handles the matchmaking process for a given server.
 *
 * @param {string} serverId - The ID of the server.
 * @param {object} client - The Discord client instance.
 * @returns {Promise<void>}
 *
 * @async
 * @function matchmaking
 *
 * @throws Will throw an error if there is an issue with the matchmaking process.
 *
 * @description
 * This function retrieves the server queue and guild, and processes matchmaking for different modes (2s, 3s, 4s).
 * It includes helper functions for converting stars to stats, calculating brackets, generating random numbers,
 * checking player eligibility, removing players from queues, creating voice channels, and checking player availability.
 * The function processes each mode's queue, matches teams, promotes teams to higher modes if eligible, and moves matched
 * users into their respective voice channels.
 *
 * @example
 * // Example usage:
 * matchmaking('serverId', client)
 *   .then(() => console.log('Matchmaking completed'))
 *   .catch(error => console.error('Matchmaking error:', error));
 */

const mongoose = require("mongoose");
const ServerQueue = require("./serverQueue");
const logger = require("./logger");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");

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
      logger.error("Server queue not found");
      return;
    }

    stopMatching = false;

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
      if (stars < 100) return 2; // low experience
      if (stars < 400) return 6; // mid-tier
      return 10; // high experience
    }

    // Hybrid bracket calculation based on statNumber and stars.
    function getBracket(statNumber, stars) {
      if (statNumber === 1000) {
        const converted = convertStarsToStat(stars);
        if (converted <= 3) return 1;
        if (converted <= 8) return 2;
        return 3;
      } else {
        const weighted = statNumber * 0.7 + convertStarsToStat(stars) * 0.3;
        if (weighted <= 3) return 1;
        if (weighted <= 8) return 2;
        return 3;
      }
    }

    // Random integer between min and max (inclusive)
    function randomBetween(min, max) {
      logger.debug(`Generating random number between ${min} and ${max}`);
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Eligibility functions – if not set, assume eligible.
    async function isEligibleFor3(player) {
      const serverQueueDoc = await ServerQueue.findById(serverId);
      if (!serverQueueDoc) {
        logger.error(`Server queue not found for serverId: ${serverId}`);
        return false;
      }
      let userPreferences = serverQueue.preferences.get(player.userId) || [
        "2",
        "3",
        "4",
      ];
      if (userPreferences.includes("3")) {
        logger.debug(`User ${player.userId} has 3s preference`);
        return true;
      } else {
        logger.debug(`User ${player.userId} does not have 3s preference`);
        return false;
      }
    }

    async function isEligibleFor4(player) {
      const serverQueueDoc = await ServerQueue.findById(serverId);
      if (!serverQueueDoc) {
        logger.error(`Server queue not found for serverId: ${serverId}`);
        return false;
      }
      let userPreferences = serverQueue.preferences.get(player.userId) || [
        "2",
        "3",
        "4",
      ];
      if (userPreferences.includes("4")) {
        logger.debug(`User ${player.userId} has 3s preference`);
        return true;
      } else {
        logger.debug(`User ${player.userId} does not have 3s preference`);
        return false;
      }
    }

    // Remove a player from all queues (so they cannot be matched twice).
    function removePlayerFromAllQueues(playerId) {
      logger.debug(`Removing player ${playerId} from all queues`);
      ["2", "3", "4"].forEach((mode) => {
        if (serverQueue.queue[mode]) {
          serverQueue.queue[mode] = serverQueue.queue[mode].filter(
            (p) => p.userId !== playerId
          );
        }
      });
    }

    // Create a voice channel for a matched team and return it.
    async function createVoiceChannel(guild, team, teamsize) {
      const categoryId = serverQueue.category;
      const channelName = `Team-${team.players.map((p) => p.userId).join("-")}`;
      try {
        const channel = await guild.channels.create({
          name: channelName,
          type: 2, // Discord voice channel type
          parent: categoryId,
          userLimit: teamsize, // should be the same as the team size
        });
        logger.debug(`Created voice channel ${channel.name} for team.`);
        return channel;
      } catch (err) {
        logger.error(`Error creating voice channel: ${err.message}`);
        return null;
      }
    }

    function isPlayerStillAvailable(player, mode) {
      const member = guild.members.cache.get(player.userId);
      if (!member) {
        logger.debug(`Member ${player.userId} is no longer in the guild.`);
        return false;
      }
      const unserIndex = serverQueue.queue[mode].findIndex(
        (p) => p.userId === player.userId
      );
      if (unserIndex === -1) {
        logger.debug(`Member ${player.userId} is no longer in the queue.`);
        return false;
      }
      return true;
    }

    // === MATCHED TEAMS COLLECTION ===
    const matchedTeams = [];

    // === MODE 4 (4s) – Highest Priority, Instant Matching ===
    {
      // Ensure we have a valid array
      let mode4Queue = serverQueue.queue["4"] || [];
      // Recalculate bracket for each player in mode4 queue
      mode4Queue.forEach((player) => {
        player.bracket = getBracket(player.statNumber, player.stars);
      });
      // Group players by bracket
      const groups4 = {};
      mode4Queue.forEach((player) => {
        if (!groups4[player.bracket]) groups4[player.bracket] = [];
        groups4[player.bracket].push(player);
      });

      // For each bracket, instantly match teams of 4.
      for (const bracket in groups4) {
        while (groups4[bracket].length >= 4) {
          const teamPlayers = groups4[bracket].splice(0, 4);
          // Remove these players from all queues.
          teamPlayers.forEach((player) =>
            removePlayerFromAllQueues(player.userId)
          );
          const team = {
            mode: "4",
            bracket,
            players: teamPlayers,
            matchedAt: Date.now(),
          };
          // Create a voice channel and store it in the team object.
          const channel = await createVoiceChannel(guild, team, team.mode);
          if (channel) team.channel = channel;
          matchedTeams.push(team);
          logger.debug(
            `Matched team for 4s in bracket ${bracket}: ${team.players
              .map((p) => p.userId)
              .join(", ")}`
          );
        }
      }
    }

    // === MODE 3 (3s) – Waiting and Promotion Logic ===
    async function processMode3Group(bracket) {
      while (true) {
        let group = (serverQueue.queue["3"] || []).filter((p) => {
          p.bracket = getBracket(p.statNumber, p.stars);
          return p.bracket === bracket;
        });

        if (group.length < 3) break;

        const initialTeam = group.splice(0, 3);
        logger.debug(
          `[MODE 3][BRACKET ${bracket}] Selected initial team: ${initialTeam
            .map((p) => p.userId)
            .join(", ")}`
        );

        serverQueue.queue["3"] = serverQueue.queue["3"].filter(
          (p) => !initialTeam.some((q) => q.userId === p.userId)
        );

        const waitTime = randomBetween(10, 20) * 1000;
        logger.debug(
          `[MODE 3][BRACKET ${bracket}] Waiting ${
            waitTime / 1000
          } seconds for promotion.`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));

        const updatedQueueDoc = await ServerQueue.findById(serverId); // Make sure serverId is defined
        serverQueue.queue["3"] = updatedQueueDoc.queue["3"] || [];
        logger.debug(
          `[MODE 3][BRACKET ${bracket}] After wait, updated mode3 queue length: ${serverQueue.queue["3"].length}`
        );

        let currentGroup = (serverQueue.queue["3"] || []).filter((p) => {
          p.bracket = getBracket(p.statNumber, p.stars);
          return (
            p.bracket === bracket &&
            !initialTeam.some((q) => q.userId === p.userId)
          );
        });
        logger.debug(
          `[MODE 3][BRACKET ${bracket}] Found ${currentGroup.length} candidate(s) for promotion.`
        );

        if (currentGroup.length >= 1) {
          const candidate = currentGroup[0];
          logger.debug(
            `[MODE 3][BRACKET ${bracket}] Checking eligibility for promotion: initial team: ${initialTeam
              .map((p) => p.userId)
              .join(", ")} candidate: ${candidate.userId}`
          );

          const allEligible = (
            await Promise.all(initialTeam.map((p) => isEligibleFor4(p)))
          ).every(Boolean);
          const candidateEligibility = await isEligibleFor4(candidate);

          if (allEligible && candidateEligibility) {
            serverQueue.queue["3"] = serverQueue.queue["3"].filter(
              (p) => p.userId !== candidate.userId
            );
            logger.debug(
              `[MODE 3][BRACKET ${bracket}] Promoting team to 4s by adding candidate ${candidate.userId}.`
            );
            initialTeam.push(candidate);

            await Promise.all(
              initialTeam.map((player) =>
                removePlayerFromAllQueues(player.userId)
              )
            );

            const team = {
              mode: "4",
              bracket,
              players: initialTeam,
              matchedAt: Date.now(),
            };

            const channel = await createVoiceChannel(guild, team, team.mode); // Make sure guild is defined
            if (channel) team.channel = channel;

            matchedTeams.push(team);
            logger.debug(
              `[MODE 3][BRACKET ${bracket}] Promoted team from 3s to 4s: ${team.players
                .map((p) => p.userId)
                .join(", ")}`
            );
          } else {
            logger.debug(
              `[MODE 3][BRACKET ${bracket}] Candidate ${candidate.userId} did not pass eligibility.`
            );
          }
        }

        let playerUnavailable = false;
        for (const player of initialTeam) {
          if (!isPlayerStillAvailable(player, "3")) {
            logger.debug(
              `Player ${player.userId} is no longer available, cancelling matching.`
            );
            playerUnavailable = true;
            break;
          }
        }

        if (playerUnavailable) {
          break;
        }

        await Promise.all(
          initialTeam.map((player) => removePlayerFromAllQueues(player.userId))
        );

        const team = {
          mode: "3",
          bracket,
          players: initialTeam,
          matchedAt: Date.now(),
        };

        const channel = await createVoiceChannel(guild, team, team.mode);
        if (channel) team.channel = channel;

        matchedTeams.push(team);
        logger.debug(
          `[MODE 3][BRACKET ${bracket}] Finalized team for 3s: ${team.players
            .map((p) => p.userId)
            .join(", ")}`
        );
      }
    }

    // ... (rest of your code, including the initial setup and calling processMode3Group)

    // Example of how you would call it:
    serverQueue.queue["3"] = serverQueue.queue["3"] || [];
    serverQueue.queue["3"].forEach((player) => {
      player.bracket = getBracket(player.statNumber, player.stars);
    });

    const brackets = new Set(
      (serverQueue.queue["3"] || []).map((p) =>
        getBracket(p.statNumber, p.stars)
      )
    );
    Promise.all(
      Array.from(brackets).map((bracket) => processMode3Group(bracket))
    )
      .then(() => {})
      .catch((error) => {
        logger.error(error);
      });

    // === MODE 2 (2s) – Waiting and Promotion Logic ===
    {
      // Ensure the mode2 queue is set.
      serverQueue.queue["2"] = serverQueue.queue["2"] || [];
      serverQueue.queue["2"].forEach((player) => {
        player.bracket = getBracket(player.statNumber, player.stars);
      });

      async function processMode2Group(bracket) {
        while (true) {
          let group = (serverQueue.queue["2"] || []).filter((p) => {
            p.bracket = getBracket(p.statNumber, p.stars);
            return p.bracket === bracket;
          });

          if (group.length < 2) break;

          const initialTeam = group.splice(0, 2);
          logger.debug(
            `[MODE 2][BRACKET ${bracket}] Selected initial team: ${initialTeam
              .map((p) => p.userId)
              .join(", ")}`
          );

          serverQueue.queue["2"] = serverQueue.queue["2"].filter(
            (p) => !initialTeam.some((q) => q.userId === p.userId)
          );

          const waitTime = randomBetween(10, 20) * 1000;
          logger.debug(
            `[MODE 2][BRACKET ${bracket}] Waiting ${
              waitTime / 1000
            } seconds for promotion.`
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));

          const updatedQueueDoc = await ServerQueue.findById(serverId);
          serverQueue.queue["2"] = updatedQueueDoc.queue["2"] || [];
          logger.debug(
            `[MODE 2][BRACKET ${bracket}] After wait, updated mode2 queue length: ${serverQueue.queue["2"].length}`
          );

          let currentGroup = (serverQueue.queue["2"] || []).filter((p) => {
            p.bracket = getBracket(p.statNumber, p.stars);
            return (
              p.bracket === bracket &&
              !initialTeam.some((q) => q.userId === p.userId)
            );
          });
          logger.debug(
            `[MODE 2][BRACKET ${bracket}] Found ${currentGroup.length} candidate(s) for promotion.`
          );

          if (currentGroup.length >= 1) {
            const candidate = currentGroup[0];
            logger.debug(
              `[MODE 2][BRACKET ${bracket}] Checking eligibility for promotion: initial team: ${initialTeam
                .map((p) => p.userId)
                .join(", ")} candidate: ${candidate.userId}`
            );

            const allEligible = (
              await Promise.all(initialTeam.map((p) => isEligibleFor3(p)))
            ).every(Boolean);
            const candidateEligibility = await isEligibleFor3(candidate);

            if (allEligible && candidateEligibility) {
              serverQueue.queue["2"] = serverQueue.queue["2"].filter(
                (p) => p.userId !== candidate.userId
              );
              logger.debug(
                `[MODE 2][BRACKET ${bracket}] Promoting team to 3s by adding candidate ${candidate.userId}.`
              );
              initialTeam.push(candidate);

              await Promise.all(
                initialTeam.map((player) =>
                  removePlayerFromAllQueues(player.userId)
                )
              );

              const team = {
                mode: "3",
                bracket,
                players: initialTeam,
                matchedAt: Date.now(),
              };

              const channel = await createVoiceChannel(guild, team, team.mode);
              if (channel) team.channel = channel;

              matchedTeams.push(team);
              logger.debug(
                `[MODE 2][BRACKET ${bracket}] Promoted team from 2s to 3s: ${team.players
                  .map((p) => p.userId)
                  .join(", ")}`
              );
            } else {
              logger.debug(
                `[MODE 2][BRACKET ${bracket}] Candidate ${candidate.userId} did not pass eligibility.`
              );
            }
          }

          let playerUnavailable = false;
          for (const player of initialTeam) {
            if (!isPlayerStillAvailable(player, "2")) {
              logger.debug(
                `Player ${player.userId} is no longer available, cancelling matching.`
              );
              playerUnavailable = true;
              break;
            }
          }

          if (playerUnavailable) {
            break;
          }

          await Promise.all(
            initialTeam.map((player) =>
              removePlayerFromAllQueues(player.userId)
            )
          );

          const team = {
            mode: "2",
            bracket,
            players: initialTeam,
            matchedAt: Date.now(),
          };

          const channel = await createVoiceChannel(guild, team, team.mode);
          if (channel) team.channel = channel;

          matchedTeams.push(team);
          logger.debug(
            `[MODE 2][BRACKET ${bracket}] Finalized team for 2s: ${team.players
              .map((p) => p.userId)
              .join(", ")}`
          );
        }
      }

      const brackets2 = new Set(
        (serverQueue.queue["2"] || []).map((p) =>
          getBracket(p.statNumber, p.stars)
        )
      );
      await Promise.all(
        Array.from(brackets2).map((bracket) => processMode2Group(bracket))
      );
    }

    // Log all matched teams.
    matchedTeams.forEach((team) => {
      logger.debug(
        `Final matched team for mode ${team.mode} in bracket ${
          team.bracket
        }: ${team.players.map((p) => p.userId).join(", ")}`
      );
    });

    // Save the updated queue using updateOne()
    await ServerQueue.updateOne(
      { _id: serverId },
      { queue: serverQueue.queue }
    );

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
              logger.debug(`Moved ${member.user.tag} to ${team.channel.name}`);
            } else {
              // Optionally, you could send them a DM or a notification asking them to join.
              logger.debug(
                `Member ${member.user.tag} is not in a voice channel and cannot be moved automatically.`
              );
            }
          } catch (err) {
            logger.error(
              `Failed to move member ${player.userId}: ${err.message}`
            );
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
