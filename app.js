/**
 * ============================================================
 *  課表查詢系統 - 應用程式邏輯 (app.js)
 *  崙背國民中學
 * ============================================================
 */

/* ── 全域狀態 ─────────────────────────────────────────────── */

let scheduleData    = [];   // CSV 全部資料
let isLoggedIn      = false;
let navHistory      = [];   // 導航歷史 [{type, value}]
let classGroups     = {};   // 班級分類
let subjectTeachers = {};   // 科目 → 教師
let homeroomData    = {};   // 班級 → 導師

// 0 = 早自習，1～8 = 第1～8節
const PERIODS_ALL = [0, 1, 2, 3, 4, 5, 6, 7, 8];

const DAYS = ['一', '二', '三', '四', '五'];


/* ── DOM 參考 ─────────────────────────────────────────────── */

const loginView =
    document.getElementById('loginView');

const queryView =
    document.getElementById('queryView');

const resultView =
    document.getElementById('resultView');

const loadingOverlay =
    document.getElementById('loadingOverlay');

const scheduleTitle =
    document.getElementById('scheduleTitle');

const scheduleTableContainer =
    document.getElementById('scheduleTableContainer');


/* ═══════════════════════════════════════════════════════════
   視圖切換
═══════════════════════════════════════════════════════════ */

function showView(viewId) {

    [loginView, queryView, resultView].forEach(v => {

        if (!v) return;

        v.classList.remove('active', 'result-active');
        v.style.display = 'none';
    });

    const target = document.getElementById(viewId);

    if (!target) return;

    if (viewId === 'resultView') {

        target.classList.add('result-active');
        target.style.display = 'block';

    } else {

        target.classList.add('active');
        target.style.display = 'flex';
    }

    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}


function showQueryView() {

    navHistory = [];

    resetGradeSelects();

    showView('queryView');

    updateBackBtn();
}


function logout() {

    isLoggedIn   = false;
    scheduleData = [];
    classGroups  = {};
    subjectTeachers = {};
    homeroomData = {};
    navHistory   = [];

    const passwordEl =
        document.getElementById('loginPassword');

    const errorEl =
        document.getElementById('loginError');

    if (passwordEl) {
        passwordEl.value = '';
    }

    if (errorEl) {
        errorEl.textContent = '';
    }

    showView('loginView');
}


/* ═══════════════════════════════════════════════════════════
   導航歷史
═══════════════════════════════════════════════════════════ */

function pushNav(type, value) {

    navHistory.push({
        type: type,
        value: value
    });

    updateBackBtn();
}


function goBack() {

    if (navHistory.length <= 1) {

        showQueryView();

        return;
    }

    // 移除目前頁
    navHistory.pop();

    const prev =
        navHistory[navHistory.length - 1];

    // 移除上一頁，因為 displayXXX 會重新 push
    navHistory.pop();

    if (!prev) {

        showQueryView();

        return;
    }

    if (prev.type === 'class') {

        displayClassSchedule(prev.value);

    } else {

        displayTeacherSchedule(prev.value);
    }
}


function updateBackBtn() {

    const btn =
        document.getElementById('backBtn');

    if (!btn) return;

    btn.style.visibility =
        navHistory.length > 1
            ? 'visible'
            : 'hidden';
}


/* ═══════════════════════════════════════════════════════════
   學期下拉選單初始化
═══════════════════════════════════════════════════════════ */

function populateSemesterSelect() {

    const sel =
        document.getElementById('semesterSelect');

    if (!sel) return;

    if (typeof CONFIG === 'undefined' ||
        !CONFIG.SEMESTERS) {
        return;
    }

    // 避免重複加入
    sel.innerHTML = '';

    const keys =
        Object.keys(CONFIG.SEMESTERS);

    keys.forEach((label, i) => {

        const opt =
            document.createElement('option');

        opt.value = label;
        opt.textContent = label;

        // 最後一個學期預設選取
        if (i === keys.length - 1) {
            opt.selected = true;
        }

        sel.appendChild(opt);
    });
}


/* ═══════════════════════════════════════════════════════════
   登入
═══════════════════════════════════════════════════════════ */

