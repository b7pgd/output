// ==========================================
// CONFIGURATION & GLOBAL STATE
// ==========================================
const CONFIG = {
    sheetGids: {
        "Januari": "1878816489",
        "Februari": "339606626",
        "Maret": "597553472",
        "April": "1333467666",
        "Mei": "587360054",
        "Juni": "1622550300",
        "Juli": "695077635",
        "Agustus": "1318929301",
        "September": "1763870211",
        "Oktober": "1593437933",
        "November": "391199552",
        "Desember": "351449246"
    },
    baseUrl: "https://docs.google.com/spreadsheets/d/10bKsfF0ozFcJSTWX5AhUJLAofJgB1o9QEL0KPRR1XIM/export?format=csv&gid="
};

// List kata kunci mesin valid yang disisir dari Kolom A spreadsheet asli
const VALID_MACHINE_KEYWORDS = ["JINSUNG", "SIG", "ILAPAK", "UNIFIL", "JOYEA", "YONAN"];

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

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

// Mengambil nama bulan lokal Indonesia secara otomatis berdasarkan tanggal sistem real-time
function getNamaBulanSekarang() {
    const namaBulanIndo = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    const bulanIndex = new Date().getMonth();
    return namaBulanIndo[bulanIndex];
}

// ==========================================
// CORE DATA FETCHING & PARSING (OPTIMIZED)
// ==========================================
async function fetchAndParseSheets(targetBulan = "all") {
    let semuaPencapaian = [];

    const daftarBulanYangDiambil = targetBulan === "all" 
        ? Object.entries(CONFIG.sheetGids)
        : Object.entries(CONFIG.sheetGids).filter(([namaBulan]) => namaBulan === targetBulan);

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

            // Sisir baris secara sekuensial murni ke bawah mencari nama mesin
            for (let r = 3; r < totalBaris; r++) {
                let cellKolomA = records[r][0]?.trim() || "";
                
                let IsValidMachineRow = VALID_MACHINE_KEYWORDS.some(keyword => 
                    cellKolomA.toUpperCase().includes(keyword)
                );

                if (IsValidMachineRow) {
                    let namaMesinBersih = cleanNamaMesin(cellKolomA);
                    let upperNama = namaMesinBersih.toUpperCase();

                    if (namaMesinBersih === "" || upperNama.includes("KODE") || upperNama.includes("PRODUK") || upperNama.includes("BATCH")) {
                        continue;
                    }

                    let mesinRow = r;
                    
                    // PENENTUAN JUMLAH BATCH DAN OFFSET SECARA DINAMIS
                    let currentBatchOffsets = [
                        { label: "Batch 1", kode: 0, batch: 1, output: 2 },
                        { label: "Batch 2", kode: 4, batch: 5, output: 6 }
                    ];
                    let lompatanBaris = 7; // Menggunakan variabel tunggal yang dapat diubah nilainya

                    if (upperNama.includes("JINSUNG")) {
                        currentBatchOffsets = [
                            { label: "Batch 1", kode: 0, batch: 1, output: 2 },
                            { label: "Batch 2", kode: 4, batch: 5, output: 6 },
                            { label: "Batch 3", kode: 8, batch: 9, output: 10 }
                        ];
                        lompatanBaris = 11; // PERBAIKAN BUG: Jangan pakai 'let' lagi agar merubah scope luar
                    }

                    // Proses kelompok Batch sesuai konfigurasi dinamis mesin tersebut
                    for (const b of currentBatchOffsets) {
                        const kodeRow = mesinRow + b.kode;
                        const batchRow = mesinRow + b.batch;
                        const outputRow = mesinRow + b.output;

                        if (outputRow >= totalBaris) continue;

                        let listDetails = [];
                        let currentTanggal = "";

                        // Loop Horizontal: Sisir kolom mulai dari Kolom C (Index 2) ke kanan
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

                            listDetails.push({
                                tanggal: currentTanggal,
                                shift: shiftKerja,
                                kode_produk: kodeProduk,
                                no_batch: noBatch,
                                output: valOutput
                            });
                        }

                        semuaPencapaian.push({
                            bulan: namaBulan,
                            mesin: namaMesinBersih,
                            nama_batch: b.label,
                            details: listDetails
                        });
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

// ==========================================
// DATA PROCESSING (GETTERS)
// ==========================================
function getDashboardData(dataMentah, bulanFilter, mesinFilter) {
    let mapBulan = new Set(), mapMesin = new Set();
    
    dataMentah.forEach(item => {
        if (item.bulan) mapBulan.add(item.bulan);
        if (item.mesin) mapMesin.add(item.mesin);
    });

    Object.keys(CONFIG.sheetGids).forEach(b => mapBulan.add(b));

    const urutanBulanAcuan = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    const listBulan = Array.from(mapBulan).sort((a, b) => urutanBulanAcuan.indexOf(a) - urutanBulanAcuan.indexOf(b));
    const listMesin = Array.from(mapMesin).sort();

    let dataFiltered = [];
    let maxOutputs = 0;

    dataMentah.forEach(item => {
        const matchBulan = (bulanFilter === "all" || item.bulan === bulanFilter);
        const matchMesin = (mesinFilter === "all" || item.mesin === mesinFilter);

        if (matchBulan && matchMesin) {
            dataFiltered.push(item);
            if (item.details.length > maxOutputs) {
                maxOutputs = item.details.length;
            }
        }
    });

    return { bulanFilter, mesinFilter, listBulan, listMesin, data: dataFiltered, maxOutputs };
}

// ==========================================
// RENDERING UI (DOM MANIPULATION)
// ==========================================
function renderDropdowns(payload) {
    const bulanSelect = document.getElementById('filter-bulan');
    const mesinSelect = document.getElementById('filter-mesin');
    
    if (bulanSelect) {
        // PERBAIKAN: Opsi "-- Semua Bulan --" telah dihapus dari baris ini
        bulanSelect.innerHTML = ``;
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

    // PERBAIKAN FATAL: Deteksi dinamis nama file html saat ini agar link href tidak memaksa pindah halaman tak terduga
    const currentFilename = window.location.pathname.split("/").pop() || "index.html";

    const btnSuccess = document.querySelector('.btn-success');
    if (btnSuccess && currentFilename === "index.html") {
        btnSuccess.href = `pencapaian.html?bulan=${payload.bulanFilter}&mesin=${payload.mesinFilter}`;
    }
    
    const btnSecondary = document.querySelector('.btn-secondary');
    if (btnSecondary && currentFilename === "index.html") {
        btnSecondary.href = `diagram.html?bulan=${payload.bulanFilter}&mesin=${payload.mesinFilter}`;
    }
}

function renderDashboardTable(payload) {
    const thead = document.querySelector('.styled-table thead');
    const tbody = document.querySelector('.styled-table tbody');
    if (!thead || !tbody) return;

    let headerRow1 = `<tr>
        <th rowspan="2" class="sticky-corner" style="vertical-align: middle;">Nama Mesin</th>
        <th rowspan="2" style="z-index:15; border-bottom: 2px solid #cbd5e1; background-color: #cbd5e1; color:#0f172a; vertical-align: middle; text-align:center;">Batch</th>`;
    let headerRow2 = `<tr>`;

    if (payload.data.length > 0) {
        let setHeaderTgl = new Set();
        const firstRowDetails = payload.data[0].details;
        
        firstRowDetails.forEach(detail => {
            if (!setHeaderTgl.has(detail.tanggal)) {
                setHeaderTgl.add(detail.tanggal);
                headerRow1 += `<th colspan="3" style="text-align:center; font-weight: bold; border-bottom: 1px solid #cbd5e1;">📅 ${detail.tanggal || 'N/A'}</th>`;
            }
        });
        
        for (let i = 0; i < payload.maxOutputs; i++) {
            headerRow2 += `<th style="text-align:center; min-width:110px;">Shift ${(i % 3) + 1}</th>`;
        }
    } else {
        if (payload.maxOutputs > 0) {
            headerRow1 += `<th colspan="${payload.maxOutputs}" style="text-align:center;">Data Kosong</th>`;
            for (let i = 0; i < payload.maxOutputs; i++) {
                headerRow2 += `<th style="text-align:center; min-width:110px;">Shift ${(i % 3) + 1}</th>`;
            }
        }
    }
    
    headerRow1 += `</tr>`;
    headerRow2 += `</tr>`;
    thead.innerHTML = headerRow1 + headerRow2;

    let bodyHtml = ``;
    if (payload.data.length > 0) {
        let groupedByMesin = {};
        payload.data.forEach(item => {
            if (!groupedByMesin[item.mesin]) groupedByMesin[item.mesin] = [];
            groupedByMesin[item.mesin].push(item);
        });

        Object.keys(groupedByMesin).forEach(namaMesin => {
            let recordsMesin = groupedByMesin[namaMesin];
            
            recordsMesin.forEach((item, index) => {
                const isLastRow = (index === recordsMesin.length - 1);
                bodyHtml += `<tr class="${isLastRow ? 'machine-group-end' : ''}">`;
                
                if (index === 0) {
                    bodyHtml += `<td rowspan="${recordsMesin.length}" class="sticky-col" style="font-weight: 600; color: #1e3a8a; vertical-align: middle; border-right: 2px solid #cbd5e1;">${item.mesin}</td>`;
                }
                
                bodyHtml += `<td style="font-weight: 500; background: #f8fafc; color: #475569; text-align:center; border-right: 1px solid #e2e8f0;">${item.nama_batch}</td>`;
                
                item.details.forEach(det => {
                    const isEmpty = !det.output || det.output === "0" || det.output === "0.0";
                    bodyHtml += `
                    <td class="${isEmpty ? 'bg-empty' : ''}" style="text-align: center;">
                        <div class="cell-container" title="Tanggal: ${det.tanggal} | Shift: ${det.shift} | ${item.nama_batch}">
                            <div class="badge-kode" title="Kode Produk">${det.kode_produk}</div>
                            <div class="badge-batch" title="No. Batch">${det.no_batch}</div>
                            <div class="output-value">${isEmpty ? '-' : det.output}</div>
                        </div>
                    </td>`;
                });
                bodyHtml += `</tr>`;
            });
        });
    } else {
        bodyHtml = `<tr><td colspan="100" style="text-align:center; padding: 40px; color: #64748b;">Tidak ada data produksi yang cocok.</td></tr>`;
    }
    tbody.innerHTML = bodyHtml;
}

// ==========================================
// APP INITIALIZATION & EVENT LISTENERS
// ==========================================
async function initApp() {
    const urlParams = new URLSearchParams(window.location.search);
    
    // PERBAIKAN: Jika parameter 'bulan' bernilai 'all' atau tidak ada, langsung arahkan default ke bulan saat ini
    let filterBulan = urlParams.get('bulan');
    if (!filterBulan || filterBulan === 'all') {
        filterBulan = getNamaBulanSekarang();
    }
    const filterMesin = urlParams.get('mesin') || 'all';

    const filterForm = document.querySelector('.filter-form');

    // Event Listener Universal untuk Tombol Sync & Refresh (.btn-sync)
    const syncButtons = document.querySelectorAll('.btn-sync');
    syncButtons.forEach(refreshBtn => {
        refreshBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            refreshBtn.innerHTML = "⏳ Syncing...";
            refreshBtn.style.pointerEvents = "none";
            
            sessionStorage.removeItem(`sheets_cache_${filterBulan}`);
            
            const data = await fetchAndParseSheets(filterBulan);
            sessionStorage.setItem(`sheets_cache_${filterBulan}`, JSON.stringify(data));
            
            window.location.reload();
        });
    });

    // PERBAIKAN EVENT DROP DOWN: langsung trigger form submit saat option berubah
    if (filterForm) {
        const selectElements = filterForm.querySelectorAll('select');
        selectElements.forEach(select => {
            select.addEventListener('change', () => {
                filterForm.dispatchEvent(new Event('submit', { cancelable: true }));
            });
        });

        filterForm.onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(filterForm);
            const targetBulan = formData.get('bulan') || filterBulan;
            const targetMesin = formData.get('mesin') || filterMesin;

            // Set URL parameters tanpa memaksa reload atau menendang ke index.html
            const targetUrl = new URL(window.location.href);
            targetUrl.searchParams.set('bulan', targetBulan);
            targetUrl.searchParams.set('mesin', targetMesin);
            window.history.pushState({}, '', targetUrl);

            let dataBulanForm = [];
            const cachedForm = sessionStorage.getItem(`sheets_cache_${targetBulan}`);
            if (cachedForm) {
                dataBulanForm = JSON.parse(cachedForm);
            } else {
                const tbody = document.querySelector('.styled-table tbody');
                if (tbody) tbody.innerHTML = `<tr><td colspan="100" style="text-align:center; padding: 40px; color: #64748b;">Memuat data bulan ${targetBulan}...</td></tr>`;
                
                dataBulanForm = await fetchAndParseSheets(targetBulan);
                sessionStorage.setItem(`sheets_cache_${targetBulan}`, JSON.stringify(dataBulanForm));
            }

            const payload = getDashboardData(dataBulanForm, targetBulan, targetMesin);
            renderDropdowns(payload);
            
            if (typeof renderDashboardTable === "function") {
                renderDashboardTable(payload);
            }
            
            if (typeof window.renderCoreDiagramChart === "function") {
                window.renderCoreDiagramChart(payload);
            }
        };
    }

    // Pemuatan awal berbasis cache/fetch parsial bulan aktif
    let dataMentah = [];
    const cachedKey = `sheets_cache_${filterBulan}`;
    const cachedData = sessionStorage.getItem(cachedKey);

    if (cachedData) {
        dataMentah = JSON.parse(cachedData);
    } else {
        dataMentah = await fetchAndParseSheets(filterBulan);
        sessionStorage.setItem(cachedKey, JSON.stringify(dataMentah));
    }

    const payload = getDashboardData(dataMentah, filterBulan, filterMesin);
    renderDropdowns(payload);
    
    if (typeof renderDashboardTable === "function") {
        renderDashboardTable(payload);
    }
}

document.addEventListener("DOMContentLoaded", initApp);