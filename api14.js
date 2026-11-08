// api14.js - GTD SAKURA TOOL v14 - by 006
// TÍNH NĂNG: Auto Install Module + Anti IP Ban + Hack Name + Soi Full Bang + Search + Top 100

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ==================== AUTO INSTALL MODULE ====================
const REQUIRED_MODULES = {
  'axios': 'axios'
};

function ensureModules() {
  let installed = false;
  for (const [name, pkg] of Object.entries(REQUIRED_MODULES)) {
    try {
      require.resolve(name);
      console.log(`  \x1b[1;38;5;118m✓\x1b[0m Module \x1b[1;38;5;213m${name}\x1b[0m đã có sẵn`);
    } catch (e) {
      console.log(`  \x1b[1;38;5;226m⚠\x1b[0m Thiếu module \x1b[1;38;5;213m${name}\x1b[0m → đang tự động cài...`);
      try {
        execSync(`npm install ${pkg} --no-audit --no-fund`, { stdio: 'inherit' });
        installed = true;
        console.log(`  \x1b[1;38;5;118m✓\x1b[0m Cài thành công \x1b[1;38;5;213m${name}\x1b[0m`);
      } catch (err) {
        console.error(`  \x1b[1;38;5;203m✗\x1b[0m Cài ${name} thất bại: ${err.message}`);
        process.exit(1);
      }
    }
  }
  if (installed) console.log(`  \x1b[1;38;5;118m✓\x1b[0m Đã cài đặt xong tất cả module\n`);
}

console.log('\n  ╔══════════════════════════════════════════╗');
console.log('  ║   🔧 AUTO INSTALL MODULE CHECKER 🔧      ║');
console.log('  ╚══════════════════════════════════════════╝');
ensureModules();

const http = require('http');
const crypto = require('crypto');
const axios = require('axios');

// ==================== CONFIG ====================
const PORT = process.env.PORT || 3000;
const GAME_HOST = '211.253.26.47';
const GAME_PORT = 8093;

const K1 = Buffer.from('gksekf1djrqjfwk!', 'utf8');
const I1 = Buffer.from('towerdefence_amo', 'utf8');
const K2 = Buffer.from('gksekfidjrqjfwk1', 'utf8');
const I2 = Buffer.from('towerdefense_amo', 'utf8');

const DEFAULT_ACC = {
  UNIQ_ID: 'TDM590145qQF_1',
  HOST_ID: 'duongduonghy2021@gmail.com',
  PLATFORM: 'AMO'
};

let cachedGichapo = null;
let cachedGichapoTime = 0;
const GICHAPO_TTL = 5 * 60 * 1000; // 5 phút

// ==================== ANTI IP BAN - IP GUARD ====================
const ipGuard = {
  lastRequest: 0,
  minInterval: 900, // tối thiểu 900ms giữa 2 request
  requestCount: 0,
  windowStart: Date.now(),
  maxPerMinute: 35, // tối đa 35 request / phút
  consecutiveErrors: 0,
  backoffUntil: 0,

  async wait() {
    const now = Date.now();
    
    // Nếu đang trong backoff
    if (now < this.backoffUntil) {
      const waitTime = this.backoffUntil - now;
      console.log(`  \x1b[1;38;5;203m🛑 [IP-GUARD] Đang backoff, chờ ${Math.ceil(waitTime/1000)}s...\x1b[0m`);
      await new Promise(r => setTimeout(r, waitTime));
    }
    
    // Reset window mỗi 60 giây
    if (Date.now() - this.windowStart > 60000) {
      this.windowStart = Date.now();
      this.requestCount = 0;
    }
    
    // Rate limit: nếu vượt max, chờ tới hết window
    if (this.requestCount >= this.maxPerMinute) {
      const waitTime = 60000 - (Date.now() - this.windowStart) + 1000;
      console.log(`  \x1b[1;38;5;226m⏳ [IP-GUARD] Chạm rate limit (${this.maxPerMinute}/phút), nghỉ ${Math.ceil(waitTime/1000)}s...\x1b[0m`);
      await new Promise(r => setTimeout(r, waitTime));
      this.windowStart = Date.now();
      this.requestCount = 0;
    }
    
    // Min interval + jitter để trông giống người dùng thật
    const timeSinceLast = Date.now() - this.lastRequest;
    if (timeSinceLast < this.minInterval) {
      const baseWait = this.minInterval - timeSinceLast;
      const jitter = 50 + Math.random() * 300;
      await new Promise(r => setTimeout(r, baseWait + jitter));
    }
    
    // Random delay nhỏ để tránh pattern đều
    await new Promise(r => setTimeout(r, 80 + Math.random() * 250));
    
    this.lastRequest = Date.now();
    this.requestCount++;
  },
  
  onSuccess() {
    this.consecutiveErrors = 0;
  },
  
  onError() {
    this.consecutiveErrors++;
    if (this.consecutiveErrors >= 3) {
      const backoff = Math.min(30000 * Math.pow(2, this.consecutiveErrors - 3), 300000);
      this.backoffUntil = Date.now() + backoff;
      console.log(`  \x1b[1;38;5;203m🛑 [IP-GUARD] ${this.consecutiveErrors} lỗi liên tiếp → backoff ${Math.ceil(backoff/1000)}s\x1b[0m`);
    }
  }
};

