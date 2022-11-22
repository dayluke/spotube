// This will be run when the popup is opened.
var notyf = new Notyf({ duration: 3500, dismissible: true });

window.onload = () => {
    // Null conditional operator to make sure the element has been correctly received.
    document.getElementById('back-btn')?.addEventListener("click", backClicked);
    checkToken();

    getTabTitle().then(title => document.getElementById('song-name').value = title);
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
    .then(response => {
        // If the response fails, then it's most likely due to an 
        // expired token in the user's local storage.
        if (response.ok) return response.json();
        else throw new Error("Token expired, requesting new one.");
    })
    .then(json => {
        loadPlaylists({
            "url": "https://api.spotify.com/v1/me/playlists?limit=50",
            "uid": json.id,
            "token": accessToken,
            "offset": 0,
            "limit": 50,
            "no_more": false
        });
    })
    .catch(error => {
        console.log(error);
        window.oauth2.start();
    });
}

/**
 * Fetches a list of the user's playlists (the limit is 50 per call).
 * This list is iterated through to pick out only the playlists of 
 * which are owned by the user - so that we can edit (add) them.
 * For each of the user-owned playlists, we call the 
 * createPlaylistPreview methods which generates HTML for the playlist.
 * We also update the window.onscroll method to check if the user has 
 * scrolled to the bottom of the popup.html page. If they have then
 * repeat the process - loading the next 50 playlists.
 * @param {object} params contains the url to fetch, the access token and the user id
 */
function loadPlaylists(params) {
    var dataContainer = document.getElementById("data");
    var nomore_playlist = document.getElementById("no_more_playlist");

    dataContainer.appendChild(createPlaylistPreview(params.token, "liked-songs", "Liked Songs"));
    var options = {
        headers: {
            'Authorization': 'Bearer ' + params.token
        }
    }
    
    fetch(params.url, options)
    .then(response => response.json())
    .then(json => {

        json.items.forEach(playlist => {
            if (playlist.owner.id !== params.uid) return;

            if (playlist.images.length == 0) {
                dataContainer.appendChild(createPlaylistPreview(params.token, playlist.id,
                    playlist.name));
                return;
            }
            dataContainer.appendChild(createPlaylistPreview(params.token, playlist.id,
                playlist.name, playlist.images[0].url));
        });

        if (json.items.length == 0 || json.items.length < params.limit) {
            var no_more = document.createElement("p");
            no_more.id = "nomore";
            no_more.innerText = "You don't have more playlist to see";
            nomore_playlist.appendChild(no_more);
            params.no_more = true;
        }

        params.offset += 50;

        next_url = "https://api.spotify.com/v1/me/playlists?offset=" + params.offset + "&limit=" + params.limit;

        params.url = next_url;

        window.onscroll = () => {
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight && params.no_more == false) {
                loadPlaylists(params);
            }
        };

    }).catch(error => console.log(error));
}

/**
 * Creates various HTML Elements and appends them as children
 * where necessary to construct a nicely formatted preview
 * of the user's playlists.
 * @param {string} token 
 * @param {string} id 
 * @param {string} name 
 * @param {string} imageUrl 
 * @returns A formatted HTML Element that represents one of the user's playlists.
 */
function createPlaylistPreview(token, id, name, imageUrl = "https://uploads-ssl.webflow.com/"
        + "5e36e6f21212670638c0d63c/5e39d85cee05be53d238681a_likedSongs.png") {
    var playlist = document.createElement("div");
    playlist.onclick = () => playlistClicked(token, id);
    var image = document.createElement("img");
    image.src = imageUrl;
    var nameText = document.createElement("p");
    nameText.appendChild(document.createTextNode(name));
    playlist.appendChild(image);
    playlist.appendChild(nameText);
    return playlist;
}

/**
 * Gets the song title, and adds the song to the playlist that was clicked.
 * @param {string} accessToken 
 * @param {string} pid the playlist id
 */
function playlistClicked(accessToken, pid) {
    var parsedTitle = document.getElementById('song-name').value;
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

        document.getElementById('song-name').readOnly = true;
        // remove existing so there are not multiple events in case the user is clicking about
        var confirmButton = document.getElementById('confirm-btn'),
        newConfirmButton = confirmButton.cloneNode(true);
        confirmButton.parentNode.replaceChild(newConfirmButton, confirmButton);

        document.getElementById('confirm-btn')?.addEventListener("click", function() {
            addSongToPlaylist(pid, trackUri, accessToken);
        });

        document.getElementById('header').innerHTML = "Matched song:";
        
        return trackUri;
    }).then(uri => {
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

    if (playlist == "liked-songs") {
        addSongToLikedSongs(tid, options);
        return;
    }
    
    fetch("https://api.spotify.com/v1/playlists/" + playlist + "/tracks?uris=" + tid, options)
    .then(response => {
        backClicked();
        notyf.success("Successfully saved song to playlist!");
    })
    .catch(error => {
        console.log(error);
        notyf.error("An unexpected error occurred.");
    });
}

/**
 * Sends a PUT request to tadd the track specified to the Liked Songs playlist.
 * @param {string} track the track to add to Liked Songs
 * @param {string} headers the Authorization header and the PUT header.
 */
function addSongToLikedSongs(track, headers) {
    headers.method = "PUT"
    fetch("https://api.spotify.com/v1/me/tracks?ids=" + track.replace("spotify:track:", ""), headers)
    .then(response => {
        backClicked();
        notyf.success("Successfully saved song to playlist!");
    })
    .catch(error => {
        console.log(error);
        notyf.error("An unexpected error occurred.");
    });
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

    // do the bracketed ones first otherwise it wont match properly and leave brackets "()" behind!!
    var stringsToRemove = [" - youtube music", " - youtube", "youtube", " (official music video)", "official music video",
    "(official video)", "official video", "(official audio)", " (audio)", " | a colors show", " ft.", 
    " -", "(lyric video)", "lyric video", "(lyrics video)", "lyrics video", "(lyrics)", 
    "lyrics", "(lyric)", "lyric", "†"];

    var stringsToReplace = {
        // str to replace: text to place it with
        " x ": " ",
        " by ": " "
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
    while (str.indexOf(text) != -1) {
        str = str.replace(text, replacementText);
    }
    return str; 
}

/**
 * Creates an iframe 30 seconds preview of the song which was added to the clicked playlist.
 * The iframe replaces the 'data' element, and displays a back button to go back.
 * @param {string} tid the track id 
 */
function createSongPreview(tid) {
    document.getElementById('data').style.display = 'none';
    document.getElementById('confirmation').style.display = 'block';

    var previewContainer = document.getElementById('song-preview')
    previewContainer.innerHTML = null;
    previewContainer.style.display = 'initial';

    var songPreview = document.createElement('iframe');
    songPreview.setAttribute("width", 300);
    songPreview.setAttribute("height", 80);
    songPreview.setAttribute("frameborder", "0");
    songPreview.setAttribute("allowtransparency", "true");
    songPreview.setAttribute("allow", "encrypted-media");
    songPreview.src = "https://open.spotify.com/embed/track/" + tid.substring(tid.indexOf('track:') + 6);
    previewContainer.insertBefore(songPreview, previewContainer.lastChild);
}

/**
 * Toggles the visibility of the 'data' container, and the song preview.
 */
function backClicked() {
    document.getElementById('data').style.display = null; // sets the data container back to 'display: flex'
    document.getElementById('confirmation').style.display = 'none';
    document.getElementById('song-name').readOnly = false;
    document.getElementById('header').innerHTML = "Choose playlist:";
}