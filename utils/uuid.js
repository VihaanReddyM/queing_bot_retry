const axios = require('axios');

async function getUUID(username) {
  try {
      const response = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${username}`);
      const uuid = response.data.id;
      return uuid;
  } catch (error) {
      console.error(`Error fetching UUID for ${username}:`, error);
  }
}

module.exports = getUUID;