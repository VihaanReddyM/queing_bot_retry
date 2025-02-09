/**
 * Fetches and calculates the Bedwars stats for a given player.
 *
 * @param {string} PLAYER_NAME - The name of the player whose stats are to be fetched.
 * @returns {Promise<number>} - The normalized score of the player based on their Bedwars stats.
 *
 * @throws Will log an error and return a default score of 1000 if there is an issue fetching the stats.
 */

const axios = require("axios");
const config = require("../data/config.json");
const logger = require("./logger");

const API_KEY = config.hypixel;
// Adjusted weights for each stat
const Weight_Kills = 0.3; // Weight for final kills
const Weight_Deaths = 0.5; // Weight for final deaths
const Weight_Wins = 0.3; // Weight for wins
const Weight_Losses = 0.4; // Weight for losses
const Weight_Experience = 0.00005; // Weight for experience
const Weight_Kills_Bedwars = 0.2; // Weight for kills (total kills, not final)
const Weight_Deaths_Bedwars = 0.3; // Weight for deaths (total deaths, not final)

// Optional scaling factor to normalize the score
const scalingFactor = 1000; // You can adjust this factor to get a more appropriate range

// Minimum score threshold to avoid negative scores
const MIN_SCORE = 0; // You can set this to a higher value if you want a higher baseline score

async function getBedwarsStats(PLAYER_NAME) {
  try {
    const response = await axios.get(
      `https://api.hypixel.net/player?name=${PLAYER_NAME}&key=${API_KEY}`
    );
    const player = response.data.player;

    // Check if player data is available and has stats
    if (player && player.stats && player.stats.Bedwars) {
      const bedwarsStats = player.stats.Bedwars;

      const final_kills = bedwarsStats.final_kills_bedwars || 0;
      const final_deaths = bedwarsStats.final_deaths_bedwars || 0;
      const wins = bedwarsStats.wins_bedwars || 0;
      const losses = bedwarsStats.losses_bedwars || 0;
      const experience = bedwarsStats.Experience || 0;
      const kills = bedwarsStats.kills_bedwars || 0;
      const deaths = bedwarsStats.deaths_bedwars || 0;

      // Calculate player score using the adjusted formula
      const playerScore =
        Weight_Kills * final_kills +
        Weight_Kills_Bedwars * kills -
        Weight_Deaths * final_deaths -
        Weight_Deaths_Bedwars * deaths +
        Weight_Wins * wins -
        Weight_Losses * losses +
        Weight_Experience * experience;

      // Normalize the score using the scaling factor
      let normalizedScore = playerScore / scalingFactor;
      // Clamp score to a minimum value to prevent negative scores
      normalizedScore = Math.max(normalizedScore, MIN_SCORE);
      if (normalizedScore === 0) {
        normalizedScore = 4;
      }
      return normalizedScore;
    } else {
      logger.info("No BedWars stats found for this player.");
      return 1000; // Return a default score if no stats found
    }
  } catch (error) {
    logger.error("Error fetching stats:", error);
    return 1000; // Return a default score on error
  }
}

module.exports = getBedwarsStats;
