'use strict';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3006;
const HOST = '0.0.0.0';
const GAME_HOST = '211.253.26.47';
const GAME_PORT = 8093;

const K1 = Buffer.from('gksekf1djrqjfwk!', 'utf8');
const I1 = Buffer.from('towerdefence_amo', 'utf8');
const K2 = Buffer.from('gksekfidjrqjfwk1', 'utf8');
const I2 = Buffer.from('towerdefense_amo', 'utf8');
const VALID_PLATFORMS = ['AMO', 'ATV', 'LG', 'SS'];

const QUOTA_FILE = path.join(__dirname, 'quota.json');
const DEFAULT_QUOTA = 5;
const BONUS_QUOTA = 363636;
const BONUS_CODE = '060612';
let quotaDB = {};
function loadQuota() {
    try { if (fs.existsSync(QUOTA_FILE)) quotaDB = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf8')); }
    catch (e) { quotaDB = {}; }
}
function saveQuota() { try { fs.writeFileSync(QUOTA_FILE, JSON.stringify(quotaDB, null, 2)); } catch (e) {} }
loadQuota();

function getIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
    return String((req.socket.remoteAddress || req.connection.remoteAddress || 'unknown')).replace(/^::ffff:/, '');
}
function initQuota(ip) {
    if (!quotaDB[ip]) {
        quotaDB[ip] = { remaining: DEFAULT_QUOTA, used: 0, bonusGiven: false, createdAt: Date.now() };
        saveQuota();
    }
    return quotaDB[ip];
}
function consumeQuota(req) {
    const ip = getIp(req);
    const q = initQuota(ip);
    if (q.remaining <= 0) return { ok: false, remaining: 0, error: 'Hết lượt! Nhập code để nhận thêm.' };
    q.remaining--; q.used++; saveQuota();
    return { ok: true, remaining: q.remaining };
}

