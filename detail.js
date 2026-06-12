// ==========================================
// CONFIGURATION & GLOBAL STATE (Sinkron dengan App Utama)
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

const MASTER_SHEETS_URL = "https://docs.google.com/spreadsheets/d/1iacLGBOQdkFxSAjlGm-CUlYm9s9hj8Tk9iGs8Mfg-z0/gviz/tq?gid=536194009";

// ==========================================
// CORE DATA FETCHING (Menggunakan Fungsi Asli Kamu)
// ==========================================
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
            const kodeProduk = row.c[1] ? String(row.c[1].v).trim().toUpperCase() : null;
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

// ==========================================
// UTILITY PARSER TANGGAL (Pencocokan Format Teks)
// ==========================================
function normalisasiFormatTanggal(str) {
    if (!str) return "";
    let clean = str.trim();
    return clean;
}

function formatTanggalIndo(strTanggal) {
    if (!strTanggal || strTanggal === "all") return "";
    const parts = strTanggal.split('/');
    if (parts.length === 3) {
        const namaBulanIndo = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        const day = parseInt(parts[0], 10);
        const monthIndex = parseInt(parts[1], 10) - 1;
        const year = parts[2];
        return `${day} ${namaBulanIndo[monthIndex]} ${year}`;
    }
    return strTanggal;
}

// ==========================================
// APPLICATION CONTROLLER FOR DETAIL.HTML
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const mesinId = urlParams.get("mesin") || "all";
    const filterBulan = urlParams.get("bulan") || "all";
    const filterTanggal = urlParams.get("tanggal") || "all";

    const txtHeaderTitle = document.getElementById("detail-header-title");
    const containerRender = document.getElementById("detail-render-container");

    // FIX STATE FILTER MESIN: Mengunci filter kembali ke diagram sesuai dengan ID mesin aktif saat ini
    const btnKembali = document.querySelector(".btn-back, .btn-kembali, a[href*='diagram.html']");
    if (btnKembali) {
        btnKembali.setAttribute("href", `diagram.html?bulan=${filterBulan}&mesin=${mesinId}&tanggal=${filterTanggal}`);
    }

    if (mesinId === "all") {
        alert("Pilih mesin terlebih dahulu!");
        window.location.href = `diagram.html?bulan=${filterBulan}&tanggal=${filterTanggal}`;
        return;
    }

    if (filterTanggal !== "all") {
        txtHeaderTitle.innerText = `Output Mesin ${mesinId} (${formatTanggalIndo(filterTanggal)})`;
    } else if (filterBulan !== "all") {
        txtHeaderTitle.innerText = `Output Mesin ${mesinId} (Output Total ${filterBulan})`;
    } else {
        txtHeaderTitle.innerText = `Output Mesin ${mesinId} (Semua Periode)`;
    }

    const cachedKey = `sheets_cache_${filterBulan}`;
    const cachedData = sessionStorage.getItem(cachedKey);
    let dataMentah = [];

    if (cachedData) {
        dataMentah = JSON.parse(cachedData);
    } else {
        containerRender.innerHTML = `<div class="empty-text">Menyinkronkan data utama dari spreadsheet...</div>`;
        if (typeof window.fetchAndParseSheets === "function") {
            dataMentah = await window.fetchAndParseSheets(filterBulan);
        } else {
            containerRender.innerHTML = `<div class="empty-text" style="color:red;">Error: Silakan kembali ke dashboard utama untuk memuat cache data.</div>`;
            return;
        }
    }

    const masterTarget = await fetchMasterTarget();

    let dataMesinTerpilih = dataMentah.filter(item => item.mesin.toLowerCase() === mesinId.toLowerCase());

    if (dataMesinTerpilih.length === 0) {
        containerRender.innerHTML = `<div class="empty-text">Tidak ada data untuk kombinasi mesin ${mesinId} ini.</div>`;
        return;
    }

    let flatDetailsList = [];
    dataMesinTerpilih.forEach(batchBlock => {
        if (batchBlock.details && Array.isArray(batchBlock.details)) {
            batchBlock.details.forEach(det => {
                const isOffOrEmpty = !det.kode_produk || det.kode_produk === "-" || det.kode_produk.toUpperCase() === "OFF" || det.kode_produk.toUpperCase() === "LIBUR";
                const numOutput = parseFloat(det.output) || 0;

                flatDetailsList.push({
                    tanggal: normalisasiFormatTanggal(det.tanggal),
                    shift: parseInt(det.shift) || 1,
                    kode_produk: det.kode_produk ? det.kode_produk.trim() : "-",
                    no_batch: det.no_batch ? det.no_batch.trim() : "-",
                    output: numOutput,
                    is_empty: isOffOrEmpty
                });
            });
        }
    });

    if (filterBulan !== "all" && filterTanggal === "all") {
        renderKondisiAkumulatifBulan(flatDetailsList, masterTarget);
    } else {
        let targetTanggalFilter = filterTanggal !== "all" ? normalisasiFormatTanggal(filterTanggal) : "all";
        renderKondisiPerTanggal(flatDetailsList, targetTanggalFilter, masterTarget);
    }
});

