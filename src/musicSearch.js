const play = require('play-dl');
const { searchSpotifyTrack } = require('./spotify');
const { searchWithRetry } = require('./playDLConfig');

async function processQuery(query) {
  let url = query;
  let title = query;
  let isPlaylist = false;
  let playlistInfo = null;
  
  // Check if it's a YouTube URL (single video or playlist)
  const urlType = play.yt_validate(url);
  
  if (urlType === 'playlist') {
    console.log(`Processing YouTube playlist: ${url}`);
    isPlaylist = true;
    
    // Get playlist info
    playlistInfo = await play.playlist_info(url, { incomplete: true });
    const videos = await playlistInfo.all_videos();
    
    if (videos.length === 0) {
      throw new Error('This playlist is empty or private.');
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
    
    // Search on YouTube with retry logic
    const searchResults = await searchWithRetry(query, { limit: 3 });
    if (searchResults.length === 0) {
      throw new Error('No videos found for your search query after multiple attempts.');
    }
    
    url = searchResults[0].url;
    title = searchResults[0].title;
    console.log(`Video found: ${title} - ${url}`);
  }
  
  return {
    url,
    title,
    isPlaylist,
    playlistInfo
  };
}

function formatPlaylistDuration(videos) {
  let totalDuration = 0;
  videos.forEach(video => {
    if (video.durationInSec) {
      totalDuration += video.durationInSec;
    }
  });
  
  const hours = Math.floor(totalDuration / 3600);
  const minutes = Math.floor((totalDuration % 3600) / 60);
  return hours > 0 
    ? `${hours}:${minutes.toString().padStart(2, '0')}:00` 
    : `${minutes}:${(totalDuration % 60).toString().padStart(2, '0')}`;
}

module.exports = {
  processQuery,
  formatPlaylistDuration
};