// ======== CONFIGURACIÓN Y VARIABLES GLOBALES ========
const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const BLOCK_SIZE = 30;
const PREVIEW_BLOCK_SIZE = 15;

// Colores de las piezas
const COLORS = [
    null,  // Sin bloque (0)
    '#FF0D72', // I - Rojo (1)
    '#0DC2FF', // O - Azul claro (2)
    '#0DFF72', // T - Verde (3)
    '#F538FF', // J - Magenta (4)
    '#FF8E0D', // L - Naranja (5)
    '#FFE138', // S - Amarillo (6)
    '#3877FF'  // Z - Azul (7)
];

// Definición de las piezas
const PIECES = [
    null,
    // I
    [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
    // O
    [
        [2, 2],
        [2, 2]
    ],
    // T
    [
        [0, 3, 0],
        [3, 3, 3],
        [0, 0, 0]
    ],
    // J
    [
        [4, 0, 0],
        [4, 4, 4],
        [0, 0, 0]
    ],
    // L
    [
        [0, 0, 5],
        [5, 5, 5],
        [0, 0, 0]
    ],
    // S
    [
        [0, 6, 6],
        [6, 6, 0],
        [0, 0, 0]
    ],
    // Z
    [
        [7, 7, 0],
        [0, 7, 7],
        [0, 0, 0]
    ]
];

// Estado global del juego
let gameState = {
    myPlayerId: null,
    playerName: "",
    isHost: false,
    activePlayer: true,
    isRunning: false,
    isWaiting: true,
    board: createEmptyBoard(),
    nextPiecesQueue: [], // Changed nextPiece to nextPiecesQueue and initialized as an empty array
    currentPiece: {
        matrix: null,
        x: 0,
        y: 0
    },
    linesCleared: 0,
    otherPlayers: {},
    lastTime: 0,
    dropCounter: 0,
    dropInterval: 1000, // Intervalo inicial de caída (ms)
};

// Audio
const audioFiles = {
    move: new Audio('audio/move.wav'),
    rotate: new Audio('audio/rotate.wav'),
    lineClear: new Audio('audio/line_clear.wav'),
    gameOver: new Audio('audio/game_over.wav'),
    background: document.getElementById('bgMusic')
};

// Manejo del volumen
const volumeControl = document.getElementById('volume');
volumeControl.addEventListener('input', () => {
    const volume = volumeControl.value;
    Object.values(audioFiles).forEach(audio => {
        audio.volume = volume;
    });
});

// Elementos del DOM
const loginContainer = document.getElementById('loginContainer');
const playerNameInput = document.getElementById('playerName');
const joinButton = document.getElementById('joinButton');
const startGameButton = document.getElementById('startGameButton');
const lobbyPlayers = document.getElementById('lobbyPlayers');
const playersList = document.getElementById('playersList');
const gameContainer = document.getElementById('gameContainer');
const gameStatus = document.getElementById('gameStatus');

// WebSocket
let socket = null;

// ======== FUNCIONES DE INICIALIZACIÓN ========

// Iniciar proceso de login
joinButton.addEventListener('click', () => {
    const name = playerNameInput.value.trim();

    if (name.length < 3) {
        alert('Por favor, introduce un nombre válido (mínimo 3 caracteres)');
        return;
    }

    gameState.playerName = name;

    // Ocultar pantalla de login
    loginContainer.style.display = 'none';

    // Iniciar conexión WebSocket
    initWebSocket();
});

// Iniciar partida (solo host)
startGameButton.addEventListener('click', () => {
    if (gameState.isHost && gameState.isWaiting) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'startGame'
            }));
        }
    }
});

