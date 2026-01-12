/**
 * Main application logic for DICOM De-identification Tool
 */

class DicomDeidentifier {
    constructor() {
        this.uploadedFile = null;
        this.passphrase = '';
        this.workers = [];
        this.workerCount = navigator.hardwareConcurrency || 4;
        this.processedFiles = 0;
        this.totalFiles = 0;
        this.results = [];
        this.auditTrails = [];
        this.errorLogs = [];
        this.verboseLogs = [];
        this.completedWorkers = 0;
        
        // File System Access API variables
        this.processingMode = 'zip'; // 'zip' or 'folder'
        this.inputDirectoryHandle = null;
        this.outputDirectoryHandle = null;
        this.fileSystemSupported = 'showDirectoryPicker' in window;
        
        // Configuration variables
        this.currentPage = 'main';
        this.tagConfigurations = this.getDefaultTagConfigurations();
        
        this.initializeUI();
    }
    
    initializeUI() {
        // Get DOM elements
        this.passphraseInput = document.getElementById('passphrase');
        this.verboseModeInput = document.getElementById('verboseMode');
        this.verboseMode = false;
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.processBtn = document.getElementById('processBtn');
        this.progressSection = document.getElementById('progressSection');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.progressPercent = document.getElementById('progressPercent');
        this.workerStatus = document.getElementById('workerStatus');
        this.resultsSection = document.getElementById('resultsSection');
        this.resultsText = document.getElementById('resultsText');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.errorSection = document.getElementById('errorSection');
        this.errorText = document.getElementById('errorText');
        this.resetBtn = document.getElementById('resetBtn');
        
        // Folder mode elements
        this.zipModeBtn = document.getElementById('zipModeBtn');
        this.folderModeBtn = document.getElementById('folderModeBtn');
        this.zipMode = document.getElementById('zipMode');
        this.folderMode = document.getElementById('folderMode');
        this.selectInputBtn = document.getElementById('selectInputBtn');
        this.selectOutputBtn = document.getElementById('selectOutputBtn');
        this.inputFolderPath = document.getElementById('inputFolderPath');
        this.outputFolderPath = document.getElementById('outputFolderPath');
        
        // Navigation elements
        this.mainPageBtn = document.getElementById('mainPageBtn');
        this.configPageBtn = document.getElementById('configPageBtn');
        this.mainPage = document.getElementById('mainPage');
        this.configPage = document.getElementById('configPage');
        
        // Configuration elements
        this.saveConfigBtn = document.getElementById('saveConfigBtn');
        this.loadConfigBtn = document.getElementById('loadConfigBtn');
        this.resetConfigBtn = document.getElementById('resetConfigBtn');
        this.tagConfigList = document.getElementById('tagConfigList');
        
        // Bind event listeners
        this.bindEvents();
        
        // Initialize configuration page
        this.initializeConfigurationPage();
        
        // Update process button state
        this.updateProcessButton();
    }
    
