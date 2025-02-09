const {
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
} = require("discord.js");
const ServerQueue = require("../utils/serverQueue");
const logger = require("../utils/logger");
const { getUsername, getstars } = require("../utils/username");
const getUUID = require("../utils/uuid");
const getBedwarsStats = require("../utils/stats");

module.exports = {
  name: "interactionCreate",
  async execute(interaction) {
    if (!interaction.isButton()) return;

    const { customId, user, guild } = interaction;

    if (customId === "join_queue") {
      const serverName = guild.name;
      const serverId = guild.id;
      let serverQueue = await ServerQueue.findById(serverId);

      if (!serverQueue) {
        // Create a new ServerQueue document if none exists
        serverQueue = new ServerQueue({
          _id: serverId,
          serverName,
          category: "",
          preferences: {},
          usedStats: [],
          queue: { 2: [], 3: [], 4: [] },
        });

        await serverQueue.save();

        const embed = new EmbedBuilder()
          .setTitle("Category Not Set 🚫")
          .setDescription(
            "Please set up a category before joining the queue. Use the `/set` command to configure it."
          )
          .setColor("#FF0000")
          .setFooter({ text: "Queue setup required." })
          .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: 64 });
        return; // Exit early after replying
      }

      const gameMode = serverQueue.preferences.get(user.id) || ["2", "3", "4"];

      try {
        if (!interaction.member.voice.channel) {
          const embed = new EmbedBuilder()
            .setTitle("Voice Channel Required 🚨")
            .setDescription(
              "You need to be in a voice channel to join the queue. Please join a voice channel and try again."
            )
            .setColor("#FF0000")
            .setFooter({ text: "Join a voice channel to start matchmaking." })
            .setTimestamp();

          return await interaction.reply({ embeds: [embed], flags: 64 });
        }

        // Defer the interaction to allow time for processing
        await interaction.deferReply({ flags: 64 });

        const member = await guild.members.fetch(user.id);

        if (!member.nickname) {
          const embed = new EmbedBuilder()
            .setTitle("Nickname Not Found ❓")
            .setDescription(
              "We couldn't detect a nickname for you. Please set your nickname and try again."
            )
            .setColor("#FF0000")
            .setFooter({ text: "A nickname is required for fetching stats." })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          return;
        }

        const nickname = member.nickname;
        const username = getUsername(nickname);
        const UUID = await getUUID(username);

        if (!serverQueue.category) {
          const embed = new EmbedBuilder()
            .setTitle("Category Missing 🚫")
            .setDescription(
              "No category is set up. Please use the `/set` command to configure a category for voice channels."
            )
            .setColor("#FF0000")
            .setFooter({ text: "Set up your category to join the queue." })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          return;
        }

        let userStat = serverQueue.usedStats.find(
          (entry) => entry.userId === UUID
        );

        if (!userStat) {
          const statNumber = await getBedwarsStats(nickname);
          const stars = await getstars(nickname); // Fetch stars data
          logger.debug(`Fetched stat number for ${nickname}: ${statNumber}`);
          logger.debug(`Fetched stars for ${nickname}: ${stars}`);

          // Check if statNumber and stars are valid (i.e., not 0 or NaN)
          if (
            statNumber <= 0 ||
            isNaN(statNumber) ||
            stars <= 0 ||
            isNaN(stars)
          ) {
            const embed = new EmbedBuilder()
              .setTitle("Stats Unavailable 😞")
              .setDescription(
                `We couldn't retrieve valid stats for **${user.username}**. Please try again later.`
              )
              .setColor("#FF0000")
              .setFooter({ text: "Stats are currently unavailable." })
              .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
          }

          serverQueue.usedStats.push({
            userId: UUID,
            statNumber,
            stars, // Save stars data
          });

          userStat = { userId: UUID, statNumber, stars }; // Set the fetched statNumber and stars for the user
          logger.debug("New user and his stats are: ", userStat);
        }

        let wasInQueue = false;
        for (const mode of gameMode) {
          const userIndex = serverQueue.queue[mode].findIndex(
            (entry) => entry.userId === user.id
          );

          if (userIndex !== -1) {
            serverQueue.queue[mode].splice(userIndex, 1);
            wasInQueue = true;
          }
        }

        if (wasInQueue) {
          await serverQueue.save();

          const embed = new EmbedBuilder()
            .setTitle("Left Queue 👋")
            .setDescription(
              "You have successfully left all your selected queues."
            )
            .setColor("#00FF00")
            .setFooter({ text: "Feel free to join another queue anytime!" })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          return;
        }

        // Add the user to each selected queue
        for (const mode of gameMode) {
          serverQueue.queue[mode].push({
            userId: user.id,
            timestamp: new Date(),
            statNumber: userStat.statNumber,
            stars: userStat.stars,
          });
        }

        await serverQueue.save();

        const embed = new EmbedBuilder()
          .setTitle("Joined Queue 🎉")
          .setDescription(
            `You have joined the **${gameMode.join(", ")}** queue!`
          )
          .setColor("#00FF00")
          .setFooter({ text: "Good luck and have fun!" })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        logger.error(error);

        await interaction.editReply({
          content:
            "There was an error processing your request. Please try again later.",
        });
      }
    } else if (customId === "set_preferences") {
      const serverId = guild.id;
      let serverQueue = await ServerQueue.findById(serverId);

      if (!serverQueue) {
        const embed = new EmbedBuilder()
          .setTitle("Configuration Not Found 🚫")
          .setDescription(
            "Server configuration not found. Please run the `/setup` command to configure the bot."
          )
          .setColor("#FF0000")
          .setFooter({ text: "Run /setup to initialize the server settings." })
          .setTimestamp();

        return await interaction.reply({ embeds: [embed], flags: 64 });
      }

      if (!serverQueue.preferences) {
        serverQueue.preferences = new Map();
      }

      let wasInQueue = false;
      const gameMode = serverQueue.preferences.get(user.id) || ["2", "3", "4"];
      for (const mode of gameMode) {
        const userIndex = serverQueue.queue[mode].findIndex(
          (entry) => entry.userId === user.id
        );

        if (userIndex !== -1) {
          serverQueue.queue[mode].splice(userIndex, 1);
          wasInQueue = true;
        }
      }

      if (wasInQueue) {
        const embed = new EmbedBuilder()
          .setTitle("Action Denied 🚫")
          .setDescription(
            "You cannot edit your preferences while you are in a queue. Please leave the queue first to update your preferences."
          )
          .setColor("#FF0000")
          .setFooter({ text: "Exit the queue and try again." })
          .setTimestamp();

        logger.debug(
          `User ${user.username} tried to edit preferences while in queue.`
        );
        return await interaction.reply({ embeds: [embed], flags: 64 });
      }

      let userPreferences = serverQueue.preferences.get(user.id) || [
        "2",
        "3",
        "4",
      ];
      const member = await guild.members.fetch(user.id);

      logger.debug(`${member.displayName} preferences:`, userPreferences);

      const embed = new EmbedBuilder()
        .setTitle("Set Your Preferences ⚙️")
        .setDescription(
          "Select your preferred game modes below. Your selection will be saved for future queue joins."
        )
        .setColor("#00FF00")
        .setFooter({ text: "Customize your gaming experience!" })
        .setTimestamp();

      const buttons = ["2", "3", "4"].map((m) => {
        return new ButtonBuilder()
          .setCustomId(`pref_${m}`)
          .setLabel(`${m}v${m}`)
          .setStyle(
            userPreferences.includes(m)
              ? ButtonStyle.Success
              : ButtonStyle.Secondary
          );
      });

      const actionRow = new ActionRowBuilder().addComponents(buttons);

      await interaction.reply({
        embeds: [embed],
        components: [actionRow],
        flags: 64,
      });
    }
  },
};
