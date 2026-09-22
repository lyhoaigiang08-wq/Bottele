const express = require('express');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

// =========================================================================
// CẤU HÌNH THÔNG TIN BOT & SERVER
// (Thay Token và Chat ID của bạn vào 2 dòng dưới đây)
// =========================================================================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '8717574767:AAHicQcRqa6ZK3ESyXJN6ZGTh6BKtzm7a88';
const CHAT_ID = process.env.CHAT_ID || '8363651531';
const PORT = process.env.PORT || 3009;

// Khởi tạo Telegram Bot (sử dụng polling để lắng nghe lệnh)
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const app = express();

// Bộ nhớ tạm lưu trạng thái lịch sử
let history = []; // Lưu 20 phiên gần nhất
let lastPhien = null;

// Hàm hỗ trợ định dạng thời gian UTC+7
function getCurrentTimeUTC7() {
  const now = new Date();
  const offset = 7;
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const localTime = new Date(utc + (3600000 * offset));
  const day = String(localTime.getDate()).padStart(2, '0');
  const month = String(localTime.getMonth() + 1).padStart(2, '0');
  const hours = String(localTime.getHours()).padStart(2, '0');
  const minutes = String(localTime.getMinutes()).padStart(2, '0');
  const seconds = String(localTime.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds} - ${day}/${month}`;
}

// Thuật toán AI Phân Tích & Dự Đoán Thế Cầu
function runAIPrediction(hist) {
  if (hist.length < 3) return null;

  const simpleHist = hist.map(h => h.res);
  const last3 = simpleHist.slice(-3).join('');
  const last2 = simpleHist.slice(-2).join('');

  let prediction = 'TÀI';
  let confidence = 50;
  let pattern = 'Cầu Tự Do (Thống kê)';

  if (last3 === 'TTT' || last3 === 'XXX') {
    pattern = 'Cầu Bệt Trường Kỳ';
    prediction = last3[0] === 'T' ? 'TÀI' : 'XỈU';
    confidence = 85;
  } else if (last3 === 'TXT' || last3 === 'XTX') {
    pattern = 'Cầu Nhịp Đảo 1-1';
    prediction = last3[2] === 'T' ? 'XỈU' : 'TÀI';
    confidence = 88;
  } else if (last2 === 'TT' || last2 === 'XX') {
    pattern = 'Cầu Đôi 2-2 / Bệt Nhẹ';
    prediction = last2[1] === 'T' ? 'TÀI' : 'XỈU';
    confidence = 72;
  } else {
    const taiCount = simpleHist.filter(x => x === 'T').length;
    prediction = taiCount < (simpleHist.length - taiCount) ? 'TÀI' : 'XỈU';
    confidence = Math.floor(60 + Math.random() * 15);
    pattern = 'Cầu Cân Bằng Tần Suất';
  }

  return { prediction, confidence, pattern };
}

// Hàm quét dữ liệu API LC79 Realtime
async function checkLC79() {
  try {
    const response = await axios.get('https://wtxmd52.tele68.com/v1/txmd5/sessions'); // Source từ lcapi.js
    const data = response.data;
    let sessions = data.list || data;
    
    if (!Array.isArray(sessions) || sessions.length === 0) return;

    // Sắp xếp phiên từ mới nhất đến cũ nhất
    sessions.sort((a, b) => b.id - a.id);
    const latest = sessions[0];
    
    const phien = latest.id || latest._id;
    const tong = latest.point || 0;
    const xucXac = latest.dices || [0, 0, 0];
    const resChar = (tong >= 11) ? 'T' : 'X';

    // Phát hiện khi bàn cược ra phiên mới
    if (lastPhien !== phien) {
      lastPhien = phien;

      // Cập nhật mảng lịch sử (tối đa 20 phiên)
      history.push({ phien, tong, res: resChar, xucXac });
      if (history.length > 20) history.shift();

      // Chạy thuật toán AI soi cầu phiên tiếp theo
      const ai = runAIPrediction(history);

      // Định dạng tin nhắn gửi đến Telegram
      const msg = `
🤖 <b>CYBERPREDICT AI - LC79 MD5</b>
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
📌 <b>Kết Quả Phiên #${phien}:</b>
• Xúc xắc: <code>[ ${xucXac[0]} - ${xucXac[1]} - ${xucXac[2]} ]</code>
• Tổng điểm: <b>${tong}</b> ➡️ <b>${resChar === 'T' ? '🔴 TÀI' : '🟢 XỈU'}</b>

🎯 <b>DỰ ĐOÁN PHIÊN TIẾP (#${phien + 1}):</b>
• Khuyên Đặt: <b>${ai ? ai.prediction : 'Đang tính...'}</b>
• Độ Tin Cậy: <code>${ai ? ai.confidence : 0}%</code>
• Thế Cầu: <i>${ai ? ai.pattern : 'N/A'}</i>

📊 <b>5 Phiên gần nhất:</b>
[ ${history.slice(-5).map(h => h.res === 'T' ? '🔴Tài' : '🟢Xỉu').join(' | ')} ]
⏰ <i>${getCurrentTimeUTC7()}</i>
      `;

      // Gửi tin nhắn tự động vào Telegram
      if (CHAT_ID && CHAT_ID !== 'YOUR_TELEGRAM_CHAT_ID_HERE') {
        bot.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' });
        console.log(`[BOT TELEGRAM] Đã gửi thông báo phiên #${phien}`);
      }
    }
  } catch (error) {
    console.error('[API ERROR] Lỗi khi tải dữ liệu LC79:', error.message);
  }
}