// Iniciar conexión WebSocket
function initWebSocket() {
    // Determinar automáticamente la URL del WebSocket basándose en la ubicación actual
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname === '' ? 'localhost:8080' : window.location.host;

    socket = new WebSocket(`${protocol}//${host}`);

    socket.onopen = () => {
        console.log('Conectado al servidor WebSocket');
        updateGameStatus('Conectado. Enviando información de jugador...');
    };

    socket.onclose = () => {
        console.log('Desconectado del servidor WebSocket');
        updateGameStatus('Desconectado del servidor. Recargue la página para volver a intentarlo.');
    };

    socket.onerror = (error) => {
        console.error('Error en WebSocket:', error);
        updateGameStatus('Error de conexión. Recargue la página para volver a intentarlo.');
    };

    socket.onmessage = handleServerMessage;
}

// Manejar mensajes del servidor
function handleServerMessage(event) {
    try {
        const message = JSON.parse(event.data);

        switch (message.type) {
            case 'requestName':
                // Enviar el nombre del jugador
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({
                        type: 'setName',
                        name: gameState.playerName
                    }));
                }
                break;

            case 'init':
                // Inicialización del jugador
                gameState.myPlayerId = message.playerId;
                gameState.isHost = message.isHost;
                gameState.isRunning = message.gameState.isRunning;
                gameState.isWaiting = message.gameState.isWaiting;

                // Si es el anfitrión, mostrar botón de inicio
                if (gameState.isHost) {
                    startGameButton.style.display = 'inline-block';
                }

                // Crear canvas para el tablero principal
                createMyBoard();

                // Inicializar otros jugadores
                message.players.forEach(player => {
                    if (player.id !== gameState.myPlayerId) {
                        gameState.otherPlayers[player.id] = player;
                    }
                });

                // Actualizar lista de jugadores en espera
                updateLobbyPlayersList();

                updateGameStatus(gameState.isHost ?
                    'Esperando jugadores. Pulsa "Iniciar Partida" cuando estés listo.' :
                    'Esperando a que el anfitrión inicie la partida...');
                break;

            case 'playerJoined':
                // Nuevo jugador se unió
                if (message.player.id !== gameState.myPlayerId) {
                    gameState.otherPlayers[message.player.id] = message.player;
                    updateLobbyPlayersList();
                }
                break;

            case 'gameStart':
                // Iniciar juego
                gameState.isRunning = true;
                gameState.isWaiting = false;
                gameState.activePlayer = true;

                // Ocultar lobby y botón de inicio
                lobbyPlayers.style.display = 'none';
                startGameButton.style.display = 'none';

                // Mostrar tableros de oponentes
                for (const playerId in gameState.otherPlayers) {
                    createOpponentBoard(playerId);
                }

                resetGame();
                updateGameStatus('¡Juego iniciado!');

                // Iniciar música de fondo
                playAudio(audioFiles.background, true);
                break;

            case 'boardUpdate':
                // Actualizar tablero de oponente
                if (gameState.otherPlayers[message.playerId]) {
                    gameState.otherPlayers[message.playerId].board = message.board;
                    renderOpponentBoard(message.playerId);
                }
                break;

            case 'penalty':
                // Recibir penalización
                if (message.targetPlayerId === gameState.myPlayerId) {
                    applyPenalty(message.count);
                    updateGameStatus(`¡${message.sourceName} te envió ${message.count} línea(s) de penalización!`);
                }
                break;

            case 'playerLost':
                // Jugador perdió
                if (message.playerId === gameState.myPlayerId) {
                    gameState.activePlayer = false;
                    showGameOver(true);
                    updateGameStatus('¡Has perdido! Esperando a que termine la partida...');
                } else if (gameState.otherPlayers[message.playerId]) {
                    gameState.otherPlayers[message.playerId].active = false;
                    showGameOver(false, message.playerId);
                    updateGameStatus(`¡${message.playerName} ha sido eliminado!`);
                }
                break;

            case 'playerDisconnected':
                // Jugador desconectado
                if (gameState.otherPlayers[message.playerId]) {
                    gameState.otherPlayers[message.playerId].active = false;

                    if (gameState.isRunning) {
                        showGameOver(false, message.playerId);
                    } else {
                        delete gameState.otherPlayers[message.playerId];
                        updateLobbyPlayersList();
                    }

                    updateGameStatus(`${message.playerName} se ha desconectado.`);
                }
                break;

            case 'becomeHost':
                // El jugador se convierte en anfitrión
                gameState.isHost = true;

                if (gameState.isWaiting) {
                    startGameButton.style.display = 'inline-block';
                    updateGameStatus('Ahora eres el anfitrión. Puedes iniciar la partida cuando estés listo.');
                }

                updateLobbyPlayersList();
                break;

            case 'gameReset':
                // Reiniciar juego
                gameState.activePlayer = true;
                gameState.isRunning = false;
                gameState.isWaiting = true;
                hideGameOver();

                // Limpiar tableros de oponentes
                gameContainer.innerHTML = '';

                // Actualizar estado de los jugadores
                gameState.otherPlayers = {};
                message.players.forEach(player => {
                    if (player.id !== gameState.myPlayerId) {
                        gameState.otherPlayers[player.id] = player;
                    }
                });

                // Mostrar lobby y lista de jugadores
                lobbyPlayers.style.display = 'block';
                if (gameState.isHost) {
                    startGameButton.style.display = 'inline-block';
                }

                // Actualizar lista de jugadores
                updateLobbyPlayersList();

                // Crear tablero principal nuevamente
                createMyBoard();

                updateGameStatus(gameState.isHost ?
                    'Partida reiniciada. Pulsa "Iniciar Partida" cuando estés listo.' :
                    'Partida reiniciada. Esperando a que el anfitrión inicie la partida...');
                break;

            case 'error':
                // Error del servidor
                updateGameStatus(`Error: ${message.message}`);
                break;
        }
    } catch (error) {
        console.error('Error al procesar mensaje del servidor:', error);
    }
}