function setupLoginForm() {

    const loginForm =
        document.getElementById('loginForm');

    if (!loginForm) return;

    loginForm.addEventListener(
        'submit',
        async function (e) {

            e.preventDefault();

            const usernameEl =
                document.getElementById('loginUsername');

            const passwordEl =
                document.getElementById('loginPassword');

            const errEl =
                document.getElementById('loginError');

            const btn =
                document.getElementById('loginBtn');

            const spinner =
                document.getElementById('loginSpinner');

            const username =
                usernameEl?.value.trim() || '';

            const password =
                passwordEl?.value || '';

            if (errEl) {
                errEl.textContent = '';
            }

            if (typeof CONFIG === 'undefined') {

                if (errEl) {
                    errEl.textContent =
                        '系統設定載入失敗，請確認 config.js。';
                }

                return;
            }

            if (
                username === CONFIG.USERNAME &&
                password === CONFIG.PASSWORD
            ) {

                if (btn) {
                    btn.disabled = true;
                }

                if (spinner) {
                    spinner.classList.add('show');
                }

                const semLabel =
                    document.getElementById(
                        'semesterSelect'
                    )?.value || '';

                await fetchAndParseCSV(semLabel);

                if (btn) {
                    btn.disabled = false;
                }

                if (spinner) {
                    spinner.classList.remove('show');
                }

            } else {

                if (errEl) {
                    errEl.textContent =
                        '帳號或密碼錯誤，請再試一次';
                }
            }
        }
    );
}


/* ═══════════════════════════════════════════════════════════
   CSV 載入與解析
═══════════════════════════════════════════════════════════ */

async function fetchAndParseCSV(semLabel) {

    if (loadingOverlay) {
        loadingOverlay.classList.add('show');
    }

    // 預設 CSV
    let csvUrl = '/timetable_s2.csv';

    if (
        typeof CONFIG !== 'undefined' &&
        CONFIG.SEMESTERS &&
        semLabel &&
        CONFIG.SEMESTERS[semLabel]
    ) {
        csvUrl = CONFIG.SEMESTERS[semLabel];
    }

    try {

        /* ── 載入 CSV ── */

        const response =
            await fetch(csvUrl, {
                cache: 'no-cache'
            });

        if (!response.ok) {

            throw new Error(
                `HTTP 錯誤 ${response.status}`
            );
        }

        const csvText =
            await response.text();


        /* ── 載入對應 homerooms JSON ── */

        const jsonUrl =
            csvUrl
                .replace(
                    'timetable_',
                    'homerooms_'
                )
                .replace(
                    '.csv',
                    '.json'
                );

        try {

            const hmRes =
                await fetch(jsonUrl, {
                    cache: 'no-cache'
                });

            if (hmRes.ok) {

                homeroomData =
                    await hmRes.json();

            } else {

                homeroomData = {};
            }

        } catch (e) {

            console.warn(
                'homerooms JSON 載入失敗：',
                e
            );

            homeroomData = {};
        }


        /* ── 解析 CSV ── */

        const parsed =
            parseCSV(csvText);

        if (parsed.length === 0) {

            throw new Error(
                'CSV 資料為空'
            );
        }

        scheduleData = parsed;


        /* ── 建立分類 ── */

        buildCategories();


        /* ── 建立查詢 UI ── */

        populateQueryUI();


        isLoggedIn = true;


        /* ── 顯示目前學期 ── */

        const badge =
            document.getElementById(
                'currentSemester'
            );

        if (badge) {

            badge.textContent =
                semLabel || '';
        }


        if (loadingOverlay) {
            loadingOverlay.classList.remove('show');
        }

        showView('queryView');

    } catch (err) {

        if (loadingOverlay) {
            loadingOverlay.classList.remove('show');
        }

        console.error(err);

        const errorEl =
            document.getElementById(
                'loginError'
            );

        if (errorEl) {

            errorEl.textContent =
                `載入失敗：${err.message}。` +
                `請確認 CSV 與 JSON 資料檔是否存在。`;
        }
    }
}


/* ═══════════════════════════════════════════════════════════
   CSV 解析
═══════════════════════════════════════════════════════════ */

