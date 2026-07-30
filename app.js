// =====================================================================
// PML RELAY MES — frontend logic (hosted separately, talks to Apps
// Script over fetch() instead of google.script.run)
// =====================================================================

// --- API URL SETUP (first-run modal, saved in localStorage) ---
let APPS_SCRIPT_URL = localStorage.getItem('appsScriptUrl') || '';

function openSettings() {
    document.getElementById('setupUrlInput').value = APPS_SCRIPT_URL;
    document.getElementById('setupModal').style.display = 'flex';
}
function saveSetupUrl() {
    const val = document.getElementById('setupUrlInput').value.trim();
    if (!val) return alert('Please paste the Apps Script /exec URL.');
    APPS_SCRIPT_URL = val;
    localStorage.setItem('appsScriptUrl', val);
    document.getElementById('setupModal').style.display = 'none';
    loadGlobalDropdowns();
}

// --- API HELPERS ---
async function apiGet(action, params = {}) {
    if (!APPS_SCRIPT_URL) { openSettings(); throw new Error('Set the API URL first.'); }
    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.set('action', action);
    Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
    const res = await fetch(url.toString());
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Request failed.');
    return json.data;
}

async function apiPost(action, payload = {}) {
    if (!APPS_SCRIPT_URL) { openSettings(); throw new Error('Set the API URL first.'); }
    // text/plain avoids a CORS preflight request, which Apps Script can't answer.
    const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, payload })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Request failed.');
    return json;
}

// --- 0. INITIALIZATION & GLOBAL DROPDOWNS ---
let globalDropdownData = { Created_By: [], Part_ID: [], Final_Part_ID: [], Tester: [], Received_By: [], Inspector: [] };

document.addEventListener("DOMContentLoaded", function () {
    if (!APPS_SCRIPT_URL) {
        openSettings();
    } else {
        loadGlobalDropdowns();
    }
    setupAutoSaveDropdowns();
});

async function loadGlobalDropdowns() {
    try {
        globalDropdownData = await apiGet('getGlobalDropdowns');
        populateDatalists();
    } catch (e) {
        console.error(e);
    }
}

function populateDatalists() {
    document.querySelectorAll('datalist').forEach(datalist => {
        const listName = datalist.id.replace('list_', '');
        datalist.innerHTML = '';
        if (globalDropdownData[listName]) {
            globalDropdownData[listName].forEach(val => { datalist.innerHTML += `<option value="${val}">`; });
        }
    });
}

async function addGlobalItem(listName, targetInputId) {
    let label = listName.replace(/_/g, ' ');
    const newValue = prompt(`Enter new value to add to ${label}:`);
    if (!newValue || newValue.trim() === "") return;

    const trimmedVal = newValue.trim();
    if (targetInputId) document.getElementById(targetInputId).value = trimmedVal;

    if (!globalDropdownData[listName]) globalDropdownData[listName] = [];
    if (!globalDropdownData[listName].map(v => v.toLowerCase()).includes(trimmedVal.toLowerCase())) {
        globalDropdownData[listName].push(trimmedVal);
        populateDatalists();
        try { await apiPost('addGlobalDropdownItem', { listName: listName, value: trimmedVal }); }
        catch (e) { alert('Error: ' + e.message); }
    }

    if (targetInputId === 'asmFinalPartId') loadBOM();
}

function setupAutoSaveDropdowns() {
    document.querySelectorAll('.searchable-dropdown').forEach(input => {
        input.addEventListener('change', async function () {
            const listName = this.getAttribute('data-list');
            const val = this.value.trim();
            if (val === "") return;

            if (!globalDropdownData[listName]) globalDropdownData[listName] = [];
            if (!globalDropdownData[listName].map(v => v.toLowerCase()).includes(val.toLowerCase())) {
                globalDropdownData[listName].push(val);
                populateDatalists();
                try { await apiPost('addGlobalDropdownItem', { listName: listName, value: val }); }
                catch (e) { alert('Error: ' + e.message); }
            }

            if (this.id === 'asmFinalPartId' && val) loadBOM();
        });
    });
}

// --- 1. UI NAVIGATION & BUTTONS ---
function openTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
    if (tabId === 'tab-trackers') { loadJOTracker(); loadAsmTracker(); }
    if (tabId === 'tab-grn-iqc') loadGRNProcesses();
}

function toggleBtn(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    if (isLoading) {
        btn.dataset.originalText = btn.innerText; btn.innerText = "Processing..."; btn.disabled = true;
    } else {
        btn.innerText = btn.dataset.originalText; btn.disabled = false;
    }
}

