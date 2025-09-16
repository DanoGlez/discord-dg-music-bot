const youtubedl = require('youtube-dl-exec');
const ytSearch = require('yt-search');

/**
 * Fallback usando yt-dlp cuando play-dl falla
 */
class YtdlpFallback {
    constructor() {
        this.retryCount = 0;
        this.maxRetries = parseInt(process.env.MAX_RETRIES) || 10;
    }

    /**
     * Busca videos usando yt-search
     */
    async search(query, limit = 5) {
        try {
            console.log(`🔍 [YTDLP] Searching: ${query}`);
            const results = await ytSearch(query);
            
            if (!results.videos || results.videos.length === 0) {
                throw new Error('No results found');
            }
            
            return results.videos.slice(0, limit).map(video => ({
                title: video.title,
                url: video.url,
                duration: video.duration.seconds,
                thumbnail: video.thumbnail,
                channel: video.author?.name || 'Unknown'
            }));
        } catch (error) {
            console.error(`❌ [YTDLP] Search failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Obtiene stream URL usando yt-dlp con opciones anti-bot
     */
    async getStreamUrl(videoUrl) {
        const randomDelay = Math.floor(Math.random() * 
            (parseInt(process.env.RANDOM_DELAY_MAX) || 15000 - 
             parseInt(process.env.RANDOM_DELAY_MIN) || 5000)) + 
            parseInt(process.env.RANDOM_DELAY_MIN) || 5000;

        console.log(`⏳ [YTDLP] Waiting ${randomDelay}ms before extraction...`);
        await new Promise(resolve => setTimeout(resolve, randomDelay));

        try {
            // Simplified options that are more likely to work in Docker
            const options = {
                dumpSingleJson: true,
                noDownload: true,
                noWarnings: true,
                format: 'bestaudio/best'
            };

            console.log(`🎵 [YTDLP] Extracting stream from: ${videoUrl}`);
            
            let info;
            try {
                info = await youtubedl(videoUrl, options);
            } catch (execError) {
                console.error(`❌ [YTDLP] Execution error: ${execError.message}`);
                
                // Try alternative method with getUrl
                console.log(`🔄 [YTDLP] Trying alternative getUrl method...`);
                try {
                    const urlResult = await youtubedl(videoUrl, {
                        getUrl: true,
                        format: 'bestaudio'
                    });
                    
                    if (typeof urlResult === 'string' && urlResult.startsWith('http')) {
                        console.log(`✅ [YTDLP] Got direct URL via getUrl method`);
                        return {
                            url: urlResult,
                            title: 'Audio Stream',
                            duration: 0,
                            thumbnail: null
                        };
                    }
                } catch (urlError) {
                    console.error(`❌ [YTDLP] getUrl method also failed: ${urlError.message}`);
                }
                
                throw execError;
            }

            // Debug más detallado
            console.log(`📊 [YTDLP] Response type: ${typeof info}`);
            
            if (!info) {
                throw new Error('yt-dlp returned null/undefined response');
            }

            if (typeof info === 'string') {
                // Sometimes yt-dlp returns a string (direct URL)
                if (info.startsWith('http')) {
                    console.log(`✅ [YTDLP] Got direct URL string`);
                    return {
                        url: info,
                        title: 'Audio Stream',
                        duration: 0,
                        thumbnail: null
                    };
                } else {
                    throw new Error(`yt-dlp returned unexpected string: ${info.substring(0, 100)}`);
                }
            }

            if (typeof info !== 'object') {
                throw new Error(`yt-dlp returned unexpected type: ${typeof info}`);
            }

            console.log(`📊 [YTDLP] Info keys: ${Object.keys(info).join(', ')}`);
            console.log(`📊 [YTDLP] Info details:`, {
                hasUrl: !!info.url,
                hasFormats: !!info.formats,
                formatsCount: info.formats ? info.formats.length : 0,
                title: info.title || 'Unknown',
                id: info.id || 'Unknown'
            });

            // Look for stream URL
            let streamUrl = null;
            
            // Method 1: Direct URL
            if (info.url && typeof info.url === 'string' && info.url.startsWith('http')) {
                streamUrl = info.url;
                console.log(`✅ [YTDLP] Using direct URL from info.url`);
            }
            
            // Method 2: From formats
            else if (info.formats && Array.isArray(info.formats) && info.formats.length > 0) {
                console.log(`🔍 [YTDLP] Processing ${info.formats.length} formats...`);
                
                // Find audio formats
                const audioFormats = info.formats.filter(f => {
                    const hasAudio = f.acodec && f.acodec !== 'none';
                    const hasUrl = f.url && typeof f.url === 'string' && f.url.startsWith('http');
                    
                    if (hasAudio && hasUrl) {
                        console.log(`🎵 [YTDLP] Found audio format: ${f.format_id} (${f.ext || 'unknown'}) - ${f.acodec}`);
                    }
                    
                    return hasAudio && hasUrl;
                });
                
                if (audioFormats.length > 0) {
                    // Prefer webm/opus > m4a/aac > any audio
                    const preferredFormat = audioFormats.find(f => f.ext === 'webm' && f.acodec?.includes('opus')) ||
                                          audioFormats.find(f => f.ext === 'm4a') ||
                                          audioFormats.find(f => f.ext === 'webm') ||
                                          audioFormats[0];
                    
                    streamUrl = preferredFormat.url;
                    console.log(`✅ [YTDLP] Selected format: ${preferredFormat.format_id} (${preferredFormat.ext || 'unknown'})`);
                } else {
                    console.log(`⚠️ [YTDLP] No audio formats found, checking all formats...`);
                    
                    // Fallback: any format with URL
                    const anyFormat = info.formats.find(f => f.url && f.url.startsWith('http'));
                    if (anyFormat) {
                        streamUrl = anyFormat.url;
                        console.log(`⚠️ [YTDLP] Using fallback format: ${anyFormat.format_id}`);
                    }
                }
            }

            if (!streamUrl) {
                const errorDetails = {
                    hasUrl: !!info.url,
                    hasFormats: !!info.formats,
                    formatsCount: info.formats ? info.formats.length : 0,
                    urlType: typeof info.url,
                    urlValue: info.url ? info.url.substring(0, 50) : 'null'
                };
                console.log(`❌ [YTDLP] Could not extract stream URL. Details:`, errorDetails);
                throw new Error(`Could not extract stream URL from yt-dlp response`);
            }

            console.log(`✅ [YTDLP] Stream extracted successfully`);
            return {
                url: streamUrl,
                title: info.title || 'Unknown Title',
                duration: info.duration || 0,
                thumbnail: info.thumbnail || null
            };

        } catch (error) {
            console.error(`❌ [YTDLP] Stream extraction failed: ${error.message}`);


            
            // Retry logic
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                const retryDelay = this.retryCount * 2000;
                console.log(`🔄 [YTDLP] Retrying in ${retryDelay}ms (${this.retryCount}/${this.maxRetries})`);
                
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return this.getStreamUrl(videoUrl);
            }
            
            throw error;
        }
    }

    /**
     * Reset retry counter
     */
    resetRetries() {
        this.retryCount = 0;
    }
}

module.exports = { YtdlpFallback };