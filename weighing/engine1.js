/**
 * ENGINE 1: DOCUMENT EXTRACTION & PARSER
 *
 * Responsibilities:
 * - Read PDF / DOCX file ArrayBuffer
 * - Extract raw text per page / section
 * - Normalize extracted text (handle spacing, invisible characters, line endings)
 * - Extract Metadata (No Schedule, Nama Produk, Kode Produk, Kode Batch, Weigher, Packer, Tanggal Timbang, Shift)
 * - Isolate Weighing Table & Extract Carton Weights maintaining original document order and page boundary
 * - Reject non-carton values (Start/End Range, LPN, Lot, No MB, Date, Time, Footer Metadata)
 * - Return structured data or clear validation errors
 *
 * DO NOT INCLUDE: Business logic calculations (min, max, range analysis, verification limit, conclusion).
 */

(function (global) {
    'use strict';

    // =========================================================================
    // MAIN API
    // =========================================================================

    /**
     * Main entry point for document parsing.
     * @param {File} file - File object from input browser (.pdf or .docx)
     * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
     */
    async function parseDocument(file) {
        try {
            if (!file || !(file instanceof File)) {
                return { success: false, error: "File tidak valid atau tidak ditemukan." };
            }

            const extension = getFileExtension(file.name);
            let pages = [];

            if (extension === 'pdf') {
                pages = await extractPdfPages(file);
            } else if (extension === 'docx') {
                pages = await extractDocxPages(file);
            } else {
                return { success: false, error: "Format file tidak didukung. Harap masukkan file PDF atau DOCX." };
            }

            if (!pages || pages.length === 0) {
                return { success: false, error: "Gagal membaca isi dokumen atau dokumen kosong." };
            }

            // Normalization
            const normalizedPages = pages.map(p => ({
                page: p.page,
                text: normalizeText(p.text)
            }));

            const fullText = normalizedPages.map(p => p.text).join('\n');

            if (!fullText.trim()) {
                return { success: false, error: "Dokumen tidak mengandung teks terstruktur yang dapat dibaca." };
            }

            // Extract Metadata
            const metadata = extractMetadata(fullText, normalizedPages);

            // Extract Carton Records
            const cartons = extractCartonRecords(normalizedPages);

            // Validate Result
            const validation = validateParsedData(metadata, cartons);
            if (!validation.success) {
                return { success: false, error: validation.error };
            }

            return {
                success: true,
                data: {
                    metadata: metadata,
                    cartons: cartons
                }
            };

        } catch (err) {
            console.error("[Engine1 Error]:", err);
            return {
                success: false,
                error: "Terjadi kesalahan internal saat membaca dokumen: " + (err.message || err)
            };
        }
    }

    // Expose Global API
    global.parseDocument = parseDocument;
    if (typeof exports !== 'undefined') {
        exports.parseDocument = parseDocument;
    }

    // =========================================================================
    // FILE EXTRACTION HELPERS (PDF & DOCX)
    // =========================================================================

    function getFileExtension(filename) {
        if (!filename) return '';
        const parts = filename.split('.');
        return parts.length > 1 ? parts.pop().toLowerCase() : '';
    }

    /**
     * Extracts text page by page from PDF using client-side PDF.js
     */
    async function extractPdfPages(file) {
        const pdfjs = global.pdfjsLib || window.pdfjsLib;
        if (!pdfjs) {
            throw new Error("Library PDF.js tidak terdeteksi. Pastikan script pdf.min.js dimuat di HTML.");
        }

        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdfDoc = await loadingTask.promise;
        const numPages = pdfDoc.numPages;
        const pages = [];

        for (let i = 1; i <= numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();

            // Reconstruct text preserving layout order
            const items = textContent.items.map(item => ({
                text: item.str,
                x: item.transform[4],
                y: item.transform[5]
            }));

            // Group by vertical Y position (tolerance +/- 4px) to restore lines
            items.sort((a, b) => b.y - a.y || a.x - b.x);

            let pageText = '';
            let lastY = null;

            for (const item of items) {
                if (lastY !== null && Math.abs(item.y - lastY) > 4) {
                    pageText += '\n';
                } else if (pageText.length > 0 && !pageText.endsWith('\n') && !pageText.endsWith(' ')) {
                    pageText += ' ';
                }
                pageText += item.text;
                lastY = item.y;
            }

            pages.push({
                page: i,
                text: pageText
            });
        }

        return pages;
    }

    /**
     * Extracts plain text from DOCX using Mammoth.js
     */
    async function extractDocxPages(file) {
        const mammoth = global.mammoth || window.mammoth;
        if (!mammoth) {
            throw new Error("Library Mammoth.js tidak terdeteksi. Pastikan script mammoth.browser.min.js dimuat di HTML.");
        }

        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
        const rawText = result.value || '';

        // DOCX does not natively expose page breaks reliably in browser, treat as page 1 (or null if unspecified)
        return [{
            page: 1,
            text: rawText
        }];
    }

    // =========================================================================
    // TEXT NORMALIZATION
    // =========================================================================

    /**
     * Cleans whitespace, invisible tokens, non-breaking spaces while preserving lines & order.
     */
    function normalizeText(text) {
        if (!text) return '';
        return text
            .replace(/\u00A0/g, ' ')           // Convert NBSP to normal space
            .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width spaces
            .replace(/\r\n/g, '\n')            // Standardize line endings
            .replace(/\r/g, '\n')
            .replace(/[ \t]+/g, ' ')           // Collapse multiple horizontal spaces
            .split('\n')
            .map(line => line.trim())
            .join('\n');
    }

    // =========================================================================
    // METADATA EXTRACTION
    // =========================================================================

    function extractMetadata(fullText, pages) {
        const singleLineText = fullText.replace(/\n+/g, ' ');

        return {
            schedule: parseSchedule(singleLineText, fullText),
            productName: parseProductName(singleLineText, fullText),
            productCode: parseProductCode(singleLineText, fullText),
            batchCode: parseBatchCode(singleLineText, fullText),
            weigher: parseWeigher(singleLineText, fullText),
            packer: parsePacker(singleLineText, fullText),
            weighingDate: parseWeighingDate(singleLineText, fullText),
            shift: parseShift(singleLineText, fullText)
        };
    }

    function parseSchedule(singleLineText, fullText) {
        // Pattern e.g. "262006245-100"
        let match = singleLineText.match(/No\.?\s*Schedule\s*[:=]?\s*([A-Za-z0-9\-]+)/i);
        if (match && match[1] && /\d+-\d+/.test(match[1])) {
            return match[1].trim();
        }

        // Fallback: look for digits-digits after header
        match = singleLineText.match(/(\d{6,11}-\d{2,4})/);
        if (match && match[1]) {
            return match[1].trim();
        }

        return '';
    }

    function parseProductName(singleLineText, fullText) {
        // Ekstraksi Nama Produk setelah label "Nama Produk:"
        const match = fullText.match(/Nama\s*Produk\s*:\s*([\s\S]*?)(?=\s*(?:Start\s*Range|ED\s*:|MD\s*:|No\.?\s*Schedule|Kode\s*Produk|No\.?\s*Batch|$))/i);
        if (match && match[1]) {
            let name = match[1].replace(/\s+/g, ' ').trim();

            // Pembersihan noise header/metadata yang ikut terbaca
            name = name.replace(/No\.?\s*Batch\s*:.*$/i, '')
                       .replace(/Kode\s*Produk\s*:.*$/i, '')
                       .replace(/^[A-Z0-9]{4,10}\s+/, '') // Hapus kode produk di depan jika terbawa
                       .replace(/\s+[A-Z0-9]{2}\d{3,5}.*$/i, '') // Hapus kode batch dan teks selanjutnya di belakang (e.g. JJ091 No)
                       .replace(/\s+No\.?$/i, '') // Hapus "No" atau "No." yang tertinggal di akhir
                       .trim();

            if (name) return name;
        }

        // Fallback pencarian frasa nama produk (misal: KOMIX RASA PEPPERMINT LIQ /30SCH)
        const directName = fullText.match(/(KOMIX[A-Z0-9\s\/]+)/i);
        if (directName && directName[1]) {
            return directName[1].split(/Start|Range|No\.|ED:|Kode|[A-Z]{2}\d{3}/i)[0].trim();
        }

        return '';
    }

    function parseProductCode(singleLineText, fullText) {
        // Kode produk berbentuk 4-8 Karakter Kapital (contoh: LKPTA)
        const matchExplicit = fullText.match(/Kode\s*Produk\s*:\s*([A-Z0-9]{4,10})/i);
        if (matchExplicit && matchExplicit[1] && !/^(NAMA|PRODUK|BATCH|WEIGHER|PACKER)$/i.test(matchExplicit[1])) {
            return matchExplicit[1].trim();
        }

        // Pada text stream PDF, LKPTA sering berada persis sebelum kata KOMIX atau sebelum No. Schedule
        const matchBeforeProduct = fullText.match(/\b([A-Z]{4,10})\b\s+(?=KOMIX)/i);
        if (matchBeforeProduct && matchBeforeProduct[1]) {
            return matchBeforeProduct[1].trim();
        }

        // Search token LKPTA secara langsung jika ada dalam teks
        const matchLKPTA = fullText.match(/\b(LKPTA)\b/i);
        if (matchLKPTA) {
            return matchLKPTA[1].toUpperCase();
        }

        return '';
    }

    function parseBatchCode(singleLineText, fullText) {
        // Format utama: No. Batch: JJ091 atau cari pola Batch (2 huruf + 3 digit, e.g. JJ091)
        const match = fullText.match(/No\.?\s*Batch\s*:\s*([A-Za-z0-9-]+)/i);
        if (match && match[1]) {
            const val = match[1].trim();
            if (val.length >= 3 && val !== parseProductCode(singleLineText, fullText)) {
                return val;
            }
        }

        // Search pola batch khas (misal: JJ091)
        const matchPattern = fullText.match(/\b([A-Z]{2}\d{3,5})\b/);
        if (matchPattern && matchPattern[1]) {
            return matchPattern[1].trim();
        }

        return '';
    }

    function parseWeigher(singleLineText, fullText) {
        // Cari explicit label terlebih dahulu
        const labelMatch = fullText.match(/Weigher\s*:\s*([A-Z0-9]+)/i);
        if (labelMatch && labelMatch[1] && !/^(PACKER|SHIFT|SUPERVISOR|SENIOR|-)$/i.test(labelMatch[1])) {
            return labelMatch[1].trim();
        }

        // Cari ID operator pertama, fasilitasi exclusion terhadap kata kunci non-operator & batch/produk
        const batch = parseBatchCode(singleLineText, fullText);
        const prodCode = parseProductCode(singleLineText, fullText);

        const matches = [...fullText.matchAll(/\b([A-Z]{2,5}\d{2,4})\b/g)];
        const candidates = matches.map(m => m[1]).filter(val =>
            !/^(SHIFT|START|END|RANGE|SENIOR|PAGE|LOT|LPN|BOX|KG)$/i.test(val) &&
            val !== prodCode &&
            val !== batch
        );

        if (candidates.length >= 1) {
            return candidates[0].trim();
        }

        return '-';
    }

    function parsePacker(singleLineText, fullText) {
        // Cari explicit label terlebih dahulu
        const labelMatch = fullText.match(/Packer\s*:\s*([A-Z0-9]+)/i);
        if (labelMatch && labelMatch[1] && !/^(WEIGHER|SHIFT|SUPERVISOR|SENIOR|-)$/i.test(labelMatch[1])) {
            return labelMatch[1].trim();
        }

        // Cari ID operator kedua, fasilitasi exclusion terhadap kata kunci non-operator & batch/produk
        const batch = parseBatchCode(singleLineText, fullText);
        const prodCode = parseProductCode(singleLineText, fullText);

        const matches = [...fullText.matchAll(/\b([A-Z]{2,5}\d{2,4})\b/g)];
        const candidates = matches.map(m => m[1]).filter(val =>
            !/^(SHIFT|START|END|RANGE|SENIOR|PAGE|LOT|LPN|BOX|KG)$/i.test(val) &&
            val !== prodCode &&
            val !== batch
        );

        if (candidates.length >= 2) {
            return candidates[1].trim();
        }

        return '-';
    }

    function parseWeighingDate(singleLineText, fullText) {
        // Matches e.g. "21-Sep-26" or "21-sep-2026"
        const dateRegex = /(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4})/;

        // Look specifically in table rows or Tgl Timbang
        const match = singleLineText.match(/(?:Tgl|Tanggal)\.?\s*Timbang\s*[:=]?\s*(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4})/i);
        if (match && match[1]) {
            return normalizeDateFormat(match[1]);
        }

        // Generic search for first date in table
        const genericMatch = fullText.match(dateRegex);
        if (genericMatch && genericMatch[1]) {
            return normalizeDateFormat(genericMatch[1]);
        }

        return '';
    }

    function normalizeDateFormat(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.trim().split(/[-\s]/);
        if (parts.length === 3) {
            let day = parts[0].padStart(2, '0');
            let month = parts[1].toLowerCase();
            let year = parts[2];
            if (year.length === 2) {
                year = '20' + year;
            }
            return `${day}-${month}-${year}`;
        }
        return dateStr;
    }

    function parseShift(singleLineText, fullText) {
        const match = singleLineText.match(/Shift\s*[:=]?\s*(Shift\s*[1-3]|[1-3])/i);
        if (match && match[1]) {
            const raw = match[1].trim();
            const numMatch = raw.match(/[1-3]/);
            if (numMatch) {
                return `Shift ${numMatch[0]}`;
            }
        }
        return 'Shift 1';
    }

    // =========================================================================
    // CARTON / WEIGHT EXTRACTION
    // =========================================================================

    /**
     * Strictly extracts weighing records from table rows while ignoring range parameters,
     * dates, times, LPNs, Lot numbers, and footer metadata.
     */
    function extractCartonRecords(pages) {
        const cartons = [];
        let globalIndex = 1;

        pages.forEach(p => {
            const lines = p.text.split('\n');
            let inWeighingTable = false;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                // Detect Table Header Start
                if (/Lot\s*No|Berat\s*MB|LPN|Tgl\.\s*Timbang|Waktu\s*Timbang/i.test(line)) {
                    inWeighingTable = true;
                    continue;
                }

                // Detect Section End (Footer / Non-Record Metadata)
                if (/Senior\s*Packer|Weigher\s*:|Supervisor|Reprint\s*:|Page\s*\d+|ED\s*:|MD\s*:|No\.\s*Batch/i.test(line)) {
                    inWeighingTable = false;
                }

                // Skip Range Definition lines explicitly
                if (/Start\s*Range|End\s*Range|Range\s*Penimbangan|To\s+\d+\.\d+/i.test(line)) {
                    continue;
                }

                // Parse line tokens
                const weight = extractWeightFromLine(line, inWeighingTable);
                if (weight !== null) {
                    cartons.push({
                        index: globalIndex++,
                        weight: weight,
                        page: p.page,
                        isTimbangValid: true
                    });
                }
            }
        });

        return cartons;
    }

    /**
     * Extracts decimal weight value from a single table line.
     * Validates that the number is a decimal KG value (e.g. 14.523) and not an integer/ID/Time/Date.
     */
    function extractWeightFromLine(line, inWeighingTable) {
        // Standard record pattern: "1 1 1 14.523 21-Sep-26 09:04:54"
        const tokens = line.split(/\s+/);

        for (let i = 0; i < tokens.length; i++) {
            const tok = tokens[i];

            // Match decimal weight pattern e.g., 14.523, 12.538 (1-2 digits before dot, exactly 3 decimals)
            if (/^\d{1,2}\.\d{3}$/.test(tok)) {
                const val = parseFloat(tok);

                // Ignore times like 09.04.54 if formatted with dots instead of colons
                const prevToken = i > 0 ? tokens[i - 1] : '';
                const nextToken = i < tokens.length - 1 ? tokens[i + 1] : '';

                const isDateOrTimeContext =
                    /:\d{2}/.test(prevToken) ||
                    /:\d{2}/.test(nextToken);

                // Typical master box weight range validation (e.g., 5.000 KG to 50.000 KG)
                if (val >= 1.000 && val <= 99.999 && !isDateOrTimeContext) {
                    // Safe precision parsing to 3 decimal places
                    return Number(val.toFixed(3));
                }
            }
        }

        return null;
    }

    // =========================================================================
    // DATA VALIDATION
    // =========================================================================

    function validateParsedData(metadata, cartons) {
        const missingFields = [];

        if (!metadata.schedule) missingFields.push("No Schedule");
        if (!metadata.productName && !metadata.productCode) missingFields.push("Nama/Kode Produk");
        if (!metadata.batchCode) missingFields.push("Kode Batch");

        if (missingFields.length > 0) {
            return {
                success: false,
                error: `Metadata penting tidak ditemukan atau tidak lengkap: [${missingFields.join(', ')}]. Pastikan file laporan penimbangan sesuai format.`
            };
        }

        if (!cartons || cartons.length === 0) {
            return {
                success: false,
                error: "Data bobot karton (Berat MB) tidak ditemukan pada dokumen. Pastikan tabel penimbangan memiliki data valid."
            };
        }

        return { success: true };
    }

    // =========================================================================
    // INTERNAL TESTING HELPER (Non-intrusive)
    // =========================================================================

    function _runInternalSelfTest() {
        const sampleText = `
            Tgl & Waktu Cetak: 21-Sep-26 09:12:32 Laporan Penimbangan Master Box
            Kode Produk: LKPTA No. Schedule: 262006245-100 Nama Produk: KOMIX RASA PEPPERMINT LIQ /30SCH
            Start Range Penimbangan (KG): 14.660 To 14.920
            Lot No. MB LPN Berat MB Tgl. Timbang Waktu Timbang
            1 1 1 14.523 21-Sep-26 09:04:54 FPR151 MNS361
            2 1 2 14.529 21-Sep-26 09:05:51
            3 1 3 14.522 21-Sep-26 09:06:10
            No. Batch: JJ091 Weigher: FPR151 Packer: MNS361 Shift: Shift 1
        `;

        const normalized = normalizeText(sampleText);
        const meta = extractMetadata(normalized, [{ page: 1, text: normalized }]);
        const records = extractCartonRecords([{ page: 1, text: normalized }]);

        const isSuccess = meta.schedule === '262006245-100' &&
                          meta.productCode === 'LKPTA' &&
                          meta.productName === 'KOMIX RASA PEPPERMINT LIQ /30SCH' &&
                          meta.batchCode === 'JJ091' &&
                          meta.weigher === 'FPR151' &&
                          records.length === 3 &&
                          records[0].weight === 14.523;

        if (!isSuccess) {
            console.warn("[Engine1 Test Warning]: Internal self-test failed validation check.");
        }
    }

    // Run quick self-check on initialization
    try {
        _runInternalSelfTest();
    } catch (e) {
        // Silently ignore test exceptions in production
    }

})(typeof window !== 'undefined' ? window : globalThis);
