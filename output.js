// ==========================================
// UTILITY & CONFIG
// ==========================================
const CONFIG = {
  sheetGids: {
    "Januari": "1878816489", "Februari": "339606626", "Maret": "597553472",
    "April": "1333467666", "Mei": "587360054", "Juni": "1622550300",
    "Juli": "695077635", "Agustus": "1318929301", "September": "1763870211",
    "Oktober": "1593437933", "November": "391199552", "Desember": "351449246"
  },
  baseUrl: "https://docs.google.com/spreadsheets/d/10bKsfF0ozFcJSTWX5AhUJLAofJgB1o9QEL0KPRR1XIM/export?format=csv&gid="
};

const VALID_MACHINE_KEYWORDS = ["JINSUNG", "SIG", "ILAPAK", "UNIFIL", "JOYEA", "YONAN"];

function formatFloat(f) {
  return Number(f).toFixed(2);
}

// URL Master Data Spreadsheet Target Pembagi
const MASTER_SHEETS_URL = "https://docs.google.com/spreadsheets/d/1iacLGBOQdkFxSAjlGm-CUlYm9s9hj8Tk9iGs8Mfg-z0/gviz/tq?gid=536194009";

function parseCSV(str) {
  const arr = [];
  let quote = false;
  for (let row = 0, col = 0, c = 0; c < str.length; c++) {
    let cc = str[c], nc = str[c + 1];
    arr[row] = arr[row] || [];
    arr[row][col] = arr[row][col] || '';
    if (cc === '"' && quote && nc === '"') { arr[row][col] += cc; ++c; continue; }
    if (cc === '"') { quote = !quote; continue; }
    if (cc === ',' && !quote) { ++col; continue; }
    if (cc === '\r' && nc === '\n' && !quote) { ++row; col = 0; ++c; continue; }
    if (cc === '\n' && !quote) { ++row; col = 0; continue; }
    if (cc === '\r' && !quote) { ++row; col = 0; continue; }
    arr[row][col] += cc;
  }
  return arr;
}

