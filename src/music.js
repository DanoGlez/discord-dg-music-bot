// This file is kept for backward compatibility
// All functionality has been moved to separate modules:
// - queueManager.js: Queue management and auto-disconnect
// - audioPlayer.js: Audio playback logic
// - musicSearch.js: Search and URL processing
// - commandHandlers.js: Discord command handlers

const { handlePlay, handleQueue, handleSkip, handleStop } = require('./commandHandlers');

module.exports = { handlePlay, handleQueue, handleSkip, handleStop };
