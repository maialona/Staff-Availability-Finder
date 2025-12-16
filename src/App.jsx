import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { format, parse, addMinutes, subMinutes, isWithinInterval, areIntervalsOverlapping, getHours, getMinutes, set, isValid, startOfWeek, addDays, isSameDay } from 'date-fns';
import { Upload, Calendar, Clock, User, Users, FileSpreadsheet, XCircle, LayoutGrid, List } from 'lucide-react';
import { calculateDailyAvailability } from './utils/availability';
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
  const [viewMode, setViewMode] = useState('day'); // 'day' | 'week'
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
    return calculateDailyAvailability(selectedDate, scheduleData, staffData, bufferBuffer);
  }, [scheduleData, staffData, selectedDate, bufferBuffer]);

    // Logic: Calculate Weekly Availability
  const processedWeeklyAvailability = useMemo(() => {
    if (viewMode !== 'week' || !selectedDate || !scheduleData) return [];
    
    // Start of week (Monday)
    const startDate = startOfWeek(new Date(selectedDate), { weekStartsOn: 1 });
    
    // Generate 7 days
    const weekDays = Array.from({ length: 7 }).map((_, i) => {
        const d = addDays(startDate, i);
        return format(d, 'yyyy-MM-dd');
    });

    // We want data pivoting on Staff:
    // [ { staff, days: { '2023-12-16': { ...avail }, ... } } ]
    
    // First, get availability for each day
    const dailyResults = weekDays.map(dateStr => {
        return {
            date: dateStr,
            data: calculateDailyAvailability(dateStr, scheduleData, staffData, bufferBuffer)
        };
    });

    // Re-structure by Staff
    return staffData.map(staff => {
        const staffWeekData = {};
        dailyResults.forEach(day => {
            const staffDayPayload = day.data.find(d => d.staff.id === staff.id);
            staffWeekData[day.date] = staffDayPayload || { blocked: [], busyRaw: [], free: []};
        });
        
        return {
            staff,
            days: staffWeekData
        };
    });

  }, [scheduleData, staffData, selectedDate, bufferBuffer, viewMode]);



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
                 <div className="flex items-center bg-slate-100 p-1 rounded-lg border">
                    <button
                        onClick={() => setViewMode('day')}
                        className={cn(
                            "p-1.5 rounded-md transition-all flex items-center gap-1 text-sm font-medium",
                             viewMode === 'day' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <List className="w-4 h-4" />
                        <span className="hidden sm:inline">單日</span>
                    </button>
                    <button
                         onClick={() => setViewMode('week')}
                         className={cn(
                            "p-1.5 rounded-md transition-all flex items-center gap-1 text-sm font-medium",
                             viewMode === 'week' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <LayoutGrid className="w-4 h-4" />
                        <span className="hidden sm:inline">週檢視</span>
                    </button>
                 </div>

                 <div className="h-8 w-px bg-slate-300 mx-1"></div>

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
         ) : viewMode === 'week' ? (
             /* Scenario C: Week View */
             <WeeklyView 
                weeklyData={processedWeeklyAvailability}
                selectedDate={selectedDate}
                startHour={START_OF_DAY}
                endHour={END_OF_DAY}
             />
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

// Weekly View Component
const WeeklyView = ({ weeklyData, selectedDate, startHour, endHour }) => {
    const weekStart = startOfWeek(new Date(selectedDate), { weekStartsOn: 1 });
    const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

    // Helper: Determine cell color based on FREE hours (Core hours: 07:00 ~ 19:00)
    const getAvailabilityStatus = (dayData, date) => {
        if (!dayData || !dayData.free) return { color: 'bg-slate-50', text: '-', sub: '' };
        
        // Define Core Ends (19:00)
        const calcEndHour = 19;
        
        const totalFreeMs = dayData.free.reduce((acc, curr) => {
            const blockStart = curr.start;
            const blockEnd = curr.end;
            
            // Construct Limit Boundary for this specific day
            const limitEnd = new Date(blockStart);
            limitEnd.setHours(calcEndHour, 0, 0, 0);

            if (blockStart >= limitEnd) return acc;

            const effectiveEnd = (blockEnd > limitEnd) ? limitEnd : blockEnd;
            const duration = effectiveEnd - blockStart;
            return acc + (duration > 0 ? duration : 0);
        }, 0);

        const freeHours = totalFreeMs / 1000 / 60 / 60;

        // Full Free (No shifts at all) -> Blank
        if (!dayData.busyRaw || dayData.busyRaw.length === 0) return { color: 'bg-white border-slate-100', text: '', sub: '' };
        
        if (freeHours >= 6) return { color: 'bg-emerald-100 text-emerald-800 border-emerald-200', text: '空閒', sub: `${freeHours.toFixed(1)}h` };
        if (freeHours >= 2) return { color: 'bg-amber-100 text-amber-800 border-amber-200', text: '普通', sub: `${freeHours.toFixed(1)}h` };
        return { color: 'bg-rose-50 text-rose-800 border-rose-200', text: '繁忙', sub: `${freeHours.toFixed(1)}h` };
    };

    return (
        <div className="space-y-4">
             <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-800">全體人員週行程表 ({format(weekStart, 'MM/dd')} ~ {format(addDays(weekStart, 6), 'MM/dd')})</h2>
                 <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
                    <div className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-200 rounded-sm"></span> 空閒 (6h+)</div>
                    <div className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-200 rounded-sm"></span> 普通 (2-6h)</div>
                    <div className="flex items-center gap-1"><span className="w-3 h-3 bg-rose-200 rounded-sm"></span> 繁忙 (&lt;2h)</div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border overflow-hidden overflow-x-auto">
                 <div className="min-w-[1000px]">
                    {/* Header: Staff + 7 Days */}
                    <div className="grid grid-cols-[150px_repeat(7,_1fr)] border-b bg-slate-50 divide-x">
                        <div className="p-3 text-sm font-semibold text-slate-700 pl-6 flex items-center">人員 / 日期</div>
                        {weekDays.map(d => (
                            <div key={d.toISOString()} className={cn("p-2 text-center text-sm font-medium", isSameDay(d, new Date(selectedDate)) ? "bg-blue-50 text-blue-700" : "text-slate-600")}>
                                {format(d, 'MM/dd')} (週{format(d, 'EEEEE', { locale: undefined })})
                            </div>
                        ))}
                    </div>

                    {/* Body */}
                    <div className="divide-y max-h-[70vh] overflow-y-auto">
                        {weeklyData.map((item, idx) => (
                            <div key={idx} className="grid grid-cols-[150px_repeat(7,_1fr)] divide-x hover:bg-slate-50 transition-colors group">
                                <div className="p-3 pl-6 flex flex-col justify-center bg-white sticky left-0 z-10">
                                    <span className="font-medium text-sm text-slate-900 truncate">{item.staff.name}</span>
                                </div>
                                {weekDays.map(d => {
                                    const dateStr = format(d, 'yyyy-MM-dd');
                                    const dayData = item.days[dateStr];
                                    const status = getAvailabilityStatus(dayData);
                                    
                                    // Smart Tooltip Positioning
                                    // Top rows (idx < 3) -> Tooltip pops DOWN (top-full)
                                    // Other rows -> Tooltip pops UP (bottom-full)
                                    const isTopRow = idx < 3;
                                    const tooltipClass = isTopRow 
                                        ? "top-full mt-2" 
                                        : "bottom-full mb-2";
                                    const arrowClass = isTopRow
                                        ? "bottom-full border-b-slate-800"
                                        : "top-full border-t-slate-800";
                                    
                                    return (
                                        <div key={dateStr} className="relative h-16 p-1 group/cell">
                                             <div className={cn(
                                                 "w-full h-full rounded flex flex-col items-center justify-center border transition-all cursor-default",
                                                 status.color
                                             )}>
                                                <span className="text-xs font-bold">{status.text}</span>
                                                <span className="text-[10px] opacity-80">{status.sub}</span>
                                             </div>

                                             {/* Hover Tooltip - Detailed Timeline */}
                                             <div className={cn(
                                                 "absolute opacity-0 group-hover/cell:opacity-100 pointer-events-none z-50 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs rounded p-2 w-48 shadow-xl transition-opacity",
                                                 tooltipClass
                                             )}>
                                                 <div className="font-bold border-b border-slate-600 pb-1 mb-1 text-center">{item.staff.name} - {format(d, 'MM/dd')}</div>
                                                 {dayData && dayData.blocked.length > 0 ? (
                                                     <div className="space-y-1">
                                                         <div className="text-slate-400">忙碌時段:</div>
                                                         {dayData.blocked.map((b, i) => (
                                                             <div key={i} className="flex justify-between">
                                                                 <span>{format(b.start, 'HH:mm')} ~ {format(b.end, 'HH:mm')}</span>
                                                             </div>
                                                         ))}
                                                     </div>
                                                 ) : (
                                                     <div className="text-green-400 text-center py-1">全日空閒</div>
                                                 )}
                                                 {/* Arrow */}
                                                 <div className={cn(
                                                     "absolute left-1/2 -translate-x-1/2 border-4 border-transparent",
                                                     arrowClass
                                                 )}></div>
                                             </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};



export default App;
