// guildId => { queue: [], player, connection, timeout }
const queues = new Map();

// Auto-disconnect timeout (5 minutes)
const AUTO_DISCONNECT_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds

// Function to handle auto-disconnect
function scheduleAutoDisconnect(guildId, interaction) {
  const serverQueue = queues.get(guildId);
  if (!serverQueue) return;
  
  // Clear existing timeout
  if (serverQueue.timeout) {
    clearTimeout(serverQueue.timeout);
  }
  
  // Set new timeout
  serverQueue.timeout = setTimeout(async () => {
    console.log(`Auto-disconnecting from guild ${guildId} due to inactivity`);
    
    if (serverQueue.connection) {
      serverQueue.connection.destroy();
    }
    
    // Clear queue data
    queues.delete(guildId);
    
    // Try to send disconnect message
    try {
      await interaction.followUp({ 
        content: '🚪 Disconnected due to 5 minutes of inactivity. Use `/play` to start again!' 
      });
    } catch (error) {
      console.log('Could not send auto-disconnect message (interaction may have expired)');
    }
  }, AUTO_DISCONNECT_TIME);
}

function cancelAutoDisconnect(guildId) {
  const serverQueue = queues.get(guildId);
  if (serverQueue && serverQueue.timeout) {
    clearTimeout(serverQueue.timeout);
    serverQueue.timeout = null;
  }
}

function getServerQueue(guildId) {
  return queues.get(guildId);
}

function createServerQueue(guildId) {
  const queue = { queue: [], player: null, connection: null, timeout: null };
  queues.set(guildId, queue);
  return queue;
}

function hasServerQueue(guildId) {
  return queues.has(guildId);
}

function deleteServerQueue(guildId) {
  // Cancel any pending auto-disconnect
  cancelAutoDisconnect(guildId);
  queues.delete(guildId);
}

function addToQueue(guildId, songData) {
  const serverQueue = queues.get(guildId);
  if (serverQueue) {
    serverQueue.queue.push(songData);
    // Cancel auto-disconnect when adding songs
    cancelAutoDisconnect(guildId);
  }
}

function addPlaylistToQueue(guildId, videos, requestedBy) {
  const serverQueue = queues.get(guildId);
  if (serverQueue) {
    videos.forEach(video => {
      serverQueue.queue.push({
        url: video.url,
        title: video.title,
        requestedBy: requestedBy,
        duration: video.durationRaw || 'Unknown'
      });
    });
    // Cancel auto-disconnect when adding playlist
    cancelAutoDisconnect(guildId);
  }
}

function clearQueue(guildId) {
  const serverQueue = queues.get(guildId);
  if (serverQueue) {
    serverQueue.queue = [];
  }
}

module.exports = {
  scheduleAutoDisconnect,
  cancelAutoDisconnect,
  getServerQueue,
  createServerQueue,
  hasServerQueue,
  deleteServerQueue,
  addToQueue,
  addPlaylistToQueue,
  clearQueue
};