function splitCSVLine(line) {

    const result = [];

    let cur = '';
    let inQ = false;

    for (let i = 0; i < line.length; i++) {

        const c = line[i];

        // CSV 中兩個 "" 代表一個 "
        if (c === '"') {

            if (
                inQ &&
                line[i + 1] === '"'
            ) {

                cur += '"';
                i++;

            } else {

                inQ = !inQ;
            }

        } else if (
            c === ',' &&
            !inQ
        ) {

            result.push(cur);
            cur = '';

        } else {

            cur += c;
        }
    }

    result.push(cur);

    return result;
}


function parseCSV(text) {

    const lines =
        text
            .replace(/\r/g, '')
            .split('\n')
            .filter(
                line => line.trim()
            );

    if (lines.length === 0) {
        return [];
    }

    const headers =
        splitCSVLine(lines[0])
            .map(h => h.trim());


    return lines
        .slice(1)
        .map(line => {

            const vals =
                splitCSVLine(line);

            const obj = {};

            headers.forEach((h, i) => {

                obj[h] =
                    (vals[i] || '').trim();
            });

            return obj;
        })
        .filter(row => row.teachername);
}


/* ═══════════════════════════════════════════════════════════
   建立分類資料
═══════════════════════════════════════════════════════════ */

function buildCategories() {

    /* ── 班級分類 ── */

    const allClasses =
        new Set();


    scheduleData.forEach(row => {

        for (let d = 1; d <= 5; d++) {

            for (const p of PERIODS_ALL) {

                const classStr =
                    row[`c${d}${p}`];

                if (!classStr) {
                    continue;
                }

                classStr
                    .split(/\s+/)
                    .forEach(cls => {

                        if (cls) {
                            allClasses.add(cls);
                        }
                    });
            }
        }
    });


    classGroups = {

        '七年級': [],
        '八年級': [],
        '九年級': [],
        '特殊班': []
    };


    [...allClasses]
        .sort()
        .forEach(cls => {

            if (/^7\d+$/.test(cls)) {

                classGroups['七年級']
                    .push(cls);

            } else if (/^8\d+$/.test(cls)) {

                classGroups['八年級']
                    .push(cls);

            } else if (/^9\d+$/.test(cls)) {

                classGroups['九年級']
                    .push(cls);

            } else {

                classGroups['特殊班']
                    .push(cls);
            }
        });


    ['七年級', '八年級', '九年級']
        .forEach(g => {

            classGroups[g].sort(
                (a, b) =>
                    parseInt(a) -
                    parseInt(b)
            );
        });


    classGroups['特殊班'].sort();


    /* ── 科目 → 教師分類 ── */

    subjectTeachers = {};


    scheduleData.forEach(row => {

        for (let d = 1; d <= 5; d++) {

            for (const p of PERIODS_ALL) {

                const subj =
                    row[`s${d}${p}`];

                if (!subj) {
                    continue;
                }

                const base =
                    normalizeSubject(subj);

                if (!subjectTeachers[base]) {

                    subjectTeachers[base] =
                        new Set();
                }

                subjectTeachers[base]
                    .add(row.teachername);
            }
        }
    });


    Object.keys(subjectTeachers)
        .forEach(k => {

            subjectTeachers[k] =
                [...subjectTeachers[k]]
                    .sort();
        });
}


/* ═══════════════════════════════════════════════════════════
   科目名稱整理
═══════════════════════════════════════════════════════════ */

function normalizeSubject(subj) {

    return subj
        .replace(/輔導$/, '')
        .replace(/加強$/, '')
        .trim() || subj;
}


/* ═══════════════════════════════════════════════════════════
   取得所有教師
═══════════════════════════════════════════════════════════ */

function getAllTeachers() {

    const teachers =
        new Set();

    scheduleData.forEach(row => {

        const name =
            (row.teachername || '').trim();

        if (name) {
            teachers.add(name);
        }
    });

    return [...teachers].sort(
        (a, b) =>
            a.localeCompare(
                b,
                'zh-Hant'
            )
    );
}


/* ═══════════════════════════════════════════════════════════
   填充查詢 UI
═══════════════════════════════════════════════════════════ */

