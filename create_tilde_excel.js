import * as XLSX from 'xlsx';

// Simulating data with Full-Width Tilde (common in CJK input)
const tildeData = [
    { 
        "服務日期": "2023-12-06", 
        "服務時間": "09:00～10:30", // Full-width tilde
        "服務人員": "TildeUser" 
    },
    { 
        "服務日期": "2023-12-06", 
        "服務時間": "13:00~14:00", // Standard tilde check
        "服務人員": "TildeUser" 
    }
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(tildeData);

XLSX.utils.book_append_sheet(wb, ws, "Tilde Data");

XLSX.writeFile(wb, "test_tilde_data.xlsx");
console.log("Created test_tilde_data.xlsx");
