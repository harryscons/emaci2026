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
let currentSort = { column: null, direction: 'asc' };
const FILTER_COLUMNS = ["Bib", "First Name", "Last Name", "Age Group", "Gender", "Code", "Team Name", "QP"];

async function loadReportData() {
    const splash = document.getElementById('splash-screen');
    const loaderBar = document.querySelector('.loader-bar');
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
        renderTable(allData);

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

    return source.competitors.flatMap(athlete => {
        const base = {
            Bib: athlete.competitorId,
            "First Name": athlete.firstName,
            "Last Name": athlete.lastName,
            "Age Group": athlete.ageGroup,
            Gender: athlete.gender,
            "Team Name": athlete.teamName
        };

        if (!athlete.eventsEntered || athlete.eventsEntered.length === 0) {
            return [{ ...base, Code: "-", QP: "-" }];
        }

        return athlete.eventsEntered.map(event => ({
            ...base,
            Code: event.eventCode,
            QP: event.qp || "-"
        }));
    });
}

function initializeFilters(data) {
    const filterContainer = document.querySelector('.filter-controls');
    filterContainer.innerHTML = '';
    if (data.length === 0) return;

    FILTER_COLUMNS.forEach(col => {
        const wrapper = document.createElement('div');
        wrapper.className = 'filter-group';
        wrapper.dataset.column = col;
        wrapper.innerHTML = `
            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.75rem; color: var(--text-secondary);">${col}</label>
            <select data-column="${col}">
                <option value="">All</option>
            </select>
        `;

        wrapper.querySelector('select').addEventListener('change', (e) => {
            updateFilter(e.target.dataset.column, e.target.value);
        });

        filterContainer.appendChild(wrapper);
    });

    updateFilterOptions();
}

function updateFilterOptions() {
    FILTER_COLUMNS.forEach(col => {
        const select = document.querySelector(`select[data-column="${col}"]`);
        const currentValue = activeFilters[col] || "";

        // Filters options for column X should be limited by ALL OTHER filters
        const otherFilters = { ...activeFilters };
        delete otherFilters[col];

        const filteredSubset = allData.filter(item => {
            return Object.keys(otherFilters).every(key => String(item[key]) === otherFilters[key]);
        });

        const availableValues = [...new Set(filteredSubset.map(item => item[col]))].sort();

        // Rebuild options
        const optionsHTML = [`<option value="">All (${availableValues.length})</option>`];
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
    const displayColumns = ["Bib", "First Name", "Last Name", "Age Group", "Gender", "Code", "Team Name", "QP"];

    thead.innerHTML = `<tr>
        ${displayColumns.map(col => `
            <th data-column="${col}" style="cursor: pointer; user-select: none;">
                ${col} ${getSortIcon(col)}
            </th>
        `).join('')}
        <th>Profile</th>
    </tr>`;

    thead.querySelectorAll('th[data-column]').forEach(th => {
        th.addEventListener('click', () => handleSort(th.dataset.column));
    });

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${displayColumns.length + 1}" style="text-align:center; color: var(--text-secondary);">No results found.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(item => {
        const searchName = encodeURIComponent(`${item["First Name"]} ${item["Last Name"]}`);
        const searchUrl = `https://www.mastersrankings.com/athlete-search/?unm=${searchName}`;

        return `
            <tr>
                ${displayColumns.map(col => `<td>${item[col] || '-'}</td>`).join('')}
                <td style="text-align: center;">
                    <a href="${searchUrl}" target="_blank" title="Search Athlete on World Masters Rankings" class="profile-link">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2 2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </a>
                </td>
            </tr>
        `;
    }).join('');
}

function getSortIcon(column) {
    if (currentSort.column !== column) return '<span style="opacity: 0.2">↕</span>';
    return currentSort.direction === 'asc' ? '↑' : '↓';
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
    return [...data].sort((a, b) => {
        let valA = a[column];
        let valB = b[column];

        if (column === 'Bib') {
            valA = parseInt(valA) || 0;
            valB = parseInt(valB) || 0;
        } else {
            valA = String(valA).toLowerCase();
            valB = String(valB).toLowerCase();
        }

        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
    });
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
