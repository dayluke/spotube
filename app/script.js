// This will be run when the popup is opened.

window.onload = () => {
    getToken();
}

function checkToken() {
    chrome.local.get("token", result => {
        var token = result.token;
        if (token != undefined) getUserId(token);
        else getToken();
    });
}

function getToken() {
    // If we don't already have a token,
    // then use the oauth2 library to retreive one.
    window.oauth2.start();
}

function getUserId(accessToken) {
    // Get the user's id (to check against the owner of the playlists)
    fetch("https://api.spotify.com/v1/me", { headers: {
        'Authorization': 'Bearer ' + accessToken }})
    .then(response => response.json())
    .then(json => json.id)
    .then(userID => {
        loadPlaylists({
        "url": "https://api.spotify.com/v1/me/playlists?limit=50",
        "uid": userID,
        "token": accessToken
        });
    });
}

function loadPlaylists(params) {
    fetch(params["url"], { headers: {
        'Authorization': 'Bearer ' + params["token"]}})
    .then(result => {
        if (result.ok) return result;
        // If the result of the request is not ok, then the current
        // access token is most likely stale, so we get a new one.
        window.oauth2.start();
    }).then(response => response.json())
    .then(json => {
        console.log(json);
    }).catch(error => console.log(error));

}