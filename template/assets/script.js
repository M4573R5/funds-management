
let selectedPathString = '';
let auditedRecordsCache = [];
let expenseChartInstance = null;

window.addEventListener('pywebviewready', function () {
    console.log("Python structural database pipeline connected.");
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

                calculateAndRenderChartMetrics()
            }
        } else if (records.error) {
            console.error("Database fetch exception occurred:", records.error);
        }
    });
}

function calculateAndRenderChartMetrics() {
    let categoryTotals = {
        "Food & Meals": 0,
        "Logistics & Transport": 0,
        "Operational Overhead": 0,
        "Unapproved / Disallowed": 0
    };

    let totalAccumulatedSpent = 0;
    let totalFlaggedCount = 0;

    auditedRecordsCache.forEach(function (rec) {
        if (rec.rating === "FLAGGED" || rec.rating === "REJECTED") totalFlaggedCount++;

        let numericTotal = parseFloat(rec.total.replace(/[^0-9.]/g, '')) || 0;
        totalAccumulatedSpent += numericTotal;

        if (rec.categories) {
            for (let cat in categoryTotals) {
                if (rec.categories[cat]) {
                    categoryTotals[cat] += parseFloat(rec.categories[cat]) || 0;
                }
            }
        }
    });

    document.getElementById('statTotalSpent').innerText = "R " + totalAccumulatedSpent.toFixed(2);
    document.getElementById('statFlaggedCount').innerText = totalFlaggedCount;
    document.getElementById('statReceiptCount').innerText = auditedRecordsCache.length;

    const canvasContext = document.getElementById('analyticsChart');
    if (expenseChartInstance) {
        expenseChartInstance.destroy();
    }

    expenseChartInstance = new Chart(canvasContext, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categoryTotals),
            datasets: [{
                data: Object.values(categoryTotals),
                backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'],
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
            }
        }
    });
}
function toggleDrawer(openState) {
    const drawer = document.getElementById('auditDrawer');
    if (openState) {
        drawer.classList.add('open');
    } else {
        drawer.classList.remove('open');
    }
}

function triggerFilePicker() {
    document.getElementById('errorBox').style.display = 'none';

    pywebview.api.select_local_file().then(function (filePath) {
        if (filePath && typeof filePath === 'string' && filePath.trim() !== "") {
            selectedPathString = filePath;

            let displayLabel = filePath.split(/[\\/]/).pop();
            document.getElementById('fileLabel').innerText = "✓ Ready: " + displayLabel;
            console.log("Secure file string mapped safely in state:", selectedPathString);
        } else {
            console.log("User cancelled file selection or empty path string captured.");
        }
    }).catch(function (err) {
        showInlineError("File window dialog interface issue: " + err);
    });
}

function runAuditWorkflow() {
    const mission = document.getElementById('missionText').value;
    const submitBtn = document.getElementById('submitBtn');
    const errorBox = document.getElementById('errorBox');

    if (!selectedPathString) {
        showInlineError("Validation Error: Please attach a local document receipt image first.");
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
                        showInlineError(`❌ Duplicate Blocked: Receipt number [${receiptNum}] has already been captured in this ledger instance!`);
                        toggleDrawer(false);
                        resetFormFields();
                        return;
                    }
                }

                const recordId = "rec_" + Date.now();
                const recordObject = {
                    id: recordId,
                    vendor: res.vendor || "Unknown Vendor",
                    total: res.total_amount || "$0.00",
                    date: res.date || "Unknown",
                    receiptNumber: receiptNum,
                    items: res.items_extracted || [],
                    rating: res.due_cause_rating || "FLAGGED",
                    reasoning: res.compliance_reasoning || "No reasoning attached."
                };

                auditedRecordsCache.unshift(recordObject);

                renderNewLedgerCard(recordObject);
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
    const card = document.createElement('div');
    card.className = 'ledger-card';
    card.setAttribute('data-id', record.id);

    card.onclick = function () {
        openDetailPopup(record.id);
    };

    card.innerHTML = `
        <div class="card-header">
            <span class="card-vendor">${record.vendor}</span>
            <span class="badge ${record.rating.toLowerCase()}">${record.rating}</span>
        </div>
        <div class="card-total">${record.total}</div>
        <div style="font-size:11px; color:#64748b; margin-top:5px; line-height: 1.4;">
            📅 Date: ${record.date}<br>
            🆔 Doc #: ${record.receiptNumber}
        </div>
        <div class="card-footer-tip" style="margin-top:10px;">Click card to verify items ➔</div>
    `;

    gridContainer.insertBefore(card, gridContainer.firstChild);
}

function openDetailPopup(id) {
    const record = auditedRecordsCache.find(item => item.id === id);
    if (!record) return;

    document.getElementById('modalVendor').innerText = record.vendor;
    document.getElementById('modalTotal').innerText = record.total;

    document.getElementById('modalMetaLine').innerHTML = `
        Transaction Date: <strong>${record.date}</strong> &nbsp;|&nbsp; Receipt ID: <strong>${record.receiptNumber}</strong>
    `;

    const badge = document.getElementById('resBadge') || document.getElementById('modalBadge');
    if (badge) {
        badge.innerText = record.rating;
        badge.className = "badge " + record.rating.toLowerCase();
    }

    const itemsListContainer = document.getElementById('modalItemsList');
    itemsListContainer.innerHTML = "";

    if (!record.items || record.items.length === 0) {
        itemsListContainer.innerHTML = "<li>No items found</li>";
    } else {
        record.items.forEach(function (item) {
            const li = document.createElement('li');
            li.style.display = "flex";
            li.style.justifyContent = "space-between";
            li.style.marginBottom = "4px";
            li.innerHTML = `<span>${item.name}</span><span style="font-weight:600; font-family:monospace;">${item.price}</span>`;
            itemsListContainer.appendChild(li);
        });
    }

    document.getElementById('modalReasoning').innerText = record.reasoning;
    document.getElementById('detailsModal').style.display = 'flex';
}

function closeDetailPopup() {
    document.getElementById('detailsModal').style.display = 'none';
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
