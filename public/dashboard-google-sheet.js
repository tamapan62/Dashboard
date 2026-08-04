(function () {
  const DEFAULT_CONFIG = {
    enabled: true,
    storesCsvUrl:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vRuiyu9L_E4nUxC6ixeEjD3YCE7_DxyB0cFd9nAxIEFRsF7RVynDQhUbsMmjhuguA/pub?output=csv",
    callsCsvUrl:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQz51QMZELZgPyqIWRGUJFqq7b0NJwpQq4rNBCPnKbEk8KIq8Lx8hTwOTvDsLkigqrLUPrbH81wD8Dm/pub?output=csv",
  };
  const userConfig = window.GOOGLE_SHEETS_CONFIG || {};
  const config = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    storesCsvUrl: userConfig.storesCsvUrl || DEFAULT_CONFIG.storesCsvUrl,
    callsCsvUrl: userConfig.callsCsvUrl || DEFAULT_CONFIG.callsCsvUrl,
  };
  const CACHE_DB_NAME = "stat-cpr-dashboard-cache";
  const CACHE_STORE_NAME = "dashboard-data";
  const CACHE_KEY = ["v11-dynamic-call-schema", config.storesCsvUrl, config.callsCsvUrl].join("|");
  const CALL_HEADER_SCAN_RANGE = "A1:ZZ1";
  const CALL_FALLBACK_LAST_COLUMN = "W";
  const CALL_RECENT_FALLBACK_RANGE = `A100000:${CALL_FALLBACK_LAST_COLUMN}200000`;
  const CALL_HISTORY_ROW_RANGES = [
    [1, 20000],
    [20001, 40000],
    [40001, 60000],
    [60001, 80000],
    [80001, 100000],
    [100001, 130000],
  ];

  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const THAI_MONTHS = new Map([
    ["ม.ค.", 0],
    ["มกราคม", 0],
    ["ก.พ.", 1],
    ["กุมภาพันธ์", 1],
    ["มี.ค.", 2],
    ["มีนาคม", 2],
    ["เม.ย.", 3],
    ["เมษายน", 3],
    ["พ.ค.", 4],
    ["พฤษภาคม", 4],
    ["มิ.ย.", 5],
    ["มิถุนายน", 5],
    ["ก.ค.", 6],
    ["กรกฎาคม", 6],
    ["ส.ค.", 7],
    ["สิงหาคม", 7],
    ["ก.ย.", 8],
    ["กันยายน", 8],
    ["ต.ค.", 9],
    ["ตุลาคม", 9],
    ["พ.ย.", 10],
    ["พฤศจิกายน", 10],
    ["ธ.ค.", 11],
    ["ธันวาคม", 11],
  ]);

  const storeAliases = {
    area: ["area", "retailink area", "พื้นที่", "เขต"],
    team: ["team", "retailink mt", "ทีม"],
    code: ["code", "store code", "store_code", "รหัสสาขา"],
    name: ["name", "store name", "store_name", "ชื่อสาขา", "ชื่อร้าน"],
    gm: ["gm"],
    dept: ["dept", "department", "ฝ่าย", "ผู้ดูแล", "ฝ่ายที่ดูแล"],
    count: [
      "สาขา",
      "จำนวนสาขา",
      "store count",
      "stores",
      "branch count",
      "จำนวน",
    ],
  };

  const callAliases = {
    ticket: [
      "ticket",
      "ticket_number",
      "ticket_num",
      "ticket number",
      "ticket num",
      "ticket num...",
      "เลขที่",
      "เลขที่ใบงาน",
    ],
    storeCode: ["store code", "store_code", "storecode", "รหัสสาขา"],
    storeName: [
      "store name",
      "store_name",
      "storename",
      "ชื่อสาขา",
      "ชื่อร้าน",
    ],
    date: ["date", "create_date", "create date", "created date", "วันที่", "วันที่สร้าง"],
    month: ["month", "month name", "เดือน"],
    area: ["area", "พื้นที่", "เขต"],
    team: ["team", "ทีม"],
    callType: ["call_type", "call type", "type_call", "call...", "call", "ประเภท call"],
    equipment: ["equipment", "item", "ci", "อุปกรณ์"],
    ageEquipment: ["age_equipment"],
    problem: ["problem type", "problem", "อาการ", "ปัญหา"],
    system: ["system", "ระบบ"],
    parts: ["damage", "damaged parts", "damaged parts (...", "parts", "ชิ้นส่วน"],
    cause: ["cause", "cause สาเหตุ", "สาเหตุ"],
    product: [
      "product type",
      "product_type",
      "product_t",
      "ci_product type",
      "ci product type",
      "product",
      "สินค้า",
    ],
    status: [
      "status",
      "job status",
      "close status",
      "closed status",
      "สถานะ",
      "สถานะงาน",
      "สถานะปิดงาน",
    ],
    priority: ["priority"],
    description: ["description"],
    solution: ["solution"],
    closureCode: ["closure_code", "closure code"],
    ciCode: ["ci_code", "ci code"],
    typeCall: ["type_call", "type call"],
    gm: ["gm"],
    dept: ["dept", "department", "ฝ่าย", "ผู้ดูแล", "ฝ่ายที่ดูแล"],
  };

  function cleanText(value) {
    return String(value == null ? "" : value)
      .replace(/^\uFEFF/, "")
      .trim();
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

    const pubMatch = text.match(
      /^(https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[^/]+)\/pubhtml\?(.+)$/i
    );
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
    const normalizedKeys = keys.map((key) => ({
      key,
      normalized: normalizeHeader(key),
    }));
    for (const alias of aliases) {
      const normalizedAlias = normalizeHeader(alias);
      const exact = normalizedKeys.find(
        (item) => item.normalized === normalizedAlias
      );
      if (exact && cleanText(row[exact.key])) return cleanText(row[exact.key]);
    }
    for (const alias of aliases) {
      const normalizedAlias = normalizeHeader(alias);
      const partial = normalizedKeys.find(
        (item) =>
          item.normalized.includes(normalizedAlias) ||
          normalizedAlias.includes(item.normalized)
      );
      if (partial && cleanText(row[partial.key]))
        return cleanText(row[partial.key]);
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
    const english = text.match(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i
    );
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

  function formatDateTimeValue(value, monthHint = "") {
    const text = cleanText(value);
    const date = parseDateValue(text, monthHint);
    if (!date) return text;
    const dateText = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(date.getDate()).padStart(2, "0")}`;
    const timeMatch = text.match(/[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!timeMatch) return dateText;
    return `${dateText} ${String(Number(timeMatch[1])).padStart(2, "0")}:${timeMatch[2]}:${
      timeMatch[3] || "00"
    }`;
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
    return Object.fromEntries(
      Object.entries(aliases).map(([key, names]) => [key, pick(row, names)])
    );
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
        item.columnQ = cleanText(item.ageEquipment);
        item.dateTime = formatDateTimeValue(item.date, item.month);
        const parsedDate = parseDateValue(item.date, item.month);
        if (parsedDate) {
          item.date = `${parsedDate.getFullYear()}-${String(
            parsedDate.getMonth() + 1
          ).padStart(2, "0")}-${String(parsedDate.getDate()).padStart(2, "0")}`;
          item.month = monthFromDate(item.date);
        }
        if (!item.month) item.month = monthFromDate(item.date);
        return item;
      })
      .filter((row) => row.ticket || row.storeCode || row.date);
    const julyCheck = calls.filter(
      (item) => item.date >= "2026-07-01" && item.date <= "2026-07-12"
    ).length;
    console.info("Date parser month-aware OK. Jul 1-12 2026 calls:", julyCheck);
    return calls;
  }

  async function fetchCsv(url) {
    const freshUrl = new URL(csvUrl(url));
    freshUrl.searchParams.set("_dashboard_refresh", Date.now().toString());
    const finalUrl = freshUrl.toString();
    const response = await fetch(finalUrl, { cache: "no-store" });
    if (!response.ok)
      throw new Error(
        `Google Sheet load failed: ${response.status} ${finalUrl}`
      );
    return response.text();
  }

  async function loadSheetRows(url, mapper, fallbackRows, label) {
    if (!url) return fallbackRows || [];
    try {
      const rows = mapper(toObjects(await fetchCsv(url)));
      console.info(`${label} Google Sheet rows loaded:`, rows.length);
      return rows.length ? rows : fallbackRows || [];
    } catch (error) {
      console.warn(
        `${label} Google Sheet load failed. Using fallback data.`,
        error
      );
      return fallbackRows || [];
    }
  }

  function sheetRangeUrl(url, range) {
    const rangedUrl = new URL(csvUrl(url));
    rangedUrl.searchParams.set("range", range);
    return rangedUrl.toString();
  }

  function columnLetter(index) {
    let value = Number(index) + 1;
    let result = "";
    while (value > 0) {
      const remainder = (value - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      value = Math.floor((value - 1) / 26);
    }
    return result;
  }

  function headerMatchesAliases(header, aliases) {
    const normalizedHeader = normalizeHeader(header);
    return aliases.some(
      (alias) => normalizeHeader(alias) === normalizedHeader
    );
  }

  function csvCell(value) {
    const text = cleanText(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  let callSheetLayoutPromise = null;

  function detectCallSheetLayout() {
    if (callSheetLayoutPromise) return callSheetLayoutPromise;
    callSheetLayoutPromise = (async () => {
      const rawHeaderText = (
        await fetchCsv(sheetRangeUrl(config.callsCsvUrl, CALL_HEADER_SCAN_RANGE))
      ).trimEnd();
      const headers = (parseCsv(rawHeaderText)[0] || []).map(cleanText);
      const lastHeaderIndex = headers.reduce(
        (last, header, index) => (header ? index : last),
        -1
      );
      const monthIndex = headers.findIndex((header) =>
        headerMatchesAliases(header, callAliases.month)
      );
      if (monthIndex < 0) {
        throw new Error("Google Sheet month header was not found.");
      }
      const effectiveLastHeaderIndex = lastHeaderIndex >= 0 ? lastHeaderIndex : 22;
      const activeHeaders = headers.slice(0, effectiveLastHeaderIndex + 1);
      const lastColumn = columnLetter(effectiveLastHeaderIndex);
      const layout = {
        headerText: activeHeaders.map(csvCell).join(","),
        headers: activeHeaders,
        lastColumn,
        monthColumn: columnLetter(monthIndex),
      };
      console.info(
        "Google Sheet call schema detected:",
        `${activeHeaders.length} columns, month=${layout.monthColumn}, last=${layout.lastColumn}`
      );
      return layout;
    })().catch((error) => {
      callSheetLayoutPromise = null;
      throw error;
    });
    return callSheetLayoutPromise;
  }

  function monthSortValue(value) {
    const monthIndex = monthHintIndex(value);
    const yearMatch = cleanText(value).match(/(?:19|20)?\d{2}/g);
    if (monthIndex == null || !yearMatch?.length) return -Infinity;
    let year = Number(yearMatch[yearMatch.length - 1]);
    if (year < 100) year += 2000;
    if (year > 2400) year -= 543;
    return year * 12 + monthIndex;
  }

  function monthKeyFromText(value) {
    const monthIndex = monthHintIndex(value);
    const yearMatch = cleanText(value).match(/(?:19|20)?\d{2}/g);
    if (monthIndex == null || !yearMatch?.length) return "";
    let year = Number(yearMatch[yearMatch.length - 1]);
    if (year < 100) year += 2000;
    if (year > 2400) year -= 543;
    return `${MONTHS[monthIndex]} ${String(year).slice(-2)}`;
  }

  let callMonthRangesPromise = null;

  function detectCallMonthRanges() {
    if (callMonthRangesPromise) return callMonthRangesPromise;
    callMonthRangesPromise = (async () => {
      const layout = await detectCallSheetLayout();
      const monthCsv = await fetchCsv(
        sheetRangeUrl(
          config.callsCsvUrl,
          `${layout.monthColumn}1:${layout.monthColumn}200000`
        )
      );
      const rows = parseCsv(monthCsv);
      const ranges = new Map();

      rows.forEach((row, index) => {
        const monthKey = monthKeyFromText(row[0]);
        if (!monthKey) return;
        const sheetRow = index + 1;
        const current = ranges.get(monthKey) || {
          firstRow: sheetRow,
          lastRow: sheetRow,
        };
        current.firstRow = Math.min(current.firstRow, sheetRow);
        current.lastRow = Math.max(current.lastRow, sheetRow);
        ranges.set(monthKey, current);
      });

      return new Map(
        [...ranges.entries()].map(([monthKey, range]) => [
          monthKey,
          `A${range.firstRow}:${layout.lastColumn}${range.lastRow}`,
        ])
      );
    })().catch((error) => {
      callMonthRangesPromise = null;
      throw error;
    });
    return callMonthRangesPromise;
  }

  async function detectLatestCallRange() {
    try {
      const ranges = await detectCallMonthRanges();
      const latest = [...ranges.entries()].sort(
        ([monthA], [monthB]) => monthSortValue(monthB) - monthSortValue(monthA)
      )[0];
      if (latest) {
        const range = latest[1];
        console.info("Latest Google Sheet month range:", range);
        return range;
      }
    } catch (error) {
      console.warn("Latest Google Sheet month range detection failed.", error);
    }
    return CALL_RECENT_FALLBACK_RANGE;
  }

  async function loadCallRange(range, fallbackRows = [], label = "Calls") {
    try {
      const layout = await detectCallSheetLayout();
      const rangeText = await fetchCsv(sheetRangeUrl(config.callsCsvUrl, range));
      const hasHeader = /^A1:/i.test(range);
      const csvText = hasHeader
        ? rangeText
        : `${layout.headerText}\n${rangeText}`;
      const rows = mapCalls(toObjects(csvText));
      console.info(`${label} Google Sheet rows loaded:`, rows.length);
      return rows.length ? rows : fallbackRows;
    } catch (error) {
      console.warn(`${label} Google Sheet load failed. Using fallback data.`, error);
      return fallbackRows;
    }
  }

  function mergeCalls(existing, incoming) {
    const merged = new Map();
    [...(existing || []), ...(incoming || [])].forEach((call, index) => {
      const key = cleanText(call.ticket) || [call.date, call.storeCode, call.equipment, index].join("|");
      merged.set(key, call);
    });
    return [...merged.values()];
  }

  function enrichCallsWithStores(calls, stores) {
    const storeByCode = new Map(
      stores.map((store) => [cleanText(store.code), store])
    );
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

  function openDashboardCache() {
    if (!("indexedDB" in window)) return Promise.resolve(null);
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(CACHE_DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
            db.createObjectStore(CACHE_STORE_NAME);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch (_error) {
        resolve(null);
      }
    });
  }

  async function readDashboardCache() {
    const db = await openDashboardCache();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const request = db
          .transaction(CACHE_STORE_NAME, "readonly")
          .objectStore(CACHE_STORE_NAME)
          .get(CACHE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      } catch (_error) {
        resolve(null);
      }
    }).finally(() => db.close());
  }

  async function writeDashboardCache(data) {
    const db = await openDashboardCache();
    if (!db) return;
    await new Promise((resolve) => {
      try {
        const request = db
          .transaction(CACHE_STORE_NAME, "readwrite")
          .objectStore(CACHE_STORE_NAME)
          .put(data, CACHE_KEY);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
      } catch (_error) {
        resolve();
      }
    });
    db.close();
  }

  function hasDashboardRows(data) {
    return Boolean(
      data &&
        Array.isArray(data.stores) &&
        Array.isArray(data.calls) &&
        (data.stores.length || data.calls.length)
    );
  }

  async function fetchFreshDashboard(fallback) {
    const storesPromise = loadSheetRows(
      config.storesCsvUrl,
      mapStores,
      fallback.stores,
      "Stores"
    );
    const latestRange = await detectLatestCallRange();
    const [stores, recentCalls] = await Promise.all([
      storesPromise,
      loadCallRange(latestRange, [], "Recent calls"),
    ]);
    const currentCalls = window.DASHBOARD_DATA?.calls || [];
    const calls = mergeCalls(
      mergeCalls(fallback.calls, currentCalls),
      recentCalls
    );

    enrichCallsWithStores(calls, stores);
    const data = {
      generatedAt: new Date().toISOString(),
      sourceFiles: {
        stores: config.storesCsvUrl
          ? "Google Sheets"
          : fallback.sourceFiles?.stores,
        calls: config.callsCsvUrl
          ? "Google Sheets"
          : fallback.sourceFiles?.calls,
      },
      stores,
      calls,
      historyComplete: Boolean(fallback.historyComplete),
    };
    if (hasDashboardRows(data)) await writeDashboardCache(data);
    return data;
  }

  window.loadDashboardData = async function loadDashboardData() {
    const fallback = window.DASHBOARD_DATA || { stores: [], calls: [] };
    if (!config.enabled || (!config.storesCsvUrl && !config.callsCsvUrl))
      return fallback;

    const cached = await readDashboardCache();
    const immediate = hasDashboardRows(cached)
      ? {
          ...fallback,
          ...cached,
          stores: cached.stores?.length ? cached.stores : fallback.stores,
          calls: mergeCalls(fallback.calls, cached.calls),
          historyComplete: Boolean(cached.historyComplete || fallback.historyComplete),
        }
      : fallback;
    window.DASHBOARD_DATA = immediate;
    window.DASHBOARD_REFRESH_PROMISE = fetchFreshDashboard(immediate)
      .then((fresh) => {
        window.DASHBOARD_DATA = fresh;
        return fresh;
      })
      .catch((error) => {
        console.warn("Dashboard background refresh failed.", error);
        return immediate;
      });

    return immediate;
  };

  window.loadDashboardMonth = function loadDashboardMonth(monthValue) {
    const monthKey = monthKeyFromText(monthValue);
    if (!monthKey) return Promise.resolve(window.DASHBOARD_DATA);
    window.DASHBOARD_MONTH_PROMISES ||= {};
    if (window.DASHBOARD_MONTH_PROMISES[monthKey]) {
      return window.DASHBOARD_MONTH_PROMISES[monthKey];
    }

    window.DASHBOARD_MONTH_PROMISES[monthKey] = (async () => {
      const ranges = await detectCallMonthRanges();
      const range = ranges.get(monthKey);
      if (!range) {
        console.warn(`No Google Sheet range found for ${monthKey}.`);
        return window.DASHBOARD_DATA;
      }

      const monthCalls = await loadCallRange(range, null, `${monthKey} calls`);
      if (!Array.isArray(monthCalls) || !monthCalls.length) {
        console.warn(`Google Sheet returned no calls for ${monthKey}.`);
        return window.DASHBOARD_DATA;
      }

      const current = window.DASHBOARD_DATA || { stores: [], calls: [] };
      const stores = current.stores || [];
      const calls = mergeCalls(current.calls, monthCalls);
      enrichCallsWithStores(calls, stores);
      const data = {
        ...current,
        generatedAt: new Date().toISOString(),
        stores,
        calls,
      };
      window.DASHBOARD_DATA = data;
      await writeDashboardCache(data);
      return data;
    })()
      .catch((error) => {
        console.warn(`Loading ${monthKey} from Google Sheet failed.`, error);
        return window.DASHBOARD_DATA;
      })
      .finally(() => {
        delete window.DASHBOARD_MONTH_PROMISES[monthKey];
      });

    return window.DASHBOARD_MONTH_PROMISES[monthKey];
  };

  window.loadDashboardHistory = function loadDashboardHistory() {
    if (window.DASHBOARD_DATA?.historyComplete) {
      return Promise.resolve(window.DASHBOARD_DATA);
    }
    if (window.DASHBOARD_HISTORY_PROMISE) return window.DASHBOARD_HISTORY_PROMISE;

    window.DASHBOARD_HISTORY_PROMISE = (async () => {
      let calls = window.DASHBOARD_DATA?.calls || [];
      const layout = await detectCallSheetLayout();
      for (const [startRow, endRow] of CALL_HISTORY_ROW_RANGES) {
        const range = `A${startRow}:${layout.lastColumn}${endRow}`;
        const chunk = await loadCallRange(range, null, `Call history ${range}`);
        if (!Array.isArray(chunk) || !chunk.length) {
          throw new Error(`Call history range ${range} did not load.`);
        }
        calls = mergeCalls(calls, chunk);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const stores = window.DASHBOARD_DATA?.stores || [];
      enrichCallsWithStores(calls, stores);
      const data = {
        ...(window.DASHBOARD_DATA || {}),
        generatedAt: new Date().toISOString(),
        stores,
        calls,
        historyComplete: true,
      };
      window.DASHBOARD_DATA = data;
      await writeDashboardCache(data);
      return data;
    })().finally(() => {
      window.DASHBOARD_HISTORY_PROMISE = null;
    });
    return window.DASHBOARD_HISTORY_PROMISE;
  };
})();
