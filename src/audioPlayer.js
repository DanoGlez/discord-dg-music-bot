const { joinVoiceChannel, createAudioPlayer, createAudioResource, NoSubscriberBehavior } = require('@discordjs/voice');
const play = require('play-dl');
const { getServerQueue, scheduleAutoDisconnect, cancelAutoDisconnect } = require('./queueManager');
const { searchWithRetry } = require('./playDLConfig');
const { YtdlpFallback } = require('./ytdlpFallback');

async function createPlayer(voiceChannel, interaction) {
  const guildId = interaction.guild.id;
  const serverQueue = getServerQueue(guildId);
  
  if (!serverQueue) return null;
  
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: interaction.guild.id,
    adapterCreator: interaction.guild.voiceAdapterCreator
  });
  
  const player = createAudioPlayer({ 
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause } 
  });
  
  serverQueue.player = player;
  serverQueue.connection = connection;
  connection.subscribe(player);
  
  const playNext = async () => {
    const next = serverQueue.queue.shift();
    if (!next) {
      // Queue is empty, schedule auto-disconnect
      console.log(`Queue empty for guild ${guildId}, scheduling auto-disconnect`);
      scheduleAutoDisconnect(guildId, interaction);
      return;
    }
    
    // Cancel auto-disconnect since we're playing something
    cancelAutoDisconnect(guildId);
    
    try {
      console.log(`Attempting to play: ${next.title} - URL: ${next.url}`);
      
      // Get stream using play-dl
      const stream = await play.stream(next.url, { 
        quality: 2, // Higher quality
        filter: 'audioonly',
        seek: 0,
        discordPlayerCompatibility: true
      });
      
      const resource = createAudioResource(stream.stream, {
        inputType: stream.type
      });
      
      player.play(resource);
      player.once('idle', playNext);
      
      // Send playing message
      try {
        await interaction.followUp({ 
          content: `🎶 Now playing: **${next.title}** (requested by ${next.requestedBy})` 
        });
      } catch (followUpError) {
        console.log('Could not send follow-up message (interaction may have expired)');
      }
      
    } catch (error) {
      console.error(`Error playing ${next.title}:`, error.message);
      
      // Handle playback error with fallback
      await handlePlaybackError(next, error, player, playNext, interaction);
    }
  };
  
  return playNext;
}

async function handlePlaybackError(song, error, player, playNext, interaction) {
  // Categorize playback errors
  let errorMessage = 'Unknown playback error';
  if (error.message.includes('Video unavailable')) {
    errorMessage = 'Video is unavailable';
  } else if (error.message.includes('Sign in to confirm')) {
    errorMessage = 'YouTube bot detection - trying fallback method';
  } else if (error.message.includes('While getting info from url')) {
    errorMessage = 'YouTube access blocked - trying fallback method';
  } else if (error.message.includes('Private video')) {
    errorMessage = 'Private or restricted video';
  } else if (error.message.includes('age-restricted')) {
    errorMessage = 'Age-restricted content';
  } else if (error.message.includes('not available in your country')) {
    errorMessage = 'Region-restricted content';
  } else if (error.message.includes('timeout')) {
    errorMessage = 'Request timed out';
  }
  
  console.log(`🚨 Playbook error for "${song.title}": ${errorMessage}`);
  
  // Try yt-dlp fallback if enabled and error suggests bot detection
  if (process.env.USE_YTDLP_FALLBACK === 'true' && 
      (error.message.includes('Sign in to confirm') || 
       error.message.includes('While getting info from url'))) {
    
    console.log(`🔄 Attempting yt-dlp fallback for: ${song.title}`);
    
    try {
      const ytdlpFallback = new YtdlpFallback();
      const streamInfo = await ytdlpFallback.getStreamUrl(song.url);
      
      console.log(`✅ yt-dlp fallback successful, creating resource...`);
      
      // Create audio resource from yt-dlp stream
      const resource = createAudioResource(streamInfo.url, {
        inputType: 'webm/opus'
      });
      
      player.play(resource);
      player.once('idle', playNext);
      
      // Update song info from yt-dlp if available
      if (streamInfo.title && streamInfo.title !== 'Unknown') {
        song.title = streamInfo.title;
      }
      
      try {
        await interaction.followUp({ 
          content: `🎶 Now playing via fallback: **${song.title}** (requested by ${song.requestedBy})` 
        });
      } catch (followUpError) {
        console.log('Could not send follow-up message (interaction may have expired)');
      }
      
      return; // Success with fallback
      
    } catch (fallbackError) {
      console.error(`❌ yt-dlp fallback also failed: ${fallbackError.message}`);
      errorMessage = `Both play-dl and yt-dlp failed: ${fallbackError.message}`;
    }
  }
  
  // If fallback failed or not enabled, try alternative search
  try {
    console.log(`🔍 Searching for alternative to: ${song.title}`);
    
    const searchResults = await searchWithRetry(song.title, { limit: 5 });
    
    if (searchResults.length > 0) {
      // Find a different video (not the same URL)
      let alternative = searchResults.find(result => result.url !== song.url);
      if (!alternative && searchResults.length > 1) {
        alternative = searchResults[1];
      } else if (!alternative) {
        alternative = searchResults[0];
      }
      
      console.log(`Alternative found: ${alternative.title} - ${alternative.url}`);
      
      // Try to play the alternative with play-dl first
      try {
        const altStream = await play.stream(alternative.url, { 
          quality: 2,
          filter: 'audioonly',
          seek: 0,
          discordPlayerCompatibility: true
        });
        
        const resource = createAudioResource(altStream.stream, {
          inputType: altStream.type
        });
        
        player.play(resource);
        player.once('idle', playNext);
        
        try {
          await interaction.followUp({ 
            content: `🎶 Now playing (alternative): **${alternative.title}** (requested by ${song.requestedBy})\n⚠️ Original video: ${errorMessage.toLowerCase()}` 
          });
        } catch (followUpError) {
          console.log('Could not send alternative follow-up message');
        }
        
      } catch (altError) {
        // If alternative also fails with play-dl, try yt-dlp fallback
        if (process.env.USE_YTDLP_FALLBACK === 'true') {
          console.log(`🔄 Alternative failed with play-dl, trying yt-dlp for: ${alternative.title}`);
          
          const ytdlpFallback = new YtdlpFallback();
          const streamInfo = await ytdlpFallback.getStreamUrl(alternative.url);
          
          const resource = createAudioResource(streamInfo.url, {
            inputType: 'webm/opus'
          });
          
          player.play(resource);
          player.once('idle', playNext);
          
          try {
            await interaction.followUp({ 
              content: `🎶 Now playing alternative via fallback: **${streamInfo.title || alternative.title}** (requested by ${song.requestedBy})` 
            });
          } catch (followUpError) {
            console.log('Could not send follow-up message (interaction may have expired)');
          }
        } else {
          throw altError;
        }
      }
    } else {
      throw new Error('No alternatives found');
    }
  } catch (fallbackError) {
    console.error(`Fallback failed for ${song.title}:`, fallbackError.message);
    
    try {
      await interaction.followUp({ 
        content: `❌ Could not play **${song.title}**: ${errorMessage}. Skipping to next song...` 
      });
    } catch (followUpError) {
      console.log('Could not send error follow-up message');
    }
    
    // Continue with next song
    playNext();
  }
}

module.exports = {
  createPlayer,
  handlePlaybackError
};