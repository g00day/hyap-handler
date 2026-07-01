import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

const app = express();

// Разрешаем массив доменов
const allowedOrigins = ['http://hyap.com', 'https://hyap.com', 'http://xn--80azkk.com', 'https://xn--80azkk.com'];

const corsOptions = {
    origin: function (origin, callback) {
        // Разрешаем запросы без origin (например, Postman) или если домен есть в массиве
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Блокировка CORS: данный домен не поддерживается.'));
        }
    },
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Middleware для проверки секретного Bearer-токена в заголовках
const authenticateRequest = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Доступ запрещен. Отсутствует токен авторизации.' });
    }

    const token = authHeader.split(' ')[1];
    
    if (token !== process.env.API_SECRET_KEY) {
        return res.status(403).json({ error: 'Неверный токен авторизации.' });
    }

    next();
};

// Конфигурация SMTP транспорта для Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail', // Добавляем эту строчку, чтобы Nodemailer сам применил нужные SSL/TLS флаги для Google
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: true, // true для порта 465
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS 
    }
});


// Защищенный эндпоинт для приема заявок
app.post('/api/send-lead', authenticateRequest, async (req, res) => {
    const { name, phone, car, comment } = req.body; // Принимаем все возможные поля из форм

    if (!name || !phone) {
        return res.status(400).json({ error: 'Имя и телефон обязательны для заполнения.' });
    }

    // Оформляем красивое HTML-письмо для почты
    const htmlTemplate = `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9f9f9; border: 1px solid #ddd;">
            <h2 style="color: #141414; border-bottom: 2px solid #141414; padding-bottom: 10px;">
                🔥 Новая заявка на детейлинг (HYAP.COM)
            </h2>
            <p style="font-size: 14px;"><strong>Имя клиента:</strong> ${name}</p>
            <p style="font-size: 14px;"><strong>Телефон:</strong> ${phone}</p>
            ${car ? `<p style="font-size: 14px;"><strong>Автомобиль:</strong> ${car}</p>` : ''}
            ${comment ? `<p style="font-size: 14px;"><strong>Комментарий:</strong> ${comment}</p>` : ''}
            <br />
        </div>
    `;

    const mailOptions = {
        from: `"Робот HYAP" <${process.env.SMTP_USER}>`, // От кого (ваш ящик авторизации)
        to: process.env.EMAIL_TO, // Кому присылать уведомление
        subject: `Новая заявка: ${name} (${phone})`, // Тема письма
        html: htmlTemplate // Тело письма в формате HTML
    };

    try {
        // Отправка по SMTP протоколу
        await transporter.sendMail(mailOptions);
        return res.status(200).json({ success: true, message: 'Заявка успешно отправлена на почту.' });
    } catch (error) {
        console.error('Ошибка Nodemailer SMTP:', error);
        return res.status(502).json({ error: 'Не удалось отправить письмо по SMTP.' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Защищенный SMTP-бэкенд запущен на порту ${PORT}`);
});