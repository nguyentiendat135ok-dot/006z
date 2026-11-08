// api16.js - SAKURA TOOL WEB v4 - by 006
// =====================================================
// 🔧 AUTO-INSTALL MODULE - Tự động cài nếu thiếu
// =====================================================
const { execSync } = require('child_process');
const __fs = require('fs');
const __path = require('path');

const REQUIRED_MODULES = ['express', 'axios'];
const missingModules = [];

for (const mod of REQUIRED_MODULES) {
    try {
        require.resolve(mod);
    } catch (e) {
        missingModules.push(mod);
    }
}

if (missingModules.length > 0) {
    console.log('');
    console.log('  ╔════════════════════════════════════════════════════╗');
    console.log('  ║  📦 AUTO-INSTALL MODULES ĐANG THIẾU                ║');
    console.log('  ╠════════════════════════════════════════════════════╣');
    console.log(`  ║  Cần cài: ${missingModules.join(', ').padEnd(39)}║`);
    console.log('  ╚════════════════════════════════════════════════════╝');
    console.log('');
    try {
        execSync(`npm install ${missingModules.join(' ')} --no-audit --no-fund`, {
            stdio: 'inherit',
            cwd: __dirname,
            timeout: 180000
        });
        console.log('');
        console.log('  ✅ Đã cài đặt xong modules, khởi động lại tool...');
        console.log('');
    } catch (err) {
        console.error('');
        console.error('  ❌ CÀI ĐẶT MODULE THẤT BẠI!');
        console.error('  Chi tiết: ' + err.message);
        console.error('');
        console.error('  💡 Thử chạy thủ công: npm install express axios');
        console.error('');
        process.exit(1);
    }
}

// Sau khi đảm bảo có module → require bình thường
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3016;
const GAME_HOST = '211.253.26.47';
const GAME_PORT = 8093;

const K1 = Buffer.from('gksekf1djrqjfwk!', 'utf8');
const I1 = Buffer.from('towerdefence_amo', 'utf8');
const K2 = Buffer.from('gksekfidjrqjfwk1', 'utf8');
const I2 = Buffer.from('towerdefense_amo', 'utf8');

const FIXED_ACC = {
    uniq_id: 'TDM590145qQF_1',
    host_id: 'duongduonghy2021@gmail.com',
    platform: 'AMO'
};

// ===== PROXY =====
let proxyList = [];
let currentProxyIndex = 0;
let autoRotateProxy = false;

function parseProxy(proxyStr) {
    if (!proxyStr || typeof proxyStr !== 'string') return null;
    let s = proxyStr.trim();
    if (!s) return null;
    try {
        let auth = null, hostPort = s;
        if (s.includes('://')) {
            const u = new URL(s);
            hostPort = u.host;
            if (u.username || u.password) {
                auth = { username: decodeURIComponent(u.username || ''), password: decodeURIComponent(u.password || '') };
            }
        } else if (s.includes('@')) {
            const idx = s.lastIndexOf('@');
            const authPart = s.substring(0, idx);
            hostPort = s.substring(idx + 1);
            const [u, p] = authPart.split(':');
            auth = { username: u, password: p || '' };
        }
        const [host, portStr] = hostPort.split(':');
        const port = parseInt(portStr);
        if (!host || !port || isNaN(port)) return null;
        const cfg = { host, port, protocol: 'http' };
        if (auth) cfg.auth = auth;
        return cfg;
    } catch (e) { return null; }
}
function getCurrentProxy() {
    if (proxyList.length === 0) return false;
    if (currentProxyIndex >= proxyList.length) currentProxyIndex = 0;
    return parseProxy(proxyList[currentProxyIndex]) || false;
}
function rotateProxy() {
    if (proxyList.length === 0) return false;
    currentProxyIndex = (currentProxyIndex + 1) % proxyList.length;
    return true;
}

// ===== AES =====
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
function parseResponse(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    try { return JSON.parse(s); } catch (e) { }
    const d2 = dec(s, K2, I2);
    if (d2) { try { return JSON.parse(d2); } catch (e) { } }
    const d1 = dec(s, K1, I1);
    if (d1) { try { return JSON.parse(d1); } catch (e) { } }
    return null;
}