// ======== FUNCIONES DE INTERFAZ DE USUARIO ========

// Actualizar lista de jugadores en el lobby
function updateLobbyPlayersList() {
    playersList.innerHTML = '';

    // Añadir jugador principal (siempre primero si es anfitrión)
    const playerItem = document.createElement('div');
    playerItem.className = 'lobby-player';
    playerItem.textContent = `${gameState.playerName}${gameState.isHost ? ' 👑' : ''}`;
    playersList.appendChild(playerItem);

    // Añadir otros jugadores
    Object.values(gameState.otherPlayers).forEach(player => {
        const otherPlayerItem = document.createElement('div');
        otherPlayerItem.className = 'lobby-player';
        otherPlayerItem.textContent = player.name;
        playersList.appendChild(otherPlayerItem);
    });
}

// ======== FUNCIONES DE TABLERO Y RENDERIZADO ========

// Crear tablero vacío
function createEmptyBoard() {
    // Crear un tablero completamente lleno de ceros (vacío)
    return Array(BOARD_HEIGHT).fill().map(() => Array(BOARD_WIDTH).fill(0));
}

// Crear el canvas para el tablero principal
function createMyBoard() {
    // Crear contenedor para el tablero del jugador
    const playerBoard = document.createElement('div');
    playerBoard.className = 'player-board';
    playerBoard.id = `player-${gameState.myPlayerId}`;

    // Info del jugador
    const playerInfo = document.createElement('div');
    playerInfo.className = 'player-info';
    playerInfo.innerHTML = `
        <span>${gameState.playerName}${gameState.isHost ? ' 👑' : ''}</span>
        <span id="lines-${gameState.myPlayerId}">Líneas: 0</span>
    `;
    playerBoard.appendChild(playerInfo);

    // Contenedor para tablero y próxima pieza
    const boardContainer = document.createElement('div');
    boardContainer.style.display = 'flex';

    // Canvas del tablero
    const canvas = document.createElement('canvas');
    canvas.className = 'board';
    canvas.id = `board-${gameState.myPlayerId}`;
    canvas.width = BOARD_WIDTH * BLOCK_SIZE;
    canvas.height = BOARD_HEIGHT * BLOCK_SIZE;

    // Canvas de próxima pieza
    const nextCanvas = document.createElement('canvas');
    nextCanvas.className = 'next-piece';
    nextCanvas.id = `next-${gameState.myPlayerId}`;
    nextCanvas.width = 4 * PREVIEW_BLOCK_SIZE; 
    nextCanvas.height = 12 * PREVIEW_BLOCK_SIZE; // Adjusted height for three pieces (4 blocks high each * 3)

    // Overlay de fin de juego
    const gameOverOverlay = document.createElement('div');
    gameOverOverlay.className = 'game-over-overlay';
    gameOverOverlay.id = `game-over-${gameState.myPlayerId}`;
    gameOverOverlay.textContent = 'GAME OVER';

    boardContainer.appendChild(canvas);
    boardContainer.appendChild(nextCanvas);
    playerBoard.appendChild(boardContainer);
    playerBoard.appendChild(gameOverOverlay);

    gameContainer.appendChild(playerBoard);

    // Inicializar contextos de renderizado
    gameState.context = canvas.getContext('2d');
    gameState.nextContext = nextCanvas.getContext('2d');

    // Generar pieza inicial y siguiente
    if (!gameState.currentPiece.matrix) {
        gameState.currentPiece.matrix = getRandomPiece();
        gameState.currentPiece.x = Math.floor(BOARD_WIDTH / 2) - Math.floor(gameState.currentPiece.matrix[0].length / 2);
        gameState.currentPiece.y = 0;
    }

    if (gameState.nextPiecesQueue.length === 0) { // Populate queue if empty
        gameState.nextPiecesQueue.push(getRandomPiece());
        gameState.nextPiecesQueue.push(getRandomPiece());
        gameState.nextPiecesQueue.push(getRandomPiece());
    }

    // Renderizar tablero y próxima pieza
    renderBoard();
    renderNextPiece();
}