// ==========================================
// CORE RENDER LOGIC KONDISI B (PER TANGGAL)
// ==========================================
function renderKondisiPerTanggal(flatDetails, filterTanggal, masterTarget) {
    const containerRender = document.getElementById("detail-render-container");
    
    let dataFiltered = flatDetails;
    if (filterTanggal !== "all") {
        dataFiltered = flatDetails.filter(d => d.tanggal === filterTanggal);
    }

    if (dataFiltered.length === 0) {
        containerRender.innerHTML = `<div class="empty-text">Tidak ada data transaksi pada tanggal tersebut.</div>`;
        return;
    }

    let groupByTanggal = {};
    dataFiltered.forEach(item => {
        if (!groupByTanggal[item.tanggal]) groupByTanggal[item.tanggal] = [];
        groupByTanggal[item.tanggal].push(item);
    });

    const sortedTanggalList = Object.keys(groupByTanggal).sort((a, b) => {
        const partsA = a.split('/');
        const partsB = b.split('/');
        if (partsA.length !== 3 || partsB.length !== 3) return 0;
        return new Date(partsA[2], partsA[1] - 1, partsA[0]) - new Date(partsB[2], partsB[1] - 1, partsB[0]);
    });

    containerRender.innerHTML = ""; 

    sortedTanggalList.forEach((tgl, index) => {
        const listDataTgl = groupByTanggal[tgl];
        const sectionBlock = document.createElement("div");
        sectionBlock.className = "date-section-block";

        const shiftKalkulasi = {
            1: { totalOutput: 0, totalBatch: 0, totalTargetAsli: 0, items: [] },
            2: { totalOutput: 0, totalBatch: 0, totalTargetAsli: 0, items: [] },
            3: { totalOutput: 0, totalBatch: 0, totalTargetAsli: 0, items: [] }
        };

        listDataTgl.forEach(row => {
            const s = row.shift;
            if (shiftKalkulasi[s]) {
                if (!row.is_empty) {
                    shiftKalkulasi[s].totalOutput += row.output;
                    
                    let pembagi = 31250; 
                    const cleanKode = row.kode_produk.toUpperCase();
                    if (masterTarget[cleanKode]) {
                        pembagi = masterTarget[cleanKode];
                    }
                    
                    if (row.output > 0) {
                        shiftKalkulasi[s].totalBatch += (row.output / pembagi);
                    }
                    
                    // Simpan nilai target acuan produk (bukan di-override 1.0)
                    shiftKalkulasi[s].totalTargetAsli = pembagi; 
                    shiftKalkulasi[s].items.push(row);
                }
            }
        });

        const chartId1 = `gauge-s1-${index}`;
        const chartId2 = `gauge-s2-${index}`;
        const chartId3 = `gauge-s3-${index}`;

        let listShiftHTML = "";
        [1, 2, 3].forEach(s => {
            const itemRows = shiftKalkulasi[s].items;
            
            let headerOutputTotalHTML = "";
            if (itemRows.length > 0) {
                headerOutputTotalHTML = `<div class="total-header-row">| Output total : ${shiftKalkulasi[s].totalOutput.toLocaleString('id-ID')} box | ${shiftKalkulasi[s].totalBatch.toFixed(2)} Batch</div>`;
            }

            listShiftHTML += `
                <div class="shift-detail-row">
                    <strong>Shift ${s} :</strong>
                    <div class="shift-items-list">
                        ${headerOutputTotalHTML}
                        ${itemRows.map(r => {
                            return `<div>${r.kode_produk} ${r.no_batch} <span class="badge-out">${r.output.toLocaleString('id-ID')}</span></div>`;
                        }).join("") || '<div class="no-data">Tidak ada output produksi (Mesin Off/Libur)</div>'}
                    </div>
                </div>
            `;
        });

        sectionBlock.innerHTML = `
            <div class="speedometer-row">
                <div class="speedometer-card">
                    <div class="chart-wrapper">
                        <canvas id="${chartId1}"></canvas>
                        <div class="speedo-batch-text">${shiftKalkulasi[1].totalBatch.toFixed(2)}</div>
                    </div>
                    <div class="speedo-label">Shift 1</div>
                    <div class="speedo-box-text">${shiftKalkulasi[1].totalOutput.toLocaleString('id-ID')} box</div>
                </div>
                <div class="speedometer-card">
                    <div class="chart-wrapper">
                        <canvas id="${chartId2}"></canvas>
                        <div class="speedo-batch-text">${shiftKalkulasi[2].totalBatch.toFixed(2)}</div>
                    </div>
                    <div class="speedo-label">Shift 2</div>
                    <div class="speedo-box-text">${shiftKalkulasi[2].totalOutput.toLocaleString('id-ID')} box</div>
                </div>
                <div class="speedometer-card">
                    <div class="chart-wrapper">
                        <canvas id="${chartId3}"></canvas>
                        <div class="speedo-batch-text">${shiftKalkulasi[3].totalBatch.toFixed(2)}</div>
                    </div>
                    <div class="speedo-label">Shift 3</div>
                    <div class="speedo-box-text">${shiftKalkulasi[3].totalOutput.toLocaleString('id-ID')} box</div>
                </div>
            </div>

            <div class="shift-breakdown-box">
                ${listShiftHTML}
            </div>
            
            ${index < sortedTanggalList.length - 1 ? '<hr class="section-divider" />' : ''}
        `;

        containerRender.appendChild(sectionBlock);

        // Panggil pembuatan grafik dengan parameter aktual (Nilai Output Box vs Target Acuan)
        buatGaugeChart(chartId1, shiftKalkulasi[1].totalOutput, shiftKalkulasi[1].totalTargetAsli, "#2dd4bf"); 
        buatGaugeChart(chartId2, shiftKalkulasi[2].totalOutput, shiftKalkulasi[2].totalTargetAsli, "#fbbf24"); 
        buatGaugeChart(chartId3, shiftKalkulasi[3].totalOutput, shiftKalkulasi[3].totalTargetAsli, "#818cf8"); 
    });
}

