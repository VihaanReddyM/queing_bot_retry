const { EmbedBuilder } = require('discord.js');
const ServerQueue = require('../utils/serverQueue');

module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState) {
        const { member, guild } = newState;
        if (!member) return;

        const user = member.user;
        const serverId = guild.id;

        // Check if the user left a voice channel
        if (oldState.channelId && !newState.channelId) {
            // Retrieve the server queue document
            let serverQueue = await ServerQueue.findById(serverId);

            if (!serverQueue) {
                // Create a new server queue document if it doesn't exist
                serverQueue = new ServerQueue({
                    _id: serverId,
                    serverName: guild.name,
                    preferences: {}, // Default preferences
                    queue: { "2": [], "3": [], "4": [] },
                });

                // Save the new document
                await serverQueue.save();
            }

            // Retrieve the user's preferred game modes or default to ["2", "3", "4"]
            const gameModes = serverQueue.preferences[user.id] || ["2", "3", "4"];
            let wasInQueue = false;

            // Check and remove the user from the queue for each game mode
            for (const mode of gameModes) {
                const userIndex = serverQueue.queue[mode].findIndex(
                    (entry) => entry.userId === user.id
                );

                if (userIndex !== -1) {
                    serverQueue.queue[mode].splice(userIndex, 1);
                    wasInQueue = true;
                }
            }

            // Save the updated server queue document
            await serverQueue.save();

            // Send a message to the user if they were in any queue
            if (wasInQueue) {
                const embed = new EmbedBuilder()
                    .setTitle('Queue Update')
                    .setDescription(`You were removed from the **${gameModes.join(", ")}** queue(s) because you left the voice channel.`)
                    .setColor('#FF0000');

                await member.send({ embeds: [embed] });
            }
        }
    },
};
