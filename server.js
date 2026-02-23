// Import necessary packages
const express = require('express');
require('dotenv').config();
const cors = require('cors');
const path = require('path');
const dataStore = require('./dataStore');
const nations = require('./nations.json');

const app = express();
const port = 3000;

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Root route renders the main page
app.get('/', (req, res) => {
    res.render('index');
});

// Add a new user
app.post('/adduser', (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ error: "Username cannot be empty." });
    }
    const existing = dataStore.getAllScores().find(u => u.username === username);
    if (existing) {
        return res.status(200).json({ message: `User '${username}' already exists.` });
    }
    dataStore.addUser(username);
    res.status(201).json({ message: `User '${username}' created successfully.` });
});

// Play a turn
app.post('/play', (req, res) => {
    const { nation } = req.body;
    const userNation = (nation || '').trim();
    if (!userNation) {
        return res.status(400).json({ error: "Nation name cannot be empty.", gameOver: true });
    }
    // Validate nation not used
    if (dataStore.getUsedNations().map(n => n.toLowerCase()).includes(userNation.toLowerCase())) {
        return res.status(400).json({ error: `"${userNation}" has already been used. You Lost!`, gameOver: true });
    }
    // Validate nation exists
    if (!nations.map(n => n.toLowerCase()).includes(userNation.toLowerCase())) {
        return res.status(400).json({ error: `"${userNation}" is not a valid nation. You Lost!`, gameOver: true });
    }
    // Validate starting letter
    const lastLetter = dataStore.getLastLetter();
    if (lastLetter && userNation[0].toLowerCase() !== lastLetter.toLowerCase()) {
        return res.status(400).json({ error: `Must start with "${lastLetter.toUpperCase()}". You Lost!`, gameOver: true });
    }
    // Record user's move
    dataStore.addUsedNation(userNation);
    const userLastLetter = userNation.slice(-1);

    // Computer's turn: pick random valid nation not used
    const possible = nations.filter(n =>
        n.toLowerCase().startsWith(userLastLetter.toLowerCase()) &&
        !dataStore.getUsedNations().map(u => u.toLowerCase()).includes(n.toLowerCase())
    );
    if (possible.length === 0) {
        return res.json({
            userNation,
            computerNation: null,
            message: "You win! I can't think of a nation.",
            gameOver: true
        });
    }
    const computerNation = possible[Math.floor(Math.random() * possible.length)];
    dataStore.addUsedNation(computerNation);
    dataStore.setLastLetter(computerNation.slice(-1));
    const newLastLetter = dataStore.getLastLetter();
    res.json({
        userNation,
        computerNation,
        lastLetter: newLastLetter.toUpperCase(),
        message: `Your turn! Name a nation starting with "${newLastLetter.toUpperCase()}".`,
        gameOver: false
    });
});

// Save a user's score
app.post('/score', (req, res) => {
    const { username, score } = req.body;
    if (!username || username === 'Guest' || score === undefined) {
        return res.status(400).json({ error: "Invalid user or score." });
    }
    dataStore.updateScore(username, score);
    res.json({ success: true, message: "Score saved!" });
});

// Get a specific user's score
app.get('/score/:username', (req, res) => {
    const { username } = req.params;
    const score = dataStore.getUserScore(username);
    if (score !== undefined) {
        res.json({ username, score });
    } else {
        res.json({ username, score: 0 });
    }
});

// Get the scoreboard
app.get('/scores', (req, res) => {
    const scores = dataStore.getAllScores();
    res.json(scores);
});

// Delete a user
app.delete('/user/:username', (req, res) => {
    const { username } = req.params;
    if (!username || username === 'Guest') {
        return res.status(400).json({ error: "Invalid username or cannot delete Guest." });
    }
    const deleted = dataStore.deleteUser(username);
    if (deleted) {
        res.json({ success: true, message: `User '${username}' deleted successfully.` });
    } else {
        res.status(404).json({ error: "User not found." });
    }
});

// Get a hint for a letter
app.get('/hint/:letter', (req, res) => {
    const { letter } = req.params;
    if (!letter || letter.length !== 1) {
        return res.status(400).json({ error: "Invalid letter for hint." });
    }
    const possible = nations.filter(n =>
        n.toLowerCase().startsWith(letter.toLowerCase()) &&
        !dataStore.getUsedNations().map(u => u.toLowerCase()).includes(n.toLowerCase())
    );
    if (possible.length === 0) {
        return res.status(404).json({ message: "No available hints for that letter." });
    }
    const hintNation = possible[Math.floor(Math.random() * possible.length)];
    res.json({ hint: hintNation });
});

// Reset the game only
app.post('/reset', (req, res) => {
    dataStore.resetGame();
    res.json({ success: true, message: `Game reset. Start with a nation beginning with 'S'.`, lastLetter: dataStore.getLastLetter() });
});

// Reset the game and scores
app.post('/reset-all', (req, res) => {
    dataStore.resetAllScores();
    dataStore.resetGame();
    res.json({ success: true, message: `All scores reset to 0. Game restarted.`, lastLetter: dataStore.getLastLetter() });
});

// Start the server
function startServer() {
    app.listen(port, () => {
        console.log(`Atlas game server listening at http://localhost:${port}`);
    });
}

startServer();
