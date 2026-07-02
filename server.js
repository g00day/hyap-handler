import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch'; // Убедитесь, что node-fetch установлен

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
// 4. Защищенный эндпоинт отправки заявок в Telegram
// ==========================================================================
app.post('/api/send-lead', authenticateRequest, async (req, res) => {
    console.log("==> ПОЛУЧЕНА ЗАЯВКА С ФРОНТЕНДА:", req.body);

    const { name, phone, car, comment } = req.body;

    // Базовая валидация на наличие обязательных полей
    if (!name || !phone) {
        console.log("❌ Отклонено: в теле запроса нет имени или телефона");
        return res.status(400).json({ error: 'Имя и телефон обязательны для заполнения.' });
    }

    // Формируем аккуратный и красивый текст сообщения с Markdown-разметкой
    const messageText = `
🔥 *Новая заявка с сайта HYAP.COM!*

👤 *Имя клиента:* ${name}
📞 *Телефон:* ${phone}
${car ? `🚗 *Автомобиль:* ${car}` : ''}
${comment ? `💬 *Комментарий:* ${comment}` : ''}
    `.trim();

    // Официальное прокси-зеркало для стабильного прохождения трафика без таймаутов
    const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`;

    try {
        console.log("⏳ Отправка запроса к Telegram API...");
        
        const response = await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: process.env.TELEGRAM_CHAT_ID,
                text: messageText,
                parse_mode: 'Markdown' // Включает жирный шрифт для звездочек *
            })
        });

        const data = await response.json();

        if (response.ok) {
            console.log("✅ Заявка успешно доставлена в Telegram чат!");
            return res.status(200).json({ success: true, message: 'Заявка успешно отправлена.' });
        } else {
            console.error('❌ Ошибка Telegram API:', data);
            return res.status(502).json({ error: `Telegram API вернул ошибку: ${data.description}` });
        }
    } catch (error) {
        console.error('❌ КРИТИЧЕСКАЯ ОШИБКА НА СЕРВЕРЕ ПРИ ОТПРАВКЕ:', error.message);
        return res.status(500).json({ error: `Внутренняя ошибка сервера: ${error.message}` });
    }
});

// Базовый эндпоинт для проверки работоспособности (Health Check)
app.get('/', (req, res) => {
    res.send('Бэкенд HYAP.COM успешно запущен и переведен на Telegram шлюз.');
});

// ==========================================================================
// 5. Запуск сервера
// ==========================================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Защищенный Telegram-бэкенд запущен на порту ${PORT}`);
});