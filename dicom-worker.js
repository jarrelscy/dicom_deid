/**
 * Web Worker for processing DICOM files
 * Handles DICOM parsing, de-identification, and scrambling
 */

// Import required libraries
// Use the current origin to build absolute URLs
const baseUrl = self.location.href.substring(0, self.location.href.lastIndexOf('/'));
importScripts(baseUrl + '/jszip.min.js');
importScripts(baseUrl + '/dcmjs.min.js');
importScripts(baseUrl + '/scrambler.js');

// DICOM tag whitelist - only these tags will be kept
const WHITELISTED_TAGS = {
    // File Meta Information
    '00020000': 'FileMetaInformationGroupLength',
    '00020001': 'FileMetaInformationVersion',
    '00020002': 'MediaStorageSOPClassUID',
    '00020003': 'MediaStorageSOPInstanceUID', // scrambled UID
    '00020010': 'TransferSyntaxUID',
    '00020012': 'ImplementationClassUID',
    '00020013': 'ImplementationVersionName',
    
    // Dataset
    '00080005': 'SpecificCharacterSet',
    '00080008': 'ImageType',
    '00080016': 'SOPClassUID',
    '0020000D': 'StudyInstanceUID', // scrambled UID
    '0020000E': 'SeriesInstanceUID', // scrambled UID
    '00080018': 'SOPInstanceUID', // scrambled UID
    '00080020': 'StudyDate', // scrambled date
    '00080021': 'SeriesDate', // scrambled date
    '00080022': 'AcquisitionDate', // scrambled date
    '00080023': 'ContentDate', // scrambled date
    '00080030': 'StudyTime', // scrambled time
    '00080031': 'SeriesTime', // scrambled time
    '00080032': 'AcquisitionTime', // scrambled time
    '00080033': 'ContentTime', // scrambled time
    '00080050': 'AccessionNumber', // scrambled text
    '00080060': 'Modality',
    '00080068': 'PresentationIntentType',
    '00080070': 'Manufacturer',
    '00080080': 'InstitutionName',
    '00081030': 'StudyDescription',
    '0008103E': 'SeriesDescription',
    '00081090': 'ManufacturerModelName',
    '00100010': 'PatientName', // scrambled text
    '00100020': 'PatientID', // scrambled text
    '00100030': 'PatientBirthDate', // scrambled date
    '00100040': 'PatientSex',
    '00101010': 'PatientAge',
    '00180015': 'BodyPartExamined',
    '00180050': 'SliceThickness',
    '00180060': 'KVP',
    '00181164': 'ImagerPixelSpacing',
    '00280030': 'PixelSpacing',
    '00280034': 'PixelAspectRatio',
    '00181405': 'DetectorElementSpacing',
    '00181411': 'ExposureIndex',
    '00181405': 'TargetExposureIndex',
    '00200011': 'SeriesNumber',
    '00200012': 'AcquisitionNumber',
    '00200013': 'InstanceNumber',
    '00200020': 'PatientOrientation',
    '00280002': 'SamplesPerPixel',
    '00280004': 'PhotometricInterpretation',
    '00280010': 'Rows',
    '00280011': 'Columns',
    '20500020': 'PresentationLUTShape',
    '00082218': 'AnatomicRegionSequence',
    '00281054': 'RescaleType',
    '00200062': 'ImageLaterality',
    '00280006': 'PlanarConfiguration',
    '00280101': 'BitsStored',
    '00280100': 'BitsAllocated',
    '00280102': 'HighBit',
    '00280103': 'PixelRepresentation',
    '00280106': 'SmallestImagePixelValue',
    '00280107': 'LargestImagePixelValue',
    '00281040': 'PixelIntensityRelationship',
    '00281041': 'PixelIntensityRelationshipSign',
    '00281050': 'WindowCenter',
    '00281051': 'WindowWidth',
    '00281052': 'RescaleIntercept',
    '00281053': 'RescaleSlope',
    '00181210': 'ConvolutionKernel',
    '00281056': 'VOILUTFunction',
    '00283010': 'VOILUTSequence',
    '00283002': 'LUTDescriptor',
    '00283003': 'LUTExplanation',
    '00283006': 'LUTData',
    '00180010': 'ContrastBolusAgent',
    '00200052': 'FrameOfReferenceUID',
    '00201040': 'PositionReferenceIndicator',
    '00180088': 'SpacingBetweenSlices',
    '00200032': 'ImagePositionPatient',
    '00200037': 'ImageOrientationPatient',
    '00201041': 'SliceLocation'
};

