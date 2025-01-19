exports.randomRoomId = () => {
    return 'XXXX-XXXX-XXXX-XXXX'.replace(/[X]/g, () => {
        return (Math.random() * 16 | 0).toString(16).toUpperCase();
    });
};
