const fs = require('fs');
const path = require('path');
const storePath = path.join(__dirname, 'data.json');

let store = {
    users: [], // {username, score}
    usedNations: [],
    lastLetter: 'S'
};

function loadStore() {
    if (fs.existsSync(storePath)) {
        try {
            const raw = fs.readFileSync(storePath, 'utf8');
            store = JSON.parse(raw);
        } catch (e) {
            console.error('Failed to load data store:', e);
        }
    }
}

function saveStore() {
    try {
        fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
    } catch (e) {
        console.error('Failed to save data store:', e);
    }
}

loadStore();

module.exports = {
    // User functions
    addUser: (username) => {
        if (!store.users.find(u => u.username === username)) {
            store.users.push({ username, score: 0 });
            saveStore();
        }
    },
    getUserScore: (username) => {
        const user = store.users.find(u => u.username === username);
        return user ? user.score : 0;
    },
    updateScore: (username, score) => {
        const user = store.users.find(u => u.username === username);
        if (user && score > user.score) {
            user.score = score;
            saveStore();
        }
    },
    getAllScores: () => {
        return store.users.sort((a, b) => b.score - a.score);
    },
    deleteUser: (username) => {
        const index = store.users.findIndex(u => u.username === username);
        if (index !== -1) {
            store.users.splice(index, 1);
            saveStore();
            return true;
        }
        return false;
    },
    resetAllScores: () => {
        store.users.forEach(u => u.score = 0);
        saveStore();
    },
    // Game state functions
    resetGame: () => {
        store.usedNations = [];
        store.lastLetter = 'S';
        saveStore();
    },
    getUsedNations: () => store.usedNations,
    addUsedNation: (nation) => {
        store.usedNations.push(nation);
        saveStore();
    },
    getLastLetter: () => store.lastLetter,
    setLastLetter: (letter) => {
        store.lastLetter = letter;
        saveStore();
    }
};
