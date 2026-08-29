/**
 * 崙背國民中學 115 學年度第 1 學期課表查詢系統設定
 */

const CONFIG = {
    SEMESTERS: {
        '115學年度第1學期': './timetable_115s1.csv',
    },

    USERNAME: 'teacher',
    PASSWORD: 'password123',

    SCHOOL_NAME: '崙背國民中學',
    SCHOOL_SUBTITLE: '國中部課表查詢系統',

    // 課表 PDF 中的實際節次時間
    PERIOD_TIMES: [
        { start: '——',   end: '——',   label: '早自習' },
        { start: '08:20', end: '09:05' },
        { start: '09:15', end: '10:00' },
        { start: '10:10', end: '10:55' },
        { start: '11:05', end: '11:50' },
        { start: '13:10', end: '13:55' },
        { start: '14:05', end: '14:50' },
        { start: '15:00', end: '15:45' },
        { start: '15:55', end: '16:40' },
        { start: '——',   end: '——' }
    ]
};
