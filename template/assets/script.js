let selectedPathString = '';
let auditedRecordsCache = [];
let expenseChartInstance = null;

function switchActiveView(targetViewName) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active'));

    if (targetViewName === 'dashboard') {
        document.getElementById('nav-dash').classList.add('active');
        document.getElementById('view-dashboard').classList.add('active');
    } else if (targetViewName === 'ledger') {
        document.getElementById('nav-ledger').classList.add('active');
        document.getElementById('view-ledger').classList.add('active');
    } else if (targetViewName === 'settings') {
        document.getElementById('nav-settings').classList.add('active');
        document.getElementById('view-settings').classList.add('active');
    } else if (targetViewName === 'funding') {
        document.getElementById('nav-funding').classList.add('active');
        document.getElementById('view-funding').classList.add('active');
    }

    
}

window.addEventListener('pywebviewready', function () {
    loadHistoricalDatabaseLedger();
});

function loadHistoricalDatabaseLedger() {
    pywebview.api.load_receipts().then(function (records) {
        if (records && !records.error) {
            auditedRecordsCache = records;
            document.getElementById('ledgerGrid').innerHTML = "";

            if (auditedRecordsCache.length > 0) {
                for (let i = auditedRecordsCache.length - 1; i >= 0; i--) {
                    renderNewLedgerCard(auditedRecordsCache[i]);
                }
            }
            calculateAndRenderChartMetrics();
        }
    });
}

function calculateAndRenderChartMetrics() {
    let categoryTotals = {
        "Food & Meals": 0,
        "Logistics & Transport": 0,
        "Operational Overhead": 0,
        "Unapproved / Disallowed": 0,
        "Uncategorized Past Records": 0
    };

    let totalAccumulatedSpent = 0;
    let totalFlaggedCount = 0;

    auditedRecordsCache.forEach(function (rec) {
        if (rec.rating === "FLAGGED" || rec.rating === "REJECTED") totalFlaggedCount++;

        let numericTotal = parseFloat(rec.total.replace(/[^0-9.]/g, '')) || 0;
        totalAccumulatedSpent += numericTotal;

        if (rec.categories && typeof rec.categories === 'object') {
            let foundValidMapping = false;
            for (let cat in categoryTotals) {
                if (rec.categories.hasOwnProperty(cat) && rec.categories[cat] !== undefined) {
                    categoryTotals[cat] += parseFloat(rec.categories[cat]) || 0;
                    foundValidMapping = true;
                }
            }
            if (!foundValidMapping) categoryTotals["Uncategorized Past Records"] += numericTotal;
        } else {
            categoryTotals["Uncategorized Past Records"] += numericTotal;
        }
    });

    document.getElementById('statTotalSpent').innerText = "R " + totalAccumulatedSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById('statFlaggedCount').innerText = totalFlaggedCount;
    document.getElementById('statReceiptCount').innerText = auditedRecordsCache.length;

    const activeCanvas = document.getElementById('analyticsChart');
    if (!activeCanvas) return;
    const canvasContext = activeCanvas.getContext('2d');

    if (expenseChartInstance) expenseChartInstance.destroy();

    expenseChartInstance = new Chart(canvasContext, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categoryTotals).filter(key => categoryTotals[key] > 0),
            datasets: [{
                data: Object.values(categoryTotals).filter(val => val > 0),
                backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#94a3b8'],
                borderWidth: 2,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 }, padding: 12 } }
            }
        }
    });
}

function runAuditWorkflow() {
    const mission = document.getElementById('missionText').value;
    const submitBtn = document.getElementById('submitBtn');
    const errorBox = document.getElementById('errorBox');

    if (!selectedPathString) {
        showInlineError("Validation Error: Attach an image file from your disk before running the tool.");
        return;
    }

    errorBox.style.display = 'none';
    submitBtn.innerText = "🔄 Reading Image Matrix...";
    submitBtn.disabled = true;

    pywebview.api.audit_receipt_router('file', selectedPathString, '', mission)
        .then(function (res) {
            submitBtn.innerText = "Analyze Asset via Gemini";
            submitBtn.disabled = false;

            if (res.error) {
                showInlineError(res.error);
            } else {
                const receiptNum = res.receipt_number || "Unknown";
                if (receiptNum !== "Unknown") {
                    const isDuplicate = auditedRecordsCache.some(item => item.receiptNumber === receiptNum);
                    if (isDuplicate) {
                        showInlineError(`❌ Duplicate Blocked: Receipt ID [${receiptNum}] found in database!`);
                        toggleDrawer(false);
                        resetFormFields();
                        return;
                    }
                }

                const recordObject = {
                    id: res.id,
                    vendor: res.vendor || "Unknown Vendor",
                    total: res.total_amount || "$0.00",
                    date: res.date || "Unknown",
                    receiptNumber: receiptNum,
                    items: res.items_extracted || [],
                    categories: res.category_breakdown || {},
                    rating: res.due_cause_rating || "FLAGGED",
                    reasoning: res.compliance_reasoning || "No context attached."
                };

                auditedRecordsCache.unshift(recordObject);
                renderNewLedgerCard(recordObject);
                calculateAndRenderChartMetrics();

                toggleDrawer(false);
                resetFormFields();
            }
        })
        .catch(function (err) {
            submitBtn.innerText = "Analyze Asset via Gemini";
            submitBtn.disabled = false;
            showInlineError("Pipeline communication crash: " + err);
        });
}