// --- 2. FORMS: JOB ORDER ---
async function submitJobOrder(e) {
    e.preventDefault();
    const payload = {
        joNumber: document.getElementById('joNumber').value.trim(),
        partId: document.getElementById('joPartId').value.trim(),
        partType: document.getElementById('joPartType').value,
        qty: parseInt(document.getElementById('joQty').value, 10),
        person: document.getElementById('joPerson').value.trim()
    };
    toggleBtn('btn-jo', true);
    try {
        const res = await apiPost('createJobOrder', payload);
        alert(res.message);
        document.getElementById('form-jo').reset();
    } catch (err) { alert('Error: ' + err.message); }
    toggleBtn('btn-jo', false);
}

// --- 3. FORMS: GRN & SMART LABEL GENERATION ---
async function loadGRNProcesses() {
    const select = document.getElementById("grnReleaseProcess");
    select.innerHTML = '<option value="">-- Loading... --</option>';
    try {
        const processes = await apiGet('getGRNProcesses');
        select.innerHTML = '<option value="">-- Select Process --</option>';
        processes.forEach(p => select.innerHTML += `<option value="${p}">${p}</option>`);
    } catch (e) { console.error(e); }
}

async function addNewGRNProcess() {
    const name = prompt("Enter new Release Process name:");
    if (!name || name.trim() === "") return;
    const btn = document.getElementById('btn-add-process');
    btn.disabled = true; btn.innerText = "...";
    try {
        const res = await apiPost('addGRNProcess', { name: name });
        alert(res.message);
        await loadGRNProcesses();
    } catch (err) { alert('Error: ' + err.message); }
    btn.disabled = false; btn.innerText = "+ Add";
}

function toggleReleaseProcess() {
    const result = document.getElementById('iqcResult').value;
    const processGroup = document.getElementById('releaseProcessGroup');
    const processSelect = document.getElementById('grnReleaseProcess');
    if (result === 'OK' || result === 'ACCEPTED ON DEVIATION') {
        processGroup.style.display = 'flex'; processSelect.setAttribute('required', 'true');
    } else {
        processGroup.style.display = 'none'; processSelect.removeAttribute('required'); processSelect.value = '';
    }
}

async function submitGRN(e) {
    e.preventDefault();
    const payload = {
        grnNumber: document.getElementById('grnNumber').value.trim(),
        grnDate: document.getElementById('grnDate').value,
        joNumber: document.getElementById('grnJO').value.trim(),
        partId: document.getElementById('grnPartId').value.trim(),
        qty: parseInt(document.getElementById('grnQty').value, 10),
        person: document.getElementById('grnPerson').value.trim(),
        releaseProcess: document.getElementById('grnReleaseProcess').value,
        result: document.getElementById('iqcResult').value,
        inspector: document.getElementById('iqcInspector').value.trim()
    };

    toggleBtn('btn-grn', true);
    try {
        await apiPost('createGRN', payload);
        const smartData = { JO: payload.joNumber, Part: payload.partId, GRN: payload.grnNumber, Qty: payload.qty, Status: payload.result };
        showQRModal(smartData);
        document.getElementById('form-grn').reset();
        toggleReleaseProcess();
    } catch (err) { alert('Error: ' + err.message); }
    toggleBtn('btn-grn', false);
}

function showQRModal(data) {
    document.getElementById('qrPrintModal').style.display = "flex";
    document.getElementById('qrcodeDisplay').innerHTML = "";
    new QRCode(document.getElementById("qrcodeDisplay"), { text: JSON.stringify(data), width: 180, height: 180 });
    document.getElementById('qrDataDisplay').innerHTML = `
        <b>Part ID:</b> ${data.Part}<br>
        <b>JO No:</b> ${data.JO}<br>
        <b>Qty:</b> ${data.Qty} &nbsp;|&nbsp; <b>Status:</b> ${data.Status}<br>
        <span style="font-size:12px; color:#555;">GRN: ${data.GRN}</span>
    `;
}
function closeQRModal() { document.getElementById('qrPrintModal').style.display = "none"; }

// --- 4. ASSEMBLY LOGIC (FAST-TRACK) ---
let asmComps = [];

async function loadBOM() {
    const finalPartId = document.getElementById('asmFinalPartId').value.trim();
    if (!finalPartId) return;

    try {
        const bom = await apiGet('getBOMForPart', { partId: finalPartId });
        if (bom.length === 0) {
            alert("No BOM found for this Part ID. You can add components manually.");
            asmComps = [];
        } else {
            asmComps = bom.map(c => ({ partId: c.childPart, joNumber: '', qty: c.qty }));
        }
        renderAsmTable();
    } catch (err) { alert("Error loading BOM: " + err.message); }
}

