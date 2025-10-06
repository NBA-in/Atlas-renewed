// Import necessary packages
const express = require('express');
const oracledb = require('oracledb');
const cors = require('cors');

// Basic server setup
const app = express();
const port = 3000;
app.use(cors()); // Allow the frontend to communicate with this server
app.use(express.json()); // Allow server to read JSON from requests

// --- IMPORTANT: Database Connection Details ---
const dbConfig = {
    user: "NBA_IN",
    password: "nba",
    connectString: "localhost/freepdb1"
};

let connection;

// Global game state (simple in-memory solution for a local game)
let usedNations = [];
let lastLetter = '';

// --- API Endpoints ---

// Endpoint to add a user
app.post('/adduser', async (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ error: "Username cannot be empty." });
    }
    try {
        const userCheck = await connection.execute(
            `SELECT COUNT(*) AS count FROM UserScores WHERE username = :username`,
            [username]
        );
        const userExists = userCheck.rows[0][0] > 0;
        if (!userExists) {
            await connection.execute(
                `INSERT INTO UserScores (username, score) VALUES (:username, 0)`,
                [username],
                { autoCommit: true }
            );
            res.status(201).json({ message: `User '${username}' created successfully.` });
        } else {
            res.status(200).json({ message: `User '${username}' already exists.` });
        }
    } catch (err) {
        console.error("Database error on add user:", err);
        res.status(500).json({ error: "Failed to add user due to a database error." });
    }
});

// *** NEW ENDPOINT TO DELETE A USER ***
app.post('/deleteuser', async (req, res) => {
    const { username } = req.body;
    if (!username || username === 'Guest') { // Prevent deleting the Guest user
        return res.status(400).json({ error: "Invalid username specified or cannot delete Guest." });
    }

    try {
        const result = await connection.execute(
            `DELETE FROM UserScores WHERE username = :username`,
            [username],
            { autoCommit: true }
        );
        
        if (result.rowsAffected > 0) {
            res.json({ success: true, message: `User '${username}' has been deleted.` });
        } else {
            res.status(404).json({ error: `User '${username}' not found.` });
        }
    } catch (err) {
        console.error("Database error on delete user:", err);
        res.status(500).json({ error: "Failed to delete user due to a database error." });
    }
});


// Endpoint to handle a player's turn
app.post('/play', async (req, res) => {
    const { nation } = req.body;
    const userNation = nation.trim();

    if (!userNation) {
        return res.status(400).json({ error: "Nation name cannot be empty.", gameOver: true });
    }

    try {
        // --- User's Turn Validation ---
        if (usedNations.map(n => n.toLowerCase()).includes(userNation.toLowerCase())) {
            return res.status(400).json({ error: `"${userNation}" has already been used. You Lost!`, gameOver: true });
        }

        const nationCheckResult = await connection.execute(
            `SELECT COUNT(*) AS count FROM Nations WHERE LOWER(name) = :name`,
            [userNation.toLowerCase()]
        );
        if (nationCheckResult.rows[0][0] === 0) {
            return res.status(400).json({ error: `"${userNation}" is not a valid nation. You Lost!`, gameOver: true });
        }

        if (lastLetter && userNation.toLowerCase().charAt(0) !== lastLetter.toLowerCase()) {
            return res.status(400).json({ error: `Must start with "${lastLetter.toUpperCase()}". You Lost!`, gameOver: true });
        }

        usedNations.push(userNation);
        const userLastLetter = userNation.slice(-1);

        // --- Computer's Turn ---
        const computerQueryResult = await connection.execute(
            `SELECT name FROM Nations WHERE LOWER(SUBSTR(name, 1, 1)) = :letter AND ROWNUM = 1 AND LOWER(name) NOT IN ('${usedNations.map(n=>n.toLowerCase()).join("','")}') ORDER BY DBMS_RANDOM.VALUE`,
            { letter: userLastLetter.toLowerCase() }
        );

        if (computerQueryResult.rows.length === 0) {
            return res.json({
                userNation,
                computerNation: null,
                message: "You win! I can't think of a nation.",
                gameOver: true
            });
        }

        const computerNation = computerQueryResult.rows[0][0];
        usedNations.push(computerNation);
        lastLetter = computerNation.slice(-1);

        res.json({
            userNation,
            computerNation,
            lastLetter: lastLetter.toUpperCase(),
            message: `Your turn! Name a nation starting with "${lastLetter.toUpperCase()}".`,
            gameOver: false
        });

    } catch (err) {
        console.error("Game logic error:", err);
        res.status(500).json({ error: "An error occurred during the game." });
    }
});

// Endpoint to save a user's score
app.post('/score', async (req, res) => {
    const { username, score } = req.body;
    if (!username || username === 'Guest' || score === undefined) {
        return res.status(400).json({ error: "Invalid user or score." });
    }
    try {
        await connection.execute(
            `MERGE INTO UserScores s
             USING (SELECT :username AS name FROM dual) d ON (s.username = d.name)
             WHEN MATCHED THEN UPDATE SET score = GREATEST(s.score, :score) WHERE :score > s.score
             WHEN NOT MATCHED THEN INSERT (username, score) VALUES (:username, :score)`,
            { username, score },
            { autoCommit: true }
        );
        res.json({ success: true, message: "Score saved!" });
    } catch (err) {
        console.error("Score saving error:", err);
        res.status(500).json({ error: "Failed to save score." });
    }
});

// Endpoint to get the scoreboard
app.get('/scores', async (req, res) => {
    try {
        const result = await connection.execute(
            `SELECT username, score FROM UserScores ORDER BY score DESC`
        );
        const scores = result.rows.map(row => ({
            username: row[0],
            score: row[1]
        }));
        res.json(scores);
    } catch (err) {
        console.error("Score fetching error:", err);
        res.status(500).json({ error: "Failed to fetch scores." });
    }
});

// Endpoint to reset the game
app.post('/reset', (req, res) => {
    usedNations = [];
    lastLetter = 'S';
    res.json({ success: true, message: `Game reset. Start with a nation beginning with 'S'.`, lastLetter: 'S' });
});

// --- Start the Server ---
async function startServer() {
    try {
        connection = await oracledb.getConnection(dbConfig);
        console.log("Successfully connected to Oracle Database!");
        app.listen(port, () => {
            console.log(`Atlas game server listening at http://localhost:${port}`);
        });
    } catch (err) {
        console.error("Failed to connect to Oracle Database:", err);
    }
}

startServer();
