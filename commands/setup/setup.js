const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const logger = require("../../utils/logger");
const config = require("../../data/config.json");
const mongoose = require("mongoose");
const ServerQueue = require("../../utils/serverQueue");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Sets up the bot.")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel to set up the bot in.")
        .setRequired(true)
    ),
  async execute(interaction) {
    const member = interaction.member;
    const channel = interaction.options.getChannel("channel");

    // Check if the channel is a text channel (type 0 represents a GuildText channel)
    if (channel.type !== 0) {
      const errorEmbed = new EmbedBuilder()
        .setTitle("Error 🚫")
        .setDescription("The specified channel is not a text channel.")
        .setColor(config.colours.error)
        .setFooter({ text: "Please choose a text channel. 😕" })
        .setTimestamp();

      await interaction.reply({ embeds: [errorEmbed] });
      return;
    }

    // Check if the user has the required permissions (Administrator)
    if (!member.permissions.has("ADMINISTRATOR")) {
      const errorEmbed = new EmbedBuilder()
        .setTitle("Error 🚫")
        .setDescription(
          "You do not have the required permissions to run this command."
        )
        .setColor(config.colours.error)
        .setFooter({ text: "Administrator permissions are required. 🙏" })
        .setTimestamp();

      await interaction.reply({ embeds: [errorEmbed] });
      return;
    }

    try {
      // Create the setup embed to be sent in the specified channel
      const setupEmbed = new EmbedBuilder()
        .setTitle("🌱 Hypixel Bedwars Discord Queuing LFT")
        .setDescription(
          "Welcome to the Queue Interface! This panel is your gateway to effortlessly finding and joining matches on the server."
        )
        .addFields(
          {
            name: "🌎 How to use:",
            value:
              "Ready to jump into a game? Click here to join the queue and get matched with other players.",
          },
          {
            name: "🍂 Set Your Preferences",
            value:
              "Select your preferred format (2s, 3s, or 4s) to ensure you queue for the matches you want to play.",
          },
          {
            name: "🍃 Note:",
            value:
              "This interface is open to all players eager to join the action. Customize your preferences, join the queue, and get ready for your next match!",
          }
        )
        .setColor(config.colours.info)
        .setFooter({ text: "Let the games begin! 🎮" })
        .setTimestamp();

      // Create buttons for the queue interface
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("join_queue")
          .setLabel("Join Queue")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("set_preferences")
          .setLabel("Set Preferences")
          .setStyle(ButtonStyle.Secondary)
      );

      // Send the setup embed with buttons in the designated channel
      await channel.send({ embeds: [setupEmbed], components: [buttons] });

      // Respond to the interaction that setup has been initiated successfully
      const successEmbed = new EmbedBuilder()
        .setTitle("Success ✅")
        .setDescription("The bot has been successfully set up.")
        .setColor(config.colours.success)
        .setFooter({ text: "Setup complete! 🎉" })
        .setTimestamp();

      await interaction.reply({ embeds: [successEmbed] });

      // Make sure to define serverId and serverName from the guild info
      const serverId = interaction.guild.id;
      const serverName = interaction.guild.name;

      // Check if a server queue already exists
      let serverQueue = await ServerQueue.findById(serverId);
      if (!serverQueue) {
        // Create a new server queue document
        serverQueue = new ServerQueue({
          _id: serverId,
          serverName,
          category: "", // Category ID for VCs (to be set up later)
          preferences: {}, // Default preferences
          usedStats: [], // Initialize usedStats array
          queue: { 2: [], 3: [], 4: [] },
        });

        // Save the new document
        await serverQueue.save();

        // Inform the administrator to set up a category using the /set command
        await interaction.followUp({
          content:
            "Please set up a category (using `/set`) before joining the queue. 😊",
          ephemeral: true,
        });
      }
    } catch (error_msg) {
      logger.error(error_msg);
      const errorEmbed = new EmbedBuilder()
        .setTitle("Error 🚫")
        .setDescription("An error occurred while setting up the bot.")
        .setColor("#FF0000")
        .setFooter({ text: "Please try again later. 🙏" })
        .setTimestamp();

      await interaction.reply({ embeds: [errorEmbed] });
    }
  },
};
