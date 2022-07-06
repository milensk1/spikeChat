const path = require("path");
const http = require("http");
const express = require("express");
const mongo = require("mongodb").MongoClient;
const socketio = require("socket.io");
const formatMessage = require("./utils/messages");
require("dotenv").config();
const {
  userJoin,
  getCurrentUser,
  userLeave,
  getRoomUsers,
} = require("./utils/users");

const app = express();
const server = http.createServer(app);
const io = socketio(server);
const botName = "SpikeChat Bot";
const PORT = process.env.PORT || 3000;

// Set static folder
app.use(express.static(path.join(__dirname, "app")));

mongo.connect("mongodb://127.0.0.1/spikeChat", function (err, db) {
  if (err) {
    throw err;
  }

  // Run when client connects
  io.on("connection", (socket) => {
    let chat = db.collection("chats");

    socket.on("joinRoom", ({ username, room }) => {
      const user = userJoin(socket.id, username, room);
      socket.join(user.room);

      // Get chats from mongo collection
      chat
        .find()
        .limit(100)
        .sort({ _id: 1 })
        .toArray(function (err, messages) {
          if (err) {
            throw err;
          }

          // Emit the messages
          for (const message of messages) {
            socket.emit("message", message);
          }

          // Welcome current user
          socket.emit(
            "message",
            formatMessage(botName, "Welcome to SpikeChat!")
          );
        });

      // Broadcast when a user connects
      const formattedMessage = formatMessage(
        botName,
        `${user.username} has joined the chat`
      );
      chat.insert(formattedMessage, () => {
        socket.broadcast.to(user.room).emit("message", formattedMessage);
      });

      // Send users and room info
      io.to(user.room).emit("roomUsers", {
        room: user.room,
        users: getRoomUsers(user.room),
      });
    });

    // Listen for chatMessage
    socket.on("chatMessage", (msg) => {
      const user = getCurrentUser(socket.id);

      // Insert message
      const formattedMessage = formatMessage(user.username, msg);
      chat.insert(formattedMessage, () => {
        io.to(user.room).emit("message", formattedMessage);
      });
    });

    // Runs when client disconnects
    socket.on("disconnect", () => {
      const user = userLeave(socket.id);

      if (user) {
        // Insert message
        const formattedMessage = formatMessage(
          botName,
          `${user.username} has left the chat`
        );
        chat.insert(formattedMessage, () => {
          io.to(user.room).emit("message", formattedMessage);
        });

        // Send users and room info
        io.to(user.room).emit("roomUsers", {
          room: user.room,
          users: getRoomUsers(user.room),
        });
      }
    });
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
