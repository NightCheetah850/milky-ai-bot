const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Konfigurasi
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyC8J1MT_Ow8VLFqhBexKDPqg8Z4tC2qBC8';

// Inisialisasi bot dan AI
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Simpan riwayat percakapan (untuk sementara, di production sebaiknya gunakan database)
const chatSessions = new Map();

// Handler perintah /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `🤖 *Halo! Saya Milky AI*

Bot AI yang powered oleh Google Gemini. Saya bisa membantu Anda dengan:

• Berbicara tentang berbagai topik
• Menjawab pertanyaan kompleks
• Membantu mencarikan informasi

*Fitur Inline Mode*:
Ketik @${bot.options.username} [pertanyaan] di chat mana pun untuk menggunakan saya secara inline!

Coba ketik pesan atau gunakan perintah /help untuk bantuan.`;

  await bot.sendMessage(chatId, welcomeMessage, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Coba Inline Mode', switch_inline_query: '' }],
        [{ text: 'Bantuan', callback_data: 'help' }]
      ]
    }
  });
});

// Handler perintah /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `*📋 Bantuan Milky AI*

*Perintah yang tersedia:*
/start - Memulai bot
/help - Menampilkan bantuan ini
/newtopic - Memulai topik percakapan baru

*Cara menggunakan inline mode:*
1. Ketik @${bot.options.username} di chat mana pun
2. Ketik pertanyaan Anda
3. Pilih hasil dari saran yang muncul

Bot ini menggunakan Google Gemini AI untuk memberikan respons yang inteligens.`;

  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// Handler perintah /newtopic
bot.onText(/\/newtopic/, (msg) => {
  const chatId = msg.chat.id;
  if (chatSessions.has(chatId)) {
    chatSessions.delete(chatId);
  }
  bot.sendMessage(chatId, '🆕 *Percakapan baru dimulai!* \nRiwayat percakapan sebelumnya telah dihapus.', {
    parse_mode: 'Markdown'
  });
});

// Handler untuk pesan teks reguler
bot.on('message', async (msg) => {
  // Abaikan pesan non-teks dan perintah
  if (!msg.text || msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  
  try {
    // Kirim indikator mengetik
    await bot.sendChatAction(chatId, 'typing');

    // Generate respons dari Gemini AI[citation:7]
    const result = await model.generateContent(msg.text);
    const response = await result.response;
    const aiResponse = response.text();

    // Batasi panjang pesan (Telegram limit adalah 4096 karakter)
    const message = aiResponse.length > 4096 ? aiResponse.substring(0, 4093) + '...' : aiResponse;

    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_to_message_id: msg.message_id
    });

  } catch (error) {
    console.error('Error:', error);
    await bot.sendMessage(chatId, '❌ *Maaf, terjadi kesalahan saat memproses permintaan Anda.*\nSilakan coba lagi dalam beberapa saat.', {
      parse_mode: 'Markdown'
    });
  }
});

// Handler untuk inline query[citation:2]
bot.on('inline_query', async (inlineQuery) => {
  const query = inlineQuery.query;
  
  // Jika query kosong, berikan pesan default
  if (!query.trim()) {
    const defaultResult = [{
      type: 'article',
      id: '1',
      title: 'Tanya Milky AI',
      input_message_content: {
        message_text: '🤖 *Milky AI siap membantu!*\n\nKetik pertanyaan Anda setelah memilih opsi ini...',
        parse_mode: 'Markdown'
      },
      description: 'Klik untuk bertanya pada Milky AI',
      reply_markup: {
        inline_keyboard: [[{ text: 'Mulai Chat', url: `https://t.me/${bot.options.username}` }]]
      }
    }];

    return bot.answerInlineQuery(inlineQuery.id, defaultResult, { cache_time: 1 });
  }

  try {
    // Generate respons dari Gemini AI untuk inline query
    const result = await model.generateContent(query);
    const response = await result.response;
    const aiResponse = response.text();

    // Siapkan hasil inline (potong jika terlalu panjang)
    const truncatedResponse = aiResponse.length > 200 ? 
      aiResponse.substring(0, 197) + '...' : aiResponse;

    const results = [{
      type: 'article',
      id: Date.now().toString(),
      title: `Q: ${query.length > 30 ? query.substring(0, 27) + '...' : query}`,
      input_message_content: {
        message_text: `*🤖 Milky AI:*\n${truncatedResponse}\n\n*Pertanyaan:* ${query}`,
        parse_mode: 'Markdown'
      },
      description: truncatedResponse,
      reply_markup: {
        inline_keyboard: [[
          { text: 'Tanya Lagi', switch_inline_query_current_chat: '' },
          { text: 'Chat Pribadi', url: `https://t.me/${bot.options.username}?start=inline` }
        ]]
      }
    }];

    await bot.answerInlineQuery(inlineQuery.id, results, { 
      cache_time: 10,
      is_personal: true
    });

  } catch (error) {
    console.error('Inline query error:', error);
    
    const errorResult = [{
      type: 'article',
      id: 'error',
      title: 'Error - Coba lagi',
      input_message_content: {
        message_text: '❌ Terjadi kesalahan saat memproses permintaan. Silakan coba lagi.',
        parse_mode: 'Markdown'
      },
      description: 'Klik untuk mencoba lagi'
    }];

    await bot.answerInlineQuery(inlineQuery.id, errorResult, { cache_time: 1 });
  }
});

// Handler untuk callback queries (tombol inline)[citation:8]
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const data = callbackQuery.data;

  if (data === 'help') {
    await bot.editMessageText(`*🆘 Bantuan Cepat*\n\nGunakan inline mode dengan mengetik:\n@${bot.options.username} [pertanyaan]\n\nContoh:\n@${bot.options.username} jelaskan tentang AI`, {
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: 'Markdown'
    });
  }

  // Ack the callback query
  await bot.answerCallbackQuery(callbackQuery.id);
});

// Handler error
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

bot.on('error', (error) => {
  console.error('Bot error:', error);
});

console.log('🤖 Milky AI bot started...');