function populateQueryUI() {

    populateGradeSelect(
        'sel7',
        classGroups['七年級']
    );

    populateGradeSelect(
        'sel8',
        classGroups['八年級']
    );

    populateGradeSelect(
        'sel9',
        classGroups['九年級']
    );

    populateGradeSelect(
        'selSp',
        classGroups['特殊班']
    );


    /* ── 科目選單 ── */

    const subjectSel =
        document.getElementById(
            'subjectSelect'
        );

    if (subjectSel) {

        subjectSel.innerHTML =
            '<option value="">— 選擇科目 —</option>';

        Object.keys(subjectTeachers)
            .sort((a, b) =>
                a.localeCompare(
                    b,
                    'zh-Hant'
                )
            )
            .forEach(s => {

                const opt =
                    document.createElement(
                        'option'
                    );

                opt.value = s;
                opt.textContent = s;

                subjectSel.appendChild(opt);
            });
    }


    /* ── 教師搜尋 ── */

    setupTeacherSearch();
}


function populateGradeSelect(
    selId,
    classes
) {

    const sel =
        document.getElementById(selId);

    if (!sel) return;

    sel.innerHTML =
        '<option value="">— 選擇班級 —</option>';

    classes.forEach(cls => {

        const opt =
            document.createElement(
                'option'
            );

        opt.value = cls;
        opt.textContent = cls;

        sel.appendChild(opt);
    });
}


/* ═══════════════════════════════════════════════════════════
   教師姓名搜尋
═══════════════════════════════════════════════════════════ */

/**
 * 建立教師姓名搜尋介面。
 *
 * 如果 HTML 已經有：
 *
 * teacherSearch
 * teacherSearchBtn
 * teacherSearchResults
 *
 * 就直接使用。
 *
 * 如果沒有，會自動建立搜尋介面。
 */
function setupTeacherSearch() {

    let input =
        document.getElementById(
            'teacherSearch'
        );

    let button =
        document.getElementById(
            'teacherSearchBtn'
        );

    let results =
        document.getElementById(
            'teacherSearchResults'
        );


    /* ── 如果 HTML 沒有搜尋欄位，自動建立 ── */

    if (!input || !button || !results) {

        const panel =
            document.getElementById(
                'panelTeacher'
            );

        if (!panel) return;


        const oldBox =
            document.getElementById(
                'teacherSearchBox'
            );

        if (oldBox) {

            input =
                oldBox.querySelector(
                    '#teacherSearch'
                );

            button =
                oldBox.querySelector(
                    '#teacherSearchBtn'
                );

            results =
                oldBox.querySelector(
                    '#teacherSearchResults'
                );

        } else {

            const box =
                document.createElement(
                    'div'
                );

            box.id =
                'teacherSearchBox';

            box.className =
                'teacher-search-box';

            box.innerHTML = `
                <div class="teacher-search-title">
                    🔎 搜尋教師姓名
                </div>

                <div class="teacher-search-row">
                    <input
                        type="text"
                        id="teacherSearch"
                        placeholder="輸入教師姓名，例如：王、林、陳"
                        autocomplete="off"
                    >

                    <button
                        type="button"
                        id="teacherSearchBtn"
                    >
                        搜尋
                    </button>
                </div>

                <div
                    id="teacherSearchResults"
                    class="teacher-search-results"
                ></div>
            `;

            // 放在教師查詢面板最前面
            panel.insertBefore(
                box,
                panel.firstChild
            );


            input =
                document.getElementById(
                    'teacherSearch'
                );

            button =
                document.getElementById(
                    'teacherSearchBtn'
                );

            results =
                document.getElementById(
                    'teacherSearchResults'
                );
        }
    }


    if (!input || !button || !results) {
        return;
    }


    /* 避免重複綁定 */
    if (
        input.dataset.searchReady === '1'
    ) {
        return;
    }

    input.dataset.searchReady = '1';


    /* ── 搜尋按鈕 ── */

    button.addEventListener(
        'click',
        function () {

            searchTeacherByName();
        }
    );


    /* ── Enter 搜尋 ── */

    input.addEventListener(
        'keydown',
        function (e) {

            if (e.key === 'Enter') {

                e.preventDefault();

                searchTeacherByName();
            }
        }
    );


    /* ── 輸入時清除結果 ── */

    input.addEventListener(
        'input',
        function () {

            if (!input.value.trim()) {

                results.innerHTML = '';
            }
        }
    );
}


