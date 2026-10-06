const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

const rooms = {};

io.on('connection', (socket) => {
    // Создание комнаты
    socket.on('createRoom', ({ avatar, name }) => {
        const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        rooms[roomId] = {
            hostId: socket.id,
            guestId: null,
            hostAvatar: avatar || '🐰',
            hostName: name || 'Игрок 1',
            guestAvatar: '🦊',
            guestName: 'Игрок 2',
            proposal: null,
            selectedImage: null,
            drawings: [null, null]
        };
        socket.join(roomId);
        socket.emit('roomCreated', roomId);
    });

    // Подключение к комнате
    socket.on('joinRoom', ({ roomId, avatar, name }) => {
        const room = rooms[roomId];
        if (!room) return socket.emit('error', 'Комната не найдена');
        if (room.guestId) return socket.emit('error', 'В комнате уже 2 игрока');
        if (room.hostId === socket.id) return socket.emit('error', 'Вы уже в комнате');

        room.guestId = socket.id;
        room.guestAvatar = avatar || '🦊';
        room.guestName = name || 'Игрок 2';
        socket.join(roomId);

        io.to(room.hostId).emit('youAre', {
            role: 'host', roomId,
            myAvatar: room.hostAvatar, myName: room.hostName,
            partnerAvatar: room.guestAvatar, partnerName: room.guestName
        });
        io.to(room.guestId).emit('youAre', {
            role: 'guest', roomId,
            myAvatar: room.guestAvatar, myName: room.guestName,
            partnerAvatar: room.hostAvatar, partnerName: room.hostName
        });
    });

    // Игрок предложил картинку — рассылаем всем
    socket.on('proposeImage', ({ roomId, imageIndex, by }) => {
        const room = rooms[roomId];
        if (!room) return;
        room.proposal = { by, imageIndex };
        io.to(roomId).emit('imageProposed', { by, imageIndex });
    });

    // Игрок подтвердил — старт сразу
    socket.on('acceptImage', ({ roomId, imageIndex }) => {
        const room = rooms[roomId];
        if (!room) return;
        room.selectedImage = imageIndex;
        io.to(room.hostId).emit('startDrawing', { imageIndex, playerIndex: 0 });
        io.to(room.guestId).emit('startDrawing', { imageIndex, playerIndex: 1 });
    });

    // Заливка
    socket.on('fillData', ({ roomId, playerIndex, data }) => {
        if (rooms[roomId]) socket.to(roomId).emit('applyFill', { playerIndex, data });
    });

    // Отмена
    socket.on('undoData', ({ roomId, playerIndex }) => {
        if (rooms[roomId]) socket.to(roomId).emit('applyUndo', { playerIndex });
    });

    // Сброс половины
    socket.on('resetData', ({ roomId, playerIndex }) => {
        if (rooms[roomId]) socket.to(roomId).emit('applyReset', { playerIndex });
    });

    // Реакции
    socket.on('reaction', ({ roomId, emoji, avatar, name }) => {
        if (rooms[roomId]) socket.to(roomId).emit('showReaction', { emoji, avatar, name });
    });

    // Комментарии
    socket.on('comment', ({ roomId, text, avatar, name }) => {
        if (rooms[roomId]) socket.to(roomId).emit('showComment', { text, avatar, name });
    });

    // Уведомление "Готово"
    socket.on('notifyFinished', ({ roomId, playerIndex, name, avatar }) => {
        if (rooms[roomId]) socket.to(roomId).emit('partnerFinished', { playerIndex, name, avatar });
    });

    // Завершение рисования
    socket.on('finishDrawing', ({ roomId, playerIndex, imageData }) => {
        const room = rooms[roomId];
        if (!room) return;
        room.drawings[playerIndex] = imageData;
        if (room.drawings[0] && room.drawings[1]) {
            io.to(roomId).emit('mergeImages', room.drawings);
            delete rooms[roomId];
        }
    });

    // Отключение
    socket.on('disconnect', () => {
        for (const id in rooms) {
            const room = rooms[id];
            if (room.hostId === socket.id || room.guestId === socket.id) {
                io.to(id).emit('partnerLeft');
                delete rooms[id];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));