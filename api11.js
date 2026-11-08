// api11.js - GTD SAKURA V11 Backend (AUTO-INSTALL + FULL INFO)
// by Nguyễn Đạt (006)
'use strict';

// ===== AUTO INSTALL MODULES =====
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function tryRequire(name) {
  try { return require(name); }
  catch (e) {
    if (e.code === 'MODULE_NOT_FOUND' || /Cannot find module/.test(e.message)) {
      console.log(`\n⚠️  Thiếu module "${name}" → đang tự cài...`);
      try {
        execSync(`npm install ${name} --no-audit --no-fund --loglevel=error`, {
          stdio: 'inherit',
          cwd: __dirname,
          env: { ...process.env, NODE_ENV: 'production' }
        });
        console.log(`✅ Đã cài "${name}" thành công\n`);
        return require(name);
      } catch (e2) {
        console.error(`❌ Không thể cài "${name}": ${e2.message}`);
        process.exit(1);
      }
    }
    throw e;
  }
}

(function ensurePackageJson() {
  const pkgPath = path.join(__dirname, 'package.json');
  const required = { express: '^4.19.2', axios: '^1.7.7' };
  let pkg = {};
  try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch (e) { pkg = {}; }
  if (!pkg.dependencies) pkg.dependencies = {};
  let changed = false;
  for (const k in required) {
    if (!pkg.dependencies[k]) { pkg.dependencies[k] = required[k]; changed = true; }
  }
  if (changed) { try { fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2)); } catch (e) {} }
})();

const express = tryRequire('express');
const axios = tryRequire('axios');
const crypto = require('crypto');
const http = require('http');

// ===== CONFIG =====
const app = express();
const PORT = process.env.PORT || 3000;
const GAME_HOST = '211.253.26.47';
const GAME_PORT = 8093;

const K1 = Buffer.from('gksekf1djrqjfwk!', 'utf8');
const I1 = Buffer.from('towerdefence_amo', 'utf8');
const K2 = Buffer.from('gksekfidjrqjfwk1', 'utf8');
const I2 = Buffer.from('towerdefense_amo', 'utf8');

const GIC = {
  AMO: '선택된서버:베트남서버 ping:67ms',
  ATV: '선택된서버:한국서버 ping:205ms',
  LG:  '선택된서버:베트남서버 ping:67ms',
  SS:  '선택된서버:베트남서버 ping:43ms'
};

// ===== FIXED ACCOUNT (updated) =====
const FIXED = { uid: 'TDM590145qQF_1', host: 'duongduonghy2021@gmail.com', platform: 'AMO' };

// ===== ADMIN (SHA-256) =====
const _ah = crypto.createHash('sha256').update(Buffer.from([48,54,48,54,49,50]).toString()).digest('hex');
function checkAdmin(code) {
  if (!code) return false;
  try {
    const h = crypto.createHash('sha256').update(String(code)).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(_ah, 'hex'));
  } catch (e) { return false; }
}

app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

// ===== CRYPTO =====
function enc(d, k, i) {
  try {
    const c = crypto.createCipheriv('aes-128-cbc', k, i);
    const j = typeof d === 'string' ? d : JSON.stringify(d).replace(/\s+/g, '');
    return encodeURIComponent(c.update(j, 'utf8', 'base64') + c.final('base64'));
  } catch (e) { return null; }
}

