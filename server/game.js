const Utils = require('./utils.js');

exports.initializeRoomGameData = (room) => {
    room.canStartGame = false;
};

exports.getCanStartGame = (room, minPlayer, maxPlayer) => {
    return room.users.length >= minPlayer && room.users.length <= maxPlayer;
};

exports.initializeGame = (Socket, room, cards) => {
    // Room needs to be initialized once only, but the socket is reset at each connection !
    if (!room.initialCards) {
        room.initialCards = cards;
        room.gameCards = Utils.shuffle(room.initialCards);
        room.turn = 10; // TODO : RESET TO 1 AFTER TESTS
        for (let player of room.users) {
            player.cards = [];
            dispatchCards(room.turn, player, room.gameCards);
        }
    }

    // Handle player requesting its cards
    Socket.on('get-my-cards', (data) => {
        if (data.roomId === room.id) {
            Socket.emit('player-cards',  {
                cards: room.users
                    .filter(u => u.id === data.userId)
                    .map(u => u.cards)[0]
            });
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