function addAssemblyComp() {
    const part = document.getElementById('asmCompPartId').value.trim();
    const jo = document.getElementById('asmCompJO').value.trim();
    const qty = document.getElementById('asmCompQty').value;

    if (!part || !jo || !qty) return alert("Please fill all 'Add Extra' fields before adding.");

    saveTableInputs();
    asmComps.push({ partId: part, joNumber: jo, qty: qty });

    document.getElementById('asmCompPartId').value = "";
    document.getElementById('asmCompJO').value = "";
    document.getElementById('asmCompQty').value = "";

    renderAsmTable();
}

function saveTableInputs() {
    for (let i = 0; i < asmComps.length; i++) {
        const partInput = document.getElementById(`asmPart_${i}`);
        const joInput = document.getElementById(`asmJo_${i}`);
        const qtyInput = document.getElementById(`asmQty_${i}`);
        if (partInput && !asmComps[i].partId) asmComps[i].partId = partInput.value.trim();
        if (joInput) asmComps[i].joNumber = joInput.value.trim();
        if (qtyInput) asmComps[i].qty = qtyInput.value;
    }
}

function removeAsmComp(index) { saveTableInputs(); asmComps.splice(index, 1); renderAsmTable(); }

function renderAsmTable() {
    const t = document.getElementById('asmTable'), b = document.getElementById('asmBody');
    b.innerHTML = "";

    if (asmComps.length > 0) {
        t.style.display = "table";

        asmComps.forEach((c, i) => {
            const partCell = c.partId ? `<strong>${c.partId}</strong>` : `<input type="text" id="asmPart_${i}" placeholder="Enter Part ID" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px;">`;

            b.innerHTML += `<tr>
                <td>${partCell}</td>
                <td>
                    <div class="scan-row" style="gap:4px;">
                        <input type="text" id="asmJo_${i}" value="${c.joNumber}" placeholder="Scan/Enter JO" required style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px;">
                        <button type="button" class="scan-btn" onclick="startSmartScan('asmJo_${i}', '${c.partId}')" style="height:32px; padding:0 8px; font-size:14px;">📷</button>
                    </div>
                </td>
                <td><input type="number" id="asmQty_${i}" value="${c.qty}" required style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px;"></td>
                <td><button type="button" class="btn-secondary" style="background:#d32f2f; height:32px;" onclick="removeAsmComp(${i})">X</button></td>
            </tr>`;
        });
    } else {
        t.style.display = "none";
    }
}

async function submitAssembly() {
    const f = document.getElementById('asmFinalPartId').value.trim();
    if (!f || !asmComps.length) return alert("Requires Relay Part ID and at least one component.");

    saveTableInputs();
    for (let i = 0; i < asmComps.length; i++) {
        if (!asmComps[i].partId || !asmComps[i].joNumber || !asmComps[i].qty) return alert("Please fill all fields in the Assembly table.");
    }

    toggleBtn('btn-asm', true);
    try {
        const r = await apiPost('saveAssemblyComponents', { finalPartId: f, components: asmComps });
        alert(r.message);
        document.getElementById('asmFinalPartId').value = '';
        asmComps = [];
        renderAsmTable();
    } catch (e) { alert(e.message); }
    toggleBtn('btn-asm', false);
}

// --- 5. SIMPLE SUBMITS (Laser, EOL, PDI) ---
async function executeSimpleSubmit(e, formId, btnId, payloadObj, action) {
    e.preventDefault(); toggleBtn(btnId, true);
    try {
        const res = await apiPost(action, payloadObj);
        alert(res.message);
        document.getElementById(formId).reset();
    } catch (err) { alert("Error: " + err.message); }
    toggleBtn(btnId, false);
}

function submitLaser(e) { return executeSimpleSubmit(e, 'form-laser', 'btn-laser', { partId: document.getElementById('lmPartId').value.trim(), serialNumber: document.getElementById('lmSerial').value.trim(), markingDate: document.getElementById('lmDate').value }, 'registerSerial'); }
function submitEOL(e) { return executeSimpleSubmit(e, 'form-eol', 'btn-eol', { serialNumber: document.getElementById('eolSerial').value.trim(), result: document.getElementById('eolResult').value, tester: document.getElementById('eolTester').value.trim() }, 'processEOLTest'); }
function submitPDI(e) { return executeSimpleSubmit(e, 'form-pdi', 'btn-pdi', { serialNumber: document.getElementById('pdiSerial').value.trim(), result: document.getElementById('pdiResult').value, tester: document.getElementById('pdiTester').value.trim() }, 'processPDITest'); }

// --- 6. TRACKERS & TRACE ---
async function loadJOTracker() {
    document.getElementById('joLoader').style.display = "block"; document.getElementById('joTable').style.display = "none";
    try {
        const data = await apiGet('getJobOrderTracker');
        const b = document.getElementById('joBody'); b.innerHTML = "";
        data.forEach(j => b.innerHTML += `<tr><td>${j.joNumber}</td><td>${j.partId}</td><td>${j.partType}</td><td>${j.qty}</td><td>${j.devStatus}</td><td><span class="stage-tag">${j.currentStage}</span></td></tr>`);
        document.getElementById('joLoader').style.display = "none"; document.getElementById('joTable').style.display = "table";
    } catch (e) { document.getElementById('joLoader').innerText = "Error: " + e.message; }
}

