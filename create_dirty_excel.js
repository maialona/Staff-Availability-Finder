import * as XLSX from 'xlsx';

// Simulating widely varied time formats
const dirtyData = [
    { 
        "服務日期": "2023-12-07", "服務時間": "09:00 - 10:30", "服務人員": "UserSpace" // Dash with space
    },
    { 
        "服務日期": "2023-12-07", "服務時間": "11:00～ 12:00", "服務人員": "UserFullWidthSpace" // Full width tilde with space
    },
    { 
        "服務日期": "2023-12-07", "服務時間": "Start 13:00 End 14:00", "服務人員": "UserText" // Text wrapper
    },
    { 
        "服務日期": "2023-12-07", "服務時間": "15:00/16:00", "服務人員": "UserSlash" // Slash
    }
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(dirtyData);

XLSX.utils.book_append_sheet(wb, ws, "Dirty Data");

XLSX.writeFile(wb, "test_dirty_data.xlsx");
console.log("Created test_dirty_data.xlsx");
