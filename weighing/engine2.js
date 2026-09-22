/**
 * ENGINE 2: BUSINESS LOGIC & CALCULATION ENGINE
 *
 * Responsibilities:
 * - Structured Data Input Validation
 * - Exclude "Karton Ketengan" (Last Carton) from core statistical analysis
 * - Find Minimum and Maximum Weights (preserving positional order and indexes)
 * - Determine Position-based Analysis Range (5 records before + Minimum + 5 records after)
 * - Handle Special Range Cases: First carton minimum, Nearby duplicate minimums, Last normal carton minimum
 * - Calculate Verification Limit = Range Highest Weight - 0.200 KG
 * - Generate Verification Comparison & Business Conclusion
 *
 * STRICT RULES:
 * - NO DOM manipulation or UI code
 * - NO File parsing logic
 * - NO External network calls
 */

(function (global) {
    'use strict';

    // =========================================================================
    // CONSTANTS & CONFIGURATION
    // =========================================================================

    const RANGE_BEFORE = 5;
    const RANGE_AFTER = 5;
    const VERIFICATION_DEDUCTION = 0.200;

    // =========================================================================
    // MAIN PUBLIC API
    // =========================================================================

    /**
     * Main calculation API for business rules execution.
     * @param {Object} parsedData - Structured output from Engine 1
     * @returns {Object} Structured analysis result or error object
     */
    function analyzeWeighingData(parsedData) {
        try {
            // Step 1: Input Validation
            const validation = validateInput(parsedData);
            if (!validation.isValid) {
                return {
                    success: false,
                    error: validation.error || "Data penimbangan tidak valid."
                };
            }

            const { metadata, cartons } = parsedData;

            // Step 2: Separate Analytical Cartons & Ketengan
            const { analyticalCartons, excludedKetengan } = getAnalyticalCartons(cartons);

            if (analyticalCartons.length === 0) {
                return {
                    success: false,
                    error: "Tidak ada data karton valid untuk dianalisis setelah pemisahan karton ketengan."
                };
            }

            // Step 3: Global Statistical Metrics (Lowest & Highest)
            const lowestWeight = findLowestWeight(analyticalCartons);
            const highestWeight = findHighestWeight(analyticalCartons);
            const lowestIndexes = findIndexesByWeight(analyticalCartons, lowestWeight);

            // Step 4: Range Determination (Position-Based)
            const rangeDecision = determineAnalysisRange(
                analyticalCartons,
                lowestWeight,
                lowestIndexes,
                RANGE_BEFORE,
                RANGE_AFTER
            );

            const analysisRange = rangeDecision.selectedRange;
            const rangeHighestWeight = findHighestWeight(analysisRange);

            // Step 5: Verification Limit Calculation
            const verificationLimit = calculateVerificationLimit(rangeHighestWeight, VERIFICATION_DEDUCTION);

            // Step 6: Comparison and Business Conclusion
            const conclusionData = determineConclusion(lowestWeight, verificationLimit);

            // Step 7: Build Final Result
            return buildAnalysisResult({
                metadata,
                lowestWeight,
                highestWeight,
                lowestIndexes,
                analysisRange,
                rangeHighestWeight,
                deduction: VERIFICATION_DEDUCTION,
                verificationLimit,
                comparison: conclusionData.comparison,
                comparisonText: conclusionData.comparisonText,
                conclusion: conclusionData.conclusion,
                debugInfo: {
                    primaryLowestIndex: rangeDecision.primaryIndex,
                    minimumIndexes: lowestIndexes,
                    caseApplied: rangeDecision.caseApplied,
                    excludedKetenganIndexes: excludedKetengan.map(c => c.index),
                    rangeStartIndex: analysisRange.length > 0 ? analysisRange[0].index : null,
                    rangeEndIndex: analysisRange.length > 0 ? analysisRange[analysisRange.length - 1].index : null
                }
            });

        } catch (err) {
            return {
                success: false,
                error: "Terjadi kesalahan internal pada perhitungan engine2: " + (err.message || err)
            };
        }
    }

    // Expose API to global/window object
    global.analyzeWeighingData = analyzeWeighingData;
    if (typeof exports !== 'undefined') {
        exports.analyzeWeighingData = analyzeWeighingData;
    }

    // =========================================================================
    // STEP 1: VALIDATION
    // =========================================================================

    function validateInput(parsedData) {
        if (!parsedData || typeof parsedData !== 'object') {
            return { isValid: false, error: "Input parsedData tidak ada atau bukan object." };
        }

        if (!parsedData.metadata || typeof parsedData.metadata !== 'object') {
            return { isValid: false, error: "Metadata dokumen tidak ditemukan." };
        }

        if (!Array.isArray(parsedData.cartons) || parsedData.cartons.length === 0) {
            return { isValid: false, error: "Data karton tidak berupa array atau kosong." };
        }

        for (let i = 0; i < parsedData.cartons.length; i++) {
            const item = parsedData.cartons[i];
            if (!item || typeof item !== 'object') {
                return { isValid: false, error: `Record karton pada baris ${i + 1} tidak valid.` };
            }
            if (typeof item.weight !== 'number' || isNaN(item.weight) || !isFinite(item.weight) || item.weight <= 0) {
                return { isValid: false, error: `Bobot karton pada index ${item.index || i + 1} tidak valid.` };
            }
            if (typeof item.index !== 'number' || item.index <= 0) {
                return { isValid: false, error: `Index karton pada baris ${i + 1} tidak valid.` };
            }
        }

        return { isValid: true };
    }

    // =========================================================================
    // STEP 2: KETENGAN HANDLING
    // =========================================================================

    /**
     * Filters out the last carton if it represents a "karton ketengan" according to specs.
     * Returns analytical cartons and list of excluded cartons.
     */
    function getAnalyticalCartons(cartons) {
        const analyticalCartons = [];
        const excludedKetengan = [];

        if (cartons.length === 0) {
            return { analyticalCartons, excludedKetengan };
        }

        const total = cartons.length;

        for (let i = 0; i < total; i++) {
            const item = cartons[i];
            const isLast = (i === total - 1);

            // Special explicit flags from parser
            const isKetenganFlag = item.isKetengan === true || (isLast && item.isLastCarton === true);

            if (isLast && isKetenganFlag) {
                // Check if explicitly marked NOT ketengan
                if (item.isExplicitNonKetengan === true) {
                    analyticalCartons.push(item);
                } else {
                    excludedKetengan.push(item);
                }
            } else {
                analyticalCartons.push(item);
            }
        }

        return { analyticalCartons, excludedKetengan };
    }

    // =========================================================================
    // STEP 3: STATISTICAL HELPERS
    // =========================================================================

    function findLowestWeight(cartons) {
        let min = Infinity;
        for (let i = 0; i < cartons.length; i++) {
            if (cartons[i].weight < min) {
                min = cartons[i].weight;
            }
        }
        return roundPrecision(min);
    }

    function findHighestWeight(cartons) {
        let max = -Infinity;
        for (let i = 0; i < cartons.length; i++) {
            if (cartons[i].weight > max) {
                max = cartons[i].weight;
            }
        }
        return roundPrecision(max);
    }

    function findIndexesByWeight(cartons, targetWeight) {
        const indexes = [];
        for (let i = 0; i < cartons.length; i++) {
            if (Math.abs(cartons[i].weight - targetWeight) < 0.0001) {
                indexes.push(cartons[i].index);
            }
        }
        return indexes;
    }

    // =========================================================================
    // STEP 4: POSITION-BASED RANGE DETERMINATION
    // =========================================================================

    function determineAnalysisRange(cartons, lowestWeight, lowestIndexes, beforeCount, afterCount) {
        if (cartons.length === 0) {
            return { selectedRange: [], primaryIndex: null, caseApplied: "empty" };
        }

        // Map global index to array internal index
        const indexToPosMap = new Map();
        for (let pos = 0; pos < cartons.length; pos++) {
            indexToPosMap.set(cartons[pos].index, pos);
        }

        const primaryLowestGlobalIndex = lowestIndexes[0];
        const primaryPos = indexToPosMap.get(primaryLowestGlobalIndex);

        let startPos = Math.max(0, primaryPos - beforeCount);
        let endPos = Math.min(cartons.length - 1, primaryPos + afterCount);

        let caseApplied = "normal_window";

        if (primaryPos === 0) {
            caseApplied = "first_carton_minimum";
        } else if (primaryPos + afterCount >= cartons.length - 1) {
            caseApplied = "near_end_minimum";
        }

        // Handle Nearby Duplicate Minimum Case
        if (lowestIndexes.length > 1) {
            const primaryPage = cartons[primaryPos].page;

            for (let k = 1; k < lowestIndexes.length; k++) {
                const dupGlobalIndex = lowestIndexes[k];
                const dupPos = indexToPosMap.get(dupGlobalIndex);

                if (dupPos !== undefined) {
                    const dupPage = cartons[dupPos].page;

                    // Page boundary respect check: only consider if within same page or adjacent position
                    const isSamePageOrUnspecified = (!primaryPage || !dupPage || primaryPage === dupPage);

                    // Check if duplicate falls within or directly adjacent to current window window (+/- 2 extended pos)
                    if (dupPos >= startPos - 2 && dupPos <= endPos + 2 && isSamePageOrUnspecified) {
                        // Extend range to cover both duplicate minimums and their respective surrounding windows
                        const dupStart = Math.max(0, dupPos - beforeCount);
                        const dupEnd = Math.min(cartons.length - 1, dupPos + afterCount);

                        startPos = Math.min(startPos, dupStart);
                        endPos = Math.max(endPos, dupEnd);

                        caseApplied = "nearby_duplicate_minimum";
                    }
                }
            }
        }

        const selectedRange = cartons.slice(startPos, endPos + 1);

        return {
            selectedRange,
            primaryIndex: primaryLowestGlobalIndex,
            caseApplied
        };
    }

    // =========================================================================
    // STEP 5 & 6: CALCULATION & CONCLUSION
    // =========================================================================

    function calculateVerificationLimit(rangeHighestWeight, deduction) {
        const result = rangeHighestWeight - deduction;
        return roundPrecision(result);
    }

    function determineConclusion(lowestWeight, verificationLimit) {
        // Safe numerical float comparison
        const diff = roundPrecision(lowestWeight - verificationLimit);

        if (diff > 0) {
            return {
                comparison: "above",
                comparisonText: "Berat terendah > berat batas verifikasi",
                conclusion: "tidak dilakukan verifikasi bongkar karton terendah."
            };
        } else {
            return {
                comparison: "at_or_below",
                comparisonText: "Berat terendah <= berat batas verifikasi",
                conclusion: "dilakukan verifikasi bongkar karton terendah."
            };
        }
    }

    function roundPrecision(value) {
        return Math.round((value + Number.EPSILON) * 1000) / 1000;
    }

    // =========================================================================
    // STEP 7: RESULT FORMATTER
    // =========================================================================

    function buildAnalysisResult(params) {
        return {
            success: true,
            metadata: params.metadata,
            analysis: {
                lowestWeight: params.lowestWeight,
                highestWeight: params.rangeHighestWeight,
                lowestIndexes: params.lowestIndexes,
                rangeStartIndex: params.analysisRange.length > 0 ? params.analysisRange[0].index : null,
                rangeEndIndex: params.analysisRange.length > 0 ? params.analysisRange[params.analysisRange.length - 1].index : null,
                analysisRange: params.analysisRange.map(c => ({
                    index: c.index,
                    weight: c.weight,
                    page: c.page || 1
                })),
                rangeHighestWeight: params.rangeHighestWeight,
                deduction: params.deduction,
                verificationLimit: params.verificationLimit,
                comparison: params.comparison,
                comparisonText: params.comparisonText,
                conclusion: params.conclusion,
                debug: params.debugInfo
            }
        };
    }

    // =========================================================================
    // INTERNAL SELF-TEST SUITE
    // =========================================================================

    function _runInternalTests() {
        const testMetadata = { schedule: "262006245-100", batchCode: "JJ091" };

        // Test 1: Standard Window
        const sampleCartons1 = [
            { index: 1, weight: 14.527, page: 1 },
            { index: 2, weight: 14.534, page: 1 },
            { index: 3, weight: 14.529, page: 1 },
            { index: 4, weight: 14.541, page: 1 },
            { index: 5, weight: 14.536, page: 1 },
            { index: 6, weight: 14.548, page: 1 },
            { index: 7, weight: 14.531, page: 1 },
            { index: 8, weight: 14.526, page: 1 },
            { index: 9, weight: 14.522, page: 1 }, // Minimum
            { index: 10, weight: 14.543, page: 1 },
            { index: 11, weight: 14.537, page: 1 },
            { index: 12, weight: 14.525, page: 1 },
            { index: 13, weight: 14.533, page: 1 },
            { index: 14, weight: 14.528, page: 1 },
            { index: 15, weight: 12.538, page: 1, isKetengan: true }
        ];

        const res1 = analyzeWeighingData({ metadata: testMetadata, cartons: sampleCartons1 });
        if (!res1.success || res1.analysis.lowestWeight !== 14.522 || res1.analysis.rangeHighestWeight !== 14.548) {
            console.warn("[Engine2 Test Warning]: Test 1 failed.");
        }

        // Test 2: First Carton Minimum
        const sampleCartons2 = [
            { index: 1, weight: 14.522, page: 1 }, // Minimum at first
            { index: 2, weight: 14.527, page: 1 },
            { index: 3, weight: 14.534, page: 1 },
            { index: 4, weight: 14.529, page: 1 },
            { index: 5, weight: 14.541, page: 1 },
            { index: 6, weight: 14.536, page: 1 }
        ];
        const res2 = analyzeWeighingData({ metadata: testMetadata, cartons: sampleCartons2 });
        if (!res2.success || res2.analysis.rangeStartIndex !== 1) {
            console.warn("[Engine2 Test Warning]: Test 2 (First Carton) failed.");
        }
    }

    try {
        _runInternalTests();
    } catch (e) {
        // Silently ignore test errors in production runtime
    }

})(typeof window !== 'undefined' ? window : globalThis);
