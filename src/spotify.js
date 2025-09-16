const SpotifyWebApi = require('spotify-web-api-node');

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET
});

async function refreshSpotifyToken() {
  const data = await spotifyApi.clientCredentialsGrant();
  spotifyApi.setAccessToken(data.body['access_token']);
}

async function searchSpotifyTrack(query) {
  await refreshSpotifyToken();
  const res = await spotifyApi.searchTracks(query, { limit: 1 });
  if (res.body.tracks.items.length > 0) {
    const track = res.body.tracks.items[0];
    return `${track.name} ${track.artists[0].name}`;
  }
  return null;
}

module.exports = { searchSpotifyTrack };
