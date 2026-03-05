const Utils = require('./utils.js');

function addRobot(room, emitPlayerListChangedEvent, getRoomList, io) {
    if (room.users.length < 7) {
        const robotNumber = room.users.filter(u => u.isRobot).length + 1;
        const robotId = 'Robot' + robotNumber;
        const robotToken = 'robot-token-' + robotNumber; // Simple token for robots

        const newRobot = {
            id: robotId,
            token: robotToken,
            isConnected: true,
            isRobot: true
        };

        room.users.push(newRobot);

        emitPlayerListChangedEvent(room);
        io.sockets.emit('rooms-status-changed', {
            roomsList: getRoomList()
        });

        return true;
    }
    return false;
}

function removeRobot(room, robotId, emitPlayerListChangedEvent, getRoomList, io) {
    const index = room.users.findIndex(u => u.id === robotId && u.isRobot);
    if (index !== -1) {
        room.users.splice(index, 1);

        // Renumber remaining robots to keep Robot1, Robot2, etc. consistent? 
        // Or just leave them as they are. The user said "le nom du robot est 'Robot1' pour le premier robot, puis 'Robot2', etc..."
        // If we remove Robot1 and then add another, it might become Robot2 if we don't renumber.
        // Let's renumber them to keep it clean.
        let robotCount = 1;
        room.users.forEach(u => {
            if (u.isRobot) {
                u.id = 'Robot' + robotCount;
                u.token = 'robot-token-' + robotCount;
                robotCount++;
            }
        });

        emitPlayerListChangedEvent(room);
        io.sockets.emit('rooms-status-changed', {
            roomsList: getRoomList()
        });
        return true;
    }
    return false;
}

module.exports = {
    addRobot,
    removeRobot
};