// ==================== ANTI IP BAN - ROTATING HEADERS ====================
const USER_AGENTS = [
  'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
  'Dalvik/2.1.0 (Linux; U; Android 14; SM-S918N Build/UP1A.231005.007)',
  'Dalvik/2.1.0 (Linux; U; Android 13; SM-G991B Build/TP1A.220624.014)',
  'Mozilla/5.0 (Linux; Android 12; Redmi Note 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; CPH2451) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36'
];

const KOREAN_IP_PREFIXES = [
  '211.234', '223.33', '223.39', '223.62', '211.253',
  '175.223', '175.197', '218.39', '175.126', '121.139',
  '121.130', '121.162', '121.170', '121.175', '121.183',
  '175.194', '175.196', '175.209', '175.213', '175.215',
  '220.93', '220.95', '220.117', '220.118', '220.119'
];

const VIETNAMESE_IP_PREFIXES = [
  '113.161', '113.171', '113.176', '113.180', '14.161',
  '14.162', '14.166', '14.169', '14.187', '42.112',
  '42.113', '42.116', '42.119', '27.68', '27.72',
  '203.205', '203.210', '203.162', '171.251', '171.255'
];

const ACCEPT_LANGUAGES = [
  'ko-KR,ko;q=0.9,en;q=0.8',
  'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
  'en-US,en;q=0.9,ko;q=0.8',
  'ko-KR,ko;q=0.9,vi;q=0.8,en;q=0.7',
  'vi,en;q=0.9,ko;q=0.8'
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateFakeIP(platform) {
  // Server Hàn → ưu tiên IP Hàn cho AMO/ATV/LG
  // Server VN cho SS
  if (platform === 'SS') {
    const prefix = pick(VIETNAMESE_IP_PREFIXES);
    return `${prefix}.${rand(1, 254)}.${rand(1, 254)}`;
  }
  const prefix = pick(KOREAN_IP_PREFIXES);
  return `${prefix}.${rand(1, 254)}.${rand(1, 254)}`;
}

function getRotatingHeaders(platform = 'AMO') {
  const fakeIP = generateFakeIP(platform);
  return {
    'User-Agent': pick(USER_AGENTS),
    'X-Forwarded-For': fakeIP,
    'X-Real-IP': fakeIP,
    'X-Client-IP': fakeIP,
    'X-Originating-IP': fakeIP,
    'Accept': '*/*',
    'Accept-Language': pick(ACCEPT_LANGUAGES),
    'Accept-Encoding': 'gzip, deflate',
    'X-Requested-With': platform === 'ATV' ? 'busidol.atv.tower' : 'busidol.mobile.tower',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  };
}

// ==================== AES HELPERS ====================
function enc(data, key, iv) {
  try {
    const c = crypto.createCipheriv('aes-128-cbc', key, iv);
    const json = typeof data === 'string' ? data : JSON.stringify(data).replace(/\s+/g, '');
    return encodeURIComponent(c.update(json, 'utf8', 'base64') + c.final('base64'));
  } catch (e) { return null; }
}

function dec(data, key, iv) {
  if (!data) return null;
  try {
    const s = String(data).trim().replace(/^"|"$/g, '');
    const d = crypto.createDecipheriv('aes-128-cbc', key, iv);
    return (d.update(s, 'base64', 'utf8') + d.final('utf8')).replace(/[\x00-\x1F\x7F-\x9F]/g, '');
  } catch (e) { return null; }
}

function findGichapo(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.gichapo && typeof obj.gichapo === 'string' && obj.gichapo.length >= 4) return obj.gichapo;
  for (const k in obj) { const r = findGichapo(obj[k]); if (r) return r; }
  return null;
}

