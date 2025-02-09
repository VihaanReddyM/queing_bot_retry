const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../data/config.json");
const logger = require("../../utils/logger");
const mongoose = require("mongoose");
const ServerQueue = require("../../utils/serverQueue");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("set")
    .setDescription("Set a category for VCs")
    .addChannelOption((options) =>
      options
        .setName("category")
        .setDescription("Add the category in which the game VC will be created")
        .setRequired(true)
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel("category");

    // Check if the channel is a category
    if (channel.type !== 4) {
      const errorEmbed = new EmbedBuilder()
        .setTitle("Error 🚫")
        .setDescription("Please select a valid category!")
        .setColor("#FF6B6B") // soft red tone
        .setFooter({ text: "Invalid category provided. 😕" })
        .setTimestamp();

      return await interaction.reply({ embeds: [errorEmbed], flags: 64 });
    }

    const serverId = interaction.guild.id;
    let serverQueue = await ServerQueue.findById(serverId);

    if (!serverQueue) {
      serverQueue = new ServerQueue({
        _id: serverId,
        serverName: interaction.guild.name,
        category: channel.id,
        preferences: {},
        usedStats: [],
        queue: { 2: [], 3: [], 4: [] },
      });

      await serverQueue.save();

      const successEmbed = new EmbedBuilder()
        .setTitle("Success ✅")
        .setDescription("Category set successfully!")
        .setColor("#6BCB77") // soft green tone
        .setFooter({ text: "Your VCs are now organized. Enjoy! 😊" })
        .setTimestamp();

      return await interaction.reply({ embeds: [successEmbed], flags: 64 });
    }

    serverQueue.category = channel.id;
    await serverQueue.save();

    const updateEmbed = new EmbedBuilder()
      .setTitle("Success ✅")
      .setDescription("Category updated successfully!")
      .setColor("#6BCB77")
      .setFooter({ text: "Changes have been saved. Have fun! 😊" })
      .setTimestamp();

    return await interaction.reply({ embeds: [updateEmbed], flags: 64 });
  },
};