// Crear tablero para un oponente
function createOpponentBoard(playerId) {
    if (!gameState.otherPlayers[playerId]) return;

    // Crear contenedor para el tablero del oponente
    const playerBoard = document.createElement('div');
    playerBoard.className = 'player-board';
    playerBoard.id = `player-${playerId}`;

    // Info del jugador
    const playerInfo = document.createElement('div');
    playerInfo.className = 'player-info';
    playerInfo.innerHTML = `
        <span>${gameState.otherPlayers[playerId].name}</span>
        <span id="lines-${playerId}">Líneas: 0</span>
    `;
    playerBoard.appendChild(playerInfo);

    // Canvas del tablero
    const canvas = document.createElement('canvas');
    canvas.className = 'board';
    canvas.id = `board-${playerId}`;
    canvas.width = BOARD_WIDTH * BLOCK_SIZE / 1.5; // Más pequeño que el principal
    canvas.height = BOARD_HEIGHT * BLOCK_SIZE / 1.5;
    playerBoard.appendChild(canvas);

    // Overlay de fin de juego
    const gameOverOverlay = document.createElement('div');
    gameOverOverlay.className = 'game-over-overlay';
    gameOverOverlay.id = `game-over-${playerId}`;
    gameOverOverlay.textContent = 'GAME OVER';
    playerBoard.appendChild(gameOverOverlay);

    gameContainer.appendChild(playerBoard);

    // Inicializar el contexto y renderizar
    const context = canvas.getContext('2d');
    gameState.otherPlayers[playerId].context = context;
    renderOpponentBoard(playerId);
}

