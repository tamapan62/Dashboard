(function () {
  const DEFAULT_CONFIG = {
    enabled: true,
    storesCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQz51QMZELZgPyqIWRGUJFqq7b0NJwpQq4rNBCPnKbEk8KIq8Lx8hTwOTvDsLkigqrLUPrbH81wD8Dm/pub?output=csv",
    callsCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSCl9wpZxP3GeGyP-b3865kPRVdI--4auVNA9IshAg7NvpVhvlXLG27GnYZVDwqtb-hgIEwJ5SrTPVY/pub?output=csv",
  };
  const userConfig = window.GOOGLE_SHEETS_CONFIG || {};
  const config = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    storesCsvUrl: userConfig.storesCsvUrl || DEFAULT_CONFIG.storesCsvUrl,
    callsCsvUrl: userConfig.callsCsvUrl || DEFAULT_CONFIG.callsCsvUrl,
  };

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const THAI_MONTHS = new Map([
    ["ม.ค.", 0], ["มกราคม", 0],
    ["ก.พ.", 1], ["กุมภาพันธ์", 1],
    ["มี.ค.", 2], ["มีนาคม", 2],
    ["เม.ย.", 3], ["เมษายน", 3],
    ["พ.ค.", 4], ["พฤษภาคม", 4],
    ["มิ.ย.", 5], ["มิถุนายน", 5],
    ["ก.ค.", 6], ["กรกฎาคม", 6],
    ["ส.ค.", 7], ["สิงหาคม", 7],
    ["ก.ย.", 8], ["กันยายน", 8],
    ["ต.ค.", 9], ["ตุลาคม", 9],
    ["พ.ย.", 10], ["พฤศจิกายน", 10],
    ["ธ.ค.", 11], ["ธันวาคม", 11],
  ]);

  const storeAliases = {
    area: ["area", "retailink area", "พื้นที่", "เขต"],
    team: ["team", "retailink mt", "ทีม"],
    code: ["code", "store code", "store_code", "รหัสสาขา"],
    name: ["name", "store name", "store_name", "ชื่อสาขา", "ชื่อร้าน"],
    gm: ["gm"],
    dept: ["dept", "department", "ฝ่าย", "ผู้ดูแล", "ฝ่ายที่ดูแล"],
    count: ["สาขา", "จำนวนสาขา", "store count", "stores", "branch count", "จำนวน"],
  };

  const callAliases = {
    ticket: ["ticket", "ticket number", "ticket num", "ticket num...", "เลขที่", "เลขที่ใบงาน"],
    storeCode: ["store code", "store_code", "storecode", "รหัสสาขา"],
    storeName: ["store name", "store_name", "storename", "ชื่อสาขา", "ชื่อร้าน"],
    date: ["date", "create date", "created date", "วันที่", "วันที่สร้าง"],
    month: ["month", "month name", "เดือน"],
    area: ["area", "พื้นที่", "เขต"],
    team: ["team", "ทีม"],
    callType: ["call type", "call...", "call", "ประเภท call"],
    equipment: ["equipment", "item", "ci", "อุปกรณ์"],
    problem: ["problem type", "problem", "อาการ", "ปัญหา"],
    system: ["system", "ระบบ"],
    parts: ["damaged parts", "damaged parts (...", "parts", "ชิ้นส่วน"],
    cause: ["cause", "cause สาเหตุ", "สาเหตุ"],
    product: ["product type", "ci_product type", "ci product type", "product", "สินค้า"],
    status: ["status", "job status", "close status", "closed status", "สถานะ", "สถานะงาน", "สถานะปิดงาน"],
    gm: ["gm"],
    dept: ["dept", "department", "ฝ่าย", "ผู้ดูแล", "ฝ่ายที่ดูแล"],
  };

  function cleanText(value) {
    return String(value == null ? "" : value).replace(/^\uFEFF/, "").trim();
  }

  function normalizeHeader(value) {
    return cleanText(value)
      .toLowerCase()
      .replace(/[\s_\-./()[\]{}:]+/g, "")
      .replace(/…/g, "")
      .trim();
  }

  function csvUrl(url) {
    const text = cleanText(url);
    if (!text) return "";
    if (/[?&](output=csv|tqx=out:csv)/i.test(text)) return text;

    const pubMatch = text.match(/^(https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[^/]+)\/pubhtml\?(.+)$/i);
    if (pubMatch) {
      const params = new URLSearchParams(pubMatch[2]);
      params.set("output", "csv");
      return `${pubMatch[1]}/pub?${params.toString()}`;
    }

    const idMatch = text.match(/\/spreadsheets\/d\/([^/]+)/i);
    if (idMatch) {
      const gidMatch = text.match(/[?&#]gid=(\d+)/i);
      const gid = gidMatch ? gidMatch[1] : "0";
      return `https://docs.google.com/spreadsheets/d/${idMatch[1]}/gviz/tq?tqx=out:csv&gid=${gid}`;
    }

    return text;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (char === '"') {
        if (inQuotes && next === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        row.push(cell);
        cell = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") index += 1;
        row.push(cell);
        if (row.some((value) => cleanText(value))) rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }

    row.push(cell);
    if (row.some((value) => cleanText(value))) rows.push(row);
    return rows;
  }

  function toObjects(csvText) {
    const rows = parseCsv(csvText);
    const headers = (rows.shift() || []).map(cleanText);
    return rows.map((row) => {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = cleanText(row[index]);
      });
      return item;
    });
  }

  function pick(row, aliases) {
    const keys = Object.keys(row);
    const normalizedKeys = keys.map((key) => ({ key, normalized: normalizeHeader(key) }));
    for (const alias of aliases) {
      const normalizedAlias = normalizeHeader(alias);
      const exact = normalizedKeys.find((item) => item.normalized === normalizedAlias);
      if (exact && cleanText(row[exact.key])) return cleanText(row[exact.key]);
    }
    for (const alias of aliases) {
      const normalizedAlias = normalizeHeader(alias);
      const partial = normalizedKeys.find((item) =>
        item.normalized.includes(normalizedAlias) || normalizedAlias.includes(item.normalized)
      );
      if (partial && cleanText(row[partial.key])) return cleanText(row[partial.key]);
    }
    return "";
  }

  function numberValue(value) {
    const text = cleanText(value).replace(/,/g, "");
    const match = text.match(/-?\d+(\.\d+)?/);
    return match ? Number(match[0]) : 0;
  }

  function monthHintIndex(value) {
    const text = cleanText(value);
    if (!text) return null;
    const english = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i);
    if (english) {
      const key = english[1].slice(0, 3).toLowerCase();
      const index = MONTHS.findIndex((month) => month.toLowerCase() === key);
      if (index >= 0) return index;
    }
    for (const [name, index] of THAI_MONTHS.entries()) {
      if (text.includes(name)) return index;
    }
    return null;
  }

  function parseDateValue(value, monthHint = "") {
    const text = cleanText(value);
    if (!text) return null;

    let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
      let year = Number(match[1]);
      if (year > 2400) year -= 543;
      const date = new Date(year, Number(match[2]) - 1, Number(match[3]));
      return Number.isNaN(date.getTime()) ? null : date;
    }

    match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (match) {
      const first = Number(match[1]);
      const second = Number(match[2]);
      const rawYear = Number(match[3]);
      let year = rawYear < 100 ? 2000 + rawYear : rawYear;
      if (year > 2400) year -= 543;
      const hintedMonth = monthHintIndex(monthHint);
      let day = first;
      let month = second;
      if (hintedMonth != null) {
        if (first - 1 === hintedMonth) {
          month = first;
          day = second;
        } else if (second - 1 === hintedMonth) {
          month = second;
          day = first;
        }
      } else if (first <= 12 && second <= 12) {
        month = second;
        day = first;
      }
      const date = new Date(year, month - 1, day);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    match = text.match(/^(\d{1,2})\s+([^\s]+)\s+(\d{2,4})/);
    if (match) {
      const day = Number(match[1]);
      const month = THAI_MONTHS.get(match[2]);
      const rawYear = Number(match[3]);
      let year = rawYear < 100 ? 2000 + rawYear : rawYear;
      if (year > 2400) year -= 543;
      if (month != null) {
        const date = new Date(year, month, day);
        return Number.isNaN(date.getTime()) ? null : date;
      }
    }

    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function monthFromDate(value, monthHint = "") {
    const date = parseDateValue(value, monthHint);
    if (!date) return "";
    return `${MONTHS[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}`;
  }

  function areaFromTeam(team) {
    const text = cleanText(team).toUpperCase();
    const match = text.match(/^[A-Z]+/);
    return match ? match[0].replace(/SA$/, "") : "-";
  }

  function mapRow(row, aliases) {
    return Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, pick(row, names)]));
  }

  function mapStores(rows) {
    const stores = [];
    rows.forEach((sourceRow) => {
      const row = mapRow(sourceRow, storeAliases);
      const team = row.team || row.code || "-";
      const count = Math.max(0, Math.round(numberValue(row.count)));

      if (count > 0 && !/^B\d{4,6}$/i.test(row.code)) {
        for (let index = 1; index <= count; index += 1) {
          stores.push({
            area: row.area || areaFromTeam(team),
            team,
            code: `${team}__${String(index).padStart(4, "0")}`,
            name: `${team} สาขา ${index}`,
            gm: row.gm || "-",
            dept: row.dept || "-",
          });
        }
        return;
      }

      if (row.code || row.team || row.name) {
        stores.push({
          area: row.area || areaFromTeam(team),
          team,
          code: row.code || `${team}__0001`,
          name: row.name || row.code || team,
          gm: row.gm || "-",
          dept: row.dept || "-",
        });
      }
    });
    return stores;
  }

  function mapCalls(rows) {
    const calls = rows
      .map((sourceRow) => {
        const item = mapRow(sourceRow, callAliases);
        const parsedDate = parseDateValue(item.date, item.month);
        if (parsedDate) {
          item.date = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}-${String(parsedDate.getDate()).padStart(2, "0")}`;
          item.month = monthFromDate(item.date);
        }
        if (!item.month) item.month = monthFromDate(item.date);
        return item;
      })
      .filter((row) => row.ticket || row.storeCode || row.date);
    const julyCheck = calls.filter((item) => item.date >= "2026-07-01" && item.date <= "2026-07-12").length;
    console.info("Date parser month-aware OK. Jul 1-12 2026 calls:", julyCheck);
    return calls;
  }

  async function fetchCsv(url) {
    const finalUrl = csvUrl(url);
    const response = await fetch(finalUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Google Sheet load failed: ${response.status} ${finalUrl}`);
    return response.text();
  }

  async function loadSheetRows(url, mapper, fallbackRows, label) {
    if (!url) return fallbackRows || [];
    try {
      const rows = mapper(toObjects(await fetchCsv(url)));
      console.info(`${label} Google Sheet rows loaded:`, rows.length);
      return rows.length ? rows : (fallbackRows || []);
    } catch (error) {
      console.warn(`${label} Google Sheet load failed. Using fallback data.`, error);
      return fallbackRows || [];
    }
  }

  function enrichCallsWithStores(calls, stores) {
    const storeByCode = new Map(stores.map((store) => [cleanText(store.code), store]));
    const storeByTeam = new Map();
    stores.forEach((store) => {
      const team = cleanText(store.team);
      if (team && !storeByTeam.has(team)) storeByTeam.set(team, store);
    });

    calls.forEach((call) => {
      const codeStore = storeByCode.get(cleanText(call.storeCode));
      const store = codeStore || storeByTeam.get(cleanText(call.team));
      if (!store) return;
      call.area = store.area || call.area;
      call.team = store.team || call.team;
      call.gm = store.gm || call.gm;
      call.dept = store.dept || call.dept;
      if (codeStore && !String(store.code || "").includes("__")) {
        call.storeName = store.name || call.storeName;
      }
    });
    return calls;
  }

  window.loadDashboardData = async function loadDashboardData() {
    const fallback = window.DASHBOARD_DATA || { stores: [], calls: [] };
    if (!config.enabled || (!config.storesCsvUrl && !config.callsCsvUrl)) return fallback;

    const [stores, calls] = await Promise.all([
      loadSheetRows(config.storesCsvUrl, mapStores, fallback.stores, "Stores"),
      loadSheetRows(config.callsCsvUrl, mapCalls, fallback.calls, "Calls"),
    ]);

    enrichCallsWithStores(calls, stores);

    window.DASHBOARD_DATA = {
      generatedAt: new Date().toISOString(),
      sourceFiles: {
        stores: config.storesCsvUrl ? "Google Sheets" : fallback.sourceFiles?.stores,
        calls: config.callsCsvUrl ? "Google Sheets" : fallback.sourceFiles?.calls,
      },
      stores,
      calls,
    };
    return window.DASHBOARD_DATA;
  };
})();
