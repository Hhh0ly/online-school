const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.RENDER ? path.join(__dirname, 'data') : 'D:\\school';
const JWT_SECRET = 'your_super_secret_jwt_key_123';

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- НАСТРОЙКА ПОЧТЫ (SMTP) ---
const transporter = nodemailer.createTransport({
    host: 'smtp.yandex.ru', // Для Mail.ru: smtp.mail.ru | Gmail: smtp.gmail.com
    port: 587,              // Порт 587 работает на Render без блокировок
    secure: false,          // false для порта 587 (STARTTLS)
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false // Предотвращает ошибки сертификатов
    }
});


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

// --- API ЭНДПОИНТЫ ---

// 1. Проверка статуса сервера
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', dir: DATA_DIR });
});

// 2. Регистрация
app.post('/api/register', async (req, res) => {
    try {
        const { email, password, role, name } = req.body;
        const users = readJson('users.json');

        if (users.find(u => u.email === email)) {
            return res.status(400).json({ success: false, message: 'Пользователь с таким email уже существует!' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationToken = crypto.randomBytes(32).toString('hex');

        const newUser = {
            id: 'user_' + Date.now(),
            email,
            password: hashedPassword,
            role: role || 'student',
            name: name || 'Пользователь',
            isVerified: false,
            verificationToken
        };

        users.push(newUser);
        writeJson('users.json', users);

        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        const verifyUrl = `${protocol}://${host}/api/verify-email?token=${verificationToken}`;

        const mailOptions = {
            from: '"Онлайн Школа" <ваш_email@yandex.ru>',
            to: email,
            subject: 'Подтверждение аккаунта в Онлайн-Школе',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Добро пожаловать в Онлайн-Школу!</h2>
                    <p>Здравствуйте, ${newUser.name}!</p>
                    <p>Для активации вашего аккаунта перейдите по ссылке ниже:</p>
                    <p><a href="${verifyUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Подтвердить Email</a></p>
                    <p>Или скопируйте ссылку: ${verifyUrl}</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'Регистрация прошла успешно! Проверьте вашу электронную почту для подтверждения аккаунта.' });
    } catch (error) {
        console.error('Ошибка при регистрации:', error);
        res.status(500).json({ success: false, message: 'Ошибка при отправке письма с активацией.' });
    }
});

// 3. Подтверждение Почты по токену
app.get('/api/verify-email', (req, res) => {
    const { token } = req.query;
    const users = readJson('users.json');

    const user = users.find(u => u.verificationToken === token);

    if (!user) {
        return res.status(400).send('<h2>Недействительный или устаревший токен активации.</h2>');
    }

    user.isVerified = true;
    delete user.verificationToken;
    writeJson('users.json', users);

    res.send(`
        <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
            <h1 style="color: #4CAF50;">Email успешно подтвержден! 🎉</h1>
            <p>Ваш аккаунт активирован. Теперь вы можете вернуться на сайт и войти.</p>
            <a href="/" style="font-size: 18px; color: #007bff;">Перейти на главный сайт</a>
        </div>
    `);
});

// 4. Вход по email и паролю
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const users = readJson('users.json');

        const user = users.find(u => u.email === email);

        if (!user) {
            return res.status(400).json({ success: false, message: 'Пользователь с таким Email не найден.' });
        }

        if (!user.isVerified) {
            return res.status(403).json({ success: false, message: 'Пожалуйста, подтвердите вашу почту перед входом!' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ success: false, message: 'Неверный пароль!' });
        }

        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            message: 'Успешный вход!',
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Ошибка сервера при входе.' });
    }
});

// 5. Запись на урок
app.get('/api/bookings', (req, res) => {
    res.json(readJson('bookings.json'));
});

app.post('/api/bookings', (req, res) => {
    const bookings = readJson('bookings.json');
    const newBooking = { ...req.body, id: 'book_' + Date.now(), createdAt: new Date().toISOString() };
    bookings.push(newBooking);
    writeJson('bookings.json', bookings);
    res.json({ success: true, booking: newBooking, message: 'Запись успешно сохранена!' });
});

// Отдача файла index.html для всех остальных запросов (Совместимо с Express 5)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📁 Данные сохраняются в: ${DATA_DIR}`);
    console.log(`===================================================`);
});