// Tags that need scrambling
const SCRAMBLE_UID_TAGS = ['00020003', '0020000D', '0020000E', '00080018'];
const SCRAMBLE_DATE_TAGS = ['00080020', '00080021', '00080022', '00080023', '00100030'];
const SCRAMBLE_TIME_TAGS = ['00080030', '00080031', '00080032', '00080033'];
const SCRAMBLE_TEXT_TAGS = ['00080050', '00100010', '00100020', '00080080'];

class DicomProcessor {
    constructor(passphrase, tagConfigurations = {}, verboseMode = false) {
        this.scrambler = new DicomScrambler(passphrase);
        this.auditTrail = [];
        this.errorLog = [];
        this.tagConfigurations = tagConfigurations;
        this.verboseMode = verboseMode;
        this.verboseLogs = [];
    }

    logError(filename, errorType, errorMessage, sopClassUID = null) {
        const logEntry = {
            filename: filename,
            errorType: errorType,
            errorMessage: errorMessage,
            sopClassUID: sopClassUID,
            timestamp: new Date().toISOString()
        };
        this.errorLog.push(logEntry);
    }

    logVerbose(filename, tag, tagName, originalValue, action, newValue) {
        if (this.verboseMode) {
            this.verboseLogs.push({
                filename: filename,
                tag: tag,
                tagName: tagName,
                originalValue: originalValue || '[EMPTY/MISSING]',
                action: action,
                newValue: newValue || '[DELETED/UNCHANGED]',
                timestamp: new Date().toISOString()
            });
        }
    }

    generateErrorLog() {
        if (this.errorLog.length === 0) {
            return '';
        }

        const headers = [
            'Filename',
            'Error Type',
            'Error Message', 
            'SOPClassUID',
            'Timestamp'
        ];

        let log = 'DICOM Processing Error Log\n';
        log += '=' .repeat(50) + '\n\n';
        log += headers.join('\t') + '\n';
        log += '-'.repeat(100) + '\n';

        for (const entry of this.errorLog) {
            const row = [
                entry.filename || 'N/A',
                entry.errorType || 'N/A',
                entry.errorMessage || 'N/A',
                entry.sopClassUID || 'N/A',
                entry.timestamp || 'N/A'
            ];
            log += row.join('\t') + '\n';
        }

        return log;
    }