function randomGic() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let r = '';
  for (let i = 0; i < 8; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

// ==================== REQUEST WITH IP GUARD ====================
async function gamePost(pathUrl, body, platform = 'AMO', timeout = 20000, retries = 3) {
  const bodyStr = typeof body === 'string' ? body : new URLSearchParams(body).toString();
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    await ipGuard.wait();
    
    try {
      const res = await axios.post(`http://${GAME_HOST}:${GAME_PORT}${pathUrl}`, bodyStr, {
        headers: getRotatingHeaders(platform),
        timeout,
        validateStatus: () => true,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        decompress: true,
        httpAgent: new http.Agent({ keepAlive: false, maxSockets: 1 })
      });
      
      if (res.status === 200 && res.data) {
        ipGuard.onSuccess();
        return res.data;
      }
      
      if (res.status === 429 || res.status === 403) {
        console.log(`  \x1b[1;38;5;203m🛑 [IP-GUARD] Server trả ${res.status}, đang đổi IP...\x1b[0m`);
        ipGuard.onError();
        continue;
      }
      
      return res.data;
    } catch (e) {
      ipGuard.onError();
      const msg = (e.message || '').toLowerCase();
      if (attempt < retries && (msg.includes('timeout') || msg.includes('econn') || msg.includes('socket'))) {
        console.log(`  \x1b[1;38;5;226m⚠ [RETRY ${attempt}/${retries}] Đang thử lại...\x1b[0m`);
        await new Promise(r => setTimeout(r, 1000 * attempt));
        continue;
      }
      return null;
    }
  }
  return null;
}

// ==================== GICHAPO CACHE ====================
async function getGichapo(platform, uniq_id, host_id, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedGichapo && (now - cachedGichapoTime) < GICHAPO_TTL) {
    return cachedGichapo;
  }
  
  try {
    const gicDefault = '선택된서버:베트남서버 ping:67ms';
    const payload = {
      UNIQ_ID: uniq_id, HOST_ID: host_id,
      MOBILE_CONNECT: platform === 'SS' ? 'AMO' : '',
      ANDROID_AD: '',
      GICHAPO: gicDefault, LOCAL_KEY: null
    };
    if (platform === 'ATV' || platform === 'LG') payload.MODEL_NAME = 'BeyondTV';

    const raw = await gamePost(`/TOWERDEFENCE_${platform}/get_user_data_all_AES2.php`, `DATA=${enc(payload, K2, I2)}`, platform);
    if (raw) {
      const decrypted = dec(raw, K2, I2);
      if (decrypted) {
        const data = JSON.parse(decrypted);
        const gic = findGichapo(data);
        if (gic) {
          cachedGichapo = gic;
          cachedGichapoTime = now;
          return gic;
        }
      }
    }
  } catch (e) {}
  
  const fallback = randomGic();
  cachedGichapo = fallback;
  cachedGichapoTime = now;
  return fallback;
}

// ==================== HTTP HELPERS ====================
function readJson(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(JSON.stringify(obj));
}

// ==================== HANDLERS ====================

