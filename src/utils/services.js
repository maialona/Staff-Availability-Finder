export const SERVICE_TYPES = [
  { code: 'BA01', label: '基本身體清潔', durations: [20, 30, 40] },
  { code: 'BA02', label: '基本日常照顧', durations: [30] },
  { code: 'BA03', label: '測量生命徵象', durations: [5, 10] },
  { code: 'BA04', label: '協助餵食或灌食', durations: [10, 15, 30] },
  { code: 'BA05-1', label: '餐食照顧(一般備餐)', durations: [15, 30, 45] },
  { code: 'BA07', label: '協助沐浴及洗頭', durations: [20, 30, 40] },
  { code: 'BA10', label: '翻身拍背', durations: [15, 20, 30] },
  { code: 'BA11', label: '肢體關節活動', durations: [15, 20, 30] },
  { code: 'BA13', label: '陪同外出', durations: [30] },
  { code: 'BA14', label: '陪同就醫', durations: [90] },
  { code: 'BA15-1', label: '家務協助(自用)', durations: [30] },
  { code: 'BA15-2', label: '家務協助(共用)', durations: [30] },
  { code: 'BA16-1', label: '代購或代領或代送服務(自用)', durations: [5, 15, 20] },
  { code: 'BA17d2', label: '甘油球通便', durations: [5, 20] },
  { code: 'BA17e', label: '依照藥袋指示置入藥盒', durations: [5, 10, 15] },
  { code: 'BA18', label: '安全看視', durations: [30] },
  { code: 'BA20', label: '陪伴服務', durations: [30] },
  { code: 'BA24', label: '協助排泄', durations: [5, 20, 30] },
];

export const TIME_PERIODS = {
  AM: { label: '上午', start: '06:00', end: '12:00' },
  PM: { label: '下午', start: '12:00', end: '22:00' },
};
