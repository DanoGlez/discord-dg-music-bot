const play = require('play-dl');

/**
 * Initialize play-dl with multiple fallback strategies
 */
async function initializePlayDL() {
  try {
    console.log('🔧 Initializing play-dl with anti-bot strategies...');
    
    // Strategy 1: Try without cookies first (sometimes more stable)
    await play.setToken({
      youtube: {
        cookie: ''
      }
    });
    
    // Add random delay to mimic human behavior
    const delay = Math.floor(Math.random() * 2000) + 1000; // 1-3 seconds
    await new Promise(resolve => setTimeout(resolve, delay));
    
    console.log('✅ play-dl initialized with YouTube basic access');
    
    // Set user agent to mimic real browser
    if (play.setUA) {
      play.setUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    }
    
  } catch (error) {
    console.error('❌ Error initializing play-dl:', error.message);
    
    // Fallback: Try with empty configuration
    try {
      await play.setToken({});
      console.log('⚠️ Fallback: play-dl initialized with minimal configuration');
    } catch (fallbackError) {
      console.error('❌ Critical error initializing play-dl:', fallbackError.message);
      throw fallbackError;
    }
  }
}

/**
 * Enhanced search with retry logic and anti-bot measures
 */
async function searchWithRetry(query, options = {}) {
  const maxRetries = 3;
  const baseDelay = 2000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔍 Search attempt ${attempt}/${maxRetries}: ${query}`);
      
      // Add random delay between requests
      if (attempt > 1) {
        const delay = baseDelay * attempt + Math.floor(Math.random() * 1000);
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      const results = await play.search(query, {
        limit: options.limit || 5,
        source: { youtube: 'video' },
        ...options
      });
      
      return results;
    } catch (error) {
      console.error(`❌ Search attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        throw new Error(`Search failed after ${maxRetries} attempts: ${error.message}`);
      }
      
      // If we get bot detection, wait longer
      if (error.message.includes('bot') || error.message.includes('Sign in')) {
        await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
      }
    }
  }
}

// Execute if run directly
if (require.main === module) {
  initializePlayDL();
}

module.exports = { 
  initializePlayDL,
  searchWithRetry 
};