async function handleUser(req, res) {
  const body = await readJson(req);
  const platform = (body.platform || DEFAULT_ACC.PLATFORM).toUpperCase();
  const uniq_id = body.uniq_id || DEFAULT_ACC.UNIQ_ID;
  const host_id = body.host_id || DEFAULT_ACC.HOST_ID;

  const gicDefault = '선택된서버:베트남서버 ping:67ms';
  const payload = {
    UNIQ_ID: uniq_id, HOST_ID: host_id,
    MOBILE_CONNECT: platform === 'SS' ? 'AMO' : '',
    ANDROID_AD: '',
    GICHAPO: gicDefault, LOCAL_KEY: null
  };
  if (platform === 'ATV' || platform === 'LG') payload.MODEL_NAME = 'BeyondTV';

  const raw = await gamePost(`/TOWERDEFENCE_${platform}/get_user_data_all_AES2.php`, `DATA=${enc(payload, K2, I2)}`, platform);
  if (!raw) return sendJson(res, 200, { success: false, error: 'Không kết nối được server' });

  const decrypted = dec(raw, K2, I2);
  if (!decrypted) return sendJson(res, 200, { success: false, error: 'Không giải mã được dữ liệu' });

  try {
    const data = JSON.parse(decrypted);
    const v = data.VALUE || {};
    const normal = v.normal?.value || {};
    const rdy = v.rubydiagold?.value || {};
    const etc = v.etc?.value || {};
    const gic = findGichapo(data) || randomGic();
    cachedGichapo = gic;
    cachedGichapoTime = Date.now();

    sendJson(res, 200, {
      success: true,
      data: {
        gichapo: gic,
        userName: normal.USER_NAME || '???',
        level: parseInt(normal.LEVEL) || 0,
        ruby: parseInt(rdy.RUBY) || 0,
        gold: parseInt(rdy.GOLD) || 0,
        dia: parseInt(rdy.DIA) || 0,
        magic: parseInt(rdy.MAGIC) || 0,
        runCount: parseInt(etc.run_count) || 0
      }
    });
  } catch (e) {
    sendJson(res, 200, { success: false, error: 'Parse JSON thất bại: ' + e.message });
  }
}

// SOI FULL BANG
async function handleGuildInfo(req, res) {
  const body = await readJson(req);
  const platform = (body.platform || DEFAULT_ACC.PLATFORM).toUpperCase();
  const uniq_id = body.uniq_id || DEFAULT_ACC.UNIQ_ID;
  const guild_bunho = parseInt(body.guild_bunho);

  if (!guild_bunho || isNaN(guild_bunho)) {
    return sendJson(res, 200, { success: false, error: 'ID Bang không hợp lệ' });
  }

  const gic = cachedGichapo || await getGichapo(platform, uniq_id, DEFAULT_ACC.HOST_ID);

  const payload = {
    PLATFORM: platform,
    UNIQ_ID: uniq_id,
    GUILD_BUNHO: guild_bunho,
    MY_GUILD_BUNHO: 0,
    MOBILE_CONNECT: '',
    GICHAPO: gic
  };

  const raw = await gamePost('/TOWERDEFENCE_COMMON/GUILD/get_guild_info_for_war_AES.php', `DATA=${enc(payload, K1, I1)}`, platform);
  if (!raw) return sendJson(res, 200, { success: false, error: 'Server không phản hồi' });

  let result = null;
  const decStr = dec(raw, K1, I1);
  if (decStr) {
    try { result = JSON.parse(decStr); } catch {}
  }
  if (!result) {
    try { result = typeof raw === 'object' ? raw : JSON.parse(String(raw)); } catch {}
  }

  if (!result) {
    return sendJson(res, 200, { success: false, error: 'Không parse được dữ liệu', raw: String(raw).substring(0, 200) });
  }

  if (result.RESULT === 'FAIL' || !result.list) {
    return sendJson(res, 200, { success: false, error: result.COMMENT || result.VALUE || 'Không tìm thấy bang' });
  }

  const L = result.list;

  let master = L.master;
  if (typeof master === 'string') { try { master = JSON.parse(master); } catch { master = {}; } }
  if (!master || typeof master !== 'object') master = {};

  let memberList = L.member_list;
  if (typeof memberList === 'string') { try { memberList = JSON.parse(memberList); } catch { memberList = []; } }
  if (!Array.isArray(memberList)) memberList = [];

  const members = memberList
    .filter(m => m && typeof m === 'object' && (m.un || m.uniq_id))
    .map(m => ({
      uid: m.un || m.uniq_id || 'N/A',
      name: m.na || m.name || 'N/A',
      level: parseInt(m.le || m.level) || 0,
      hero: parseInt(m.he) || 0,
      heroLevel: parseInt(m.hl) || 0,
      score: parseInt(m.sc) || 0,
      platform: m.pl || '??',
      lastOnline: m.ti || 'N/A',
      joinDate: m.ts || m.tw || 'N/A'
    }));

  members.sort((a, b) => b.score - a.score);

  const chats = [];
  const gc = L.guild_chat || {};
  for (const k in gc) {
    const c = gc[k];
    if (c && c.user_name && c.chat && c.user_name !== '[[ notice ]]') {
      chats.push({
        name: c.user_name,
        chat: c.chat,
        time: c.update_time || '',
        platform: c.platform || ''
      });
    }
  }
  chats.sort((a, b) => (b.time || '').localeCompare(a.time || ''));

  sendJson(res, 200, {
    success: true,
    data: {
      guildName: L.guild_name || 'N/A',
      guildBunho: L.guild_bunho || guild_bunho,
      rank: L.rank || 1,
      guildLevel: L.guild_level || 1,
      totScore: parseInt(L.tot_score) || 0,
      seasonScore: parseInt(L.season_score) || 0,
      guildGold: parseInt(L.guild_gold) || 0,
      maxMember: parseInt(L.max_member) || 30,
      memberCount: members.length,
      notice: L.notice || '',
      master: {
        name: master.name || master.na || 'N/A',
        uid: master.uniq_id || master.un || 'N/A',
        level: parseInt(master.level) || 0,
        platform: master.platform || platform
      },
      members,
      chats: chats.slice(0, 50)
    }
  });
}