    extractSOPClassUIDFallback(arrayBuffer, allowedSOPClassUIDs = []) {
        try {
            const bytes = new Uint8Array(arrayBuffer);

            function readAscii(start, length) {
                let s = '';
                const end = Math.min(start + length, bytes.length);
                for (let i = start; i < end; i++) {
                    const ch = bytes[i];
                    if (ch === 0) break; // stop at NUL
                    if (ch >= 32 && ch <= 126) {
                        s += String.fromCharCode(ch);
                    }
                }
                return s.trim();
            }

            function isUID(text) {
                return /^\d+(?:\.\d+)+$/.test(text);
            }

            function parseTagAt(i, littleEndian) {
                // Attempt explicit VR 'UI'
                const vr1 = bytes[i + 4];
                const vr2 = bytes[i + 5];
                if (vr1 === 0x55 && vr2 === 0x49) { // 'U''I'
                    let length;
                    if (littleEndian) {
                        length = bytes[i + 6] | (bytes[i + 7] << 8);
                    } else {
                        length = (bytes[i + 6] << 8) | bytes[i + 7];
                    }
                    if (length > 0 && length < 128 && i + 8 + length <= bytes.length) {
                        const s = readAscii(i + 8, length);
                        if (isUID(s)) return s;
                    }
                }
                // Implicit VR: 4-byte length
                let length;
                if (littleEndian) {
                    length = (bytes[i + 4]) | (bytes[i + 5] << 8) | (bytes[i + 6] << 16) | (bytes[i + 7] << 24);
                } else {
                    length = (bytes[i + 7]) | (bytes[i + 6] << 8) | (bytes[i + 5] << 16) | (bytes[i + 4] << 24);
                }
                if (length > 0 && length < 128 && i + 8 + length <= bytes.length) {
                    const s = readAscii(i + 8, length);
                    if (isUID(s)) return s;
                }
                return null;
            }

            // Scan for 0008,0016 in LE and BE
            for (let i = 0; i + 8 <= bytes.length; i++) {
                // Little Endian tag: 08 00 16 00
                if (bytes[i] === 0x08 && bytes[i + 1] === 0x00 && bytes[i + 2] === 0x16 && bytes[i + 3] === 0x00) {
                    const uid = parseTagAt(i, true);
                    if (uid) return uid;
                }
                // Big Endian tag: 00 08 00 16
                if (bytes[i] === 0x00 && bytes[i + 1] === 0x08 && bytes[i + 2] === 0x00 && bytes[i + 3] === 0x16) {
                    const uid = parseTagAt(i, false);
                    if (uid) return uid;
                }
            }

            // As a last resort, scan first 1MB for ASCII UIDs and prefer those in allowed set
            const MAX_SCAN = Math.min(bytes.length, 1024 * 1024);
            const head = bytes.subarray(0, MAX_SCAN);
            const decoder = new TextDecoder('latin1');
            const text = decoder.decode(head);
            const regex = /1\.2\.840\.10008(?:\.[0-9]+)+/g;
            const seen = new Set();
            let match;
            while ((match = regex.exec(text)) !== null) {
                const candidate = match[0];
                if (!seen.has(candidate)) {
                    seen.add(candidate);
                    if (allowedSOPClassUIDs.includes(candidate)) {
                        return candidate;
                    }
                }
            }
            // If none matched allowed, return the first seen candidate
            if (seen.size > 0) {
                for (const c of seen) return c;
            }
        } catch (e) {
            // ignore fallback errors
        }
        return null;
    }

    async checkSOPClassUID(arrayBuffer, filename, allowedSOPClassUIDs) {
        try {
            // Parse DICOM file to check SOPClassUID
            const dataSet = dcmjs.data.DicomMessage.readFile(arrayBuffer);
            const dict = dataSet.dict;
            
            // Get SOPClassUID from the file (tag 00080016)
            const sopClassUID = this.getTagValue(dict, '00080016');
            // Check SOPClassUID
            
            if (!sopClassUID) {
                // No SOPClassUID found
                this.logError(filename, 'MISSING_SOPCLASSUID', 'File does not contain SOPClassUID tag (00080016)');
                return false;
            }
            
            // Check if this SOPClassUID is in the allowed list
            const isAllowed = allowedSOPClassUIDs.includes(sopClassUID);
            if (!isAllowed) {
                this.logError(filename, 'SOPCLASSUID_FILTERED', `SOPClassUID ${sopClassUID} not in allowed list`, sopClassUID);
            }
            // SOPClassUID check complete
            return isAllowed;
            
        } catch (error) {
            console.error(`Error checking SOPClassUID for ${filename}:`, error);
            // Fallback: heuristic extraction
            const fallbackUID = this.extractSOPClassUIDFallback(arrayBuffer, allowedSOPClassUIDs);
            if (fallbackUID) {
                const isAllowed = allowedSOPClassUIDs.includes(fallbackUID);
                if (!isAllowed) {
                    this.logError(filename, 'SOPCLASSUID_FILTERED', `SOPClassUID ${fallbackUID} not in allowed list (heuristic)`, fallbackUID);
                } else {
                    this.logVerbose(filename, '00080016', 'SOPClassUID', '[PARSE FAILED]', 'HEURISTIC_PARSE', fallbackUID);
                }
                return isAllowed;
            }
            this.logError(filename, 'SOPCLASSUID_PARSE_ERROR', error.message);
            return false;
        }
    }

