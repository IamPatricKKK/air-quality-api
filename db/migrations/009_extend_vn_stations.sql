-- ============================================================
-- Migration 009: Extend Vietnamese monitoring stations
-- Mở rộng độ phủ từ 12 → ~40 station trên toàn VN
-- (Bắc / Trung / Nam / Tây Nguyên / Miền núi phía Bắc)
-- Tọa độ dựa trên IQAir station network + Open-Meteo grid.
-- ============================================================

-- ─── Thêm Areas (provinces/cities) ────────────────
INSERT INTO catalog.areas (level, code, name, center_lat, center_lng, sort_order)
VALUES
  -- Bắc Bộ
  ('province', 'TN',    'Thái Nguyên',     21.5928, 105.8442, 20),
  ('province', 'PT',    'Phú Thọ',         21.3225, 105.4002, 21),
  ('province', 'NB',    'Ninh Bình',       20.2506, 105.9744, 22),
  ('province', 'NA',    'Nghệ An',         18.6790, 105.6813, 23),
  ('province', 'HT',    'Hà Tĩnh',         18.3559, 105.8877, 24),
  ('province', 'TH',    'Thanh Hóa',       19.8066, 105.7852, 25),
  ('province', 'LC',    'Lào Cai',         22.4856, 103.9707, 26),
  ('province', 'DB',    'Điện Biên',       21.3867, 103.0230, 27),
  ('province', 'LS',    'Lạng Sơn',        21.8537, 106.7615, 28),

  -- Trung Bộ
  ('province', 'QB',    'Quảng Bình',      17.4689, 106.6223, 40),
  ('province', 'QT',    'Quảng Trị',       16.7943, 106.9633, 41),
  ('province', 'QNa',   'Quảng Nam',       15.8794, 108.3356, 42),
  ('province', 'QNg',   'Quảng Ngãi',      15.1201, 108.7923, 43),
  ('province', 'BD',    'Bình Định',       13.7757, 109.2220, 44),
  ('province', 'PY',    'Phú Yên',         13.0955, 109.3009, 45),
  ('province', 'NTH',   'Ninh Thuận',      11.5637, 108.9911, 46),
  ('province', 'BT',    'Bình Thuận',      10.9333, 108.1000, 47),
  ('province', 'DLak',  'Đắk Lắk',         12.7100, 108.2378, 48),
  ('province', 'GL',    'Gia Lai',         13.9833, 108.0000, 49),

  -- Nam Bộ
  ('province', 'DNai',  'Đồng Nai',        10.9454, 106.8426, 60),
  ('province', 'BDu',   'Bình Dương',      11.1853, 106.6639, 61),
  ('province', 'VT',    'Bà Rịa - Vũng Tàu', 10.5417, 107.2429, 62),
  ('province', 'TG',    'Tiền Giang',      10.4494, 106.3420, 63),
  ('province', 'KG',    'Kiên Giang',      10.0125, 105.0809, 64),
  ('province', 'AG',    'An Giang',        10.5216, 105.1259, 65),
  ('province', 'CM',    'Cà Mau',          9.1767,  105.1524, 66),
  ('province', 'ST',    'Sóc Trăng',       9.6003,  105.9800, 67),
  ('province', 'BTr',   'Bến Tre',         10.2415, 106.3752, 68)
ON CONFLICT (level, code) DO NOTHING;