// TÌM GUILD THEO TÊN
async function handleSearchGuild(req, res) {
  const body = await readJson(req);
  const platform = (body.platform || DEFAULT_ACC.PLATFORM).toUpperCase();
  const uniq_id = body.uniq_id || DEFAULT_ACC.UNIQ_ID;
  const keyword = (body.keyword || '').trim();

  if (!keyword) return sendJson(res, 200, { success: false, error: 'Cần nhập từ khóa tìm kiếm' });

  const gic = cachedGichapo || await getGichapo(platform, uniq_id, DEFAULT_ACC.HOST_ID);

  const payload = {
    PLATFORM: platform,
    UNIQ_ID: uniq_id,
    SEARCH_WORD: keyword,
    GUILD_BUNHO: 0,
    MOBILE_CONNECT: '',
    GICHAPO: gic
  };

  const raw = await gamePost('/TOWERDEFENCE_COMMON/GUILD/get_guild_list_AES2.php', `DATA=${enc(payload, K2, I2)}`, platform);
  if (!raw) return sendJson(res, 200, { success: false, error: 'Server không phản hồi' });

  const decrypted = dec(raw, K2, I2);
  if (!decrypted) return sendJson(res, 200, { success: false, error: 'Không giải mã được' });

  let data;
  try { data = JSON.parse(decrypted); } catch { return sendJson(res, 200, { success: false, error: 'Parse JSON thất bại' }); }

  if (data.RESULT === 'FAIL' || !data.list) {
    return sendJson(res, 200, { success: false, error: data.COMMENT || data.VALUE || 'Không tìm thấy bang' });
  }

  const list = data.list || {};
  const guilds = [];

  for (const k in list) {
    const g = list[k];
    if (!g || !g.guild_name) continue;
    let master = g.master;
    if (typeof master === 'string') { try { master = JSON.parse(master); } catch { master = {}; } }
    if (!master || typeof master !== 'object') master = {};

    guilds.push({
      bunho: g.guild_bunho || k,
      name: g.guild_name,
      score: parseInt(g.tot_score) || 0,
      seasonScore: parseInt(g.season_score) || 0,
      member: parseInt(g.member) || 0,
      maxMember: parseInt(g.max_member) || 30,
      gold: parseInt(g.guild_gold) || 0,
      type: g.type || '1',
      masterName: master.name || 'N/A',
      masterUid: master.uniq_id || master.un || 'N/A',
      masterLevel: parseInt(master.level) || 0
    });
  }

  guilds.sort((a, b) => b.score - a.score);
  sendJson(res, 200, { success: true, guilds, total: guilds.length, keyword });
}

