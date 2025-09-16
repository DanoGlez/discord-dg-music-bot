const { SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play music from YouTube or search on Spotify')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('YouTube link or song name')
        .setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current music queue')
    .toJSON()
];

module.exports = commands;