// ==========================================
// CORE RENDER LOGIC KONDISI A (AKUMULATIF BULAN)
// ==========================================
function renderKondisiAkumulatifBulan(flatDetails, masterTarget) {
    const containerRender = document.getElementById("detail-render-container");
    containerRender.innerHTML = "";

    const shiftKalkulasi = {
        1: { totalOutput: 0, totalBatch: 0, totalTargetAsli: 0, groupMap: {} },
        2: { totalOutput: 0, totalBatch: 0, totalTargetAsli: 0, groupMap: {} },
        3: { totalOutput: 0, totalBatch: 0, totalTargetAsli: 0, groupMap: {} }
    };

    flatDetails.forEach(row => {
        if (!row.is_empty) {
            const s = row.shift;
            const gabungKey = `${row.kode_produk} ${row.no_batch}`;

            shiftKalkulasi[s].totalOutput += row.output;
            
            let pembagi = 31250;
            const cleanKode = row.kode_produk.toUpperCase();
            if (masterTarget[cleanKode]) {
                pembagi = masterTarget[cleanKode];
            }

            if (row.output > 0) {
                shiftKalkulasi[s].totalBatch += (row.output / pembagi);
            }
            
            // Simpan acuan pembagi murni untuk kalkulasi grafik akumulasi
            shiftKalkulasi[s].totalTargetAsli = pembagi;

            if (!shiftKalkulasi[s].groupMap[gabungKey]) {
                shiftKalkulasi[s].groupMap[gabungKey] = { output: 0 };
            }
            shiftKalkulasi[s].groupMap[gabungKey].output += row.output;
        }
    });

    let listShiftHTML = "";
    [1, 2, 3].forEach(s => {
        const arrayRows = Object.keys(shiftKalkulasi[s].groupMap).map(key => {
            const detailG = shiftKalkulasi[s].groupMap[key];
            return `<div>${key} <span class="badge-out">${detailG.output.toLocaleString('id-ID')}</span></div>`;
        });

        let headerOutputTotalHTML = "";
        if (arrayRows.length > 0) {
            headerOutputTotalHTML = `<div class="total-header-row">| Output total : ${shiftKalkulasi[s].totalOutput.toLocaleString('id-ID')} box | ${shiftKalkulasi[s].totalBatch.toFixed(2)} Batch</div>`;
        }

        listShiftHTML += `
            <div class="shift-detail-row">
                <strong>Shift ${s} (Akumulatif):</strong>
                <div class="shift-items-list">
                    ${headerOutputTotalHTML}
                    ${arrayRows.join("") || '<div class="no-data">Tidak ada produksi bulan ini</div>'}
                </div>
            </div>
        `;
    });

    const sectionBlock = document.createElement("div");
    sectionBlock.className = "date-section-block";
    
    sectionBlock.innerHTML = `
        <div class="speedometer-row">
            <div class="speedometer-card">
                <div class="chart-wrapper">
                    <canvas id="gauge-m-s1"></canvas>
                    <div class="speedo-batch-text">${shiftKalkulasi[1].totalBatch.toFixed(2)}</div>
                </div>
                <div class="speedo-label">Shift 1</div>
                <div class="speedo-box-text">${shiftKalkulasi[1].totalOutput.toLocaleString('id-ID')} box</div>
            </div>
            <div class="speedometer-card">
                <div class="chart-wrapper">
                    <canvas id="gauge-m-s2"></canvas>
                    <div class="speedo-batch-text">${shiftKalkulasi[2].totalBatch.toFixed(2)}</div>
                </div>
                <div class="speedo-label">Shift 2</div>
                <div class="speedo-box-text">${shiftKalkulasi[2].totalOutput.toLocaleString('id-ID')} box</div>
            </div>
            <div class="speedometer-card">
                <div class="chart-wrapper">
                    <canvas id="gauge-m-s3"></canvas>
                    <div class="speedo-batch-text">${shiftKalkulasi[3].totalBatch.toFixed(2)}</div>
                </div>
                <div class="speedo-label">Shift 3</div>
                <div class="speedo-box-text">${shiftKalkulasi[3].totalOutput.toLocaleString('id-ID')} box</div>
            </div>
        </div>
        <div class="shift-breakdown-box">
            ${listShiftHTML}
        </div>
    `;

    containerRender.appendChild(sectionBlock);

    buatGaugeChart("gauge-m-s1", shiftKalkulasi[1].totalOutput, shiftKalkulasi[1].totalTargetAsli, "#2dd4bf");
    buatGaugeChart("gauge-m-s2", shiftKalkulasi[2].totalOutput, shiftKalkulasi[2].totalTargetAsli, "#fbbf24");
    buatGaugeChart("gauge-m-s3", shiftKalkulasi[3].totalOutput, shiftKalkulasi[3].totalTargetAsli, "#818cf8");
}

