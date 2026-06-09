// ==========================================
// CONFIGURATION & UTILITIES & ENGINE FETCH
// ==========================================
let myChart = null;

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

function normalizeShift(rawShift) {
  if (!rawShift) return "";
  let clean = rawShift.toString().trim().toUpperCase();
  clean = clean.replace(/SHIFT\s*/g, ""); 
  return clean;
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

      const seen = new Set();

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
              
              let rawShiftValue = (col < rowShift.length) ? rowShift[col] : "";
              let shiftKerja = normalizeShift(rawShiftValue);

              if (!shiftKerja) continue;

              const uniqueKey = `${namaMesinBersih}-${b.label}-${currentTanggal}-${col}-${shiftKerja}`;
              if (seen.has(uniqueKey)) continue;
              seen.add(uniqueKey);

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
              listDetails.push({
                tanggal: currentTanggal,
                shift: shiftKerja,
                kode_produk: kodeProduk,
                no_batch: noBatch,
                output: valOutput
              });
            }

            if (listDetails.length > 0) {
              semuaPencapaian.push({
                bulan: namaBulan,
                mesin: namaMesinBersih,
                nama_batch: b.label,
                details: listDetails
              });
            }
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
    json.table.rows.forEach(row => {
      if (!row.c) return;
      const kodeProduk = row.c[1] ? String(row.c[1].v).trim() : null;
      const targetValue = row.c[13] ? parseFloat(row.c[13].v) : null;
      if (kodeProduk && targetValue) targetMap[kodeProduk] = targetValue;
    });
    sessionStorage.setItem("master_target_cache", JSON.stringify(targetMap));
    return targetMap;
  } catch (e) {
    console.error("Gagal memuat master target pembagi:", e);
    return {};
  }
}

function getRealTimeMonth() {
  const namaBulanIndo = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  return namaBulanIndo[new Date().getMonth()];
}

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

function showLoadingState(isLoading, customMessage = "Sedang Memuat Data Produksi...") {
  const emptyStateEl = document.getElementById('chart-empty-state');
  const canvasEl = document.getElementById('canvas-diagram');
  if (!emptyStateEl || !canvasEl) return;

  if (isLoading) {
    if (myChart) {
      myChart.destroy();
      myChart = null;
    }
    canvasEl.style.display = 'none';
    emptyStateEl.style.display = 'block';
    emptyStateEl.innerHTML = `
      <div class="icon">⏳</div>
      <h3>${customMessage}</h3>
      <p style="font-size: 13px; margin-top: 6px; color: #0ea5e9;">Sinkronisasi Google Sheets API sedang berjalan.</p>
    `;
  }
}

function getSystemDefaultDate(dataMentah) {
  let semuaTanggal = new Set();
  dataMentah.forEach(item => {
    if (item.details && Array.isArray(item.details)) {
      item.details.forEach(det => {
        if (det.tanggal && det.tanggal !== "-") semuaTanggal.add(det.tanggal);
      });
    }
  });

  const sortedDates = urutkanArrayTanggalAsli(Array.from(semuaTanggal));
  if (sortedDates.length === 0) return { bulan: "all", tanggal: "all" };

  const hariIni = new Date();
  const listBulanIndo = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const bulanRiilStr = listBulanIndo[hariIni.getMonth()];

  const tglRiilPad = String(hariIni.getDate()).padStart(2, '0');
  const blnRiilPad = String(hariIni.getMonth() + 1).padStart(2, '0');
  const thnRiilStr = hariIni.getFullYear();
  const formatTanggalRiil = `${tglRiilPad}/${blnRiilPad}/${thnRiilStr}`;

  let matchTanggal = sortedDates.find(d => d === formatTanggalRiil);

  if (matchTanggal) {
    return { bulan: bulanRiilStr, tanggal: matchTanggal };
  } else {
    return { bulan: bulanRiilStr, tanggal: "all" };
  }
}

