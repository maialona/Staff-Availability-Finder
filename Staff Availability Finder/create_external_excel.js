import * as XLSX from 'xlsx';

// Simulating "External Format" with different headers
const externalData = [
    { "案號": "A123", "服務日期": "2023-12-01", "服務時間起迄": "08:00-10:00", "照服員姓名": "ExternalUser" },
    { "案號": "A124", "服務日期": "2023-12-01", "服務時間起迄": "14:00~16:00", "照服員姓名": "ExternalUser" },
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(externalData);

XLSX.utils.book_append_sheet(wb, ws, "External Data");

XLSX.writeFile(wb, "test_external_data.xlsx");
console.log("Created test_external_data.xlsx");
