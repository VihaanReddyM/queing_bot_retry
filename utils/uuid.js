/**
 * Fetches the UUID of a Minecraft user by their username.
 *
 * @param {string} username - The Minecraft username to fetch the UUID for.
 * @returns {Promise<string>} The UUID of the Minecraft user.
 * @throws Will log an error if the UUID cannot be fetched.
 */

const axios = require("axios");
const logger = require("./logger");

async function getUUID(username) {
  try {
    const response = await axios.get(
      `https://api.mojang.com/users/profiles/minecraft/${username}`
    );
    const uuid = response.data.id;
    return uuid;
  } catch (error) {
    logger.error(`Error fetching UUID for ${username}:`, error);
  }
}

module.exports = getUUID;