// ==========================================
// CORE DATA AGGREGATION
// ==========================================
function processDiagramData(dataMentah, bulanFilter, mesinFilter, tanggalFilter, masterTarget) {
  let mapBulan = new Set(), mapMesin = new Set(), listTanggalBulanIni = new Set();
  const urutanBulanUrut = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  urutanBulanUrut.forEach(b => mapBulan.add(b));

  dataMentah.forEach(item => {
    if (item.mesin) mapMesin.add(item.mesin);
    if (bulanFilter === "all" || item.bulan === bulanFilter) {
      if (item.details && Array.isArray(item.details)) {
        item.details.forEach(det => {
          if (det.tanggal && det.tanggal !== "-") listTanggalBulanIni.add(det.tanggal);
        });
      }
    }
  });

  let mapAkumulasi = {};
  dataMentah.forEach(item => {
    const matchBulan = (bulanFilter === "all" || item.bulan === bulanFilter);
    const matchMesin = (mesinFilter === "all" || item.mesin === mesinFilter);

    if (matchBulan && matchMesin) {
      if (!mapAkumulasi[item.mesin]) {
        mapAkumulasi[item.mesin] = {
          total_output: 0,
          produk: new Set(),
          batch: new Set(),
          records_murni: []
        };
      }

      if (item.details && Array.isArray(item.details)) {
        item.details.forEach(det => {
          if (!det.tanggal || det.tanggal === "-") return;
          if (tanggalFilter !== "all" && det.tanggal !== tanggalFilter) return;

          const outVal = parseFloat(det.output) || 0;
          const node = mapAkumulasi[item.mesin];
          node.total_output += outVal;

          if (det.kode_produk && det.kode_produk !== "-") node.produk.add(det.kode_produk);
          if (det.no_batch && det.no_batch !== "-") node.batch.add(det.no_batch);

          node.records_murni.push({
            tanggal: det.tanggal,
            shift: String(det.shift).trim(),
            kode_produk: det.kode_produk,
            output: outVal
          });
        });
      }
    }
  });

  let chartLabels = [];
  let datasetCapaian = [];
  let metaDetails = [];

  Object.keys(mapAkumulasi).sort().forEach(namaMesin => {
    const node = mapAkumulasi[namaMesin];
    if (node.total_output === 0) return;

    let totalDesimalCapaian = 0;
    let rincianShiftFinal = {};

    ["1", "2", "3"].forEach(sKey => {
      let totalOutputShift = 0;
      let totalRasioShift = 0;
      let pembagiTargetUtama = 31250; 

      const filterRecordsShift = node.records_murni.filter(
        r => String(r.shift).trim() === String(sKey).trim()
      );
      
      filterRecordsShift.forEach(rec => {
        totalOutputShift += rec.output;
        if (rec.output > 0) {
          const pembagi = (rec.kode_produk && rec.kode_produk !== "-" && masterTarget[rec.kode_produk]) ? masterTarget[rec.kode_produk] : 31250;
          if (rec.kode_produk && rec.kode_produk !== "-" && masterTarget[rec.kode_produk]) {
            pembagiTargetUtama = masterTarget[rec.kode_produk];
          }
          totalRasioShift += (rec.output / pembagi);
        }
      });

      totalDesimalCapaian += totalRasioShift;

      rincianShiftFinal[sKey] = { 
        output: totalOutputShift, 
        target: pembagiTargetUtama, 
        rasio: totalRasioShift 
      };
    });

    chartLabels.push(namaMesin);
    datasetCapaian.push(parseFloat(totalDesimalCapaian.toFixed(2)));
    metaDetails.push({
      mesin: namaMesin,
      total_output: node.total_output,
      produk: Array.from(node.produk).join(' / ') || "-",
      batch: Array.from(node.batch).join(' / ') || "-",
      shifts: rincianShiftFinal
    });
  });

  return {
    listBulan: Array.from(mapBulan).sort((a, b) => urutanBulanUrut.indexOf(a) - urutanBulanUrut.indexOf(b)),
    listMesin: Array.from(mapMesin).sort(),
    availableDates: urutkanArrayTanggalAsli(Array.from(listTanggalBulanIni)),
    chartLabels,
    datasetCapaian,
    metaDetails
  };
}

