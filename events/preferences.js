const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const ServerQueue = require('../utils/serverQueue');


module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        if (!interaction.isButton()) return;

        const { customId, user, guild } = interaction;

        if (customId.startsWith('pref_')) {
            const serverId = guild.id;
            const mode = customId.split('_')[1];

            let serverQueue = await ServerQueue.findById(serverId);
            if (!serverQueue) {
                return await interaction.reply({ content: 'Server configuration not found. please use /setup again', ephemeral: true });
            }

            // Ensure preferences exists
            if (!serverQueue.preferences) {
                serverQueue.preferences = new Map();
            }

            let userPreferences = serverQueue.preferences.get(user.id) || ["2", "3", "4"];

            if (userPreferences.includes(mode)) {
                userPreferences = userPreferences.filter(m => m !== mode);
            } else {
                userPreferences.push(mode);
            }

            serverQueue.preferences.set(user.id, userPreferences);
            await serverQueue.save();

            const buttons = ["2", "3", "4"].map(m => {
                return new ButtonBuilder()
                    .setCustomId(`pref_${m}`)
                    .setLabel(`${m}v${m}`)
                    .setStyle(userPreferences.includes(m) ? ButtonStyle.Success : ButtonStyle.Secondary);
            });

            const row = new ActionRowBuilder().addComponents(buttons);

            const embed = new EmbedBuilder()
                .setTitle('Set Your Game Mode Preferences')
                .setDescription('Click the buttons to toggle your preferred game modes.')
                .setColor('#00FF00');

            await interaction.update({ embeds: [embed], components: [row] });
        }
    },
};