async function loadAsmTracker() {
    document.getElementById('asmLoader').style.display = "block"; document.getElementById('asmTrackerTable').style.display = "none";
    try {
        const data = await apiGet('getAssemblyTracker');
        const b = document.getElementById('asmTrackerBody'); b.innerHTML = "";
        data.forEach(a => b.innerHTML += `<tr><td>${a.finalPartId}</td><td>${a.componentCount}</td><td>${a.serialCount}</td><td><span class="stage-tag">${a.currentStage}</span></td></tr>`);
        document.getElementById('asmLoader').style.display = "none"; document.getElementById('asmTrackerTable').style.display = "table";
    } catch (e) { document.getElementById('asmLoader').innerText = "Error: " + e.message; }
}

async function lookupTrace(e) {
    e.preventDefault();
    const s = document.getElementById('traceSerial').value.trim(); const res = document.getElementById('traceResult');
    toggleBtn('btn-trace', true); res.style.display = "block"; res.innerHTML = "Tracing...";
    try {
        const t = await apiGet('traceSerialNumber', { serialNumber: s });
        if (!t.found) { res.innerHTML = "<b>Serial not found in database.</b>"; }
        else {
            let html = `<h3>${t.serialNumber}</h3><p><b>Part ID:</b> ${t.core.partId} <br><b>Marked:</b> ${t.core.markingDate}</p><p><b>EOL:</b> ${t.core.eolStatus} | <b>PDI:</b> ${t.core.pdiStatus}</p>`;
            if (t.quality.length) { html += "<h4>Quality Logs</h4><ul>" + t.quality.map(q => `<li>${q.stage}: ${q.status} (${q.tester})</li>`).join('') + "</ul>"; }
            res.innerHTML = html;
        }
    } catch (err) { res.innerHTML = "Error: " + err.message; }
    toggleBtn('btn-trace', false);
}

// --- 7. SMART SCANNER LOGIC ---
let html5QrCode = null;
let currentTarget = "";
let expectedSmartPart = "";

function startGRNScan() {
    currentTarget = 'grnJO';
    document.getElementById("scannerModal").style.display = "flex";

    if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");

    Html5Qrcode.getCameras().then(devices => {
        if (!devices.length) return alert("No camera found.");
        let cam = devices.find(d => /back|rear/i.test(d.label)) || devices[0];

        html5QrCode.start(cam.id, { fps: 10, qrbox: { width: 250, height: 250 } }, scannedText => {
            stopScan();
            try {
                const data = JSON.parse(scannedText);

                if (data.JO) document.getElementById('grnJO').value = data.JO;
                if (data.Part) document.getElementById('grnPartId').value = data.Part;
                if (data.Qty) document.getElementById('grnQty').value = data.Qty;

                document.getElementById('grnDate').valueAsDate = new Date();

            } catch (err) {
                document.getElementById('grnJO').value = scannedText;
            }
        }, () => { });
    }).catch(err => alert("Camera error: " + err));
}

function startSmartScan(targetId, expectedPart = "") {
    expectedSmartPart = expectedPart;
    startScan(targetId);
}

function startScan(targetId) {
    currentTarget = targetId; document.getElementById("scannerModal").style.display = "flex";
    if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
    Html5Qrcode.getCameras().then(devices => {
        if (!devices.length) return alert("No camera found.");
        let cam = devices.find(d => /back|rear/i.test(d.label)) || devices[0];

        html5QrCode.start(cam.id, { fps: 10, qrbox: { width: 250, height: 250 } }, scannedText => {
            stopScan();
            try {
                const data = JSON.parse(scannedText);
                if (data.JO && data.Part) {
                    if (expectedSmartPart && expectedSmartPart !== "" && data.Part !== expectedSmartPart) {
                        alert(`❌ POKA-YOKE REJECTED ❌\n\nYou scanned Part: ${data.Part}\nBOM Requires: ${expectedSmartPart}\n\nWrong part selected!`);
                        return;
                    }
                    document.getElementById(currentTarget).value = data.JO;
                } else {
                    document.getElementById(currentTarget).value = scannedText;
                }
            } catch (err) {
                document.getElementById(currentTarget).value = scannedText;
            }
        }, () => { });
    }).catch(err => alert("Camera error: " + err));
}

function stopScan() {
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(() => {
            document.getElementById("scannerModal").style.display = "none";
            expectedSmartPart = "";
        });
    } else {
        document.getElementById("scannerModal").style.display = "none";
        expectedSmartPart = "";
    }
}
