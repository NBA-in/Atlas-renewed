// Import necessary packages
const express = require('express');
const oracledb = require('oracledb');
const cors = require('cors');

// Basic server setup
const app = express();
const port = 3000;
app.use(cors());
app.use(express.json());

// --- Database Connection Details ---
const dbConfig = {
    user: "NBA_IN",
    password: "nba",
    connectString: "localhost/freepdb1"
};

let connection;

// Global game state
let usedNations = [];
let lastLetter = '';

// --- API Endpoints ---

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

// NEW ENDPOINT TO DELETE A USER
app.post('/deleteuser', async (req, res) => {
    const { username } = req.body;
    // Basic validation
    if (!username || username === 'Guest') {
        return res.status(400).json({ error: "Invalid username specified or cannot delete Guest." });
    }

    try {
        const result = await connection.execute(
            `DELETE FROM UserScores WHERE username = :username`,
            [username],
            { autoCommit: true } // Commit the transaction immediately
        );

        // Check if a row was actually deleted
        if (result.rowsAffected > 0) {
            res.json({ success: true, message: `User '${username}' has been deleted.` });
        } else {
            // This case handles trying to delete a user that doesn't exist
            res.status(404).json({ error: `User '${username}' not found.` });
        }
    } catch (err) {
        console.error("Database error on delete user:", err);
        res.status(500).json({ error: "Failed to delete user due to a database error." });
    }
});


app.post('/play', async (req, res) => {
    const { nation } = req.body;
    const userNation = nation.trim();
    if (!userNation) {
        return res.status(400).json({ error: "Nation name cannot be empty.", gameOver: true });
    }
    try {
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

// *** MODIFIED ENDPOINT TO RESET THE GAME AND DATABASE SCORE ***
app.post('/reset', async (req, res) => {
    const { username } = req.body; // Get username from the request

    // Reset in-memory game state
    usedNations = [];
    lastLetter = 'S';

    try {
        // Only update the database if a valid user is provided (not Guest)
        if (username && username !== 'Guest') {
            await connection.execute(
                `UPDATE UserScores SET score = 0 WHERE username = :username`,
                [username],
                { autoCommit: true }
            );
        }
        // Always send a success response to the frontend to reset the UI
        res.json({ success: true, message: `Game reset. Start with a nation beginning with 'S'.`, lastLetter: 'S' });
    } catch (err) {
        console.error("Error resetting score in database:", err);
        // If DB fails, still let the frontend reset, but log the error
        res.status(500).json({ error: "Game reset, but failed to update score in the database." });
    }
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


