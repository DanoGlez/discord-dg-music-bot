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

  try {
    if (!ytdl.validateURL(url)) {
      console.log(`Searching for: ${query}`);
      const spotifyResult = await searchSpotifyTrack(query);
      if (spotifyResult) {
        console.log(`Spotify result: ${spotifyResult}`);
        url = spotifyResult;
      }
      
      const ytRes = await ytSearch(url);
      if (!ytRes.videos.length) {
        return interaction.reply('❌ No videos found for your search query.');
      }
      
      url = ytRes.videos[0].url;
      title = ytRes.videos[0].title;
      console.log(`Video found: ${title} - ${url}`);
    } else {
      console.log(`Valid YouTube URL: ${url}`);
      try {
        const info = await ytdl.getInfo(url);
        title = info.videoDetails.title;
        console.log(`Video info obtained: ${title}`);
      } catch (infoError) {
        console.error(`Error getting video info: ${infoError.message}`);
        
        // Categorize the error
        if (infoError.statusCode === 410) {
          return interaction.reply(`❌ This video is no longer available or has been removed.`);
        } else if (infoError.statusCode === 403) {
          return interaction.reply(`❌ Access denied. This video may be restricted in your region.`);
        } else if (infoError.statusCode === 429) {
          return interaction.reply(`❌ Rate limit exceeded. Please try again in a few minutes.`);
        } else {
          return interaction.reply(`❌ Unable to access this video. It may be private, restricted, or unavailable.`);
        }
      }
    }

    const member = interaction.member;
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      return interaction.reply('❌ You must be in a voice channel to use this command.');
    }

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

    const playNext = async () => {
      const next = serverQueue.queue.shift();
      if (!next) {
        serverQueue.player = null;
        serverQueue.connection.destroy();
        serverQueue.connection = null;
        return;
      }
      
      try {
        console.log(`Attempting to play: ${next.title} - URL: ${next.url}`);
        
        // Verify the URL is still valid
        const info = await ytdl.getInfo(next.url);
        if (!info) {
          throw new Error('Unable to get video information');
        }
        
        const stream = ytdl(next.url, { 
          filter: 'audioonly',
          quality: 'highestaudio',
          highWaterMark: 1 << 25 // 32MB buffer
        });
        
        const resource = createAudioResource(stream);
        player.play(resource);
        
        player.once('idle', playNext);
        
        // Handle potential interaction expiry
        try {
          await interaction.followUp({ content: `🎶 Now playing: **${next.title}** (requested by ${next.requestedBy})` });
        } catch (followUpError) {
          console.log('Could not send follow-up message (interaction may have expired)');
        }
        
      } catch (error) {
        console.error(`Error playing ${next.title}:`, error.message);
        
        // Categorize playback errors
        let errorMessage = 'Unknown playback error';
        if (error.statusCode === 410) {
          errorMessage = 'Video is no longer available';
        } else if (error.statusCode === 403) {
          errorMessage = 'Access denied or region-restricted';
        } else if (error.statusCode === 429) {
          errorMessage = 'Rate limit exceeded';
        } else if (error.message.includes('ENOTFOUND') || error.message.includes('ETIMEDOUT')) {
          errorMessage = 'Network connection error';
        } else if (error.message.includes('No video formats found')) {
          errorMessage = 'No playable audio format found';
        }
        
        // Try to find an alternative
        try {
          console.log(`Searching for alternative to: ${next.title}`);
          const ytRes = await ytSearch(next.title);
          if (ytRes.videos.length > 0) {
            const alternative = ytRes.videos[0];
            console.log(`Alternative found: ${alternative.title} - ${alternative.url}`);
            
            // Validate alternative before playing
            const altInfo = await ytdl.getInfo(alternative.url);
            if (!altInfo) {
              throw new Error('Alternative video not accessible');
            }
            
            const stream = ytdl(alternative.url, { 
              filter: 'audioonly',
              quality: 'highestaudio'
            });
            const resource = createAudioResource(stream);
            player.play(resource);
            
            player.once('idle', playNext);
            
            try {
              await interaction.followUp({ 
                content: `🎶 Now playing (alternative): **${alternative.title}** (requested by ${next.requestedBy})\n⚠️ Original video was ${errorMessage.toLowerCase()}` 
              });
            } catch (followUpError) {
              console.log('Could not send alternative follow-up message');
            }
          } else {
            throw new Error('No alternatives found');
          }
        } catch (fallbackError) {
          console.error(`Fallback failed for ${next.title}:`, fallbackError.message);
          
          try {
            await interaction.followUp({ 
              content: `❌ Could not play **${next.title}**: ${errorMessage}. Skipping to next song...` 
            });
          } catch (followUpError) {
            console.log('Could not send error follow-up message');
          }
          
          // Continue with next song
          playNext();
        }
      }
    };

    playNext();
    await interaction.reply(`Added to queue: **${title}**`);
  } else {
    await interaction.reply(`Added to queue: **${title}**`);
  }
  } catch (error) {
    console.error('Error in handlePlay:', error.message);
    
    // Categorize main function errors
    let userMessage = 'An unexpected error occurred';
    if (error.message.includes('ENOTFOUND') || error.message.includes('ETIMEDOUT')) {
      userMessage = 'Network connection error. Please check your internet connection';
    } else if (error.message.includes('Invalid URL')) {
      userMessage = 'Invalid YouTube URL provided';
    } else if (error.message.includes('No videos found')) {
      userMessage = 'No videos found for your search query';
    } else if (error.statusCode === 403) {
      userMessage = 'Access denied. The bot may be rate-limited or the video is restricted';
    }
    
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(`❌ ${userMessage}`);
      } else {
        await interaction.reply(`❌ ${userMessage}`);
      }
    } catch (replyError) {
      console.error('Could not send error message to user:', replyError.message);
    }
  }
}

function handleQueue(interaction) {
  const guildId = interaction.guild.id;
  const serverQueue = queues.get(guildId);
  
  if (!serverQueue || serverQueue.queue.length === 0) {
    return interaction.reply('📭 The music queue is empty. Use `/play` to add some songs!');
  }
  
  const queueList = serverQueue.queue
    .map((song, i) => `${i + 1}. **${song.title}** (requested by ${song.requestedBy})`)
    .join('\n');
    
  const queueMessage = `🎵 **Music Queue** (${serverQueue.queue.length} song${serverQueue.queue.length !== 1 ? 's' : ''}):\n\n${queueList}`;
  
  // Truncate if message is too long for Discord
  if (queueMessage.length > 2000) {
    const truncatedList = serverQueue.queue
      .slice(0, 10)
      .map((song, i) => `${i + 1}. **${song.title}** (requested by ${song.requestedBy})`)
      .join('\n');
    
    return interaction.reply(
      `🎵 **Music Queue** (${serverQueue.queue.length} songs, showing first 10):\n\n${truncatedList}\n\n... and ${serverQueue.queue.length - 10} more songs`
    );
  }
  
  return interaction.reply(queueMessage);
}

module.exports = { handlePlay, handleQueue };