function dec(d, k, i) {
  if (!d) return null;
  let s = String(d).trim();
  s = s.replace(/^["']+|["']+$/g, '').trim();
  if (s.includes('%')) { try { s = decodeURIComponent(s); } catch (e) {} }
  s = s.replace(/\s+/g, '');
  const variants = [s, s.replace(/-/g, '+').replace(/_/g, '/')];
  for (let v of variants) {
    if (!v) continue;
    const pad = v.length % 4;
    let padded = v;
    if (pad === 2) padded += '==';
    else if (pad === 3) padded += '=';
    else if (pad === 1) continue;
    try {
      const dd = crypto.createDecipheriv('aes-128-cbc', k, i);
      dd.setAutoPadding(true);
      const out = dd.update(padded, 'base64', 'utf8') + dd.final('utf8');
      const clean = out.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
      if (clean && clean.length > 0) return clean;
    } catch (e) {}
    try {
      const dd2 = crypto.createDecipheriv('aes-128-cbc', k, i);
      dd2.setAutoPadding(false);
      const raw = dd2.update(padded, 'base64');
      const fin = dd2.final();
      const buf = Buffer.concat([raw, fin]);
      let end = buf.length;
      if (end > 0) {
        const last = buf[end - 1];
        if (last > 0 && last < 16 && end - last >= 0) {
          let valid = true;
          for (let z = end - last; z < end; z++) { if (buf[z] !== last) { valid = false; break; } }
          if (valid) end = end - last;
        }
      }
      const clean = buf.slice(0, end).toString('utf8').replace(/[\x00-\x1F\x7F-\x9F]/g, '');
      if (clean && clean.length > 0) return clean;
    } catch (e) {}
  }
  return null;
}

function parseGameResponse(raw, key, iv) {
  if (raw === null || raw === undefined) return { ok: false, data: null, error: 'Response null' };
  const rawStr = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const trimmed = rawStr.trim();
  if (!trimmed) return { ok: false, data: null, error: 'Response rỗng' };
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return { ok: true, data: JSON.parse(trimmed), raw: trimmed, was: 'json' }; } catch (e) {}
  }
  const decrypted = dec(trimmed, key, iv);
  if (decrypted) {
    try { return { ok: true, data: JSON.parse(decrypted), raw: trimmed, decoded: decrypted, was: 'aes' }; }
    catch (e) { return { ok: true, data: { RAW_TEXT: decrypted }, raw: trimmed, decoded: decrypted, was: 'aes_text' }; }
  }
  return { ok: false, data: null, error: `Không giải mã được (len=${trimmed.length})`, raw: trimmed };
}

function findGic(o) {
  if (!o || typeof o !== 'object') return null;
  if (o.gichapo && typeof o.gichapo === 'string' && o.gichapo.length >= 4) return o.gichapo;
  for (const k in o) { const r = findGic(o[k]); if (r) return r; }
  return null;
}

// ===== REQUEST =====
const _httpAgent = new http.Agent({ keepAlive: false, maxSockets: 1 });