// ==========================================
// UI RENDERING & CHART GENERATION
// ==========================================
function renderDropdowns(payload, bulanActive, mesinActive, tanggalActive) {
  const bSel = document.getElementById('filter-bulan');
  const mSel = document.getElementById('filter-mesin');
  const tSel = document.getElementById('filter-tanggal');

  if (bSel) {
    bSel.innerHTML = `<option value="all">-- Semua Bulan --</option>`;
    payload.listBulan.forEach(b => bSel.innerHTML += `<option value="${b}" ${b === bulanActive ? 'selected' : ''}>${b}</option>`);
  }
  if (mSel) {
    mSel.innerHTML = `<option value="all">-- Semua Mesin --</option>`;
    payload.listMesin.forEach(m => mSel.innerHTML += `<option value="${m}" ${m === mesinActive ? 'selected' : ''}>${m}</option>`);
  }
  if (tSel) {
    tSel.innerHTML = `<option value="all">-- Semua Tanggal --</option>`;
    payload.availableDates.forEach(t => {
      tSel.innerHTML += `<option value="${t}" ${t === tanggalActive ? 'selected' : ''}>📅 ${t}</option>`;
    });
  }

  const btnPencapaian = document.querySelector('.btn-pencapaian');
  if (btnPencapaian) btnPencapaian.href = `pencapaian.html?bulan=${bulanActive}&mesin=${mesinActive}&tanggal=${tanggalActive}`;

  const btnDashboard = document.querySelector('.btn-dashboard');
  if (btnDashboard) btnDashboard.href = `index.html?bulan=${bulanActive}&mesin=${mesinActive}&tanggal=${tanggalActive}`;
}

function showDrillDownModal(detail, tanggalActive, bulanActive) {
  const modal = document.getElementById('drilldown-modal');
  if (!modal) return;
  
  // Logic Perubahan Judul Deskripsi Sesuai Filter Tanggal/Bulan
  let tglLabel = "";
  if (tanggalActive && tanggalActive !== "all") {
    tglLabel = tanggalActive; // Mode tanggal tunggal murni bawaan awal
  } else {
    if (bulanActive === "all") {
      tglLabel = "Output Total 2026"; // Mode semua bulan
    } else {
      tglLabel = `Output Total ${bulanActive}`; // Mode semua tanggal di bulan tertentu
    }
  }

  document.getElementById('modal-mesin-title').innerText = `${detail.mesin} (${tglLabel})`;
  document.getElementById('modal-kode-produk').innerText = detail.produk;
  
  // Handle Batch Bengkak jika menggunakan mode "Semua Bulan"
  const batchContainer = document.getElementById('modal-kode-batch');
  if (bulanActive === "all") {
    // Potong tampilan awal dan buat interaksi klik untuk ekspansi
    batchContainer.innerHTML = `
      <div id="batch-short-text" style="line-height: 1.5;">
        ${detail.batch.substring(0, 120)}... 
        <button id="btn-expand-batch" style="background: #0ea5e9; color: white; border: none; padding: 2px 8px; font-size: 11px; border-radius: 4px; cursor: pointer; margin-left: 4px; font-weight: bold;">... (Lihat Semua)</button>
      </div>
      <div id="batch-full-text" style="display: none; max-height: 150px; overflow-y: auto; background: #f8fafc; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; margin-top: 5px; word-break: break-all; line-height: 1.6;">
        ${detail.batch}
      </div>
    `;
    
    document.getElementById('btn-expand-batch').onclick = function() {
      document.getElementById('batch-short-text').style.display = 'none';
      document.getElementById('batch-full-text').style.display = 'block';
    };
  } else {
    // Mode normal diluar Semua Bulan, tampilkan apa adanya secara utuh
    batchContainer.style.maxHeight = "none";
    batchContainer.style.overflowY = "visible";
    batchContainer.innerText = detail.batch;
  }

  for (let s = 1; s <= 3; s++) {
    const sData = detail.shifts[String(s)];
    const rowOutput = document.getElementById(`modal-shift${s}-output`);
    if (sData && sData.output > 0) {
      rowOutput.innerHTML = `<strong>Shift ${s}:</strong> ${sData.output.toLocaleString('id-ID')} Box <span style="color:#64748b; font-weight:normal;">|</span> <span style="color:#0ea5e9; font-weight:bold;">${sData.rasio.toFixed(2)} Batch</span>`;
    } else {
      rowOutput.innerHTML = `<strong>Shift ${s}:</strong> <span style="color:#94a3b8; font-style:italic;">No Data</span>`;
    }
  }

  let totalCapaian = 0;
  Object.keys(detail.shifts).forEach(k => totalCapaian += detail.shifts[k].rasio);
  
  document.getElementById('modal-total-output').innerText = `${detail.total_output.toLocaleString('id-ID')} Box (${totalCapaian.toFixed(2)} Batch)`;
  modal.style.display = 'flex';
}

