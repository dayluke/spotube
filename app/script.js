// This will be run when the popup is opened.
var notyf = new Notyf({ duration: 3500, dismissible: true });

window.onload = () => {
    // Null conditional operator to make sure the element has been correctly received.
    document.getElementById('back-btn')?.addEventListener("click", backClicked);
    checkToken();
}

/**
 * Determines whether we have already authorized (have a token in our local
 * chrome storage). If we do, then we get the token and use it to retrieve
 * the user's spotify id.
 * Otherwise, we get a new token. 
 */
function checkToken() {
    chrome.storage.local.get("token", result => {
        var token = result.token;
        if (token != undefined) getUserId(token);
        else window.oauth2.start();
    });
}

/**
 * Retrieves the user's id, by using the access token, so that we can get
 * only the playlists made by the user (meaning they can add songs to them).
 * @param {string} accessToken
 */
function getUserId(accessToken) {
    fetch("https://api.spotify.com/v1/me", { headers: {
        'Authorization': 'Bearer ' + accessToken }})
    .then(response => response.json())
    .then(json => {
        loadPlaylists({
            "url": "https://api.spotify.com/v1/me/playlists?limit=50",
            "uid": json.id,
            "token": accessToken
        });
    });
}

/**
 * Fetches a list of the user's playlists (the limit is 50 per call).
 * This list is iterated through to pick out only the playlists of 
 * which are owned by the user - so that we can edit (add) them.
 * For each of the user-owned playlists, we add the necessary HTML
 * elements so that the playlist can be displayed in the popup.html
 * correctly.
 * We also update the window.onscroll method to check if the user has 
 * scrolled to the bottom of the popup.html page. If they have then
 * repeat the process - loading the next 50 playlists.
 * @param {object} params contains the url to fetch, the access token and the user id
 */
function loadPlaylists(params) {
    fetch(params.url, { headers: {
        'Authorization': 'Bearer ' + params.token}})
    .then(result => {
        if (result.ok) return result;
        // If the result of the request is not ok, then the current
        // access token is most likely stale, so we get a new one.
        window.oauth2.start();
    }).then(response => response.json())
    .then(json => {        
        var dataContainer = document.getElementById("data");
        
        json.items.forEach(playlist => {
            
            if (playlist.owner.id !== params.uid) return;
            var item = document.createElement("div");
            item.onclick = () => playlistClicked(params.token, playlist.id);
            var image = document.createElement("img");
            image.src = playlist.images[0].url;
            var nameText = document.createElement("p");
            nameText.appendChild(document.createTextNode(playlist.name));
            item.appendChild(image);
            item.appendChild(nameText);
            dataContainer.appendChild(item);
            
        });

        params.url = json.next;

        window.onscroll = () => {
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
                loadPlaylists(params);
            }
        };

    }).catch(error => console.log(error));
}

/**
 * Gets the song title, and adds the song to the playlist that was clicked.
 * @param {string} accessToken 
 * @param {string} pid the playlist id
 */
async function playlistClicked(accessToken, pid) {
    var parsedTitle = await getTabTitle();
    console.log(parsedTitle);

    fetch("https://api.spotify.com/v1/search?q=" + encodeURI(parsedTitle) + "&type=track",
        {headers: {'Authorization': 'Bearer ' + accessToken}}
    ).then(response => response.json())
    .then(json => {
        // We take the first track (in hope that it's desired)
        if (json.tracks.items.length > 0) return json.tracks.items[0].uri;

        console.error(`No song called '${parsedTitle}' could be found.`);
        var errorMsg = `No song called '${parsedTitle.substring(0,
            parsedTitle.length >= 15 ? 15 : parsedTitle.length)}...' could be found.`
        notyf.error(errorMsg);

    }).then(trackUri => {
        if (trackUri == undefined) return;

        addSongToPlaylist(pid, trackUri, accessToken);
        return trackUri;
    })
    .then(uri => {
        if (uri != undefined) createSongPreview(uri);
    })
    .catch(error => console.log(error));
}

/**
 * Sends a POST request to add the track specified to the playlist specified
 * @param {string} playlist the playlist to add the song to
 * @param {string} tid the track id
 * @param {string} token
 */
function addSongToPlaylist(playlist, tid, token) {
    var options = {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
    }    
    
    fetch("https://api.spotify.com/v1/playlists/" + playlist + "/tracks?uris=" + tid, options)
    .catch(error => console.log(error))
}

/**
 * A playlist was clicked, so get the title of the current tab
 * (and parse it to determine the current song playing).
 */
function getTabTitle() {
    return new Promise((resolve, reject) => {
        try {
            chrome.tabs.query({'active': true, 'currentWindow': true}, function (tabs) {
                resolve(getSongTitle(tabs[0].title));
            });
        }
        catch (e) { reject(e) };
    });
}

/**
 * Parses the title of the current page, to return a suitable string that can be used
 * to search spotify with.
 * @param {string} titleOfPage 
 */
function getSongTitle(titleOfPage) {
    var pageTitle = titleOfPage.toLowerCase();
    var stringsToRemove = [" - youtube", " (official music video)", "official music video",
    "official video", "(official video)", "(official audio)", " (audio)", " | a colors show", " ft.", " -"];
    var stringsToReplace = {
        // str to replace: text to place it with
        " x ": " "
    }
    
    for (var i = 0; i < stringsToRemove.length; i++) {
        pageTitle = removeText(pageTitle, stringsToRemove[i]);
    }
    
    for (var str in stringsToReplace) {
        pageTitle = removeText(pageTitle, str, stringsToReplace[str]);
    }
    
    return pageTitle;
}

/**
 * Removes a string from a given text, or replaces it - if supplied with replacement text.
 * @param {string} str 
 * @param {string} text 
 * @param {string} replacementText 
 */
function removeText(str, text, replacementText = "") {    
    return (str.indexOf(text) != -1) ? str.replace(text, replacementText) : str;
}

/**
 * Creates an iframe 30 seconds preview of the song which was added to the clicked playlist.
 * The iframe replaces the 'data' element, and displays a back button to go back.
 * @param {string} tid the track id 
 */
function createSongPreview(tid) {
    document.getElementById('data').style.display = 'none';

    var previewContainer = document.getElementById('song-preview')
    previewContainer.style.display = 'initial';

    var songPreview = document.createElement('iframe');
    songPreview.setAttribute("width", 300);
    songPreview.setAttribute("height", 80);
    songPreview.setAttribute("frameborder", "0");
    songPreview.setAttribute("allowtransparency", "true");
    songPreview.setAttribute("allow", "encrypted-media");
    songPreview.src = "https://open.spotify.com/embed/track/" + tid.substring(tid.indexOf('track:') + 6);
    previewContainer.insertBefore(songPreview, previewContainer.lastElementChild);
}

/**
 * Toggles the visibility of the 'data' container, and the song preview.
 */
function backClicked() {
    document.getElementById('data').style.display = null; // sets the data container back to 'display: flex'
    document.getElementById('song-preview').style.display = 'none';
}