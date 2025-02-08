const axios = require('axios');
const logger = require('./logger');

async function getUUID(username) {
  try {
      const response = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${username}`);
      const uuid = response.data.id;
      return uuid;
  } catch (error) {
      logger.error(`Error fetching UUID for ${username}:`, error);
  }
}

module.exports = getUUID;