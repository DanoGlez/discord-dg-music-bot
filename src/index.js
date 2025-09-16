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
  
  try {
    if (interaction.commandName === 'play') {
      await handlePlay(interaction);
    }
    if (interaction.commandName === 'queue') {
      await handleQueue(interaction);
    }
  } catch (error) {
    console.error('Error handling command:', error);
    
    // Categorize interaction errors
    let errorMessage = '❌ An unexpected error occurred while processing your command.';
    
    if (error.code === 10062) {
      errorMessage = '❌ This interaction has expired. Please try the command again.';
    } else if (error.code === 50013) {
      errorMessage = '❌ I don\'t have permission to perform this action.';
    } else if (error.code === 50001) {
      errorMessage = '❌ I don\'t have access to this channel.';
    } else if (error.message?.includes('Missing Permissions')) {
      errorMessage = '❌ I\'m missing required permissions. Please check my role settings.';
    } else if (error.message?.includes('ENOTFOUND') || error.message?.includes('ETIMEDOUT')) {
      errorMessage = '❌ Network error. Please try again in a moment.';
    } else if (error.message?.includes('voice')) {
      errorMessage = '❌ Voice connection error. Make sure I can connect to your voice channel.';
    }
    
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    } catch (replyError) {
      console.error('Could not send error message to user:', replyError.message);
    }
  }
});

// Enhanced error handling for unhandled promises and exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection at:', promise);
  console.error('Reason:', reason);
  
  // Log specific error types for debugging
  if (reason?.code) {
    console.error('Discord API Error Code:', reason.code);
  }
  if (reason?.statusCode) {
    console.error('HTTP Status Code:', reason.statusCode);
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception thrown:');
  console.error('Error Name:', error.name);
  console.error('Error Message:', error.message);
  console.error('Stack Trace:', error.stack);
  
  // Don't exit the process in production, just log the error
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

// Enhanced Discord client error handling
client.on('error', (error) => {
  console.error('Discord client error occurred:');
  console.error('Error:', error.message);
  if (error.code) {
    console.error('Error Code:', error.code);
  }
});

client.on('warn', (warning) => {
  console.warn('Discord client warning:', warning);
});

client.on('debug', (info) => {
  // Only log debug info in development
  if (process.env.NODE_ENV !== 'production') {
    console.debug('Discord debug:', info);
  }
});

client.login(process.env.DISCORD_TOKEN);
