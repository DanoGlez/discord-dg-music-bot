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
            (parseInt(process.env.RANDOM_DELAY_MAX) || 8000 - 
             parseInt(process.env.RANDOM_DELAY_MIN) || 3000)) + 
            parseInt(process.env.RANDOM_DELAY_MIN) || 3000;

        console.log(`⏳ [YTDLP] Waiting ${randomDelay}ms before extraction...`);
        await new Promise(resolve => setTimeout(resolve, randomDelay));

        try {
            const options = {
                format: 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio/best[height<=480]/best',
                extractFlat: false,
                noWarnings: true,
                noCheckCertificate: true,
                preferFreeFormats: true,
                youtubeSkipDashManifest: true,
                retries: 3,
                fragmentRetries: 3,
                skipUnavailableFragments: true,
                addHeader: [
                    'User-Agent:Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language:en-US,en;q=0.5',
                    'Accept-Encoding:gzip, deflate, br',
                    'DNT:1',
                    'Connection:keep-alive',
                    'Upgrade-Insecure-Requests:1',
                    'Sec-Fetch-Dest:document',
                    'Sec-Fetch-Mode:navigate',
                    'Sec-Fetch-Site:none'
                ]
            };

            // Opciones adicionales para bypass
            if (process.env.BYPASS_AGE_GATE === 'true') {
                options.ageLimit = 99;
                options.skipDownload = false;
            }

            console.log(`🎵 [YTDLP] Extracting stream from: ${videoUrl}`);
            const info = await youtubedl(videoUrl, {
                ...options,
                dumpSingleJson: true,
                noDownload: true
            });

            console.log(`📊 [YTDLP] Info received:`, {
                hasUrl: !!info.url,
                hasFormats: !!info.formats,
                formatsCount: info.formats ? info.formats.length : 0,
                title: info.title || 'Unknown'
            });

            if (!info.url && (!info.formats || info.formats.length === 0)) {
                throw new Error('No stream URL or formats found');
            }

            // Buscar el mejor formato de audio
            let streamUrl = info.url;
            if (info.formats && info.formats.length > 0) {
                console.log(`🔍 [YTDLP] Processing ${info.formats.length} formats...`);
                
                const audioFormats = info.formats.filter(f => {
                    const hasAudio = f.acodec && f.acodec !== 'none';
                    const isGoodFormat = f.ext === 'webm' || f.ext === 'm4a' || f.ext === 'mp4';
                    const hasUrl = !!f.url;
                    
                    console.log(`Format ${f.format_id}: acodec=${f.acodec}, ext=${f.ext}, hasUrl=${hasUrl}`);
                    
                    return hasAudio && isGoodFormat && hasUrl;
                });
                
                console.log(`🎵 [YTDLP] Found ${audioFormats.length} audio formats`);
                
                if (audioFormats.length > 0) {
                    // Preferir webm > m4a > mp4
                    const preferredFormat = audioFormats.find(f => f.ext === 'webm') ||
                                          audioFormats.find(f => f.ext === 'm4a') ||
                                          audioFormats[0];
                    
                    console.log(`✅ [YTDLP] Selected format: ${preferredFormat.format_id} (${preferredFormat.ext})`);
                    streamUrl = preferredFormat.url;
                } else if (info.url) {
                    console.log(`⚠️ [YTDLP] No suitable audio formats, using direct URL`);
                    streamUrl = info.url;
                } else {
                    throw new Error('No suitable audio format found and no direct URL available');
                }
            }

            if (!streamUrl) {
                throw new Error('Could not extract stream URL');
            }

            console.log(`✅ [YTDLP] Stream extracted successfully`);
            return {
                url: streamUrl,
                title: info.title || 'Unknown',
                duration: info.duration || 0,
                thumbnail: info.thumbnail
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