function renderChartUI(payload, tanggalActive, bulanActive) {
  const ctx = document.getElementById('canvas-diagram');
  const emptyStateEl = document.getElementById('chart-empty-state');
  if (!ctx) return;
  
  if (myChart) {
    myChart.destroy();
    myChart = null;
  }
  
  if (payload.chartLabels.length === 0) {
    if (emptyStateEl) {
      emptyStateEl.style.display = 'block';
      emptyStateEl.innerHTML = `
        <div class="icon">📭</div>
        <h3>Tidak Ada Aktivitas Produksi</h3>
        <p style="font-size: 13px; margin-top: 6px;">Silakan pilih kombinasi tanggal atau bulan lain pada filter di atas.</p>
      `;
    }
    ctx.style.display = 'none';
    return;
  } else {
    if (emptyStateEl) {
      emptyStateEl.style.display = 'none';
    }
    ctx.style.display = 'block';
  }

  myChart = new Chart(ctx, {
    type: 'bar',
    plugins: [ChartDataLabels],
    data: {
      labels: payload.chartLabels,
      datasets: [{
        label: 'Akumulasi Pencapaian (Efisiensi)',
        data: payload.datasetCapaian,
        backgroundColor: 'rgba(56, 189, 248, 0.85)',
        borderColor: 'rgba(14, 165, 233, 1)',
        borderWidth: 2,
        borderRadius: 6,
        barThickness: 'flex',
        maxBarThickness: 70
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 40 } },
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const activeElement = elements[0];
          const dataIndex = activeElement.index;
          const selectedDetail = payload.metaDetails[dataIndex];
          showDrillDownModal(selectedDetail, tanggalActive, bulanActive);
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Total Pencapaian Batch', font: { weight: 'bold', size: 12 } },
          grid: { color: '#f1f5f9' }
        },
        x: {
          grid: { display: false },
          ticks: { autoSkip: false, maxRotation: 45, minRotation: 30, font: { size: 11, weight: '600' }, color: '#334155' }
        }
      },
      plugins: {
        legend: { display: false },
        datalabels: {
          color: '#1e293b', anchor: 'end', align: 'top', offset: 4, textAlign: 'center',
          font: { size: 11, weight: 'bold', family: "'Segoe UI', sans-serif" },
          formatter: function(value, context) {
            const idx = context.dataIndex;
            const detail = payload.metaDetails[idx];
            return `${Number(detail.total_output).toLocaleString('id-ID')} box\n${value.toFixed(2)} batch`;
          }
        },
        tooltip: {
          backgroundColor: '#0f172a', titleFont: { size: 14, weight: 'bold' }, bodyFont: { size: 12 }, padding: 14, cornerRadius: 8,
          callbacks: {
            label: function(context) {
              const idx = context.dataIndex;
              const detail = payload.metaDetails[idx];
              return [
                `📈 Pencapaian: ${context.parsed.y.toFixed(2)} batch`,
                `📦 Total Output: ${Number(detail.total_output).toLocaleString('id-ID')} box`,
                `🏷️ Prod: ${detail.produk}`,
                `🔢 Batch: ${detail.batch}`
              ];
            }
          }
        }
      }
    }
  });
}

// ==========================================
// INITIALIZATION APP & REALTIME CLOCK REFRESH
// ==========================================
let currentSavedDay = new Date().getDate();
function setupMidnightAutoRefresh() {
  setInterval(() => {
    const now = new Date();
    if (now.getDate() !== currentSavedDay) {
      currentSavedDay = now.getDate();
      sessionStorage.clear();
      window.location.reload();
    }
  }, 30000);
}