-- ─── Thêm Monitoring Stations ───────────────────
INSERT INTO catalog.stations (code, name, area_id, lat, lng, station_type, timezone)
VALUES
  -- Miền núi phía Bắc
  ('TN-CENTER',  'Thái Nguyên - TP Thái Nguyên',
    (SELECT id FROM catalog.areas WHERE code = 'TN'),
    21.5928, 105.8442, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('PT-VIETRI',  'Việt Trì - Phú Thọ',
    (SELECT id FROM catalog.areas WHERE code = 'PT'),
    21.3225, 105.4002, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('LC-LAOCAI',  'Lào Cai - TP Lào Cai',
    (SELECT id FROM catalog.areas WHERE code = 'LC'),
    22.4856, 103.9707, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('LC-SAPA',    'Sapa - Lào Cai',
    (SELECT id FROM catalog.areas WHERE code = 'LC'),
    22.3364, 103.8438, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('DB-CENTER',  'Điện Biên Phủ - Điện Biên',
    (SELECT id FROM catalog.areas WHERE code = 'DB'),
    21.3867, 103.0230, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('LS-CENTER',  'Lạng Sơn - TP Lạng Sơn',
    (SELECT id FROM catalog.areas WHERE code = 'LS'),
    21.8537, 106.7615, 'monitoring', 'Asia/Ho_Chi_Minh'),

  -- Bắc Trung Bộ
  ('NB-CENTER',  'Ninh Bình - TP Ninh Bình',
    (SELECT id FROM catalog.areas WHERE code = 'NB'),
    20.2506, 105.9744, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('TH-CENTER',  'Thanh Hóa - TP Thanh Hóa',
    (SELECT id FROM catalog.areas WHERE code = 'TH'),
    19.8066, 105.7852, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('NA-VINH',    'Vinh - Nghệ An',
    (SELECT id FROM catalog.areas WHERE code = 'NA'),
    18.6790, 105.6813, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('HT-CENTER',  'Hà Tĩnh - TP Hà Tĩnh',
    (SELECT id FROM catalog.areas WHERE code = 'HT'),
    18.3559, 105.8877, 'monitoring', 'Asia/Ho_Chi_Minh'),

  -- Trung Bộ
  ('QB-DHOI',    'Đồng Hới - Quảng Bình',
    (SELECT id FROM catalog.areas WHERE code = 'QB'),
    17.4689, 106.6223, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('QT-DHA',     'Đông Hà - Quảng Trị',
    (SELECT id FROM catalog.areas WHERE code = 'QT'),
    16.8169, 107.1010, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('QNa-HOIAN',  'Hội An - Quảng Nam',
    (SELECT id FROM catalog.areas WHERE code = 'QNa'),
    15.8794, 108.3356, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('QNg-CENTER', 'Quảng Ngãi - TP Quảng Ngãi',
    (SELECT id FROM catalog.areas WHERE code = 'QNg'),
    15.1201, 108.7923, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('BD-QNHON',   'Quy Nhơn - Bình Định',
    (SELECT id FROM catalog.areas WHERE code = 'BD'),
    13.7757, 109.2220, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('PY-THOA',    'Tuy Hòa - Phú Yên',
    (SELECT id FROM catalog.areas WHERE code = 'PY'),
    13.0955, 109.3009, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('NTH-PRANG',  'Phan Rang - Ninh Thuận',
    (SELECT id FROM catalog.areas WHERE code = 'NTH'),
    11.5637, 108.9911, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('BT-PTHIET',  'Phan Thiết - Bình Thuận',
    (SELECT id FROM catalog.areas WHERE code = 'BT'),
    10.9333, 108.1000, 'monitoring', 'Asia/Ho_Chi_Minh'),

  -- Tây Nguyên
  ('DLak-BMT',   'Buôn Ma Thuột - Đắk Lắk',
    (SELECT id FROM catalog.areas WHERE code = 'DLak'),
    12.6797, 108.0378, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('GL-PLEIKU',  'Pleiku - Gia Lai',
    (SELECT id FROM catalog.areas WHERE code = 'GL'),
    13.9833, 108.0000, 'monitoring', 'Asia/Ho_Chi_Minh'),

  -- Đông Nam Bộ
  ('DNai-BH',    'Biên Hòa - Đồng Nai',
    (SELECT id FROM catalog.areas WHERE code = 'DNai'),
    10.9454, 106.8426, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('BDu-TDM',    'Thủ Dầu Một - Bình Dương',
    (SELECT id FROM catalog.areas WHERE code = 'BDu'),
    11.1853, 106.6639, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('VT-VTAU',    'Vũng Tàu - Bà Rịa - Vũng Tàu',
    (SELECT id FROM catalog.areas WHERE code = 'VT'),
    10.3460, 107.0843, 'monitoring', 'Asia/Ho_Chi_Minh'),

  -- Đồng bằng sông Cửu Long
  ('TG-MYTHO',   'Mỹ Tho - Tiền Giang',
    (SELECT id FROM catalog.areas WHERE code = 'TG'),
    10.3600, 106.3600, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('KG-RGIA',    'Rạch Giá - Kiên Giang',
    (SELECT id FROM catalog.areas WHERE code = 'KG'),
    10.0125, 105.0809, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('AG-LXUYEN',  'Long Xuyên - An Giang',
    (SELECT id FROM catalog.areas WHERE code = 'AG'),
    10.3864, 105.4352, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('CM-CENTER',  'Cà Mau - TP Cà Mau',
    (SELECT id FROM catalog.areas WHERE code = 'CM'),
    9.1767,  105.1524, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('ST-CENTER',  'Sóc Trăng - TP Sóc Trăng',
    (SELECT id FROM catalog.areas WHERE code = 'ST'),
    9.6003,  105.9800, 'monitoring', 'Asia/Ho_Chi_Minh'),
  ('BTr-CENTER', 'Bến Tre - TP Bến Tre',
    (SELECT id FROM catalog.areas WHERE code = 'BTr'),
    10.2415, 106.3752, 'monitoring', 'Asia/Ho_Chi_Minh')
ON CONFLICT (code) DO NOTHING;
