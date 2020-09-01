// This will be run when the popup is opened.

window.onload = () => {
    getToken();
}

function getToken() {
    // If we don't already have a token,
    // then use the oauth2 library to retreive one.
    window.oauth2.start();
}