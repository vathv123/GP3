const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// ----------------------
// Constants & state
// ----------------------
const CONTROLLER_KEY = "interception";
let controllerSocketId = null;

// Only viewers who clicked "Start" and registered
const viewers = {}; // { socketId: username }

const MAX_GROUPS = 6;
const TOTAL_QUESTIONS = 32;
let scores = Array(MAX_GROUPS).fill(0);
let shields = Array(MAX_GROUPS).fill(false);
let snackEligible = Array(MAX_GROUPS).fill(true);
let results = Array.from({ length: TOTAL_QUESTIONS }, () => Array(MAX_GROUPS).fill(null));
let currentQuestion = 0;
let currentTurnGroup = null;

// ----------------------
// Socket.io connection
// ----------------------
io.on("connection", socket => {
    console.log("Connected:", socket.id);

    // --- Controller registration ---
    socket.on("registerController", key => {
        if (key === CONTROLLER_KEY) {
            controllerSocketId = socket.id;
            console.log("Controller connected:", socket.id);

            // Send full game state to controller
            socket.emit("updateGame", {
                type: "sync",
                scores,
                shields,
                snackEligible,
                results,
                currentQuestion,
                currentTurnGroup,
                gameStarted: controllerSocketId !== null // true if admin has started
            });
            emitViewerCount();
        }
    });

    // --- Viewer registration (only after btnStart) ---
    socket.on("registerViewer", username => {
        // Ignore controller
        if (socket.id === controllerSocketId) return;

        // Remove previous entry with same username (for refresh)
        for (let id in viewers) {
            if (viewers[id] === username) delete viewers[id];
        }

        // Register current socket
        viewers[socket.id] = username;
        console.log("Viewer registered:", username, socket.id);

        emitViewerCount();
    });

    // --- Game actions from controller ---
    socket.on("gameAction", data => {
        if (socket.id === controllerSocketId) {
            // Update server state
            if (typeof data.currentQuestion === "number") currentQuestion = data.currentQuestion;
            if (typeof data.currentTurnGroup === "number") currentTurnGroup = data.currentTurnGroup;
            if (Array.isArray(data.scores)) scores = data.scores.slice();
            if (Array.isArray(data.shields)) shields = data.shields.slice();
            if (Array.isArray(data.snackEligible)) snackEligible = data.snackEligible.slice();
            if (Array.isArray(data.results)) results = data.results.map(arr => arr.slice());

            // Broadcast only to registered viewers
            for (let id in viewers) {
                io.to(id).emit("updateGame", data);
            }
        }
    });

    // --- Reset game event from controller ---
    socket.on("resetGame", () => {
        if (socket.id === controllerSocketId) {
            console.log("Admin requested full game reset");

            // 1. Reset all server-side game state
            scores = Array(MAX_GROUPS).fill(0);
            shields = Array(MAX_GROUPS).fill(false);
            snackEligible = Array(MAX_GROUPS).fill(true);
            results = Array.from({ length: TOTAL_QUESTIONS }, () => Array(MAX_GROUPS).fill(null));
            currentQuestion = 0;
            currentTurnGroup = null;

            // 2. Clear all viewers list (they will re-register if they want)
            for (let key in viewers) delete viewers[key];

            // 3. Broadcast reset event to all clients (viewers + admin)
            io.emit("adminDisconnected", { type: "resetViewer" });

            // 4. Update viewer count
            emitViewerCount();
        }
    });

    // --- Disconnect handler ---
    socket.on("disconnect", () => {
        console.log("Disconnected:", socket.id);

        if (socket.id === controllerSocketId) {
            console.log("Admin disconnected mid-game");

            controllerSocketId = null;

            // Notify all viewers to reset their game
            for (let id in viewers) {
                io.to(id).emit("adminDisconnected", { type: "resetViewer" });
            }
        }

        // Remove viewer from list if applicable
        if (viewers[socket.id]) {
            delete viewers[socket.id];
            emitViewerCount();
        }
    });

    
        // On server
    socket.on("forceFullRefresh", () => {
        if (socket.id !== controllerSocketId) return; // only admin can trigger
        console.log("Admin triggered full refresh");

        // Reset server-side game state
        scores = Array(MAX_GROUPS).fill(0);
        shields = Array(MAX_GROUPS).fill(false);
        snackEligible = Array(MAX_GROUPS).fill(true);
        results = Array.from({ length: TOTAL_QUESTIONS }, () => Array(MAX_GROUPS).fill(null));
        currentQuestion = 0;
        currentTurnGroup = null;

        // Notify all connected clients to refresh immediately
        io.emit("refreshPage");
    });




    // --- Helper: emit viewer count to controller ---
    function emitViewerCount() {
        if (controllerSocketId) {
            const viewerCount = Object.keys(viewers).length; // only registered viewers
            io.to(controllerSocketId).emit("viewerCountUpdate", viewerCount);
        }
    }
});

// ----------------------
// Optional endpoint to reset all viewers
// ----------------------
app.get("/resetViewers", (req, res) => {
    for (let key in viewers) delete viewers[key];
    res.send("Viewer list reset.");
});

// ----------------------
// Start server
// ----------------------
server.listen(3000, () => console.log("Server running on port 3000"));
