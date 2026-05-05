const IntelligentRobot = require('./intelligent-robot.js');

const CARD_TYPE = {
    BLACK: 'black',
    EVASION: 'evasion',
    SKULL_KING: 'skull-king',
    PIRATE: 'pirate',
    MERMAID: 'mermaid',
    CHOICE: 'choice'
};

function getRobotBet(robot, turn) {
    if (robot.robotType === 'intelligent') {
        return IntelligentRobot.getRobotBet(robot, turn);
    }
    // Stupid robot logic
    const betValue = robot.cards.filter(card => card.value >= 30).length;
    return Math.min(betValue, turn);
}

function getRobotCardToPlay(room, robot) {
    if (robot.robotType === 'intelligent') {
        return IntelligentRobot.getRobotCardToPlay(room, robot);
    }

    // Stupid robot logic
    if (robot.cards.length === 0) return null;

    // Find the first played card color to follow suit
    const firstColorCard = room.playedCards.find(c => !c.isSpecial);
    const typeOfCards = firstColorCard ? firstColorCard.type : null;

    let cardToPlay = null;
    let choiceType = null;

    if (typeOfCards) {
        // Try to follow suit
        const matchingCard = robot.cards.find(c => c.type === typeOfCards);
        if (matchingCard) {
            cardToPlay = matchingCard;
        }
    }

    // If no matching card or no suit to follow, play the first card
    if (!cardToPlay) {
        cardToPlay = robot.cards[0];
    }

    // Handle Tigresse choice
    if (cardToPlay.type === CARD_TYPE.CHOICE) {
        choiceType = CARD_TYPE.EVASION; // Default to evasion for "stupid" robot
    }

    return {
        cardId: cardToPlay.id,
        type: choiceType
    };
}

module.exports = {
    getRobotBet,
    getRobotCardToPlay
};
