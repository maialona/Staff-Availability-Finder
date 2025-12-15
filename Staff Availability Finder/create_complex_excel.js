import * as XLSX from 'xlsx';

// Simulating "Complex External Format" where valid Time is NOT the first 'Time' column
const complexData = [
    { 
        "服務項目": "居家服務",
        "核定服務時間": 1.5,  // Should be ignored
        "服務時間起迄": "09:30~11:00", // Should be picked
        "照服員姓名": "ComplexUser",
        "服務日期": "2023-12-05" 
    }
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(complexData);

XLSX.utils.book_append_sheet(wb, ws, "Complex Data");

XLSX.writeFile(wb, "test_complex_data.xlsx");
console.log("Created test_complex_data.xlsx");
