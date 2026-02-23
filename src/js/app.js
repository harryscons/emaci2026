document.addEventListener('DOMContentLoaded', () => {
    console.log('EMACI 2026 Torun initialized.');

    // Auto-load report view
    showSection('report-section');
    loadReportData();

    // Backup functionality
    const backupBtn = document.getElementById('backup-btn');
    if (backupBtn) {
        backupBtn.addEventListener('click', () => {
            const dataStr = JSON.stringify(emacs2026Data, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `EMACI_2026_Torun_Backup_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    // Restore functionality
    const restoreInput = document.getElementById('restore-input');
    if (restoreInput) {
        restoreInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const newData = JSON.parse(event.target.result);
                    if (!newData.competitors) {
                        throw new Error('Invalid data format: Missing "competitors" array.');
                    }

                    window.emacs2026Data = newData;
                    allData = processData(newData);
                    initializeFilters(allData);
                    renderTable(allData);

                    alert('Data restored successfully!');
                } catch (err) {
                    alert('Error restoring data: ' + err.message);
                }
            };
            reader.readAsText(file);
        });
    }
});

function showSection(id) {
    const section = document.getElementById(id);
    if (section) {
        section.style.display = 'block';
        section.style.opacity = '1';
        section.style.transform = 'translateY(0)';
    }
}

let allData = [];
let activeFilters = {};
let currentSort = { column: 'When', direction: 'asc' };
const FILTER_COLUMNS = ["Bib", "Last Name", "First Name", "Age Group", "Gender", "Event", "When", "Team Name", "QP", "RESULT"];

async function loadReportData() {
    const splash = document.getElementById('splash-screen');
    const loaderBar = document.querySelector('.loading-progress');
    const status = document.getElementById('loading-status');

    const updateProgress = (width, text) => {
        if (loaderBar) loaderBar.style.width = width + '%';
        if (status) status.textContent = text;
    };

    try {
        updateProgress(20, 'Loading competitors...');
        await new Promise(resolve => setTimeout(resolve, 500));

        if (typeof emacs2026Data === 'undefined') {
            throw new Error('Data not found. Please ensure data.js is loaded correctly.');
        }

        updateProgress(50, 'Processing 150k+ records...');
        await new Promise(resolve => setTimeout(resolve, 500));

        allData = processData(emacs2026Data);

        updateProgress(80, 'Preparing interface...');
        await new Promise(resolve => setTimeout(resolve, 300));

        initializeFilters(allData);
        // Apply initial sort
        const initialSorted = sortData(allData, currentSort.column, currentSort.direction);
        renderTable(initialSorted);

        updateProgress(100, 'Ready');

        setTimeout(() => {
            splash.classList.add('fade-out');
        }, 600);

    } catch (error) {
        console.error('Error loading report:', error);
        updateProgress(0, 'Critical Error');
        document.querySelector('#report-table tbody').innerHTML = `<tr><td colspan="9" style="text-align:center; color: #ff5f56;">Error loading data: ${error.message}</td></tr>`;
    }
}

function processData(source) {
    if (!source.competitors) return [];

    const dateMapping = {
        "1": "Fri, 27 Mar",
        "2": "Sat, 28 Mar",
        "3": "Sun, 29 Mar",
        "4": "Mon, 30 Mar",
        "5": "Tue, 31 Mar",
        "6": "Wed, 01 Apr",
        "7": "Thu, 02 Apr"
    };

    const eventToDay = {
        "3000": "1", "3000W": "1",
        "60": "2", "60H": "2",
        "200": "3", "HJ": "3", "LJ": "3", "PV": "3", "TJ": "3",
        "400": "4", "DT": "4", "HT": "4", "JT": "4", "OT": "4", "SP": "4", "WT": "4",
        "800": "6", "1500": "6", "5K": "6", "5KW": "6", "PEN": "6", "XC": "6"
    };

    const processed = [];
    source.competitors.forEach(athlete => {
        const base = {
            Bib: athlete.competitorId,
            "First Name": athlete.firstName,
            "Last Name": athlete.lastName,
            "Age Group": athlete.ageGroup,
            Gender: athlete.gender,
            "Team Name": athlete.teamName
        };

        if (!athlete.eventsEntered || athlete.eventsEntered.length === 0) {
            processed.push({ ...base, Event: "-", When: "-", QP: "-", RESULT: "-" });
        } else {
            athlete.eventsEntered.forEach(event => {
                let dayNum = eventToDay[event.eventCode] || "1";
                let exactTime = "";
                let scheduledDateStr = dateMapping[dayNum] || "-";

                // Try to find exact time from the generated schedule
                if (typeof emacs2026Schedule !== 'undefined' && emacs2026Schedule.length > 0) {
                    let match = emacs2026Schedule.find(s =>
                        s.eventCode === event.eventCode &&
                        s.gender === athlete.gender &&
                        s.ageGroup === athlete.ageGroup
                    );

                    // Fallback: If no exact match, look for a "plus" category that covers this athlete
                    // This handles cases where the schedule expansion might have missed an extreme age
                    if (!match) {
                        const athleteAge = parseInt(String(athlete.ageGroup).replace(/\D/g, ''));
                        // Find all potential fallback matches for this event and gender
                        const potentialFallbacks = emacs2026Schedule.filter(s =>
                            s.eventCode === event.eventCode &&
                            s.gender === athlete.gender &&
                            s.desc.includes('+')
                        );

                        if (potentialFallbacks.length > 0) {
                            // Find the highest "plus" category that is still <= athlete's age
                            // e.g. If athlete is 85 and we have 70+ and 80+, pick 80+
                            let bestFallback = null;
                            let maxBaseAge = -1;

                            potentialFallbacks.forEach(s => {
                                const matchPlus = s.desc.match(/(\d{2})\+/);
                                if (matchPlus) {
                                    const baseAge = parseInt(matchPlus[1]);
                                    if (athleteAge >= baseAge && baseAge > maxBaseAge) {
                                        maxBaseAge = baseAge;
                                        bestFallback = s;
                                    }
                                }
                            });

                            if (bestFallback) match = bestFallback;
                        }
                    }

                    if (match) {
                        dayNum = String(match.day);
                        exactTime = match.time;
                        scheduledDateStr = dateMapping[dayNum] || "-";
                    }
                }

                let whenStr = scheduledDateStr;
                if (exactTime) {
                    whenStr += ` at ${exactTime}`;
                }

                processed.push({
                    ...base,
                    Event: event.eventCode,
                    When: whenStr,
                    QP: event.qp || "-",
                    RESULT: "-"
                });
            });
        }
    });
    return processed;
}

function initializeFilters(data) {
    const filterContainer = document.querySelector('.filter-controls');
    if (!filterContainer) return;

    filterContainer.innerHTML = '';

    if (data.length === 0) return;

    const thead = document.querySelector('#report-table thead');
    const displayColumns = ["Bib", "Last Name", "First Name", "Age Group", "Gender", "Event", "When", "Team Name", "QP", "RESULT"];

    // Set up compact table headers
    thead.innerHTML = `<tr>
        ${displayColumns.map(col => `
            <th class="th-${col.toLowerCase().replace(/\s+/g, '-')}">
                <div class="sort-target" data-column="${col}">
                    <span>${col} <span class="sort-icon" data-icon-column="${col}">↕</span></span>
                </div>
            </th>
        `).join('')}
        <th class="th-profile">Profile</th>
    </tr>`;

    // Populate the filter bar
    filterContainer.innerHTML = FILTER_COLUMNS.map(col => `
        <div class="filter-group">
            <select data-filter-column="${col}" class="column-filter">
                <option value="">All ${col}s</option>
            </select>
        </div>
    `).join('');

    // Add sort listeners
    thead.querySelectorAll('.sort-target').forEach(div => {
        div.addEventListener('click', () => {
            handleSort(div.dataset.column);
        });
    });

    // Add filter listeners
    filterContainer.querySelectorAll('.column-filter').forEach(select => {
        select.addEventListener('change', (e) => {
            updateFilter(e.target.dataset.filterColumn, e.target.value);
        });
    });

    updateFilterOptions();
}

function updateFilterOptions() {
    FILTER_COLUMNS.forEach(col => {
        const select = document.querySelector(`select[data-filter-column="${col}"]`);
        if (!select) return;
        const currentValue = activeFilters[col] || "";

        // Filters options for column X should be limited by ALL OTHER filters
        const otherFilters = { ...activeFilters };
        delete otherFilters[col];

        const filteredSubset = allData.filter(item => {
            return Object.keys(otherFilters).every(key => String(item[key]) === otherFilters[key]);
        });

        const availableValues = [...new Set(filteredSubset.map(item => item[col]))].sort();

        // Rebuild options
        const optionsHTML = [`<option value="">All ${col}s (${availableValues.length})</option>`];
        availableValues.forEach(val => {
            const selected = String(val) === currentValue ? 'selected' : '';
            optionsHTML.push(`<option value="${val}" ${selected}>${val}</option>`);
        });

        select.innerHTML = optionsHTML.join('');
    });
}

function applyFilters(data) {
    return data.filter(item => {
        return Object.keys(activeFilters).every(col => {
            if (!activeFilters[col]) return true;
            return String(item[col]) === activeFilters[col];
        });
    });
}

function renderTable(data) {
    const tbody = document.querySelector('#report-table tbody');
    const thead = document.querySelector('#report-table thead');
    const displayColumns = ["Bib", "Last Name", "First Name", "Age Group", "Gender", "Event", "When", "Team Name", "QP", "RESULT"];

    // Update sort icons without rewriting thead, which would destroy select focus
    displayColumns.forEach(col => {
        const iconSpan = document.querySelector(`.sort-icon[data-icon-column="${col}"]`);
        if (iconSpan) {
            if (currentSort.column !== col) {
                iconSpan.innerHTML = '↕';
                iconSpan.classList.remove('active');
            } else {
                iconSpan.innerHTML = currentSort.direction === 'asc' ? '↑' : '↓';
                iconSpan.classList.add('active');
            }
        }
    });

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${displayColumns.length + 1}" style="text-align:center; color: var(--text-secondary);">No results found.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.slice(0, 1000).map(item => {
        const searchName = encodeURIComponent(`${item["First Name"]} ${item["Last Name"]}`);
        const searchUrl = `https://www.mastersrankings.com/athlete-search/?x8=${searchName}`;

        return `
            <tr>
                ${displayColumns.map(col => {
            const cellClass = `td-${col.toLowerCase().replace(/\s+/g, '-')}`;
            return `<td class="${cellClass}">${item[col] || '-'}</td>`;
        }).join('')}
                <td class="td-profile">
                    <a href="${searchUrl}" target="_blank" title="Rankings" class="btn-profile">
                        View
                    </a>
                </td>
            </tr>
        `;
    }).join('');

    if (data.length > 1000) {
        tbody.innerHTML += `<tr><td colspan="${displayColumns.length + 1}" style="text-align:center; padding: 1rem; color: var(--text-secondary);">Showing first 1000 of ${data.length} results. Use filters to narrow down.</td></tr>`;
    }
}



function handleSort(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }

    const filteredData = applyFilters(allData);
    const sortedData = sortData(filteredData, currentSort.column, currentSort.direction);
    renderTable(sortedData);
}

function sortData(data, column, direction) {
    const dateScore = {
        "Fri, 27 Mar": 10000,
        "Sat, 28 Mar": 20000,
        "Sun, 29 Mar": 30000,
        "Mon, 30 Mar": 40000,
        "Tue, 31 Mar": 50000,
        "Wed, 01 Apr": 60000,
        "Thu, 02 Apr": 70000
    };

    function parseWhenScore(whenStr) {
        if (!whenStr || whenStr === '-') return 999999;
        const parts = whenStr.split(' at ');
        const datePart = parts[0];
        const timePart = parts[1];

        let score = dateScore[datePart] || 99000;

        if (timePart) {
            const timeParts = timePart.split(':');
            if (timeParts.length === 2) {
                score += (parseInt(timeParts[0]) * 60) + parseInt(timeParts[1]);
            }
        }
        return score;
    }

    return [...data].sort((a, b) => {
        // Primary sort
        let res = compare(a, b, column, direction);

        // Secondary sort: if primary is equal, sort by Last Name (always asc for secondary conventionally)
        if (res === 0 && column !== 'Last Name') {
            res = compare(a, b, 'Last Name', 'asc');
        }

        return res;
    });

    function compare(a, b, col, dir) {
        let valA = a[col];
        let valB = b[col];

        if (col === 'Bib') {
            valA = parseInt(valA) || 0;
            valB = parseInt(valB) || 0;
        } else if (col === 'When') {
            valA = parseWhenScore(valA);
            valB = parseWhenScore(valB);
        } else {
            valA = String(valA).toLowerCase();
            valB = String(valB).toLowerCase();
        }

        if (valA < valB) return dir === 'asc' ? -1 : 1;
        if (valA > valB) return dir === 'asc' ? 1 : -1;
        return 0;
    }
}

function updateFilter(column, value) {
    if (value) {
        activeFilters[column] = value;
    } else {
        delete activeFilters[column];
    }

    // Update dropdown options
    updateFilterOptions();

    const filtered = applyFilters(allData);
    const finalData = currentSort.column ? sortData(filtered, currentSort.column, currentSort.direction) : filtered;
    renderTable(finalData);
}
