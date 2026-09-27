-- Samsung Odyssey G9 57" (Dual UHD 7680x2160)
-- Match by EDID description so DisplayPort connector renumbering does not matter.

hl.env("GDK_SCALE", "1")
hl.env("QT_SCALE_FACTOR", "1")

hl.monitor({
  output = "desc:Samsung Electric Company Odyssey G95NC HNTYB00763",
  mode = "7680x2160@60",
  position = "0x0",
  scale = 1,
})