function renderNewLedgerCard(record) {
    const gridContainer = document.getElementById('ledgerGrid');
    if (!gridContainer) return;
    const card = document.createElement('div');
    card.className = 'ledger-card';
    card.setAttribute('data-id', record.id);
    card.onclick = function () { openDetailPopup(record.id); };

    card.innerHTML = `
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span class="card-vendor" style="font-weight:700; color:#1e3a8a;">${record.vendor}</span>
            <span class="badge ${record.rating.toLowerCase()}">${record.rating}</span>
        </div>
        <div class="card-total" style="font-size:20px; font-weight:bold; margin-bottom:8px;">${record.total}</div>
        <div style="font-size:11px; color:#64748b; line-height:1.4;">
            📅 Date: ${record.date}<br>
            🆔 Doc #: ${record.receiptNumber}
        </div>
        <div style="font-size:11px; color:var(--primary); font-weight:600; margin-top:12px; border-top:1px dashed #e2e8f0; padding-top:8px;">Click card to verify items ➔</div>
    `;
    gridContainer.insertBefore(card, gridContainer.firstChild);
}

function openDetailPopup(id) {
    const record = auditedRecordsCache.find(item => item.id === id);
    if (!record) return;

    document.getElementById('modalVendor').innerText = record.vendor;
    document.getElementById('modalTotal').innerText = record.total;
    document.getElementById('modalMetaLine').innerHTML = `Date: <strong>${record.date}</strong> &nbsp;|&nbsp; ID: <strong>${record.receiptNumber}</strong>`;

    const badge = document.getElementById('modalBadge');
    badge.innerText = record.rating;
    badge.className = "badge " + record.rating.toLowerCase();

    const itemsListContainer = document.getElementById('modalItemsList');
    itemsListContainer.innerHTML = "";

    record.items.forEach(function (item) {
        let bg = "transparent";
        if(item.flagged == 'True'){
            bg = "red"
        }
        const li = document.createElement('li');
        li.style.display = "flex"; li.style.justifyContent = "space-between"; li.style.marginBottom = "6px";
        li.style.borderBottom = "1px solid #f1f5f9"; li.style.paddingBottom = "4px";
        li.style.backgroundColor = `${bg}`;
        li.innerHTML = `<span>${item.name}</span><span style="font-weight:600; font-family:monospace;">${item.price}</span>`;
        itemsListContainer.appendChild(li);
    });

    document.getElementById('modalReasoning').innerText = record.reasoning;
    document.getElementById('detailsModal').style.display = 'flex';
}

function closeDetailPopup() {
    document.getElementById('detailsModal').style.display = 'none';
}

function toggleDrawer(openState) {
    const drawer = document.getElementById('auditDrawer');
    if (openState) {
        drawer.style.right = '0px';
    } else {
        drawer.style.right = '-420px';
    }
}

function triggerFilePicker() {
    document.getElementById('errorBox').style.display = 'none';
    pywebview.api.select_local_file().then(function (filePath) {
        if (filePath && typeof filePath === 'string' && filePath.trim() !== "") {
            selectedPathString = filePath;
            let displayLabel = filePath.split(/[\\/]/).pop();
            document.getElementById('fileLabel').innerText = "✓ Ready: " + displayLabel;
        }
    });
}

function showInlineError(msg) {
    const box = document.getElementById('errorBox');
    box.innerText = msg;
    box.style.display = 'block';
}

function resetFormFields() {
    selectedPathString = '';
    document.getElementById('fileLabel').innerText = "📁 Attach Local Document Image...";
}