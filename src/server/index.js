const WebSocket = require('ws');
const server = new WebSocket.Server({
  port: 8080,
});

let sockets = [];
server.on('connection', function (socket) {
  sockets.push(socket);
  // When you receive a message, send that message to every socket.
  socket.on('message', function (msg) {
    console.log('Received new Message tyoe of ', JSON.parse(msg).type);
    sockets.forEach((s) => s !== socket && s.send(msg));
  });

  // When a socket closes, or disconnects, remove it from the array.
  socket.on('close', function () {
    sockets = sockets.filter((s) => s !== socket);
  });
});