    async processDicomFile(arrayBuffer, filename) {
        // Processing DICOM file
        try {
            // Parse DICOM file
            // Parsing DICOM data
            const dataSet = dcmjs.data.DicomMessage.readFile(arrayBuffer);
            const dict = dataSet.dict;
            // DICOM data parsed
            
            // Extract original values for audit trail
            // Extracting original values
            const originalStudyUID = this.getTagValue(dict, '0020000D');
            const originalAccession = this.getTagValue(dict, '00080050');
            const originalPatientID = this.getTagValue(dict, '00100020');
            // Original values extracted
            
            // Process tags in place - scramble and filter
            // Starting tag filtering
            const keysToDelete = [];
            
            // First pass: identify tags to delete (not in whitelist)
            for (const tag of Object.keys(dict)) {
                if (!WHITELISTED_TAGS[tag] && tag !== '7FE00010') { // Always preserve pixel data
                    keysToDelete.push(tag);
                }
            }
            
            // Delete non-whitelisted tags
            // Deleting non-whitelisted tags
            for (const tag of keysToDelete) {
                const originalValue = this.getTagValue(dict, tag);
                this.logVerbose(filename, tag, 'Unknown Tag', originalValue, 'DELETE', '');
                delete dict[tag];
            }
            // Non-whitelisted tags deleted
            
            // Second pass: scramble whitelisted tags that need scrambling and validate all field lengths
            // Starting scrambling pass
            let scrambledSOPInstanceUID = null;
            
            // First, scramble SOPInstanceUID if present
            if (dict['00080018'] && dict['00080018'].Value && dict['00080018'].Value.length > 0) {
                scrambledSOPInstanceUID = await this.scrambler.scrambleUID(dict['00080018'].Value[0]);
                dict['00080018'].Value = [scrambledSOPInstanceUID];
            }
            
            for (const [tag, name] of Object.entries(WHITELISTED_TAGS)) {
                if (dict[tag] && dict[tag].Value && dict[tag].Value.length > 0) {
                    const originalValue = dict[tag].Value[0];
                    let value = dict[tag].Value;
                    const vr = dict[tag].vr;
                    let action = 'UNCHANGED';
                    
                    // Apply scrambling if needed
                    const isNumericVR = ['DS', 'IS', 'FL', 'FD', 'SL', 'SS', 'UL', 'US'].includes(vr);
                    
                    if (!isNumericVR) {
                        if (tag === '00020003' && scrambledSOPInstanceUID) {
                            // MediaStorageSOPInstanceUID should match SOPInstanceUID
                            value = [scrambledSOPInstanceUID];
                            action = 'SCRAMBLE_UID';
                        } else if (tag === '00080018') {
                            // Already handled above
                            action = 'SCRAMBLE_UID';
                            this.logVerbose(filename, tag, name, originalValue, action, scrambledSOPInstanceUID);
                            continue;
                        } else if (SCRAMBLE_UID_TAGS.includes(tag)) {
                            value = [await this.scrambler.scrambleUID(value[0])];
                            action = 'SCRAMBLE_UID';
                        } else if (SCRAMBLE_DATE_TAGS.includes(tag)) {
                            value = [await this.scrambler.scrambleDate(value[0], originalPatientID || null)];
                            action = 'SCRAMBLE_DATE';
                        } else if (SCRAMBLE_TIME_TAGS.includes(tag)) {
                            value = [await this.scrambler.scrambleTime(value[0])];
                            action = 'SCRAMBLE_TIME';
                        } else if (SCRAMBLE_TEXT_TAGS.includes(tag)) {
                            let maxLength = this.getVRMaxLength(vr);
                            value = [await this.scrambler.scrambleText(value[0], maxLength)];
                            action = 'SCRAMBLE_TEXT';
                        }
                    }
                    
                    // Validate and truncate ALL values based on VR constraints
                    value = this.validateValueLength(value, vr);
                    dict[tag].Value = value;
                    
                    // Log the processing action
                    this.logVerbose(filename, tag, name, originalValue, action, value[0]);
                }
            }
            
            // Handle missing tags based on configuration
            if (this.tagConfigurations) {
                for (const [tag, config] of Object.entries(this.tagConfigurations)) {
                    // Check if tag is missing OR has empty/null value and has a "replace" action for "if not present"
                    const tagValue = this.getTagValue(dict, tag);
                    const isEffectivelyMissing = !dict[tag] || !tagValue || tagValue.toString().trim() === '';
                    
                    if (isEffectivelyMissing && config.ifNotPresent === 'replace' && config.notPresentValue) {
                        // Get the VR for this tag from the whitelist definition
                        const vr = this.getVRForTag(tag);
                        if (vr) {
                            // Create or update the tag with the replacement value
                            dict[tag] = {
                                vr: vr,
                                Value: [config.notPresentValue]
                            };
                            // Log the addition of missing tag
                            this.logVerbose(filename, tag, config.description, tagValue || '[MISSING]', 'ADD_MISSING', config.notPresentValue);
                        }
                    }
                }
            }
            
            // Third pass: validate all remaining tags for length constraints
            // Starting final validation pass
            for (const tag of Object.keys(dict)) {
                if (dict[tag] && dict[tag].Value && dict[tag].Value.length > 0) {
                    const vr = dict[tag].vr;
                    const value = this.validateValueLength(dict[tag].Value, vr);
                    dict[tag].Value = value;
                }
            }
            
            // Create audit trail entry
            // Creating audit trail entry
            const scrambledStudyUID = this.getTagValue(dict, '0020000D');
            const scrambledAccession = this.getTagValue(dict, '00080050');
            const scrambledPatientID = this.getTagValue(dict, '00100020');
            
            this.auditTrail.push({
                filename,
                originalStudyUID: originalStudyUID || '',
                scrambledStudyUID: scrambledStudyUID || '',
                originalAccession: originalAccession || '',
                scrambledAccession: scrambledAccession || '',
                originalPatientID: originalPatientID || '',
                scrambledPatientID: scrambledPatientID || ''
            });
            
            // Write the modified dataset back to buffer
            // Writing DICOM output
            // Use the original dataSet but with modified dict
            dataSet.dict = dict;
            let outputBuffer;
            
            try {
                outputBuffer = dataSet.write();
                // DICOM output written successfully
                // Ensure we have a proper ArrayBuffer
                if (outputBuffer && outputBuffer.byteLength) {
                    return {
                        success: true,
                        data: outputBuffer,
                        filename: filename
                    };
                } else {
                    throw new Error('Write operation produced empty buffer');
                }
            } catch (writeError) {
                console.error('Write error:', writeError);
                this.logError(filename, 'WRITE_ERROR', 'Failed to write DICOM file: ' + writeError.message);
                return {
                    success: false,
                    error: 'Failed to write DICOM file: ' + writeError.message,
                    filename: filename
                };
            }
            
        } catch (error) {
            console.error(`Error in processDicomFile for ${filename}:`, error);
            this.logError(filename, 'PROCESSING_ERROR', error.message);
            return {
                success: false,
                error: error.message,
                filename: filename
            };
        }
    }
    
