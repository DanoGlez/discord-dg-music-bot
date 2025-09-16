const { 
  getServerQueue, 
  createServerQueue, 
  hasServerQueue, 
  deleteServerQueue,
  addToQueue,
  addPlaylistToQueue,
  clearQueue,
  cancelAutoDisconnect 
} = require('./queueManager');
const { createPlayer } = require('./audioPlayer');
const { processQuery, formatPlaylistDuration } = require('./musicSearch');
const { joinVoiceChannel, VoiceConnectionStatus, createAudioPlayer, createAudioResource } = require('@discordjs/voice');
const { searchWithRetry } = require('./playDLConfig');
const play = require('play-dl');

async function handlePlay(interaction) {
  // Defer the reply immediately to prevent timeout
  await interaction.deferReply();
  
  const guildId = interaction.guild.id;
  const query = interaction.options.getString('query');

  try {
    // Process the query (URL validation, search, etc.)
    const { url, title, isPlaylist, playlistInfo } = await processQuery(query);

    // Check if user is in voice channel
    const member = interaction.member;
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      return interaction.editReply('❌ You must be in a voice channel to use this command.');
    }

    // Get or create server queue
    if (!hasServerQueue(guildId)) {
      createServerQueue(guildId);
    }
    const serverQueue = getServerQueue(guildId);

    // Handle playlist vs single video
    if (isPlaylist && playlistInfo) {
      const videos = await playlistInfo.all_videos();
      
      // Add all videos to queue
      addPlaylistToQueue(guildId, videos, interaction.user.username);
      
      // Format and send playlist info
      const formattedDuration = formatPlaylistDuration(videos);
      
      await interaction.editReply({
        content: `✅ **Added Playlist**\n🎵 **${playlistInfo.title}**\n⏱️ **Playlist Length:** ${formattedDuration}\n📊 **Tracks:** ${videos.length}`
      });
      
    } else {
      // Single video
      addToQueue(guildId, { 
        url, 
        title, 
        requestedBy: interaction.user.username 
      });
      await interaction.editReply(`✅ Added to queue: **${title}**`);
    }

    // Start playing if not already playing
    if (!serverQueue.player) {
      const playNext = await createPlayer(voiceChannel, interaction);
      if (playNext) {
        playNext();
      }
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
    } else if (error.message.includes('Private playlist') || error.message.includes('empty or private')) {
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
  const serverQueue = getServerQueue(guildId);
  
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

function handleSkip(interaction) {
  const guildId = interaction.guild.id;
  const serverQueue = getServerQueue(guildId);
  
  if (!serverQueue || !serverQueue.player) {
    return interaction.reply('❌ There is no music currently playing!');
  }
  
  // Force the player to stop, which will trigger playNext
  serverQueue.player.stop();
  return interaction.reply('⏭️ Skipped the current song!');
}

function handleStop(interaction) {
  const guildId = interaction.guild.id;
  const serverQueue = getServerQueue(guildId);
  
  if (!serverQueue) {
    return interaction.reply('❌ There is no music currently playing!');
  }
  
  // Clear the queue
  clearQueue(guildId);
  
  // Cancel auto-disconnect timer
  cancelAutoDisconnect(guildId);
  
  // Stop the player and disconnect
  if (serverQueue.player) {
    serverQueue.player.stop();
  }
  
  if (serverQueue.connection) {
    serverQueue.connection.destroy();
  }
  
  // Clean up
  deleteServerQueue(guildId);
  
  return interaction.reply('⏹️ Music stopped and disconnected from voice channel!');
}

async function handleTest(interaction) {
  // Defer the reply immediately
  await interaction.deferReply();
  
  const member = interaction.member;
  const voiceChannel = member.voice.channel;
  
  let testResults = [];
  let overallStatus = '✅';
  
  // Test 1: Check if user is in voice channel
  testResults.push('## 🎯 Test Results\n');
  
  if (!voiceChannel) {
    testResults.push('❌ **Voice Channel**: Not in a voice channel');
    overallStatus = '❌';
  } else {
    testResults.push(`✅ **Voice Channel**: Connected to "${voiceChannel.name}"`);
    
    try {
      // Test 2: Try to join voice channel
      testResults.push('🔄 **Connecting to voice channel...**');
      
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator
      });
      
      // Wait for connection to be ready
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);
        
        connection.on(VoiceConnectionStatus.Ready, () => {
          clearTimeout(timeout);
          resolve();
        });
        
        connection.on(VoiceConnectionStatus.Disconnected, () => {
          clearTimeout(timeout);
          reject(new Error('Connection failed'));
        });
      });
      
      testResults.push('✅ **Voice Connection**: Successfully connected');
      
      // Test 3: Try to create audio player
      testResults.push('🔄 **Testing audio player...**');
      const player = createAudioPlayer();
      testResults.push('✅ **Audio Player**: Created successfully');
      
      // Test 4: Test play-dl search functionality
      testResults.push('🔄 **Testing YouTube search...**');
      let searchResults = null;
      try {
        searchResults = await searchWithRetry('test audio', { limit: 1 });
        if (searchResults && searchResults.length > 0) {
          testResults.push(`✅ **YouTube Search**: Found "${searchResults[0].title}"`);
        } else {
          testResults.push('⚠️ **YouTube Search**: No results found');
        }
      } catch (searchError) {
        testResults.push(`❌ **YouTube Search**: ${searchError.message}`);
        overallStatus = '⚠️';
      }
      
      // Test 5: Test streaming capability
      testResults.push('🔄 **Testing audio streaming...**');
      try {
        if (searchResults && searchResults.length > 0) {
          const stream = await play.stream(searchResults[0].url, { 
            quality: 2,
            filter: 'audioonly',
            seek: 0,
            discordPlayerCompatibility: true
          });
          
          const resource = createAudioResource(stream.stream, {
            inputType: stream.type
          });
          
          testResults.push('✅ **Audio Streaming**: Stream created successfully');
          
          // Clean up
          if (stream.stream && typeof stream.stream.destroy === 'function') {
            stream.stream.destroy();
          }
        }
      } catch (streamError) {
        testResults.push(`❌ **Audio Streaming**: ${streamError.message}`);
        overallStatus = '❌';
      }
      
      // Test 6: Permissions check
      testResults.push('🔄 **Checking permissions...**');
      const permissions = voiceChannel.permissionsFor(interaction.guild.members.me);
      const requiredPerms = ['Connect', 'Speak', 'UseVAD'];
      const missingPerms = requiredPerms.filter(perm => !permissions.has(perm));
      
      if (missingPerms.length === 0) {
        testResults.push('✅ **Permissions**: All required permissions available');
      } else {
        testResults.push(`❌ **Permissions**: Missing ${missingPerms.join(', ')}`);
        overallStatus = '❌';
      }
      
      // Clean up connection
      setTimeout(() => {
        connection.destroy();
      }, 2000);
      
      testResults.push('\n## 📊 Summary');
      testResults.push(`**Overall Status**: ${overallStatus === '✅' ? 'All tests passed!' : overallStatus === '⚠️' ? 'Some issues detected' : 'Critical issues found'}`);
      
    } catch (error) {
      testResults.push(`❌ **Voice Connection**: ${error.message}`);
      overallStatus = '❌';
    }
  }
  
  return interaction.editReply({
    content: testResults.join('\n')
  });
}

module.exports = { 
  handlePlay, 
  handleQueue, 
  handleSkip, 
  handleStop,
  handleTest
};