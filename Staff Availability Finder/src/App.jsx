import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { format, parse, addMinutes, subMinutes, isWithinInterval, areIntervalsOverlapping, getHours, getMinutes, set, isValid } from 'date-fns';
import { Upload, Calendar, Clock, User, Users, FileSpreadsheet, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const Button = ({ className, variant = "default", size = "default", ...props }) => {
  const variants = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    link: "text-primary underline-offset-4 hover:underline",
  };
  const sizes = {
    default: "h-10 px-4 py-2",
    sm: "h-9 rounded-md px-3",
    lg: "h-11 rounded-md px-8",
    icon: "h-10 w-10",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
};

// Input Component
const Input = ({ className, ...props }) => {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
};

// Label Component
const Label = ({ className, ...props }) => (
  <label
    className={cn(
      "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className
    )}
    {...props}
  />
);

// Card Component
const Card = ({ className, ...props }) => (
  <div
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      className
    )}
    {...props}
  />
);

function App() {
  const [step, setStep] = useState('upload'); // 'upload' | 'dashboard'
  const [staffData, setStaffData] = useState([]); // Array of staff objects
  const [scheduleData, setScheduleData] = useState([]); // Raw schedule entries
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [bufferBuffer, setBufferBuffer] = useState(30);
  const [filterStartTime, setFilterStartTime] = useState('');
  const [filterEndTime, setFilterEndTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dataDateRange, setDataDateRange] = useState("");


  // Constants
  const START_OF_DAY = 7; // 07:00
  const END_OF_DAY = 22; // 22:00

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const workbook = XLSX.read(bstr, { type: 'binary', cellDates: true });

        // Parse Sheet 1: Service Records
        const sheet1Name = workbook.SheetNames[0]; // Assuming first sheet is records
        const sheet1 = workbook.Sheets[sheet1Name];
        const rawSchedule = XLSX.utils.sheet_to_json(sheet1);

        // Parse Sheet 2: Staff List
        let rawStaff = [];
        if (workbook.SheetNames.length > 1) {
            const sheet2Name = workbook.SheetNames[1]; // Assuming second sheet is staff
            const sheet2 = workbook.Sheets[sheet2Name];
            rawStaff = XLSX.utils.sheet_to_json(sheet2);
        }

        // Validate basic structure
        if (!rawSchedule || rawSchedule.length === 0) {
           throw new Error("找不到服務紀錄 (Sheet 1 is empty or invalid)");
        }

        // Normalize keys (trim whitespace)
        const normalizeKeys = (row) => {
            const newRow = {};
            Object.keys(row).forEach(k => {
                newRow[k.trim()] = row[k];
            });
            return newRow;
        };

        // --- Smart Column Detection ---
        const firstRow = normalizeKeys(rawSchedule[0]); // Use normalized first row for detection
        const keys = Object.keys(firstRow);
        
        const findKey = (keywords, exclude = []) => {
            return keys.find(k => 
                keywords.some(kw => k.includes(kw)) && 
                !exclude.some(ex => k.includes(ex))
            );
        };

        // Helper to check if a value looks like a time range (e.g. "09:00-12:00")
        const isTimeRangeValue = (val) => {
            if (typeof val !== 'string') return false;
            // Check for at least two time patterns
            const matches = val.match(/(\d{1,2}:\d{2})/g);
            return matches && matches.length >= 2;
        };

        const dateKey = findKey(['服務日期', '日期', 'Date']);
        
        // Staff Key Strategy:
        // Prioritize "Caregiver" (居服員/照服員) or "Service Person" (服務人員)
        // Avoid generic "Name" (姓名) if possible, as it often refers to the Client/Patient.
        const staffKey = 
            findKey(['居服員', '照服員', '服務人員', '服務員'], ['編號', 'ID']) ||
            findKey(['姓名', 'Staff', 'Name'], ['編號', 'ID', '家屬', '案主', '受照顧者']);

        // Smart Time Key Detection:
        // 1. Find ALL candidate keys containing '時間' or 'Time'
        // Add '排班' (Scheduled) to candidates
        const timeCandidates = keys.filter(k => 
            ['時間', 'Time', '起迄', '區間', '排班'].some(kw => k.includes(kw))
        );

        let timeKey = null;

        // 2. Inspect content to find the real range column
        // Check first 10 rows
        for (const candidate of timeCandidates) {
             const validRows = rawSchedule.slice(0, 10).filter(row => row[candidate]);
             const isRangeColumn = validRows.some(row => isTimeRangeValue(row[candidate]));
             if (isRangeColumn) {
                 timeKey = candidate;
                 // Prefer "Range/Start" keywords if multiple valid columns found? 
                 // Usually only one column contains the actual range string.
                 if (candidate.includes('起迄') || candidate.includes('區間')) break; 
                 break;
             }
        }
        
        // Fallback: Use previous keyword logic if data scan fails (empty file?)
        if (!timeKey) {
             timeKey = 
                findKey(['起迄', '起訖', '區間', 'Range', 'Start']) || 
                findKey(['服務時間', 'Time'], ['核定', '總', '數', 'Total', 'Count', 'Duration']) ||
                findKey(['時間'], ['核定', '總', '數']);
        }

        // Normalize entire schedule with trimmed keys
        const normalizedSchedule = rawSchedule.map(row => normalizeKeys(row));
        
        // Pass 2: Value-Based Time Column Confirmation
        // Check if the detected 'timeKey' actually contains time-like strings in the normalized data
        if (timeKey) {
             const sampleRows = normalizedSchedule.slice(0, 50).filter(r => r[timeKey]);
             const validCount = sampleRows.filter(r => isTimeRangeValue(r[timeKey])).length;
             // If fewer than 20% of rows have valid time in this column, it's probably wrong (e.g. just text notes)
             if (validCount < sampleRows.length * 0.2 && sampleRows.length > 5) {
                 console.warn(`Column ${timeKey} failed validation (${validCount}/${sampleRows.length}). Searching for better column...`);
                 
                 // Try to find a better column by scanning ALL columns
                 for (const k of keys) {
                     const checkRows = normalizedSchedule.slice(0, 50).filter(r => r[k]);
                     const checkCount = checkRows.filter(r => isTimeRangeValue(r[k])).length;
                     if (checkCount > checkRows.length * 0.5) { // If >50% look like time ranges
                         timeKey = k;
                         console.log(`Switched to better column: ${timeKey}`);
                         break;
                     }
                 }
             }
        }

        if (!dateKey || !timeKey || !staffKey) {
             throw new Error(`無法辨識檔案格式。找不到必要的欄位:\n
                日期 (Date): ${dateKey || '❌'}\n
                時間 (Time): ${timeKey || '❌'}\n
                人員 (Staff): ${staffKey || '❌'}`);
        }



        // Create Standardized Schedule with internal keys
        const formattedSchedule = normalizedSchedule.map(row => ({
            '服務日期': row[dateKey],
            '服務時間': row[timeKey],
            '服務人員': row[staffKey],
            ...row // keep other data for debugging
        }));
        
        const scheduleToUse = formattedSchedule;
        



        // Calculate available date range for hint
        const dates = scheduleToUse
            .map(r => r['服務日期'])
            .filter(d => d)
            .map(d => {
                try {
                    if (d instanceof Date) return d;
                    return new Date(d);
                } catch { return null; }
            })
            .filter(d => isValid(d));
        
        let dateHint = "";
        if (dates.length > 0) {
            const minDate = new Date(Math.min(...dates));
            const maxDate = new Date(Math.max(...dates));
            dateHint = `${format(minDate, 'yyyy-MM-dd')} ~ ${format(maxDate, 'yyyy-MM-dd')}`;
        }

        // Process Staff List
        // If Sheet 2 exists, use it. Otherwise, extract unique names from Sheet 1
        let uniqueStaff = [];
        if (rawStaff.length > 0) {
            // Sheet 2 mapping (Staff List)
            const sRow = rawStaff[0];
            const sKeys = Object.keys(sRow);
            const sNameKey = sKeys.find(k => ['姓名', 'Name', '服務員', '照服員'].some(kw => k.includes(kw))) || '姓名';
            const sIdKey = sKeys.find(k => ['員編', 'ID', '編號'].some(kw => k.includes(kw))) || '員編';

            uniqueStaff = rawStaff.map(s => ({
                id: s[sIdKey] || 'Unknown',
                name: s[sNameKey] || 'Unknown Name'
            })).filter(s => s.name !== 'Unknown Name');
        } else {
             const names = new Set(scheduleToUse.map(row => row['服務人員']).filter(Boolean));
             uniqueStaff = Array.from(names).map((name, idx) => ({ id: `GEN-${idx}`, name }));
        }
        
        setStaffData(uniqueStaff);
        setScheduleData(scheduleToUse);
        setDataDateRange(dateHint);
        setStep('dashboard'); // Transition to dashboard
        
        // Auto-switch to the first detected date if available
        if (dates.length > 0) {
             const minDate = new Date(Math.min(...dates));
             setSelectedDate(format(minDate, 'yyyy-MM-dd'));
        }

      } catch (err) {
        console.error(err);
        setError("解析檔案失敗: " + err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  // Logic: Calculate Availability for Selected Date
  const processedAvailability = useMemo(() => {
    if (!selectedDate || !scheduleData) return [];

    try {
        // Filter schedule for selected date
        // Date parsing from Excel can be tricky (some are serial numbers, some strings)
        const dailyRecords = scheduleData.filter(record => {
            let recDate = record['服務日期'];
            if (!recDate) return false;
            
            // Handle Excel Date Object
            if (recDate instanceof Date) {
                 return format(recDate, 'yyyy-MM-dd') === selectedDate;
            }
            // Handle String "2023/10/01" or "2023-10-01"
            try {
                // Attempt simple string match first
                if (typeof recDate === 'string' && (recDate.includes(selectedDate) || recDate === selectedDate)) return true;
                 // Try parsing
                 const parsed = new Date(recDate);
                 if (!isNaN(parsed)) {
                     return format(parsed, 'yyyy-MM-dd') === selectedDate;
                 }
            } catch(e) {}
            return false;
        });

        // Map each staff to their timeline
        return staffData.map(staff => {
            const staffRecords = dailyRecords.filter(r => r['服務人員'] === staff.name);
            
            // Parse Busy Times
            let busyIntervals = [];
            staffRecords.forEach(record => {
                const timeRange = record['服務時間']; // "HH:MM~HH:MM"
                if (!timeRange || typeof timeRange !== 'string') return;
                
                // Robust extraction: Find any two time strings "HH:MM"
                const matches = timeRange.match(/(\d{1,2}:\d{2})/g);
                if (!matches || matches.length < 2) return;

                const startStr = matches[0];
                const endStr = matches[1];

                // Construct Date objects for calculation
                // Base is selectedDate 00:00
                const dayStart = new Date(selectedDate);
                
                const parseTime = (str) => {
                    const [h, m] = str.trim().split(':').map(Number);
                    const d = new Date(dayStart);
                    d.setHours(h, m, 0, 0);
                    return d;
                };

                const startTime = parseTime(startStr);
                const endTime = parseTime(endStr);

                if (isValid(startTime) && isValid(endTime)) {
                     busyIntervals.push({ start: startTime, end: endTime });
                }
            });

            // Add Buffer
            // We do this by creating a "Buffered Interval" for each busy interval
            // Then we merge overlapping buffered intervals to get the "Unavailable Blocks"
            
            // 1. Raw Busy + Buffer
            const rawBlocked = busyIntervals.map(interval => ({
                start: subMinutes(interval.start, bufferBuffer),
                end: addMinutes(interval.end, bufferBuffer),
                type: 'buffered_busy',
                originalStart: interval.start,
                originalEnd: interval.end
            }));

            // 2. Merge overlapping
            // Sort by start time
            rawBlocked.sort((a, b) => a.start - b.start);

            const mergedBlocked = [];
            if (rawBlocked.length > 0) {
                let current = rawBlocked[0];
                for (let i = 1; i < rawBlocked.length; i++) {
                    const next = rawBlocked[i];
                    if (current.end >= next.start) {
                        current.end = new Date(Math.max(current.end, next.end));
                        // Keep track of the 'core' busy times? 
                        // For simply finding free time, we just need the massive block.
                        // For visualization, we might want to distinguish.
                    } else {
                        mergedBlocked.push(current);
                        current = next;
                    }
                }
                mergedBlocked.push(current);
            }

            // Definition of "Day Range": 08:00 to 18:00
            const dayStartBoundary = new Date(selectedDate);
            dayStartBoundary.setHours(START_OF_DAY, 0, 0, 0);
            
            const dayEndBoundary = new Date(selectedDate);
            dayEndBoundary.setHours(END_OF_DAY, 0, 0, 0);

            // Find Free Blocks
            const freeIntervals = [];
            let cursor = dayStartBoundary;

            mergedBlocked.forEach(block => {
                // Gap between cursor and block start
                if (block.start > cursor) {
                    // Ensure we don't go beyond day end
                    const actualEnd = new Date(Math.min(block.start, dayEndBoundary));
                    if (actualEnd > cursor) {
                        freeIntervals.push({ start: new Date(cursor), end: actualEnd });
                    }
                }
                // Move cursor to block end
                cursor = new Date(Math.max(cursor, block.end));
            });

            // Final gap after last block
            if (cursor < dayEndBoundary) {
                freeIntervals.push({ start: new Date(cursor), end: dayEndBoundary });
            }

            return {
                staff,
                busyRaw: busyIntervals,
                blocked: mergedBlocked,
                free: freeIntervals,
                isFullyFree: busyIntervals.length === 0
            };
        });
    } catch (e) {
        console.error("Availability Calc Error:", e);
        return [];
    }
  }, [scheduleData, staffData, selectedDate, bufferBuffer]);


  // Helper: Filter results based on selected Time Range
  const filteredStaffList = useMemo(() => {
      if (!filterStartTime || !filterEndTime) return null;

      try {
        const filterStart = new Date(selectedDate);
        const [sh, sm] = filterStartTime.split(':').map(Number);
        filterStart.setHours(sh, sm, 0, 0);

        const filterEnd = new Date(selectedDate);
        const [eh, em] = filterEndTime.split(':').map(Number);
        filterEnd.setHours(eh, em, 0, 0);
        
        const reqInterval = { start: filterStart, end: filterEnd };

        if (!isValid(filterStart) || !isValid(filterEnd)) return [];

        // Find staff who have a FREE interval that fully contains the reqInterval
        return processedAvailability.filter(p => {
            return p.free.some(freeBlock => 
                areIntervalsOverlapping(freeBlock, reqInterval) && 
                freeBlock.start <= reqInterval.start && 
                freeBlock.end >= reqInterval.end
            );
        });
      } catch (e) {
        console.error("Filter Error:", e);
        return [];
      }

  }, [processedAvailability, filterStartTime, filterEndTime, selectedDate]);


  // --- Render Components ---

  if (step === 'upload') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 flex flex-col items-center space-y-6 bg-white shadow-xl">
          <div className="h-20 w-20 bg-blue-100 rounded-full flex items-center justify-center mb-2">
             <FileSpreadsheet className="h-10 w-10 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">居家服務員排班查詢系統</h1>
          <p className="text-slate-500 text-center">
            請上傳 Excel 檔案 (.xlsx) 以開始使用。<br/>
            檔案需包含「服務紀錄」與「人員名單」。
          </p>
          
          <div className="w-full">
            <label htmlFor="file-upload" className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-8 h-8 mb-3 text-slate-400" />
                    <p className="text-sm text-slate-500 font-medium">點擊上傳或拖曳檔案至此</p>
                </div>
                <input id="file-upload" type="file" accept=".xlsx" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
          
          {loading && <p className="text-blue-600 animate-pulse">正在處理資料...</p>}
          {error && <div className="text-red-500 text-sm bg-red-50 p-3 rounded-md flex items-center gap-2"><XCircle className="w-4 h-4"/> {error}</div>}
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Bar */}
      <header className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Users className="h-6 w-6 text-blue-600" />
                <h1 className="font-bold text-xl text-slate-800">排班查詢系統</h1>
            </div>
            
            <div className="flex items-center gap-4">
                 {/* Filters */}
                 <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-lg border">
                    <Calendar className="w-4 h-4 text-slate-500 ml-2" />
                    <input 
                        type="date" 
                        className="bg-transparent border-none text-sm focus:ring-0 text-slate-700"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                    />
                 </div>

                 <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-lg border">
                    <Clock className="w-4 h-4 text-slate-500 ml-2" />
                    <span className="text-sm text-slate-500 whitespace-nowrap">緩衝 (分):</span>
                    <input 
                        type="number" 
                        min="0"
                        className="bg-transparent border-none text-sm focus:ring-0 w-16 text-slate-700"
                        value={bufferBuffer}
                        onChange={(e) => setBufferBuffer(Number(e.target.value))}
                    />
                 </div>

                 <div className="h-8 w-px bg-slate-300 mx-2"></div>

                 <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">搜尋空檔:</span>
                    <div className="flex items-center gap-1 bg-white border rounded-md px-2 py-1 focus-within:ring-2 ring-blue-500/20">
                        <input 
                            type="time" 
                            className="border-none text-sm p-0 focus:ring-0 w-24"
                            value={filterStartTime}
                            onChange={(e) => setFilterStartTime(e.target.value)}
                        />
                        <span className="text-slate-400">~</span>
                        <input 
                            type="time" 
                            className="border-none text-sm p-0 focus:ring-0 w-24"
                            value={filterEndTime}
                            onChange={(e) => setFilterEndTime(e.target.value)}
                        />
                    </div>
                    {(filterStartTime || filterEndTime) && (
                        <Button variant="ghost" size="sm" onClick={() => { setFilterStartTime(''); setFilterEndTime(''); }}>
                            清除
                        </Button>
                    )}
                 </div>
            </div>

            <Button variant="outline" size="sm" onClick={() => setStep('upload')}>
                重傳檔案
            </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:px-6 lg:px-8 py-8">

         {/* Scenario A: Filter Applied */}
         {filteredStaffList ? (
             <div className="space-y-6">
                 <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                        <User className="w-5 h-5 text-green-600" />
                        符合時段 <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-sm">{filterStartTime}~{filterEndTime}</span> 的人員
                        <span className="ml-2 text-sm font-normal text-slate-500">({filteredStaffList.length} 人)</span>
                    </h2>
                 </div>
                 
                 {filteredStaffList.length === 0 ? (
                     <div className="bg-white rounded-xl shadow-sm border p-12 text-center text-slate-500">
                         沒有人員在此時段有足夠空檔 (包含緩衝時間)。
                     </div>
                 ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredStaffList.map((item, idx) => (
                            <Card key={idx} className="p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h3 className="font-bold text-slate-900">{item.staff.name}</h3>
                                        <p className="text-xs text-slate-500">{item.staff.id}</p>
                                    </div>
                                    <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                                        可用
                                    </span>
                                </div>
                                <div className="text-sm text-slate-600">
                                    當日空檔:
                                    <div className="mt-1 flex flex-wrap gap-1">
                                    {item.free.map((f, i) => (
                                        <span key={i} className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">
                                            {format(f.start, 'HH:mm')}-{format(f.end, 'HH:mm')}
                                        </span>
                                    ))}
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                 )}
             </div>
         ) : (
         /* Scenario B: Visualization Timeline */
            <div className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-800">全體人員日行程表 (07:00 - 22:00)</h2>
                        {dataDateRange && (
                            <p className="text-xs text-slate-500 mt-1">
                                檔案資料區間: <span className="font-medium text-blue-600">{dataDateRange}</span>
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
                        <div className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded-sm"></span> 服務中 (忙碌)</div>
                        <div className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-400 rounded-sm"></span> 緩衝時間</div>
                        <div className="flex items-center gap-1"><span className="w-3 h-3 bg-white border border-slate-300 rounded-sm"></span> 空閒</div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    {/* Header Row */}
                    <div className="grid grid-cols-[150px_1fr] border-b bg-slate-50 divide-x">
                        <div className="p-3 text-sm font-semibold text-slate-700 pl-6">姓名</div>
                        <div className="relative h-10">
                            {/* Time Makers */}
                            {Array.from({ length: END_OF_DAY - START_OF_DAY + 1 }).map((_, i) => {
                                const hour = START_OF_DAY + i;
                                return (
                                    <div 
                                        key={hour} 
                                        className="absolute top-0 bottom-0 border-l border-slate-200 text-[10px] text-slate-400 pl-1 pt-2"
                                        style={{ left: `${(i / (END_OF_DAY - START_OF_DAY)) * 100}%` }}
                                    >
                                        {hour}:00
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Staff Rows */}
                    <div className="divide-y max-h-[70vh] overflow-y-auto">
                        {processedAvailability.map((item, idx) => (
                            <div key={idx} className="grid grid-cols-[150px_1fr] divide-x hover:bg-slate-50 transition-colors group">
                                <div className="p-3 pl-6 flex flex-col justify-center">
                                    <span className="font-medium text-sm text-slate-900">{item.staff.name}</span>
                                    <span className="text-xs text-slate-500">{item.staff.id}</span>
                                </div>
                                <div className="relative h-14 bg-slate-100/50">
                                    {/* Render Blocks */}
                                    <TimelineBar 
                                        startTime={START_OF_DAY} 
                                        endTime={END_OF_DAY} 
                                        blocked={item.blocked}
                                        rawBusy={item.busyRaw}
                                        date={selectedDate}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
         )}
      </main>
    </div>
  );
}

// Timeline Component helper
const TimelineBar = ({ startTime, endTime, blocked, rawBusy, date }) => {
    const totalMinutes = (endTime - startTime) * 60;
    
    // Helper to get % position
    const getPos = (d) => {
        const startOfDay = new Date(date);
        startOfDay.setHours(startTime, 0, 0, 0);
        
        let diff = (d - startOfDay) / 1000 / 60; // minutes
        return (diff / totalMinutes) * 100;
    };

    return (
        <div className="absolute inset-0 w-full h-full">
            {/* Render "Blocked/Buffer" first (Orange) */}
            {blocked.map((block, i) => {
                const left = Math.max(0, getPos(block.start));
                const right = Math.min(100, getPos(block.end));
                const width = right - left;
                if (width <= 0) return null;

                return (
                    <div
                        key={`buff-${i}`}
                        className="absolute top-2 bottom-2 bg-orange-300/80 rounded-sm border border-orange-400/50"
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`Buffer/Busy: ${format(block.start, 'HH:mm')} - ${format(block.end, 'HH:mm')}`}
                    />
                );
            })}

            {/* Render "Actual Busy" on top (Blue) */}
            {rawBusy.map((busy, i) => {
                const left = Math.max(0, getPos(busy.start));
                const right = Math.min(100, getPos(busy.end));
                const width = right - left;
                if (width <= 0) return null;

                return (
                    <div
                        key={`busy-${i}`}
                        className="absolute top-3 bottom-3 bg-blue-500 shadow-sm rounded-sm z-10"
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`Service: ${format(busy.start, 'HH:mm')} - ${format(busy.end, 'HH:mm')}`}
                    />
                );
            })}
        </div>
    );
};



export default App;
