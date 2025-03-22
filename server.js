const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

// Configuración de Express
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// Crear servidor HTTP y WebSocket
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Estado del juego
let gameState = {
    isRunning: false,
    isWaiting: true, // Estado de espera para que los jugadores se unan
    players: {},
    hostId: null // ID del anfitrión (primer jugador)
};

// Manejo de conexiones WebSocket
wss.on('connection', (ws) => {
    // Rechazar conexión si hay una partida en curso y no estamos en espera
    if (gameState.isRunning && !gameState.isWaiting) {
        ws.send(JSON.stringify({ type: 'error', message: 'Partida en curso, no es posible unirse ahora' }));
        ws.close();
        return;
    }

    // Esperamos a que el cliente envíe su nombre antes de registrarlo completamente
    ws.isAwaitingName = true;

    // Enviar mensaje de solicitud de nombre
    ws.send(JSON.stringify({
        type: 'requestName'
    }));

    // Manejo de mensajes del cliente
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // Procesamiento específico para cuando esperamos el nombre
            if (ws.isAwaitingName && data.type === 'setName') {
                // Generar ID único para el jugador
                const playerId = Date.now().toString(36) + Math.random().toString(36).substr(2);
                ws.playerId = playerId;

                // Registrar nuevo jugador
                gameState.players[playerId] = {
                    id: playerId,
                    name: data.name,
                    active: true,
                    board: createEmptyBoard(),
                    linesCleared: 0,
                    ws: ws
                };

                // Si es el primer jugador, asignarlo como anfitrión
                if (Object.keys(gameState.players).length === 1) {
                    gameState.hostId = playerId;
                }

                // Notificar al jugador sobre su ID y si es anfitrión
                ws.send(JSON.stringify({
                    type: 'init',
                    playerId: playerId,
                    isHost: playerId === gameState.hostId,
                    players: Object.values(gameState.players).map(p => ({
                        id: p.id,
                        name: p.name,
                        active: p.active,
                        linesCleared: p.linesCleared
                    })),
                    gameState: {
                        isRunning: gameState.isRunning,
                        isWaiting: gameState.isWaiting
                    }
                }));

                // Notificar a todos los demás sobre el nuevo jugador
                broadcastToOthers(playerId, {
                    type: 'playerJoined',
                    player: {
                        id: playerId,
                        name: gameState.players[playerId].name,
                        active: true,
                        linesCleared: 0
                    }
                });

                // Ya no esperamos el nombre
                ws.isAwaitingName = false;
                return;
            }

            // Solo procesamos el resto de mensajes si ya tenemos el ID del jugador
            if (!ws.playerId || !gameState.players[ws.playerId]) return;

            const playerId = ws.playerId;

            switch (data.type) {
                case 'startGame':
                    // Solo el anfitrión puede iniciar el juego
                    if (playerId === gameState.hostId && gameState.isWaiting) {
                        gameState.isWaiting = false;
                        gameState.isRunning = true;

                        broadcast({
                            type: 'gameStart'
                        });
                    }
                    break;

                case 'boardUpdate':
                    // Actualizar el tablero del jugador
                    if (gameState.players[playerId] && gameState.players[playerId].active) {
                        gameState.players[playerId].board = data.board;
                        broadcastToOthers(playerId, {
                            type: 'boardUpdate',
                            playerId: playerId,
                            board: data.board
                        });
                    }
                    break;

                case 'lineCleared':
                    // Manejar líneas completadas y penalizar a otro jugador
                    if (gameState.players[playerId] && gameState.players[playerId].active) {
                        gameState.players[playerId].linesCleared += data.count;

                        // Seleccionar un jugador aleatorio para penalizar
                        const activePlayers = Object.values(gameState.players)
                            .filter(p => p.active && p.id !== playerId);

                        if (activePlayers.length > 0) {
                            const targetPlayer = activePlayers[Math.floor(Math.random() * activePlayers.length)];

                            // Enviar penalización
                            broadcast({
                                type: 'penalty',
                                targetPlayerId: targetPlayer.id,
                                count: data.count,
                                sourcePlayerId: playerId,
                                sourceName: gameState.players[playerId].name
                            });
                        }
                    }
                    break;

                case 'gameOver':
                    // Manejar cuando un jugador pierde
                    if (gameState.players[playerId]) {
                        gameState.players[playerId].active = false;

                        broadcast({
                            type: 'playerLost',
                            playerId: playerId,
                            playerName: gameState.players[playerId].name
                        });

                        // Verificar si todos los jugadores han perdido
                        const allLost = Object.values(gameState.players)
                            .every(player => !player.active);

                        if (allLost) {
                            // Reiniciar juego después de 5 segundos
                            setTimeout(() => resetGame(), 5000);
                        }
                    }
                    break;
            }
        } catch (error) {
            console.error('Error al procesar mensaje:', error);
        }
    });

    // Manejo de desconexión
    ws.on('close', () => {
        if (ws.playerId && gameState.players[ws.playerId]) {
            const playerId = ws.playerId;

            // Marcar al jugador como inactivo
            gameState.players[playerId].active = false;

            broadcast({
                type: 'playerDisconnected',
                playerId: playerId,
                playerName: gameState.players[playerId].name
            });

            // Si es el anfitrión, asignar un nuevo anfitrión si es posible
            if (playerId === gameState.hostId) {
                const activePlayers = Object.values(gameState.players)
                    .filter(p => p.active);

                if (activePlayers.length > 0) {
                    gameState.hostId = activePlayers[0].id;

                    // Notificar al nuevo anfitrión
                    if (gameState.players[gameState.hostId].ws.readyState === WebSocket.OPEN) {
                        gameState.players[gameState.hostId].ws.send(JSON.stringify({
                            type: 'becomeHost'
                        }));
                    }
                }
            }

            // Si todos los jugadores están inactivos, reiniciar juego
            const allInactive = Object.values(gameState.players)
                .every(player => !player.active);

            if (allInactive) {
                resetGame();
            }

            // Eliminar al jugador después de un tiempo
            setTimeout(() => {
                delete gameState.players[playerId];
            }, 5000);
        }
    });
});

// Función para crear tablero vacío
function createEmptyBoard() {
    return Array(20).fill().map(() => Array(10).fill(0));
}

// Función para reiniciar juego
function resetGame() {
    gameState.isRunning = false;
    gameState.isWaiting = true;

    // Reiniciar estado de los jugadores
    Object.keys(gameState.players).forEach(id => {
        if (gameState.players[id].ws.readyState === WebSocket.OPEN) {
            gameState.players[id].active = true;
            gameState.players[id].board = createEmptyBoard();
            gameState.players[id].linesCleared = 0;
        } else {
            delete gameState.players[id];
        }
    });

    // Notificar reinicio a todos los jugadores
    broadcast({
        type: 'gameReset',
        players: Object.values(gameState.players).map(p => ({
            id: p.id,
            name: p.name,
            active: p.active,
            linesCleared: p.linesCleared
        }))
    });
}

// Función para enviar mensaje a todos los jugadores
function broadcast(message) {
    const messageStr = JSON.stringify(message);
    Object.values(gameState.players).forEach(player => {
        if (player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(messageStr);
        }
    });
}

// Función para enviar mensaje a todos excepto un jugador
function broadcastToOthers(excludePlayerId, message) {
    const messageStr = JSON.stringify(message);
    Object.values(gameState.players).forEach(player => {
        if (player.id !== excludePlayerId && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(messageStr);
        }
    });
}

// Iniciar servidor en puerto 8080
server.listen(8080, () => {
    console.log('Servidor Tetris iniciado en http://localhost:8080');
});