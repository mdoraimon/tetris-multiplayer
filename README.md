# Tetris Multijugador Web

Juego multijugador de Tetris jugable desde navegadores web en una red local, con lógica de juego clásica, sincronización en tiempo real entre jugadores, y funciones avanzadas como efectos sonoros, música de fondo y penalizaciones entre jugadores.

## Características

- Lógica completa de Tetris con todas las piezas clásicas
- Multijugador en red local mediante WebSockets
- Sistema de lobby y sala de espera
- Penalizaciones entre jugadores al completar líneas
- Efectos sonoros y música de fondo
- Reinicio automático de partidas

## Tecnologías utilizadas

- Frontend: HTML5, JavaScript, Canvas API
- Backend: Node.js con Express y WebSockets
- Red: Comunicación en tiempo real mediante WebSockets

## Cómo ejecutar

1. Clona este repositorio
2. Ejecuta `npm install` para instalar dependencias
3. Ejecuta `npm start` para iniciar el servidor
4. Abre un navegador y accede a `http://localhost:8080`
5. Para jugar en red local, otros jugadores pueden acceder usando la IP de tu computadora

## Controles

- ⬅️ ➡️: Mover horizontalmente
- ⬆️: Rotar pieza
- ⬇️: Caída rápida
- Espacio: Caída instantánea