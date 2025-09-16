require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const commands = require('./commands');
const { handlePlay, handleQueue } = require('./music');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('Comandos slash registrados.');
  } catch (error) {
    console.error(error);
  }
}

registerCommands();

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'play') {
    await handlePlay(interaction);
  }
  if (interaction.commandName === 'queue') {
    await handleQueue(interaction);
  }
});

client.login(process.env.DISCORD_TOKEN);
