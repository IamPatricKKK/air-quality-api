export const adminUsers = [
  {
    id: "u-1",
    email: "admin@skypulse.local",
    displayName: "Platform Admin",
    role: "super_admin",
    status: "active",
    createdAt: "2026-03-20T08:00:00Z",
    lastLoginAt: "2026-04-11T01:30:00Z",
  },
  {
    id: "u-2",
    email: "ops@skypulse.local",
    displayName: "Data Operator",
    role: "operator",
    status: "active",
    createdAt: "2026-03-25T08:00:00Z",
    lastLoginAt: "2026-04-10T22:00:00Z",
  },
];

export const stations = [
  {
    id: "st-1",
    code: "HCM-Q1",
    name: "TP.HCM - Quận 1",
    region: "Đông Nam Bộ",
    city: "TP.HCM",
    lat: 10.7769,
    lng: 106.7009,
    latestAqi: 121,
    isActive: true,
    sourceProvider: "waqi",
  },
  {
    id: "st-2",
    code: "HN-HK",
    name: "Hà Nội - Hoàn Kiếm",
    region: "Bắc Bộ",
    city: "Hà Nội",
    lat: 21.0285,
    lng: 105.8542,
    latestAqi: 162,
    isActive: true,
    sourceProvider: "openaq",
  },
];

export const notifications = [
  {
    id: "nt-1",
    title: "Cảnh báo AQI cao tại Hà Nội",
    audience: "Bắc Bộ",
    channel: "in_app,email",
    status: "sent",
    createdAt: "2026-04-11T00:10:00Z",
  },
  {
    id: "nt-2",
    title: "Bảo trì pipeline traffic",
    audience: "All admins",
    channel: "in_app",
    status: "scheduled",
    createdAt: "2026-04-11T00:40:00Z",
  },
];

export const stationHistory = {
  "st-1": [
    { recorded_at: "2026-04-11T00:00:00Z", aqi: 118, pm25: 42, pm10: 61 },
    { recorded_at: "2026-04-11T01:00:00Z", aqi: 121, pm25: 43, pm10: 63 },
  ],
  "st-2": [
    { recorded_at: "2026-04-11T00:00:00Z", aqi: 158, pm25: 71, pm10: 98 },
    { recorded_at: "2026-04-11T01:00:00Z", aqi: 162, pm25: 73, pm10: 101 },
  ],
};

export const userPreferences = {
  notificationMode: "all",
  favoriteRegions: ["Bắc Bộ", "Đông Nam Bộ"],
  pushEnabled: true,
  emailEnabled: true,
  pinnedStationIds: ["st-1", "st-2"],
  location: {
    lat: 10.7769,
    lng: 106.7009,
  },
};

export const userNotifications = [
  {
    id: "user-nt-1",
    title: "AQI tăng cao tại Hà Nội",
    message: "AQI hiện tại là 162, vượt ngưỡng cảnh báo.",
    is_read: false,
    created_at: "2026-04-11T01:00:00Z",
    type: "danger",
    station_id: "st-2",
  },
  {
    id: "user-nt-2",
    title: "Báo cáo ngày đã sẵn sàng",
    message: "Báo cáo chất lượng không khí sáng nay đã được tạo.",
    is_read: true,
    created_at: "2026-04-11T00:30:00Z",
    type: "info",
    station_id: "st-1",
  },
];
