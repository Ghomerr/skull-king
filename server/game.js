const Utils = require('./utils.js');

exports.initializeRoomGameData = (room) => {
    room.canStartGame = false;
};

exports.getCanStartGame = (room, minPlayer, maxPlayer) => {
    return room.users.length >= minPlayer && room.users.length <= maxPlayer;
};

exports.initializeGame = (room, cards) => {
    // Room needs to be initialized once only, but the socket is reset at each connection !
    if (!room.initialCards) {
        room.initialCards = cards;
        room.gameCards = Utils.shuffle(room.initialCards);
        room.cardsById = {};
        cards.forEach((card) => {
            room.cardsById[card.id] = card;
        });
        room.cardsOfTurn = [];
        room.turn = 10; // TODO : RESET TO 1 AFTER TESTS
        room.currentPlayerIndex = 0;
        room.currentPlayerId = room.users[0].id;

        // TODO REMOVE THIS TEST
        if (player.id === "Ghomerr") {
            // ADD TIGRESSE HERE !!!
        }

        for (let player of room.users) {
            player.cards = [];
            player.foldBet = null;
            dispatchCards(room.turn, player, room.gameCards);
        }
    }
};

exports.setEventListeners = (io, Socket, room) => {

    // Handle player requesting its cards
    Socket.on('get-my-cards', (data) => {
        console.log('get-my-cards', data);
        if (data.roomId === room.id) {
            Socket.emit('player-cards',  {
                turn: room.turn,
                cards: room.users
                    .filter(u => u.id === data.userId)
                    .map(u => u.cards)[0].map(c => {
                        return {
                            id: c.id,
                            type: c.type,
                            img: c.img
                        }
                    })
            });
        }
    });

    // Handle when a player set its fold bet
    Socket.on('set-fold-bet', (data) => {
        if (data.roomId === room.id) {
            const player = room.users.filter(u => u.id === data.userId)[0];
            if (player) {
                console.log('set-fold-bet', data);
                player.foldBet = data.foldBet;
            }

            const totalNumberOfPlayers = room.users.length;
            const numberOfReadyPlayers = room.users.filter(u => u.foldBet !== null).length;

            // If all players have chosen their bet, display the turn start !
            if (totalNumberOfPlayers === numberOfReadyPlayers) {
                io.to(room.id).emit('yo-ho-ho', {
                    turn: room.turn,
                    bets: room.users.map(player => {
                        return {
                            userId: player.id,
                            foldBet: player.foldBet
                        };
                    }),
                    currentPlayerId: room.currentPlayerId
                });
            } else {
                // Notifies players of how many players are ready
                io.to(room.id).emit('waiting-players-bets', {
                    numberOfReadyPlayers: numberOfReadyPlayers,
                    totalNumberOfPlayers: totalNumberOfPlayers
                });
            }
        }
    });

    // Handle when a player plays a card
    Socket.on('play-a-card', (data) => {
        if (room.id === data.roomId) {
            if (data.playerId === room.currentPlayerId) {
                const playedCard = room.cardsById[data.cardId];
                if (playedCard.type === 'choice') {
                    if (data.type === 'pirate') {
                        playedCard.img = 'tigresse_pirate.jpg';
                    } else if (data.type === 'evasion') {
                        playedCard.img = 'tigresse_evasion.jpg';
                        playedCard.value = 0;
                        playedCard.bonus = 0;
                    } else {
                        // TODO : wrong choice
                    }
                }

                console.log('play-a-card', playedCard); 

                if (room.cardsOfTurn.length === 0) {
                    // OK
                } else {

                }

                // TODO test if player can play this card
                Socket.emit('player-error',  {
                    type: 'cannot-play-this-card',
                    data: playedCard.name
                });

                // If KO -> display message to player

                // If OK -> remove card from player and add it to played card
                // send message to all players with the current state of played cards
                // send message to the player to remove its played card
            }
        }
    });
};

function dispatchCards(turn, player, gameCards) {
    for (let i = 1; i <= turn; i++) {
        player.cards.push(gameCards.pop());
    }
    sortPlayerCards(player.cards);
}

function sortPlayerCards(playerCards) {
    playerCards.sort((c1, c2) => {
        const typeCompare = c1.type.localeCompare(c2.type);
        if (typeCompare === 0) {
            return c1.value - c2.value;
        }
        return typeCompare;
    });
}