// Renderizar tablero del jugador
function renderBoard() {
    if (!gameState.context) return;

    // Limpiar todo el canvas primero
    gameState.context.clearRect(0, 0,
        BOARD_WIDTH * BLOCK_SIZE,
        BOARD_HEIGHT * BLOCK_SIZE);

    // Dibujar fondo negro para el tablero
    gameState.context.fillStyle = '#111';
    gameState.context.fillRect(0, 0, BOARD_WIDTH * BLOCK_SIZE, BOARD_HEIGHT * BLOCK_SIZE);

    // Dibujar bloques fijos en el tablero
    for (let y = 0; y < BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOARD_WIDTH; x++) {
            if (gameState.board[y][x] !== 0) {
                drawBlock(
                    gameState.context,
                    x,
                    y,
                    COLORS[gameState.board[y][x]],
                    BLOCK_SIZE
                );
            }
        }
    }

    // Dibujar pieza actual
    if (gameState.currentPiece.matrix) {
        renderPiece(
            gameState.context,
            gameState.currentPiece.matrix,
            gameState.currentPiece.x,
            gameState.currentPiece.y,
            BLOCK_SIZE
        );
    }

    // Actualizar información de líneas
    if (document.getElementById(`lines-${gameState.myPlayerId}`)) {
        document.getElementById(`lines-${gameState.myPlayerId}`).textContent = `Líneas: ${gameState.linesCleared}`;
    }
}

// Renderizar próxima pieza
function renderNextPiece() {
    if (!gameState.nextContext) return;

    // Limpiar el canvas completo primero
    gameState.nextContext.clearRect(0, 0,
        4 * PREVIEW_BLOCK_SIZE,
        12 * PREVIEW_BLOCK_SIZE); // Adjusted height for three pieces

    // Display up to 3 pieces from the queue
    for (let i = 0; i < gameState.nextPiecesQueue.length && i < 3; i++) {
        const pieceToRender = gameState.nextPiecesQueue[i];
        if (pieceToRender) {
            const pieceWidth = pieceToRender[0].length;
            const pieceHeight = pieceToRender.length;

            // Calcular offset para centrado perfecto for each piece
            const offsetX = Math.floor((4 - pieceWidth) / 2);
            // Adjust offsetY to stack pieces vertically, allocating 4 blocks of height for each piece preview
            const offsetY = i * 4 + Math.floor((4 - pieceHeight) / 2);

            for (let y = 0; y < pieceHeight; y++) {
                for (let x = 0; x < pieceWidth; x++) {
                    if (pieceToRender[y][x] !== 0) {
                        drawBlock(
                            gameState.nextContext,
                            x + offsetX,
                            y + offsetY,
                            COLORS[pieceToRender[y][x]],
                            PREVIEW_BLOCK_SIZE
                        );
                    }
                }
            }
        }
    }
}

// Renderizar tablero de oponente
function renderOpponentBoard(playerId) {
    const player = gameState.otherPlayers[playerId];
    if (!player || !player.context) return;

    const board = player.board || createEmptyBoard();
    const blockSize = BLOCK_SIZE / 1.5; // Más pequeño que el principal

    // Limpiar canvas
    player.context.clearRect(0, 0,
        BOARD_WIDTH * blockSize,
        BOARD_HEIGHT * blockSize);

    // Dibujar tablero (en escala de grises)
    for (let y = 0; y < BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOARD_WIDTH; x++) {
            if (board[y][x] !== 0) {
                // Usar color gris para oponentes
                drawBlock(
                    player.context,
                    x,
                    y,
                    '#aaaaaa',
                    blockSize
                );
            }
        }
    }

    // Actualizar información de líneas
    if (document.getElementById(`lines-${playerId}`)) {
        document.getElementById(`lines-${playerId}`).textContent =
            `Líneas: ${player.linesCleared || 0}`;
    }
}

// Dibujar un bloque individual
function drawBlock(context, x, y, color, size) {
    // Dibujar el cuerpo del bloque
    context.fillStyle = color;
    context.fillRect(x * size, y * size, size, size);

    // Dibujar bordes para efecto 3D
    context.fillStyle = 'rgba(255, 255, 255, 0.5)';
    context.fillRect(x * size, y * size, size, size / 10);
    context.fillRect(x * size, y * size, size / 10, size);

    context.fillStyle = 'rgba(0, 0, 0, 0.3)';
    context.fillRect(x * size + size - size / 10, y * size, size / 10, size);
    context.fillRect(x * size, y * size + size - size / 10, size, size / 10);

    // Dibujar borde del bloque
    context.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    context.strokeRect(x * size, y * size, size, size);
}

