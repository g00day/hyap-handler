import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

const app = express();

// ==========================================================================
// 1. Настройка CORS (Разрешаем запросы с обоих вариантов вашего домена)
// ==========================================================================
const allowedOrigins = [
    'http://hyap.com', 
    'https://hyap.com', 
    'http://xn--80azkk.com', 
    'https://xn--80azkk.com'
];

const corsOptions = {
    origin: function (origin, callback) {
        // Разрешаем запросы без origin (например, локальный Postman) или если домен есть в массиве
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log(`❌ Блокировка CORS для домена: ${origin}`);
            callback(new Error('Блокировка CORS: данный домен не поддерживается сервером.'));
        }
    },
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// ==========================================================================
// 2. Парсер JSON (Обязательно должен стоять ВЫШЕ всех эндпоинтов app.post)
// ==========================================================================
app.use(express.json());

// ==========================================================================
// 3. Middleware для проверки секретного Bearer-токена авторизации
// ==========================================================================
const authenticateRequest = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log("❌ Отклонено: отсутствует токен авторизации в headers");
        return res.status(401).json({ error: 'Доступ запрещен. Отсутствует токен авторизации.' });
    }

    const token = authHeader.split(' ')[1]; // Получаем сам токен после слова Bearer
    
    if (token !== process.env.API_SECRET_KEY) {
        console.log("❌ Отклонено: неверный секретный API-ключ");
        return res.status(403).json({ error: 'Неверный токен авторизации.' });
    }

    next(); // Если проверка пройдена, передаем запрос к эндпоинту
};

// ==========================================================================
// 4. Конфигурация SMTP транспорта Nodemailer под Gmail
// ==========================================================================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'), // Используем 587 порт
    secure: false, // На порту 587 secure ОБЯЗАТЕЛЬНО должно быть false
    tls: {
        rejectUnauthorized: false, // Игнорируем возможные проблемы с SSL-сертификатами хостинга
        ciphers: 'SSLv3'
    },
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS 
    }
});
// На всякий случай проверяем SMTP-подключение при старте сервера
transporter.verify((error, success) => {
    if (error) {
        console.error('❌ ОШИБКА НАСТРОЙКИ SMTP (GMAIL):', error.message);
    } else {
        console.log('✅ SMTP-сервер Gmail успешно готов к отправке писем');
    }
});

// ==========================================================================
// 5. Защищенный эндпоинт отправки заявок
// ==========================================================================
app.post('/api/send-lead', authenticateRequest, async (req, res) => {
    console.log("==> ПОЛУЧЕНА ЗАЯВКА С ФРОНТЕНДА:", req.body);

    const { name, phone, car, comment } = req.body;

    // Базовая валидация на наличие обязательных полей
    if (!name || !phone) {
        console.log("❌ Отклонено: в теле запроса нет имени или телефона");
        return res.status(400).json({ error: 'Имя и телефон обязательны для заполнения.' });
    }

    // Красивый HTML-шаблон для вывода на вашей почте
    const htmlTemplate = `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9f9f9; border: 1px solid #ddd; max-width: 600px; margin: 0 auto; border-radius: 4px;">
            <h2 style="color: #141414; border-bottom: 2px solid #141414; padding-bottom: 10px; margin-top: 0;">
                🔥 Новая заявка на детейлинг (HYAP.COM)
            </h2>
            <p style="font-size: 15px; margin: 10px 0;"><strong>Имя клиента:</strong> ${name}</p>
            <p style="font-size: 15px; margin: 10px 0;"><strong>Телефон:</strong> ${phone}</p>
            ${car ? `<p style="font-size: 15px; margin: 10px 0;"><strong>Автомобиль:</strong> ${car}</p>` : ''}
            ${comment ? `<p style="font-size: 15px; margin: 10px 0;"><strong>Комментарий:</strong> ${comment}</p>` : ''}
            <br />
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
            <span style="font-size: 11px; color: #999;">Сообщение сгенерировано автоматически защищенным бэкендом.</span>
        </div>
    `;

    const mailOptions = {
        from: `"Робот HYAP" <${process.env.SMTP_USER}>`, // От кого (ваш ящик Gmail)
        to: process.env.EMAIL_TO, // Кому присылать уведомления
        subject: `Новая заявка: ${name} (${phone})`,
        html: htmlTemplate
    };

    try {
        console.log("⏳ Отправка письма по SMTP на Gmail...");
        
        // Отправляем письмо
        let info = await transporter.sendMail(mailOptions);
        
        console.log("✅ Письмо успешно отправлено! ID:", info.messageId);
        return res.status(200).json({ success: true, message: 'Заявка успешно отправлена на почту.' });
    } catch (error) {
        console.error('❌ КРИТИЧЕСКАЯ ОШИБКА SMTP ПРИ ОТПРАВКЕ ПИСЬМА:', error.message);
        return res.status(502).json({ error: `Не удалось отправить письмо по SMTP: ${error.message}` });
    }
});

// Базовый эндпоинт для проверки работоспособности в браузере (Health Check)
app.get('/', (req, res) => {
    res.send('Бэкенд HYAP.COM успешно запущен и работает в штатном режиме.');
});

// ==========================================================================
// 6. Запуск сервера
// ==========================================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Защищенный SMTP-бэкенд запущен на порту ${PORT}`);
});