async function initDiagram() {
  const urlParams = new URLSearchParams(window.location.search);
  let filterBulan = urlParams.get('bulan');
  let filterMesin = urlParams.get('mesin') || 'all';
  let filterTanggal = urlParams.get('tanggal');

  if (!filterBulan) {
    filterBulan = getRealTimeMonth();
  }

  showLoadingState(true, `Sedang Memuat Data Bulan ${filterBulan === 'all' ? 'Semua Bulan' : filterBulan}...`);

  let dataMentah = [];
  const urutanBulanUrut = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  if (filterBulan && filterBulan !== 'all') {
    let cached = sessionStorage.getItem(`sheets_cache_${filterBulan}`);
    if (!cached) {
      dataMentah = await fetchAndParseSheets(filterBulan);
      sessionStorage.setItem(`sheets_cache_${filterBulan}`, JSON.stringify(dataMentah));
    } else {
      dataMentah = JSON.parse(cached);
    }
  } else {
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

  if (!filterTanggal) {
    const sysDate = getSystemDefaultDate(dataMentah);
    filterTanggal = sysDate.tanggal;
  }

  const masterTarget = await fetchMasterTarget();
  let payload = processDiagramData(dataMentah, filterBulan, filterMesin, filterTanggal, masterTarget);

  renderDropdowns(payload, filterBulan, filterMesin, filterTanggal);
  renderChartUI(payload, filterTanggal, filterBulan);
  setupMidnightAutoRefresh();

  const closeBtn = document.getElementById('close-modal-btn');
  const modal = document.getElementById('drilldown-modal');
  if (closeBtn && modal) {
    closeBtn.onclick = () => modal.style.display = 'none';
    window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
  }

  document.querySelectorAll('.filter-form').forEach(form => {
    const inputs = form.querySelectorAll('select');
    inputs.forEach(input => {
      input.onchange = async () => {
        const formData = new FormData(form);
        const currentBulan = formData.get('bulan') || 'all';
        const currentMesin = formData.get('mesin') || 'all';
        let currentTanggal = formData.get('tanggal') || 'all';

        showLoadingState(true, `Sedang Memperbarui Grafik Analisis...`);

        if (input.id === 'filter-bulan') {
          currentTanggal = 'all';
        }

        const targetUrl = new URL(window.location.href);
        targetUrl.searchParams.set('bulan', currentBulan);
        targetUrl.searchParams.set('mesin', currentMesin);
        targetUrl.searchParams.set('tanggal', currentTanggal);
        window.history.pushState({}, '', targetUrl);

        let dataFilterBulan = [];
        if (currentBulan !== 'all') {
          let cached = sessionStorage.getItem(`sheets_cache_${currentBulan}`);
          if (!cached) {
            const freshData = await fetchAndParseSheets(currentBulan);
            sessionStorage.setItem(`sheets_cache_${currentBulan}`, JSON.stringify(freshData));
            dataFilterBulan = freshData;
          } else {
            dataFilterBulan = JSON.parse(cached);
          }
        } else {
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

        let tempPayload = processDiagramData(dataFilterBulan, currentBulan, currentMesin, 'all', masterTarget);
        
        if (currentTanggal !== 'all' && !tempPayload.availableDates.includes(currentTanggal)) {
          currentTanggal = 'all';
          targetUrl.searchParams.set('tanggal', currentTanggal);
          window.history.pushState({}, '', targetUrl);
        }

        const currentPayload = processDiagramData(dataFilterBulan, currentBulan, currentMesin, currentTanggal, masterTarget);
        renderDropdowns(currentPayload, currentBulan, currentMesin, currentTanggal);
        renderChartUI(currentPayload, currentTanggal, currentBulan);
      };
    });
  });

  const btnRefresh = document.querySelector('.btn-refresh');
  if (btnRefresh) {
    btnRefresh.onclick = () => {
      sessionStorage.clear();
      window.location.reload();
    };
  }
}

document.addEventListener("DOMContentLoaded", initDiagram);