// Renderizar una pieza
function renderPiece(context, piece, offsetX, offsetY, blockSize) {
    for (let y = 0; y < piece.length; y++) {
        for (let x = 0; x < piece[y].length; x++) {
            if (piece[y][x] !== 0) {
                drawBlock(
                    context,
                    x + offsetX,
                    y + offsetY,
                    COLORS[piece[y][x]],
                    blockSize
                );
            }
        }
    }
}

// ======== LÓGICA DEL JUEGO ========

// Obtener una pieza aleatoria
function getRandomPiece() {
    const pieceIndex = Math.floor(Math.random() * 7) + 1;
    return PIECES[pieceIndex];
}

// Comprobar colisión
function checkCollision(matrix, x, y) {
    for (let row = 0; row < matrix.length; row++) {
        for (let col = 0; col < matrix[row].length; col++) {
            if (matrix[row][col] !== 0) {
                const boardX = x + col;
                const boardY = y + row;

                // Comprobar si está fuera de los límites del tablero
                if (
                    boardX < 0 ||
                    boardX >= BOARD_WIDTH ||
                    boardY >= BOARD_HEIGHT ||
                    (boardY >= 0 && gameState.board[boardY][boardX] !== 0)
                ) {
                    return true;
                }
            }
        }
    }
    return false;
}

// Fusionar pieza con el tablero
function mergePiece() {
    const { matrix, x, y } = gameState.currentPiece;

    for (let row = 0; row < matrix.length; row++) {
        for (let col = 0; col < matrix[row].length; col++) {
            if (matrix[row][col] !== 0) {
                const boardY = y + row;

                // Si la fusión ocurre encima del tablero, es game over
                if (boardY < 0) {
                    gameOver();
                    return;
                }

                gameState.board[boardY][x + col] = matrix[row][col];
            }
        }
    }

    // Comprobar si hay líneas completas
    checkLines();

    // Enviar actualización del tablero a los demás jugadores
    sendBoardUpdate();

    // Preparar nueva pieza
    gameState.currentPiece.matrix = gameState.nextPiecesQueue.shift(); // Take the first piece from the queue
    gameState.currentPiece.x = Math.floor(BOARD_WIDTH / 2) - Math.floor(gameState.currentPiece.matrix[0].length / 2);
    gameState.currentPiece.y = 0;
    gameState.nextPiecesQueue.push(getRandomPiece()); // Add a new piece to the end of the queue

    // Comprobar si la nueva pieza colisiona inmediatamente (game over)
    if (checkCollision(gameState.currentPiece.matrix, gameState.currentPiece.x, gameState.currentPiece.y)) {
        gameOver();
    }

    // Renderizar próxima pieza
    renderNextPiece();
}

// Comprobar líneas completas
function checkLines() {
    let linesCleared = 0;

    for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
        let lineComplete = true;

        for (let x = 0; x < BOARD_WIDTH; x++) {
            if (gameState.board[y][x] === 0) {
                lineComplete = false;
                break;
            }
        }

        if (lineComplete) {
            // Eliminar línea
            gameState.board.splice(y, 1);
            // Añadir nueva línea en la parte superior
            gameState.board.unshift(Array(BOARD_WIDTH).fill(0));
            // Incrementar contador
            linesCleared++;
            // Volver a comprobar la misma fila
            y++;

            // Reproducir sonido de línea
            playAudio(audioFiles.lineClear);
        }
    }

    if (linesCleared > 0) {
        // Actualizar contador
        gameState.linesCleared += linesCleared;

        // Notificar al servidor
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'lineCleared',
                count: linesCleared
            }));
        }
    }
}

