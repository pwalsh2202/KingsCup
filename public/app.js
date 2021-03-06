;
jQuery(function($){    
    'use strict';

    /**
     * All the code relevant to Socket.IO is collected in the IO namespace.
     *
     * @type {{init: Function, bindEvents: Function, onConnected: Function, onNewGameCreated: Function, playerJoinedRoom: Function, beginNewGame: Function, onNewWordData: Function, hostCheckAnswer: Function, gameOver: Function, error: Function}}
     */
    var IO = {

        /**
         * This is called when the page is displayed. It connects the Socket.IO client
         * to the Socket.IO server
         */
        init: function() {
            IO.socket = io.connect();
            IO.bindEvents();
        },

        /**
         * While connected, Socket.IO will listen to the following events emitted
         * by the Socket.IO server, then run the appropriate function.
         */
        bindEvents : function() {
            IO.socket.on('connected', IO.onConnected );
            IO.socket.on('newGameCreated', IO.onNewGameCreated );
            IO.socket.on('playerJoinedRoom', IO.playerJoinedRoom );
            IO.socket.on('beginNewGame', IO.beginNewGame );
            IO.socket.on('newCardData', IO.onNewCardData);
            IO.socket.on('hostCheckDraw', IO.hostCheckDraw);
            IO.socket.on('gameOver', IO.gameOver);
            IO.socket.on('error', IO.error );
        },

        /**
         * The client is successfully connected!
         */
        onConnected : function() {
            // Cache a copy of the client's socket.IO session ID on the App
            App.mySocketId = IO.socket.socket.sessionid;
            // console.log(data.message);
        },

        /**
         * A new game has been created and a random game ID has been generated.
         * @param data {{ gameId: int, mySocketId: * }}
         */
        onNewGameCreated : function(data) {
            App.Host.gameInit(data);
        },

        /**
         * A player has successfully joined the game.
         * @param data {{playerName: string, gameId: int, mySocketId: int}}
         */
        playerJoinedRoom : function(data) {
            // When a player joins a room, do the updateWaitingScreen funciton.
            // There are two versions of this function: one for the 'host' and
            // another for the 'player'.
            //
            // So on the 'host' browser window, the App.Host.updateWiatingScreen function is called.
            // And on the player's browser, App.Player.updateWaitingScreen is called.
            App[App.myRole].updateWaitingScreen(data);
        },

        /**
         * Both players have joined the game.
         * @param data
         */
        beginNewGame : function(data) {
            App[App.myRole].gameCountdown(data);
        },

        /**
         * A new set of words for the round is returned from the server.
         * @param data
         */
        onNewCardData : function(data) {
            // Update the current round
            App.currentRound = data.round;

            // Change the word for the Host and Player
            App[App.myRole].newCard(data);
        },

        /**
         * A player answered. If this is the host, check the answer.
         * @param data
         */
        hostCheckDraw : function(data) {
            if(App.myRole === 'Host') {
                App.Host.checkDraw(data);
            }
        },

        /**
         * Let everyone know the game has ended.
         * @param data
         */
        gameOver : function(data) {
            App[App.myRole].endGame(data);
        },

        /**
         * An error has occurred.
         * @param data
         */
        error : function(data) {
            alert(data.message);
        }

    };

    var App = {

        /**
         * Keep track of the gameId, which is identical to the ID
         * of the Socket.IO Room used for the players and host to communicate
         *
         */
        gameId: 0,

        /**
         * This is used to differentiate between 'Host' and 'Player' browsers.
         */
        myRole: '',


        playerList: [],
 


        // 'Player' or 'Host'

        /**
         * The Socket.IO socket object identifier. This is unique for
         * each player and host. It is generated when the browser initially
         * connects to the server when the page loads for the first time.
         */
        mySocketId: '',

        /**
         * Identifies the current round. Starts at 0 because it corresponds
         * to the array of word data stored on the server.
         */
        currentRound: 0,

        /* *************************************
         *                Setup                *
         * *********************************** */

        /**
         * This runs when the page initially loads.
         */
        init: function () {
            App.cacheElements();
            App.showInitScreen();
            App.bindEvents();

            // Initialize the fastclick library
            FastClick.attach(document.body);
        },

        /**
         * Create references to on-screen elements used throughout the game.
         */
        cacheElements: function () {
            App.$doc = $(document);

            // Templates
            App.$gameArea = $('#gameArea');
            App.$templateIntroScreen = $('#intro-screen-template').html();
            App.$templateNewGame = $('#create-game-template').html();
            App.$templateJoinGame = $('#join-game-template').html();
            App.$hostGame = $('#host-game-template').html();
        },

        /**
         * Create some click handlers for the various buttons that appear on-screen.
         */
        bindEvents: function () {
            // Host
            App.$doc.on('click', '#btnCreateGame', App.Host.onCreateClick);

            // Player
            App.$doc.on('click', '#btnJoinGame', App.Player.onJoinClick);
            App.$doc.on('click', '#btnStart',App.Player.onPlayerStartClick);
            App.$doc.on('click', '#btnDraw',App.Player.onPlayerDrawClick);
            App.$doc.on('click', '#btnPlayerRestart', App.Player.onPlayerRestart);
        },

        /* *************************************
         *             Game Logic              *
         * *********************************** */

        /**
         * Show the initial Anagrammatix Title Screen
         * (with Start and Join buttons)
         */
        showInitScreen: function() {
            App.$gameArea.html(App.$templateIntroScreen);
            App.doTextFit('.title');
        },


        /* *******************************
           *         HOST CODE           *
           ******************************* */
        Host : {

            /**
             * Contains references to player data
             */
            players : [],

            /**
             * Flag to indicate if a new game is starting.
             * This is used after the first game ends, and players initiate a new game
             * without refreshing the browser windows.
             */
            isNewGame : false,

            /**
             * Keep track of the number of players that have joined the game.
             */
            numPlayersInRoom: 0,

            /**
             * A reference to the correct answer for the current round.
             */
            currentCorrectAnswer: '',


            kings: 0,

            /**
             * Handler for the "Start" button on the Title Screen.
             */
            onCreateClick: function () {
                // console.log('Clicked "Create A Game"');
                IO.socket.emit('hostCreateNewGame');
            },

            /**
             * The Host screen is displayed for the first time.
             * @param data{{ gameId: int, mySocketId: * }}
             */
            gameInit: function (data) {
                App.gameId = data.gameId;
                App.mySocketId = data.mySocketId;
                App.myRole = 'Host';
                App.Host.numPlayersInRoom = 0;
                App.Host.kings = 0;

                App.Host.displayNewGameScreen();
                // console.log("Game started with ID: " + App.gameId + ' by host: ' + App.mySocketId);
            },

            /**
             * Show the Host screen containing the game URL and unique game ID
             */
            displayNewGameScreen : function() {
                // Fill the game screen with the appropriate HTML
                App.$gameArea.html(App.$templateNewGame);

                // Display the URL on screen
                $('#gameURL').text(window.location.href);
                App.doTextFit('#gameURL');

                // Show the gameId / room id on screen
                $('#spanNewGameCode').text(App.gameId);
            },

            /**
             * Update the Host screen when the first player joins
             * @param data{{playerName: string}}
             */
            updateWaitingScreen: function(data) {
                // If this is a restarted game, show the screen.
                if ( App.Host.isNewGame ) {
                    App.Host.displayNewGameScreen();
                }
                // Update host screen
                $('#playersWaiting')
                    .append('<p/>')
                    .text('Player ' + data.playerName + ' joined the game.');

                // Store the new player's data on the Host.
                App.Host.players.push(data);


                // Increment the number of players in the room
                App.Host.numPlayersInRoom += 1;

                // If two players have joined, start the game!
                if (App.Host.numPlayersInRoom === 8) {
                    // console.log('Room is full. Almost ready!');

                    // Let the server know that two players are present.
                    IO.socket.emit('hostRoomFull',App.gameId);
                }
            },

            /**
             * Show the countdown screen
             */
            gameCountdown : function() {

                // Prepare the game screen with new HTML
                App.$gameArea.html(App.$hostGame);
                App.doTextFit('#hostCard');

                // Begin the on-screen countdown timer
                var $secondsLeft = $('#hostCard');
                App.countDown( $secondsLeft, 5, function(){
                    IO.socket.emit('hostCountdownFinished', App.gameId);
                });

                $(document).ready(function() {
                        if(App.Host.players.length < 2){
                            $('td:nth-child(2)').hide();
                        }
                        if(App.Host.players.length < 3){
                            $('td:nth-child(3)').hide();
                        }
                         if(App.Host.players.length < 4){
                            $('td:nth-child(4)').hide();
                        }
                        if(App.Host.players.length < 5){
                            $('td:nth-child(5)').hide();
                        }
                         if(App.Host.players.length < 6){
                            $('td:nth-child(6)').hide();
                        }
                        if(App.Host.players.length < 7){
                            $('td:nth-child(7)').hide();
                        }
                         if(App.Host.players.length < 8){
                            $('td:nth-child(8)').hide();
                        }
                });

                // Display the players' names on screen
                $('#player1')
                    .html(App.Host.players[0].playerName);

                $('#player2')
                    .html(App.Host.players[1].playerName);
                
                $('#player3')
                    .html(App.Host.players[2].playerName);

                $('#player4')
                    .html(App.Host.players[3].playerName);

                $('#player5')
                    .html(App.Host.players[4].playerName);

                $('#player6')
                    .html(App.Host.players[5].playerName);

                $('#player7')
                    .html(App.Host.players[6].playerName);

                $('#player8')
                    .html(App.Host.players[7].playerName);

                // Set the Score section on screen to 0 for each player.
                $('#player1Score').find('.score').attr('id',App.Host.players[0].mySocketId);
                $('#player2Score').find('.score').attr('id',App.Host.players[1].mySocketId);
                $('#player3Score').find('.score').attr('id',App.Host.players[2].mySocketId);
                $('#player4Score').find('.score').attr('id',App.Host.players[3].mySocketId);
                $('#player5Score').find('.score').attr('id',App.Host.players[4].mySocketId);
                $('#player6Score').find('.score').attr('id',App.Host.players[5].mySocketId);
                $('#player7Score').find('.score').attr('id',App.Host.players[6].mySocketId);
                $('#player8Score').find('.score').attr('id',App.Host.players[7].mySocketId);
            },

            /**
             * Show the word for the current round on screen.
             * @param data{{round: *, word: *, answer: *, list: Array}}
             */
            newCard : function(data) {
                // Insert the new word into the DOM

                $('#hostCard').html("<p><img class='card' src='cards/"+data.card+".svg'>");

                if (data.type == 2){
                    $('#hostCard').append('<p>Two is for you.');
                }else if (data.type == 3){
                    $('#hostCard').append('<p>Three is for me.');
                }else if (data.type == 4){
                    $('#hostCard').append('<p>Fours are for whores.');
                }else if (data.type == 5){
                    $('#hostCard').append((App.Host.players[data.turn].playerName) +' is now the Thumb Master.');
                }else if (data.type == 6){
                    $('#hostCard').append('<p>Six is for dicks.');
                }else if (data.type == 7){
                    $('#hostCard').append('<p>Point to heaven.');
                }else if (data.type == 8){
                    $('#hostCard').append('<p>Pick a mate.');
                }else if (data.type == 9){
                    $('#hostCard').append('<p>Bust a rhyme.');
                }else if (data.type == 1){
                    $('#hostCard').append('<p>Categories.');
                }else if (data.type == 'J'){
                    $('#hostCard').append('<p>Make a rule.');
                }else if (data.type == 'Q'){
                    $('#hostCard').append((App.Host.players[data.turn].playerName) +' is now the Question Master.');
                }else if (data.type == 'K'){
                    App.Host.kings++;
                    $('#hostCard')
                        .append((App.Host.players[data.turn].playerName) +' must sacrifice to the Kings Cup.');
                    if (App.Host.kings === 4){
                        $('#hostCard')
                            .append('<p> As the final sacrifice, ' + (App.Host.players[data.turn].playerName) + ' must now accept the Kings Cup.');
                    };
                }else if (data.type == 'A'){
                    $('#hostCard').append('<p>Waterfall!');
                }else(error);
                App.doTextFit('#hostCard');


                // Update the data for the current round
                App.Host.currentCorrectAnswer = data.card;
                App.Host.currentRound = (data.round+1);
            },

            /**
             * Check the answer clicked by a player.
             * @param data{{round: *, playerId: *, answer: *, gameId: *}}
             */
            checkDraw : function(data) {
                // Verify that the answer clicked is from the current round.
                // This prevents a 'late entry' from a player whos screen has not
                // yet updated to the current round.
                IO.socket.emit('hostNextRound',data);            

            },


            /**
             * All 10 rounds have played out. End the game.
             * @param data
             */
            endGame : function(data) {
                // Get the data for player 1 from the host screen
                $('#hostCard').text("Game Over");
                App.doTextFit('#hostCard');

                // Reset game data
                App.Host.numPlayersInRoom = 0;
                App.Host.isNewGame = true;
            },

            /**
             * A player hit the 'Start Again' button after the end of a game.
             */
            restartGame : function() {
                App.$gameArea.html(App.$templateNewGame);
                $('#spanNewGameCode').text(App.gameId);
            }
        },


        /* *****************************
           *        PLAYER CODE        *
           ***************************** */

        Player : {

            /**
             * A reference to the socket ID of the Host
             */
            hostSocketId: '',

            /**
             * The player's name entered on the 'Join' screen.
             */
            myName: '',


            /**
             * Click handler for the 'JOIN' button
             */
            onJoinClick: function () {
                // console.log('Clicked "Join A Game"');

                // Display the Join Game HTML on the player's screen.
                App.$gameArea.html(App.$templateJoinGame);
            },

            /**
             * The player entered their name and gameId (hopefully)
             * and clicked Start.
             */
            onPlayerStartClick: function() {
                // console.log('Player clicked "Start"');

                // collect data to send to the server
                var data = {
                    gameId : +($('#inputGameId').val()),
                    playerName : $('#inputPlayerName').val() || 'anon'
                };

                // Send the gameId and playerName to the server
                IO.socket.emit('playerJoinGame', data);

                // Set the appropriate properties for the current player.
                App.myRole = 'Player';
                App.Player.myName = data.playerName;
            },

            /**
             *  Click handler for the Player hitting a word in the word list.
             */
            onPlayerDrawClick: function() {
                console.log('Clicked Answer Button');
                var $btn = $(this);      // the tapped button
                var answer = $btn.val(); // The tapped word

                // Send the player info and tapped word to the server so
                // the host can check the answer.
                var data = {
                    gameId: App.gameId,
                    playerId: App.mySocketId,
                    answer: answer,
                    round: App.currentRound
                }
                IO.socket.emit('playerDraw',data);
            },

            /**
             *  Click handler for the "Start Again" button that appears
             *  when a game is over.
             */
            onPlayerRestart : function() {
                var data = {
                    gameId : App.gameId,
                    playerName : App.Player.myName
                }
                IO.socket.emit('playerRestart',data);
                App.currentRound = 0;
                $('#gameArea')
                .html("<h3>Waiting on host to start new game.</h3>")
                .append(
                        // Create a button to start a new game.
                    $('<button>Ready?</button>')
                        .attr('id','btnPlayerRestart')
                        .addClass('btn')
                        .addClass('btnGameOver')
                    );
            },

            /**
             * Display the waiting screen for player 1
             * @param data
             */
            updateWaitingScreen : function(data) {

                if(IO.socket.socket.sessionid === data.mySocketId){
                    App.myRole = 'Player';
                    App.gameId = data.gameId;

                    $('#gameArea')
                    .empty();

                    $('#gameArea')
                    .append(
                        // Create a button to start a new game.
                        $('<button>Ready?</button>')
                            .addClass('btn')
                            .addClass('btnGameOver')
                            .on('click', function() {
                                IO.socket.emit('hostRoomFull',App.gameId)
                            })

                    );

                    $('#playerWaitingMessage')
                        .append('<p/>')
                        .text('Joined Game ' + data.gameId + '. Please wait for game to begin.');
                }

            },

            /**
             * Display 'Get Ready' while the countdown timer ticks down.
             * @param hostData
             */
            gameCountdown : function(hostData) {
                App.Player.hostSocketId = hostData.mySocketId;
                $('#gameArea')
                    .html('<div class="gameOver">Get Ready!</div>');
            },

            /**
             * Show the list of words for the current round.
             * @param data{{round: *, word: *, answer: *, list: Array}}
             */
            newCard : function(data) {

                console.log(data.turn)
                $('#gameArea')
                    .empty();
                if (data.players[data.turn - 1] === App.mySocketId){
                    if (data.type == 5){
                        $('#gameArea')
                            .append('<div class="gameOver"><p>You are now the Thumb Master!</div>');
                    }else if (data.type == 8){
                        $('#gameArea')
                            .append('<div class="gameOver"><p>Who will be your mate?</div>');
                    }else if (data.type == 'J'){
                        $('#gameArea')
                            .append('<div class="gameOver"><p>What is your rule?</div>');
                    }else if (data.type == 'Q'){
                        $('#gameArea')
                            .append('<div class="gameOver"><p>You are now the Question Master!</div>');
                    }
                }
                if (data.players[data.turn] === App.mySocketId){
                $('#gameArea').append(
                        // Create a button to start a new game.
                    $('<button>Your turn!</button>')
                        .attr('id','btnDraw')
                        .addClass('btn')
                        .addClass('btnGameOver')

                    );

                }

            },

            /**
             * Show the "Game Over" screen.
             */
            endGame : function() {
                $('#gameArea')
                    .html('<div class="gameOver">Game Over!</div>')
                    .append(
                        // Create a button to start a new game.
                        $('<button>Start Again</button>')
                            .attr('id','btnPlayerRestart')
                            .addClass('btn')
                            .addClass('btnGameOver')
                    );
            }
        },


        /* **************************
                  UTILITY CODE
           ************************** */

        /**
         * Display the countdown timer on the Host screen
         *
         * @param $el The container element for the countdown timer
         * @param startTime
         * @param callback The function to call when the timer ends.
         */
        countDown : function( $el, startTime, callback) {

            // Display the starting time on the screen.
            $el.text(startTime);
            App.doTextFit('#hostCard');

            // console.log('Starting Countdown...');

            // Start a 1 second timer
            var timer = setInterval(countItDown,1000);

            // Decrement the displayed timer value on each 'tick'
            function countItDown(){
                startTime -= 1
                $el.text(startTime);
                App.doTextFit('#hostCard');

                if( startTime <= 0 ){
                    // console.log('Countdown Finished.');
                    // Stop the timer and do the callback.
                    clearInterval(timer);
                    callback();
                    return;
                }
            }

        },

        /**
         * Make the text inside the given element as big as possible
         * See: https://github.com/STRML/textFit
         *
         * @param el The parent element of some text
         */
        doTextFit : function(el) {
            textFit(
                $(el)[0],
                {
                    alignHoriz:true,
                    heightOnly:false,
                    reProcess:true,
                    maxFontSize:500,
                }
            );
        }

    };

    IO.init();
    App.init();

}($));