// ==========================================
// DOUGHNUT SPEEDOMETER GAUGE - FIXED CONSISTENT RED LINE
// ==========================================
function buatGaugeChart(canvasId, totalOutputValue, targetAsliValue, colorTheme) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    // Jika tidak ada data target/0, set default fallback agar chart tidak crash
    const targetAman = targetAsliValue > 0 ? targetAsliValue : 10928;
    
    // Pembulatan angka target * 1.3 sesuai request (contoh: 10928 * 1.3 = 14206)
    const batasMaksimalGauge = Math.round(targetAman * 1.3);

    // Skala gauge atas dinamis jika realisasi melebihi kapasitas cadangan 1.3
    let maxGaugeScale = Math.max(batasMaksimalGauge, totalOutputValue);

    let dataChart = [];
    let warnaChart = [];

    if (totalOutputValue <= targetAman) {
        // Area sebelum mencapai target asli
        const sisaKeTargetAsli = targetAman - totalOutputValue;
        const areaOverKosong = maxGaugeScale - targetAman;
        
        dataChart = [totalOutputValue, sisaKeTargetAsli, areaOverKosong];
        // Mengubah warna sisa target kosong menjadi abu-baru tegas (#cbd5e1) agar konturnya terlihat
        warnaChart = [colorTheme, '#cbd5e1', '#e2e8f0'];
    } 
    else {
        // Area jika sudah melewati target asli (masuk zona biru over-produksi)
        const bagianOverTerisi = totalOutputValue - targetAman;
        const sisaOverKosong = maxGaugeScale - totalOutputValue;
        
        dataChart = [targetAman, bagianOverTerisi, sisaOverKosong];
        warnaChart = [colorTheme, '#3b82f6', '#e2e8f0']; 
    }

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: dataChart,
                backgroundColor: warnaChart,
                borderWidth: 1,
                borderColor: '#cbd5e1', // Mengubah border putih menjadi abu-abu halus agar lengkungan terlihat jelas
                hoverBorderWidth: 0,
                cutout: '74%'
            }]
        },
        options: {
            rotation: -90,
            circumference: 180,
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                animateRotate: true,
                animateScale: false
            },
            plugins: {
                tooltip: { enabled: false },
                legend: { display: false }
            }
        },
        plugins: [{
            id: 'targetLinePlugin',
            afterDraw: (chart) => {
                const { ctx, chartArea } = chart;
                const meta = chart.getDatasetMeta(0);
                
                const centerPointX = (chartArea.left + chartArea.right) / 2;
                const centerPointY = chartArea.bottom;
                
                const outerRadius = meta.data && meta.data[0] ? meta.data[0].outerRadius : (chartArea.right - chartArea.left) / 2;
                const innerRadius = meta.data && meta.data[0] ? meta.data[0].innerRadius : outerRadius * 0.74;

                // Proporsi sudut target statis di 150 derajat (karena max scale = target * 1.3)
                const proporsiTarget = targetAman / maxGaugeScale;
                const angleTargetRad = -Math.PI + (Math.PI * proporsiTarget);

                const startX = centerPointX + Math.cos(angleTargetRad) * innerRadius;
                const startY = centerPointY + Math.sin(angleTargetRad) * innerRadius;
                const endX = centerPointX + Math.cos(angleTargetRad) * (outerRadius + 4);
                const endY = centerPointY + Math.sin(angleTargetRad) * (outerRadius + 4);

                ctx.save();
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.lineWidth = 3;           
                ctx.strokeStyle = '#ef4444'; // Garis merah penanda target presisi
                ctx.stroke();
                ctx.restore();
            }
        }]
    });
}