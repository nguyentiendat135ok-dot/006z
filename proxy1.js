// proxy.js — GTD VIP Tool v1.9
// Endpoints: /proxy/health, /proxy/check_blacklist, /proxy/get_user_data,
//            /proxy/change_name, /proxy/hack_mission, /proxy/hack_pvp

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const API_HOST = '211.253.26.47';
const API_PORT = 8093;

const K1 = Buffer.from("gksekf1djrqjfwk!", "utf8");
const I1 = Buffer.from("towerdefence_amo", "utf8");
const K2 = Buffer.from("gksekfidjrqjfwk1", "utf8");
const I2 = Buffer.from("towerdefense_amo", "utf8");

function encAES1(data) {
    const c = crypto.createCipheriv("aes-128-cbc", K1, I1);
    const j = typeof data === "string" ? data : JSON.stringify(data).replace(/\s+/g, "");
    return encodeURIComponent(c.update(j, "utf8", "base64") + c.final("base64"));
}
function encAES2(data) {
    const c = crypto.createCipheriv("aes-128-cbc", K2, I2);
    const j = typeof data === "string" ? data : JSON.stringify(data).replace(/\s+/g, "");
    return encodeURIComponent(c.update(j, "utf8", "base64") + c.final("base64"));
}
function decAES2(b64) {
    try {
        const s = String(b64).trim().replace(/^"|"$/g, "");
        const d = crypto.createDecipheriv("aes-128-cbc", K2, I2);
        return (d.update(s, "base64", "utf8") + d.final("utf8")).replace(/[\x00-\x1F\x7F-\x9F]/g, "");
    } catch (e) { return null; }
}

function postToAPI(urlPath, postData, extraHeaders = {}, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const headers = Object.assign({
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent': 'app',
            'X-Requested-With': 'busidol.mobile.tower',
            'Accept': '*/*',
            'Connection': 'keep-alive',
            'Host': `${API_HOST}:${API_PORT}`,
            'Content-Length': Buffer.byteLength(postData)
        }, extraHeaders);
        const req = http.request({
            hostname: API_HOST, port: API_PORT, path: urlPath,
            method: 'POST', timeout, headers
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.on('error', e => reject(e));
        req.write(postData);
        req.end();
    });
}

function findGichapo(o) {
    if (!o || typeof o !== 'object') return null;
    if (o.gichapo && typeof o.gichapo === 'string' && o.gichapo.length >= 4) return o.gichapo;
    for (let k in o) { const r = findGichapo(o[k]); if (r) return r; }
    return null;
}

function parseUserData(decoded) {
    let data;
    try { data = JSON.parse(decoded); }
    catch (e) { return { ok: false, error: 'JSON_PARSE_FAIL', raw: decoded }; }

    if (!data.VALUE) return { ok: false, error: 'NO_VALUE', detail: 'Server không trả VALUE (HOST_ID sai?)', raw: decoded };

    const v = data.VALUE || {};
    const normal = v.normal?.value || {};
    const ryd = v.rubydiagold?.value || {};
    const etc = v.etc?.value || {};
    const stage = v.stage?.value || {};
    const guild = v.guild?.value || {};
    const tower = v.tower?.value || {};
    const hero = v.hero?.value || {};
    const quest = v.quest?.value || {};
    const upgrade = v.upgrade?.value || "0,0,0";

    return {
        ok: true,
        gichapo: findGichapo(data) || '',
        hasUserKey: v.has_user_key || '',
        normal: {
            userName: normal.USER_NAME || '???',
            userName2: normal.USER_NAME2 || '',
            level: parseInt(normal.LEVEL) || 1,
            levelExp: parseInt(normal.LEVEL_EXP) || 0,
            lang: parseInt(normal.LANG) || 3,
            country: normal.COUNTRY || 'KR',
            modelName: normal.MODEL_NAME || ''
        },
        resources: {
            ruby: parseInt(ryd.RUBY) || 0,
            dia: parseInt(ryd.DIA) || 0,
            gold: parseInt(ryd.GOLD) || 0,
            magic: parseInt(ryd.MAGIC) || 0,
            mileage: parseInt(ryd.MILEAGE) || 0
        },
        run: { runCount: parseInt(etc.run_count) || 0, mobileConnect: etc.mobile_connect || '' },
        stage: { dataEasy: stage.DATA_EASY || '', dataNormal: stage.DATA_NORMAL || '', dataHard: stage.DATA_HARD || '' },
        guild: { bunho: guild.bunho || guild.BUNHO || '', name: guild.name || guild.NAME || '', score: parseInt(guild.tot_score || guild.SCORE || 0) },
        tower: { selectedTower: tower.selected_tower || '', bouTower: tower.bou_tower || '' },
        hero: { selectedHero: hero.selected_hero || '', bouHero: hero.bou_hero || '' },
        upgrade, weekly: quest.weekly || '', raw: data
    };
}

