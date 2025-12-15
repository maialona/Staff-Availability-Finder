import * as XLSX from 'xlsx';

const serviceData = [
    { "服務日期": "2023-12-15", "服務時間": "09:00~10:00", "服務人員": "王小明" },
    { "服務日期": "2023-12-15", "服務時間": "13:00~14:30", "服務人員": "王小明" },
    { "服務日期": "2023-12-15", "服務時間": "08:00~12:00", "服務人員": "李大華" }, // Busy all morning
];

const staffData = [
    { "員編": "A001", "姓名": "王小明" },
    { "員編": "A002", "姓名": "李大華" },
    { "員編": "A003", "姓名": "張小美" }, // Should be fully free
];

const wb = XLSX.utils.book_new();
const ws1 = XLSX.utils.json_to_sheet(serviceData);
const ws2 = XLSX.utils.json_to_sheet(staffData);

XLSX.utils.book_append_sheet(wb, ws1, "Service Records");
XLSX.utils.book_append_sheet(wb, ws2, "Staff List");

XLSX.writeFile(wb, "test_data.xlsx");
console.log("Created test_data.xlsx");
