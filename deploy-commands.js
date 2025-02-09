import { REST, Routes } from 'discord.js';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import config, { clientid as _clientid, token as _token } from './data/config.json';

if (!_clientid || !_token) {
  console.error('Missing required configuration properties.');
  process.exit(1);
}

const { clientid, token } = config;

const commands = [];
// Grab all the command folders from the commands directory
const foldersPath = join(__dirname, 'commands');
const commandFolders = readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = join(foldersPath, folder);
    const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = join(commandsPath, file);
        const command = require(filePath);
        // Set a new item in the Collection with the key as the command name and the value as the exported module
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        } else {
            console.warn(`Command ${file} is missing data or execute function`);
        }
    }
}

// Construct and prepare an instance of the REST module
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Started clearing and refreshing application (/) commands.');

        // Clear all existing commands to avoid duplicates
        await rest.put(Routes.applicationCommands(clientid), { body: [] });

        console.log('Successfully cleared existing commands.');

        // Register new commands globally
        await rest.put(
            Routes.applicationCommands(clientid),
            { body: commands },
        );

        console.log('Successfully reloaded global application (/) commands.');
    } catch (error) {
        console.error('Error refreshing commands:', error);
    }
})();
