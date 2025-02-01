const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const data = require('./data/config.json');
const logger = require('./utils/logger');
const connectDB = require('./utils/mongoose');
const ServerQueue = require('./utils/serverQueue');

connectDB();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);
for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            logger.warn(`Command ${file} is missing data or execute function`);
        }
    }
}
logger.info('Commands loaded');

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}
logger.info('Events loaded');

client.login(data.token);

// Function to clear queues before exiting
async function clearQueuesAndExit(exitCode) {
    logger.info('Clearing all queues before shutdown...');

    try {
        const serverQueues = await ServerQueue.find();
        for (const queue of serverQueues) {
            queue.queue["2"] = [];
            queue.queue["3"] = [];
            queue.queue["4"] = [];
            await queue.save();
        }
        logger.info('All queues have been cleared.');
    } catch (error) {
        logger.error('Error clearing queues:', error);
    }

    process.exit(exitCode);
}

// // Handle process exits
// process.on('SIGINT', () => clearQueuesAndExit(0));  // Handle CTRL+C
// process.on('SIGTERM', () => clearQueuesAndExit(0)); // Handle termination (e.g., from hosting services)

// process.on('uncaughtException', (err) => {
//     if (err.stack) {
//         logger.error('Uncaught Exception:', err.stack); // Log the full stack trace if available
//     } else {
//         logger.error('Uncaught Exception:', err); // Log the error message if no stack trace is available
//     }
//     clearQueuesAndExit(1);
// });

// process.on('unhandledRejection', (reason, promise) => {
//     if (reason.stack) {
//         logger.error('Unhandled Promise Rejection:', reason.stack); // Log stack trace if available
//     } else {
//         logger.error('Unhandled Promise Rejection:', reason); // Log the rejection reason if no stack trace
//     }
//     clearQueuesAndExit(1);
// });