// Aplicar penalización (líneas de basura)
function applyPenalty(count) {
    for (let i = 0; i < count; i++) {
        // Subir todas las filas
        gameState.board.shift();

        // Crear línea de basura (con un hueco aleatorio)
        const gapPosition = Math.floor(Math.random() * BOARD_WIDTH);
        const newLine = Array(BOARD_WIDTH).fill(1);
        newLine[gapPosition] = 0;

        // Añadir línea de basura al final
        gameState.board.push(newLine);
    }

    // Comprobar si la pieza actual colisiona con la nueva situación
    if (checkCollision(gameState.currentPiece.matrix, gameState.currentPiece.x, gameState.currentPiece.y)) {
        // Mover la pieza hacia arriba hasta que no colisione
        gameState.currentPiece.y--;

        // Si sigue colisionando después de varios intentos, es game over
        if (gameState.currentPiece.y < -2) {
            gameOver();
        }
    }

    // Enviar actualización del tablero
    sendBoardUpdate();
}

// Rotar pieza
function rotatePiece() {
    if (!gameState.activePlayer || !gameState.currentPiece.matrix) return;

    const originalMatrix = gameState.currentPiece.matrix;

    // Crear matriz transpuesta
    const transposed = [];
    for (let i = 0; i < originalMatrix[0].length; i++) {
        transposed.push([]);
        for (let j = 0; j < originalMatrix.length; j++) {
            transposed[i].push(originalMatrix[j][i]);
        }
    }

    // Invertir filas para rotar 90 grados en sentido horario
    const rotated = transposed.map(row => [...row].reverse());

    // Comprobar si la rotación es válida
    const originalX = gameState.currentPiece.x;
    let newX = originalX;

    // Intentar diferentes posiciones X si hay colisión
    gameState.currentPiece.matrix = rotated;

    if (checkCollision(rotated, newX, gameState.currentPiece.y)) {
        // Intentar mover a la izquierda
        newX = originalX - 1;
        if (!checkCollision(rotated, newX, gameState.currentPiece.y)) {
            gameState.currentPiece.x = newX;
            playAudio(audioFiles.rotate);
            return;
        }

        // Intentar mover a la derecha
        newX = originalX + 1;
        if (!checkCollision(rotated, newX, gameState.currentPiece.y)) {
            gameState.currentPiece.x = newX;
            playAudio(audioFiles.rotate);
            return;
        }

        // Si ninguna posición funciona, volver a la original
        gameState.currentPiece.matrix = originalMatrix;
    } else {
        playAudio(audioFiles.rotate);
    }
}

// Mover pieza
function movePiece(direction) {
    if (!gameState.activePlayer) return;

    const newX = gameState.currentPiece.x + direction;

    if (!checkCollision(gameState.currentPiece.matrix, newX, gameState.currentPiece.y)) {
        gameState.currentPiece.x = newX;
        playAudio(audioFiles.move);
    }
}

// Dejar caer pieza un nivel
function dropPiece() {
    if (!gameState.activePlayer) return;

    const newY = gameState.currentPiece.y + 1;

    if (!checkCollision(gameState.currentPiece.matrix, gameState.currentPiece.x, newY)) {
        gameState.currentPiece.y = newY;
    } else {
        mergePiece();
    }

    gameState.dropCounter = 0;
}

// Caída instantánea
function hardDrop() {
    if (!gameState.activePlayer) return;

    while (!checkCollision(
        gameState.currentPiece.matrix,
        gameState.currentPiece.x,
        gameState.currentPiece.y + 1
    )) {
        gameState.currentPiece.y++;
    }

    mergePiece();
    gameState.dropCounter = 0;
}

// Game over
function gameOver() {
    gameState.activePlayer = false;

    // Reproducir sonido de game over
    playAudio(audioFiles.gameOver);

    // Mostrar overlay de game over
    showGameOver(true);

    // Notificar al servidor
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'gameOver'
        }));
    }
}