    getTagValue(dict, tag) {
        if (dict[tag] && dict[tag].Value && dict[tag].Value.length > 0) {
            return dict[tag].Value[0];
        }
        return null;
    }

    getVRForTag(tag) {
        // Map DICOM tags to their standard VR (Value Representation)
        const tagVRMap = {
            '00020003': 'UI', // Media Storage SOP Instance UID
            '0020000D': 'UI', // Study Instance UID
            '0020000E': 'UI', // Series Instance UID
            '00080018': 'UI', // SOP Instance UID
            '00080050': 'SH', // Accession Number
            '00100010': 'PN', // Patient Name
            '00100020': 'LO', // Patient ID
            '00100030': 'DA', // Patient Birth Date
            '00100040': 'CS', // Patient Sex
            '00101010': 'AS', // Patient Age
            '00080020': 'DA', // Study Date
            '00080030': 'TM', // Study Time
            '00080060': 'CS', // Modality
            '00080070': 'LO', // Manufacturer
            '00081030': 'LO', // Study Description
            '0008103E': 'LO', // Series Description
            '00200011': 'IS', // Series Number
            '00200013': 'IS', // Instance Number
            '00280010': 'US', // Rows
            '00280011': 'US', // Columns
            '00280100': 'US', // Bits Allocated
            '00280101': 'US', // Bits Stored
            '00280102': 'US', // High Bit
            '00280103': 'US'  // Pixel Representation
        };
        
        return tagVRMap[tag] || 'LO'; // Default to LO (Long String) if not found
    }
    