function cleanNamaMesin(str) {
  if (!str) return "";
  let upperStr = str.toUpperCase();
  if (upperStr.includes("JINSUNG 1") || upperStr.includes("JINSUNG1")) return "Jinsung 1";
  if (upperStr.includes("JINSUNG 2") || upperStr.includes("JINSUNG2")) return "Jinsung 2";
  if (upperStr.includes("JINSUNG 3") || upperStr.includes("JINSUNG3")) return "Jinsung 3";
  if (upperStr.includes("JINSUNG 4") || upperStr.includes("JINSUNG4")) return "Jinsung 4";
  if (upperStr.includes("JINSUNG 5") || upperStr.includes("JINSUNG5")) return "Jinsung 5";
  if (upperStr.includes("SIG 5") || upperStr.includes("SIG5")) return "Sig 5";
  if (upperStr.includes("SIG 6") || upperStr.includes("SIG6")) return "Sig 6";
  if (upperStr.includes("ILAPAK 11") || upperStr.includes("ILAPAK11")) return "Ilapak 11";
  let clean = str.replace(/(?:target|per|shift|=|\d+\.\d+).*$/i, "");
  clean = clean.trim();
  return clean.toLowerCase().split(' ').map(word => {
    if (["sig", "joyea", "unifil", "yonan", "ilapak"].includes(word)) {
      return word.toUpperCase();
    }
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
}

// Fungsi helper untuk menyortir array format tanggal teks DD/MM/YYYY secara kronologis
function urutkanArrayTanggalAsli(arrayTanggal) {
  return arrayTanggal.sort((a, b) => {
    const partsA = a.split('/');
    const partsB = b.split('/');
    if (partsA.length !== 3 || partsB.length !== 3) return 0;
    const dateA = new Date(partsA[2], partsA[1] - 1, partsA[0]);
    const dateB = new Date(partsB[2], partsB[1] - 1, partsB[0]);
    return dateA - dateB;
  });
}

async function fetchAndParseSheets(targetBulan = "all") {
  let semuaPencapaian = [];
  const daftarBulanYangDiambil = targetBulan === "all" ? Object.entries(CONFIG.sheetGids) : Object.entries(CONFIG.sheetGids).filter(([namaBulan]) => namaBulan === targetBulan);
  for (const [namaBulan, gid] of daftarBulanYangDiambil) {
    try {
      const url = CONFIG.baseUrl + gid;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Gagal fetch GID: ${gid}`);
      const csvText = await response.text();
      const records = parseCSV(csvText);
      if (records.length < 5) continue;
      const totalBaris = records.length;
      const rowTanggal = records[1];
      const rowShift = records[2];
      const totalKolom = rowShift.length;
      for (let r = 3; r < totalBaris; r++) {
        let cellKolomA = records[r][0]?.trim() || "";
        let IsValidMachineRow = VALID_MACHINE_KEYWORDS.some(keyword => cellKolomA.toUpperCase().includes(keyword));
        if (IsValidMachineRow) {
          let namaMesinBersih = cleanNamaMesin(cellKolomA);
          let upperNama = namaMesinBersih.toUpperCase();
          if (namaMesinBersih === "" || upperNama.includes("KODE") || upperNama.includes("PRODUK") || upperNama.includes("BATCH")) {
            continue;
          }
          let mesinRow = r;
          let currentBatchOffsets = [
            { label: "Batch 1", kode: 0, batch: 1, output: 2 },
            { label: "Batch 2", kode: 4, batch: 5, output: 6 }
          ];
          let lompatanBaris = 7;
          if (upperNama.includes("JINSUNG")) {
            currentBatchOffsets = [
              { label: "Batch 1", kode: 0, batch: 1, output: 2 },
              { label: "Batch 2", kode: 4, batch: 5, output: 6 },
              { label: "Batch 3", kode: 8, batch: 9, output: 10 }
            ];
            lompatanBaris = 11;
          }
          for (const b of currentBatchOffsets) {
            const kodeRow = mesinRow + b.kode;
            const batchRow = mesinRow + b.batch;
            const outputRow = mesinRow + b.output;
            if (outputRow >= totalBaris) continue;
            let listDetails = [];
            let currentTanggal = "";
            for (let col = 2; col < totalKolom; col++) {
              if (col < rowTanggal.length && rowTanggal[col]?.trim() !== "") {
                currentTanggal = rowTanggal[col].trim();
              } else {
                let pointerCol = col;
                while (pointerCol >= 2) {
                  if (rowTanggal[pointerCol]?.trim()) {
                    currentTanggal = rowTanggal[pointerCol].trim();
                    break;
                  }
                  pointerCol--;
                }
              }
              let shiftKerja = "1";
              if (col < rowShift.length && rowShift[col]?.trim() !== "") {
                shiftKerja = rowShift[col].trim();
              }
              let kodeProduk = col < records[kodeRow]?.length ? records[kodeRow][col]?.trim() : "";
              let noBatch = col < records[batchRow]?.length ? records[batchRow][col]?.trim() : "";
              let valOutput = col < records[outputRow]?.length ? records[outputRow][col]?.trim() : "0";
              if (!valOutput || valOutput.toLowerCase() === "off" || valOutput === "-") {
                valOutput = "0";
              }
              let cleanKode = kodeProduk.toUpperCase();
              if (!kodeProduk || cleanKode === "OFF" || cleanKode === "LIBUR" || cleanKode === "-") {
                kodeProduk = "-";
                noBatch = "-";
                valOutput = "0";
              }
              listDetails.push({ tanggal: currentTanggal, shift: shiftKerja, kode_produk: kodeProduk, no_batch: noBatch, output: valOutput });
            }
            semuaPencapaian.push({ bulan: namaBulan, mesin: namaMesinBersih, nama_batch: b.label, details: listDetails });
          }
          r += lompatanBaris;
        }
      }
    } catch (error) {
      console.error(`Error processing sheet ${namaBulan}:`, error);
    }
  }
  return semuaPencapaian;
}

async function fetchMasterTarget() {
  const cachedTarget = sessionStorage.getItem("master_target_cache");
  if (cachedTarget) return JSON.parse(cachedTarget);
  try {
    const response = await fetch(MASTER_SHEETS_URL);
    const text = await response.text();
    const jsonString = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const json = JSON.parse(jsonString);
    let targetMap = {};
    const rows = json.table.rows;
    rows.forEach(row => {
      if (!row.c) return;
      const kodeProduk = row.c[1] ? String(row.c[1].v).trim() : null;
      const targetValue = row.c[13] ? parseFloat(row.c[13].v) : null;
      if (kodeProduk && targetValue) {
        targetMap[kodeProduk] = targetValue;
      }
    });
    sessionStorage.setItem("master_target_cache", JSON.stringify(targetMap));
    return targetMap;
  } catch (error) {
    console.error("Gagal memuat master data target pembagi:", error);
    return {};
  }
}

function getRealTimeMonth() {
  const namaBulanIndo = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  return namaBulanIndo[new Date().getMonth()];
}

// ==========================================
// DATA PROCESSING
// ==========================================
function getPencapaianData(dataMentah, bulanFilter, mesinFilter, tanggalFilter, masterTarget) {
  let mapBulan = new Set(), mapMesin = new Set();
  const urutanBulanUrut = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  urutanBulanUrut.forEach(b => mapBulan.add(b));
  
  dataMentah.forEach(item => {
    if (item.mesin) mapMesin.add(item.mesin);
  });
  
  const listBulan = Array.from(mapBulan).sort((a, b) => urutanBulanUrut.indexOf(a) - urutanBulanUrut.indexOf(b));
  const listMesin = Array.from(mapMesin).sort();
  
  let mapTanggalUnik = new Set();
  let listTanggalBulanIni = new Set();
  
  dataMentah.forEach(item => {
    if (bulanFilter === "all" || item.bulan === bulanFilter) {
      if (item.details && Array.isArray(item.details)) {
        item.details.forEach(det => {
          if (det.tanggal && det.tanggal !== "-") {
            listTanggalBulanIni.add(det.tanggal);
            if (tanggalFilter === "all" || det.tanggal === tanggalFilter) {
              mapTanggalUnik.add(det.tanggal);
            }
          }
        });
      }
    }
  });
  
  // FIX: Urutkan array tanggal secara urutan waktu asli kronologis (DD/MM/YYYY)
  const uniqueDates = urutkanArrayTanggalAsli(Array.from(mapTanggalUnik));
  const availableDates = urutkanArrayTanggalAsli(Array.from(listTanggalBulanIni));
  
  let mapAkumulasi = {};
  dataMentah.forEach(item => {
    const matchBulan = (bulanFilter === "all" || item.bulan === bulanFilter);
    const matchMesin = (mesinFilter === "all" || item.mesin === mesinFilter);
    if (matchBulan && matchMesin) {
      if (!mapAkumulasi[item.mesin]) mapAkumulasi[item.mesin] = {};
      if (item.details && Array.isArray(item.details)) {
        item.details.forEach(det => {
          if (!det.tanggal || det.tanggal === "-") return;
          if (tanggalFilter !== "all" && det.tanggal !== tanggalFilter) return;
          if (!mapAkumulasi[item.mesin][det.tanggal]) {
            mapAkumulasi[item.mesin][det.tanggal] = {
              total_output: 0,
              produk_set: new Set(),
              batch_set: new Set(),
              shifts: {
                "1": { output: 0, produk: new Set() },
                "2": { output: 0, produk: new Set() },
                "3": { output: 0, produk: new Set() }
              }
            };
          }
          const outVal = parseFloat(det.output) || 0;
          const currentCell = mapAkumulasi[item.mesin][det.tanggal];
          currentCell.total_output += outVal;
          if (det.kode_produk && det.kode_produk !== "-") currentCell.produk_set.add(det.kode_produk);
          if (det.no_batch && det.no_batch !== "-") currentCell.batch_set.add(det.no_batch);
          const shiftKey = String(det.shift).trim();
          if (currentCell.shifts[shiftKey]) {
            currentCell.shifts[shiftKey].output += outVal;
            if (det.kode_produk && det.kode_produk !== "-") {
              currentCell.shifts[shiftKey].produk.add(det.kode_produk);
            }
          }
        });
      }
    }
  });
  
  let finalDataCapaian = [];
  Object.keys(mapAkumulasi).sort().forEach(namaMesin => {
    let listTglCapaian = [];
    uniqueDates.forEach(tgl => {
      const cellData = mapAkumulasi[namaMesin][tgl] || { total_output: 0, produk_set: new Set(), batch_set: new Set(), shifts: {} };
      let totalDesimalCapaian = 0;
      if (cellData.total_output > 0 && cellData.shifts) {
        Object.keys(cellData.shifts).forEach(sKey => {
          const shiftData = cellData.shifts[sKey];
          if (shiftData.output > 0) {
            const arrayProdukShift = Array.from(shiftData.produk);
            const produkShiftAktif = arrayProdukShift.length > 0 ? arrayProdukShift[0] : null;
            const pembagiTarget = (produkShiftAktif && masterTarget[produkShiftAktif]) ? masterTarget[produkShiftAktif] : 31250;
            totalDesimalCapaian += (shiftData.output / pembagiTarget);
          }
        });
      }
      const gabungProduk = Array.from(cellData.produk_set).join(' / ') || "-";
      const gabungBatch = Array.from(cellData.batch_set).join(' / ') || "-";
      listTglCapaian.push({ tanggal: tgl, total_output: cellData.total_output, persen_capaian: totalDesimalCapaian, kode_produk: gabungProduk, no_batch: gabungBatch });
    });
    finalDataCapaian.push({ mesin: namaMesin, bulan: bulanFilter, list_tgl: listTglCapaian });
  });
  
  return { bulanFilter, mesinFilter, tanggalFilter, listBulan, listMesin, uniqueDates, availableDates, dataCapaian: finalDataCapaian };
}

function renderDropdowns(payload) {
  const bulanSelect = document.getElementById('filter-bulan');
  const mesinSelect = document.getElementById('filter-mesin');
  const tanggalSelect = document.getElementById('filter-tanggal');
  if (bulanSelect) {
    bulanSelect.innerHTML = `<option value="all" ${payload.bulanFilter === 'all' ? 'selected' : ''}>-- Semua Bulan --</option>`;
    payload.listBulan.forEach(b => {
      bulanSelect.innerHTML += `<option value="${b}" ${payload.bulanFilter === b ? 'selected' : ''}>${b}</option>`;
    });
  }
  if (mesinSelect) {
    mesinSelect.innerHTML = `<option value="all" ${payload.mesinFilter === 'all' ? 'selected' : ''}>-- Semua Mesin --</option>`;
    payload.listMesin.forEach(m => {
      mesinSelect.innerHTML += `<option value="${m}" ${payload.mesinFilter === m ? 'selected' : ''}>${m}</option>`;
    });
  }
  if (tanggalSelect) {
    tanggalSelect.innerHTML = `<option value="all" ${payload.tanggalFilter === 'all' ? 'selected' : ''}>-- Semua Tanggal --</option>`;
    payload.availableDates.forEach(t => {
      tanggalSelect.innerHTML += `<option value="${t}" ${payload.tanggalFilter === t ? 'selected' : ''}>${t}</option>`;
    });
  }
  const btnGraph = document.querySelector('.btn-graph');
  if (btnGraph) btnGraph.href = `diagram.html?bulan=${payload.bulanFilter}&mesin=${payload.mesinFilter}`;
  const btnDashboard = document.querySelector('.btn-dashboard');
  if (btnDashboard) btnDashboard.href = `index.html?bulan=${payload.bulanFilter}&mesin=${payload.mesinFilter}`;
}

function renderPencapaianTable(payload) {
  const thead = document.querySelector('.styled-table thead');
  const tbody = document.querySelector('.styled-table tbody');
  if (!thead || !tbody) return;
  if (payload.uniqueDates.length === 0) {
    thead.innerHTML = `<tr><th class="sticky-corner">Nama Mesin</th><th style="text-align:center;">Informasi</th></tr>`;
    tbody.innerHTML = `<tr><td colspan="2" style="text-align:center; padding: 40px; color: #64748b;">Tidak ada data tanggal kerja untuk bulan ${payload.bulanFilter}.</td></tr>`;
    return;
  }
  let headerRow1 = `<tr><th rowspan="2" class="sticky-corner" style="vertical-align: middle;">Nama Mesin</th>`;
  let headerRow2 = `<tr>`;
  payload.uniqueDates.forEach(date => {
    headerRow1 += `<th colspan="2" style="text-align:center; font-weight: bold; border-bottom: 1px solid #cbd5e1;">📅 ${date}</th>`;
    headerRow2 += `<th style="text-align:right; min-width:140px;">Output Total</th><th style="text-align:right; min-width:100px;">Pencapaian</th>`;
  });
  thead.innerHTML = headerRow1 + `</tr>` + headerRow2 + `</tr>`;
  let bodyHtml = ``;
  if (payload.dataCapaian.length > 0) {
    payload.dataCapaian.forEach(item => {
      bodyHtml += `<tr><td class="sticky-col">${item.mesin}</td>`;
      item.list_tgl.forEach(tgl => {
        const isZero = tgl.total_output === 0 || tgl.total_output === 0.0;
        bodyHtml += ` <td class="val-total ${isZero ? 'bg-empty' : ''}" style="text-align: right; line-height: 1.4;"> ${isZero ? '-' : formatFloat(tgl.total_output)} ${isZero ? '' : `<div style="font-size: 11px; color: #64748b; font-weight: normal; margin-top: 4px;">📦 Prod: ${tgl.kode_produk}</div>`} ${isZero ? '' : `<div style="font-size: 11px; color: #0284c7; font-weight: normal;">🔢 Batch: ${tgl.no_batch}</div>`} </td> <td class="val-capaian ${isZero ? 'bg-empty' : ''}" style="text-align: right; font-weight: bold; vertical-align: top; color: ${tgl.persen_capaian >= 1.0 ? '#10b981' : '#f59e0b'}"> ${isZero ? '-' : formatFloat(tgl.persen_capaian)} </td>`;
      });
      bodyHtml += `</tr>`;
    });
  } else {
    bodyHtml = `<tr><td colspan="100" style="text-align:center; padding: 40px; color: #64748b;">Tidak ada data untuk kalkulasi pencapaian.</td></tr>`;
  }
  tbody.innerHTML = bodyHtml;
}

// ==========================================
// EVENT HANDLERS
// ==========================================
function setupFilterListeners(masterTarget) {
  const form = document.querySelector('.filter-form');
  if (!form) return;
  const inputs = form.querySelectorAll('select');
  inputs.forEach(input => {
    input.onchange = async () => {
      const formData = new FormData(form);
      const currentBulan = formData.get('bulan') || 'all';
      const currentMesin = formData.get('mesin') || 'all';
      const currentTanggal = formData.get('tanggal') || 'all';
      const targetUrl = new URL(window.location.href);
      targetUrl.searchParams.set('bulan', currentBulan);
      targetUrl.searchParams.set('mesin', currentMesin);
      targetUrl.searchParams.set('tanggal', currentTanggal);
      window.history.pushState({}, '', targetUrl);
      let dataFilterBulan = [];
      if (currentBulan !== 'all') {
        let cached = sessionStorage.getItem(`sheets_cache_${currentBulan}`);
        if (!cached) {
          const tbody = document.querySelector('.styled-table tbody');
          if (tbody) tbody.innerHTML = `<tr><td colspan="100" style="text-align:center; padding: 40px; color: #64748b;">Mengunduh data baru bulan ${currentBulan}...</td></tr>`;
          const freshData = await fetchAndParseSheets(currentBulan);
          sessionStorage.setItem(`sheets_cache_${currentBulan}`, JSON.stringify(freshData));
          dataFilterBulan = freshData;
        } else {
          dataFilterBulan = JSON.parse(cached);
        }
      } else {
        const urutanBulanUrut = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        for (const b of urutanBulanUrut) {
          let cached = sessionStorage.getItem(`sheets_cache_${b}`);
          if (!cached) {
            const freshData = await fetchAndParseSheets(b);
            sessionStorage.setItem(`sheets_cache_${b}`, JSON.stringify(freshData));
            dataFilterBulan.push(...freshData);
          } else {
            const arr = JSON.parse(cached);
            if (Array.isArray(arr)) dataFilterBulan.push(...arr);
          }
        }
      }
      const payload = getPencapaianData(dataFilterBulan, currentBulan, currentMesin, currentTanggal, masterTarget);
      renderDropdowns(payload);
      renderPencapaianTable(payload);
    };
  });
  const btnRefresh = document.querySelector('.btn-refresh');
  if (btnRefresh) {
    btnRefresh.onclick = () => {
      sessionStorage.clear();
      window.location.reload();
    };
  }
}

// ==========================================
// INIT APP
// ==========================================
async function initApp() {
  const urlParams = new URLSearchParams(window.location.search);
  let filterBulan = urlParams.get('bulan');
  if (!filterBulan || filterBulan.toLowerCase() === 'all') {
    filterBulan = getRealTimeMonth();
  }
  const filterMesin = urlParams.get('mesin') || 'all';
  const filterTanggal = urlParams.get('tanggal') || 'all';
  let dataMentah = [];
  if (filterBulan !== 'all') {
    let cached = sessionStorage.getItem(`sheets_cache_${filterBulan}`);
    if (!cached) {
      dataMentah = await fetchAndParseSheets(filterBulan);
      sessionStorage.setItem(`sheets_cache_${filterBulan}`, JSON.stringify(dataMentah));
    } else {
      dataMentah = JSON.parse(cached);
    }
  } else {
    const urutanBulanUrut = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    for (const b of urutanBulanUrut) {
      let cached = sessionStorage.getItem(`sheets_cache_${b}`);
      if (!cached) {
        const freshData = await fetchAndParseSheets(b);
        sessionStorage.setItem(`sheets_cache_${b}`, JSON.stringify(freshData));
        dataMentah.push(...freshData);
      } else {
        const arr = JSON.parse(cached);
        if (Array.isArray(arr)) dataMentah.push(...arr);
      }
    }
  }
  const masterTarget = await fetchMasterTarget();
  const payload = getPencapaianData(dataMentah, filterBulan, filterMesin, filterTanggal, masterTarget);
  renderDropdowns(payload);
  renderPencapaianTable(payload);
  setupFilterListeners(masterTarget);
}

document.addEventListener("DOMContentLoaded", initApp);
