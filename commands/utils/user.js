const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const logger = require('../../utils/logger');
const config = require('../../data/config.json');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('user')
		.setDescription('Provides information about the user.'),
	async execute(interaction) {
		embed = new EmbedBuilder()
			.setTitle('User Information')
			.setDescription(`This user is ${interaction.user.username} and joined on ${interaction.member.joinedAt}.`)
			.setColor(config.colours.success);

		await interaction.reply({ embeds: [embed] });
	},
};
