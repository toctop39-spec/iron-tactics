const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const path = require("path");

app.use(express.static(path.join(__dirname, "public")));

const rooms = {};

io.on("connection", (socket) => {
  socket.on("create_room", ({ name, password }) => {
    if (rooms[name]) return socket.emit("error_msg", "Имя занято!");
    rooms[name] = { password, players: [socket.id] };
    socket.join(name);
    socket.emit("room_created", { side: "player", roomName: name });
  });

  socket.on("join_room", ({ name, password }) => {
    const room = rooms[name];
    if (!room || room.password !== password || room.players.length >= 2) {
      return socket.emit("error_msg", "Ошибка входа!");
    }
    room.players.push(socket.id);
    socket.join(name);
    socket.emit("room_joined", { side: "enemy", roomName: name });
    io.to(name).emit("start_game_signal");
  });

  socket.on("gameCommand", (data) => {
    if (data.roomName) socket.to(data.roomName).emit("remoteCommand", data);
  });
  
  socket.on("disconnect", () => {
    for (const n in rooms) {
      if (rooms[n].players.includes(socket.id)) {
        io.to(n).emit("playerLeft");
        delete rooms[n];
      }
    }
  });
});

http.listen(process.env.PORT || 3000);