// Lệnh tương tác trên Telegram Bot
bot.onText(/\/start/, (msg) => {
  const welcomeText = `
👋 Chào mừng bạn đến với **CyberPredict AI Bot**!

Bot tự động theo dõi bàn cược LC79 MD5 realtime và dự đoán kết quả.
Các lệnh hỗ trợ:
- /soicau : Soi cầu phiên hiện tại thủ công
- /lichsu : Xem lịch sử 10 phiên gần nhất
- /id : Xem Chat ID của bạn
  `;
  bot.sendMessage(msg.chat.id, welcomeText, { parse_mode: 'Markdown' });
});

bot.onText(/\/id/, (msg) => {
  bot.sendMessage(msg.chat.id, `Chat ID của bạn là: <code>${msg.chat.id}</code>`, { parse_mode: 'HTML' });
});

bot.onText(/\/soicau/, (msg) => {
  if (history.length === 0) {
    bot.sendMessage(msg.chat.id, '⏳ Đang khởi tạo luồng dữ liệu, vui lòng thử lại sau 5 giây...');
    return;
  }
  const last = history[history.length - 1];
  const ai = runAIPrediction(history);

  const reply = `
🔮 <b>SOI CẦU THỦ CÔNG LC79 MD5</b>
• Phiên vừa qua: <b>#${last.phien}</b> (${last.tong} điểm - ${last.res === 'T' ? 'TÀI' : 'XỈU'})
-----------------------------------
👉 Dự đoán phiên tiếp (#${last.phien + 1}): <b>${ai.prediction}</b>
🔥 Tỉ lệ tin cậy: <b>${ai.confidence}%</b>
📐 Thế cầu: <b>${ai.pattern}</b>
  `;
  bot.sendMessage(msg.chat.id, reply, { parse_mode: 'HTML' });
});

bot.onText(/\/lichsu/, (msg) => {
  if (history.length === 0) {
    bot.sendMessage(msg.chat.id, 'Chưa có dữ liệu lịch sử.');
    return;
  }
  const list = history.slice(-10).map(h => `#${h.phien}: ${h.tong} điểm (${h.res === 'T' ? 'Tài' : 'Xỉu'})`).join('\n');
  bot.sendMessage(msg.chat.id, `📋 <b>LỊCH SỬ 10 PHIÊN GẦN NHẤT:</b>\n\n${list}`, { parse_mode: 'HTML' });
});

// Vòng lặp tự động kiểm tra phiên mới mỗi 3 giây
setInterval(checkLC79, 3000);

// Khởi tạo Express Server ngầm (Để giữ Bot chạy liên tục khi đưa lên Hosting/Cloud)
app.get('/', (req, res) => res.send('CyberPredict Telegram Bot LC79 está funcionando!'));
app.listen(PORT, () => console.log(`Server Bot đang khởi chạy trên Port ${PORT}`));