    getVRMaxLength(vr) {
        const vrLimits = {
            'AE': 16, 'AS': 4, 'AT': 4, 'CS': 16, 'DA': 8, 'DS': 16, 'DT': 26,
            'FL': 4, 'FD': 8, 'IS': 12, 'LO': 64, 'LT': 10240, 'OB': -1,
            'OD': -1, 'OF': -1, 'OL': -1, 'OW': -1, 'PN': 64, 'SH': 16,
            'SL': 4, 'SQ': -1, 'SS': 2, 'ST': 1024, 'TM': 16, 'UC': -1,
            'UI': 64, 'UL': 4, 'UN': -1, 'UR': -1, 'US': 2, 'UT': -1
        };
        return vrLimits[vr] || 64;
    }
    
    validateValueLength(valueArray, vr) {
        if (!valueArray || !vr) return valueArray;
        
        return valueArray.map(value => {
            // Handle different VR types properly
            switch (vr) {
                case 'US': // Unsigned Short (0-65535)
                    if (typeof value === 'number') {
                        return Math.min(Math.max(Math.floor(value), 0), 65535);
                    } else if (typeof value === 'string') {
                        const num = parseInt(value);
                        return isNaN(num) ? 0 : Math.min(Math.max(num, 0), 65535);
                    }
                    return value;
                    
                case 'SS': // Signed Short (-32768 to 32767)
                    if (typeof value === 'number') {
                        return Math.min(Math.max(Math.floor(value), -32768), 32767);
                    } else if (typeof value === 'string') {
                        const num = parseInt(value);
                        return isNaN(num) ? 0 : Math.min(Math.max(num, -32768), 32767);
                    }
                    return value;
                    
                case 'UL': // Unsigned Long (0-4294967295)
                    if (typeof value === 'number') {
                        return Math.min(Math.max(Math.floor(value), 0), 4294967295);
                    } else if (typeof value === 'string') {
                        const num = parseInt(value);
                        return isNaN(num) ? 0 : Math.min(Math.max(num, 0), 4294967295);
                    }
                    return value;
                    
                case 'SL': // Signed Long (-2147483648 to 2147483647)
                    if (typeof value === 'number') {
                        return Math.min(Math.max(Math.floor(value), -2147483648), 2147483647);
                    } else if (typeof value === 'string') {
                        const num = parseInt(value);
                        return isNaN(num) ? 0 : Math.min(Math.max(num, -2147483648), 2147483647);
                    }
                    return value;
                    
                case 'FL': // Float (32-bit)
                case 'FD': // Double (64-bit)
                    if (typeof value === 'string') {
                        const num = parseFloat(value);
                        return isNaN(num) ? 0.0 : num;
                    }
                    return value;
                    
                case 'DS': // Decimal String - max 16 characters
                    if (typeof value === 'number') {
                        let strValue = value.toString();
                        // Handle scientific notation
                        if (strValue.includes('e')) {
                            const num = parseFloat(strValue);
                            strValue = num.toFixed(6).replace(/\.?0+$/, ''); // Remove trailing zeros
                        }
                        return strValue.length > 16 ? strValue.substr(0, 16) : strValue;
                    } else if (typeof value === 'string') {
                        return value.length > 16 ? value.substr(0, 16) : value;
                    }
                    return value;
                    
                case 'IS': // Integer String - max 12 characters
                    if (typeof value === 'number') {
                        const strValue = Math.floor(value).toString();
                        return strValue.length > 12 ? strValue.substr(0, 12) : strValue;
                    } else if (typeof value === 'string') {
                        return value.length > 12 ? value.substr(0, 12) : value;
                    }
                    return value;
                    
                // String VRs - apply character length limits
                case 'AE': case 'AS': case 'CS': case 'DA': case 'DT': case 'LO': 
                case 'LT': case 'PN': case 'SH': case 'ST': case 'TM': case 'UI':
                    if (typeof value === 'string') {
                        const maxLength = this.getVRMaxLength(vr);
                        return maxLength > 0 && value.length > maxLength ? value.substr(0, maxLength) : value;
                    }
                    return value;
                    
                default:
                    return value;
            }
        });
    }
    