/**
 * 依教師姓名搜尋。
 *
 * 支援部分關鍵字：
 *
 * 王
 * 林
 * 王老師
 * 老師王
 */
function searchTeacherByName() {

    const input =
        document.getElementById(
            'teacherSearch'
        );

    const results =
        document.getElementById(
            'teacherSearchResults'
        );

    if (!input || !results) {
        return;
    }


    const keyword =
        input.value.trim();


    if (!keyword) {

        results.innerHTML =
            '<div class="teacher-search-hint">' +
            '請輸入教師姓名或部分姓名' +
            '</div>';

        return;
    }


    const teachers =
        getAllTeachers();


    const matched =
        teachers.filter(name =>
            name.includes(keyword)
        );


    if (matched.length === 0) {

        results.innerHTML =
            `<div class="teacher-search-empty">
                找不到「${escapeHtml(keyword)}」相關教師
             </div>`;

        return;
    }


    results.innerHTML = `
        <div class="teacher-search-count">
            找到 ${matched.length} 位教師
        </div>
    `;


    matched.forEach(name => {

        const btn =
            document.createElement(
                'button'
            );

        btn.type = 'button';

        btn.className =
            'teacher-search-result';

        btn.textContent =
            `👨‍🏫 ${name}`;

        btn.addEventListener(
            'click',
            function () {

                displayTeacherSchedule(name);
            }
        );

        results.appendChild(btn);
    });
}


/* ═══════════════════════════════════════════════════════════
   Tab 切換
═══════════════════════════════════════════════════════════ */

function switchTab(tab) {

    const tabClass =
        document.getElementById(
            'tabClass'
        );

    const tabTeacher =
        document.getElementById(
            'tabTeacher'
        );

    const panelClass =
        document.getElementById(
            'panelClass'
        );

    const panelTeacher =
        document.getElementById(
            'panelTeacher'
        );


    if (tabClass) {

        tabClass.classList.toggle(
            'active',
            tab === 'class'
        );
    }


    if (tabTeacher) {

        tabTeacher.classList.toggle(
            'active',
            tab === 'teacher'
        );
    }


    if (panelClass) {

        panelClass.classList.toggle(
            'hidden',
            tab !== 'class'
        );
    }


    if (panelTeacher) {

        panelTeacher.classList.toggle(
            'hidden',
            tab !== 'teacher'
        );
    }
}


/* ═══════════════════════════════════════════════════════════
   班級查詢
═══════════════════════════════════════════════════════════ */

function setupGradeSelects() {

    const gradeMap = {

        sel7:  ['sel8', 'sel9', 'selSp'],
        sel8:  ['sel7', 'sel9', 'selSp'],
        sel9:  ['sel7', 'sel8', 'selSp'],
        selSp: ['sel7', 'sel8', 'sel9']
    };


    Object.entries(gradeMap)
        .forEach(([id, others]) => {

            const el =
                document.getElementById(id);

            if (!el) return;


            el.addEventListener(
                'change',
                () => {

                    if (el.value) {

                        others.forEach(
                            oid => {

                                const oe =
                                    document.getElementById(
                                        oid
                                    );

                                if (oe) {
                                    oe.value = '';
                                }
                            }
                        );
                    }


                    const error =
                        document.getElementById(
                            'classError'
                        );

                    if (error) {
                        error.textContent = '';
                    }
                }
            );
        });
}


function resetGradeSelects() {

    [
        'sel7',
        'sel8',
        'sel9',
        'selSp'
    ].forEach(id => {

        const el =
            document.getElementById(id);

        if (el) {
            el.value = '';
        }
    });


    const ce =
        document.getElementById(
            'classError'
        );

    if (ce) {
        ce.textContent = '';
    }


    const te =
        document.getElementById(
            'teacherError'
        );

    if (te) {
        te.textContent = '';
    }
}


function submitClassQuery() {

    const cls =
        [
            'sel7',
            'sel8',
            'sel9',
            'selSp'
        ]
            .map(
                id =>
                    document
                        .getElementById(id)
                        ?.value
            )
            .find(v => v);


    if (!cls) {

        const error =
            document.getElementById(
                'classError'
            );

        if (error) {

            error.textContent =
                '請先選擇一個班級';
        }

        return;
    }


    navHistory = [];

    displayClassSchedule(cls);
}


