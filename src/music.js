const { joinVoiceChannel, createAudioPlayer, createAudioResource, NoSubscriberBehavior } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');
const { searchSpotifyTrack } = require('./spotify');

// guildId => { queue: [], player, connection }
const queues = new Map();

async function handlePlay(interaction) {
  const guildId = interaction.guild.id;
  const query = interaction.options.getString('query');
  let url = query;
  let title = query;

  if (!ytdl.validateURL(url)) {
    const spotifyResult = await searchSpotifyTrack(query);
    if (spotifyResult) url = spotifyResult;
    const ytRes = await ytSearch(url);
    if (!ytRes.videos.length) return interaction.reply('No video found.');
    url = ytRes.videos[0].url;
    title = ytRes.videos[0].title;
  } else {
    const info = await ytdl.getInfo(url);
    title = info.videoDetails.title;
  }

  const member = interaction.member;
  const voiceChannel = member.voice.channel;
  if (!voiceChannel) return interaction.reply('You must be in a voice channel.');

  if (!queues.has(guildId)) {
    queues.set(guildId, { queue: [], player: null, connection: null });
  }
  const serverQueue = queues.get(guildId);
  serverQueue.queue.push({ url, title, requestedBy: interaction.user.username });

  if (!serverQueue.player) {
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: interaction.guild.id,
      adapterCreator: interaction.guild.voiceAdapterCreator
    });
    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    serverQueue.player = player;
    serverQueue.connection = connection;
    connection.subscribe(player);

    const playNext = () => {
      const next = serverQueue.queue.shift();
      if (!next) {
        serverQueue.player = null;
        serverQueue.connection.destroy();
        serverQueue.connection = null;
        return;
      }
      const stream = ytdl(next.url, { filter: 'audioonly' });
      const resource = createAudioResource(stream);
      player.play(resource);
      player.once('idle', playNext);
  interaction.followUp({ content: `🎶 Now playing: **${next.title}** (requested by ${next.requestedBy})` });
    };

    playNext();
    await interaction.reply(`Added to queue: **${title}**`);
  } else {
    await interaction.reply(`Added to queue: **${title}**`);
  }
}

function handleQueue(interaction) {
  const guildId = interaction.guild.id;
  const serverQueue = queues.get(guildId);
  if (!serverQueue || serverQueue.queue.length === 0) {
    return interaction.reply('The queue is empty.');
  }
  const queueList = serverQueue.queue.map((song, i) => `${i + 1}. ${song.title} (requested by ${song.requestedBy})`).join('\n');
  return interaction.reply(`Music queue:\n${queueList}`);
}

module.exports = { handlePlay, handleQueue };
