const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

// В облаке Render порт выдается автоматически через process.env.PORT,
// а локально на компьютере будет использоваться 3000
const PORT = process.env.PORT || 3000;

// В облаке нет диска D:\, поэтому автоматически определяем папку хранения:
// Если сервер запущен на Render — создаем папку 'data' внутри проекта.
// Если локально на ПК — используем D:\school.
const DATA_DIR = process.env.RENDER ? path.join(__dirname, 'data') : 'D:\\school';

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

function readJson(filename, defaultValue = []) {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf-8');
        return defaultValue;
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
        return defaultValue;
    }
}

function writeJson(filename, data) {
    const filePath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// API Эндпоинты
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', dir: DATA_DIR });
});

app.post('/api/users', (req, res) => {
    const users = readJson('users.json');
    users.push({ ...req.body, id: Date.now().toString() });
    writeJson('users.json', users);
    res.json({ success: true, message: 'Пользователь сохранен' });
});

app.get('/api/bookings', (req, res) => {
    res.json(readJson('bookings.json'));
});

app.post('/api/bookings', (req, res) => {
    const bookings = readJson('bookings.json');
    const newBooking = { ...req.body, id: 'book_' + Date.now(), createdAt: new Date().toISOString() };
    bookings.push(newBooking);
    writeJson('bookings.json', bookings);
    res.json({ success: true, booking: newBooking, message: 'Запись сохранена' });
});

// Отдача файла index.html для всех остальной запросов
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📁 Данные записываются в: ${DATA_DIR}`);
    console.log(`===================================================`);
});
