const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Раздаем твой HTML файл (убедись, что он лежит в папке public)
app.use(express.static(path.join(__dirname, 'public')));

// Хранилище комнат: 
// { 
//   "RoomName": { 
//      password: "123", 
//      players: [socketId1, socketId2],
//      settings: { mapSize: 4000, isIsland: false, maxPlayers: 4 }
//   } 
// }
const rooms = {};

// Вспомогательная функция для генерации безопасного списка комнат (без паролей)
function getPublicRoomList() {
    const list = [];
    for (let id in rooms) {
        const r = rooms[id];
        list.push({
            name: id,
            hasPass: !!r.password && r.password.length > 0, // true если пароль есть
            players: r.players.length,
            maxPlayers: r.settings ? r.settings.maxPlayers : 2,
            settings: r.settings || { mapSize: 3500, isIsland: false }
        });
    }
    return list;
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Отправляем счетчик онлайна всем
    io.emit('update_online', io.engine.clientsCount);

    // 1. Обработка запроса списка комнат
    socket.on('get_rooms', () => {
        socket.emit('update_room_list', getPublicRoomList());
    });

    // 2. Создание комнаты
    socket.on('create_room', (data) => {
        const { name, password, settings } = data;
        
        if (rooms[name]) {
            socket.emit('error_msg', 'Комната с таким именем уже существует!');
            return;
        }
        
        // Применяем настройки по умолчанию, если их нет
        const roomSettings = settings || { mapSize: 4000, isIsland: false, maxPlayers: 2 };

        rooms[name] = { 
            password, 
            players: [socket.id],
            settings: roomSettings
        };
        
        socket.join(name);
        
        // Создатель комнаты всегда получает роль 'player' (синие)
        socket.emit('room_joined', { side: 'player', roomName: name });
        console.log(`Room ${name} created by ${socket.id} [${roomSettings.isIsland ? 'ISLAND' : 'STD'}]`);

        // Обновляем список комнат у всех игроков в лобби
        io.emit('update_room_list', getPublicRoomList());
    });

    // 3. Подключение к комнате
    socket.on('join_room', ({ name, password }) => {
        const room = rooms[name];

        if (!room) {
            socket.emit('error_msg', 'Комната не найдена!');
            return;
        }
        if (room.password && room.password !== password) {
            socket.emit('error_msg', 'Неверный пароль!');
            return;
        }
        if (room.players.length >= (room.settings.maxPlayers || 2)) {
            socket.emit('error_msg', 'Комната переполнена!');
            return;
        }

        // Добавляем игрока
        room.players.push(socket.id);
        socket.join(name);

        // Раздача ролей: 1-й player, 2-й enemy, 3-й bot1 и т.д.
        const roles = ['player', 'enemy', 'bot1', 'bot2', 'bot3', 'bot4', 'bot5', 'bot6'];
        const myRole = roles[room.players.length - 1] || 'spectator';

        socket.emit('room_joined', { side: myRole, roomName: name });
        
        // Обновляем список (количество игроков изменилось)
        io.emit('update_room_list', getPublicRoomList());

        // Если в комнате теперь 2 или более игрока - отправляем сигнал старта
        // (Мы отправляем настройки, чтобы клиенты знали, какую карту грузить)
        if (room.players.length >= 2) {
             io.to(name).emit('start_game_signal', room.settings);
        }
        
        console.log(`User ${socket.id} joined room ${name} as ${myRole}`);
    });

    // 4. Пересылка игровых команд
    socket.on('gameCommand', (data) => {
        if (data.roomName) {
            // Отправляем всем в комнате, КРОМЕ отправителя
            socket.to(data.roomName).emit('remoteCommand', data);
        }
    });

    // 5. Отключение
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        io.emit('update_online', io.engine.clientsCount);

        // Ищем, в какой комнате был игрок
        for (const name in rooms) {
            const room = rooms[name];
            const idx = room.players.indexOf(socket.id);
            
            if (idx !== -1) {
                room.players.splice(idx, 1); // Удаляем игрока из списка
                
                // Если комната пуста - удаляем её
                if (room.players.length === 0) {
                    delete rooms[name];
                    console.log(`Room ${name} deleted (empty)`);
                } else {
                    // Если кто-то остался, сообщаем, что игрок вышел
                    io.to(name).emit('playerLeft');
                    // В текущей версии лучше удалить комнату, чтобы избежать рассинхрона, 
                    // так как игра 1 на 1 (или требует перезапуска)
                    delete rooms[name]; 
                }
                
                // Обновляем список комнат у всех
                io.emit('update_room_list', getPublicRoomList());
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

