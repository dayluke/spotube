(function() {
    window.oauth2 = {

        access_token_url: "https://accounts.spotify.com/api/token",
        authorization_url: "https://accounts.spotify.com/authorize",
        client_id: hidden.key,
        client_secret: hidden.secret,
        redirect_url: "https://www.google.com",
        scopes: ["user-library-modify", "user-top-read", "playlist-read-private", "playlist-modify-public", "playlist-modify-private"],
        token: '',

        /**
         * Starts the authorization process.
         */
        start: function() {
            window.close();
            var scopeString = this.scopes.join(' ');
            var url = this.authorization_url + "?client_id=" + this.client_id + "&redirect_uri=" + this.redirect_url + "&scope=" + scopeString + "&response_type=code";
            chrome.tabs.create({url: url, active: true});
        },

        /**
         * Finishes the oauth2 process by exchanging the given authorization code for an
         * authorization token. The authroiztion token is saved to the browsers local storage.
         * If the redirect page does not return an authorization code or an error occures when 
         * exchanging the authorization code for an authorization token then the oauth2 process dies
         * and the authorization tab is closed.
         * 
         * @param url The url of the redirect page specified in the authorization request.
         */
        finish: function(url) {

            function removeTab() {
                chrome.tabs.query({'active': true, 'currentWindow': true}, function (tabs) {
                    chrome.tabs.remove(tabs[0].id);
                });
            };

            if (url.match(/\?error=(.+)/)) {
                removeTab();
            } else {
                var code = url.match(/\?code=([\w\/\-]+)/)[1];
                console.log(code);

                var data = "grant_type=authorization_code&code=" + code + "&redirect_uri=" + this.redirect_url;
                sendAuthTokenRequest(data);
            }


            function sendAuthTokenRequest(data) {
                // Send request for authorization token.
                var xhr = new XMLHttpRequest();
                xhr.addEventListener('readystatechange', function(event) {
                    if(xhr.readyState == 4) {
                        if(xhr.status == 200) {
                            if(xhr.responseText.match(/error=/)) {
                                removeTab();
                            } else {
                                // Parsing JSON Response.
                                var response = xhr.responseText;
                                var jsonResponse = JSON.parse(response);
                                token = jsonResponse.access_token;
                                var obj = { 'token': token };
                                // Storing in Chrome Local Storage.
                                chrome.storage.local.set(obj, function() {
                                    // Notify that we saved.
                                    console.log('oAuth Token saved');
                                });
                                removeTab();
                            }
                        } else {
                            removeTab();
                        }
                    }
                });

                xhr.open('POST', "https://accounts.spotify.com/api/token", true);
                xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
                var base64credentials = btoa(hidden.key + ":" + hidden.secret);
                console.log(base64credentials);
                xhr.setRequestHeader('Authorization','Basic ' + base64credentials);
                xhr.send(data);
            }
        },

        /**
         * Clears the authorization token from the Chrome storage.
         */
        clearToken: function() {
            chrome.storage.local.remove("token", function() {
                console.log("Token Cleared")
            });
        }
    }
})();
