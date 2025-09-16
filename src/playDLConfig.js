const play = require('play-dl');

/**
 * Initialize play-dl with YouTube support using cookies for enhanced access
 */
async function initializePlayDL() {
  try {
    // Set up YouTube support with cookies for enhanced functionality
    const cookies = process.env.YOUTUBE_COOKIES || '';
    
    await play.setToken({
      youtube: {
        cookie: cookies
      }
    });
    
    if (cookies) {
      console.log('✅ play-dl initialized successfully with YouTube cookies (enhanced access)');
    } else {
      console.log('✅ play-dl initialized successfully with YouTube basic access');
    }
  } catch (error) {
    console.error('❌ Error initializing play-dl:', error.message);
    // Fallback to basic configuration
    try {
      await play.setToken({
        youtube: {
          cookie: ''
        }
      });
      console.log('⚠️ Fallback: play-dl initialized with basic YouTube access');
    } catch (fallbackError) {
      console.error('❌ Critical error initializing play-dl:', fallbackError.message);
    }
  }
}

// Execute if run directly
if (require.main === module) {
  initializePlayDL();
}

module.exports = { initializePlayDL };