function gicDefault(p) {
    return ({ AMO:'선택된서버:베트남서버 ping:67ms', ATV:'선택된서버:한국서버 ping:205ms',
        LG:'선택된서버:베트남서버 ping:67ms', SS:'선택된서버:베트남서버 ping:43ms' })[p] || '선택된서버:베트남서버 ping:67ms';
}
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
        const str = String(data).trim().replace(/^"|"$/g, '');
        const d = crypto.createDecipheriv('aes-128-cbc', key, iv);
        return (d.update(str, 'base64', 'utf8') + d.final('utf8')).replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    } catch (e) { return null; }
}
function findGichapo(o) {
    if (!o || typeof o !== 'object') return null;
    if (o.gichapo && typeof o.gichapo === 'string' && o.gichapo.length >= 4) return o.gichapo;
    for (const k in o) { const r = findGichapo(o[k]); if (r) return r; }
    return null;
}
function gamePost(p, body, t = 20000) {
    return new Promise((resolve) => {
        const bodyStr = typeof body === 'string' ? body : new URLSearchParams(body).toString();
        const opts = {
            hostname: GAME_HOST, port: GAME_PORT, path: p, method: 'POST', timeout: t,
            headers: { 'User-Agent': 'app', 'X-Requested-With': 'busidol.mobile.tower',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Accept': '*/*', 'Connection': 'keep-alive',
                'Content-Length': Buffer.byteLength(bodyStr) }
        };
        const req = http.request(opts, (res) => {
            let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
        });
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.on('error', () => resolve(null));
        req.write(bodyStr); req.end();
    });
}
function readJson(req) {
    return new Promise((resolve) => {
        let b = ''; req.on('data', c => b += c);
        req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { resolve({}); } });
        req.on('error', () => resolve({}));
    });
}
function sendJson(res, status, obj) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(obj));
}
const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function handleCheckQuota(req, res) {
    const q = initQuota(getIp(req));
    sendJson(res, 200, { success: true, remaining: q.remaining, used: q.used, bonusGiven: q.bonusGiven });
}
async function handleConsumeQuota(req, res) {
    const r = consumeQuota(req);
    if (!r.ok) return sendJson(res, 200, { success: false, error: r.error, remaining: 0 });
    sendJson(res, 200, { success: true, remaining: r.remaining });
}
async function handleRedeemCode(req, res) {
    const b = await readJson(req);
    const code = String(b.code || '').trim();
    const ip = getIp(req);
    const q = initQuota(ip);
    if (code !== BONUS_CODE) return sendJson(res, 200, { success: false, error: 'Mã không hợp lệ' });
    if (q.bonusGiven) return sendJson(res, 200, { success: false, error: 'Đã nhận code này rồi' });
    q.remaining += BONUS_QUOTA;
    q.bonusGiven = true;
    saveQuota();
    sendJson(res, 200, { success: true, bonus: BONUS_QUOTA, remaining: q.remaining });
}

// ===== FETCH INFO (đầy đủ, không trừ quota) =====
async function fetchUserFull(uniq_id, host_id, platform) {
    const gicDef = gicDefault(platform);
    const payload = { UNIQ_ID: uniq_id, HOST_ID: host_id,
        MOBILE_CONNECT: platform === 'SS' ? 'AMO' : '',
        ANDROID_AD: '', GICHAPO: gicDef, LOCAL_KEY: null };
    if (platform === 'ATV' || platform === 'LG') payload.MODEL_NAME = 'BeyondTV';

    const encrypted = enc(payload, K2, I2);
    if (!encrypted) return { error: 'Mã hóa thất bại' };

    const raw = await gamePost(`/TOWERDEFENCE_${platform}/get_user_data_all_AES2.php`, 'DATA=' + encrypted);
    if (!raw) return { error: 'Không kết nối server game' };

    const decrypted = dec(raw, K2, I2);
    if (!decrypted) return { error: 'Không giải mã được' };

    let data; try { data = JSON.parse(decrypted); }
    catch (e) { return { error: 'Parse JSON thất bại' }; }

    const v = data.VALUE || {};
    const normal = (v.normal && v.normal.value) || {};
    const etc = (v.etc && v.etc.value) || {};
    const rkg = (v.rubydiagold && v.rubydiagold.value) || {};
    const upg = (v.upgrade && v.upgrade.value) || '';
    const stage = (v.stage && v.stage.value) || {};
    const tower = (v.tower && v.tower.value) || {};
    const hero = (v.hero && v.hero.value) || {};
    const guild = (v.guild && v.guild.value) || {};
    const gichapo = findGichapo(data) || gicDef;

    let upgArr = [0, 0, 0];
    if (upg) {
        const p = String(upg).split(',');
        upgArr = [parseInt(p[0]) || 0, parseInt(p[1]) || 0, parseInt(p[2]) || 0];
    }

    const easyArr = (stage.DATA_EASY || "").split(",").filter(Boolean);
    const normalArr = (stage.DATA_NORMAL || "").split(",").filter(Boolean);
    const hardArr = (stage.DATA_HARD || "").split(",").filter(Boolean);
    const towerArr = (tower.bou_tower || "").split(",").filter(Boolean);
    const heroArr = (hero.bou_hero || "").split(",").filter(Boolean);
    const heroOwned = heroArr.filter(h => {
        const p = h.split(":");
        return p.length >= 4 && p[3] === "1";
    }).length;

    return { data: {
        userName: normal.USER_NAME || '???',
        userName2: normal.USER_NAME2 || '',
        level: parseInt(normal.LEVEL) || 1,
        level_exp: parseInt(normal.LEVEL_EXP) || 0,
        gichapo, runCount: parseInt(etc.run_count) || 0,
        ruby: parseInt(rkg.RUBY) || 0,
        dia: parseInt(rkg.DIA) || 0,
        gold: parseInt(rkg.GOLD) || 0,
        magic: parseInt(rkg.MAGIC) || 0,
        mileage: parseInt(rkg.MILEAGE) || 0,
        chul_date: normal.CHUL_DATE || 'N/A',
        chul_num: parseInt(normal.CHUL_NUM) || 0,
        upgrade: upgArr,
        easy_cleared: easyArr.filter(x => x === "A" || x === "C").length,
        easy_total: easyArr.length,
        normal_cleared: normalArr.filter(x => x === "C").length,
        normal_total: normalArr.length,
        hard_cleared: hardArr.filter(x => x === "C").length,
        hard_total: hardArr.length,
        tower_count: towerArr.length,
        hero_owned: heroOwned, hero_total: 60,
        guild_bunho: guild.bunho || guild.BUNHO || '',
        guild_name: guild.name || guild.NAME || '',
        guild_score: parseInt(guild.tot_score || guild.score || 0)
    }};
}

async function handleFetchInfo(req, res) {
    const b = await readJson(req);
    const uniq_id = String(b.uniq_id || '').trim();
    const host_id = String(b.host_id || '').trim();
    const platform = VALID_PLATFORMS.includes(b.platform) ? b.platform : 'AMO';
    if (!uniq_id || !host_id) return sendJson(res, 200, { success: false, error: 'Thiếu UNIQ_ID hoặc HOST_ID' });
    const r = await fetchUserFull(uniq_id, host_id, platform);
    if (r.error) return sendJson(res, 200, { success: false, error: r.error });
    return sendJson(res, 200, { success: true, data: r.data });
}

async function handleFullInfo(req, res) {
    const b = await readJson(req);
    const uniq_id = String(b.uniq_id || '').trim();
    const host_id = String(b.host_id || '').trim();
    const platform = VALID_PLATFORMS.includes(b.platform) ? b.platform : 'AMO';
    if (!uniq_id || !host_id) return sendJson(res, 200, { success: false, error: 'Thiếu UNIQ_ID hoặc HOST_ID' });

    const q = consumeQuota(req);
    if (!q.ok) return sendJson(res, 200, { success: false, error: q.error, remaining: 0, quotaExceeded: true });

    const r = await fetchUserFull(uniq_id, host_id, platform);
    if (r.error) return sendJson(res, 200, { success: false, error: r.error, remaining: q.remaining });
    return sendJson(res, 200, { success: true, data: r.data, remaining: q.remaining });
}

// ===== HACK NAME (100% success) =====
async function handleHackName(req, res) {
    const b = await readJson(req);
    const uniq_id = String(b.uniq_id || '').trim();
    const gichapo = String(b.gichapo || '').trim();
    const new_name = String(b.new_name || '').trim();
    const old_name = String(b.old_name || '').trim();
    const platform = VALID_PLATFORMS.includes(b.platform) ? b.platform : 'AMO';
    if (!uniq_id || !gichapo || !new_name) return sendJson(res, 200, { success: false, error: 'Thiếu thông tin' });

    const q = consumeQuota(req);
    if (!q.ok) return sendJson(res, 200, { success: false, error: q.error, remaining: 0, quotaExceeded: true });

    const params = new URLSearchParams();
    params.append('NAME', new_name);
    params.append('UNIQ_ID', uniq_id);
    params.append('COMMENT', `이름변경:${old_name || ''}-->${new_name}`);
    params.append('PLATFORM', platform);
    params.append('MOBILE_CONNECT', '');
    params.append('GICHAPO', gichapo);

    await gamePost('/TOWERDEFENCE_COMMON/php/check_overlap_name_n_change.php', params.toString());

    return sendJson(res, 200, { success: true, oldName: old_name, newName: new_name, remaining: q.remaining });
}

async function handleMissionOnce(req, res) {
    const b = await readJson(req);
    const uniq_id = String(b.uniq_id || '').trim();
    const host_id = String(b.host_id || '').trim();
    const gichapo = String(b.gichapo || '').trim();
    const platform = VALID_PLATFORMS.includes(b.platform) ? b.platform : 'AMO';
    const i = parseInt(b.index) || 1;
    if (!uniq_id || !gichapo) return sendJson(res, 200, { success: false, ok: false, error: 'Thiếu thông tin' });

    const weeklyStr = `0:0,0:0,0:0,0:0,0:0,0:${i},0:${i},0:${i},0:${i},0:${i}`;
    const comment = platform === 'AMO' ? `주간미션:PVP플레이:${i}` : `[모바일연동됨]주간미션:PVP플레이:${i}`;
    const payload = { UNIQ_ID: uniq_id, HOST_ID: host_id, WEEKLY: weeklyStr, RUN_COUNT: '0',
        COMMENT: comment, MOBILE_CONNECT: (platform === 'SS' || platform === 'LG') ? 'AMO' : '', GICHAPO: gichapo };
    const encrypted = enc(payload, K1, I1);
    if (!encrypted) return sendJson(res, 200, { success: false, ok: false, error: 'Mã hóa lỗi' });

    const raw = await gamePost(`/TOWERDEFENCE_${platform}/put_userinfo_mission_AES.php`, 'DATA=' + encrypted);
    let ok = false, message = '';
    if (raw) {
        const decoded = dec(raw, K1, I1);
        if (decoded) { try { const j = JSON.parse(decoded); if (j.RESULT === 'OK' || j.result === 'ok') ok = true; } catch (e) {} }
        if (!ok && String(raw).toLowerCase().includes('"result":"ok"')) ok = true;
        message = String(raw).substring(0, 120);
    } else message = 'Server không phản hồi';
    return sendJson(res, 200, { success: true, ok, message });
}

function parseBlacklist(raw) {
    if (raw === null || raw === undefined) return { status: 'unknown', label: 'KHÔNG RÕ (null)' };
    const s = String(raw).toUpperCase();
    if (s.includes('NOT_BLACK') || s.includes('NOT BLACK') || s.includes('NOTBLACK')) return { status: 'clean', label: 'KHÔNG TRONG BLACKLIST' };
    if (s.includes('BLACK_LIST') || s.includes('BLACKLIST') || s.includes('BANNED')) return { status: 'black', label: 'TRONG BLACKLIST' };
    const t = String(raw).trim();
    if (t === '1') return { status: 'black', label: 'TRONG BLACKLIST (raw=1)' };
    if (t === '0') return { status: 'clean', label: 'KHÔNG TRONG BLACKLIST (raw=0)' };
    if (t === '') return { status: 'unknown', label: 'KHÔNG RÕ (rỗng)' };
    return { status: 'unknown', label: 'KHÔNG RÕ', detail: t.substring(0, 120) };
}
async function handleCheckBlacklist(req, res) {
    const b = await readJson(req);
    const uniq_id = String(b.uniq_id || '').trim();
    const platform = VALID_PLATFORMS.includes(b.platform) ? b.platform : 'AMO';
    if (!uniq_id) return sendJson(res, 200, { success: false, error: 'Thiếu UNIQ_ID' });

    const q = consumeQuota(req);
    if (!q.ok) return sendJson(res, 200, { success: false, error: q.error, remaining: 0, quotaExceeded: true });

    const raw = await gamePost(`/TOWERDEFENCE_${platform}/check_black_list_db.php`,
        `UNIQ_ID=${encodeURIComponent(uniq_id)}&PLATFORM=${platform}`);
    if (raw === null) return sendJson(res, 200, { success: false, error: 'Không kết nối server game', remaining: q.remaining });
    return sendJson(res, 200, { success: true, platform, uniq_id, result: parseBlacklist(raw), remaining: q.remaining });
}

async function handleHackBossPass(req, res) {
    const b = await readJson(req);
    const uniq_id = String(b.uniq_id || '').trim();
    const gichapo = String(b.gichapo || '').trim();
    const platform = VALID_PLATFORMS.includes(b.platform) ? b.platform : 'AMO';
    let price = parseInt(b.price); if (isNaN(price) || price < 0) price = 1000;
    if (!uniq_id || !gichapo) return sendJson(res, 200, { success: false, error: 'Thiếu thông tin' });

    const q = consumeQuota(req);
    if (!q.ok) return sendJson(res, 200, { success: false, error: q.error, remaining: 0, quotaExceeded: true });

    const payload = { PRICE: price, NAME: '보스전 패스권 (초급)', UNIQ_ID: uniq_id, PLATFORM: platform,
        WHY: 'Boss Fight Pass - Beginner', MOBILE_CONNECT: 'AMO', GICHAPO: gichapo };
    const encrypted = enc(payload, K2, I2);
    if (!encrypted) return sendJson(res, 200, { success: false, error: 'Mã hóa thất bại', remaining: q.remaining });

    const raw = await gamePost('/TOWERDEFENCE_COMMON/php/put_monthly_subscription.php', 'DATA=' + encrypted);
    if (!raw) return sendJson(res, 200, { success: false, error: 'Server không phản hồi', remaining: q.remaining });

    const decoded = dec(raw, K2, I2);
    let isOk = false, message = '';
    if (decoded) { try { const j = JSON.parse(decoded); if (j.RESULT === 'OK' || j.result === 'OK') isOk = true; message = j.COMMENT || j.message || ''; } catch (e) {} }
    if (!isOk) { const s = String(raw).toUpperCase(); if (s.includes('"RESULT":"OK"') || s.includes('성공')) { isOk = true; message = message || 'Kích hoạt thành công'; } }
    return sendJson(res, 200, { success: true, isOk, message: message || String(raw).substring(0, 150), price, platform, remaining: q.remaining });
}

async function handleCreateGuild(req, res) {
    const b = await readJson(req);
    const uniq_id = String(b.uniq_id || '').trim();
    const gichapo = String(b.gichapo || '').trim();
    const platform = VALID_PLATFORMS.includes(b.platform) ? b.platform : 'AMO';
    const guild_name = String(b.guild_name || '').trim();
    const guild_type = parseInt(b.guild_type) || 1;
    const user_name = String(b.user_name || uniq_id);
    const user_level = parseInt(b.user_level) || 1;
    if (!uniq_id || !gichapo || !guild_name) return sendJson(res, 200, { success: false, error: 'Thiếu thông tin' });

    const q = consumeQuota(req);
    if (!q.ok) return sendJson(res, 200, { success: false, error: q.error, remaining: 0, quotaExceeded: true });

    const masterObj = { platform, uniq_id, name: user_name, level: user_level };
    const memberObj = [{}, { pl: platform, un: uniq_id, na: user_name, he: 0, hl: 0, le: user_level, sc: 0,
        ti: "2000-01-01 00:00:00", ts: "2000-01-01", tw: "2000-01-01", tb: "2000-01-01" }];
    const payload = { PLATFORM: platform, UNIQ_ID: uniq_id, GUILD_NAME: guild_name,
        MASTER: JSON.stringify(masterObj), TYPE: guild_type === 2 ? 2 : 1,
        FLAG: JSON.stringify({ color: 'blue', flag: 4, symbol: 8, word: 4 }),
        MEMBER_OBJ: JSON.stringify(memberObj), MAX_MEMBER: 30, BUFFER: 5,
        COMMENT: "최초생성", MOBILE_CONNECT: '', GICHAPO: gichapo };
    const encrypted = enc(payload, K2, I2);
    if (!encrypted) return sendJson(res, 200, { success: false, error: 'Mã hóa thất bại', remaining: q.remaining });
    const raw = await gamePost('/TOWERDEFENCE_COMMON/GUILD/make_guild_AES2.php', 'DATA=' + encrypted);
    if (!raw) return sendJson(res, 200, { success: false, error: 'Server không phản hồi', remaining: q.remaining });

    const decoded = dec(raw, K2, I2);
    let isOk = false, message = '';
    if (decoded) { try { const j = JSON.parse(decoded); if (j.RESULT === 'OK') isOk = true; message = j.COMMENT || j.VALUE || ''; } catch (e) {} }
    if (!isOk) { const s = String(raw).toUpperCase(); if (s.includes('"RESULT":"OK"') || s.includes('성공')) isOk = true; }
    return sendJson(res, 200, { success: true, isOk, message, guildName: guild_name, guildType: guild_type, platform, remaining: q.remaining });
}

async function handleGuildRanking(req, res) {
    const b = await readJson(req);
    const uniq_id = String(b.uniq_id || '').trim();
    const gichapo = String(b.gichapo || '').trim();
    const platform = VALID_PLATFORMS.includes(b.platform) ? b.platform : 'AMO';
    if (!uniq_id || !gichapo) return sendJson(res, 200, { success: false, error: 'Thiếu thông tin' });

    const q = consumeQuota(req);
    if (!q.ok) return sendJson(res, 200, { success: false, error: q.error, remaining: 0, quotaExceeded: true });

    const payload = { PLATFORM: platform, UNIQ_ID: uniq_id,
        SEARCH_WORD: "길드전장점수_내길드순위포함", GUILD_BUNHO: 0, MOBILE_CONNECT: '', GICHAPO: gichapo };
    const encrypted = enc(payload, K2, I2);
    if (!encrypted) return sendJson(res, 200, { success: false, error: 'Mã hóa thất bại', remaining: q.remaining });

    const raw = await gamePost('/TOWERDEFENCE_COMMON/GUILD/get_guild_list_AES2.php', 'DATA=' + encrypted);
    if (!raw) return sendJson(res, 200, { success: false, error: 'Server không phản hồi', remaining: q.remaining });
    const decoded = dec(raw, K2, I2);
    if (!decoded) return sendJson(res, 200, { success: false, error: 'Không giải mã được', remaining: q.remaining });
    let data; try { data = JSON.parse(decoded); }
    catch (e) { return sendJson(res, 200, { success: false, error: 'Parse JSON thất bại', remaining: q.remaining }); }
    const list = data.list || {};
    const guilds = [];
    for (const key in list) {
        const g = list[key];
        if (g && g.guild_name) {
            guilds.push({ bunho: g.guild_bunho || key, name: g.guild_name,
                score: parseInt(g.tot_score) || 0,
                member: parseInt(g.member) || 0, maxMember: parseInt(g.max_member) || 30 });
        }
    }
    guilds.sort((a, b) => b.score - a.score);
    return sendJson(res, 200, { success: true, guilds: guilds.slice(0, 100), total: guilds.length, remaining: q.remaining });
}

async function handleGachaOnce(req, res) {
    const b = await readJson(req);
    const uniq_id = String(b.uniq_id || '').trim();
    const gichapo = String(b.gichapo || '').trim();
    const platform = VALID_PLATFORMS.includes(b.platform) ? b.platform : 'AMO';
    const useType = b.useType !== false;
    let type = String(b.type || '').toUpperCase();
    const pick = parseInt(b.pick) || 1;
    const validTypes = ['RUBY', 'DIA', 'GOLD', 'MAGIC', 'TOWER'];
    if (useType && !validTypes.includes(type)) return sendJson(res, 200, { success: false, ok: false, error: 'Loại quà không hợp lệ' });
    if (!uniq_id || !gichapo) return sendJson(res, 200, { success: false, ok: false, error: 'Thiếu thông tin' });

    const payload = { SGS: true, LANG: 3, TYPE: useType ? type : '', PICK_LAST: pick,
        UNIQ_ID: uniq_id, PLATFORM: platform, MOBILE_CONNECT: '', GICHAPO: gichapo };
    const encrypted = enc(payload, K2, I2);
    if (!encrypted) return sendJson(res, 200, { success: false, ok: false, error: 'Mã hóa lỗi' });

    const raw = await gamePost('/TOWERDEFENCE_COMMON/EVENT_MENU/gacha_event_100.php', 'DATA=' + encrypted);
    let ok = false, message = '';
    if (raw) {
        const decoded = dec(raw, K2, I2);
        if (decoded) { try { const j = JSON.parse(decoded); if (j.RESULT === 'OK') ok = true; } catch (e) {} }
        if (!ok && String(raw).includes('"RESULT":"OK"')) ok = true;
        message = String(raw).substring(0, 100);
    } else message = 'Server không phản hồi';
    return sendJson(res, 200, { success: true, ok, message, type: useType ? type : '(rỗng)', pick });
}

async function handleUpgrade3(req, res) {
    const b = await readJson(req);
    const uniq_id = String(b.uniq_id || '').trim();
    const host_id = String(b.host_id || '').trim();
    const gichapo = String(b.gichapo || '').trim();
    const platform = VALID_PLATFORMS.includes(b.platform) ? b.platform : 'AMO';
    const runCount = parseInt(b.run_count);
    if (!uniq_id || !gichapo) return sendJson(res, 200, { success: false, error: 'Thiếu thông tin' });

    const q = consumeQuota(req);
    if (!q.ok) return sendJson(res, 200, { success: false, error: q.error, remaining: 0, quotaExceeded: true });

    const dataStr = '150,150,150';
    const payload = { UNIQ_ID: uniq_id, HOST_ID: host_id, DATA: dataStr,
        RUN_COUNT: isNaN(runCount) ? 0 : runCount,
        COMMENT: `${dataStr}업그레이드:Custom Power-up`,
        MOBILE_CONNECT: 'AMO', GICHAPO: gichapo };
    const encrypted = enc(payload, K1, I1);
    if (!encrypted) return sendJson(res, 200, { success: false, error: 'Mã hóa thất bại', remaining: q.remaining });

    const raw = await gamePost(`/TOWERDEFENCE_${platform}/put_userinfo_upgrade_AES.php`, 'DATA=' + encrypted);
    if (!raw) return sendJson(res, 200, { success: false, error: 'Server không phản hồi', remaining: q.remaining });

    const decoded = dec(raw, K1, I1);
    let isOk = false, message = '';
    if (decoded) { try { const j = JSON.parse(decoded); if (j.RESULT === 'OK') isOk = true; message = j.COMMENT || j.VALUE || ''; } catch (e) {} }
    if (!isOk && String(raw).includes('"RESULT":"OK"')) isOk = true;
    return sendJson(res, 200, { success: true, isOk, message, data: dataStr, remaining: q.remaining });
}

function serveFile(res, fp, mime) {
    fs.readFile(fp, (err, data) => {
        if (err) { res.writeHead(404); return res.end('<h1>404</h1>'); }
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache, no-store, must-revalidate' });
        res.end(data);
    });
}

const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const p = u.pathname;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    try {
        if (p === '/api/check-quota') return handleCheckQuota(req, res);
        if (p === '/api/consume-quota' && req.method === 'POST') return handleConsumeQuota(req, res);
        if (p === '/api/redeem-code' && req.method === 'POST') return handleRedeemCode(req, res);
        if (p === '/api/fetch-info' && req.method === 'POST') return handleFetchInfo(req, res);
        if (p === '/api/full-info' && req.method === 'POST') return handleFullInfo(req, res);
        if (p === '/api/hack-name' && req.method === 'POST') return handleHackName(req, res);
        if (p === '/api/mission-once' && req.method === 'POST') return handleMissionOnce(req, res);
        if (p === '/api/check-blacklist' && req.method === 'POST') return handleCheckBlacklist(req, res);
        if (p === '/api/hack-boss-pass' && req.method === 'POST') return handleHackBossPass(req, res);
        if (p === '/api/create-guild' && req.method === 'POST') return handleCreateGuild(req, res);
        if (p === '/api/guild-ranking' && req.method === 'POST') return handleGuildRanking(req, res);
        if (p === '/api/gacha-once' && req.method === 'POST') return handleGachaOnce(req, res);
        if (p === '/api/upgrade3' && req.method === 'POST') return handleUpgrade3(req, res);
        if (p === '/health') return sendJson(res, 200, { status: 'ok', ts: Date.now() });
        if (p === '/' || p === '/index.html' || p === '/index6.html')
            return serveFile(res, path.join(__dirname, 'index6.html'), 'text/html; charset=utf-8');
        if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
        res.writeHead(404); res.end('<h1>404</h1>');
    } catch (e) { sendJson(res, 500, { success: false, error: e.message }); }
});

server.listen(PORT, HOST, () => {
    console.log('');
    console.log('\x1b[1;38;5;141m  ╔════════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[1;38;5;141m  ║\x1b[1;38;5;213m  🌸 GTD SAKURA V9 - by Nguyễn Đạt (006) 🌸                     \x1b[1;38;5;141m║\x1b[0m');
    console.log('\x1b[1;38;5;141m  ║\x1b[1;38;5;226m  FULL • NAME • MISSION • BLACK • BOSS • GUILD • BXH • GACHA • UP\x1b[1;38;5;141m║\x1b[0m');
    console.log('\x1b[1;38;5;141m  ╚════════════════════════════════════════════════════════════════╝\x1b[0m');
    console.log('');
    console.log(`  \x1b[1;38;5;118m✓ http://${HOST}:${PORT}\x1b[0m`);
});