    generateCSV() {
        const headers = [
            'Original Study Instance UID',
            'Scrambled Study Instance UID', 
            'Original Accession',
            'Scrambled Accession',
            'Original Patient ID',
            'Scrambled Patient ID'
        ];
        
        let csv = headers.join(',') + '\n';
        
        for (const entry of this.auditTrail) {
            const row = [
                this.escapeCSV(entry.originalStudyUID),
                this.escapeCSV(entry.scrambledStudyUID),
                this.escapeCSV(entry.originalAccession),
                this.escapeCSV(entry.scrambledAccession),
                this.escapeCSV(entry.originalPatientID),
                this.escapeCSV(entry.scrambledPatientID)
            ];
            csv += row.join(',') + '\n';
        }
        
        return csv;
    }
    
    escapeCSV(value) {
        if (!value) return '';
        value = value.toString();
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return '"' + value.replace(/"/g, '""') + '"';
        }
        return value;
    }
}

// Worker message handler
self.onmessage = async function(e) {
    console.log('Worker received message:', e.data.type);
    const { type } = e.data;
    
    if (type === 'PROCESS_FILES' || type === 'PROCESS_CHUNK') {
        let files, passphrase, workerId, allowedSOPClassUIDs, tagConfigurations, verboseMode;
        
        if (type === 'PROCESS_FILES') {
            ({ files, passphrase, workerId, allowedSOPClassUIDs, tagConfigurations, verboseMode } = e.data.data);
        } else {
            ({ files, passphrase, workerId, allowedSOPClassUIDs, tagConfigurations, verboseMode } = e.data);
        }
        
        // Worker starting file processing
        // SOPClassUIDs configured
        const processor = new DicomProcessor(passphrase, tagConfigurations, verboseMode);
        const results = [];
        let skippedFiles = 0;
        
        // Process each file
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            // Processing file
            
            // Send progress update
            self.postMessage({
                type: 'PROGRESS',
                workerId: workerId,
                current: i,
                total: files.length,
                filename: file.filename
            });
            
            try {
                // First, check if this file's SOPClassUID is allowed
                // Checking SOPClassUID
                const isAllowed = await processor.checkSOPClassUID(file.data, file.filename, allowedSOPClassUIDs);
                
                if (!isAllowed) {
                    // File skipped due to SOPClassUID filter
                    skippedFiles++;
                    continue;
                }
                
                // Process DICOM file
                // Processing DICOM file
                const result = await processor.processDicomFile(file.data, file.filename);
                // File processing complete
                results.push(result);
            } catch (error) {
                console.error(`Worker ${workerId} error processing ${file.filename}:`, error);
                processor.logError(file.filename, 'WORKER_ERROR', error.message);
                results.push({
                    filename: file.filename,
                    success: false,
                    error: error.message,
                    data: null
                });
            }
        }
        
        // Worker finished processing all files
        
        // Send completion with results and audit trail
        console.log(`Worker ${workerId}: Generated ${processor.verboseLogs.length} verbose logs, verboseMode was:`, verboseMode);
        self.postMessage({
            type: 'COMPLETE',
            workerId: workerId,
            results: results,
            auditTrail: processor.auditTrail,
            csv: processor.generateCSV(),
            errorLog: processor.generateErrorLog(),
            verboseLogs: processor.verboseLogs,
            skippedFiles: skippedFiles
        });
    } else {
        console.log('Worker received unknown message type:', type);
    }
};
