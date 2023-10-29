const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');
const OAuth2 = google.auth.OAuth2;

const SCOPES = ['https://www.googleapis.com/auth/youtube.force-ssl'];
const TOKEN_PATH = 'token.json';
const CREDENTIALS_PATH = 'credentials.json';

function authenticate() {
    return new Promise((resolve, reject) => {
        fs.readFile(CREDENTIALS_PATH, (err, content) => {
            if (err) return reject('Error loading client secret file:', err);
            
            authorize(JSON.parse(content), resolve);
        });
    });
}

function authorize(credentials, callback) {
    const {client_secret, client_id, redirect_uris} = credentials.installed;
    const oauth2Client = new OAuth2(client_id, client_secret, redirect_uris[0]);

    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) return getNewToken(oauth2Client, callback);
        
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
            if (err) return console.error('Error retrieving access token', err);
            
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
    const service = google.youtube({version: 'v3', auth});
    
    let nextPageToken = undefined;
    let likedVideos = [];

    function fetchLikedVideos() {
        service.videos.list({
            part: 'id,snippet',
            myRating: 'like',
            maxResults: 50,
            pageToken: nextPageToken
        }, (err, response) => {
            if (err) {
                console.error('The API returned an error:', err);
                return;
            }

            likedVideos = likedVideos.concat(response.data.items);
            
            if (response.data.nextPageToken) {
                nextPageToken = response.data.nextPageToken;
                fetchLikedVideos();
            } else {
                processLikedVideos();
            }
        });
    }

    function processLikedVideos() {
        if (!likedVideos.length) return;

        const video = likedVideos.shift();
        console.log(`Removing like from video: ${video.snippet.title}`);
        service.videos.rate({
            id: video.id,
            rating: 'none'
        }, (err, response) => {
            if (err) {
                console.error('Error:', err);
            } else {
                processLikedVideos();
            }
        });
    }

    fetchLikedVideos();
}

authenticate().then(auth => {
    listAndRemoveLikes(auth);
}).catch(console.error);