function parseBL(raw) {
    if (!raw) return { status: 'unknown', label: '⚠ KHÔNG RÕ', detail: '' };
    const up = String(raw).toUpperCase().trim();
    if (up.includes('NOT_BLACK') || up.includes('CLEAN')) return { status: 'clean', label: '✅ KHÔNG TRONG BLACKLIST', detail: String(raw).substring(0, 150) };
    if (up.includes('BLACK')) return { status: 'banned', label: '❌ TRONG BLACKLIST!', detail: String(raw).substring(0, 150) };
    if (up === '1') return { status: 'banned', label: '❌ TRONG BLACKLIST (raw=1)', detail: '' };
    if (up === '0') return { status: 'clean', label: '✅ KHÔNG TRONG BLACKLIST (raw=0)', detail: '' };
    return { status: 'unknown', label: '⚠ KHÔNG RÕ', detail: String(raw).substring(0, 150) };
}

function randomGic(len = 8) {
    const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let r = '';
    for (let i = 0; i < len; i++) r += c[Math.floor(Math.random() * c.length)];
    return r;
}

async function fetchGichapoAuto(uniq, platform = 'AMO') {
    // 1. Thử lấy từ server time (không cần HOST)
    try {
        const resp = await postToAPI(
            '/TOWERDEFENCE_COMMON/get_server_time_kor.php',
            `UNIQ_ID=${encodeURIComponent(uniq)}&PLATFORM=${platform}&GICHAPO=NULL`
        );
        const j = JSON.parse(resp);
        if (j && j.VALUE && j.VALUE.gichapo) return { gichapo: j.VALUE.gichapo, source: 'server_time' };
    } catch (e) {}
    // 2. Fallback random 8 ký tự
    return { gichapo: randomGic(8), source: 'random' };
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    // ========== HEALTH ==========
    if (req.url === '/proxy/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ ok: true, time: Date.now(), port: PORT, version: '1.9' }));
    }

    // ========== CHECK BLACKLIST ==========
    if (req.url === '/proxy/check_blacklist' && req.method === 'POST') {
        let b = ''; req.on('data', c => b += c);
        req.on('end', async () => {
            try {
                const p = new URLSearchParams(b);
                const uniq = p.get('UNIQ_ID'), sv = p.get('PLATFORM');
                if (!uniq || !sv) { res.writeHead(400); return res.end('{}'); }
                const raw = await postToAPI(
                    `/TOWERDEFENCE_${sv}/check_black_list_db.php`,
                    `UNIQ_ID=${encodeURIComponent(uniq)}&PLATFORM=${sv}`
                );
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ raw, ...parseBL(raw) }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // ========== GET USER DATA ==========
    if (req.url === '/proxy/get_user_data' && req.method === 'POST') {
        let b = ''; req.on('data', c => b += c);
        req.on('end', async () => {
            try {
                const p = new URLSearchParams(b);
                const uniq = p.get('UNIQ_ID');
                const host = p.get('HOST_ID') || 'gibongtran@gmail.com';
                const sv = p.get('PLATFORM');
                if (!uniq || !sv) { res.writeHead(400); return res.end('{}'); }

                const gicMap = {
                    AMO: "선택된서버:베트남서버 ping:67ms",
                    ATV: "선택된서버:한국서버 ping:205ms",
                    LG: "선택된서버:베트남서버 ping:67ms",
                    SS: "선택된서버:베트남서버 ping:43ms"
                };
                const gic = gicMap[sv] || "선택된서버:한국서버 ping:67ms";
                const payload = {
                    UNIQ_ID: uniq, HOST_ID: host,
                    MOBILE_CONNECT: sv === 'SS' ? "AMO" : "",
                    ANDROID_AD: "", GICHAPO: gic, LOCAL_KEY: null
                };
                if (sv === 'ATV' || sv === 'LG') payload.MODEL_NAME = "BeyondTV";

                const raw = await postToAPI(
                    `/TOWERDEFENCE_${sv}/get_user_data_all_AES2.php`,
                    `DATA=${encAES2(payload)}`
                );
                const dec = decAES2(raw);
                if (!dec) {
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    return res.end(JSON.stringify({ ok: false, error: 'DECRYPT_FAIL', detail: 'Không giải mã được response (HOST_ID sai hoặc server lỗi)', raw: String(raw).substring(0, 300) }));
                }
                const parsed = parseUserData(dec);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(parsed.error ? { ...parsed, ok: false } : parsed));
            } catch (e) {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: false, error: 'EXCEPTION', detail: e.message }));
            }
        });
        return;
    }

    // ========== CHANGE NAME ==========
    if (req.url === '/proxy/change_name' && req.method === 'POST') {
        let b = ''; req.on('data', c => b += c);
        req.on('end', async () => {
            try {
                const p = new URLSearchParams(b);
                const uniq = p.get('UNIQ_ID'), nn = p.get('NEW_NAME'), old = p.get('OLD_NAME');
                const sv = p.get('PLATFORM'), gic = p.get('GICHAPO');
                if (!uniq || !nn || !sv) { res.writeHead(400); return res.end('{}'); }

                const raw = await postToAPI(
                    '/TOWERDEFENCE_COMMON/php/check_overlap_name_n_change.php',
                    new URLSearchParams({
                        NAME: nn, UNIQ_ID: uniq,
                        COMMENT: `이름변경:${old}-->${nn}`,
                        PLATFORM: sv, MOBILE_CONNECT: "", GICHAPO: gic || ''
                    }).toString()
                );
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ raw }));
            } catch (e) {
                res.writeHead(200); res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // ========== HACK MISSION ==========
    if (req.url === '/proxy/hack_mission' && req.method === 'POST') {
        let b = ''; req.on('data', c => b += c);
        req.on('end', async () => {
            try {
                const p = new URLSearchParams(b);
                const uniq = p.get('UNIQ_ID'), host = p.get('HOST_ID');
                const sv = p.get('PLATFORM'), gic = p.get('GICHAPO'), i = p.get('I') || '1';
                if (!uniq || !host || !sv || !gic) { res.writeHead(400); return res.end('{}'); }

                const weekly = `0:0,0:0,0:0,0:0,0:0,0:${i},0:${i},0:${i},0:${i},0:${i}`;
                let comment = `주간미션:PVP플레이:${i}`;
                if (sv === 'SS' || sv === 'LG') comment = `[모바일연동됨]${comment}`;

                const payload = {
                    UNIQ_ID: uniq, HOST_ID: host, WEEKLY: weekly,
                    RUN_COUNT: "0", COMMENT: comment,
                    MOBILE_CONNECT: (sv === 'SS' || sv === 'LG') ? 'AMO' : '',
                    GICHAPO: gic
                };
                const raw = await postToAPI(
                    `/TOWERDEFENCE_${sv}/put_userinfo_mission_AES.php`,
                    `DATA=${encAES1(payload)}`
                );
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ raw }));
            } catch (e) {
                res.writeHead(200); res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // ========== HACK PVP (chỉ cần UNIQ_ID) ==========
    if (req.url === '/proxy/hack_pvp' && req.method === 'POST') {
        let b = ''; req.on('data', c => b += c);
        req.on('end', async () => {
            try {
                const p = new URLSearchParams(b);
                const uniq = p.get('UNIQ_ID');
                const num = p.get('FREE_ENTERANCE_NUM');
                if (!uniq || !num) { res.writeHead(400); return res.end('{}'); }

                // Tự lấy GICHAPO (không cần HOST_ID)
                const { gichapo, source } = await fetchGichapoAuto(uniq, 'AMO');

                let numVal = num;
                if (/^-?\d+$/.test(num)) numVal = parseInt(num, 10);

                const payload = {
                    UNIQ_ID: uniq, PLATFORM: 'AMO',
                    FREE_ENTERANCE_NUM: numVal, ETC: numVal,
                    GICHAPO: gichapo
                };
                const raw = await postToAPI(
                    '/TOWERDEFENCE_COMMON/PVP/put_pvp_free_enterance_num_AES.php',
                    `DATA=${encAES1(payload)}`
                );
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ raw, gichapo, source }));
            } catch (e) {
                res.writeHead(200); res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // ========== STATIC FILES ==========
    let fp = req.url === '/' ? '/index.html' : req.url;
    fp = fp.split('?')[0];
    fp = path.join(__dirname, fp);
    if (!fp.startsWith(__dirname)) { res.writeHead(403, { 'Content-Type': 'text/plain' }); return res.end('403'); }
    fs.readFile(fp, (err, data) => {
        if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404 Not Found'); }
        const ext = path.extname(fp);
        const mime = {
            '.html': 'text/html', '.css': 'text/css',
            '.js': 'application/javascript', '.json': 'application/json'
        }[ext] || 'text/plain';
        res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8' });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`\n🔥 GTD VIP Tool v1.9 — http://localhost:${PORT}\n`);
    console.log(`Endpoints:`);
    console.log(`  GET  /proxy/health`);
    console.log(`  POST /proxy/check_blacklist`);
    console.log(`  POST /proxy/get_user_data`);
    console.log(`  POST /proxy/change_name`);
    console.log(`  POST /proxy/hack_mission`);
    console.log(`  POST /proxy/hack_pvp\n`);
});