// ===== GAME POST =====
async function gamePost(pathUrl, body, timeout = 20000) {
    const bodyStr = typeof body === 'string' ? body : new URLSearchParams(body).toString();
    const url = `http://${GAME_HOST}:${GAME_PORT}${pathUrl}`;
    const maxAttempts = Math.max(1, proxyList.length);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const proxy = getCurrentProxy();
        try {
            const res = await axios.post(url, bodyStr, {
                headers: {
                    'User-Agent': 'app',
                    'X-Requested-With': 'busidol.mobile.tower',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Accept': '*/*',
                    'Connection': 'keep-alive'
                },
                timeout, validateStatus: () => true,
                proxy: proxy || false,
                maxBodyLength: Infinity, maxContentLength: Infinity
            });
            const raw = res.data;
            const isEmpty = raw === null || raw === undefined
                || (typeof raw === 'string' && raw.trim() === '')
                || (typeof raw === 'object' && Object.keys(raw).length === 0);
            if (isEmpty && autoRotateProxy && proxyList.length > 1) {
                rotateProxy();
                continue;
            }
            return raw;
        } catch (e) {
            if (autoRotateProxy && proxyList.length > 1) {
                rotateProxy();
                continue;
            }
            return null;
        }
    }
    return null;
}

// ===== HELPERS =====
function findGichapo(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.gichapo && typeof obj.gichapo === 'string' && obj.gichapo.length >= 4) return obj.gichapo;
    for (const k in obj) {
        const r = findGichapo(obj[k]);
        if (r) return r;
    }
    return null;
}
async function getFixedGichapo() {
    const gicDefault = '선택된서버:베트남서버 ping:67ms';
    const payload = {
        UNIQ_ID: FIXED_ACC.uniq_id, HOST_ID: FIXED_ACC.host_id,
        MOBILE_CONNECT: '', ANDROID_AD: '', GICHAPO: gicDefault, LOCAL_KEY: null
    };
    const raw = await gamePost('/TOWERDEFENCE_AMO/get_user_data_all_AES2.php', `DATA=${enc(payload, K2, I2)}`);
    if (!raw) return gicDefault;
    const d = dec(raw, K2, I2);
    if (!d) return gicDefault;
    try {
        const j = JSON.parse(d);
        return findGichapo(j) || gicDefault;
    } catch (e) { return gicDefault; }
}
function parseBlacklist(raw) {
    if (raw === null || raw === undefined) return { status: 'unknown', label: '⚠️ KHÔNG RÕ', detail: '' };
    if (typeof raw === 'object') {
        const res = String(raw.RESULT || raw.result || '').toUpperCase();
        const val = String(raw.VALUE || raw.value || '').toUpperCase();
        if (raw.black_list !== undefined && raw.black_list !== null) {
            const bl = String(raw.black_list).toUpperCase();
            if (['0', 'FALSE', 'N', 'NO'].includes(bl)) return { status: 'clean', label: '✅ KHÔNG BLACKLIST' };
            if (['1', 'TRUE', 'Y', 'YES'].includes(bl)) return { status: 'black', label: '❌ TRONG BLACKLIST' };
        }
        if (res === 'OK' || res === 'SUCCESS') {
            if (val.includes('NOT_BLACK') || val.includes('CLEAN')) return { status: 'clean', label: '✅ KHÔNG BLACKLIST' };
            if (val.includes('BLACK_LIST') || val.includes('BANNED')) return { status: 'black', label: '❌ TRONG BLACKLIST' };
            return { status: 'clean', label: '✅ KHÔNG BLACKLIST (OK)' };
        }
        if (res === 'FAIL' || res === 'ERROR') return { status: 'black', label: '❌ TRONG BLACKLIST / LỖI' };
        let s = '';
        try { s = JSON.stringify(raw).toUpperCase(); } catch (e) { s = String(raw).toUpperCase(); }
        if (s.includes('NOT_BLACK')) return { status: 'clean', label: '✅ KHÔNG BLACKLIST' };
        if (s.includes('BLACK_LIST') || s.includes('BANNED')) return { status: 'black', label: '❌ TRONG BLACKLIST' };
        return { status: 'unknown', label: '⚠️ KHÔNG RÕ', detail: s.substring(0, 120) };
    }
    const up = String(raw).toUpperCase();
    if (up.includes('NOT_BLACK')) return { status: 'clean', label: '✅ KHÔNG BLACKLIST' };
    if (up.includes('BLACK_LIST') || up.includes('BANNED')) return { status: 'black', label: '❌ TRONG BLACKLIST' };
    const t = String(raw).trim();
    if (t === '1') return { status: 'black', label: '❌ TRONG BLACKLIST' };
    if (t === '0') return { status: 'clean', label: '✅ KHÔNG BLACKLIST' };
    return { status: 'unknown', label: '⚠️ KHÔNG RÕ', detail: t.substring(0, 120) };
}
function isOkResponse(raw) {
    if (!raw) return false;
    const p = parseResponse(raw);
    if (p && (p.RESULT === 'OK' || p.result === 'ok' || p.RESULT === 'ok')) return true;
    const s = String(raw).toLowerCase();
    if (s.includes('"result":"ok"')) return true;
    if (String(raw).includes('성공')) return true;
    return false;
}

// ===== MIDDLEWARE =====
app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// ==================== PROXY ====================
app.get('/api/proxy/status', (req, res) => {
    res.json({
        ok: true, proxies: proxyList, total: proxyList.length,
        index: currentProxyIndex, current: proxyList[currentProxyIndex] || null,
        auto: autoRotateProxy
    });
});
app.post('/api/proxy/set', (req, res) => {
    const { proxies, auto } = req.body || {};
    if (Array.isArray(proxies)) {
        proxyList = proxies.filter(p => typeof p === 'string' && p.trim()).map(p => p.trim());
        currentProxyIndex = 0;
    }
    if (typeof auto === 'boolean') autoRotateProxy = auto;
    res.json({ ok: true, total: proxyList.length, current: proxyList[currentProxyIndex] || null, auto: autoRotateProxy });
});
app.post('/api/proxy/rotate', (req, res) => {
    const ok = rotateProxy();
    res.json({ ok, total: proxyList.length, index: currentProxyIndex, current: proxyList[currentProxyIndex] || null, auto: autoRotateProxy });
});

// ==================== FETCH USER ====================
app.post('/api/fetch-user', async (req, res) => {
    const { uid, host, platform } = req.body || {};
    if (!uid || !host) return res.json({ success: false, error: 'Thiếu UID hoặc HOST' });

    const plat = ['AMO', 'ATV', 'LG', 'SS'].includes(platform) ? platform : 'AMO';
    const gicDefault = {
        AMO: '선택된서버:베트남서버 ping:67ms', ATV: '선택된서버:한국서버 ping:205ms',
        LG: '선택된서버:베트남서버 ping:67ms', SS: '선택된서버:베트남서버 ping:43ms'
    }[plat];

    const payload = {
        UNIQ_ID: uid, HOST_ID: host,
        MOBILE_CONNECT: plat === 'SS' ? 'AMO' : '',
        ANDROID_AD: '', GICHAPO: gicDefault, LOCAL_KEY: null
    };
    if (plat === 'ATV' || plat === 'LG') payload.MODEL_NAME = 'BeyondTV';

    const raw = await gamePost(`/TOWERDEFENCE_${plat}/get_user_data_all_AES2.php`, `DATA=${enc(payload, K2, I2)}`);
    if (!raw) return res.json({ success: false, error: 'Không kết nối server game' });

    const decrypted = dec(raw, K2, I2);
    if (!decrypted) return res.json({ success: false, error: 'Không giải mã được' });

    let data;
    try { data = JSON.parse(decrypted); }
    catch (e) { return res.json({ success: false, error: 'Parse JSON thất bại' }); }

    const v = data.VALUE || {};
    const normal = v.normal?.value || {};
    const etc = v.etc?.value || {};
    const rdg = v.rubydiagold?.value || {};
    const stage = v.stage?.value || {};
    const towerData = v.tower?.value || {};
    const heroData = v.hero?.value || {};
    const guildData = v.guild?.value || {};
    const gichapo = findGichapo(data) || gicDefault;

    const towers = (towerData.bou_tower || '').split(',').filter(Boolean).map(t => {
        const p = t.split(':');
        return { id: parseInt(p[0]) || 0, level: parseInt(p[1]) || 1, star: parseInt(p[2]) || 1 };
    });
    const heroes = (heroData.bou_hero || '').split(',').filter(Boolean).map(h => {
        const p = h.split(':');
        return { id: parseInt(p[0]) || 0, level: parseInt(p[1]) || 1, exp: parseInt(p[2]) || 0, unlocked: parseInt(p[3]) || 0 };
    }).filter(h => h.unlocked === 1);

    const easyArr = (stage.DATA_EASY || '').split(',').filter(Boolean);
    const normalArr = (stage.DATA_NORMAL || '').split(',').filter(Boolean);
    const hardArr = (stage.DATA_HARD || '').split(',').filter(Boolean);

    res.json({
        success: true,
        data: {
            userName: normal.USER_NAME || '???',
            userName2: normal.USER_NAME2 || '',
            level: parseInt(normal.LEVEL) || 1,
            level_exp: parseInt(normal.LEVEL_EXP) || 0,
            country: normal.COUNTRY || 'N/A',
            model_name: normal.MODEL_NAME || 'N/A',
            run_count: parseInt(etc.run_count) || 0,
            ruby: parseInt(rdg.RUBY) || 0,
            dia: parseInt(rdg.DIA) || 0,
            gold: parseInt(rdg.GOLD) || 0,
            magic: parseInt(rdg.MAGIC) || 0,
            mileage: parseInt(rdg.MILEAGE) || 0,
            chul_num: parseInt(normal.CHUL_NUM) || 0,
            chul_date: String(normal.CHUL_DATE || 'N/A'),
            gichapo, towers, heroes,
            easy_total: easyArr.length, easy_cleared: easyArr.filter(x => x === 'A' || x === 'C').length,
            normal_total: normalArr.length, normal_cleared: normalArr.filter(x => x === 'C').length,
            hard_total: hardArr.length, hard_cleared: hardArr.filter(x => x === 'C').length,
            guild_bunho: String(guildData.bunho || guildData.BUNHO || ''),
            guild_name: String(guildData.name || guildData.NAME || ''),
            guild_score: parseInt(guildData.tot_score || guildData.score || 0)
        }
    });
});

// ==================== GUILD INFO ====================
app.post('/api/guild-info', async (req, res) => {
    const { guild_bunho } = req.body || {};
    if (!guild_bunho) return res.json({ success: false, error: 'Thiếu ID bang' });

    const gichapo = await getFixedGichapo();
    const payload = {
        PLATFORM: 'AMO', UNIQ_ID: FIXED_ACC.uniq_id,
        GUILD_BUNHO: parseInt(guild_bunho), MY_GUILD_BUNHO: 0,
        MOBILE_CONNECT: '', GICHAPO: gichapo
    };

    const raw = await gamePost('/TOWERDEFENCE_COMMON/GUILD/get_guild_info_for_war_AES.php', `DATA=${enc(payload, K1, I1)}`);
    if (!raw) return res.json({ success: false, error: 'Server không phản hồi' });

    const decoded = dec(raw, K1, I1);
    if (!decoded) return res.json({ success: false, error: 'Không giải mã được response' });

    let result;
    try { result = JSON.parse(decoded); }
    catch (e) { return res.json({ success: false, error: 'Parse JSON thất bại' }); }

    if (!result.list) return res.json({ success: false, error: result.COMMENT || 'Không có dữ liệu bang' });

    const list = result.list;
    let master = list.master;
    if (typeof master === 'string') { try { master = JSON.parse(master); } catch (e) { master = {}; } }
    if (!master || typeof master !== 'object') master = {};

    let memberList = list.member_list;
    if (typeof memberList === 'string') { try { memberList = JSON.parse(memberList); } catch (e) { memberList = []; } }
    if (!Array.isArray(memberList)) memberList = [];
    memberList = memberList.filter(m => m && typeof m === 'object' && (m.un || m.uniq_id));

    const masterId = master.un || master.uniq_id;
    const members = memberList.filter(m => {
        const mid = m.un || m.uniq_id;
        return mid && mid !== masterId;
    }).sort((a, b) => (parseInt(b.sc) || 0) - (parseInt(a.sc) || 0));

    const masterMember = {
        un: masterId, na: master.name || master.na || 'N/A',
        le: master.level || master.le || 0, he: master.hero || master.he || 0,
        hl: master.hero_level || master.hl || 0, sc: master.score || master.sc || 0,
        pl: master.platform || master.pl || 'AMO',
        ti: master.update_time || master.ti || '',
        tw: master.tw || '', ts: master.ts || '', tb: master.tb || ''
    };
    const allMembers = masterMember.un ? [masterMember, ...members] : members;

    res.json({
        success: true,
        data: {
            guild_name: list.guild_name || 'N/A',
            guild_bunho: list.guild_bunho || guild_bunho,
            tot_score: parseInt(list.tot_score || 0),
            max_member: parseInt(list.max_member || 30),
            type: list.type || '1',
            notice: list.notice || '',
            master: {
                name: master.name || 'N/A',
                id: masterId || 'N/A',
                level: master.level || '?',
                platform: master.platform || master.pl || 'AMO'
            },
            members: allMembers.map(m => ({
                uniq_id: m.un || m.uniq_id || 'N/A',
                name: m.na || m.name || 'N/A',
                level: m.le || m.level || 0,
                hero_count: m.he || 0, hero_level: m.hl || 0,
                score: m.sc || 0, platform: m.pl || 'N/A',
                update_time: m.ti || '', ts: m.ts || '', tw: m.tw || '', tb: m.tb || ''
            }))
        }
    });
});

// ==================== GUILD SEARCH ====================
app.post('/api/guild-search', async (req, res) => {
    const { search_word } = req.body || {};
    if (!search_word) return res.json({ success: false, error: 'Thiếu từ khóa' });
    const gichapo = await getFixedGichapo();
    const payload = {
        PLATFORM: 'AMO', UNIQ_ID: FIXED_ACC.uniq_id,
        SEARCH_WORD: search_word, GUILD_BUNHO: 0,
        MOBILE_CONNECT: '', GICHAPO: gichapo
    };
    const raw = await gamePost('/TOWERDEFENCE_COMMON/GUILD/get_guild_list_AES2.php', `DATA=${enc(payload, K2, I2)}`);
    if (!raw) return res.json({ success: false, error: 'Server không phản hồi' });
    const decoded = dec(raw, K2, I2);
    if (!decoded) return res.json({ success: false, error: 'Không giải mã được' });
    let data;
    try { data = JSON.parse(decoded); } catch (e) { return res.json({ success: false, error: 'Parse thất bại' }); }
    const list = data.list || {};
    const guilds = [];
    for (const key in list) {
        const g = list[key];
        if (g && g.guild_name) {
            let mName = 'N/A', mId = 'N/A', mLv = '?';
            try {
                const m = JSON.parse(g.master || '{}');
                mName = m.name || 'N/A';
                mId = m.uniq_id || m.un || 'N/A';
                mLv = m.level || '?';
            } catch (e) { }
            guilds.push({
                id: g.guild_bunho || key, name: g.guild_name,
                master_name: mName, master_id: mId, master_level: mLv,
                member: parseInt(g.member) || 0,
                maxMember: parseInt(g.max_member) || 30,
                score: parseInt(g.tot_score) || 0,
                type: g.type || '1'
            });
        }
    }
    res.json({ success: true, guilds, total: guilds.length });
});

// ==================== GUILD RANKING ====================
app.post('/api/guild-ranking', async (req, res) => {
    const gichapo = await getFixedGichapo();
    const payload = {
        PLATFORM: 'AMO', UNIQ_ID: FIXED_ACC.uniq_id,
        SEARCH_WORD: '길드전장점수_내길드순위포함',
        GUILD_BUNHO: 0, MOBILE_CONNECT: '', GICHAPO: gichapo
    };
    const raw = await gamePost('/TOWERDEFENCE_COMMON/GUILD/get_guild_list_AES2.php', `DATA=${enc(payload, K2, I2)}`);
    if (!raw) return res.json({ success: false, error: 'Server không phản hồi' });
    const decoded = dec(raw, K2, I2);
    if (!decoded) return res.json({ success: false, error: 'Không giải mã được' });
    let data;
    try { data = JSON.parse(decoded); } catch (e) { return res.json({ success: false, error: 'Parse thất bại' }); }
    const list = data.list || {};
    const guilds = [];
    for (const key in list) {
        const g = list[key];
        if (g && g.guild_name && g.tot_score) {
            guilds.push({
                id: g.guild_bunho || key, name: g.guild_name,
                score: parseInt(g.tot_score) || 0,
                member: parseInt(g.member) || 0,
                maxMember: parseInt(g.max_member) || 30
            });
        }
    }
    guilds.sort((a, b) => b.score - a.score);
    res.json({ success: true, guilds: guilds.slice(0, 100), total: guilds.length });
});

// ==================== BLACKLIST ====================
app.post('/api/check-blacklist', async (req, res) => {
    const { uid, platform } = req.body || {};
    if (!uid) return res.json({ success: false, error: 'Thiếu UID' });
    if (!['AMO', 'ATV', 'LG', 'SS'].includes(platform))
        return res.json({ success: false, error: 'Platform không hợp lệ' });
    const postData = `UNIQ_ID=${encodeURIComponent(uid)}&PLATFORM=${platform}`;
    const raw = await gamePost(`/TOWERDEFENCE_${platform}/check_black_list_db.php`, postData);
    const parsed = parseBlacklist(raw);
    res.json({
        success: true,
        result: { platform, status: parsed.status, label: parsed.label, detail: parsed.detail || '' }
    });
});

// ==================== CREATE GUILD ====================
app.post('/api/create-guild', async (req, res) => {
    const { uid, host, platform, guild_name, guild_type, max_member } = req.body || {};
    if (!uid || !host || !guild_name)
        return res.json({ success: false, error: 'Thiếu UID/HOST/Tên bang' });

    const plat = ['AMO', 'ATV', 'LG', 'SS'].includes(platform) ? platform : 'AMO';
    const gicDefault = {
        AMO: '선택된서버:베트남서버 ping:67ms', ATV: '선택된서버:한국서버 ping:205ms',
        LG: '선택된서버:베트남서버 ping:67ms', SS: '선택된서버:베트남서버 ping:43ms'
    }[plat];

    const userPayload = {
        UNIQ_ID: uid, HOST_ID: host,
        MOBILE_CONNECT: plat === 'SS' ? 'AMO' : '',
        ANDROID_AD: '', GICHAPO: gicDefault, LOCAL_KEY: null
    };
    if (plat === 'ATV' || plat === 'LG') userPayload.MODEL_NAME = 'BeyondTV';

    const userRaw = await gamePost(`/TOWERDEFENCE_${plat}/get_user_data_all_AES2.php`, `DATA=${enc(userPayload, K2, I2)}`);
    if (!userRaw) return res.json({ success: false, error: 'Không lấy được data user' });
    const userDec = dec(userRaw, K2, I2);
    if (!userDec) return res.json({ success: false, error: 'Không giải mã được user data' });

    let userData;
    try { userData = JSON.parse(userDec); }
    catch (e) { return res.json({ success: false, error: 'Parse user data thất bại' }); }

    const v = userData.VALUE || {};
    const normal = v.normal?.value || {};
    const gichapo = findGichapo(userData) || gicDefault;
    const userName = normal.USER_NAME || uid;
    const userLevel = parseInt(normal.LEVEL) || 1;

    const colors = ['red', 'green', 'blue', 'yellow', 'purple', 'orange', 'pink', 'brown'];
    const flagObj = {
        color: colors[Math.floor(Math.random() * colors.length)],
        flag: Math.floor(Math.random() * 10) + 1,
        symbol: Math.floor(Math.random() * 50) + 1,
        word: Math.floor(Math.random() * 30) + 1
    };
    const masterObj = { platform: plat, uniq_id: uid, name: userName, level: userLevel };
    const memberObj = [
        {},
        { pl: plat, un: uid, na: userName, he: 0, hl: 0, le: userLevel, sc: 0,
          ti: '2000-01-01 00:00:00', ts: '2000-01-01', tw: '2000-01-01', tb: '2000-01-01' }
    ];

    const createPayload = {
        PLATFORM: plat, UNIQ_ID: uid, GUILD_NAME: guild_name,
        MASTER: JSON.stringify(masterObj),
        TYPE: (guild_type === 2 || guild_type === '2') ? 2 : 1,
        FLAG: JSON.stringify(flagObj),
        MEMBER_OBJ: JSON.stringify(memberObj),
        MAX_MEMBER: parseInt(max_member) || 30, BUFFER: 5,
        COMMENT: '최초생성', MOBILE_CONNECT: '', GICHAPO: gichapo
    };

    const createRaw = await gamePost('/TOWERDEFENCE_COMMON/GUILD/make_guild_AES2.php', `DATA=${enc(createPayload, K2, I2)}`);
    if (!createRaw) return res.json({ success: false, error: 'Server không phản hồi khi tạo bang' });

    const isOk = isOkResponse(createRaw);
    const parsed = parseResponse(createRaw);
    res.json({
        success: true, isOk,
        guild_name, user_name: userName, user_level: userLevel,
        raw: String(createRaw).substring(0, 400),
        comment: parsed ? (parsed.COMMENT || parsed.VALUE || '') : ''
    });
});

// ==================== LEAVE GUILD ====================
app.post('/api/leave-guild', async (req, res) => {
    const { uid, platform, guild_id, gichapo, use_fixed } = req.body || {};
    if (!uid || !guild_id)
        return res.json({ success: false, error: 'Thiếu UID hoặc ID Bang' });

    let finalGichapo = gichapo;
    if (!finalGichapo || use_fixed) {
        finalGichapo = await getFixedGichapo();
    }
    const finalPlatform = ['AMO', 'ATV', 'LG', 'SS'].includes(platform) ? platform : 'AMO';

    const payload = {
        PLATFORM: finalPlatform, UNIQ_ID: uid, DEL_UNIQ_ID: uid,
        GUILD_BUNHO: parseInt(guild_id),
        TYPE: '탈퇴',
        COMMENT: `자진탈퇴(${uid})`,
        MOBILE_CONNECT: '', GICHAPO: finalGichapo
    };

    const raw = await gamePost('/TOWERDEFENCE_COMMON/GUILD/guild_member_del_AES.php', `DATA=${enc(payload, K1, I1)}`);
    if (!raw) return res.json({ success: false, error: 'Server không phản hồi' });

    const parsed = parseResponse(raw);
    const isOk = isOkResponse(raw);
    res.json({
        success: true, isOk,
        comment: parsed ? (parsed.COMMENT || parsed.VALUE || '') : '',
        raw: String(raw).substring(0, 400)
    });
});

// ==================== KICK MEMBER ====================
app.post('/api/kick-member', async (req, res) => {
    const { platform, master_uid, guild_id, target_uid, gichapo, use_fixed } = req.body || {};
    if (!master_uid || !guild_id || !target_uid)
        return res.json({ success: false, error: 'Thiếu master_uid / guild_id / target_uid' });

    let finalGichapo = gichapo;
    if (!finalGichapo || use_fixed) {
        finalGichapo = await getFixedGichapo();
    }
    const finalPlatform = ['AMO', 'ATV', 'LG', 'SS'].includes(platform) ? platform : 'AMO';

    const payload = {
        PLATFORM: finalPlatform, UNIQ_ID: master_uid,
        DEL_UNIQ_ID: target_uid,
        GUILD_BUNHO: parseInt(guild_id),
        TYPE: '추방',
        COMMENT: `추방함(${target_uid})`,
        MOBILE_CONNECT: '', GICHAPO: finalGichapo
    };

    const raw = await gamePost('/TOWERDEFENCE_COMMON/GUILD/guild_member_del_AES.php', `DATA=${enc(payload, K1, I1)}`);
    if (!raw) return res.json({ success: false, error: 'Server không phản hồi' });

    const parsed = parseResponse(raw);
    const isOk = isOkResponse(raw);
    res.json({
        success: true, isOk,
        target_uid,
        comment: parsed ? (parsed.COMMENT || parsed.VALUE || '') : '',
        raw: String(raw).substring(0, 400)
    });
});

// ==================== TRANSFER MASTER ====================
app.post('/api/transfer-master', async (req, res) => {
    const { platform, guild_id, old_master_uid, new_master_uid, new_master_name, new_master_level, gichapo, use_fixed } = req.body || {};
    if (!guild_id || !old_master_uid || !new_master_uid || !new_master_name)
        return res.json({ success: false, error: 'Thiếu thông tin (guild_id, old_master_uid, new_master_uid, new_master_name)' });

    let finalGichapo = gichapo;
    if (!finalGichapo || use_fixed) {
        finalGichapo = await getFixedGichapo();
    }
    const finalPlatform = ['AMO', 'ATV', 'LG', 'SS'].includes(platform) ? platform : 'AMO';

    const masterObj = {
        platform: finalPlatform,
        uniq_id: new_master_uid,
        name: new_master_name,
        level: parseInt(new_master_level) || 1
    };

    const payload = {
        PLATFORM: finalPlatform, UNIQ_ID: old_master_uid,
        DELEGATE_UNIQ_ID: new_master_uid,
        DELEGATE_PLATFORM: finalPlatform,
        GUILD_BUNHO: parseInt(guild_id),
        MASTER: JSON.stringify(masterObj),
        COMMENT: `길드장위임 ${old_master_uid}->${new_master_uid}`,
        MOBILE_CONNECT: '', GICHAPO: finalGichapo
    };

    const raw = await gamePost('/TOWERDEFENCE_COMMON/GUILD/guild_delegate_AES.php', `DATA=${enc(payload, K1, I1)}`);
    if (!raw) return res.json({ success: false, error: 'Server không phản hồi' });

    const parsed = parseResponse(raw);
    const isOk = isOkResponse(raw);
    res.json({
        success: true, isOk,
        new_master: new_master_name + ' (' + new_master_uid + ')',
        comment: parsed ? (parsed.COMMENT || parsed.VALUE || '') : '',
        raw: String(raw).substring(0, 400)
    });
});

// ==================== SERVE ====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index16.html')));
app.use((req, res) => res.status(404).send('404'));

app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  ╔════════════════════════════════════════════════════╗');
    console.log('  ║   🌸 SAKURA TOOL WEB v4 - API by 006 🌸           ║');
    console.log('  ╠════════════════════════════════════════════════════╣');
    console.log(`  ║  🌐 http://localhost:${PORT}`);
    console.log(`  ║  📡 Game : ${GAME_HOST}:${GAME_PORT}`);
    console.log('  ╠════════════════════════════════════════════════════╣');
    console.log('  ║  ✅ Auto-install modules: BẬT                     ║');
    console.log('  ║  ✨ Features:                                      ║');
    console.log('  ║    • Soi full bang / Lấy ID bang / Top 100         ║');
    console.log('  ║    • Check Blacklist / Full Info Acc               ║');
    console.log('  ║    • Tạo Bang / Rời Bang / Kick / Chuyển Chủ       ║');
    console.log('  ║    • Proxy Manager (auto rotate)                   ║');
    console.log('  ╚════════════════════════════════════════════════════╝');
    console.log('');
});