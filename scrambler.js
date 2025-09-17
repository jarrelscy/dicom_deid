/**
 * DICOM De-identification Scrambling Functions
 * Implements SHA256-based deterministic scrambling for various DICOM data types
 */

class DicomScrambler {
    constructor(passphrase) {
        this.passphrase = passphrase;
        this.encoder = new TextEncoder();
    }

    /**
     * Generate SHA256 hash of input concatenated with passphrase
     */
    async generateHash(input) {
        const data = this.encoder.encode(input + this.passphrase);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return new Uint8Array(hashBuffer);
    }

    /**
     * Convert hash bytes to hexadecimal string
     */
    hashToHex(hashArray) {
        return Array.from(hashArray)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Convert hash bytes to numeric value
     */
    hashToNumeric(hashArray) {
        let result = 0;
        for (let i = 0; i < Math.min(8, hashArray.length); i++) {
            result = result * 256 + hashArray[i];
        }
        return result;
    }

    /**
     * Generate DICOM compliant UID from input
     */
    async scrambleUID(input) {
        if (!input) return input;
        
        const hash = await this.generateHash(input);
        const hex = this.hashToHex(hash);
        
        // Create DICOM compliant UID starting with 1.2.826.0.1.3680043.8.498.
        // followed by hash-derived numbers, ensuring total length <= 64 chars
        const prefix = '1.2.826.0.1.3680043.8.498.';
        const maxTotalLength = 64;
        const availableLength = maxTotalLength - prefix.length;
        
        // Convert hex to one large decimal number, then split smartly
        const hexSegment = hex.substr(0, 16); // Use first 16 hex chars (64 bits)
        const decimal = parseInt(hexSegment, 16);
        let uidSuffix = decimal.toString();
        
        // If still too long, truncate the suffix
        if (uidSuffix.length > availableLength) {
            uidSuffix = uidSuffix.substr(0, availableLength);
        }
        
        const result = prefix + uidSuffix;
        
        // Double check length constraint
        if (result.length > maxTotalLength) {
            return prefix + uidSuffix.substr(0, availableLength);
        }
        
        return result;
    }

    /**
     * Generate scrambled text (respecting original length constraints)
     */
    async scrambleText(input, maxLength = 32) {
        if (!input) return input;

        const hash = await this.generateHash(input);
        const hex = this.hashToHex(hash);
        
        // Create alphanumeric string from hash
        let result = '';
        for (let i = 0; i < hex.length && result.length < maxLength; i += 2) {
            const byte = parseInt(hex.substr(i, 2), 16);
            // Map to alphanumeric character (A-Z, 0-9)
            const char = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[byte % 36];
            result += char;
        }
        
        // Respect both max length constraint and original input length
        const finalLength = Math.min(maxLength, Math.max(8, input.length)); // At least 8 chars
        return result.substr(0, finalLength);
    }

    /**
     * Generate deterministic text value derived from Study Instance UID
     */
    async scrambleFromStudyUID(studyUID, maxLength = 16) {
        if (!studyUID) return '';

        const hash = await this.generateHash(`studyuid:${studyUID}`);
        const hex = this.hashToHex(hash);

        let result = '';
        for (let i = 0; i < hex.length && result.length < maxLength; i += 2) {
            const byte = parseInt(hex.substr(i, 2), 16);
            const char = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[byte % 36];
            result += char;
        }

        return result.substr(0, maxLength);
    }

    /**
     * Scramble DICOM date (YYYYMMDD format)
     */
    async scrambleDate(input, key = null) {
        if (!input || input.length !== 8) return input;
        
        const hash = await this.generateHash(((key || 'global') + 'date_offset'));
        const numeric = this.hashToNumeric(hash);
        
        const offsetDays = numeric % (365 * 20);
        
        const year = parseInt(input.substr(0, 4));
        const month = parseInt(input.substr(4, 2));
        const day = parseInt(input.substr(6, 2));
        
        const originalDate = new Date(year, month - 1, day);
        
        const scrambledDate = new Date(originalDate);
        scrambledDate.setDate(scrambledDate.getDate() + offsetDays);
        
        const scrambledYear = scrambledDate.getFullYear().toString().padStart(4, '0');
        const scrambledMonth = (scrambledDate.getMonth() + 1).toString().padStart(2, '0');
        const scrambledDay = scrambledDate.getDate().toString().padStart(2, '0');
        
        const result = scrambledYear + scrambledMonth + scrambledDay;
        return result.substr(0, 8);
    }

    /**
     * Scramble DICOM time (HHMMSS format)
     */
    async scrambleTime(input) {
        if (!input || input.length < 6) return input;
        
        const hash = await this.generateHash(input);
        const numeric = this.hashToNumeric(hash);
        
        // Apply mod 3600 for offset in seconds
        const offsetSeconds = numeric % 3600;
        
        // Parse original time (handle HHMMSS or HHMMSS.fff format)
        const timeOnly = input.split('.')[0]; // Remove milliseconds if present
        const hours = parseInt(timeOnly.substr(0, 2));
        const minutes = parseInt(timeOnly.substr(2, 2));
        const seconds = parseInt(timeOnly.substr(4, 2));
        
        // Convert to total seconds
        let totalSeconds = hours * 3600 + minutes * 60 + seconds;
        
        // Apply offset
        totalSeconds += offsetSeconds;
        
        // Wrap around if exceeds 235959 (86399 seconds)
        totalSeconds = totalSeconds % 86400;
        
        // Convert back to HHMMSS
        const newHours = Math.floor(totalSeconds / 3600);
        const newMinutes = Math.floor((totalSeconds % 3600) / 60);
        const newSecondsVal = totalSeconds % 60;
        
        const scrambledTime = newHours.toString().padStart(2, '0') +
                             newMinutes.toString().padStart(2, '0') +
                             newSecondsVal.toString().padStart(2, '0');
        
        // Add back milliseconds if they were in the original, but limit total length
        if (input.includes('.')) {
            const milliseconds = input.split('.')[1];
            const result = scrambledTime + '.' + milliseconds;
            // Ensure we don't exceed typical DICOM time field limits
            return result.substr(0, Math.min(16, input.length));
        }
        
        return scrambledTime.substr(0, Math.min(6, input.length));
    }
}

// Export for use in Web Worker
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DicomScrambler;
}