async function gamePost(pathUrl, body, timeout = 25000, retries = 2) {
  const bs = typeof body === 'string' ? body : new URLSearchParams(body).toString();
  const url = `http://${GAME_HOST}:${GAME_PORT}${pathUrl}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const r = await axios.post(url, bs, {
        headers: {
          'User-Agent': 'app',
          'X-Requested-With': 'busidol.mobile.tower',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': '*/*',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7,ko-KR;q=0.6',
          'Connection': 'keep-alive',
          'Host': `${GAME_HOST}:${GAME_PORT}`
        },
        timeout, validateStatus: () => true,
        maxBodyLength: Infinity, maxContentLength: Infinity, responseType: 'text',
        httpAgent: _httpAgent
      });
      let data = r.data;
      if (Buffer.isBuffer(data)) data = data.toString('utf8');
      if (typeof data !== 'string') data = JSON.stringify(data);
      return data;
    } catch (e) {
      const msg = (e.message || '').toLowerCase();
      const isSock = msg.includes('socket hang up') || msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('timeout');
      if (isSock && attempt < retries) { await new Promise(r => setTimeout(r, 600 * attempt)); continue; }
      if (isSock) {
        try {
          const fallback = await new Promise((resolve) => {
            const urlObj = new URL(url);
            const req = http.request({
              hostname: urlObj.hostname, port: urlObj.port || 80,
              path: urlObj.pathname, method: 'POST', timeout,
              headers: {
                'User-Agent': 'app',
                'X-Requested-With': 'busidol.mobile.tower',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Content-Length': Buffer.byteLength(bs)
              }
            }, res => { let b = ''; res.on('data', d => b += d); res.on('end', () => resolve(b)); });
            req.on('timeout', () => { req.destroy(); resolve(null); });
            req.on('error', () => resolve(null));
            req.write(bs); req.end();
          });
          if (fallback !== null) return fallback;
        } catch (e2) {}
      }
      if (attempt === retries) return null;
    }
  }
  return null;
}

function isOk(raw) {
  if (!raw) return false;
  const s = String(raw).trim();
  const low = s.toLowerCase();
  if (low === 'ok' || low === 'success') return true;
  if (low.includes('"result":"ok"') || low.includes('"result": "ok"')) return true;
  if (s.includes('성공')) return true;
  try {
    const j = JSON.parse(s);
    if (j.RESULT === 'OK' || j.result === 'ok' || j.result === 'OK') return true;
  } catch (e) {}
  return false;
}

async function fetchUser(platform, uid, host) {
  const plat = (platform || 'AMO').toUpperCase();
  const payload = {
    UNIQ_ID: uid, HOST_ID: host,
    MOBILE_CONNECT: plat === 'SS' ? 'AMO' : '',
    ANDROID_AD: '', GICHAPO: GIC[plat] || GIC.AMO, LOCAL_KEY: null
  };
  if (plat === 'ATV' || plat === 'LG') payload.MODEL_NAME = 'BeyondTV';
  const raw = await gamePost(`/TOWERDEFENCE_${plat}/get_user_data_all_AES2.php`, `DATA=${enc(payload, K2, I2)}`);
  if (!raw) throw new Error('Server không phản hồi');
  const parsed = parseGameResponse(raw, K2, I2);
  if (!parsed.ok) throw new Error(parsed.error || 'Không giải mã được');
  const data = parsed.data;
  if (!data.VALUE) throw new Error('Response thiếu VALUE (UID/HOST có thể sai)');
  const v = data.VALUE;
  const normal = v.normal?.value || {};
  const etc = v.etc?.value || {};
  const rbg = v.rubydiagold?.value || {};
  const stage = v.stage?.value || {};
  const tower = v.tower?.value || {};
  const hero = v.hero?.value || {};
  const guild = v.guild?.value || {};
  return {
    gichapo: findGic(data) || GIC[plat],
    userName: normal.USER_NAME || '???',
    userName2: normal.USER_NAME2 || '',
    level: parseInt(normal.LEVEL) || 1,
    level_exp: parseInt(normal.LEVEL_EXP) || 0,
    run_count: parseInt(etc.run_count) || 0,
    ruby: parseInt(rbg.RUBY) || 0,
    dia: parseInt(rbg.DIA) || 0,
    gold: parseInt(rbg.GOLD) || 0,
    magic: parseInt(rbg.MAGIC) || 0,
    mileage: parseInt(rbg.MILEAGE) || 0,
    p_ticket: parseInt(rbg.P_TICKET) || 0,
    n_ticket: parseInt(rbg.N_TICKET) || 0,
    chul_num: parseInt(normal.CHUL_NUM) || 0,
    chul_date: String(normal.CHUL_DATE || 'N/A'),
    upgrade: (v.upgrade?.value || '0,0,0').split(',').map(n => parseInt(n) || 0),
    data_easy: stage.DATA_EASY || '',
    data_normal: stage.DATA_NORMAL || '',
    data_hard: stage.DATA_HARD || '',
    bou_tower: tower.bou_tower || '',
    selected_tower: tower.selected_tower || '',
    rainbow_card: parseInt(tower.rainbow_card) || 0,
    bou_hero: hero.bou_hero || '',
    selected_hero: hero.selected_hero || '',
    guild_name: guild.name || '',
    guild_bunho: guild.bunho || '',
    guild_score: parseInt(guild.tot_score) || 0,
    country: normal.COUNTRY || 'N/A',
    model_name: normal.MODEL_NAME || 'N/A',
    version: normal.VERSION || 'N/A',
    so_code: normal.SO_CODE || '0',
    normalFull: normal
  };
}

let fixedGic = null, fixedGicTime = 0;
const FIXED_GIC_MS = 5 * 60 * 1000;
async function getFixedGic() {
  const now = Date.now();
  if (fixedGic && (now - fixedGicTime) < FIXED_GIC_MS) return fixedGic;
  const u = await fetchUser(FIXED.platform, FIXED.uid, FIXED.host);
  fixedGic = u.gichapo; fixedGicTime = now;
  return fixedGic;
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index11.html')));

// ===== 1. FETCH INFO =====
app.post('/api/fetch-info', async (req, res) => {
  try {
    const { platform, uniq_id, host_id } = req.body || {};
    if (!uniq_id || !host_id) return res.json({ success: false, error: 'Thiếu UNIQ_ID hoặc HOST_ID' });
    const u = await fetchUser(platform || 'AMO', uniq_id, host_id);
    res.json({ success: true, data: {
      userName: u.userName, level: u.level, level_exp: u.level_exp,
      runCount: u.run_count, gichapo: u.gichapo, upgrade: u.upgrade,
      ruby: u.ruby, dia: u.dia, gold: u.gold, magic: u.magic, mileage: u.mileage,
      chul_num: u.chul_num, chul_date: u.chul_date,
      guild_name: u.guild_name, guild_bunho: u.guild_bunho
    }});
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ===== 2. FULL INFO ACC =====
app.post('/api/full-info', async (req, res) => {
  try {
    const { platform, uniq_id, host_id } = req.body || {};
    if (!uniq_id || !host_id) return res.json({ success: false, error: 'Thiếu UNIQ_ID hoặc HOST_ID' });
    const plat = (platform || 'AMO').toUpperCase();
    const u = await fetchUser(plat, uniq_id, host_id);

    const easyArr = (u.data_easy || '').split(',').filter(Boolean);
    const normalArr = (u.data_normal || '').split(',').filter(Boolean);
    const hardArr = (u.data_hard || '').split(',').filter(Boolean);
    const towerArr = (u.bou_tower || '').split(',').filter(Boolean);
    const heroArr = (u.bou_hero || '').split(',').filter(Boolean);

    const easyCleared = easyArr.filter(x => x === 'A' || x === 'C').length;
    const normalCleared = normalArr.filter(x => x === 'C').length;
    const hardCleared = hardArr.filter(x => x === 'C').length;

    let heroOwned = 0;
    let heroSumLevel = 0;
    heroArr.forEach(h => {
      const p = h.split(':');
      if (p.length >= 4 && p[3] === '1') {
        heroOwned++;
        heroSumLevel += parseInt(p[1]) || 0;
      }
    });

    let towerSumLevel = 0;
    towerArr.forEach(t => {
      const p = t.split(':');
      towerSumLevel += parseInt(p[1]) || 0;
    });

    res.json({ success: true, data: {
      platform: plat,
      uniq_id: uniq_id,
      host_id: host_id,
      gichapo: u.gichapo,
      userName: u.userName,
      userName2: u.userName2,
      level: u.level,
      level_exp: u.level_exp,
      so_code: u.so_code,
      country: u.country,
      model_name: u.model_name,
      version: u.version,
      run_count: u.run_count,
      ruby: u.ruby,
      dia: u.dia,
      gold: u.gold,
      magic: u.magic,
      mileage: u.mileage,
      p_ticket: u.p_ticket,
      n_ticket: u.n_ticket,
      upgrade: u.upgrade,
      chul_num: u.chul_num,
      chul_date: u.chul_date,
      easy_total: easyArr.length,
      easy_cleared: easyCleared,
      normal_total: normalArr.length,
      normal_cleared: normalCleared,
      hard_total: hardArr.length,
      hard_cleared: hardCleared,
      tower_count: towerArr.length,
      tower_sum_level: towerSumLevel,
      rainbow_card: u.rainbow_card,
      selected_tower: u.selected_tower,
      hero_owned: heroOwned,
      hero_total: 60,
      hero_sum_level: heroSumLevel,
      selected_hero: u.selected_hero,
      guild_name: u.guild_name,
      guild_bunho: u.guild_bunho,
      guild_score: u.guild_score
    }});
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ===== 3. HACK NAME =====
app.post('/api/hack-name', async (req, res) => {
  try {
    const { platform, uniq_id, host_id, new_name } = req.body || {};
    if (!uniq_id || !host_id || !new_name) return res.json({ success: false, error: 'Thiếu thông tin' });
    const plat = (platform || 'AMO').toUpperCase();
    const u = await fetchUser(plat, uniq_id, host_id);
    const p = new URLSearchParams();
    p.append('NAME', new_name);
    p.append('UNIQ_ID', uniq_id);
    p.append('COMMENT', `이름변경:${u.userName}-->${new_name}`);
    p.append('PLATFORM', plat);
    p.append('MOBILE_CONNECT', '');
    p.append('GICHAPO', u.gichapo);
    const raw = await gamePost('/TOWERDEFENCE_COMMON/php/check_overlap_name_n_change.php', p.toString());
    if (!raw) return res.json({ success: false, error: 'Server không phản hồi' });
    res.json({ success: true, oldName: u.userName, newName: new_name, isOk: isOk(raw) });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ===== 4. MISSION ONCE =====
app.post('/api/mission-once', async (req, res) => {
  try {
    const { platform, uniq_id, host_id, gichapo, index } = req.body || {};
    if (!uniq_id || !host_id || !gichapo) return res.json({ success: false, error: 'Thiếu thông tin' });
    const plat = (platform || 'AMO').toUpperCase();
    const weekly = `0:0,0:0,0:0,0:0,0:0,0:${index},0:${index},0:${index},0:${index},0:${index}`;
    const comment = plat === 'AMO' ? `주간미션:PVP플레이:${index}` : `[모바일연동됨]주간미션:PVP플레이:${index}`;
    const payload = {
      UNIQ_ID: uniq_id, HOST_ID: host_id, WEEKLY: weekly,
      RUN_COUNT: '0', COMMENT: comment,
      MOBILE_CONNECT: (plat === 'SS' || plat === 'LG') ? 'AMO' : '',
      GICHAPO: gichapo
    };
    const raw = await gamePost(`/TOWERDEFENCE_${plat}/put_userinfo_mission_AES.php`, `DATA=${enc(payload, K1, I1)}`);
    if (!raw) return res.json({ success: true, ok: false });
    let ok = isOk(raw);
    if (!ok) {
      const parsed = parseGameResponse(raw, K1, I1);
      if (parsed.ok && parsed.data) {
        if (parsed.data.RESULT === 'OK' || parsed.data.result === 'ok') ok = true;
      }
    }
    res.json({ success: true, ok });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ===== 5. BXH =====
app.post('/api/bxh', async (req, res) => {
  try {
    const gic = await getFixedGic();
    const payload = {
      PLATFORM: FIXED.platform, UNIQ_ID: FIXED.uid,
      SEARCH_WORD: '길드전장점수_내길드순위포함',
      GUILD_BUNHO: 0, MOBILE_CONNECT: '', GICHAPO: gic
    };
    const raw = await gamePost('/TOWERDEFENCE_COMMON/GUILD/get_guild_list_AES2.php', `DATA=${enc(payload, K2, I2)}`);
    if (!raw) return res.json({ success: false, error: 'Server không phản hồi' });
    const parsed = parseGameResponse(raw, K2, I2);
    if (!parsed.ok) return res.json({ success: false, error: parsed.error });
    const data = parsed.data;
    const list = data.list || {};
    const guilds = [];
    for (const k in list) {
      const g = list[k];
      if (g && g.guild_name) {
        guilds.push({
          bunho: g.guild_bunho || k, name: g.guild_name,
          score: parseInt(g.tot_score) || 0,
          member: parseInt(g.member) || 0, maxMember: parseInt(g.max_member) || 30
        });
      }
    }
    guilds.sort((a, b) => b.score - a.score);
    res.json({ success: true, guilds: guilds.slice(0, 100) });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ===== 6. UPGRADE 150 =====
app.post('/api/upgrade-150', async (req, res) => {
  try {
    const { platform, uniq_id, host_id } = req.body || {};
    if (!uniq_id || !host_id) return res.json({ success: false, error: 'Thiếu thông tin' });
    const plat = (platform || 'AMO').toUpperCase();
    const u = await fetchUser(plat, uniq_id, host_id);
    const payload = {
      UNIQ_ID: uniq_id, HOST_ID: host_id,
      DATA: '150,150,150',
      RUN_COUNT: u.run_count,
      COMMENT: '150,150,150업그레이드:Custom Power-up',
      MOBILE_CONNECT: 'AMO', GICHAPO: u.gichapo
    };
    const raw = await gamePost(`/TOWERDEFENCE_${plat}/put_userinfo_upgrade_AES.php`, `DATA=${enc(payload, K1, I1)}`);
    if (!raw) return res.json({ success: false, error: 'Server không phản hồi' });
    res.json({ success: true, isOk: isOk(raw), oldUpgrade: u.upgrade });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ===== 7. CREATE GUILD =====
app.post('/api/create-guild', async (req, res) => {
  try {
    const { platform, uniq_id, host_id, guild_name, guild_type } = req.body || {};
    if (!uniq_id || !host_id || !guild_name) return res.json({ success: false, error: 'Thiếu thông tin' });
    const plat = (platform || 'AMO').toUpperCase();
    const u = await fetchUser(plat, uniq_id, host_id);
    const masterObj = { platform: plat, uniq_id, name: u.userName, level: u.level };
    const memberObj = [{}, { pl: plat, un: uniq_id, na: u.userName, he: 0, hl: 0, le: u.level, sc: 0, ti: '2000-01-01 00:00:00', ts: '2000-01-01', tw: '2000-01-01', tb: '2000-01-01' }];
    const payload = {
      PLATFORM: plat, UNIQ_ID: uniq_id, GUILD_NAME: guild_name,
      MASTER: JSON.stringify(masterObj),
      TYPE: parseInt(guild_type) === 2 ? 2 : 1,
      FLAG: JSON.stringify({ color: 'blue', flag: 4, symbol: 8, word: 4 }),
      MEMBER_OBJ: JSON.stringify(memberObj),
      MAX_MEMBER: 30, BUFFER: 5,
      COMMENT: '최초생성', MOBILE_CONNECT: '', GICHAPO: u.gichapo
    };
    const raw = await gamePost('/TOWERDEFENCE_COMMON/GUILD/make_guild_AES2.php', `DATA=${enc(payload, K2, I2)}`);
    if (!raw) return res.json({ success: false, error: 'Server không phản hồi' });
    res.json({ success: true, isOk: isOk(raw), guildName: guild_name, guildType: parseInt(guild_type) });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ===== 8. BOSS PASS =====
app.post('/api/boss-pass', async (req, res) => {
  try {
    const { platform, uniq_id, host_id } = req.body || {};
    if (!uniq_id || !host_id) return res.json({ success: false, error: 'Thiếu thông tin' });
    const plat = (platform || 'AMO').toUpperCase();
    const u = await fetchUser(plat, uniq_id, host_id);
    const payload = {
      PRICE: 1000, NAME: '보스전 패스권 (초급)',
      UNIQ_ID: uniq_id, PLATFORM: plat,
      WHY: 'Boss Fight Pass - Beginner',
      MOBILE_CONNECT: 'AMO', GICHAPO: u.gichapo
    };
    const raw = await gamePost('/TOWERDEFENCE_COMMON/php/put_monthly_subscription.php', `DATA=${enc(payload, K2, I2)}`);
    if (!raw) return res.json({ success: false, error: 'Server không phản hồi' });
    res.json({ success: true, isOk: isOk(raw) });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ===== 9. SCAN GUILD (admin) =====
app.post('/api/scan-guild', async (req, res) => {
  try {
    const { admin_code, guild_bunho } = req.body || {};
    if (!checkAdmin(admin_code)) return res.json({ success: false, error: 'Mã admin không đúng' });
    if (!guild_bunho) return res.json({ success: false, error: 'Thiếu Guild Bunho' });
    const gic = await getFixedGic();
    const payload = {
      PLATFORM: FIXED.platform, UNIQ_ID: FIXED.uid,
      GUILD_BUNHO: parseInt(guild_bunho),
      MY_GUILD_BUNHO: 0, MOBILE_CONNECT: '', GICHAPO: gic
    };
    const raw = await gamePost('/TOWERDEFENCE_COMMON/GUILD/get_guild_info_for_war_AES.php', `DATA=${enc(payload, K1, I1)}`);
    if (!raw) return res.json({ success: false, error: 'Server không phản hồi' });
    const parsed = parseGameResponse(raw, K1, I1);
    if (!parsed.ok) return res.json({ success: false, error: parsed.error });
    const data = parsed.data;
    if (data.RESULT && data.RESULT !== 'OK') return res.json({ success: false, error: data.COMMENT || 'Không tìm thấy guild' });
    const list = data.list || {};
    let master = list.master;
    if (typeof master === 'string') { try { master = JSON.parse(master); } catch (e) { master = {}; } }
    if (!master || typeof master !== 'object') master = {};
    let ml = list.member_list;
    if (typeof ml === 'string') { try { ml = JSON.parse(ml); } catch (e) { ml = []; } }
    if (!Array.isArray(ml)) ml = [];
    ml = ml.filter(m => m && typeof m === 'object' && (m.un || m.uniq_id));
    const mid = master.un || master.uniq_id;
    let members = ml.filter(m => { const x = m.un || m.uniq_id; return x && x !== mid; });
    members.sort((a, b) => (parseInt(b.sc) || 0) - (parseInt(a.sc) || 0));
    let chats = [];
    if (list.guild_chat && typeof list.guild_chat === 'object') {
      for (const k in list.guild_chat) {
        const msg = list.guild_chat[k];
        if (msg && msg.user_name && msg.chat && msg.user_name !== '[[ notice ]]') {
          chats.push({ name: msg.user_name, chat: msg.chat, time: msg.update_time, platform: msg.platform });
        }
      }
      chats.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
    }
    res.json({ success: true, guild: {
      name: list.guild_name || 'N/A', bunho: list.guild_bunho || guild_bunho,
      score: parseInt(list.tot_score) || 0,
      memberCount: members.length + 1, maxMember: parseInt(list.max_member) || 30,
      notice: list.notice || '', type: list.type === '1' ? 'Tự Do' : 'Phê Duyệt',
      master: { name: master.name || master.na || 'N/A', uniqId: mid || 'N/A', level: master.level || '?', platform: master.platform || FIXED.platform },
      members: members.map(m => ({
        name: m.na || m.name || 'N/A', uniqId: m.un || m.uniq_id || 'N/A',
        level: m.le || m.level || '?', score: parseInt(m.sc) || 0,
        platform: m.pl || '?', lastOnline: m.ti || m.tw || 'N/A', hero: m.he || 0
      })),
      chats: chats.slice(0, 30)
    }});
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ===== 10. GET GUILD ID (admin) =====
app.post('/api/get-guild-id', async (req, res) => {
  try {
    const { admin_code, search_word } = req.body || {};
    if (!checkAdmin(admin_code)) return res.json({ success: false, error: 'Mã admin không đúng' });
    if (!search_word) return res.json({ success: false, error: 'Thiếu từ khóa' });
    const gic = await getFixedGic();
    const payload = {
      PLATFORM: FIXED.platform, UNIQ_ID: FIXED.uid,
      SEARCH_WORD: search_word, GUILD_BUNHO: 0,
      MOBILE_CONNECT: '', GICHAPO: gic
    };
    const raw = await gamePost('/TOWERDEFENCE_COMMON/GUILD/get_guild_list_AES2.php', `DATA=${enc(payload, K2, I2)}`);
    if (!raw) return res.json({ success: false, error: 'Server không phản hồi' });
    const parsed = parseGameResponse(raw, K2, I2);
    if (!parsed.ok) return res.json({ success: false, error: parsed.error });
    const data = parsed.data;
    const list = data.list || {};
    const guilds = [];
    for (const k in list) {
      const g = list[k];
      if (!g || !g.guild_name) continue;
      let master = {};
      try { master = typeof g.master === 'string' ? JSON.parse(g.master) : (g.master || {}); } catch (e) { master = {}; }
      guilds.push({
        bunho: g.guild_bunho || k, name: g.guild_name,
        score: parseInt(g.tot_score) || 0,
        member: parseInt(g.member) || 0, maxMember: parseInt(g.max_member) || 30,
        masterName: master.name || 'N/A',
        masterUniqId: master.uniq_id || master.un || 'N/A',
        masterLevel: master.level || '?'
      });
    }
    res.json({ success: true, guilds });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ===== 11. CHECK BLACKLIST (NO ADMIN) =====
function parseBlacklist(raw) {
  if (raw === null || raw === undefined) return { status: 'unknown', label: '⚠️ KHÔNG RÕ (raw null)', detail: '' };
  if (typeof raw === 'object') {
    const res = String(raw.RESULT || raw.result || '').toUpperCase();
    const val = String(raw.VALUE || raw.value || '').toUpperCase();
    const comment = String(raw.COMMENT || raw.comment || '').toUpperCase();
    const bl = raw.black_list !== undefined ? raw.black_list : raw.BLACK_LIST;
    if (bl !== undefined && bl !== null) {
      const blStr = String(bl).toUpperCase();
      if (['0', 'FALSE', 'N', 'NO'].includes(blStr)) return { status: 'clean', label: '✅ KHÔNG TRONG BLACKLIST', detail: `black_list=${blStr}` };
      if (['1', 'TRUE', 'Y', 'YES'].includes(blStr)) return { status: 'black', label: '❌ TRONG BLACKLIST (BỊ BAN)!', detail: `black_list=${blStr}` };
    }
    if (res === 'OK' || res === 'SUCCESS') {
      if (val.includes('NOT_BLACK') || val.includes('CLEAN') || val.includes('NOT BLACK') || val.includes('NOTBLACK')) {
        return { status: 'clean', label: '✅ KHÔNG TRONG BLACKLIST', detail: `RESULT=${res}, VALUE=${val}` };
      }
      if (val.includes('BLACK_LIST') || val.includes('BLACKLIST') || val.includes('BANNED') || val.includes('BLOCKED')) {
        return { status: 'black', label: '❌ TRONG BLACKLIST!', detail: `RESULT=${res}, VALUE=${val}` };
      }
      if (comment.includes('NOT_BLACK') || comment.includes('NOT BLACK')) {
        return { status: 'clean', label: '✅ KHÔNG TRONG BLACKLIST', detail: `COMMENT=${comment}` };
      }
      return { status: 'clean', label: '✅ KHÔNG TRONG BLACKLIST (RESULT=OK)', detail: `RESULT=${res}` };
    }
    if (res === 'FAIL' || res === 'ERROR') {
      return { status: 'black', label: '❌ TRONG BLACKLIST / LỖI', detail: `RESULT=${res}, VALUE=${val}` };
    }
    let jsonStr;
    try { jsonStr = JSON.stringify(raw).toUpperCase(); } catch (e) { jsonStr = String(raw).toUpperCase(); }
    if (jsonStr.includes('NOT_BLACK') || jsonStr.includes('NOT BLACK')) {
      return { status: 'clean', label: '✅ KHÔNG TRONG BLACKLIST', detail: 'Tìm thấy "NOT_BLACK"' };
    }
    if (jsonStr.includes('BLACK_LIST') || jsonStr.includes('BLACKLIST') || jsonStr.includes('BANNED')) {
      return { status: 'black', label: '❌ TRONG BLACKLIST!', detail: 'Tìm thấy "BLACK_LIST"' };
    }
    return { status: 'unknown', label: '⚠️ KHÔNG RÕ', detail: jsonStr.substring(0, 100) };
  }
  const up = String(raw).toUpperCase().trim();
  if (up.includes('NOT_BLACK') || up.includes('NOT BLACK') || up.includes('NOTBLACKLIST') || up.includes('NOT BLACK LIST')) {
    return { status: 'clean', label: '✅ KHÔNG TRONG BLACKLIST', detail: String(raw).substring(0, 100) };
  }
  if (up.includes('BLACK_LIST') || up.includes('BLACKLIST') || up.includes('BLOCKED') || up.includes('BANNED')) {
    return { status: 'black', label: '❌ TRONG BLACKLIST (BỊ BAN)!', detail: String(raw).substring(0, 100) };
  }
  if (up === '1') return { status: 'black', label: '❌ TRONG BLACKLIST (raw=1)', detail: 'Server trả 1 = bị ban' };
  if (up === '0') return { status: 'clean', label: '✅ KHÔNG TRONG BLACKLIST (raw=0)', detail: 'Server trả 0 = clean' };
  if (!up || up === 'NULL' || up === 'UNDEFINED') return { status: 'unknown', label: '⚠️ KHÔNG RÕ (raw rỗng)', detail: '' };
  return { status: 'unknown', label: '⚠️ KHÔNG RÕ', detail: up.substring(0, 100) };
}

app.post('/api/check-blacklist', async (req, res) => {
  try {
    const { platform, uniq_id } = req.body || {};
    if (!uniq_id) return res.json({ success: false, error: 'Thiếu UNIQ_ID' });
    const plat = (platform || 'AMO').toUpperCase();
    if (!['AMO', 'ATV', 'LG', 'SS'].includes(plat)) return res.json({ success: false, error: 'Platform không hợp lệ' });
    const postData = `UNIQ_ID=${encodeURIComponent(uniq_id)}&PLATFORM=${plat}`;
    const raw = await gamePost(`/TOWERDEFENCE_${plat}/check_black_list_db.php`, postData, 20000);
    const parsed = parseBlacklist(raw);
    res.json({
      success: true,
      result: {
        platform: plat,
        uniq_id: uniq_id,
        status: parsed.status,
        label: parsed.label,
        detail: parsed.detail,
        rawPreview: raw ? String(raw).substring(0, 200) : '(null)'
      }
    });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ===== HEALTH =====
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌸 GTD SAKURA V11 (AUTO-INSTALL + FULL INFO) - by Nguyễn Đạt (006) 🌸`);
  console.log(`🌐 http://0.0.0.0:${PORT}`);
  console.log(`🚀 FIXED ACC: ${FIXED.uid} | ${FIXED.host}\n`);
});