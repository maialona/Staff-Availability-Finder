import * as XLSX from 'xlsx';

const serviceData = [
    { "服務日期": "2023-11-22", "服務時間": "09:00-10:00", "服務人員": "TestStaff" },  // Hyphen
    { "服務日期": "2023-11-22", "服務時間": "13:00~14:30", "服務人員": "TestStaff" },  // Tilde
];

const staffData = [
    { "員編": "T001", "姓名": "TestStaff" }
];

const wb = XLSX.utils.book_new();
const ws1 = XLSX.utils.json_to_sheet(serviceData);
const ws2 = XLSX.utils.json_to_sheet(staffData);

XLSX.utils.book_append_sheet(wb, ws1, "Service Records");
XLSX.utils.book_append_sheet(wb, ws2, "Staff List");

XLSX.writeFile(wb, "test_hyphen_data.xlsx");
console.log("Created test_hyphen_data.xlsx");