// TOP 100 GUILD
async function handleTopGuild(req, res) {
  const body = await readJson(req);
  const platform = (body.platform || DEFAULT_ACC.PLATFORM).toUpperCase();
  const uniq_id = body.uniq_id || DEFAULT_ACC.UNIQ_ID;

  const gic = cachedGichapo || await getGichapo(platform, uniq_id, DEFAULT_ACC.HOST_ID);

  const payload = {
    PLATFORM: platform,
    UNIQ_ID: uniq_id,
    SEARCH_WORD: '길드전장점수_내길드순위포함',
    GUILD_BUNHO: 0,
    MOBILE_CONNECT: '',
    GICHAPO: gic
  };

  const raw = await gamePost('/TOWERDEFENCE_COMMON/GUILD/get_guild_list_AES2.php', `DATA=${enc(payload, K2, I2)}`, platform);
  if (!raw) return sendJson(res, 200, { success: false, error: 'Server không phản hồi' });

  const decrypted = dec(raw, K2, I2);
  if (!decrypted) return sendJson(res, 200, { success: false, error: 'Không giải mã được' });

  let data;
  try { data = JSON.parse(decrypted); } catch { return sendJson(res, 200, { success: false, error: 'Parse JSON thất bại' }); }

  if (data.RESULT === 'FAIL' || !data.list) {
    return sendJson(res, 200, { success: false, error: data.COMMENT || 'Không có dữ liệu' });
  }

  const list = data.list || {};
  const guilds = [];

  for (const k in list) {
    const g = list[k];
    if (!g || !g.guild_name) continue;
    let master = g.master;
    if (typeof master === 'string') { try { master = JSON.parse(master); } catch { master = {}; } }
    if (!master || typeof master !== 'object') master = {};

    guilds.push({
      bunho: g.guild_bunho || k,
      name: g.guild_name,
      score: parseInt(g.tot_score) || 0,
      seasonScore: parseInt(g.season_score) || 0,
      member: parseInt(g.member) || 0,
      maxMember: parseInt(g.max_member) || 30,
      gold: parseInt(g.guild_gold) || 0,
      type: g.type || '1',
      masterName: master.name || 'N/A',
      masterUid: master.uniq_id || master.un || 'N/A',
      masterLevel: parseInt(master.level) || 0
    });
  }

  guilds.sort((a, b) => b.score - a.score);
  const top100 = guilds.slice(0, 100);

  sendJson(res, 200, { success: true, guilds: top100, total: guilds.length });
}

// ==================== HACK NAME ====================
async function handleHackName(req, res) {
  const body = await readJson(req);
  const platform = (body.platform || DEFAULT_ACC.PLATFORM).toUpperCase();
  const uniq_id = (body.uniq_id || DEFAULT_ACC.UNIQ_ID).trim();
  const host_id = body.host_id || DEFAULT_ACC.HOST_ID;
  const old_name = (body.old_name || '').trim();
  const new_name = (body.new_name || '').trim();

  if (!uniq_id) {
    return sendJson(res, 200, { success: false, error: 'Thiếu UNIQ_ID' });
  }
  if (!new_name) {
    return sendJson(res, 200, { success: false, error: 'Thiếu tên mới' });
  }
  if (new_name.length < 2 || new_name.length > 20) {
    return sendJson(res, 200, { success: false, error: 'Tên phải từ 2-20 ký tự' });
  }

  const gic = cachedGichapo || await getGichapo(platform, uniq_id, host_id);

  // Endpoint đổi tên dùng form-urlencoded (KHÔNG mã hóa AES)
  const params = new URLSearchParams();
  params.append('NAME', new_name);
  params.append('UNIQ_ID', uniq_id);
  params.append('COMMENT', `이름변경:${old_name || '???'}-->${new_name}`);
  params.append('PLATFORM', platform);
  params.append('MOBILE_CONNECT', '');
  params.append('GICHAPO', gic);

  const raw = await gamePost('/TOWERDEFENCE_COMMON/php/check_overlap_name_n_change.php', params.toString(), platform);

  if (!raw) {
    return sendJson(res, 200, { success: false, error: 'Server không phản hồi (có thể bị chặn IP, thử lại sau 30s)' });
  }

  const rawStr = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
  const low = rawStr.toLowerCase();

  let isOk = false;
  let errorMsg = '';

  if (low.includes('"result":"ok"') || low === 'ok' || low.includes('성공') || low.includes('success') || low.includes('changed')) {
    isOk = true;
  } else if (low.includes('overlap') || low.includes('중복') || low.includes('duplicate')) {
    errorMsg = 'Tên đã tồn tại, chọn tên khác';
  } else if (low.includes('8rhd') || low.includes('gichapo')) {
    errorMsg = 'GICHAPO không khớp, thử lại sau';
  } else if (low.includes('error') || low.includes('fail') || low.includes('실패')) {
    errorMsg = 'Server báo lỗi';
  }

  sendJson(res, 200, {
    success: true,
    isOk,
    errorMsg,
    oldName: old_name,
    newName: new_name,
    raw: rawStr.substring(0, 500)
  });
}