// Reiniciar juego
function resetGame() {
    // Crear un tablero completamente vacío
    gameState.board = createEmptyBoard();
    gameState.linesCleared = 0;
    gameState.dropCounter = 0;
    gameState.dropInterval = 1000;

    // Reiniciar piezas para asegurar una inicialización limpia
    gameState.currentPiece = {
        matrix: getRandomPiece(),
        x: Math.floor(BOARD_WIDTH / 2) - 1,
        y: 0
    };

    // Populate nextPiecesQueue with 3 new pieces
    gameState.nextPiecesQueue = [getRandomPiece(), getRandomPiece(), getRandomPiece()];

    // Forzar renderizado inicial
    renderBoard();
    renderNextPiece();

    // Reiniciar audio de fondo
    if (audioFiles.background.paused) {
        playAudio(audioFiles.background, true);
    }
}

// ======== FUNCIONES DE UI ========

// Mostrar overlay de game over
function showGameOver(isPlayer, playerId) {
    const id = isPlayer ? gameState.myPlayerId : playerId;
    const overlay = document.getElementById(`game-over-${id}`);

    if (overlay) {
        overlay.style.display = 'flex';
    }
}

// Ocultar overlay de game over
function hideGameOver(isPlayer, playerId) {
    const id = isPlayer ? gameState.myPlayerId : playerId;
    const overlay = document.getElementById(`game-over-${id}`);

    if (overlay) {
        overlay.style.display = 'none';
    }
}

// Actualizar mensaje de estado del juego
function updateGameStatus(message) {
    const statusElement = document.getElementById('gameStatus');
    statusElement.textContent = message;
}

// ======== FUNCIONES DE RED ========

// Enviar actualización del tablero
function sendBoardUpdate() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'boardUpdate',
            board: gameState.board
        }));
    }
}

// ======== FUNCIONES DE AUDIO ========

// Reproducir audio
function playAudio(audio, loop = false) {
    if (!audio) return;

    // Detener y reiniciar
    audio.pause();
    audio.currentTime = 0;

    // Configurar reproducción en bucle
    audio.loop = loop;

    // Intentar reproducir (manejo de política de autoplay)
    const playPromise = audio.play();

    if (playPromise !== undefined) {
        playPromise.catch(e => {
            // Si el autoplay está bloqueado, no mostrar error
            console.log('Reproducción de audio bloqueada por el navegador');
        });
    }
}

// ======== CONTROL DE TECLADO ========

// Manejar eventos de teclado
document.addEventListener('keydown', event => {
    if (!gameState.isRunning || !gameState.activePlayer) return;

    switch (event.key) {
        case 'ArrowLeft':
            movePiece(-1);
            break;
        case 'ArrowRight':
            movePiece(1);
            break;
        case 'ArrowUp':
            rotatePiece();
            break;
        case 'ArrowDown':
            dropPiece();
            break;
        case ' ':
            hardDrop();
            break;
    }
});

// ======== BUCLE PRINCIPAL DEL JUEGO ========

// Actualizar juego
function update(time = 0) {
    const deltaTime = time - gameState.lastTime;
    gameState.lastTime = time;

    if (gameState.isRunning && gameState.activePlayer) {
        // Caída automática
        gameState.dropCounter += deltaTime;
        if (gameState.dropCounter > gameState.dropInterval) {
            dropPiece();
        }
    }

    // Renderizar tablero si el contexto existe
    if (gameState.context) {
        renderBoard();
    }

    requestAnimationFrame(update);
}

// Iniciar bucle del juego
requestAnimationFrame(update);

// Iniciar audio al interactuar con la página
document.addEventListener('click', () => {
    // Intentar reproducir música de fondo si el juego está activo
    if (gameState.isRunning && gameState.activePlayer && audioFiles.background.paused) {
        playAudio(audioFiles.background, true);
    }
}, { once: true });