    bindEvents() {
        // Passphrase input
        this.passphraseInput.addEventListener('input', () => {
            this.passphrase = this.passphraseInput.value;
            this.updateProcessButton();
        });

        // Verbose mode checkbox
        this.verboseModeInput.addEventListener('change', () => {
            this.verboseMode = this.verboseModeInput.checked;
        });
        
        // File upload events
        this.uploadArea.addEventListener('click', () => {
            this.fileInput.click();
        });
        
        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileUpload(e.target.files[0]);
            }
        });
        
        // Drag and drop events
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('dragover');
        });
        
        this.uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
        });
        
        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
            
            if (e.dataTransfer.files.length > 0) {
                this.handleFileUpload(e.dataTransfer.files[0]);
            }
        });
        
        // Process button
        this.processBtn.addEventListener('click', () => {
            this.processFiles();
        });
        
        // Download button
        this.downloadBtn.addEventListener('click', () => {
            this.downloadResults();
        });
        
        // Reset button
        this.resetBtn.addEventListener('click', () => {
            this.reset();
        });
        
        // Mode buttons
        if (this.zipModeBtn) {
            this.zipModeBtn.addEventListener('click', () => {
                this.switchToMode('zip');
            });
        }
        
        if (this.folderModeBtn) {
            this.folderModeBtn.addEventListener('click', () => {
                this.switchToMode('folder');
            });
        }
        
        // Folder selection buttons
        if (this.selectInputBtn) {
            console.log('Adding event listener to selectInputBtn');
            this.selectInputBtn.addEventListener('click', () => {
                console.log('Select input button clicked');
                this.selectInputDirectory();
            });
        } else {
            console.log('selectInputBtn not found');
        }
        
        if (this.selectOutputBtn) {
            this.selectOutputBtn.addEventListener('click', () => {
                this.selectOutputDirectory();
            });
        }
        
        // Check file system support
        if (!this.fileSystemSupported && this.folderModeBtn) {
            this.folderModeBtn.disabled = true;
            this.folderModeBtn.title = 'File System Access API not supported in this browser';
        }
        
        // Navigation events
        this.mainPageBtn.addEventListener('click', () => {
            this.showMainPage();
        });
        
        this.configPageBtn.addEventListener('click', () => {
            this.showConfigPage();
        });
        
        // Configuration events
        this.saveConfigBtn.addEventListener('click', () => {
            this.saveConfiguration();
        });
        
        this.loadConfigBtn.addEventListener('click', () => {
            this.loadConfiguration();
        });
        
        this.resetConfigBtn.addEventListener('click', () => {
            this.resetConfiguration();
        });
    }
    
    handleFileUpload(file) {
        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.zip') && !fileName.endsWith('.dcm')) {
            this.showError('Please select a ZIP file or DICOM (.dcm) file.');
            return;
        }
        
        this.uploadedFile = file;
        this.uploadArea.innerHTML = `
            <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
            </svg>
            <p><strong>Selected:</strong> ${file.name}</p>
            <small>File size: ${this.formatFileSize(file.size)}</small>
        `;
        this.updateProcessButton();
    }
    
    updateProcessButton() {
        let canProcess = false;
        
        if (this.processingMode === 'zip') {
            canProcess = this.uploadedFile && this.passphrase.length > 0;
        } else if (this.processingMode === 'folder') {
            canProcess = this.inputDirectoryHandle && this.outputDirectoryHandle && this.passphrase.length > 0;
        }
        
        this.processBtn.disabled = !canProcess;
    }
    
    switchToMode(mode) {
        this.processingMode = mode;
        
        if (mode === 'zip') {
            if (this.zipModeBtn) this.zipModeBtn.classList.add('active');
            if (this.folderModeBtn) this.folderModeBtn.classList.remove('active');
            if (this.zipMode) this.zipMode.style.display = 'block';
            if (this.folderMode) this.folderMode.style.display = 'none';
        } else {
            if (this.zipModeBtn) this.zipModeBtn.classList.remove('active');
            if (this.folderModeBtn) this.folderModeBtn.classList.add('active');
            if (this.zipMode) this.zipMode.style.display = 'none';
            if (this.folderMode) this.folderMode.style.display = 'block';
        }
        
        this.updateProcessButton();
    }
    
    async selectInputDirectory() {
        console.log('selectInputDirectory called');
        console.log('fileSystemSupported:', this.fileSystemSupported);
        console.log('showDirectoryPicker available:', 'showDirectoryPicker' in window);
        
        if (!this.fileSystemSupported) {
            this.showError('File System Access API not supported in this browser. Please use Chrome, Edge, or Opera.');
            return;
        }
        
        try {
            console.log('Calling window.showDirectoryPicker...');
            this.inputDirectoryHandle = await window.showDirectoryPicker({
                mode: 'read'
            });
            console.log('Directory selected:', this.inputDirectoryHandle.name);
            
            if (this.inputFolderPath) {
                this.inputFolderPath.textContent = this.inputDirectoryHandle.name;
                this.inputFolderPath.parentElement.parentElement.classList.add('selected');
            }
            this.updateProcessButton();
        } catch (error) {
            console.error('Directory selection error:', error);
            if (error.name === 'AbortError') {
                console.log('User cancelled directory selection');
                return;
            }
            
            let errorMessage = 'Error selecting input directory: ';
            if (error.message) {
                errorMessage += error.message;
            } else if (error.name) {
                errorMessage += error.name;
            } else {
                errorMessage += 'File System Access API may be blocked by browser security policies. Try opening this page in a new tab or use Chrome/Edge in a non-embedded context.';
            }
            
            this.showError(errorMessage);
        }
    }
    
    async selectOutputDirectory() {
        if (!this.fileSystemSupported) {
            this.showError('File System Access API not supported in this browser. Please use Chrome, Edge, or Opera.');
            return;
        }
        
        try {
            this.outputDirectoryHandle = await window.showDirectoryPicker({
                mode: 'readwrite'
            });
            this.outputFolderPath.textContent = this.outputDirectoryHandle.name;
            this.outputFolderPath.parentElement.parentElement.classList.add('selected');
            this.updateProcessButton();
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.showError('Error selecting output directory: ' + error.message);
            }
        }
    }
    
    getSelectedSOPClassUIDs() {
        const sopClassUIDs = [];
        const checkboxes = document.querySelectorAll('.sopclass-checkboxes input[type="checkbox"]:checked');
        checkboxes.forEach(checkbox => {
            // Extract UID from checkbox ID (e.g., "sopclass_1_2_840_10008_5_1_4_1_1_1" -> "1.2.840.10008.5.1.4.1.1.1")
            const uid = checkbox.id.replace('sopclass_', '').replace(/_/g, '.');
            sopClassUIDs.push(uid);
        });
        console.log('Selected SOPClassUIDs:', sopClassUIDs);
        return sopClassUIDs;
    }

    async processFiles() {
        try {
            this.showProgress();
            
            // Get selected SOPClassUIDs
            const allowedSOPClassUIDs = this.getSelectedSOPClassUIDs();
            if (allowedSOPClassUIDs.length === 0) {
                this.showError('Please select at least one DICOM type to include in the processing.');
                return;
            }
            
            let dicomFiles;
            if (this.processingMode === 'zip') {
                // Extract DICOM files from ZIP
                dicomFiles = await this.extractDicomFiles();
            } else {
                // Extract DICOM files from directory
                dicomFiles = await this.extractDicomFilesFromDirectory();
            }
            
            if (dicomFiles.length === 0) {
                const errorMsg = this.processingMode === 'zip' 
                    ? 'No DICOM files found in the uploaded ZIP archive. Files must contain the DICM magic bytes at position 128-131.'
                    : 'No DICOM files found in the selected directory. Files must contain the DICM magic bytes at position 128-131.';
                this.showError(errorMsg);
                return;
            }
            
            this.updateProgress(`Found ${dicomFiles.length} DICOM files. Processing...`, 15);
            
            this.totalFiles = dicomFiles.length;
            this.processedFiles = 0;
            this.results = [];
            this.auditTrails = [];
            this.errorLogs = [];
            this.completedWorkers = 0;
            this.skippedFiles = 0;
            this.allowedSOPClassUIDs = allowedSOPClassUIDs;
            
            // Initialize workers (only create as many as we have files)
            await this.initializeWorkers(dicomFiles.length);
            
            // Distribute files among workers
            const fileChunks = this.distributeFiles(dicomFiles);
            
            // Start processing
            console.log(`Starting processing with ${this.processingMode} mode. Total files: ${dicomFiles.length}`);
            if (this.processingMode === 'zip') {
                this.processWithWorkers(fileChunks);
            } else {
                console.log('Calling processWithWorkersStreaming...');
                await this.processWithWorkersStreaming(fileChunks);
                console.log('processWithWorkersStreaming completed.');
            }
            
        } catch (error) {
            this.showError('Error processing files: ' + error.message);
        }
    }
    
    async extractDicomFiles() {
        // Check if the uploaded file is a single DICOM file
        const fileName = this.uploadedFile.name.toLowerCase();
        if (fileName.endsWith('.dcm')) {
            // Handle single DICOM file
            const data = await this.uploadedFile.arrayBuffer();
            
            // Verify it's actually a DICOM file
            if (this.isDicomFile(data)) {
                return [{
                    filename: this.uploadedFile.name,
                    data: data,
                    path: this.uploadedFile.name
                }];
            } else {
                throw new Error('Selected .dcm file is not a valid DICOM file.');
            }
        }
        
        // Handle ZIP file
        const zip = new JSZip();
        const zipData = await zip.loadAsync(this.uploadedFile);
        const dicomFiles = [];
        
        for (const [filename, zipEntry] of Object.entries(zipData.files)) {
            if (!zipEntry.dir) {
                const data = await zipEntry.async('arraybuffer');
                
                // Check for DICM magic bytes at position 128-131 (0x80-0x83)
                if (this.isDicomFile(data)) {
                    dicomFiles.push({
                        filename: filename,
                        data: data,
                        path: filename
                    });
                }
            }
        }
        
        return dicomFiles;
    }
    
    isDicomFile(arrayBuffer) {
        // DICOM files have "DICM" at bytes 128-131 (positions 128-131, zero-indexed)
        if (arrayBuffer.byteLength < 132) {
            return false;
        }
        
        const view = new Uint8Array(arrayBuffer);
        const dicmBytes = [0x44, 0x49, 0x43, 0x4D]; // "DICM" in ASCII
        
        // Check bytes at positions 128, 129, 130, 131
        for (let i = 0; i < 4; i++) {
            if (view[128 + i] !== dicmBytes[i]) {
                return false;
            }
        }
        
        return true;
    }
    
    async extractDicomFilesFromDirectory() {
        const dicomFiles = [];
        const self = this;
        let filesChecked = 0;
        let dicomFilesFound = 0;
        
        console.log('Starting folder enumeration...');
        this.updateProgress('Listing Files ... (0 DICOM files found)', 5);
        
        async function processDirectory(directoryHandle, relativePath = '') {
            console.log(`Processing directory: ${relativePath || 'root'}`);
            
            for await (const [name, handle] of directoryHandle.entries()) {
                const currentPath = relativePath ? `${relativePath}/${name}` : name;
                
                if (handle.kind === 'directory') {
                    console.log(`Found subdirectory: ${currentPath}`);
                    await processDirectory(handle, currentPath);
                } else if (handle.kind === 'file') {
                    filesChecked++;
                    // Checking file
                    
                    try {
                        const file = await handle.getFile();
                        const arrayBuffer = await file.arrayBuffer();
                        
                        if (self.isDicomFile(arrayBuffer)) {
                            dicomFilesFound++;
                            // DICOM file found
                            dicomFiles.push({
                                filename: currentPath,
                                data: arrayBuffer,
                                path: currentPath,
                                fileHandle: handle
                            });
                            
                            // Update progress with live count
                            self.updateProgress(`Listing Files ... (${dicomFilesFound} DICOM files found)`, 5 + (filesChecked * 10 / Math.max(filesChecked, 100)));
                        }
                    } catch (error) {
                        console.warn(`Error reading file ${currentPath}:`, error);
                    }
                }
            }
        }
        
        await processDirectory(this.inputDirectoryHandle);
        console.log(`Folder enumeration complete. Found ${dicomFilesFound} DICOM files out of ${filesChecked} files checked.`);
        return dicomFiles;
    }
    
    async initializeWorkers(fileCount = null) {
        // Terminate existing workers
        this.terminateWorkers();
        
        // Determine how many workers we actually need
        let neededWorkers = this.workerCount;
        if (fileCount !== null) {
            neededWorkers = Math.min(this.workerCount, fileCount);
        }
        
        this.workers = [];
        for (let i = 0; i < neededWorkers; i++) {
            const worker = new Worker('dicom-worker.js');
            worker.onmessage = (e) => this.handleWorkerMessage(e, i);
            worker.onerror = (e) => this.handleWorkerError(e, i);
            this.workers.push(worker);
        }
        
        // Update worker count for distribution logic
        this.actualWorkerCount = neededWorkers;
    }
    
    distributeFiles(files) {
        const workerCount = this.actualWorkerCount || this.workers.length;
        const chunks = Array(workerCount).fill().map(() => []);
        
        files.forEach((file, index) => {
            const workerIndex = index % workerCount;
            chunks[workerIndex].push(file);
        });
        
        return chunks;
    }
    
    processWithWorkers(fileChunks) {
        console.log(`ZIP mode: Sending verboseMode=${this.verboseMode} to workers`);
        fileChunks.forEach((chunk, index) => {
            if (chunk.length > 0) {
                const transferables = chunk
                    .map(file => file.data)
                    .filter(data => data)
                    .map(data => (ArrayBuffer.isView(data) ? data.buffer : data))
                    .filter(buffer => buffer instanceof ArrayBuffer);
                this.workers[index].postMessage({
                    type: 'PROCESS_FILES',
                    data: {
                        files: chunk,
                        passphrase: this.passphrase,
                        workerId: index,
                        allowedSOPClassUIDs: this.allowedSOPClassUIDs,
                        tagConfigurations: this.tagConfigurations,
                        verboseMode: this.verboseMode
                    }
                }, transferables);
            }
        });
        
        this.updateWorkerStatus();
    }
    
    handleWorkerMessage(event, workerId) {
        const { type } = event.data;
        
        if (type === 'PROGRESS') {
            this.updateProgress();
        } else if (type === 'COMPLETE') {
            this.handleWorkerComplete(event.data, workerId);
        }
    }
    
    handleWorkerError(error, workerId) {
        console.error(`Worker ${workerId} error:`, error);
        this.showError(`Processing error in worker ${workerId}: ${error.message}`);
    }
    
    handleWorkerComplete(data, workerId) {
        console.log('Worker', workerId, 'completed with data:', data);
        
        if (data.results) {
            this.results = this.results.concat(data.results);
        }
        if (data.auditTrail) {
            this.auditTrails = this.auditTrails.concat(data.auditTrail);
        }
        
        if (data.verboseLogs) {
            console.log(`ZIP mode: Received ${data.verboseLogs.length} verbose logs from worker ${workerId}, total now: ${this.verboseLogs.length + data.verboseLogs.length}`);
            this.verboseLogs = this.verboseLogs.concat(data.verboseLogs);
        } else {
            console.log(`ZIP mode: No verbose logs received from worker ${workerId}`);
        }
        if (data.errorLog) {
            this.errorLogs.push(data.errorLog);
        }
        if (data.skippedFiles) {
            this.skippedFiles += data.skippedFiles;
        }
        
        this.completedWorkers++;
        
        // Check if all workers are complete
        // Note: results.length + skippedFiles should equal totalFiles when all processing is done
        const processedAndSkipped = this.results.length + this.skippedFiles;
        const actualWorkerCount = this.actualWorkerCount || this.workers.length;
        if (this.completedWorkers >= actualWorkerCount || processedAndSkipped >= this.totalFiles) {
            this.onProcessingComplete();
        }
    }
    
    updateProgress(customText = null, customPercentage = null) {
        if (customText && customPercentage !== null) {
            // Custom progress update (e.g., during file listing)
            this.progressFill.style.width = customPercentage + '%';
            this.progressText.textContent = customText;
            this.progressPercent.textContent = Math.round(customPercentage) + '%';
        } else {
            // Default progress update during processing
            this.processedFiles++;
            const percentage = Math.round((this.processedFiles / this.totalFiles) * 100);
            
            this.progressFill.style.width = percentage + '%';
            this.progressText.textContent = `${this.processedFiles} / ${this.totalFiles} files processed`;
            this.progressPercent.textContent = percentage + '%';
        }
    }
    
    updateWorkerStatus() {
        const activeWorkers = this.workers.length;
        this.workerStatus.textContent = `Using ${activeWorkers} parallel workers`;
    }
    
    async onProcessingComplete() {
        try {
            // Create output ZIP
            const outputZip = await this.createOutputZip();
            
            // Show results
            this.showResults(outputZip);
            
        } catch (error) {
            this.showError('Error creating output ZIP: ' + error.message);
        } finally {
            this.terminateWorkers();
        }
    }
    
    async createOutputZip() {
        const zip = new JSZip();
        
        // Add processed DICOM files
        const successfulResults = this.results.filter(r => r.success);
        successfulResults.forEach(result => {
            zip.file(result.filename, result.data);
        });
        
        // Generate and add CSV audit trail
        const csv = this.generateMasterCSV();
        zip.file('deidentification_audit.csv', csv);
        
        // Always generate and add output.log
        let logContent = this.generateMasterErrorLog();
        if (!logContent) {
            // Create a summary log even if no detailed errors
            logContent = 'DICOM Processing Summary\n';
            logContent += '=' .repeat(30) + '\n\n';
            if (this.skippedFiles > 0) {
                logContent += `${this.skippedFiles} files were skipped due to SOPClassUID filtering.\n`;
            }
            const failedFiles = this.results.filter(r => !r.success);
            if (failedFiles.length > 0) {
                logContent += `${failedFiles.length} files failed to process:\n`;
                failedFiles.forEach(result => {
                    logContent += `- ${result.filename}: ${result.error}\n`;
                });
            }
        }
        
        // Add verbose logs if enabled
        if (this.verboseMode && this.verboseLogs.length > 0) {
            logContent += '\n\nDetailed Tag Processing Log\n';
            logContent += '=' .repeat(40) + '\n\n';
            this.verboseLogs.forEach(log => {
                logContent += `File: ${log.filename}\n`;
                logContent += `Tag: ${log.tag} (${log.tagName})\n`;
                logContent += `Original Value: ${log.originalValue}\n`;
                logContent += `Action: ${log.action}\n`;
                logContent += `New Value: ${log.newValue}\n`;
                logContent += `Time: ${log.timestamp}\n`;
                logContent += '-'.repeat(50) + '\n';
            });
        }
        
        zip.file('output.log', logContent);
        
        return await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 },
            streamFiles: true
        });
    }
    
    generateMasterCSV() {
        const headers = [
            'Filename',
            'Original Study Instance UID',
            'Scrambled Study Instance UID',
            'Original Accession',
            'Scrambled Accession',
            'Original Patient ID',
            'Scrambled Patient ID'
        ];
        
        let csv = headers.join(',') + '\n';
        
        // Combine all audit trails - include ALL entries (one per DICOM file)
        const allEntries = this.auditTrails.flat();
        
        // Add all entries (do not remove duplicates - each file should have a row)
        for (const entry of allEntries) {
            const row = [
                this.escapeCSV(entry.filename),
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

    generateMasterErrorLog() {
        // Combine all error logs from workers
        const combinedLog = this.errorLogs.filter(log => log && log.trim().length > 0).join('\n\n');
        
        if (!combinedLog) {
            return ''; // No errors to report
        }

        return combinedLog;
    }

    shouldGenerateErrorLog() {
        // Check if there are any errors to report
        const hasErrors = this.errorLogs.some(log => log && log.trim().length > 0);
        const hasSkippedFiles = this.skippedFiles > 0;
        const hasFailedFiles = this.results.some(r => !r.success);
        
        return hasErrors || hasSkippedFiles || hasFailedFiles;
    }
    
    showProgress() {
        this.hideAllSections();
        this.progressSection.style.display = 'block';
    }
    
    showResults(zipBlob) {
        this.hideAllSections();
        this.resultsSection.style.display = 'block';
        
        const successCount = this.results.filter(r => r.success).length;
        const failedCount = this.results.filter(r => !r.success).length;
        
        let resultMessage = `Successfully processed ${successCount} DICOM files.`;
        if (failedCount > 0) {
            resultMessage += ` ${failedCount} files failed to process.`;
        }
        if (this.skippedFiles > 0) {
            resultMessage += ` ${this.skippedFiles} files skipped due to SOPClassUID filtering.`;
        }
        resultMessage += ` ZIP includes CSV audit trail and processing log.`;
        
        this.resultsText.textContent = resultMessage;
        
        // Store ZIP for download
        this.outputZip = zipBlob;
    }
    
    showError(message) {
        this.hideAllSections();
        this.errorSection.style.display = 'block';
        this.errorText.textContent = message;
    }
    
    hideAllSections() {
        this.progressSection.style.display = 'none';
        this.resultsSection.style.display = 'none';
        this.errorSection.style.display = 'none';
    }
    
    async processWithWorkersStreaming(fileChunks) {
        console.log('processWithWorkersStreaming started. File chunks:', fileChunks.length);
        
        // For streaming mode, we process files and save them directly to output directory
        const workerPromises = fileChunks.map((chunk, index) => {
            console.log(`Setting up worker ${index} with ${chunk.length} files`);
            return new Promise((resolve, reject) => {
                const worker = this.workers[index];
                
                worker.onmessage = async (e) => {
                    const { type, workerId, results, auditTrail, skippedFiles, verboseLogs, errorLog } = e.data;
                    // Worker message received
                    
                    if (type === 'COMPLETE') {
                        // Worker completed
                        
                        // Save processed files directly to output directory
                        for (const result of results || []) {
                            if (result.success && result.data) {
                                // Saving processed file
                                await this.saveProcessedFile(result);
                                
                                // Update progress after each file is saved
                                this.processedFiles++;
                                this.updateProgress(`Processed ${this.processedFiles} / ${this.totalFiles} files`, 
                                    20 + (this.processedFiles / this.totalFiles) * 70);
                            } else {
                                // Count failed files too for progress tracking
                                this.processedFiles++;
                                this.updateProgress(`Processed ${this.processedFiles} / ${this.totalFiles} files`, 
                                    20 + (this.processedFiles / this.totalFiles) * 70);
                            }
                        }
                        
                        this.results.push(...(results || []));
                        this.auditTrails.push(...(auditTrail || []));
                        
                        // Collect verbose logs if available
                        if (verboseLogs && verboseLogs.length > 0) {
                            this.verboseLogs.push(...verboseLogs);
                        }
                        
                        // Collect error logs if available
                        if (errorLog) {
                            this.errorLogs.push(errorLog);
                        }
                        
                        // Track skipped files
                        if (skippedFiles) {
                            this.skippedFiles = (this.skippedFiles || 0) + skippedFiles;
                        }
                        
                        this.completedWorkers++;
                        // Worker completed
                        if (this.completedWorkers === this.workers.length) {
                            console.log('All workers completed. Finalizing results...');
                            await this.finalizeStreamingResults();
                        }
                        resolve();
                    } else if (type === 'ERROR') {
                        console.error(`Worker ${workerId} error:`, e.data.error);
                        reject(new Error(e.data.error));
                    }
                };
                
                worker.onerror = (error) => {
                    console.error(`Worker ${index} onerror:`, error);
                    reject(error);
                };
                
                console.log(`Posting message to worker ${index}`);
                const transferables = chunk
                    .map(file => file.data)
                    .filter(data => data)
                    .map(data => (ArrayBuffer.isView(data) ? data.buffer : data))
                    .filter(buffer => buffer instanceof ArrayBuffer);
                worker.postMessage({
                    type: 'PROCESS_CHUNK',
                    files: chunk,
                    passphrase: this.passphrase,
                    workerId: index,
                    allowedSOPClassUIDs: this.allowedSOPClassUIDs,
                    tagConfigurations: this.tagConfigurations,
                    verboseMode: this.verboseMode
                }, transferables);
            });
        });
        
        try {
            await Promise.all(workerPromises);
        } catch (error) {
            this.showError('Processing failed: ' + error.message);
        }
    }
    
    async saveProcessedFile(result) {
        try {
            // Create directory structure in output folder if needed
            const pathParts = result.filename.split('/');
            let currentDir = this.outputDirectoryHandle;
            
            // Navigate/create directory structure
            for (let i = 0; i < pathParts.length - 1; i++) {
                const dirName = pathParts[i];
                try {
                    currentDir = await currentDir.getDirectoryHandle(dirName);
                } catch {
                    currentDir = await currentDir.getDirectoryHandle(dirName, { create: true });
                }
            }
            
            // Save the file
            const fileName = pathParts[pathParts.length - 1];
            const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            // Writing file
            await writable.write(result.data);
            await writable.close();
            // File saved successfully
            
        } catch (error) {
            console.error('Error saving file:', result.filename, error);
            throw error;
        }
    }
    
    async finalizeStreamingResults() {
        try {
            console.log('Finalizing streaming results...');
            // Save CSV audit trail
            const csvContent = this.generateMasterCSV();
            const csvFileHandle = await this.outputDirectoryHandle.getFileHandle('deidentification_audit.csv', { create: true });
            const csvWritable = await csvFileHandle.createWritable();
            await csvWritable.write(csvContent);
            await csvWritable.close();
            // CSV audit trail saved
            
            // Always generate output.log
            let logContent = this.generateMasterErrorLog();
            if (!logContent) {
                // Create a summary log even if no detailed errors
                logContent = 'DICOM Processing Summary\n';
                logContent += '=' .repeat(30) + '\n\n';
                if (this.skippedFiles > 0) {
                    logContent += `${this.skippedFiles} files were skipped due to SOPClassUID filtering.\n`;
                }
                const failedFiles = this.results.filter(r => !r.success);
                if (failedFiles.length > 0) {
                    logContent += `${failedFiles.length} files failed to process:\n`;
                    failedFiles.forEach(result => {
                        logContent += `- ${result.filename}: ${result.error}\n`;
                    });
                }
            }
            
            // Add verbose logs if enabled
            if (this.verboseMode && this.verboseLogs.length > 0) {
                logContent += '\n\nDetailed Tag Processing Log\n';
                logContent += '=' .repeat(40) + '\n\n';
                this.verboseLogs.forEach(log => {
                    logContent += `File: ${log.filename}\n`;
                    logContent += `Tag: ${log.tag} (${log.tagName})\n`;
                    logContent += `Original Value: ${log.originalValue}\n`;
                    logContent += `Action: ${log.action}\n`;
                    logContent += `New Value: ${log.newValue}\n`;
                    logContent += `Time: ${log.timestamp}\n`;
                    logContent += '-'.repeat(50) + '\n';
                });
            }
            
            const logFileHandle = await this.outputDirectoryHandle.getFileHandle('output.log', { create: true });
            const logWritable = await logFileHandle.createWritable();
            await logWritable.write(logContent);
            await logWritable.close();
            // Output log saved
            
            // Show completion message
            const successCount = this.results.filter(r => r.success).length;
            const failureCount = this.results.filter(r => !r.success).length;
            
            this.resultsText.innerHTML = `
                <strong>Processing Complete!</strong><br>
                Successfully processed: ${successCount} files<br>
                ${failureCount > 0 ? `Failed: ${failureCount} files<br>` : ''}
                ${this.skippedFiles > 0 ? `Skipped due to SOPClassUID filtering: ${this.skippedFiles} files<br>` : ''}
                Files saved to: ${this.outputDirectoryHandle.name}<br>
                CSV audit trail: deidentification_audit.csv<br>
                Processing log: output.log<br>
            `;
            
            this.progressSection.style.display = 'none';
            this.resultsSection.style.display = 'block';
            this.downloadBtn.style.display = 'none'; // No download needed in folder mode
            
        } catch (error) {
            this.showError('Error finalizing results: ' + error.message);
        }
    }

    downloadResults() {
        if (this.outputZip) {
            const url = URL.createObjectURL(this.outputZip);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'deidentified_dicom_files.zip';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    }
    
    terminateWorkers() {
        this.workers.forEach(worker => worker.terminate());
        this.workers = [];
    }
    
    reset() {
        this.terminateWorkers();
        this.uploadedFile = null;
        this.inputDirectoryHandle = null;
        this.outputDirectoryHandle = null;
        this.passphrase = '';
        this.passphraseInput.value = '';
        this.fileInput.value = '';
        this.results = [];
        this.auditTrails = [];
        this.errorLogs = [];
        this.skippedFiles = 0;
        
        // Reset folder paths
        if (this.inputFolderPath) {
            this.inputFolderPath.textContent = 'No folder selected';
            this.inputFolderPath.parentElement.parentElement.classList.remove('selected');
        }
        if (this.outputFolderPath) {
            this.outputFolderPath.textContent = 'No folder selected';
            this.outputFolderPath.parentElement.parentElement.classList.remove('selected');
        }
        
        this.uploadArea.innerHTML = `
            <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7,10 12,15 17,10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <p>Drop ZIP file here or click to browse</p>
            <small>Only ZIP files containing DICOM files are supported</small>
        `;
        
        this.hideAllSections();
        this.updateProcessButton();
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Navigation methods
    showMainPage() {
        this.currentPage = 'main';
        this.mainPage.style.display = 'block';
        this.configPage.style.display = 'none';
        this.mainPageBtn.classList.add('active');
        this.configPageBtn.classList.remove('active');
    }

    showConfigPage() {
        this.currentPage = 'config';
        this.mainPage.style.display = 'none';
        this.configPage.style.display = 'block';
        this.mainPageBtn.classList.remove('active');
        this.configPageBtn.classList.add('active');
    }

    // Configuration methods
    getDefaultTagConfigurations() {
        // Based on current whitelisted tags and their handling
        return {
            '00020003': { ifPresent: 'scramble', ifNotPresent: 'unchanged', presentValue: '', notPresentValue: '', description: 'Media Storage SOP Instance UID' },
            '0020000D': { ifPresent: 'scramble', ifNotPresent: 'unchanged', presentValue: '', notPresentValue: '', description: 'Study Instance UID' },
            '0020000E': { ifPresent: 'scramble', ifNotPresent: 'unchanged', presentValue: '', notPresentValue: '', description: 'Series Instance UID' },
            '00080018': { ifPresent: 'scramble', ifNotPresent: 'unchanged', presentValue: '', notPresentValue: '', description: 'SOP Instance UID' },
            '00080050': { ifPresent: 'scramble', ifNotPresent: 'scrambleFromStudyUID', presentValue: '', notPresentValue: '', description: 'Accession Number' },
            '00100010': { ifPresent: 'scramble', ifNotPresent: 'replace', presentValue: '', notPresentValue: 'ANONYMOUS^PATIENT', description: 'Patient Name' },
            '00100020': { ifPresent: 'scramble', ifNotPresent: 'replace', presentValue: '', notPresentValue: 'PATIENTID1', description: 'Patient ID' },
            '00100030': { ifPresent: 'scramble', ifNotPresent: 'replace', presentValue: '', notPresentValue: '19000101', description: 'Patient Birth Date' },
            '00100040': { ifPresent: 'unchanged', ifNotPresent: 'replace', presentValue: '', notPresentValue: 'M', description: 'Patient Sex' },
            '00101010': { ifPresent: 'unchanged', ifNotPresent: 'replace', presentValue: '', notPresentValue: '027Y', description: 'Patient Age' },
            '00080020': { ifPresent: 'scramble', ifNotPresent: 'replace', presentValue: '', notPresentValue: '19270101', description: 'Study Date' },
            '00080030': { ifPresent: 'scramble', ifNotPresent: 'unchanged', presentValue: '', notPresentValue: '', description: 'Study Time' },
            '00080060': { ifPresent: 'unchanged', ifNotPresent: 'unchanged', presentValue: '', notPresentValue: '', description: 'Modality' },
            '00080070': { ifPresent: 'unchanged', ifNotPresent: 'unchanged', presentValue: '', notPresentValue: '', description: 'Manufacturer' },
            '00080080': { ifPresent: 'scramble', ifNotPresent: 'unchanged', presentValue: '', notPresentValue: '', description: 'Institution Name' },
            '00081030': { ifPresent: 'unchanged', ifNotPresent: 'replace', presentValue: '', notPresentValue: 'UNKNOWNSTUDY', description: 'Study Description' },
            '0008103E': { ifPresent: 'unchanged', ifNotPresent: 'replace', presentValue: '', notPresentValue: 'UNKNOWNSTUDY', description: 'Series Description' },
            '00200011': { ifPresent: 'unchanged', ifNotPresent: 'unchanged', presentValue: '', notPresentValue: '', description: 'Series Number' },
            '00200013': { ifPresent: 'unchanged', ifNotPresent: 'unchanged', presentValue: '', notPresentValue: '', description: 'Instance Number' },
            '00280010': { ifPresent: 'unchanged', ifNotPresent: 'unchanged', presentValue: '', notPresentValue: '', description: 'Rows' },
            '00280011': { ifPresent: 'unchanged', ifNotPresent: 'unchanged', presentValue: '', notPresentValue: '', description: 'Columns' },
            '00280100': { ifPresent: 'unchanged', ifNotPresent: 'unchanged', presentValue: '', notPresentValue: '', description: 'Bits Allocated' },
            '00280101': { ifPresent: 'unchanged', ifNotPresent: 'unchanged', presentValue: '', notPresentValue: '', description: 'Bits Stored' },
            '00280102': { ifPresent: 'unchanged', ifNotPresent: 'unchanged', presentValue: '', notPresentValue: '', description: 'High Bit' },
            '00280103': { ifPresent: 'unchanged', ifNotPresent: 'unchanged', presentValue: '', notPresentValue: '', description: 'Pixel Representation' }
        };
    }

    initializeConfigurationPage() {
        this.renderTagConfigurationList();
    }

    renderTagConfigurationList() {
        this.tagConfigList.innerHTML = '';
        
        Object.entries(this.tagConfigurations).forEach(([tag, config]) => {
            const row = document.createElement('div');
            row.className = 'tag-config-row';
            
            row.innerHTML = `
                <div>
                    <div class="tag-code">${tag}</div>
                </div>
                <div>
                    <div class="tag-description">${config.description}</div>
                </div>
                <div>
                    <div class="scenario-controls">
                        <select class="action-select" data-tag="${tag}" data-scenario="present">
                            <option value="scramble" ${config.ifPresent === 'scramble' ? 'selected' : ''}>Scramble</option>
                            <option value="delete" ${config.ifPresent === 'delete' ? 'selected' : ''}>Delete</option>
                            <option value="unchanged" ${config.ifPresent === 'unchanged' ? 'selected' : ''}>Unchanged</option>
                            <option value="replace" ${config.ifPresent === 'replace' ? 'selected' : ''}>Replace Value</option>
                        </select>
                        <input type="text" class="replace-value" data-tag="${tag}" data-scenario="present" 
                               placeholder="Replace with..." value="${config.presentValue}" 
                               ${config.ifPresent !== 'replace' ? 'style="display:none"' : ''}>
                    </div>
                </div>
                <div>
                    <div class="scenario-controls">
                        <select class="action-select" data-tag="${tag}" data-scenario="notpresent">
                            <option value="delete" ${config.ifNotPresent === 'delete' ? 'selected' : ''}>Delete</option>
                            <option value="unchanged" ${config.ifNotPresent === 'unchanged' ? 'selected' : ''}>Unchanged</option>
                            <option value="scrambleFromStudyUID" ${config.ifNotPresent === 'scrambleFromStudyUID' ? 'selected' : ''}>Generate from Study UID</option>
                            <option value="replace" ${config.ifNotPresent === 'replace' ? 'selected' : ''}>Add Value</option>
                        </select>
                        <input type="text" class="replace-value" data-tag="${tag}" data-scenario="notpresent" 
                               placeholder="Add value..." value="${config.notPresentValue}"
                               ${config.ifNotPresent !== 'replace' ? 'style="display:none"' : ''}>
                    </div>
                </div>
            `;
            
            this.tagConfigList.appendChild(row);
        });
        
        // Add event listeners for configuration changes
        this.bindConfigurationEvents();
    }

    bindConfigurationEvents() {
        // Handle dropdown changes
        this.tagConfigList.addEventListener('change', (e) => {
            if (e.target.classList.contains('action-select')) {
                const tag = e.target.dataset.tag;
                const scenario = e.target.dataset.scenario;
                const value = e.target.value;
                
                // Update configuration
                if (scenario === 'present') {
                    this.tagConfigurations[tag].ifPresent = value;
                } else {
                    this.tagConfigurations[tag].ifNotPresent = value;
                }
                
                // Show/hide replace value input
                const replaceInput = e.target.parentElement.querySelector('.replace-value');
                if (value === 'replace') {
                    replaceInput.style.display = 'block';
                } else {
                    replaceInput.style.display = 'none';
                }
            }
        });
        
        // Handle text input changes
        this.tagConfigList.addEventListener('input', (e) => {
            if (e.target.classList.contains('replace-value')) {
                const tag = e.target.dataset.tag;
                const scenario = e.target.dataset.scenario;
                const value = e.target.value;
                
                // Update configuration
                if (scenario === 'present') {
                    this.tagConfigurations[tag].presentValue = value;
                } else {
                    this.tagConfigurations[tag].notPresentValue = value;
                }
            }
        });
    }

    saveConfiguration() {
        const config = JSON.stringify(this.tagConfigurations, null, 2);
        const blob = new Blob([config], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'dicom_tag_configuration.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    loadConfiguration() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const config = JSON.parse(e.target.result);
                        this.tagConfigurations = config;
                        this.renderTagConfigurationList();
                    } catch (error) {
                        alert('Error loading configuration: ' + error.message);
                    }
                };
                reader.readAsText(file);
            }
        });
        input.click();
    }

    resetConfiguration() {
        if (confirm('Are you sure you want to reset to default configuration?')) {
            this.tagConfigurations = this.getDefaultTagConfigurations();
            this.renderTagConfigurationList();
        }
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new DicomDeidentifier();
});
