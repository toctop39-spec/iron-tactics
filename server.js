const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Раздаем твой HTML файл (назови его index.html)
app.use(express.static(path.join(__dirname, 'public')));

// Хранилище комнат: { "RoomName": { password: "123", players: [socketId1, socketId2] } }
const rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 1. Создание комнаты
    socket.on('create_room', ({ name, password }) => {
        if (rooms[name]) {
            socket.emit('error_msg', 'Комната с таким именем уже существует!');
            return;
        }
        
        // Создаем комнату
        rooms[name] = { password, players: [socket.id] };
        socket.join(name);
        
        // Назначаем игрока "Хостом" (Player)
        socket.emit('room_created', { side: 'player', roomName: name });
        console.log(`Room ${name} created by ${socket.id}`);
    });

    // 2. Подключение к комнате
    socket.on('join_room', ({ name, password }) => {
        const room = rooms[name];

        if (!room) {
            socket.emit('error_msg', 'Комната не найдена!');
            return;
        }
        if (room.password !== password) {
            socket.emit('error_msg', 'Неверный пароль!');
            return;
        }
        if (room.players.length >= 2) {
            socket.emit('error_msg', 'Комната переполнена!');
            return;
        }

        // Добавляем второго игрока
        room.players.push(socket.id);
        socket.join(name);

        // Назначаем игрока "Гостем" (Enemy)
        socket.emit('room_joined', { side: 'enemy', roomName: name });
        
        // Сообщаем обоим, что игра начинается
        io.to(name).emit('start_game_signal');
        console.log(`User ${socket.id} joined room ${name}`);
    });

    // 3. Пересылка игровых команд (ТОЛЬКО внутри комнаты)
    socket.on('gameCommand', (data) => {
        // data должна содержать roomName, чтобы знать, куда слать
        if (data.roomName) {
            // Отправляем всем в комнате, КРОМЕ отправителя
            socket.to(data.roomName).emit('remoteCommand', data);
        }
    });

    // 4. Отключение
    socket.on('disconnect', () => {
        // Ищем, в какой комнате был игрок и удаляем её или игрока
        for (const name in rooms) {
            const room = rooms[name];
            if (room.players.includes(socket.id)) {
                io.to(name).emit('playerLeft'); // Сообщаем сопернику
                delete rooms[name]; // Удаляем комнату (простая логика)
                break;
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