/* ═══════════════════════════════════════════════════════════
   教師查詢
═══════════════════════════════════════════════════════════ */

function onSubjectChange() {

    const subjectSel =
        document.getElementById(
            'subjectSelect'
        );

    const teacherSel =
        document.getElementById(
            'teacherSelect'
        );

    if (!subjectSel || !teacherSel) {
        return;
    }


    const subj =
        subjectSel.value;


    teacherSel.innerHTML =
        '<option value="">— 選擇教師 —</option>';


    if (!subj) {
        return;
    }


    (subjectTeachers[subj] || [])
        .forEach(t => {

            const opt =
                document.createElement(
                    'option'
                );

            opt.value = t;
            opt.textContent = t;

            teacherSel.appendChild(opt);
        });


    const error =
        document.getElementById(
            'teacherError'
        );

    if (error) {
        error.textContent = '';
    }
}


function submitTeacherQuery() {

    const teacherSel =
        document.getElementById(
            'teacherSelect'
        );

    const teacher =
        teacherSel?.value || '';


    if (!teacher) {

        const error =
            document.getElementById(
                'teacherError'
            );

        if (error) {

            error.textContent =
                '請先選擇科目與教師';
        }

        return;
    }


    navHistory = [];

    displayTeacherSchedule(
        teacher
    );
}


/* ═══════════════════════════════════════════════════════════
   顯示班級課表
═══════════════════════════════════════════════════════════ */

function displayClassSchedule(className) {

    pushNav(
        'class',
        className
    );


    const cells = {};


    scheduleData.forEach(row => {

        for (let d = 1; d <= 5; d++) {

            for (const p of PERIODS_ALL) {

                const classes =
                    (row[`c${d}${p}`] || '')
                        .split(/\s+/)
                        .filter(x => x);


                if (
                    classes.includes(className) &&
                    row[`s${d}${p}`]
                ) {

                    const key =
                        `${d}-${p}`;


                    if (!cells[key]) {

                        cells[key] = {

                            subject:
                                row[`s${d}${p}`],

                            items:
                                [
                                    row.teachername
                                ]
                        };

                    } else {

                        if (
                            !cells[key]
                                .items
                                .includes(
                                    row.teachername
                                )
                        ) {

                            cells[key]
                                .items
                                .push(
                                    row.teachername
                                );
                        }
                    }
                }
            }
        }
    });


    /* ── 導師 ── */

    const hmTeacher =
        homeroomData[className] || '';


    const hmHtml =
        hmTeacher
            ? `
                <span
                    class="homeroom-label"
                >
                    （導師：
                    ${escapeHtml(hmTeacher)}
                    ）
                </span>
              `
            : '';


    if (scheduleTitle) {

        scheduleTitle.innerHTML =
            `${escapeHtml(className)} 班課表 ${hmHtml}`;
    }


    if (scheduleTableContainer) {

        scheduleTableContainer.innerHTML =
            buildScheduleTable(
                cells,
                'class'
            );
    }


    showView('resultView');

    updateBackBtn();
}


/* ═══════════════════════════════════════════════════════════
   顯示教師課表
═══════════════════════════════════════════════════════════ */

function displayTeacherSchedule(
    teacherName
) {

    pushNav(
        'teacher',
        teacherName
    );


    const cells = {};


    /*
     * 不使用 find()
     * 因為未來 CSV 如果同一位教師有多筆資料，
     * 可以全部合併。
     */

    const rows =
        scheduleData.filter(
            r =>
                r.teachername ===
                teacherName
        );


    rows.forEach(row => {

        for (let d = 1; d <= 5; d++) {

            for (const p of PERIODS_ALL) {

                const subject =
                    row[`s${d}${p}`];

                if (!subject) {
                    continue;
                }


                const key =
                    `${d}-${p}`;


                const classes =
                    (row[`c${d}${p}`] || '')
                        .split(/\s+/)
                        .filter(x => x);


                if (!cells[key]) {

                    cells[key] = {

                        subject:
                            subject,

                        items:
                            [...classes]
                    };

                } else {

                    /*
                     * 如果同一節出現不同科目，
                     * 保留原本資料。
                     */

                    if (
                        cells[key]
                            .subject !== subject
                    ) {

                        cells[key].subject +=
                            ` / ${subject}`;
                    }


                    classes.forEach(cls => {

                        if (
                            !cells[key]
                                .items
                                .includes(cls)
                        ) {

                            cells[key]
                                .items
                                .push(cls);
                        }
                    });
                }
            }
        }
    });


    if (scheduleTitle) {

        scheduleTitle.textContent =
            `${teacherName} 老師課表`;
    }


    if (scheduleTableContainer) {

        scheduleTableContainer.innerHTML =
            buildScheduleTable(
                cells,
                'teacher'
            );
    }


    showView('resultView');

    updateBackBtn();
}