// Kiểm tra IP guard status
async function handleIpStatus(req, res) {
  const now = Date.now();
  sendJson(res, 200, {
    success: true,
    requestCount: ipGuard.requestCount,
    maxPerMinute: ipGuard.maxPerMinute,
    windowRemaining: Math.max(0, 60000 - (now - ipGuard.windowStart)),
    backoffRemaining: Math.max(0, ipGuard.backoffUntil - now),
    consecutiveErrors: ipGuard.consecutiveErrors,
    cachedGichapo: !!cachedGichapo,
    cachedAge: cachedGichapo ? (now - cachedGichapoTime) : 0
  });
}

// ==================== SERVER ====================
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const pathname = u.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  try {
    if (pathname === '/' || pathname === '/index.html') {
      fs.readFile(path.join(__dirname, 'index14.html'), (err, data) => {
        if (err) { res.writeHead(404); return res.end('Not Found'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(data);
      });
      return;
    }
    if (pathname === '/api/user' && req.method === 'POST') return handleUser(req, res);
    if (pathname === '/api/guild-info' && req.method === 'POST') return handleGuildInfo(req, res);
    if (pathname === '/api/search-guild' && req.method === 'POST') return handleSearchGuild(req, res);
    if (pathname === '/api/top-guild' && req.method === 'POST') return handleTopGuild(req, res);
    if (pathname === '/api/hack-name' && req.method === 'POST') return handleHackName(req, res);
    if (pathname === '/api/ip-status' && req.method === 'GET') return handleIpStatus(req, res);
    if (pathname === '/health') return sendJson(res, 200, { status: 'ok', ts: Date.now() });

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  \x1b[1;38;5;213m╔══════════════════════════════════════════════════╗\x1b[0m');
  console.log('  \x1b[1;38;5;213m║\x1b[0m   \x1b[1;38;5;226m🌸 GTD SAKURA TOOL v14 - by 006 🌸\x1b[0m             \x1b[1;38;5;213m║\x1b[0m');
  console.log('  \x1b[1;38;5;213m╚══════════════════════════════════════════════════╝\x1b[0m');
  console.log('');
  console.log(`  \x1b[1;38;5;118m▸\x1b[0m Server      : \x1b[1;38;5;45mhttp://localhost:${PORT}\x1b[0m`);
  console.log(`  \x1b[1;38;5;118m▸\x1b[0m Acc         : \x1b[1;38;5;226m${DEFAULT_ACC.UNIQ_ID}\x1b[0m`);
  console.log(`  \x1b[1;38;5;118m▸\x1b[0m Game Server : \x1b[1;38;5;245m${GAME_HOST}:${GAME_PORT}\x1b[0m`);
  console.log('');
  console.log('  \x1b[1;38;5;208m🛡  ANTI-IP-BAN:\x1b[0m');
  console.log(`     \x1b[1;38;5;245m• Rotating UA (${USER_AGENTS.length} UAs)\x1b[0m`);
  console.log(`     \x1b[1;38;5;245m• Fake IP ${KOREAN_IP_PREFIXES.length + VIETNAMESE_IP_PREFIXES.length} dải IP\x1b[0m`);
  console.log(`     \x1b[1;38;5;245m• Rate limit ${ipGuard.maxPerMinute} req/phút\x1b[0m`);
  console.log(`     \x1b[1;38;5;245m• Exponential backoff on error\x1b[0m`);
  console.log(`     \x1b[1;38;5;245m• GICHAPO cache TTL 5 phút\x1b[0m`);
  console.log('');
  console.log(`  \x1b[1;38;5;118m✓\x1b[0m Sẵn sàng nhận request`);
  console.log('');
});