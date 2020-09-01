// This will be run when the popup is opened.

window.onload = () => {
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
 * @param {object} params 
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
        console.log(params.uid);
        // console.log(json);
        
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