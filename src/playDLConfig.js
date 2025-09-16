const play = require('play-dl');

/**
 * Initialize play-dl with multiple fallback strategies and realistic browser simulation
 */
async function initializePlayDL() {
  try {
    console.log('🔧 Initializing play-dl with anti-bot strategies...');
    
    // Strategy 1: Configure with realistic browser headers
    await play.setToken({
      youtube: {
        cookie: process.env.YOUTUBE_COOKIES || ''
      }
    });
    
    // Set realistic user agent for Linux server
    const userAgents = [
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    ];
    
    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    // Configure play-dl with the user agent if available
    if (play.setUA) {
      play.setUA(randomUA);
    }
    
    // Add random delay to mimic human behavior
    const delay = Math.floor(Math.random() * 3000) + 2000; // 2-5 seconds
    await new Promise(resolve => setTimeout(resolve, delay));
    
    console.log('✅ play-dl initialized with YouTube basic access');
    
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
 * Enhanced search with retry logic, rotating user agents, and better anti-bot measures
 */
async function searchWithRetry(query, options = {}) {
  const maxRetries = parseInt(process.env.MAX_RETRIES) || 5;
  const baseDelay = parseInt(process.env.RATE_LIMIT_DELAY) || 5000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔍 Search attempt ${attempt}/${maxRetries}: ${query}`);
      
      // Add progressive delay between requests
      if (attempt > 1) {
        const delay = baseDelay * Math.pow(1.5, attempt - 1) + Math.floor(Math.random() * 2000);
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // Try different search strategies
      let searchQuery = query;
      if (attempt > 2) {
        // Add variations to avoid bot detection
        searchQuery = `${query} official`;
      }
      if (attempt > 3) {
        searchQuery = `${query} audio`;
      }
      
      const results = await play.search(searchQuery, {
        limit: options.limit || 10, // Más resultados para tener alternativas
        source: { youtube: 'video' },
        ...options
      });
      
      if (results && results.length > 0) {
        console.log(`✅ Found ${results.length} results`);
        return results;
      }
      
      throw new Error('No results found');
      
    } catch (error) {
      console.error(`❌ Search attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        throw new Error(`Search failed after ${maxRetries} attempts: ${error.message}`);
      }
      
      // If we get bot detection, wait much longer
      if (error.message.includes('bot') || error.message.includes('Sign in')) {
        const longDelay = baseDelay * 2 * attempt; // 10s, 20s, 30s, etc.
        console.log(`🤖 Bot detection - waiting ${longDelay}ms`);
        await new Promise(resolve => setTimeout(resolve, longDelay));
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