/* ═══════════════════════════════════════════════════════════
   建構課表 HTML
═══════════════════════════════════════════════════════════ */

function buildScheduleTable(
    cells,
    mode
) {

    const periods =
        (
            typeof CONFIG !== 'undefined' &&
            CONFIG.PERIOD_TIMES
        )
            ? CONFIG.PERIOD_TIMES
            : [];


    const hasEarly =
        Object.keys(cells)
            .some(
                k =>
                    k.endsWith('-0')
            );


    let html =
        `
        <table class="schedule-table">
            <thead>
                <tr>
                    <th class="th-period">
                        節次
                    </th>
        `;


    DAYS.forEach(d => {

        html +=
            `<th>${d}</th>`;
    });


    html +=
        `
                </tr>
            </thead>
            <tbody>
        `;


    /* ── 早自習 ── */

    if (hasEarly) {

        const et =
            periods[0] ||
            {
                start: '07:40',
                end: '08:10'
            };


        html +=
            `
            <tr>
                <td class="td-period">
                    <div class="period-num">
                        早自習
                    </div>

                    <div class="period-time">
                        ${escapeHtml(et.start)}
                        <br>
                        ${escapeHtml(et.end)}
                    </div>
                </td>
            `;


        for (let d = 1; d <= 5; d++) {

            html +=
                renderCell(
                    cells[`${d}-0`],
                    mode
                );
        }


        html +=
            `</tr>`;
    }


    /* ── 第1～8節 ── */

    for (let p = 1; p <= 8; p++) {

        const pt =
            periods[p] ||
            {
                start: '',
                end: ''
            };


        html +=
            `
            <tr>
                <td class="td-period">

                    <div class="period-num">
                        第${p}節
                    </div>
            `;


        if (
            pt.start &&
            pt.start !== '——'
        ) {

            html +=
                `
                <div class="period-time">
                    ${escapeHtml(pt.start)}
                    <br>
                    ${escapeHtml(pt.end)}
                </div>
                `;
        }


        html +=
            `</td>`;


        for (let d = 1; d <= 5; d++) {

            html +=
                renderCell(
                    cells[`${d}-${p}`],
                    mode
                );
        }


        html +=
            `</tr>`;
    }


    html +=
        `
            </tbody>
        </table>
        `;


    return html;
}


/* ═══════════════════════════════════════════════════════════
   建構單一課表格子
═══════════════════════════════════════════════════════════ */

function renderCell(
    cell,
    mode
) {

    if (!cell) {

        return `
            <td class="td-empty"></td>
        `;
    }


    const itemsHtml =
        (cell.items || [])
            .map(item => {

                const safeItem =
                    escapeHtml(item);

                if (mode === 'class') {

                    return `
                        <div
                            class="cell-link"
                            data-teacher="${safeAttribute(item)}"
                            onclick="displayTeacherScheduleByElement(this)"
                        >
                            ${safeItem}
                        </div>
                    `;

                } else {

                    return `
                        <div
                            class="cell-link"
                            data-class="${safeAttribute(item)}"
                            onclick="displayClassScheduleByElement(this)"
                        >
                            ${safeItem}
                        </div>
                    `;
                }
            })
            .join(' ');


    return `
        <td class="td-cell">

            <div class="cell-subject">
                ${escapeHtml(cell.subject)}
            </div>

            <div class="cell-items-container">
                ${itemsHtml}
            </div>

        </td>
    `;
}


