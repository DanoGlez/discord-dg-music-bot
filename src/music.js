const { joinVoiceChannel, createAudioPlayer, createAudioResource, NoSubscriberBehavior } = require('@discordjs/voice');
const play = require('play-dl');
const ytSearch = require('yt-search');
const { searchSpotifyTrack } = require('./spotify');

// guildId => { queue: [], player, connection }
const queues = new Map();

async function handlePlay(interaction) {
  // Defer the reply immediately to prevent timeout
  await interaction.deferReply();
  
  const guildId = interaction.guild.id;
  let query = interaction.options.getString('query');
  let url = query;
  let title = query;
  let isPlaylist = false;
  let playlistInfo = null;

  try {
    // Check if it's a YouTube URL (single video or playlist)
    const urlType = play.yt_validate(url);
    
    if (urlType === 'playlist') {
      console.log(`Processing YouTube playlist: ${url}`);
      isPlaylist = true;
      
      // Get playlist info
      playlistInfo = await play.playlist_info(url, { incomplete: true });
      const videos = await playlistInfo.all_videos();
      
      if (videos.length === 0) {
        return interaction.editReply('❌ This playlist is empty or private.');
      }
      
      console.log(`Playlist found: ${playlistInfo.title} - ${videos.length} videos`);
      
      // Use first video info for initial setup
      title = playlistInfo.title;
      url = videos[0].url;
      
    } else if (urlType === 'video') {
      console.log(`Processing YouTube video: ${url}`);
      const videoInfo = await play.video_info(url);
      title = videoInfo.video_details.title;
      console.log(`Video info obtained: ${title}`);
      
    } else {
      // Not a real video/playlist URL → treat as search query
      console.log(`Searching for: ${query}`);
      
      // Try Spotify first for better search results
      const spotifyResult = await searchSpotifyTrack(query);
      if (spotifyResult) {
        console.log(`Spotify result: ${spotifyResult}`);
        query = spotifyResult; // Use Spotify result for YouTube search
      }
      
      // Search on YouTube
      const searchResults = await play.search(query, { limit: 1, source: { youtube: 'video' } });
      if (searchResults.length === 0) {
        return interaction.editReply('❌ No videos found for your search query.');
      }
      
      url = searchResults[0].url;
      title = searchResults[0].title;
      console.log(`Video found: ${title} - ${url}`);
    }

    const member = interaction.member;
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      return interaction.editReply('❌ You must be in a voice channel to use this command.');
    }

    if (!queues.has(guildId)) {
      queues.set(guildId, { queue: [], player: null, connection: null });
    }
    const serverQueue = queues.get(guildId);

    // Handle playlist
    if (isPlaylist && playlistInfo) {
      const videos = await playlistInfo.all_videos();
      
      // Calculate total duration
      let totalDuration = 0;
      videos.forEach(video => {
        if (video.durationInSec) {
          totalDuration += video.durationInSec;
        }
      });
      
      // Add all videos to queue
      videos.forEach(video => {
        serverQueue.queue.push({
          url: video.url,
          title: video.title,
          requestedBy: interaction.user.username,
          duration: video.durationRaw || 'Unknown'
        });
      });
      
      // Format duration
      const hours = Math.floor(totalDuration / 3600);
      const minutes = Math.floor((totalDuration % 3600) / 60);
      const formattedDuration = hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}:00` : `${minutes}:${(totalDuration % 60).toString().padStart(2, '0')}`;
      
      await interaction.editReply({
        content: `✅ **Added Playlist**\n🎵 **${playlistInfo.title}**\n⏱️ **Playlist Length:** ${formattedDuration}\n📊 **Tracks:** ${videos.length}`
      });
      
    } else {
      // Single video
      serverQueue.queue.push({ url, title, requestedBy: interaction.user.username });
      await interaction.editReply(`✅ Added to queue: **${title}**`);
    }

    // Start playing if not already playing
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
          
          // Get stream using play-dl (much more reliable)
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
          
          // Categorize playback errors
          let errorMessage = 'Unknown playback error';
          if (error.message.includes('Video unavailable')) {
            errorMessage = 'Video is unavailable';
          } else if (error.message.includes('Private video')) {
            errorMessage = 'Private or restricted video';
          } else if (error.message.includes('age-restricted')) {
            errorMessage = 'Age-restricted content';
          } else if (error.message.includes('not available in your country')) {
            errorMessage = 'Region-restricted content';
          } else if (error.message.includes('timeout')) {
            errorMessage = 'Request timed out';
          }
          
          // Try to find an alternative using play-dl search
          try {
            console.log(`Searching for alternative to: ${next.title}`);
            
            const searchResults = await play.search(next.title, { 
              limit: 3, 
              source: { youtube: 'video' } 
            });
            
            if (searchResults.length > 0) {
              // Find a different video (not the same URL)
              let alternative = searchResults.find(result => result.url !== next.url);
              if (!alternative && searchResults.length > 1) {
                alternative = searchResults[1];
              } else if (!alternative) {
                alternative = searchResults[0];
              }
              
              console.log(`Alternative found: ${alternative.title} - ${alternative.url}`);
              
              // Try to play the alternative
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
                  content: `🎶 Now playing (alternative): **${alternative.title}** (requested by ${next.requestedBy})\n⚠️ Original video: ${errorMessage.toLowerCase()}` 
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
    } else if (error.message.includes('Private playlist')) {
      userMessage = 'This playlist is private or unavailable';
    } else if (error.message.includes('Unavailable')) {
      userMessage = 'This content is unavailable or restricted';
    }
    
    try {
      await interaction.editReply(`❌ ${userMessage}`);
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
