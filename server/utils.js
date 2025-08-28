exports.randomRoomId = () => {
    return 'XXXX-XXXX-XXXX-XXXX'.replace(/[X]/g, () => {
        return (Math.random() * 16 | 0).toString(16).toUpperCase();
    });
};

exports.findIndexById = (array, id) => {
    return _findIndex(array, 'id', id);
};

exports.findUserByIdAndToken = (users, id, token) => {
  return users.find(user => user.id === id && user.token === token);
};

exports.findElementById = (array, id) => {
    return array.find(e => e.id === id);
};

exports.shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

exports.deepCopy = (object) => {
    return JSON.parse(JSON.stringify(object));
};

function _findIndex(array, attributeName, attributeValue) {
    return array.findIndex((element) => element[attributeName] === attributeValue);
}