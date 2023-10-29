const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const OAuth2 = google.auth.OAuth2;

const SCOPES = ['https://www.googleapis.com/auth/youtube.force-ssl'];
const TOKEN_PATH = 'token.json';
const CREDENTIALS_PATH = 'credentials.json';
const MAX_RESULTS = 10;
const RATE_LIMIT_DELAY = 60000; // 60 seconds

function authenticate() {
    return new Promise((resolve, reject) => {
        console.log('Loading client secret file...');
        fs.readFile(CREDENTIALS_PATH, (err, content) => {
            if (err) {
                console.error('Error loading client secret file:', err);
                return reject(err);
            }
            
            console.log('Authorizing with credentials...');
            authorize(JSON.parse(content), resolve);
        });
    });
}

function authorize(credentials, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oauth2Client = new OAuth2(client_id, client_secret, redirect_uris[0]);

    console.log('Checking for existing token...');
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) {
            console.log('Token not found. Generating a new one...');
            return getNewToken(oauth2Client, callback);
        }
        
        console.log('Using existing token.');
        oauth2Client.credentials = JSON.parse(token);
        callback(oauth2Client);
    });
}

function getNewToken(oauth2Client, callback) {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });

    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question('Enter the code from that page here: ', (code) => {
        rl.close();

        oauth2Client.getToken(code, (err, token) => {
            if (err) {
                console.error('Error retrieving access token', err);
                return;
            }
            
            oauth2Client.credentials = token;
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) return console.error(err);
                console.log('Token stored to', TOKEN_PATH);
            });

            callback(oauth2Client);
        });
    });
}

function listAndRemoveLikes(auth) {
    const service = google.youtube({ version: 'v3', auth });
    
    let nextPageToken = undefined;
    let likedVideos = [];

    function fetchLikedVideos() {
        console.log('Fetching liked videos...');
        service.videos.list({
            part: 'id,snippet',
            myRating: 'like',
            maxResults: MAX_RESULTS,
            pageToken: nextPageToken
        }, (err, response) => {
            if (err) {
                console.error('The API returned an error:', err);
                return;
            }

            const currentBatch = response.data.items;
            console.log(`Fetched ${currentBatch.length} liked videos.`);
            likedVideos = likedVideos.concat(currentBatch);
            
            if (response.data.nextPageToken) {
                nextPageToken = response.data.nextPageToken;
                setTimeout(fetchLikedVideos, RATE_LIMIT_DELAY);
            } else {
                console.log(`Total liked videos to remove: ${likedVideos.length}`);
                processLikedVideos();
            }
        });
    }

    function processLikedVideos() {
        if (!likedVideos.length) {
            console.log('All liked videos processed.');
            return;
        }

        const video = likedVideos.shift();
        console.log(`Removing like from video: ${video.snippet.title}`);
        service.videos.rate({
            id: video.id,
            rating: 'none'
        }, (err, response) => {
            if (err) {
                console.error('Error:', err);
                return;
            } 
            setTimeout(processLikedVideos, RATE_LIMIT_DELAY / MAX_RESULTS); // spread out over 60 seconds
        });
    }

    fetchLikedVideos();
}

authenticate().then(auth => {
    console.log('Authentication successful.');
    listAndRemoveLikes(auth);
}).catch(console.error);