/* ═══════════════════════════════════════════════════════════
   課表點擊事件
═══════════════════════════════════════════════════════════ */

function displayTeacherScheduleByElement(
    element
) {

    const teacher =
        element?.dataset?.teacher || '';

    if (teacher) {

        displayTeacherSchedule(
            teacher
        );
    }
}


function displayClassScheduleByElement(
    element
) {

    const cls =
        element?.dataset?.class || '';

    if (cls) {

        displayClassSchedule(cls);
    }
}


/* ═══════════════════════════════════════════════════════════
   HTML 安全處理
═══════════════════════════════════════════════════════════ */

function escapeHtml(str) {

    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


function safeAttribute(str) {

    return escapeHtml(str);
}


/* ═══════════════════════════════════════════════════════════
   列印
═══════════════════════════════════════════════════════════ */

function printSchedule() {

    const title =
        scheduleTitle?.textContent || '課表';


    const tableHTML =
        scheduleTableContainer?.innerHTML || '';


    const semLabel =
        document
            .getElementById(
                'currentSemester'
            )
            ?.textContent || '';


    const win =
        window.open(
            '',
            '_blank',
            'width=1100,height=750'
        );


    if (!win) {

        alert(
            '無法開啟列印視窗，請允許瀏覽器的彈出式視窗。'
        );

        return;
    }


    win.document.write(`
<!DOCTYPE html>

<html lang="zh-TW">

<head>

<meta charset="UTF-8">

<title>
    ${escapeHtml(title)}
</title>

<style>

@page {
    size: A4 landscape;
    margin: 1cm;
}

body {
    font-family:
        'Noto Sans TC',
        'Microsoft JhengHei',
        sans-serif;

    font-size: 10pt;
}

h2 {
    text-align: center;
    margin-bottom: 4px;
    font-size: 14pt;
}

p.sem {
    text-align: center;
    font-size: 9pt;
    color: #555;
    margin: 0 0 8px;
}

table {
    width: 100%;
    border-collapse: collapse;
}

th,
td {
    border: 1px solid #999;
    padding: 4px 6px;
    text-align: center;
    vertical-align: middle;
}

th {
    background: #e8e8e8;
    font-weight: 600;
}

.td-period {
    background: #f5f5f5;
    width: 4rem;
}

.period-num {
    font-weight: 600;
    font-size: 9pt;
}

.period-time {
    font-size: 7.5pt;
    color: #555;
}

.cell-subject {
    font-weight: 500;
}

.cell-link {
    font-size: 8.5pt;
    color: #444;
}

.td-empty {
    background: #fafafa;
}

.homeroom-label {
    font-size: 1.1rem;
    color: #666;
    margin-left: 0.5rem;
    font-weight: 500;
}

</style>

</head>

<body>

<h2>
    ${escapeHtml(title)}
</h2>

<p class="sem">
    ${escapeHtml(semLabel)}
</p>

${tableHTML}

<script>

window.onload = function() {

    window.print();

    setTimeout(
        function() {
            window.close();
        },
        300
    );
};

<\/script>

</body>

</html>
    `);


    win.document.close();
}


/* ═══════════════════════════════════════════════════════════
   訪客登入
═══════════════════════════════════════════════════════════ */

async function guestLogin() {

    const errEl =
        document.getElementById(
            'loginError'
        );


    const btn =
        document.getElementById(
            'guestBtn'
        );


    if (errEl) {
        errEl.textContent = '';
    }


    if (btn) {
        btn.disabled = true;
    }


    const semLabel =
        document
            .getElementById(
                'semesterSelect'
            )
            ?.value || '';


    try {

        await fetchAndParseCSV(
            semLabel
        );

    } catch (err) {

        console.error(err);

        if (errEl) {

            errEl.textContent =
                '載入失敗，請確認資料檔是否存在。';
        }

    } finally {

        if (btn) {
            btn.disabled = false;
        }
    }
}


/* ═══════════════════════════════════════════════════════════
   初始化
═══════════════════════════════════════════════════════════ */

document.addEventListener(
    'DOMContentLoaded',
    () => {

        populateSemesterSelect();

        setupLoginForm();

        setupGradeSelects();

        updateBackBtn();

        showView('loginView');
    }
);
